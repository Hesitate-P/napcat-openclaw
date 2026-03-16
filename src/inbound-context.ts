export interface InboundHintParams {
  senderId: number;
  senderName: string;
  isGroup: boolean;
  groupId?: number;
  isAdmin: boolean;
  hasMedia: boolean;
}

function buildImplicitHint(params: InboundHintParams): string {
  const chatType = params.isGroup ? "群聊" : "私聊";
  const groupPart = params.isGroup ? `，群号=${String(params.groupId ?? "")}` : "";
  const mediaPart = params.hasMedia ? "，本条消息含媒体" : "";
  return `系统补充：当前会话=${chatType}${groupPart}，发送者=${params.senderName}(${String(params.senderId)})，管理员=${params.isAdmin ? "是" : "否"}${mediaPart}。\n`;
}

export function buildInboundBodies(
  text: string,
  history: string,
  params: InboundHintParams,
): { body: string; rawBody: string } {
  const baseBody = `${history}${text}`;
  return {
    body: baseBody,
    rawBody: `${buildImplicitHint(params)}${baseBody}`,
  };
}
