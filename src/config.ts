/**
 * 配置管理模块
 * 
 * 提供配置验证和类型定义
 * 参考旧 qq 插件实现 Dashboard 表单中文解释
 */

import { z } from "zod";

/**
 * 配置工具函数（参考 qq 插件）
 */
const normalizeLooseString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeLooseString(item))
      .filter((item): item is string => Boolean(item && item.trim().length > 0))
      .join(",");
  }
  if (typeof value === "object") {
    const values = Object.values(value as Record<string, unknown>);
    return values
      .map((item) => normalizeLooseString(item))
      .filter((item): item is string => Boolean(item && item.trim().length > 0))
      .join(",");
  }
  return String(value).trim();
};

const NumberInputSchema = (defaultValue: number) => z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return value;
  const normalized = normalizeLooseString(value);
  if (!normalized) return undefined;
  const cleaned = normalized.replace(/^"|"$|^'|'$/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().default(defaultValue));

const BooleanInputSchema = (defaultValue: boolean) => z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const normalized = normalizeLooseString(value)?.toLowerCase().trim();
  if (!normalized) return undefined;
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return value;
}, z.boolean().default(defaultValue));

const KeywordTriggersSchema = z.preprocess((value) => {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeLooseString(item) ?? "")
      .map((item) => item.replace(/^"|"$|^'|'$/g, "").trim())
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((item) => normalizeLooseString(item) ?? "")
      .map((item) => item.replace(/^"|"$|^'|'$/g, "").trim())
      .filter(Boolean)
      .join(", ");
  }
  return String(value).replace(/^"|"$|^'|'$/g, "").trim();
}, z.string().default(""));

const IdListStringSchema = z.preprocess((value) => {
  const normalized = normalizeLooseString(value);
  if (normalized === undefined) return undefined;
  return normalized.replace(/^"|"$|^'|'$/g, "").trim();
}, z.string().default(""));

/**
 * NapCat 配置 Schema
 * 注意：这些配置会在 OpenClaw Dashboard 中显示为表单
 * 使用嵌套对象组织配置，提高可读性
 * 使用 .describe() 添加中文解释
 * 使用 .meta() 添加 uiHints 用于 Dashboard 分组和标签
 */
export const NapCatConfigSchema = z.object({
  // ========== 连接配置 ==========
  connection: z.object({
    wsUrl: z.preprocess((value) => normalizeLooseString(value), z.string())
      .describe("NapCat WebSocket 地址。示例：ws://127.0.0.1:3001")
      .meta({ uiHint: { placeholder: "ws://127.0.0.1:3001" } }),
    accessToken: z.preprocess((value) => normalizeLooseString(value), z.string())
      .describe("NapCat 访问令牌（Token）。需与 NapCat/OneBot 配置一致，没有可留空。")
      .meta({ uiHint: { sensitive: true } }),
  }).describe("连接配置"),
  
  // ========== 消息发送配置 ==========
  messaging: z.object({
    blockStreaming: BooleanInputSchema(true)
      .describe("启用 Block Streaming 分块发送。开启后长消息会自动分段发送，避免单次消息过长被 QQ 风控。"),
    textChunkLimit: NumberInputSchema(2000)
      .describe("文本分块字符数限制。每条消息的最大字符数，超出后自动分割。推荐值：1500-2500。"),
    chunkMode: z.preprocess((value) => normalizeLooseString(value), z.string())
      .describe("分块模式：length=按固定长度分割；newline=按换行符分割（推荐）；paragraph=按段落分割。"),
  }).describe("消息发送配置"),
  
  // ========== 输入状态配置 ==========
  typing: z.object({
    enabled: BooleanInputSchema(true)
      .describe("启用输入状态显示。开启后，当有鱼喵正在思考回复时，会显示'输入中'状态。"),
    privateChat: z.preprocess((value) => normalizeLooseString(value), z.string())
      .describe("私聊输入状态方式：api=使用 QQ 原生输入状态 API（推荐）；none=不显示输入状态。"),
    groupChat: z.preprocess((value) => normalizeLooseString(value), z.string())
      .describe("群聊输入状态方式：nickname=临时修改群名片添加'（输入中）'后缀（推荐）；none=不显示输入状态。"),
    nicknameSuffix: z.preprocess((value) => normalizeLooseString(value), z.string())
      .describe("群名片后缀。群聊输入状态时添加到群名片后的后缀文本。示例：（输入中）")
      .meta({ uiHint: { placeholder: "（输入中）" } }),
    delayMs: NumberInputSchema(500)
      .describe("输入状态延迟（毫秒）。收到消息后延迟多久显示输入状态。设置太短会闪烁，推荐 300-800。"),
  }).describe("输入状态配置"),
  
  // ========== 数据库配置 ==========
  database: z.object({
    type: z.preprocess((value) => normalizeLooseString(value), z.string())
      .describe("数据库类型。目前仅支持 sqlite。"),
    path: z.preprocess((value) => normalizeLooseString(value), z.string())
      .describe("数据库文件路径。SQLite 数据库文件的保存路径，相对于 napcat 插件目录。示例：./napcat.db")
      .meta({ uiHint: { placeholder: "./napcat.db" } }),
  }).describe("数据库配置"),
  
  // ========== 触发配置 ==========
  trigger: z.object({
    enabled: BooleanInputSchema(true)
      .describe("启用触发判断。开启后只有满足条件（被@、戳一戳、关键词）的消息才会触发回复。关闭后所有消息都会触发。"),
    atBot: BooleanInputSchema(true)
      .describe("被@时触发。开启后，在群里@机器人会触发回复。"),
    keywords: KeywordTriggersSchema
      .describe("触发关键词列表（逗号分隔）。命中关键词时触发回复（即使没有被@）。示例：有鱼喵，猫猫，bot，助手")
      .meta({ uiHint: { placeholder: "有鱼喵，猫猫，bot" } }),
  }).describe("触发配置"),
  
  // ========== 上下文配置 ==========
  context: z.object({
    enabled: BooleanInputSchema(true)
      .describe("启用自动上下文。开启后，当 agent 被唤醒时，会自动获取最近的群聊历史消息作为上下文。"),
    messageCount: NumberInputSchema(5)
      .describe("上下文消息数量。每次唤醒时自动获取最近 N 条历史消息。推荐值：3-10。"),
  }).describe("上下文配置"),
  
  // ========== 访问控制配置 ==========
  accessControl: z.object({
    enabled: BooleanInputSchema(false)
      .describe("启用访问控制。开启后，可以根据白名单/黑名单/管理员模式限制响应。"),
    groupWhitelist: IdListStringSchema
      .describe("允许响应的群号列表（逗号分隔）。留空表示响应所有群聊。示例：870560083,123456789")
      .meta({ uiHint: { placeholder: "870560083,123456789" } }),
    userBlacklist: IdListStringSchema
      .describe("屏蔽的用户 QQ 号列表（逗号分隔）。这些用户的消息不会触发回复。示例：111111,222222")
      .meta({ uiHint: { placeholder: "111111,222222" } }),
    adminMode: z.object({
      enabled: BooleanInputSchema(false)
        .describe("启用管理员模式。开启后，可以限制只有管理员才能触发回复。"),
      privateChat: BooleanInputSchema(false)
        .describe("私聊管理员模式。开启后，只有管理员的私聊消息才会触发回复。"),
      groupChat: BooleanInputSchema(false)
        .describe("群聊管理员模式。开启后，只有管理员的群消息才会触发回复。"),
    }).describe("管理员模式"),
  }).describe("访问控制配置"),
  
  // ========== 管理员配置 ==========
  admins: IdListStringSchema
    .describe("管理员 QQ 号（逗号分隔）。示例：3341299096,123456789。管理员可以使用特殊命令。")
    .meta({ uiHint: { placeholder: "3341299096,123456789" } }),
  
  // ========== 文件存储配置 ==========
  media: z.object({
    sharedHostDir: z.preprocess((value) => normalizeLooseString(value), z.string())
      .describe("宿主机共享媒体目录（可选）。如果使用 Docker 容器运行 NapCat，需要配置宿主机和容器共享的媒体目录。不使用可留空。"),
    sharedContainerDir: z.preprocess((value) => normalizeLooseString(value), z.string())
      .describe("容器内媒体目录。共享目录在 NapCat 容器内的挂载路径。默认 /openclaw_media。"),
  }).describe("媒体存储配置"),
});

