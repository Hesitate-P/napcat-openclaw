/**
 * 触发判断中间件
 *
 * 决定一条消息是否应该触发 Agent 回复。
 */

import type { NapCatConfig } from '../config.js';
import { toNestedConfig } from '../config.js';

export interface TriggerContext {
  isGroup:    boolean;
  selfId:     number | null;
  event:      any;
  rawMessage: string;
}

/**
 * 判断消息是否应该触发 Agent 回复。
 * @returns true = 触发
 */
export function shouldTrigger(ctx: TriggerContext, config: NapCatConfig): boolean {
  const nested  = toNestedConfig(config);
  const trigger = nested.trigger;
  const { isGroup, selfId, event, rawMessage } = ctx;

  // 私聊：始终触发
  if (!isGroup) return true;

  // 群聊触发判断关闭：不触发
  if (!trigger.enabled) return false;

  // 戳一戳：检查是否戳了机器人
  if (rawMessage.includes('[戳一戳]')) {
    const m = rawMessage.match(/\[戳一戳\] .+?\(\d+\) 戳了 .+?\((\d+)\)/);
    return !!(m && selfId && String(m[1]) === String(selfId));
  }

  // @机器人触发
  if (trigger.atBot && selfId && Array.isArray(event.message)) {
    const hasAt = event.message.some(
      (seg: any) =>
        seg.type === 'at' &&
        String(seg.data?.qq) === String(selfId),
    );
    if (hasAt) return true;
  }

  // 关键词触发
  if (trigger.keywords) {
    const keywords = trigger.keywords
      .split(/[，,]/)
      .map((k: string) => k.trim())
      .filter(Boolean);
    if (keywords.some((kw: string) => rawMessage.includes(kw))) return true;
  }

  return false;
}
