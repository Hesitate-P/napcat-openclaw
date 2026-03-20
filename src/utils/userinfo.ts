/**
 * 用户信息工具
 *
 * 提供 QQ ID 到昵称的转换功能，带 TTL 缓存机制。
 * 生产级实现：移除调试日志，修复低效的 getFriendList 全量拉取。
 */

import type { NapCatClient } from '../client.js';

// ============================================================================
// 类型
// ============================================================================

interface UserInfo {
  userId:    number;
  nickname:  string;
  card?:     string;
  timestamp: number;
}

// ============================================================================
// 缓存配置
// ============================================================================

const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 分钟
const CACHE_MAX     = 500;
const CACHE_TRIM    = Math.floor(CACHE_MAX * 0.2); // 淘汰最旧的 20%

const userCache = new Map<number, UserInfo>();

// ============================================================================
// 内部工具
// ============================================================================

function isFresh(info: UserInfo): boolean {
  return Date.now() - info.timestamp < CACHE_TTL_MS;
}

function trimCache(): void {
  if (userCache.size <= CACHE_MAX) return;
  const sorted = Array.from(userCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp);
  for (let i = 0; i < CACHE_TRIM; i++) userCache.delete(sorted[i][0]);
}

function setCache(userId: number, nickname: string, card?: string): void {
  userCache.set(userId, { userId, nickname, card, timestamp: Date.now() });
  trimCache();
}

// ============================================================================
// 公开 API
// ============================================================================

/**
 * 从缓存获取昵称（未命中返回 null）
 */
export function getCachedNickname(userId: number): string | null {
  const info = userCache.get(userId);
  return info && isFresh(info) ? (info.card || info.nickname) : null;
}

/**
 * 手动写入缓存
 */
export function updateCache(userId: number, nickname: string, card?: string): void {
  setCache(userId, nickname, card);
}

/**
 * 清除缓存（不传 userId 则清全部）
 */
export function clearCache(userId?: number): void {
  if (userId !== undefined) userCache.delete(userId);
  else userCache.clear();
}

/**
 * 获取用户昵称（优先缓存）
 *
 * 查询顺序：缓存 → 群成员信息（若提供 groupId）→ 陌生人信息
 * 故意移除了 getFriendList 全量拉取（O(n) 且缓存无意义）。
 */
export async function getUserNickname(
  client:  NapCatClient,
  userId:  number,
  groupId?: number,
): Promise<string> {
  // 1. 缓存命中
  const cached = getCachedNickname(userId);
  if (cached) return cached;

  // 2. 群成员信息（有 groupId 时最准确，含群名片）
  if (groupId) {
    try {
      const info: any = await client.sendAction('get_group_member_info', {
        group_id: groupId,
        user_id:  userId,
      });
      const nickname = info?.nickname || String(userId);
      const card     = info?.card     || undefined;
      setCache(userId, nickname, card);
      return card || nickname;
    } catch { /* fall through */ }
  }

  // 3. 陌生人信息（通用 fallback）
  try {
    const info: any = await client.sendAction('get_stranger_info', { user_id: userId });
    const nickname  = info?.nickname || String(userId);
    setCache(userId, nickname);
    return nickname;
  } catch { /* fall through */ }

  // 4. 最终 fallback：返回 QQ 号字符串
  return String(userId);
}

/**
 * 缓存统计（调试用）
 */
export function getCacheStats(): { size: number } {
  return { size: userCache.size };
}
