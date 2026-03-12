/**
 * 输入状态显示模块 - 最终版
 * 
 * 私聊：使用 set_input_status API，需要持续发送保持状态
 * 群聊：修改群名片添加"（输入中）"后缀
 */

import { NapCatClient } from '../client.js';

// 全局变量（模块级）
const groupBusyCounters = new Map<string, number>();
const groupBaseCards = new Map<string, string>();
const privateTypingCounters = new Map<string, number>();
const privateTypingTimers = new Map<string, NodeJS.Timeout>();

/**
 * 去除群名片末尾的输入状态后缀
 */
function stripTrailingBusySuffixes(card: string, busySuffix: string): string {
    const normalized = (card || "").trim();
    const suffix = (busySuffix || "输入中").trim();
    if (!normalized || !suffix) return normalized;

    const marker = `(${suffix})`;
    let result = normalized;
    while (result.endsWith(marker)) {
        result = result.slice(0, -marker.length).trimEnd();
    }
    return result.trim();
}

/**
 * 私聊输入状态 - 开始
 */
export async function startPrivateTyping(
    client: NapCatClient,
    userId: number
): Promise<void> {
    const userKey = `user:${userId}`;
    
    const current = privateTypingCounters.get(userKey) || 0;
    const next = current + 1;
    privateTypingCounters.set(userKey, next);
    
    if (current > 0) {
        console.log(`[TypingIndicator] 私聊 ${userId} 已有输入状态，跳过`);
        return;  // 已经有输入状态，跳过
    }
    
    // 清除可能存在的旧定时器
    const existingTimer = privateTypingTimers.get(userKey);
    if (existingTimer) {
        clearInterval(existingTimer);
    }
    
    // 立即发送一次
    try {
        await client.sendAction("set_input_status", {
            user_id: userId,
            event_type: 1,  // 1=正在输入（文本）
        });
        console.log(`[TypingIndicator] 私聊 ${userId} 输入状态已显示`);
    } catch (error) {
        console.error(`[TypingIndicator] 私聊输入状态设置失败：`, error);
        return;
    }
    
    // 每 450ms 发送一次保持状态
    const timer = setInterval(async () => {
        try {
            await client.sendAction("set_input_status", {
                user_id: userId,
                event_type: 1,
            });
        } catch (error) {
            console.error(`[TypingIndicator] 私聊输入状态保持失败：`, error);
        }
    }, 450);
    
    privateTypingTimers.set(userKey, timer);
}

/**
 * 私聊输入状态 - 结束
 */
export async function stopPrivateTyping(
    _client: NapCatClient,
    userId: number
): Promise<void> {
    const userKey = `user:${userId}`;
    
    const current = privateTypingCounters.get(userKey) || 1;
    const next = current - 1;
    privateTypingCounters.set(userKey, next);
    
    if (next > 0) {
        console.log(`[TypingIndicator] 私聊 ${userId} 还有其他输入状态，跳过`);
        return;  // 还有其他输入状态，跳过
    }
    
    // 清除定时器
    const timer = privateTypingTimers.get(userKey);
    if (timer) {
        clearInterval(timer);
        privateTypingTimers.delete(userKey);
    }
    
    privateTypingCounters.delete(userKey);
    
    // 发送 event_type: 0 表示停止输入（语音输入状态会自然消失）
    // 或者直接不发送，QQ 会自动超时取消（约 10-15 秒）
    console.log(`[TypingIndicator] 私聊 ${userId} 输入状态已取消`);
}

/**
 * 私聊输入状态（兼容旧 API）
 */
export async function setPrivateTyping(
    client: NapCatClient,
    userId: number,
    isTyping: boolean
): Promise<void> {
    if (isTyping) {
        await startPrivateTyping(client, userId);
    } else {
        await stopPrivateTyping(client, userId);
    }
}

/**
 * 群聊输入状态 - 设置
 */
