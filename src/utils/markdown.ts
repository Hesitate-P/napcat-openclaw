/**
 * Markdown 转纯文本工具
 * 
 * 将 Markdown 格式转换为 QQ 可显示的纯文本格式
 * 因为 QQ 不支持原生 Markdown 渲染
 */

/**
 * 将 Markdown 转换为 QQ 友好的纯文本
 */
export function markdownToPlainText(md: string): string {
  if (!md || typeof md !== 'string') {
    return '';
  }

  let text = md;

  // ========== 代码块处理 ==========
  // 多行代码块 ```code``` → 保留格式，添加标识
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const langText = lang ? `[${lang}]` : '';
    return `\n${langText}\n${code.trim()}\n`;
  });

  // 单行代码 `code` → 用【】包裹
  text = text.replace(/`([^`]+)`/g, '【$1】');

  // ========== 标题处理 ==========
  // # 标题 → 用【】或加粗标识
  text = text.replace(/^######\s+(.+)$/gm, '【$1】');
  text = text.replace(/^#####\s+(.+)$/gm, '【$1】');
  text = text.replace(/^####\s+(.+)$/gm, '【$1】');
  text = text.replace(/^###\s+(.+)$/gm, '【$1】');
  text = text.replace(/^##\s+(.+)$/gm, '【$1】');
  text = text.replace(/^#\s+(.+)$/gm, '【$1】');

  // ========== 粗体和斜体 ==========
  // **bold** 或 __bold__ → 保留文字
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  
  // *italic* 或 _italic_ → 保留文字
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  
  // ~~strikethrough~~ → 保留文字
  text = text.replace(/~~([^~]+)~~/g, '$1');

  // ========== 链接处理 ==========
  // [text](url) → text (url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
  
  // 自动链接 <url> → url
  text = text.replace(/<([^>]+)>/g, '$1');

  // ========== 图片处理 ==========
  // ![alt](url) → [图片：alt]
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[图片：$1]');

  // ========== 引用处理 ==========
  // > quote → 用「」包裹
  text = text.replace(/^>\s*(.+)$/gm, '「$1」');

  // ========== 列表处理 ==========
  // 无序列表 - * + → 用 • 替代
  text = text.replace(/^[\-\*\+]\s+(.+)$/gm, '• $1');
  
  // 有序列表 1. 2. → 保留数字
  text = text.replace(/^\d+\.\s+(.+)$/gm, '$1');

  // ========== 表格处理 ==========
  // 表格行 | col1 | col2 | → 删除 | 符号，保留内容
  text = text.replace(/^\|(.+)\|$/gm, '$1');
  // 表格分隔符 |---|---| 或 | :---: | → 完全删除整行
  text = text.replace(/^\|[\-\s:|]+\|$/gm, '');
  // 清理残留的 | 符号（表格单元格分隔符）
  text = text.replace(/\s*\|\s*/g, ' | ');

  // ========== 水平线处理 ==========
  // --- *** ___ → 完全删除（包括前后空行，避免 QQ 显示错误）
  text = text.replace(/\n?^[\-\*_]{3,}$\n?/gm, '');
  
  // 清理连续 3 个以上的空行（水平线删除后可能留下）
  text = text.replace(/\n{3,}/g, '\n\n');

  // ========== 清理多余空行 ==========
  // 连续 3 个以上空行 → 最多 2 个
  text = text.replace(/\n{3,}/g, '\n\n');

  // ========== 清理首尾空白 ==========
  text = text.trim();

  return text;
}

/**
 * 检查文本是否包含 Markdown 语法（增强版）
 * 即使是不完整的 Markdown 片段也会检测出来（用于 Block Streaming 场景）
 */
export function containsMarkdown(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const mdPatterns = [
    /\*\*[^*]*\*\*?/,        // 粗体 **text 或 **text
    /__[^_]*__?/,            // 粗体 __text 或 __text
    /\*[^*]*\*?/,            // 斜体 *text 或 *text
    /_[^_]*_?/,              // 斜体 _text 或 _text
    /~~[^~]*~~?/,            // 删除线
    /`[^`]*`?/,              // 行内代码
    /```/,                    // 代码块开始
    /^#{1,6}\s*/,            // 标题（即使没有内容）
    /^\|.*\|?/,              // 表格行（即使不完整）
    /^\|?[-:]+\|?/,          // 表格分隔线
    /\[([^\]]*)\]\(?/,       // 链接（即使不完整）
    /!\[([^\]]*)\]\(?/,      // 图片（即使不完整）
    /^>\s*/,                 // 引用
    /^[\-\*\+]\s+/,          // 无序列表
    /^\d+\.\s+/,             // 有序列表
    /^[\-\*_]{3,}$/,         // 水平线
  ];

  return mdPatterns.some(pattern => pattern.test(text));
}

/**
 * 智能转换：如果包含 Markdown 则转换，否则保持原样
 */
export function smartFormat(text: string): string {
  if (containsMarkdown(text)) {
    console.log('[Markdown] 检测到 Markdown 格式，正在转换...');
    return markdownToPlainText(text);
  }
  return text;
}
