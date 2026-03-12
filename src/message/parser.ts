/**
 * 消息解析器
 * 
 * 解析 NapCat 消息元素，转换为统一格式
 */

import type { MessageElement, MessageRecord, MessageElementRecord } from '../types.js';

/**
 * 消息解析结果
 */
export interface ParsedMessage {
  messageId: string;
  chatType: 'direct' | 'group';
  chatId: string;
  userId: number;
  userName: string;
  messageType: 'text' | 'image' | 'file' | 'voice' | 'video' | 'face' | 'mixed' | 'notice';
  content: string;
  rawContent: string;
  rawMessage: string;
  timestamp: number;
  elements: Array<{
    type: string;
    data: Record<string, unknown>;
  }>;
}

/**
 * 解析 NapCat 消息事件
 */
export function parseNapCatMessage(
  event: any,
  _accountId: string
): ParsedMessage {
  const {
    message_id,
    message_type,
    group_id,
    user_id,
    sender,
    message,
    raw_message,
    time,
  } = event;

  // 确定聊天类型和 ID
  const chatType: 'direct' | 'group' = message_type === 'private' ? 'direct' : 'group';
  const chatId = chatType === 'direct' ? `user:${user_id}` : `group:${group_id}`;

  // 获取用户名
  const userName = sender?.nickname || sender?.card || String(user_id);

  // 解析消息元素
  const elements = parseMessageElements(message);

  // 提取文本内容
  const textContent = elements
    .filter(el => el.type === 'text')
    .map(el => String(el.data.text || ''))
    .join('');

  // 确定消息类型
  const messageType = determineMessageType(elements);

  // 构建消息 ID 字符串
  const messageId = String(message_id);

  // 时间戳（秒转毫秒）
  const timestamp = time * 1000;

  return {
    messageId,
    chatType,
    chatId,
    userId: user_id,
    userName,
    messageType,
    content: textContent,
    rawContent: JSON.stringify(message),
    rawMessage: raw_message,
    timestamp,
    elements,
  };
}

/**
 * 解析消息元素
 */
function parseMessageElements(elements: MessageElement[]): Array<{
  type: string;
  data: Record<string, unknown>;
}> {
  return elements.map(element => {
    switch (element.type) {
      case 'text':
        return {
          type: 'text',
          data: {
            text: element.data.text,
          },
        };

      case 'image':
        return {
          type: 'image',
          data: {
            file: element.data.file,
            url: element.data.url,
            file_size: element.data.file_size,
          },
        };

      case 'face':
        return {
          type: 'face',
          data: {
            face_id: element.data.id,
          },
        };

      case 'record':
        return {
          type: 'voice',
          data: {
            file: element.data.file,
            url: element.data.url,
          },
        };

      case 'video':
        return {
          type: 'video',
          data: {
            file: element.data.file,
            url: element.data.url,
          },
        };

      case 'at':
        return {
          type: 'at',
          data: {
            qq: element.data.qq,
            user_id: element.data.qq,  // 兼容两种字段名
          },
        };

      case 'reply':
        return {
          type: 'reply',
          data: {
            message_id: element.data.id,
          },
        };

      case 'file':
        return {
          type: 'file',
          data: {
            name: element.data.name,
            url: element.data.url,
            path: element.data.path,
          },
        };

      case 'dice':
        return {
          type: 'dice',
          data: {
            value: element.data.value,
          },
        };

      case 'rps':
        return {
          type: 'rps',
          data: {
            value: element.data.value,
          },
        };

      case 'shake':
        return {
          type: 'shake',
          data: {},
        };

      case 'poke':
        return {
          type: 'poke',
          data: {
            user_id: element.data.user_id,
          },
        };

      case 'json':
        return {
          type: 'json',
          data: {
            data: element.data.data,
          },
        };

      case 'music':
        return {
          type: 'music',
          data: {
            type: element.data.type,
            id: element.data.id,
            url: element.data.url,
            audio: element.data.audio,
            title: element.data.title,
            content: element.data.content,
            image: element.data.image,
          },
        };

      default:
        return {
          type: element.type,
          data: element.data as Record<string, unknown>,
        };
    }
  });
}

/**
 * 确定消息类型
 */