export async function setGroupTypingCard(
    client: NapCatClient,
    accountId: string,
    groupId: number,
    busySuffix: string = "输入中"
): Promise<void> {
    console.log(`[TypingIndicator] setGroupTypingCard 调用：accountId=${accountId}, groupId=${groupId}`);
    
    const selfId = client.getSelfId();
    console.log(`[TypingIndicator] selfId=${selfId}`);
    if (!selfId) {
        console.log(`[TypingIndicator] selfId 为空，返回`);
        return;
    }
    
    const groupKey = `${accountId}:group:${groupId}`;
    const current = groupBusyCounters.get(groupKey) || 0;
    console.log(`[TypingIndicator] groupKey=${groupKey}, current=${current}`);
    const next = current + 1;
    groupBusyCounters.set(groupKey, next);

    if (current > 0) {
        console.log(`[TypingIndicator] current > 0，跳过`);
        return;
    }

    try {
        const info = await client.sendAction("get_group_member_info", {
            group_id: groupId,
            user_id: selfId,
            no_cache: true,
        }) as { card?: string; nickname?: string } | undefined;
        
        const suffix = busySuffix.trim() || "输入中";
        const currentCard = (info?.card || info?.nickname || "").trim();
        const baseCard = stripTrailingBusySuffixes(currentCard, suffix);
        groupBaseCards.set(groupKey, baseCard);
        
        const nextCard = baseCard ? `${baseCard}(${suffix})` : `(${suffix})`;
        
        await client.sendAction("set_group_card", {
            group_id: groupId,
            user_id: selfId,
            card: nextCard,
        });
        
        console.log(`[TypingIndicator] 群 ${groupId} 名片已修改：${currentCard} → ${nextCard}`);
    } catch (err) {
        console.warn(`[TypingIndicator] Failed to set busy group card: ${String(err)}`);
    }
}

/**
 * 群聊输入状态 - 清除
 */
export function clearGroupTypingCard(
    client: NapCatClient,
    accountId: string,
    groupId: number,
    busySuffix: string = "输入中"
): void {
    const selfId = client.getSelfId();
    if (!selfId) return;
    
    const groupKey = `${accountId}:group:${groupId}`;
    const current = groupBusyCounters.get(groupKey) || 0;
    
    if (current <= 1) {
        groupBusyCounters.delete(groupKey);
        
        const suffix = busySuffix.trim() || "输入中";
        const baseCard = stripTrailingBusySuffixes(groupBaseCards.get(groupKey) || "", suffix);
        groupBaseCards.delete(groupKey);
        
        client.sendAction("set_group_card", {
            group_id: groupId,
            user_id: selfId,
            card: baseCard,
        }).catch(err => {
            console.warn(`[TypingIndicator] Failed to restore group card: ${String(err)}`);
        });
        
        console.log(`[TypingIndicator] 群 ${groupId} 名片已恢复：${baseCard}`);
        return;
    }
    
    groupBusyCounters.set(groupKey, current - 1);
}

/**
 * 清理所有群名片（用于断开连接时）
 */
export async function cleanupGroupCards(
    client: NapCatClient
): Promise<void> {
    const selfId = client.getSelfId();
    if (!selfId) return;
    
    for (const [groupKey, baseCard] of groupBaseCards.entries()) {
        const groupId = parseInt(groupKey.split(":group:")[1]);
        try {
            await client.sendAction("set_group_card", {
                group_id: groupId,
                user_id: selfId,
                card: baseCard,
            });
        } catch (error) {
            console.error(`[TypingIndicator] 清理群名片失败 ${groupId}:`, error);
        }
    }
    
    groupBusyCounters.clear();
    groupBaseCards.clear();
    privateTypingCounters.clear();
    
    // 清除所有私聊定时器
    for (const timer of privateTypingTimers.values()) {
        clearInterval(timer);
    }
    privateTypingTimers.clear();
}
