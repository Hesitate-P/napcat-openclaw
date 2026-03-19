/**
 * 消息解析 - 唯一权威实现
 *
 * 将 OneBot/NapCat 消息元素数组解析为可读文本。
 * channel.ts、napcat-tools skill 统一使用本模块，不得再重复实现。
 */

// ============================================================================
// QQ 表情 ID 映射（在线获取 + 内存缓存）
// 数据来源：QFace https://koishi.js.org/QFace/assets/qq_emoji/_index.json
// ============================================================================

/** 内存缓存：ID → 描述 */
let faceMapCache: Record<string, string> | null = null;
let faceMapLoading: Promise<void> | null = null;

const QFACE_URL = 'https://koishi.js.org/QFace/assets/qq_emoji/_index.json';

/**
 * 异步加载表情映射表（仅加载一次，后续复用缓存）。
 * 模块加载时自动触发，无需手动调用。
 */
export function initFaceMap(): Promise<void> {
  if (faceMapCache) return Promise.resolve();
  if (faceMapLoading) return faceMapLoading;

  faceMapLoading = fetch(QFACE_URL)
    .then(r => r.json())
    .then((data: unknown) => {
      const arr = data as Array<{ emojiId: string; describe: string }>;
      const map: Record<string, string> = {};
      for (const item of arr) {
        if (item.emojiId && item.emojiId.match(/^\d+$/) && item.describe) {
          map[item.emojiId] = item.describe.replace(/^\//, '').trim();
        }
      }
      faceMapCache = map;
      console.log(`[FaceMap] 已加载 ${Object.keys(map).length} 个表情`);
    })
    .catch(err => {
      console.warn('[FaceMap] 在线加载失败，将显示表情ID：', err.message ?? err);
      faceMapCache = {}; // 标记为已尝试，避免反复重试
    });

  return faceMapLoading;
}

// 模块加载时立即触发（不阻塞）
initFaceMap();

function getFaceName(id: string): string {
  return (faceMapCache ?? {})[id] ?? `表情${id}`;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 提取文件名。
 * NapCat 私聊文件：data.file = 文件名（字符串）
 * NapCat 群文件通知解析后：data.file_name 或 data.name
 */
export function resolveFileName(data: Record<string, any>): string {
  return (
    (data.file_name || data.name || data.file || '')
      .toString()
      .trim()
  ) || (
    data.file_id
      ? `文件_${String(data.file_id).slice(0, 8)}`
      : '未知文件'
  );
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number | string | undefined): string {
  const n = Number(bytes);
  if (!n || isNaN(n)) return '';
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${n}B`;
}

/**
 * 提取所有图片 URL（用于 MediaUrls 字段）
 */
export function extractImageUrls(elements: any[]): string[] {
  if (!Array.isArray(elements)) return [];
  const urls: string[] = [];
  for (const seg of elements) {
    if (seg.type !== 'image') continue;
    const url = seg.data?.url || seg.data?.file;
    if (
      url &&
      (url.startsWith('http') ||
        url.startsWith('base64://') ||
        url.startsWith('file:'))
    ) {
      urls.push(url);
    }
  }
  return urls;
}

// ============================================================================
// 核心解析函数
// ============================================================================

/**
 * 将 OneBot 消息元素数组解析为可读文本字符串。
 *
 * @param elements   消息元素数组（来自 event.message）
 * @param client     NapCatClient 实例（可选，用于查询群成员昵称）
 * @param groupId    群号（可选）
 */
export async function resolveMessageText(
  elements: any[],
  client?: any,
  groupId?: number,
  _cfg?: any, // 兼容旧调用签名，未使用
): Promise<string> {
  if (!Array.isArray(elements) || elements.length === 0) return '';

  const parts: string[] = [];

  for (const seg of elements) {
    const d = seg.data ?? {};

    switch (seg.type) {
      // ── 文本 ──────────────────────────────────────────────────
      case 'text':
        parts.push(d.text ?? '');
        break;

      // ── @ ─────────────────────────────────────────────────────
      case 'at': {
        const qqId = d.qq ?? d.user_id;
        if (qqId === 'all' || qqId === 'everyone') {
          parts.push('@全体成员');
        } else if (groupId && client && qqId) {
          let name = String(qqId);
          try {
            const info = await client.sendAction('get_group_member_info', {
              group_id: groupId,
              user_id: Number(qqId),
            });
            name = info?.card || info?.nickname || name;
          } catch { /* ignore */ }
          parts.push(`@${name}`);
        } else {
          parts.push(`@${qqId ?? ''}`);
        }
        break;
      }

      // ── 表情 ──────────────────────────────────────────────────
      case 'face': {
        const faceId = String(d.id ?? d.face_id ?? '0');
        const name = getFaceName(faceId);
        if (d.result !== undefined) {
          parts.push(`[表情：${name}, 结果：${d.result}]`);
        } else if (d.chainCount) {
          parts.push(`[表情：${name}, 连续：${d.chainCount}个]`);
        } else {
          parts.push(`[表情：${name}]`);
        }
        break;
      }

      // ── 图片 ──────────────────────────────────────────────────
      case 'image': {
        const url = d.url || d.file;
        if (d.summary) {
          parts.push(`[图片：${d.summary}]`);
        } else if (url && (url.startsWith('http') || url.startsWith('base64://'))) {
          parts.push(`[图片：${url}]`);
        } else {
          parts.push('[图片]');
        }
        break;
      }

      // ── 文件 ──────────────────────────────────────────────────
      case 'file': {
        const fileName = resolveFileName(d);
        const fileId: string = d.file_id ?? '';
        const sizeStr = formatFileSize(d.file_size);
        const fileUrl = d.url || d.path || '';
        const meta: string[] = [fileName];
        if (sizeStr) meta.push(sizeStr);
        if (fileId) meta.push(`ID:${fileId}`);
        if (fileUrl) meta.push(`URL:${fileUrl}`);
        parts.push(`[文件：${meta.join(', ')}]`);
        break;
      }

      // ── 语音 ──────────────────────────────────────────────────
      case 'record': {
        const recUrl = d.url || (typeof d.file === 'string' && d.file.startsWith('http') ? d.file : '');
        const recSize = formatFileSize(d.file_size);
        const recMeta: string[] = [];
        if (recSize) recMeta.push(recSize);
        if (recUrl) recMeta.push(`URL:${recUrl}`);
        parts.push(recMeta.length ? `[语音：${recMeta.join(', ')}]` : '[语音]');
        break;
      }

      // ── 视频 ──────────────────────────────────────────────────
      case 'video': {
        const vidUrl = d.url || (typeof d.file === 'string' && d.file.startsWith('http') ? d.file : '');
        const vidSize = formatFileSize(d.file_size);
        const vidMeta: string[] = [];
        if (vidUrl) vidMeta.push(`URL:${vidUrl}`);
        if (vidSize) vidMeta.push(vidSize);
        parts.push(vidMeta.length ? `[视频：${vidMeta.join(', ')}]` : '[视频]');
        break;
      }

      // ── 商城表情 ───────────────────────────────────────────────
      case 'mface':
        parts.push(`[商城表情：${d.summary ?? `ID:${d.emoji_id}`}]`);
        break;

      // ── 回复 ──────────────────────────────────────────────────
      case 'reply': {
        const id = d.id ?? d.message_id;
        parts.push(id ? `[回复消息 ID:${id}]` : '[回复消息]');
        break;
      }

      // ── 转发 ──────────────────────────────────────────────────
      case 'forward':
        parts.push('[转发消息]');
        break;

      // ── 卡片消息 ───────────────────────────────────────────────
      case 'xml':
      case 'json':
        parts.push('[卡片消息]');
        break;

      // ── 骰子 ──────────────────────────────────────────────────
      case 'dice': {
        const result = d.result ?? d.value;
        parts.push(result ? `[骰子：${result}点]` : '[骰子]');
        break;
      }

      // ── 猜拳 ──────────────────────────────────────────────────
      case 'rps': {
        const result = d.result ?? d.value;
        const names: Record<string, string> = { '1': '石头', '2': '剪刀', '3': '布' };
        parts.push(result ? `[猜拳：${names[String(result)] ?? result}]` : '[猜拳]');
        break;
      }

      // ── 戳一戳 ─────────────────────────────────────────────────
      case 'poke':
      case 'shake':
        parts.push('[戳一戳]');
        break;

      // ── 音乐分享 ────────────────────────────────────────────────
      case 'music': {
        const title   = d.title   || d.music_title || '';
        const singer  = d.singer  || d.author      || '';
        const musicId = d.id      || '';
        const srcType = d.type    || 'qq';
        if (title)  parts.push(`[音乐：${title}${singer ? ' - ' + singer : ''}（${srcType}）]`);
        else if (musicId) parts.push(`[音乐 ID:${musicId}（${srcType}）]`);
        else        parts.push('[音乐分享]');
        break;
      }

      // ── 合并转发节点 ───────────────────────────────────────────
      case 'node': {
        // 转发节点可能携带 content（子消息列表）或仅有 id
        if (d.id) {
          parts.push(`[转发节点 ID:${d.id}]`);
        } else {
          const senderName = d.name || d.nickname || '未知';
          const subContent = Array.isArray(d.content)
            ? (await resolveMessageText(d.content, client, groupId)).slice(0, 50)
            : String(d.content ?? '');
          parts.push(`[${senderName}: ${subContent || '...'}]`);
        }
        break;
      }

      // ── 联系人分享 ─────────────────────────────────────────────
      case 'contact': {
        const contactType = d.type === 'group' ? '群聊' : '好友';
        const contactId   = d.id ?? '';
        parts.push(`[${contactType}名片 ID:${contactId}]`);
        break;
      }

      // ── 位置分享 ───────────────────────────────────────────────
      case 'location': {
        const title   = d.title   || '';
        const address = d.content || d.address || '';
        const lat     = d.lat     ?? '';
        const lon     = d.lon     ?? '';
        const desc    = [title, address].filter(Boolean).join('，');
        const coord   = lat && lon ? `(${lat},${lon})` : '';
        parts.push(`[位置：${desc || coord || '未知地址'}${coord && desc ? ' ' + coord : ''}]`);
        break;
      }

      // ── 链接分享 ───────────────────────────────────────────────
      case 'share': {
        const title   = d.title   || '';
        const url     = d.url     || '';
        const desc    = d.content || d.description || '';
        if (title && url) parts.push(`[分享：${title} ${url}]`);
        else if (url)     parts.push(`[分享：${url}]`);
        else if (title)   parts.push(`[分享：${title}${desc ? ' - ' + desc : ''}]`);
        else              parts.push('[链接分享]');
        break;
      }

      // ── 小程序 ─────────────────────────────────────────────────
      case 'miniapp': {
        // 小程序信息通常嵌套在 JSON 数据中
        let title = d.title || d.app_name || '';
        if (!title && d.data) {
          try {
            const inner = typeof d.data === 'string' ? JSON.parse(d.data) : d.data;
            title = inner?.meta?.detail_1?.title ||
                    inner?.meta?.news?.title     ||
                    inner?.prompt                ||
                    inner?.title                 || '';
          } catch { /* ignore */ }
        }
        parts.push(title ? `[小程序：${title}]` : '[小程序]');
        break;
      }

      // ── TTS 语音 ───────────────────────────────────────────────
      case 'tts': {
        const text = d.text || '';
        parts.push(text ? `[TTS 语音：${text}]` : '[TTS 语音]');
        break;
      }

      // ── Markdown ───────────────────────────────────────────────
      case 'markdown': {
        // 提取纯文本（去除 Markdown 标记符号）
        const raw = d.content || d.data || '';
        const plain = String(raw)
          .replace(/#{1,6}\s*/g, '')          // 标题
          .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')  // 粗体/斜体
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // 链接
          .replace(/`{1,3}[^`]*`{1,3}/g, '')  // 代码
          .replace(/\n+/g, ' ')
          .trim();
        parts.push(plain ? `[Markdown：${plain.slice(0, 100)}]` : '[Markdown 消息]');
        break;
      }

      // ── 未知类型：静默跳过 ─────────────────────────────────────
      default:
        break;
    }
  }

  return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * 同步版本（不解析 @ 昵称），用于不需要 client 的场景（如 napcat-tools）
 */
