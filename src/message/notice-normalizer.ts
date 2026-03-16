import type { NormalizedNapCatEventResult } from "../types.js";

export function normalizeNapCatEvent(payload: any, selfId?: number | null): NormalizedNapCatEventResult {
  const { post_type, message_type, event_type, notice_type, sub_type } = payload;

  if (post_type === "meta_event" && event_type === "heartbeat") {
    return { kind: "heartbeat", event: payload };
  }

  if (post_type === "message") {
    return { kind: "message", event: payload };
  }

  if (post_type === "notice" && notice_type === "notify" && sub_type === "poke") {
    const event = { ...payload };
    const userId = event.user_id || event.operator_id || "unknown";
    const targetId = event.target_id || "unknown";
    const isPokeBot = selfId && String(targetId) === String(selfId);
    const userName = event.sender?.nickname || event.user_id?.toString() || "未知用户";
    const targetName = event.target_name || event.target_id?.toString() || "未知用户";

    event.post_type = "message";
    event.message_type = event.group_id ? "group" : "private";
    event.raw_message = `[戳一戳] ${userName}(${userId}) 戳了 ${targetName}(${targetId})`;
    event.message = [
      {
        type: "text",
        data: {
          text: event.raw_message,
          poke_info: {
            user_id: userId,
            user_name: userName,
            target_id: targetId,
            target_name: targetName,
            is_poke_bot: isPokeBot,
            group_id: event.group_id || null,
          },
        },
      },
    ];

    return { kind: "message", event };
  }

  if (post_type === "notice") {
    const event = { ...payload };

    if (notice_type === "group_upload" && event.file) {
      const userId = event.user_id || "unknown";
      const fileName = event.file.name || "未知文件";
      const fileSize = event.file.size ? `${(event.file.size / 1024).toFixed(1)}KB` : "";
      const fileId = event.file.id || "";
      const busid = event.file.busid || "";

      event.post_type = "message";
      event.message_type = "group";
      event.raw_message = `[群文件上传] 用户${userId} 上传了文件：${fileName} (${fileSize})`;
      event.message = [{ type: "text", data: { text: event.raw_message, upload_info: { user_id: userId, file_name: fileName, file_size: event.file.size, file_id: fileId, busid } } }];
      return { kind: "message", event };
    }

    if (notice_type === "essence") {
      const subType = event.sub_type || "add";
      const senderId = event.sender_id || "unknown";
      const operatorId = event.operator_id || "unknown";
      const messageId = event.message_id || "";
      const action = subType === "add" ? "设为精华" : "移除精华";

      event.post_type = "message";
      event.message_type = "group";
      event.raw_message = `[精华消息] 用户${operatorId} 将 用户${senderId} 的消息${action}`;
      event.message = [{ type: "text", data: { text: event.raw_message, essence_info: { action: subType, sender_id: senderId, operator_id: operatorId, message_id: messageId } } }];
      return { kind: "message", event };
    }

    if (notice_type === "group_increase") {
      const userId = event.user_id || "unknown";
      const operatorId = event.operator_id || "unknown";
      const subType = event.sub_type || "approve";
      const subTypeText = subType === "approve" ? "同意加群" : subType === "invite" ? "邀请加群" : subType;

      event.post_type = "message";
      event.message_type = "group";
      event.raw_message = `[群成员增加] 用户${userId} 加入群聊 (${subTypeText}) 操作者：${operatorId}`;
      event.message = [{ type: "text", data: { text: event.raw_message, increase_info: { user_id: userId, operator_id: operatorId, sub_type: subType } } }];
      return { kind: "message", event };
    }

    if (notice_type === "group_decrease") {
      const userId = event.user_id || "unknown";
      const operatorId = event.operator_id || "unknown";
      const subType = event.sub_type || "leave";
      const subTypeText = subType === "leave" ? "主动退群" : subType === "kick" ? "被踢" : subType === "kick_me" ? "我被踢" : subType === "disband" ? "群解散" : subType;

      event.post_type = "message";
      event.message_type = "group";
      event.raw_message = `[群成员减少] 用户${userId} 离开群聊 (${subTypeText}) 操作者：${operatorId}`;
      event.message = [{ type: "text", data: { text: event.raw_message, decrease_info: { user_id: userId, operator_id: operatorId, sub_type: subType } } }];
      return { kind: "message", event };
    }

    if (notice_type === "group_admin") {
      const userId = event.user_id || "unknown";
      const subType = event.sub_type || "set";
      const action = subType === "set" ? "成为" : "卸任";

      event.post_type = "message";
      event.message_type = "group";
      event.raw_message = `[管理员变动] 用户${userId} ${action}管理员`;
      event.message = [{ type: "text", data: { text: event.raw_message, admin_info: { user_id: userId, sub_type: subType } } }];
      return { kind: "message", event };
    }

    if (notice_type === "group_ban") {
      const userId = event.user_id || "unknown";
      const operatorId = event.operator_id || "unknown";
      const subType = event.sub_type || "ban";
      const duration = event.duration || 0;
      const action = subType === "ban" ? `禁言 ${duration}秒` : "解除禁言";

      event.post_type = "message";
      event.message_type = "group";
      event.raw_message = `[群禁言] 用户${operatorId} ${action} 用户${userId}`;
      event.message = [{ type: "text", data: { text: event.raw_message, ban_info: { user_id: userId, operator_id: operatorId, sub_type: subType, duration } } }];
      return { kind: "message", event };
    }

    if (notice_type === "group_card") {
      const userId = event.user_id || "unknown";
      const cardNew = event.card_new || "";
      const cardOld = event.card_old || "";

      event.post_type = "message";
      event.message_type = "group";
      event.raw_message = `[群名片变更] 用户${userId} 修改名片 "${cardOld}" → "${cardNew}"`;
      event.message = [{ type: "text", data: { text: event.raw_message, card_info: { user_id: userId, card_new: cardNew, card_old: cardOld } } }];
      return { kind: "message", event };
    }

    if (notice_type === "group_msg_emoji_like" && event.likes) {
      const messageId = event.message_id || "";
      const userId = event.user_id || "unknown";
      const likes = event.likes.map((l: any) => `${l.emoji_id}:${l.count}`).join(", ");

      event.post_type = "message";
      event.message_type = "group";
      event.raw_message = `[表情回应] 消息${messageId} 收到表情回应：${likes}`;
      event.message = [{ type: "text", data: { text: event.raw_message, emoji_like_info: { message_id: messageId, user_id: userId, likes: event.likes } } }];
      return { kind: "message", event };
    }
  }

  return {
    kind: "other",
    event: payload,
    eventType: `${post_type}.${message_type || notice_type || event_type || "*"}`,
  };
}
