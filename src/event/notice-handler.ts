/**
 * Notice 事件处理器
 *
 * 将 NapCat 推送的 notice 事件转换为统一的 message 事件格式，
 * 供 channel.ts 的消息处理流程统一消费。
 *
 * 职责边界：
 * - 输入：原始 notice payload（来自 OneBot WebSocket）
 * - 输出：转换后的 message payload，或 null（表示忽略该事件）
 */

import type { NapCatClient } from '../client.js';

export type NoticePayload = Record<string, any>;

/**
 * 尝试将 notice 事件转换为 message 事件。
 * 返回 null 表示该 notice 无需处理。
 */
export async function handleNoticeEvent(
  payload: NoticePayload,
  client: NapCatClient,
): Promise<NoticePayload | null> {
  const { notice_type, sub_type } = payload;

  // ── 戳一戳 ─────────────────────────────────────────────────────────────
  if (notice_type === 'notify' && sub_type === 'poke') {
    return convertPokeAsync(payload, client);
  }

  // ── 群文件上传 ──────────────────────────────────────────────────────────
  if (notice_type === 'group_upload' && payload.file) {
    return convertGroupUpload(payload);
  }

  // ── 私聊文件（NapCat 特有 notice 类型，实际已作为 message 推送，备用分支）
  if (notice_type === 'private_file_upload' || notice_type === 'offline_file') {
    return convertPrivateFile(payload);
  }

  // ── 群精华消息 ──────────────────────────────────────────────────────────
  if (notice_type === 'essence') {
    return convertEssence(payload);
  }

  // ── 群成员变动 ──────────────────────────────────────────────────────────
  if (notice_type === 'group_increase') return convertGroupIncrease(payload);
  if (notice_type === 'group_decrease') return convertGroupDecrease(payload);

  // ── 群管理员变动 ────────────────────────────────────────────────────────
  if (notice_type === 'group_admin') return convertGroupAdmin(payload);

  // ── 群禁言 ──────────────────────────────────────────────────────────────
  if (notice_type === 'group_ban') return convertGroupBan(payload);

  // ── 群名片变更 ──────────────────────────────────────────────────────────
  if (notice_type === 'group_card') return convertGroupCard(payload);

  // ── 表情回应 ────────────────────────────────────────────────────────────
  if (notice_type === 'group_msg_emoji_like' && payload.likes) {
    return convertEmojiLike(payload);
  }

  // 其他 notice：不处理
  return null;
}

// ============================================================================
// 内部转换函数
// ============================================================================

function makeGroupMessage(payload: NoticePayload, text: string): NoticePayload {
  return {
    ...payload,
    post_type: 'message',
    message_type: 'group',
    raw_message: text,
    message: [{ type: 'text', data: { text } }],
  };
}

/** 解析 group_upload 的 file 字段（可能是 JSON 字符串或对象） */
function parseGroupUploadFile(raw: any): Record<string, any> {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw ?? {};
}

// ── 戳一戳 ──────────────────────────────────────────────────────────────────

async function convertPokeAsync(payload: NoticePayload, client: NapCatClient): Promise<NoticePayload> {
  const userId   = payload.user_id   ?? payload.operator_id ?? 'unknown';
  const targetId = payload.target_id ?? 'unknown';
  const selfId   = client.getSelfId();
  const isPokeBot = selfId && String(targetId) === String(selfId);
  const groupId  = payload.group_id ?? null;

  // 优先使用事件自带的昵称字段
  let userName   = payload.nick ?? payload.sender_nick ?? '';
  let targetName = payload.target_nick ?? payload.target_name ?? '';

  // 若缺失则异步查询
  const fetchName = async (id: number | string): Promise<string> => {
    const uid = Number(id);
    if (!uid) return String(id);
    try {
      if (groupId) {
        const info = await client.sendAction<{ card?: string; nickname?: string }>(
          'get_group_member_info', { group_id: groupId, user_id: uid },
        );
        return info?.card || info?.nickname || String(id);
      } else {
        const info = await client.sendAction<{ nickname?: string }>(
          'get_stranger_info', { user_id: uid },
        );
        return info?.nickname || String(id);
      }
    } catch {
      return String(id);
    }
  };

  if (!userName)   userName   = await fetchName(userId);
  if (!targetName) targetName = await fetchName(targetId);

  const text = `[戳一戳] ${userName}(${userId}) 戳了 ${targetName}(${targetId})`;
  const message = [{
    type: 'text',
    data: {
      text,
      poke_info: { user_id: userId, user_name: userName, target_id: targetId, target_name: targetName, is_poke_bot: isPokeBot, group_id: groupId },
    },
  }];

  return {
    ...payload,
    post_type: 'message',
    message_type: groupId ? 'group' : 'private',
    raw_message: text,
    message,
  };
}

// ── 群文件上传 ───────────────────────────────────────────────────────────────

function convertGroupUpload(payload: NoticePayload): NoticePayload {
  const fileObj  = parseGroupUploadFile(payload.file);
  const fileName = fileObj.name || fileObj.file_name || '未知文件';
  const fileId   = fileObj.id   || fileObj.file_id   || '';
  const fileSize = fileObj.size || fileObj.file_size  || 0;

  return {
    ...payload,
    post_type: 'message',
    message_type: 'group',
    raw_message: `[群文件上传] ${fileName}`,
    message: [{
      type: 'file',
      data: { file_name: fileName, name: fileName, file_id: fileId, file_size: fileSize },
    }],
  };
}

