import type { NapCatClient } from "../client.js";
import { resolveMessageText } from "../utils/message-resolver.js";

export async function fetchGroupContextHistory(params: {
  client: NapCatClient;
  groupId: number;
  messageCount: number;
  cfg: any;
}): Promise<string> {
  const { client, groupId, messageCount, cfg } = params;
  console.log(`[NapCat] 自动获取群聊历史消息，最近 ${messageCount} 条...`);

  const historyResult: any = await client.sendAction("get_group_msg_history", {
    group_id: groupId,
    message_seq: 0,
    count: messageCount,
    reverseOrder: true,
  });

  const historyMessages = await Promise.all(
    (historyResult?.messages || []).map(async (msg: any) => {
      const senderName = msg.sender?.nickname || msg.sender?.card || "未知";

      try {
        const content = await resolveMessageText(msg.message || [], client, groupId, cfg);
        return `${senderName}: ${content}`;
      } catch {
        const fallback = (msg.message || [])
          .map((m: any) => {
            if (m.type === "text") return m.data?.text || "";
            if (m.type === "file") return `[文件：${m.data?.name || "unknown"}]`;
            if (m.type === "image") return "[图片]";
            if (m.type === "record") return "[语音]";
            if (m.type === "video") return "[视频]";
            if (m.type === "at") return `@${m.data?.qq === "all" ? "所有人" : m.data?.qq || ""}`;
            return "";
          })
          .join("");
        return `${senderName}: ${fallback}`;
      }
    }),
  );

  const formattedHistory = historyMessages.reverse().join("\n");
  if (!formattedHistory) {
    return "";
  }

  console.log(`[NapCat] 已获取 ${formattedHistory.split("\n").length} 条历史消息`);
  return `\n【群聊上下文】\n${formattedHistory}\n【当前消息】\n`;
}