export type NapCatConfig = z.infer<typeof NapCatConfigSchema>;

/**
 * 验证配置
 */
export function validateConfig(config: Partial<NapCatConfig>): { valid: boolean; errors: string[] } {
  const result = NapCatConfigSchema.safeParse(config);
  
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map(e => e.message),
    };
  }
  
  return { valid: true, errors: [] };
}

/**
 * 从嵌套配置转换为内部使用的结构（兼容旧代码）
 */
export function toNestedConfig(config: NapCatConfig): {
  typingIndicator: {
    enabled: boolean;
    privateChat: string;
    groupChat: string;
    nicknameSuffix: string;
    delayMs: number;
  };
  database: {
    type: string;
    path: string;
  };
  trigger: {
    enabled: boolean;
    atBot: boolean;
    keywords: string;
  };
  context: {
    enabled: boolean;
    messageCount: number;
  };
  accessControl: {
    enabled: boolean;
    groupWhitelist: string;
    userBlacklist: string;
    adminModeEnabled: boolean;
    adminModePrivateChat: boolean;
    adminModeGroupChat: boolean;
  };
  admins: string;
  connection: {
    wsUrl: string;
    accessToken: string;
  };
  messaging: {
    blockStreaming: boolean;
    textChunkLimit: number;
    chunkMode: string;
  };
  media: {
    sharedHostDir: string;
    sharedContainerDir: string;
  };
} {
  return {
    connection: config.connection || { wsUrl: '', accessToken: '' },
    messaging: config.messaging || { blockStreaming: true, textChunkLimit: 2000, chunkMode: 'newline' },
    typingIndicator: {
      enabled: config.typing?.enabled ?? true,
      privateChat: config.typing?.privateChat ?? 'api',
      groupChat: config.typing?.groupChat ?? 'nickname',
      nicknameSuffix: config.typing?.nicknameSuffix ?? '（输入中）',
      delayMs: config.typing?.delayMs ?? 500,
    },
    database: {
      type: config.database?.type ?? 'sqlite',
      path: config.database?.path ?? './napcat.db',
    },
    trigger: {
      enabled: config.trigger?.enabled ?? true,
      atBot: config.trigger?.atBot ?? true,
      keywords: config.trigger?.keywords ?? '有鱼喵，猫猫，bot',
    },
    context: {
      enabled: config.context?.enabled ?? true,
      messageCount: config.context?.messageCount ?? 5,
    },
    accessControl: {
      enabled: config.accessControl?.enabled ?? false,
      groupWhitelist: config.accessControl?.groupWhitelist ?? '',
      userBlacklist: config.accessControl?.userBlacklist ?? '',
      adminModeEnabled: config.accessControl?.adminMode?.enabled ?? false,
      adminModePrivateChat: config.accessControl?.adminMode?.privateChat ?? false,
      adminModeGroupChat: config.accessControl?.adminMode?.groupChat ?? false,
    },
    admins: config.admins ?? '',
    media: config.media || { sharedHostDir: '', sharedContainerDir: '/openclaw_media' },
  };
}