function determineMessageType(elements: Array<{ type: string; data: Record<string, unknown> }>): 
  'text' | 'image' | 'file' | 'voice' | 'video' | 'face' | 'mixed' {
  
  const types = elements.map(el => el.type);

  // 混合类型判断
  const hasText = types.includes('text');
  const hasImage = types.includes('image');
  const hasFile = types.includes('file');
  const hasVoice = types.includes('voice');
  const hasVideo = types.includes('video');
  const hasFace = types.includes('face');

  // 计算非文本元素数量
  const nonTextCount = types.filter(t => t !== 'text').length;

  if (nonTextCount === 0) {
    return 'text';
  }

  if (nonTextCount > 1 || (hasText && nonTextCount > 0)) {
    return 'mixed';
  }

  if (hasImage) return 'image';
  if (hasFile) return 'file';
  if (hasVoice) return 'voice';
  if (hasVideo) return 'video';
  if (hasFace) return 'face';

  return 'mixed';
}

/**
 * 转换为数据库消息记录
 */
export function toMessageRecord(
  parsed: ParsedMessage,
  accountId: string
): { message: MessageRecord; elements: MessageElementRecord[] } {
  const message: MessageRecord = {
    message_id: parsed.messageId,
    account_id: accountId,
    chat_type: parsed.chatType,
    chat_id: parsed.chatId,
    user_id: parsed.userId,
    user_name: parsed.userName,
    message_type: parsed.messageType,
    content: parsed.content,
    raw_content: parsed.rawContent,
    raw_message: parsed.rawMessage,
    timestamp: parsed.timestamp,
  };

  const elements: MessageElementRecord[] = parsed.elements.map((el, index) => ({
    message_id: parsed.messageId,
    element_type: el.type,
    element_data: JSON.stringify(el.data),
    sort_order: index,
  }));

  return { message, elements };
}

/**
 * 构建 CQ 码（用于发送消息）
 */
