/**
 * 输入状态管理
 *
 * - 私聊：set_input_status API（event_type=1 开始，event_type=0 停止）
 * - 群聊：临时修改群名片添加后缀
 *
 * 支持嵌套调用（引用计数），确保多个并发 handler 不会互相干扰。
 */

import type { NapCatClient } from '../client.js';

// ── 私聊状态 ─────────────────────────────────────────────────────────────────

/** 每个用户的引用计数 */
const privateRefCount  = new Map<string, number>();
/** 每个用户的保持定时器 */
const privateTimers    = new Map<string, ReturnType<typeof setInterval>>();

/** 私聊保持间隔 (ms)：QQ 输入状态约 8-10 秒自动消失，450ms 刷新足够 */
const PRIVATE_KEEP_INTERVAL_MS = 450;

/**
 * 开始私聊输入状态（引用计数 +1）
 */
export async function startPrivateTyping(
  client: NapCatClient,
  userId: number,
): Promise<void> {
  const key     = `user:${userId}`;
  const current = privateRefCount.get(key) ?? 0;
  privateRefCount.set(key, current + 1);

  if (current > 0) return; // 已有其他 handler 持有，跳过

  // 立即发送一次（user_id 须为 string，参见 NapCat API 文档）
  try {
    await client.sendAction('set_input_status', { user_id: String(userId), event_type: 1 });
    console.log(`[TypingIndicator] 私聊 ${userId} 开始`);
  } catch (err) {
    console.error('[TypingIndicator] set_input_status 失败:', err);
    return;
  }

  // 定时保持
  const timer = setInterval(() => {
    client.sendAction('set_input_status', { user_id: String(userId), event_type: 1 }).catch(() => { /* ignore */ });
  }, PRIVATE_KEEP_INTERVAL_MS);

  privateTimers.set(key, timer);
}

/**
 * 停止私聊输入状态（引用计数 -1，归零时真正停止）
 * QQ 输入状态会在约 1 秒后自动消失，停止发送即可。
 */
export async function stopPrivateTyping(
  _client: NapCatClient,
  userId: number,
): Promise<void> {
  const key     = `user:${userId}`;
  const current = privateRefCount.get(key) ?? 1;
  const next    = Math.max(0, current - 1);
  privateRefCount.set(key, next);

  if (next > 0) return; // 还有其他 handler 持有

  // 清除定时器，不再发送——QQ 会在约 8-10 秒后自动清除输入状态
  const timer = privateTimers.get(key);
  if (timer) {
    clearInterval(timer);
    privateTimers.delete(key);
  }
  privateRefCount.delete(key);

  console.log(`[TypingIndicator] 私聊 ${userId} 结束`);
}

// ── 群聊状态 ─────────────────────────────────────────────────────────────────

/** 每个群的引用计数 */
const groupRefCount = new Map<string, number>();
/** 每个群的原始群名片（用于恢复） */
const groupBaseCard = new Map<string, string>();

/**
 * 去除群名片末尾的输入状态后缀（支持多个叠加的情况）
 */
function stripSuffix(card: string, suffix: string): string {
  // suffix 可能本身含括号（如「（输入中）」），直接匹配后缀，不再额外套括号
  const marker = suffix.trim();
  let result = (card ?? '').trim();
  while (result.endsWith(marker)) {
    result = result.slice(0, -marker.length).trimEnd();
  }
  return result.trim();
}

/**
 * 开始群聊输入状态（修改群名片）
 */
export async function setGroupTypingCard(
  client:      NapCatClient,
  accountId:   string,
  groupId:     number,
  busySuffix = '输入中',
): Promise<void> {
  const selfId = client.getSelfId();
  if (!selfId) return;

  const key     = `${accountId}:${groupId}`;
  const current = groupRefCount.get(key) ?? 0;
  groupRefCount.set(key, current + 1);

  if (current > 0) return; // 已在显示中

  try {
    const info = await client.sendAction<{ card?: string; nickname?: string }>(
      'get_group_member_info',
      { group_id: String(groupId), user_id: String(selfId), no_cache: true },
    );
    const currentCard = (info?.card || info?.nickname || '').trim();
    const baseCard    = stripSuffix(currentCard, busySuffix);
    groupBaseCard.set(key, baseCard);

    // busySuffix 本身可能已含括号（如「（输入中）」），直接追加，不再套括号
    const nextCard = baseCard ? `${baseCard}${busySuffix}` : busySuffix;
    await client.sendAction('set_group_card', {
      group_id: String(groupId),
      user_id:  String(selfId),
      card:     nextCard,
    });
    console.log(`[TypingIndicator] 群 ${groupId} 名片 → ${nextCard}`);
  } catch (err) {
    console.warn(`[TypingIndicator] 群名片设置失败:`, err);
  }
}

/**
 * 结束群聊输入状态（恢复群名片）
 */
export function clearGroupTypingCard(
  client:      NapCatClient,
  accountId:   string,
  groupId:     number,
  _busySuffix = '输入中',
): void {
  const selfId = client.getSelfId();
  if (!selfId) return;

  const key     = `${accountId}:${groupId}`;
  const current = groupRefCount.get(key) ?? 0;
  const next    = Math.max(0, current - 1);
  groupRefCount.set(key, next);

  if (next > 0) return; // 还有其他 handler 持有

  groupRefCount.delete(key);
  const baseCard = groupBaseCard.get(key) ?? '';
  groupBaseCard.delete(key);

  client.sendAction('set_group_card', {
    group_id: String(groupId),
    user_id:  String(selfId),
    card:     baseCard,
  }).catch(err => console.warn('[TypingIndicator] 群名片恢复失败:', err));

  console.log(`[TypingIndicator] 群 ${groupId} 名片恢复 → ${baseCard}`);
}

/**
 * 进程退出 / 账号登出时清理所有群名片
 */
export async function cleanupGroupCards(client: NapCatClient): Promise<void> {
  const selfId = client.getSelfId();

  if (selfId) {
    for (const [key, baseCard] of groupBaseCard.entries()) {
      const groupId = parseInt(key.split(':').pop() ?? '0', 10);
      if (!groupId) continue;
      try {
        await client.sendAction('set_group_card', {
          group_id: String(groupId),
          user_id:  String(selfId),
          card:     baseCard,
        });
      } catch { /* ignore */ }
    }
  }

  groupRefCount.clear();
  groupBaseCard.clear();

  // 清理私聊定时器
  for (const timer of privateTimers.values()) clearInterval(timer);
  privateTimers.clear();
  privateRefCount.clear();
}
