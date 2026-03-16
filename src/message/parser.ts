/**
 * CQ 码辅助解析
 *
 * 当前主链路只保留两类职责：
 * 1. 字符串 CQ 码解析为分段数组
 * 2. 从消息分段中提取图片 URL
 *
 * 文本归一化职责统一由 `src/utils/message-resolver.ts` 负责。
 */

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]")
    .replace(/&#44;/g, ",")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

export function parseCQCode(cqCode: string): Array<{ type: string; data: Record<string, string> }> {
  const elements: Array<{ type: string; data: Record<string, string> }> = [];
  if (!cqCode || typeof cqCode !== "string") {
    return elements;
  }

  const decoded = decodeHtmlEntities(cqCode);
  const regex = /\[CQ:(\w+)(?:,([^\]]+))?\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(decoded)) !== null) {
    const type = match[1];
    const paramsStr = match[2] || "";
    const data: Record<string, string> = {};
    const paramRegex = /(\w+)=([^,&]+)/g;
    let paramMatch: RegExpExecArray | null;

    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      const key = paramMatch[1];
      const value = paramMatch[2]
        .trim()
        .replace(/&#91;/g, "[")
        .replace(/&#93;/g, "]")
        .replace(/&#44;/g, ",")
        .replace(/&amp;/g, "&");

      data[key] = value;
    }

    elements.push({ type, data });
  }

  return elements;
}

export function extractImageUrls(elements: any[], maxImages = 3): string[] {
  if (!Array.isArray(elements)) return [];

  const urls: string[] = [];
  for (const element of elements) {
    if (element.type !== "image") continue;

    const url = element.data?.url || element.data?.file;
    if (typeof url === "string" && (url.startsWith("http") || url.startsWith("base64://"))) {
      urls.push(url);
      if (urls.length >= maxImages) break;
    }
  }

  return urls;
}
