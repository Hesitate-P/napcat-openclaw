import type { DatabaseManager } from "./database/index.js";

export async function persistInboundMessage(params: {
  db?: DatabaseManager;
  accountId: string;
  event: any;
  isGroup: boolean;
  groupId?: number;
  userId: number;
  fullContent: string;
}): Promise<void> {
  const { db, accountId, event, isGroup, groupId, userId, fullContent } = params;
  if (!db) return;

  const isNoticeMessage =
    event.post_type === "notice" ||
    fullContent.includes("[戳一戳]") ||
    fullContent.includes("[系统通知]") ||
    fullContent.includes("[群文件上传]") ||
    fullContent.includes("[群成员增加]") ||
    fullContent.includes("[群成员减少]");

  await db.saveMessage({
    message_id: isNoticeMessage ? `notice_${Date.now()}` : String(event.message_id),
    account_id: accountId,
    chat_type: isGroup ? "group" : "direct",
    chat_id: isGroup ? String(groupId) : `user:${userId}`,
    user_id: userId,
    user_name: event.sender?.nickname || event.sender?.card || String(userId),
    message_type: isNoticeMessage ? "notice" : "text",
    content: fullContent,
    raw_content: JSON.stringify(event.message),
    raw_message: event.raw_message || "",
    timestamp: event.time * 1000,
  });
}
