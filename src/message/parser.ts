/**
 * 消息工具函数
 *
 * 本文件只提供：
 * - parseCQCode：CQ 码字符串解析
 * - extractImageUrls：重新导出（兼容现有 import）
 * - extractFileInfo：提取文件信息
 *
 * 消息元素→文本的解析统一使用 ../utils/message-resolver.ts 的 resolveMessageText。
 */

export { extractImageUrls, resolveFileName, formatFileSize } from '../utils/message-resolver.js';

// ============================================================================
// CQ 码解析
// ============================================================================

export interface CQElement {
  type: string;
  data: Record<string, string>;
}

/**
 * 解析 CQ 码字符串为消息元素数组。
 * 例："[CQ:at,qq=123]你好" → [{type:'at', data:{qq:'123'}}, {type:'text', data:{text:'你好'}}]
 */
export function parseCQCode(raw: string): CQElement[] {
  if (!raw) return [];

  const elements: CQElement[] = [];
  const pattern = /\[CQ:(\w+)(?:,([^\]]+))?\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(raw)) !== null) {
    // 前面的纯文本
    if (match.index > lastIndex) {
      const text = raw.slice(lastIndex, match.index);
      if (text) elements.push({ type: 'text', data: { text } });
    }

    // CQ 码本体
    const type = match[1];
    const paramStr = match[2] ?? '';
    const data: Record<string, string> = {};
    for (const kv of paramStr.split(',')) {
      const eqIdx = kv.indexOf('=');
      if (eqIdx > 0) {
        data[kv.slice(0, eqIdx).trim()] = kv.slice(eqIdx + 1);
      }
    }
    elements.push({ type, data });

    lastIndex = match.index + match[0].length;
  }

  // 尾部文本
  if (lastIndex < raw.length) {
    const text = raw.slice(lastIndex);
    if (text) elements.push({ type: 'text', data: { text } });
  }

  return elements;
}

// ============================================================================
// 文件信息提取
// ============================================================================

export interface FileInfo {
  file_name: string;
  file_id: string;
  file_size: number;
  url: string;
}

/**
 * 从消息元素数组中提取所有文件信息
 */
export function extractFileInfo(elements: any[]): FileInfo[] {
  if (!Array.isArray(elements)) return [];
  const result: FileInfo[] = [];

  for (const el of elements) {
    if (el.type !== 'file') continue;
    const d = el.data ?? {};
    const fileName =
      (d.file_name || d.name || d.file || '').toString().trim() ||
      (d.file_id ? `文件_${String(d.file_id).slice(0, 8)}` : '未知文件');
    result.push({
      file_name: fileName,
      file_id: d.file_id ?? '',
      file_size: Number(d.file_size) || 0,
      url: d.url ?? d.path ?? '',
    });
  }

  return result;
}