export function resolveMessageTextSync(elements: any[]): string {
  if (!Array.isArray(elements) || elements.length === 0) return '';

  const parts: string[] = [];

  for (const seg of elements) {
    const d = seg.data ?? {};
    switch (seg.type) {
      case 'text':   parts.push(d.text ?? ''); break;
      case 'at': {
        const qqId = d.qq ?? d.user_id;
        parts.push(qqId === 'all' || qqId === 'everyone' ? '@全体成员' : `@${qqId ?? ''}`);
        break;
      }
      case 'face': {
        const faceId = String(d.id ?? d.face_id ?? '0');
        parts.push(`[表情：${getFaceName(faceId)}]`);
        break;
      }
      case 'image': {
        const url = d.url || d.file;
        if (d.summary) parts.push(`[图片：${d.summary}]`);
        else if (url && url.startsWith('http')) parts.push(`[图片：${url}]`);
        else parts.push('[图片]');
        break;
      }
      case 'file': {
        const fileName = resolveFileName(d);
        const fileId: string = d.file_id ?? '';
        const sizeStr = formatFileSize(d.file_size);
        const fileUrl = d.url || d.path || '';
        const meta = [fileName, ...(sizeStr ? [sizeStr] : []), ...(fileId ? [`ID:${fileId}`] : []), ...(fileUrl ? [`URL:${fileUrl}`] : [])];
        parts.push(`[文件：${meta.join(', ')}]`);
        break;
      }
      case 'record': { const rUrl = d.url || (typeof d.file==='string' && d.file.startsWith('http')?d.file:''); parts.push(rUrl ? `[语音：URL:${rUrl}]` : '[语音]'); break; }
      case 'video':  { const vUrl = d.url || (typeof d.file==='string' && d.file.startsWith('http')?d.file:''); parts.push(vUrl ? `[视频：URL:${vUrl}]` : '[视频]'); break; }
      case 'mface':  parts.push(`[商城表情：${d.summary ?? `ID:${d.emoji_id}`}]`); break;
      case 'reply':  parts.push(`[回复消息 ID:${d.id ?? d.message_id ?? ''}]`); break;
      case 'forward': parts.push('[转发消息]'); break;
      case 'xml': case 'json': parts.push('[卡片消息]'); break;
      case 'dice': parts.push(`[骰子：${d.result ?? d.value ?? '?'}点]`); break;
      case 'rps':  parts.push(`[猜拳：${d.result ?? d.value ?? '?'}]`); break;
      case 'poke': case 'shake': parts.push('[戳一戳]'); break;
      case 'music': {
        const title = d.title || d.music_title || '';
        const singer = d.singer || d.author || '';
        const srcType = d.type || 'qq';
        parts.push(title ? `[音乐：${title}${singer ? ' - ' + singer : ''}（${srcType}）]` : '[音乐分享]');
        break;
      }
      case 'node': {
        const senderName = d.name || d.nickname || '未知';
        if (d.id) parts.push(`[转发节点 ID:${d.id}]`);
        else { const sub = String(d.content ?? '').slice(0, 50); parts.push(`[${senderName}: ${sub || '...'}]`); }
        break;
      }
      case 'contact': {
        const ct = d.type === 'group' ? '群聊' : '好友';
        parts.push(`[${ct}名片 ID:${d.id ?? ''}]`);
        break;
      }
      case 'location': {
        const title = d.title || '';
        const addr  = d.content || d.address || '';
        const lat   = d.lat ?? ''; const lon = d.lon ?? '';
        const desc  = [title, addr].filter(Boolean).join('，');
        parts.push(`[位置：${desc || `(${lat},${lon})`}]`);
        break;
      }
      case 'share': {
        const title = d.title || ''; const url = d.url || '';
        parts.push(title && url ? `[分享：${title} ${url}]` : url ? `[分享：${url}]` : '[链接分享]');
        break;
      }
      case 'miniapp': {
        let title = d.title || d.app_name || '';
        if (!title && d.data) {
          try { const inner = typeof d.data === 'string' ? JSON.parse(d.data) : d.data;
            title = inner?.meta?.detail_1?.title || inner?.meta?.news?.title || inner?.prompt || ''; } catch { /* */ }
        }
        parts.push(title ? `[小程序：${title}]` : '[小程序]');
        break;
      }
      case 'tts': parts.push(d.text ? `[TTS：${d.text}]` : '[TTS 语音]'); break;
      case 'markdown': {
        const raw = String(d.content || d.data || '');
        const plain = raw.replace(/#{1,6}\s*/g, '').replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`[^`]*`/g, '').replace(/\n+/g, ' ').trim();
        parts.push(plain ? `[Markdown：${plain.slice(0, 100)}]` : '[Markdown]');
        break;
      }
      default: break;
    }
  }

  return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
}