export function buildCQCode(element: { type: string; data: Record<string, unknown> }): string {
  const { type, data } = element;

  if (type === 'text') {
    return String(data.text || '');
  }

  const params = Object.entries(data)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${escapeCQValue(String(value))}`)
    .join(',');

  return `[CQ:${type},${params}]`;
}

/**
 * 转义 CQ 码值
 */
function escapeCQValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/,/g, '&#44;');
}

/**
 * 解码 HTML 实体
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&#44;/g, ',')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/**
 * 解析 CQ 码（用于接收消息）
 * 支持 HTML 实体编码的 CQ 码（如 &#91;CQ:at,qq=123&#93;）
 */
export function parseCQCode(cqCode: string): Array<{ type: string; data: Record<string, string> }> {
  const elements: Array<{ type: string; data: Record<string, string> }> = [];
  
  if (!cqCode || typeof cqCode !== 'string') {
    return elements;
  }
  
  // 先解码 HTML 实体
  const decoded = decodeHtmlEntities(cqCode);
  
  console.log('[Parser] parseCQCode 输入:', cqCode.substring(0, 200));
  console.log('[Parser] parseCQCode 解码后:', decoded.substring(0, 200));
  
  const regex = /\[CQ:(\w+)(?:,([^\]]+))?\]/g;
  let match;

  while ((match = regex.exec(decoded)) !== null) {
    const type = match[1];
    const paramsStr = match[2] || '';
    
    const data: Record<string, string> = {};
    const paramRegex = /(\w+)=([^,&]+)/g;
    let paramMatch;

    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      const key = paramMatch[1];
      let value = paramMatch[2];
      
      // 去除首尾空格
      value = value.trim();
      
      // 反转义（处理参数值中的特殊字符）
      value = value
        .replace(/&#91;/g, '[')
        .replace(/&#93;/g, ']')
        .replace(/&#44;/g, ',')
        .replace(/&amp;/g, '&');
      
      data[key] = value;
    }

    console.log('[Parser] 解析到 CQ 元素:', type, data);
    elements.push({ type, data });
  }

  console.log('[Parser] parseCQCode 结果:', elements.length, '个元素');
  return elements;
}

/**
 * 提取图片 URL
 */
export function extractImageUrls(elements: any[], maxImages = 3): string[] {
  if (!Array.isArray(elements)) return [];
  const urls: string[] = [];
  
  for (const el of elements) {
    if (el.type === "image") {
      const url = el.data?.url || el.data?.file;
      if (url && (url.startsWith("http") || url.startsWith("base64://"))) {
        urls.push(url);
        if (urls.length >= maxImages) break;
      }
    }
  }
  
  return urls;
}

/**
 * 提取文件信息
 */
export function extractFileInfo(elements: any[]): Array<{ name: string; url?: string }> {
  if (!Array.isArray(elements)) return [];
  const files: Array<{ name: string; url?: string }> = [];
  
  for (const el of elements) {
    if (el.type === "file") {
      files.push({
        name: el.data?.name || "unknown",
        url: el.data?.url || el.data?.path,
      });
    }
  }
  
  return files;
}

/**
 * 提取@信息
 */
export function extractAtInfo(elements: any[]): Array<{ userId: string | number }> {
  if (!Array.isArray(elements)) return [];
  const ats: Array<{ userId: string | number }> = [];
  
  for (const el of elements) {
    if (el.type === "at") {
      ats.push({ userId: el.data?.qq });
    }
  }
  
  return ats;
}

/**
 * 解析消息元素为文本（包含@昵称和表情名称）
 * 参考旧 qq 插件的实现逻辑
 * 
 * @param elements 消息元素数组
 * @param client NapCat 客户端
 * @param groupId 群 ID（可选）
 * @param cfg 配置对象（可选，用于控制分层解析）
 */
export async function resolveMessageText(
  elements: any[],
  client?: any,
  groupId?: number,
  cfg?: any
): Promise<string> {
  if (!Array.isArray(elements)) {
    console.log('[Parser] elements 不是数组:', typeof elements);
    return "";
  }
  
  console.log('[Parser] 开始解析，segments 数量:', elements.length);
  console.log('[Parser] client:', !!client, 'groupId:', groupId);
  
  let resolvedText = "";
  
  for (const seg of elements) {
    console.log('[Parser] 处理 segment:', seg.type, seg.data);
    
    if (seg.type === "text") {
      resolvedText += seg.data?.text || "";
    }
    else if (seg.type === "at") {
      // 兼容 qq 和 user_id 两种字段名
      let qqId = seg.data?.qq ?? seg.data?.user_id;
      let name = qqId;
      console.log('[Parser] @ 信息原始 qq:', qqId);
      
      if (name === "all" || name === "everyone") {
        resolvedText += " @全体成员 ";
      } else if (groupId && client && qqId) {
        // 尝试获取群成员昵称
        try {
          console.log('[Parser] 尝试获取群成员信息:', groupId, qqId);
          const info = await client.sendAction("get_group_member_info", {
            group_id: groupId,
            user_id: Number(qqId),
          });
          console.log('[Parser] 获取到的群成员信息:', info);
          name = info?.card || info?.nickname || String(qqId);
        } catch (e) {
          console.log('[Parser] 获取群成员信息失败:', e);
          // 获取失败，使用 QQ 号
          name = String(qqId);
        }
        resolvedText += ` @${name} `;
      } else {
        // 非群聊环境，直接使用 QQ 号
        resolvedText += ` @${name} `;
      }
    }
    else if (seg.type === "face") {
      // QQ 表情 - 保留完整信息
      const faceId = String(seg.data?.id ?? seg.data?.face_id ?? "0");
      const faceName = getFaceName(faceId);
      const result = seg.data?.result;  // 骰子/猜拳结果
      const chainCount = seg.data?.chainCount;  // 连续发送次数
      
      if (result !== undefined) {
        resolvedText += ` [表情：${faceName}, 结果：${result}] `;
      } else if (chainCount) {
        resolvedText += ` [表情：${faceName}, 连续：${chainCount}个] `;
      } else {
        resolvedText += ` [表情：${faceName}] `;
      }
    }
    else if (seg.type === "mface") {
      // 商城表情 - 保留完整信息
      const emojiId = seg.data?.emoji_id;
      const packageId = seg.data?.emoji_package_id;
      const summary = seg.data?.summary;
      resolvedText += ` [商城表情：${summary || `ID:${emojiId}`}, 包 ID:${packageId}] `;
    }
    else if (seg.type === "record") {
      // 语音消息 - 保留完整信息
      const url = seg.data?.url || seg.data?.file;
      const path = seg.data?.path;
      const fileSize = seg.data?.file_size;
      const text = seg.data?.text;
      
      const info: string[] = [];
      if (url && (url.startsWith("http") || url.startsWith("base64://"))) {
        info.push(url);
      } else if (path) {
        info.push(path);
      }
      if (fileSize) {
        info.push(`${(fileSize / 1024).toFixed(1)}KB`);
      }
      if (text) {
        info.push(text);
      }
      
      if (info.length > 0) {
        resolvedText += ` [语音：${info.join(", ")}] `;
      } else {
        resolvedText += " [语音消息] ";
      }
    }
    else if (seg.type === "image") {
      // 图片消息 - 保留完整信息
      let imageUrl: string | undefined;
      const url = seg.data?.url ?? seg.data?.image;
      const file = seg.data?.file;
      const summary = seg.data?.summary;  // 图片描述
      const subType = seg.data?.sub_type;  // 图片子类型
      const fileSize = seg.data?.file_size;
      
      if (typeof url === "string") {
        const urlTrimmed = url.trim();
        if (urlTrimmed.startsWith("http") || urlTrimmed.startsWith("base64://") || urlTrimmed.startsWith("file:")) {
          imageUrl = urlTrimmed;
        }
      }
      if (!imageUrl && typeof file === "string") {
        const fileTrimmed = file.trim();
        if (fileTrimmed.startsWith("http") || fileTrimmed.startsWith("base64://") || fileTrimmed.startsWith("file:")) {
          imageUrl = fileTrimmed;
        }
      }
      
      const info: string[] = [];
      if (imageUrl) {
        info.push(imageUrl);
      }
      if (summary) {
        info.push(summary);
      }
      if (subType !== undefined) {
        info.push(`类型:${subType}`);
      }
      if (fileSize) {
        info.push(`${(fileSize / 1024).toFixed(1)}KB`);
      }
      
      if (info.length > 0) {
        resolvedText += ` [图片：${info.join(", ")}] `;
      } else {
        resolvedText += " [图片] ";
      }
    }
    else if (seg.type === "video") {
      // 视频消息 - 保留完整信息
      const url = seg.data?.url || seg.data?.file;
      const thumb = seg.data?.thumb;  // 缩略图
      const fileSize = seg.data?.file_size;
      
      const info: string[] = [];
      if (url && (url.startsWith("http") || url.startsWith("base64://") || url.startsWith("file:"))) {
        info.push(url);
      }
      if (thumb) {
        info.push(`缩略图:${thumb}`);
      }
      if (fileSize) {
        info.push(`${(fileSize / 1024 / 1024).toFixed(1)}MB`);
      }
      
      if (info.length > 0) {
        resolvedText += ` [视频：${info.join(", ")}] `;
      } else {
        resolvedText += " [视频消息] ";
      }
    }
    else if (seg.type === "file") {
      // 文件消息 - 保留完整信息
      const fileName = seg.data?.name || seg.data?.file || "文件";
      const fileId = seg.data?.file_id;
      const fileSize = seg.data?.file_size;
      const url = seg.data?.url || seg.data?.path;
      
      const info: string[] = [fileName];
      if (fileId) {
        info.push(`ID:${fileId}`);
      }
      if (fileSize) {
        info.push(`${(fileSize / 1024).toFixed(1)}KB`);
      }
      if (url && (url.startsWith("http") || url.startsWith("file:"))) {
        info.push(`URL:${url}`);
      }
      
      resolvedText += ` [文件：${info.join(", ")}] `;
    }
    else if (seg.type === "reply") {
      // 回复消息 - 保留完整信息
      const replyId = seg.data?.id ?? seg.data?.message_id;
      resolvedText += replyId ? ` [回复消息 ID:${replyId}] ` : " [回复消息] ";
    }
    else if (seg.type === "dice") {
      // 骰子 - 保留结果
      const result = seg.data?.result ?? seg.data?.value;
      resolvedText += result ? ` [骰子：${result}点] ` : " [骰子] ";
    }
    else if (seg.type === "rps") {
      // 石头剪刀布 - 保留结果
      const result = seg.data?.result ?? seg.data?.value;
      const resultMap: Record<string, string> = { "1": "石头", "2": "剪刀", "3": "布" };
      resolvedText += result ? ` [猜拳：${resultMap[result] || result}] ` : " [猜拳] ";
    }
    else if (seg.type === "poke" || seg.type === "shake") {
      // 戳一戳 - 支持多种字段名
      const pokeType = seg.data?.type;
      const pokeId = seg.data?.id;
      const userId = seg.data?.user_id;
      const targetId = seg.data?.target_id;
      
      const info: string[] = [];
      if (pokeType) info.push(`类型:${pokeType}`);
      if (pokeId) info.push(`ID:${pokeId}`);
      if (userId) info.push(`user_id:${userId}`);
      if (targetId) info.push(`target:${targetId}`);
      
      if (info.length > 0) {
        resolvedText += ` [戳一戳：${info.join(", ")}] `;
      } else {
        resolvedText += " [戳一戳] ";
      }
    }
    else if (seg.type === "json") {
      // JSON 卡片消息 - 尝试解析内容
      const jsonData = seg.data?.data;
      if (typeof jsonData === "string") {
        try {
          const parsed = JSON.parse(jsonData);
          const title = parsed?.title || parsed?.prompt || "";
          const desc = parsed?.desc || "";
          if (title || desc) {
            resolvedText += ` [卡片：${title}${desc ? " - " + desc : ""}] `;
          } else {
            resolvedText += " [JSON 卡片消息] ";
          }
        } catch {
          resolvedText += " [JSON 卡片消息] ";
        }
      } else if (jsonData) {
        resolvedText += " [JSON 卡片消息] ";
      } else {
        resolvedText += " [卡片消息] ";
      }
    }
    else if (seg.type === "xml") {
      // XML 卡片消息
      const xmlData = seg.data?.data;
      resolvedText += xmlData ? " [XML 卡片消息] " : " [卡片消息] ";
    }
    else if (seg.type === "music") {
      // 音乐分享 - 保留完整信息
      const type = seg.data?.type;
      const title = seg.data?.title;
      const singer = seg.data?.singer;
      
      const info: string[] = [];
      if (title) info.push(title);
      if (singer) info.push(singer);
      if (type && type !== "custom") info.push(`平台:${type}`);
      
      if (info.length > 0) {
        resolvedText += ` [音乐：${info.join(" - ")}] `;
      } else {
        resolvedText += " [音乐分享] ";
      }
    }
    else if (seg.type === "forward") {
      // 转发消息 - 尝试获取并解析内容
      const forwardId = seg.data?.id;
      const content = seg.data?.content;
      
      if (content && Array.isArray(content)) {
        // 已有内容，直接解析
        resolvedText += "\n[转发消息]:";
        for (const m of content.slice(0, 10)) {
          const senderName = m?.sender?.nickname || m?.sender?.card || m?.user_id || "unknown";
          const msgContent = Array.isArray(m?.message) ? m.message : m?.content || m?.raw_message || "";
          const text = await resolveMessageText(msgContent, client, groupId, cfg);
          resolvedText += `\n${senderName}: ${text}`;
        }
      } else if (forwardId && client) {
        // 需要获取转发消息内容
        try {
          const forwardData = await client.sendAction("get_forward_msg", { message_id: forwardId });
          const nodes = forwardData?.messages || forwardData?.message || forwardData?.nodes || [];
          
          if (nodes && nodes.length > 0) {
            resolvedText += "\n[转发消息]:";
            for (const m of nodes.slice(0, 10)) {
              const senderName = m?.sender?.nickname || m?.sender?.card || m?.user_id || "unknown";
              const msgContent = Array.isArray(m?.message) ? m.message : m?.content || m?.raw_message || "";
              const text = await resolveMessageText(msgContent, client, groupId, cfg);
              resolvedText += `\n${senderName}: ${text}`;
            }
          } else {
            resolvedText += ` [转发消息 ID:${forwardId}] `;
          }
        } catch (e) {
          console.log('[Parser] 获取转发消息失败:', e);
          resolvedText += ` [转发消息 ID:${forwardId}] `;
        }
      } else {
        resolvedText += " [转发消息] ";
      }
    }
    else if (seg.type === "node") {
      // 合并转发节点 - 递归解析节点内容
      const content = seg.data?.content;
      const sender = seg.data?.sender || seg.data?.user_id;
      
      if (content) {
        resolvedText += ` [合并转发节点] `;
      } else if (sender) {
        resolvedText += ` [合并转发节点 from:${sender}] `;
      } else {
        resolvedText += " [合并转发] ";
      }
    }
    else if (seg.type === "node") {
      // 合并转发节点
      const content = seg.data?.content;
      if (content) {
        resolvedText += ` [合并转发节点] `;
      } else {
        resolvedText += " [合并转发] ";
      }
    }
    else if (seg.type === "text") {
      // 文本消息（兜底）
      resolvedText += seg.data?.text || "";
    }
    else if (seg.type === "markdown") {
      // Markdown 消息
      const content = seg.data?.content;
      if (content) {
        resolvedText += ` [Markdown:${content.substring(0, 50)}${content.length > 50 ? '...' : ''}] `;
      } else {
        resolvedText += " [Markdown 消息] ";
      }
    }
    else if (seg.type === "contact") {
      // 分享联系人
      const contactType = seg.data?.type;  // qq / group
      const contactId = seg.data?.id;
      resolvedText += ` [分享联系人：${contactType}:${contactId}] `;
    }
    else if (seg.type === "location") {
      // 分享位置
      const title = seg.data?.title;
      const content = seg.data?.content;
      const lat = seg.data?.lat;
      const lon = seg.data?.lon;
      const info: string[] = [];
      if (title) info.push(title);
      if (content) info.push(content);
      if (lat !== undefined && lon !== undefined) info.push(`${lat},${lon}`);
      resolvedText += ` [位置：${info.join(' - ') || '未知'}] `;
    }
    else if (seg.type === "share") {
      // 分享链接
      const url = seg.data?.url;
      const title = seg.data?.title;
      const content = seg.data?.content;
      const info: string[] = [];
      if (title) info.push(title);
      if (content) info.push(content);
      if (url) info.push(url);
      resolvedText += ` [链接：${info.join(' - ') || '未知'}] `;
    }
    else if (seg.type === "miniapp") {
      // 小程序
      const title = seg.data?.title;
      resolvedText += ` [小程序：${title || '未知'}] `;
    }
    else if (seg.type === "giphy") {
      // Giphy 动图
      resolvedText += " [动图] ";
    }
    else if (seg.type === "tts") {
      // 文本转语音
      const text = seg.data?.text;
      resolvedText += text ? ` [TTS:${text}] ` : " [TTS 语音] ";
    }
    else if (seg.type === "unknown" || seg.type === undefined) {
      // 完全未知的消息
      resolvedText += " [未知消息] ";
    }
    else {
      // 其他未支持的消息类型
      resolvedText += ` [未支持消息类型:${seg.type}] `;
    }
  }
  
  return resolvedText.trim();
}

/**
 * 提取回复信息
 */
export function extractReplyInfo(elements: any[]): { messageId?: string | number } | null {
  if (!Array.isArray(elements)) return null;
  
  for (const el of elements) {
    if (el.type === "reply") {
      return { messageId: el.data?.id || el.data?.message_id };
    }
  }
  
  return null;
}

/**
 * 提取表情信息
 */
export function extractFaceInfo(elements: any[]): Array<{ faceId: string }> {
  if (!Array.isArray(elements)) return [];
  const faces: Array<{ faceId: string }> = [];
  
  for (const el of elements) {
    if (el.type === "face") {
      faces.push({ faceId: el.data?.id || "0" });
    }
  }
  
  return faces;
}

/**
 * 清理 CQ 码（用于显示）
 */
export function cleanCQCodes(text: string | undefined): string {
  if (!text) return "";
  
  let result = text;
  
  // 替换表情（带 ID）
  result = result.replace(/\[CQ:face,id=(\d+)\]/g, (_match, id) => {
    return `[表情：${id}]`;
  });
  
  // 替换@（带 QQ 号）
  result = result.replace(/\[CQ:at,qq=(\d+)\]/g, (_match, qq) => {
    if (qq === "all") return "[@全体成员]";
    return `[@${qq}]`;
  });
  
  // 替换其他 CQ 码
  result = result.replace(/\[CQ:[^\]]+\]/g, (m) => {
    if (m.startsWith("[CQ:image")) return "[图片]";
    if (m.startsWith("[CQ:record")) return "[语音]";
    if (m.startsWith("[CQ:video")) return "[视频]";
    if (m.startsWith("[CQ:file")) return "[文件]";
    if (m.startsWith("[CQ:at")) return "[@]";
    if (m.startsWith("[CQ:face")) return "[表情]";
    return "";
  });
  
  return result.trim();
}

/**
 * 表情 ID 转名称映射（完整 QQ 表情对照表）
 * 来源：/home/pagurian/.openclaw/workspace/projects/openclaw-napcat-channel/qq 表情 id 含义对照表.json
 */
const FACE_MAP: Record<string, string> = {
  // 经典表情
  "4": "得意", "5": "流泪", "8": "睡", "9": "大哭", "10": "尴尬",
  "12": "调皮", "14": "微笑", "16": "酷", "21": "可爱", "23": "傲慢",
  "24": "饥饿", "25": "困", "26": "惊恐", "27": "流汗", "28": "憨笑",
  "29": "悠闲", "30": "奋斗", "32": "疑问", "33": "嘘", "34": "晕",
  "38": "敲打", "39": "再见", "41": "发抖", "42": "爱情", "43": "跳跳",
  "49": "拥抱", "53": "蛋糕", "60": "咖啡", "63": "玫瑰", "66": "爱心",
  "74": "太阳", "75": "月亮", "76": "赞", "78": "握手", "79": "胜利",
  "85": "飞吻", "89": "西瓜", "96": "冷汗", "97": "擦汗", "98": "抠鼻",
  "99": "鼓掌", "100": "糗大了", "101": "坏笑", "102": "左哼哼",
  "103": "右哼哼", "104": "哈欠", "106": "委屈", "109": "左亲亲",
  "111": "可怜", "116": "示爱", "118": "抱拳", "120": "拳头",
  "122": "爱你", "123": "NO", "124": "OK", "125": "转圈", "129": "挥手",
  "144": "喝彩", "147": "棒棒糖", "171": "茶", "173": "泪奔",
  "174": "无奈", "175": "卖萌", "176": "小纠结", "179": "doge",
  "180": "惊喜", "181": "骚扰", "182": "笑哭", "183": "我最美",
  "201": "点赞", "203": "托脸", "212": "托腮", "214": "啵啵",
  "219": "蹭一蹭", "222": "抱抱", "227": "拍手", "232": "佛系",
  "240": "喷脸", "243": "甩头", "246": "加油抱抱", "262": "脑阔疼",
  "264": "捂脸", "265": "辣眼睛", "266": "哦哟", "267": "头秃",
  "268": "问号脸", "269": "暗中观察", "270": "emm", "271": "吃瓜",
  "272": "呵呵哒", "273": "我酸了", "277": "汪汪", "278": "汗",
  "281": "无眼笑", "282": "敬礼", "284": "面无表情", "285": "摸鱼",
  "287": "哦", "289": "睁眼", "290": "敲开心", "293": "摸锦鲤",
  "294": "期待", "297": "拜谢", "298": "元宝", "299": "牛啊",
  "305": "右亲亲", "306": "牛气冲天", "307": "喵喵", "314": "仔细分析",
  "315": "加油", "318": "崇拜", "319": "比心", "320": "庆祝",
  "322": "拒绝", "324": "吃糖", "326": "生气",
  // Unicode 表情
  "9728": "晴天", "9749": "咖啡", "9786": "可爱", "10024": "闪光",
  "10060": "错误", "10068": "问号", "127801": "玫瑰", "127817": "西瓜",
  "127822": "苹果", "127827": "草莓", "127836": "拉面", "127838": "面包",
  "127847": "刨冰", "127866": "啤酒", "127867": "干杯", "127881": "庆祝",
  "128027": "虫", "128046": "牛", "128051": "鲸鱼", "128053": "猴",
  "128074": "拳头", "128076": "好的", "128077": "厉害", "128079": "鼓掌",
  "128089": "内衣", "128102": "男孩", "128104": "爸爸", "128147": "爱心",
  "128157": "礼物", "128164": "睡觉", "128166": "水", "128168": "吹气",
  "128170": "肌肉", "128235": "邮箱", "128293": "火", "128513": "呲牙",
  "128514": "激动", "128516": "高兴", "128522": "嘿嘿", "128524": "羞涩",
  "128527": "哼哼", "128530": "不屑", "128531": "汗", "128532": "失落",
  "128536": "飞吻", "128538": "亲亲", "128540": "淘气", "128541": "吐舌",
  "128557": "大哭", "128560": "紧张", "128563": "瞪眼",
};

/**
 * 获取表情名称
 * @param faceId 表情 ID
 * @returns 表情名称，如果找不到则返回"未知表情{ID}"
 */
export function getFaceName(faceId: string): string {
  return FACE_MAP[faceId] || `未知表情${faceId}`;
}
