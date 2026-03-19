/**
 * 入站消息处理器
 *
 * 负责将 NapCat 消息事件转换为 OpenClaw ctx payload 并分发给 Agent。
 */

import type { NapCatClient } from '../client.js';
import type { NapCatConfig } from '../config.js';
import { toNestedConfig } from '../config.js';
import { getNapcatRuntime } from '../runtime.js';
import { parseCQCode } from '../message/parser.js';
import { resolveMessageText, extractImageUrls } from '../utils/message-resolver.js';
import { checkAccess, isAdmin } from '../middleware/access-control.js';
import { shouldTrigger } from '../middleware/trigger.js';
import {
  startPrivateTyping,
  stopPrivateTyping,
  setGroupTypingCard,
  clearGroupTypingCard,
} from '../streaming/typing-indicator.js';
import { getUserNickname as _getUserNickname } from '../utils/userinfo.js';
import type { DatabaseManager } from '../database/index.js';

// ============================================================================
// 系统消息构建
// ============================================================================

function buildSystemBlock(params: {
  userId:      number;
  isGroup:     boolean;
  groupId?:    number;
  senderName?: string;
  isAdminUser: boolean;
}): string {
  const chatType = params.isGroup ? 'group' : 'direct';
  const lines = [
    '<qq_context>',
    `userId=${params.userId}`,
    `senderName=${params.senderName ?? 'unknown'}`,
    `isAdmin=${params.isAdminUser}`,
    `chatType=${chatType}`,
    params.isGroup ? `groupId=${params.groupId ?? ''}` : '',
    '</qq_context>',
  ].filter(Boolean);

  const instruction = `<system_instruction>
【重要】平台限制，请用自然拟人化风格回复，遵守：
- **禁用 Markdown**：纯文本，不用任何标记（如**、#、-等）。
- **口语化**：像真人聊天，可用表情、网络语、语气词（啦、哦、hh）。
- **连贯对话**：多轮时注意承接，就像微信/论坛里唠嗑。
- **换行别太频**：只在人类自然停顿处换行。

【多模态能力】你接入的是多模态大模型，可以直接看到图片和访问 URL：
- 消息中的图片可以直接分析和描述，不要说"我看不到图片"
- URL 链接可以直接访问读取内容
</system_instruction>`;

  return `${lines.join('\n')}\n\n${instruction}\n`;
}

// ============================================================================
// 群聊上下文获取
// ============================================================================

async function fetchGroupHistory(
  client:    NapCatClient,
  groupId:   number,
  count:     number,
  currentMsgId?: number | string,
): Promise<Array<{ sender: string; body: string; timestamp: number }>> {
  try {
    const result: any = await client.sendAction('get_group_msg_history', {
      group_id: groupId,
      count: count + 1,
    });
    const messages: any[] = (result?.messages ?? []).filter(
      (msg: any) => currentMsgId === undefined || String(msg.message_id) !== String(currentMsgId),
    ).slice(-count);

    return await Promise.all(
      messages.map(async (msg: any) => ({
        sender:    msg.sender?.card || msg.sender?.nickname || '未知',
        body:      await resolveMessageText(msg.message ?? [], client, groupId),
        timestamp: msg.time ? msg.time * 1000 : Date.now(),
      })),
    );
  } catch (err) {
    console.error('[InboundHandler] 获取群聊历史失败:', err);
    return [];
  }
}

// ============================================================================
// 主处理函数
// ============================================================================