// ── 私聊文件上传 ─────────────────────────────────────────────────────────────

function convertPrivateFile(payload: NoticePayload): NoticePayload {
  const file     = payload.file ?? {};
  const fileName = file.file_name || file.name || file.filename || '未知文件';
  const fileId   = file.file_id   || file.id   || file.file    || '';
  const fileSize = file.file_size || file.size  || 0;
  const url      = file.url       || file.path  || '';

  return {
    ...payload,
    post_type: 'message',
    message_type: 'private',
    raw_message: `[私聊文件] ${fileName}`,
    message: [{
      type: 'file',
      data: { file_name: fileName, name: fileName, file_id: fileId, file_size: fileSize, url },
    }],
  };
}

// ── 精华消息 ─────────────────────────────────────────────────────────────────

function convertEssence(payload: NoticePayload): NoticePayload {
  const action     = payload.sub_type === 'add' ? '设为精华' : '移除精华';
  const senderId   = payload.sender_id   ?? 'unknown';
  const operatorId = payload.operator_id ?? 'unknown';
  const senderName   = payload.sender_nick   || String(senderId);
  const operatorName = payload.operator_nick  || String(operatorId);
  const text = `[精华消息] ${operatorName}(${operatorId}) 将 ${senderName}(${senderId}) 的消息${action}`;
  return makeGroupMessage(payload, text);
}

// ── 群成员增加 ───────────────────────────────────────────────────────────────

function convertGroupIncrease(payload: NoticePayload): NoticePayload {
  const userId     = payload.user_id     ?? 'unknown';
  const operatorId = payload.operator_id ?? 'unknown';
  const subType    = payload.sub_type    ?? 'approve';
  const typeText   = subType === 'approve' ? '同意加群' : subType === 'invite' ? '邀请加群' : subType;
  const userName     = payload.nick || payload.user_name   || String(userId);
  const operatorName = payload.operator_nick || String(operatorId);
  return makeGroupMessage(payload, `[群成员增加] ${userName}(${userId}) 加入群聊 (${typeText})，操作者：${operatorName}(${operatorId})`);
}

// ── 群成员减少 ───────────────────────────────────────────────────────────────

function convertGroupDecrease(payload: NoticePayload): NoticePayload {
  const userId     = payload.user_id     ?? 'unknown';
  const operatorId = payload.operator_id ?? 'unknown';
  const subType    = payload.sub_type    ?? 'leave';
  const typeText: Record<string, string> = { leave: '主动退群', kick: '被踢', kick_me: '我被踢', disband: '群解散' };
  const userName     = payload.nick || payload.user_name   || String(userId);
  const operatorName = payload.operator_nick || String(operatorId);
  return makeGroupMessage(payload, `[群成员减少] ${userName}(${userId}) 离开群聊 (${typeText[subType] ?? subType})，操作者：${operatorName}(${operatorId})`);
}

// ── 群管理员变动 ─────────────────────────────────────────────────────────────

function convertGroupAdmin(payload: NoticePayload): NoticePayload {
  const userId  = payload.user_id  ?? 'unknown';
  const action  = payload.sub_type === 'set' ? '成为' : '卸任';
  const userName = payload.nick || payload.user_name || String(userId);
  return makeGroupMessage(payload, `[管理员变动] ${userName}(${userId}) ${action}管理员`);
}

// ── 群禁言 ───────────────────────────────────────────────────────────────────

function convertGroupBan(payload: NoticePayload): NoticePayload {
  const userId     = payload.user_id     ?? 'unknown';
  const operatorId = payload.operator_id ?? 'unknown';
  const duration   = payload.duration    ?? 0;
  const isBan      = payload.sub_type === 'ban';
  // user_id=0 表示全员禁言/解禁
  const isWholeBan = Number(userId) === 0;
  const action     = isBan
    ? (isWholeBan ? '开启全员禁言' : `禁言 ${duration}秒`)
    : (isWholeBan ? '解除全员禁言' : '解除禁言');
  const userName     = payload.nick || payload.user_name   || String(userId);
  const operatorName = payload.operator_nick || String(operatorId);
  const target       = isWholeBan ? '全体成员' : `${userName}(${userId})`;
  return makeGroupMessage(payload, `[群禁言] ${operatorName}(${operatorId}) ${action} ${target}`);
}

// ── 群名片变更 ───────────────────────────────────────────────────────────────

function convertGroupCard(payload: NoticePayload): NoticePayload {
  const userId  = payload.user_id  ?? 'unknown';
  const cardNew = payload.card_new ?? '';
  const cardOld = payload.card_old ?? '';
  const userName = cardOld || payload.nick || String(userId);
  return makeGroupMessage(payload, `[群名片变更] ${userName}(${userId}) 修改名片 "${cardOld}" → "${cardNew}"`);
}

// ── 表情回应 ─────────────────────────────────────────────────────────────────

function convertEmojiLike(payload: NoticePayload): NoticePayload {
  const messageId = payload.message_id ?? '';
  const likes = (payload.likes as Array<{ emoji_id: string; count: number }>)
    .map(l => `${l.emoji_id}×${l.count}`)
    .join(', ');
  return makeGroupMessage(payload, `[表情回应] 消息 ${messageId} 收到：${likes}`);
}
