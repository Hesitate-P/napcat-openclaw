/**
 * 用户信息工具
 * 
 * 提供 QQ ID 到昵称的转换功能，带缓存机制
 */

import type { NapCatClient } from '../client.js';

/**
 * 用户信息缓存
 */
interface UserInfo {
  userId: number;
  nickname: string;
  card?: string;  // 群名片
  timestamp: number;
}

/**
 * 缓存配置
 */
const CACHE_CONFIG = {
  TTL: 5 * 60 * 1000,  // 5 分钟缓存
  MAX_SIZE: 500,        // 最多缓存 500 个用户
};

/**
 * 用户信息缓存 Map
 */
const userCache = new Map<number, UserInfo>();

/**
 * 清理过期缓存
 */
function cleanupExpiredCache(): void {
  const now = Date.now();
  for (const [userId, info] of userCache.entries()) {
    if (now - info.timestamp > CACHE_CONFIG.TTL) {
      userCache.delete(userId);
    }
  }
  
  // 如果缓存过多，删除最旧的
  if (userCache.size > CACHE_CONFIG.MAX_SIZE) {
    const entries = Array.from(userCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toDelete = Math.floor(CACHE_CONFIG.MAX_SIZE * 0.2);
    for (let i = 0; i < toDelete; i++) {
      userCache.delete(entries[i][0]);
    }
  }
}

/**
 * 从缓存获取用户昵称
 * @param userId QQ 号
 * @returns 昵称，如果缓存未命中则返回 null
 */
export function getCachedNickname(userId: number): string | null {
  const info = userCache.get(userId);
  if (info && Date.now() - info.timestamp < CACHE_CONFIG.TTL) {
    return info.card || info.nickname;
  }
  return null;
}

/**
 * 更新缓存
 * @param userId QQ 号
 * @param nickname 昵称
 * @param card 群名片（可选）
 */
export function updateCache(
  userId: number,
  nickname: string,
  card?: string
): void {
  userCache.set(userId, {
    userId,
    nickname,
    card,
    timestamp: Date.now(),
  });
  
  // 定期清理
  if (userCache.size % 50 === 0) {
    cleanupExpiredCache();
  }
}

/**
 * 获取用户昵称（优先缓存，没有则通过 API 获取）
 * 
 * @param client NapCat 客户端
 * @param userId QQ 号
 * @param groupId 群 ID（可选，如果在群聊中会优先获取群名片）
 * @returns 用户昵称或群名片
 */
export async function getUserNickname(
  client: NapCatClient,
  userId: number,
  groupId?: number
): Promise<string> {
  // 先查缓存
  const cached = getCachedNickname(userId);
  if (cached) {
    console.log(`[UserInfo] 缓存命中：${userId} -> ${cached}`);
    return cached;
  }
  
  try {
    // 如果在群聊中，优先获取群成员信息（包含群名片）
    if (groupId) {
      try {
        const info: any = await client.sendAction('get_group_member_info', {
          group_id: groupId,
          user_id: userId,
        });
        
        const nickname = (info as any)?.card || (info as any)?.nickname || String(userId);
        updateCache(userId, (info as any)?.nickname || String(userId), (info as any)?.card);
        console.log(`[UserInfo] 从群成员信息获取：${userId} -> ${nickname}`);
        return nickname;
      } catch (e) {
        console.log(`[UserInfo] 获取群成员信息失败：${e}`);
        // 继续尝试获取好友信息
      }
    }
    
    // 尝试获取好友信息
    try {
      const friendList: any[] = await client.sendAction('get_friend_list');
      const friend = friendList.find((f: any) => f.user_id === userId);
      if (friend) {
        const nickname = friend.remark || friend.nickname || String(userId);
        updateCache(userId, nickname);
        console.log(`[UserInfo] 从好友列表获取：${userId} -> ${nickname}`);
        return nickname;
      }
    } catch (e) {
      console.log(`[UserInfo] 获取好友列表失败：${e}`);
    }
    
    // 最后手段：使用 get_stranger_info
    try {
      const info: any = await client.sendAction('get_stranger_info', {
        user_id: userId,
      });
      const nickname = (info as any)?.nickname || String(userId);
      updateCache(userId, nickname);
      console.log(`[UserInfo] 从陌生人信息获取：${userId} -> ${nickname}`);
      return nickname;
    } catch (e) {
      console.log(`[UserInfo] 获取陌生人信息失败：${e}`);
    }
    
    // 所有方法都失败，返回 QQ 号
    console.log(`[UserInfo] 所有方法都失败，返回 QQ 号：${userId}`);
    return String(userId);
    
  } catch (error) {
    console.error(`[UserInfo] 获取用户昵称异常：${userId}`, error);
    return String(userId);
  }
}

/**
 * 批量获取用户昵称
 * 
 * @param client NapCat 客户端
 * @param userIds QQ 号数组
 * @param groupId 群 ID（可选）
 * @returns 映射表 { userId: nickname }
 */
export async function getUserNicknames(
  client: NapCatClient,
  userIds: number[],
  groupId?: number
): Promise<Record<number, string>> {
  const results: Record<number, string> = {};
  
  // 先处理缓存命中的
  const toFetch: number[] = [];
  for (const userId of userIds) {
    const cached = getCachedNickname(userId);
    if (cached) {
      results[userId] = cached;
    } else {
      toFetch.push(userId);
    }
  }
  
  // 批量获取未命中的
  if (toFetch.length > 0) {
    await Promise.all(
      toFetch.map(async (userId) => {
        results[userId] = await getUserNickname(client, userId, groupId);
      })
    );
  }
  
  return results;
}

/**
 * 清除缓存
 * @param userId 可选，清除指定用户缓存；不传则清除所有
 */
export function clearCache(userId?: number): void {
  if (userId !== undefined) {
    userCache.delete(userId);
    console.log(`[UserInfo] 清除缓存：${userId}`);
  } else {
    userCache.clear();
    console.log('[UserInfo] 清除所有缓存');
  }
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): { size: number; entries: Array<{ userId: number; nickname: string; age: string }> } {
  const now = Date.now();
  return {
    size: userCache.size,
    entries: Array.from(userCache.values()).map(info => ({
      userId: info.userId,
      nickname: info.card || info.nickname,
      age: `${Math.round((now - info.timestamp) / 1000)}s`,
    })),
  };
}