export async function handleIncomingMessage(
  accountId:      string,
  event:          any,
  config:         NapCatConfig,
  client:         NapCatClient,
  cfg:            any,
  channelRuntime: any,
  db?:            DatabaseManager,
): Promise<void> {
  try {
    const nested  = toNestedConfig(config);
    const isGroup = event.message_type === 'group';
    const userId: number           = event.user_id;
    const groupId: number | undefined = event.group_id;
    const fromId  = isGroup ? String(groupId) : `user:${userId}`;

    // ── 访问控制 ────────────────────────────────────────────────────────────
    if (!checkAccess({ userId, groupId, isGroup }, config)) return;

    // ── 触发判断 ─────────────────────────────────────────────────────────────
    const selfId     = client.getSelfId() ?? event.self_id ?? null;
    const rawMessage = event.raw_message ?? '';
    const trigger    = shouldTrigger({ isGroup, selfId, event, rawMessage }, config);

    // ── 消息解析 ─────────────────────────────────────────────────────────────
    let messageElements = event.message;
    if (typeof event.message === 'string') {
      messageElements = parseCQCode(event.message).map((el) => ({ type: el.type, data: el.data }));
    }

    const fullContent = Array.isArray(messageElements)
      ? await resolveMessageText(messageElements, client, isGroup ? groupId : undefined)
      : rawMessage;

    const imageUrls   = extractImageUrls(messageElements ?? []);
    const isAdminUser = isAdmin(userId, config);
    const senderName  = event.sender?.card || event.sender?.nickname || 'Unknown';

    // ── 群聊上下文 ───────────────────────────────────────────────────────────
    let inboundHistory: Array<{ sender: string; body: string; timestamp: number }> | undefined;
    if (trigger && isGroup && nested.context.enabled && groupId !== undefined) {
      const hist = await fetchGroupHistory(client, groupId, nested.context.messageCount, event.message_id);
      if (hist.length > 0) inboundHistory = hist;
    }

    // ── 回复上下文 ───────────────────────────────────────────────────────────
    let replyToBody: string | undefined;
    let replyToSender: string | undefined;
    const replyEl = (messageElements ?? []).find((el: any) => el.type === 'reply');
    if (replyEl) {
      const replyId = replyEl.data?.id ?? replyEl.data?.message_id;
      if (replyId) {
        try {
          const replyMsg: any = await client.sendAction('get_msg', { message_id: replyId });
          if (replyMsg) {
            replyToSender = replyMsg.sender?.card || replyMsg.sender?.nickname || String(replyMsg.user_id ?? '');
            replyToBody   = await resolveMessageText(replyMsg.message ?? [], client, isGroup ? groupId : undefined);
          }
        } catch { /* ignore */ }
      }
    }

    // ── 构建 payload ─────────────────────────────────────────────────────────
    const systemBlock  = buildSystemBlock({ userId, isGroup, groupId, senderName, isAdminUser });

    // 群聊历史拼接到 BodyForAgent（InboundHistory 仅用于 SDK 统计，不渲染到 prompt）
    let contextStr = '';
    if (inboundHistory && inboundHistory.length > 0) {
      const lines = inboundHistory.map(h => `${h.sender}: ${h.body}`).join('\n');
      contextStr = `\n【群聊上下文】\n${lines}\n【当前消息】\n`;
    }
    // 回复上下文拼接
    let replyStr = '';
    if (replyToBody) {
      replyStr = `\n【回复的消息】${replyToSender ? `（${replyToSender}）` : ''}：${replyToBody}\n`;
    }

    const bodyWithMeta = `${systemBlock}${contextStr}${replyStr}${fullContent}`;
    const cleanBody    = fullContent;

    // ── Runtime & 路由 ───────────────────────────────────────────────────────
    const runtime = channelRuntime ? { channel: channelRuntime } : getNapcatRuntime();
    if (!channelRuntime) console.warn('[InboundHandler] channelRuntime 未注入，使用 fallback');

    const route = runtime.channel.routing.resolveAgentRoute({
      cfg, channel: 'napcat', accountId,
      peer: { kind: isGroup ? 'group' : 'direct', id: fromId },
    });

    const storePath = runtime.channel.session.resolveStorePath(
      cfg.session?.store, { agentId: route.agentId },
    );

    const ctxPayload = runtime.channel.reply.finalizeInboundContext({
      Provider: 'napcat', Channel: 'napcat', Surface: 'napcat',
      From: fromId, To: 'napcat:bot',
      Body: cleanBody, RawBody: cleanBody, BodyForAgent: bodyWithMeta,
      SenderId: String(userId), SenderName: senderName,
      SessionKey: route.sessionKey, AccountId: route.accountId,
      ChatType: isGroup ? 'group' : 'direct',
      Timestamp: (event.time ?? Math.floor(Date.now() / 1000)) * 1000,
      CommandAuthorized: true,
      // 结构化历史（SDK 原生支持，比手动拼接字符串更规范）
      ...(inboundHistory && inboundHistory.length > 0 && { InboundHistory: inboundHistory }),
      // 回复上下文
      ...(replyToBody   && { ReplyToBody: replyToBody }),
      ...(replyToSender && { ReplyToSender: replyToSender }),
      // 媒体
      ...(imageUrls.length > 0 && { MediaUrls: imageUrls }),
    });

    await runtime.channel.session.recordInboundSession({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
      ctx: ctxPayload,
      updateLastRoute: {
        sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
        channel: 'napcat', to: fromId, accountId: route.accountId,
      },
      onRecordError: (err: any) => console.error('[InboundHandler] Session Record Error:', err),
    });

    // ── 分发给 Agent ─────────────────────────────────────────────────────────
    if (trigger) {
      if (!client.getSelfId() && event.self_id) client.setSelfId(event.self_id);

      const busySuffix = nested.typingIndicator.nicknameSuffix || '输入中';
      if (isGroup && groupId !== undefined) {
        await setGroupTypingCard(client, accountId, groupId, busySuffix);
      } else {
        await startPrivateTyping(client, userId);
      }

      try {
        const deliver = async (payload: any): Promise<void> => {
          const msgs: Array<{ type: string; data: any }> = [];
          if (payload.text?.trim()) msgs.push({ type: 'text', data: { text: payload.text } });
          const urls = payload.mediaUrls ?? payload.MediaUrls ?? payload.imageUrls ?? payload.images;
          if (Array.isArray(urls)) {
            for (const url of urls) {
              const f = (url.startsWith('http') || url.startsWith('base64://') || url.startsWith('file:')) ? url : `http://${url}`;
              msgs.push({ type: 'image', data: { file: f } });
            }
          }
          if (msgs.length === 0) return;
          if (isGroup && groupId !== undefined) {
            await client.sendAction('send_group_msg', { group_id: groupId, message: msgs });
          } else {
            await client.sendAction('send_private_msg', { user_id: userId, message: msgs });
          }
        };

        const { dispatcher } = runtime.channel.reply.createReplyDispatcherWithTyping
          ? runtime.channel.reply.createReplyDispatcherWithTyping({ deliver })
          : { dispatcher: { sendFinalReply: deliver, waitForIdle: async () => {} } };

        await runtime.channel.reply.dispatchReplyFromConfig({ ctx: ctxPayload, cfg, dispatcher });
        if (typeof (dispatcher as any).waitForIdle === 'function') await (dispatcher as any).waitForIdle();
      } finally {
        if (isGroup && groupId !== undefined) {
          clearGroupTypingCard(client, accountId, groupId, busySuffix);
        } else {
          await stopPrivateTyping(client, userId);
        }
      }
    }

    // ── 数据库持久化 ─────────────────────────────────────────────────────────
    if (db) {
      try {
        const isNotice = [
          '[戳一戳]', '[群文件上传]', '[群成员增加]', '[群成员减少]',
          '[管理员变动]', '[群禁言]', '[精华消息]', '[表情回应]',
        ].some((tag) => fullContent.includes(tag));

        await db.saveMessage({
          message_id:  isNotice ? `notice_${Date.now()}` : String(event.message_id),
          account_id:  accountId,
          chat_type:   isGroup ? 'group' : 'direct',
          chat_id:     isGroup ? String(groupId) : `user:${userId}`,
          user_id:     userId,
          user_name:   senderName,
          message_type: isNotice ? 'notice' : 'text',
          content:      fullContent,
          raw_content:  JSON.stringify(event.message),
          raw_message:  rawMessage,
          timestamp:    (event.time ?? Math.floor(Date.now() / 1000)) * 1000,
        });
      } catch (err) {
        console.error('[InboundHandler] 数据库保存失败:', err);
      }
    }
  } catch (err) {
    console.error('[InboundHandler] 处理消息失败:', err);
  }
}
