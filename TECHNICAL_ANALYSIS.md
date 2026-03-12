# OpenClaw NapCat Channel 技术可行性分析

_版本：v0.2.0_  
_更新日期：2026-03-05_  
_更新人：有鱼喵 (Catsitate)_

---

## 📋 一、OpenClaw Plugin SDK 能力分析

### 1.1 Channel Plugin 完整接口

根据官方文档，Channel Plugin 可以实现以下接口：

#### 核心必需接口

| 接口 | 类型 | 描述 | 是否必需 |
|------|------|------|----------|
| `meta` | object | 频道元数据 (id/label/docsPath) | ✅ 必需 |
| `capabilities` | object | 能力声明 (chatTypes/media/threads) | ✅ 必需 |
| `config.listAccountIds` | function | 列出账号 ID | ✅ 必需 |
| `config.resolveAccount` | function | 解析账号配置 | ✅ 必需 |
| `outbound.deliveryMode` | string | 投递模式 (direct/streaming) | ✅ 必需 |
| `outbound.sendText` | function | 发送文本消息 | ✅ 必需 |

#### 可选扩展接口

| 接口 | 类型 | 描述 | 用途 |
|------|------|------|------|
| `setup.configure` | function | 配置向导 | 交互式配置 |
| `setup.configureInteractive` | function | 完整交互配置 | 覆盖配置流程 |
| `security.dmPolicy` | function | DM 安全策略 | 控制私聊行为 |
| `status.probeAccount` | function | 账号健康检查 | 诊断工具 |
| `gateway.startAccount` | function | 启动账号服务 | 长连接管理 |
| `gateway.logoutAccount` | function | 登出账号 | 清理资源 |
| `mentions.parse` | function | 解析提及 | @用户处理 |
| `threading.getThreadInfo` | function | 获取线程信息 | 会话管理 |
| **`streaming.sendBlocks`** | **function** | **分块流式发送** | **Telegram 风格** |
| `actions.deleteMessage` | function | 删除消息 | 消息操作 |
| `actions.editMessage` | function | 编辑消息 | 消息操作 |
| `commands.handle` | function | 处理命令 | 原生命令支持 |

### 1.2 关键能力验证

#### ✅ 可实现的能力

| 能力 | SDK 支持 | 实现方式 |
|------|---------|----------|
| **消息收发** | ✅ 完整支持 | `outbound.sendText` + WebSocket 接收 |
| **多媒体消息** | ✅ 支持 | `capabilities.media: true` + 文件处理 |
| **流式发送** | ✅ 支持 | `deliveryMode: "streaming"` + `sendBlocks` |
| **消息删除** | ✅ 支持 | `actions.deleteMessage` |
| **消息编辑** | ✅ 支持 | `actions.editMessage` |
| **会话管理** | ✅ 支持 | `threading` 接口 |
| **命令处理** | ✅ 支持 | `commands.handle` 或 `api.registerCommand` |
| **长连接** | ✅ 支持 | `gateway.startAccount` (常驻服务) |
| **健康检查** | ✅ 支持 | `status.probeAccount` |

#### ⚠️ 需要注意的限制

| 限制 | 说明 | 解决方案 |
|------|------|----------|
| **插件内联运行** | 插件与 Gateway 同进程 | 视为可信代码，注意内存管理 |
| **配置验证** | 使用 JSON Schema | 在 `openclaw.plugin.json` 中定义 |
| **消息格式** | 需适配 OpenClaw 统一格式 | 实现 `InboundMessage` 转换器 |
| **会话键** | 需遵循 OpenClaw 规范 | `channel:account:peer` 格式 |

---

## 📦 二、Block Streaming 机制实现

### 2.1 Telegram Channel 的 Block Streaming

Telegram 的 block streaming 特性：
- **分条发送**: 长消息自动分割成多条
- **分批发送**: 控制发送节奏，避免刷屏
- **流式输出**: 支持打字状态/进度指示
- **消息队列**: 有序发送，避免乱序

### 2.2 OpenClaw Block Streaming 接口

根据 Plugin SDK 文档，实现流式发送需要：

```typescript
// 1. 声明支持 streaming
const plugin = {
  meta: {
    id: "napcat",
    label: "NapCat QQ",
    // ...
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    streaming: true,  // 声明支持流式
  },
  outbound: {
    deliveryMode: "streaming",  // 或 "direct"
    
    // 基础发送 (fallback)
    sendText: async ({ text, to, accountId }) => {
      return { ok: true, messageId: "..." };
    },
    
    // 流式分块发送 (核心)
    sendBlocks: async ({ blocks, to, accountId, options }) => {
      // blocks: Array<{ type: "text"|"image"|"file", content: any }>
      // options: { typing?: boolean, delay?: number }
    },
  },
};
```

### 2.3 Block Streaming 完整实现

```typescript
// src/streaming/block-sender.ts

export interface MessageBlock {
  type: "text" | "image" | "file" | "emoji";
  content: string | any;
  metadata?: {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  };
}

export interface BlockSenderOptions {
  typing?: boolean;           // 显示打字状态
  delayBetweenBlocks?: number; // 块间延迟 (ms)
  maxBlockSize?: number;       // 最大块大小 (字符)
  rateLimit?: number;          // 速率限制 (ms/条)
}

export class BlockSender {
  private client: NapCatClient;
  private queue: MessageBlock[] = [];
  private isProcessing = false;
  
  constructor(client: NapCatClient) {
    this.client = client;
  }
  
  /**
   * 分块发送消息
   */
  async sendBlocks(
    to: string,
    blocks: MessageBlock[],
    options: BlockSenderOptions = {}
  ): Promise<SendResult[]> {
    const {
      typing = true,
      delayBetweenBlocks = 1000,
      maxBlockSize = 2000,
      rateLimit = 1000,
    } = options;
    
    const results: SendResult[] = [];
    
    // 1. 显示打字状态 (可选)
    if (typing) {
      await this.showTyping(to);
    }
    
    // 2. 分割过大的文本块
    const processedBlocks = await this.processBlocks(blocks, maxBlockSize);
    
    // 3. 逐块发送
    for (let i = 0; i < processedBlocks.length; i++) {
      const block = processedBlocks[i];
      
      try {
        // 发送前延迟 (避免刷屏)
        if (i > 0) {
          await this.sleep(delayBetweenBlocks);
        }
        
        // 发送块
        const result = await this.sendBlock(to, block);
        results.push(result);
        
        // 速率限制
        if (i < processedBlocks.length - 1) {
          await this.sleep(rateLimit);
        }
      } catch (error) {
        console.error(`[BlockSender] 发送块 ${i} 失败:`, error);
        results.push({
          ok: false,
          error: error.message,
          blockIndex: i,
        });
        
        // 严重错误时停止发送
        if (this.isCriticalError(error)) {
          break;
        }
      }
    }
    
    return results;
  }
  
  /**
   * 处理块 (分割过大的文本)
   */
  private async processBlocks(
    blocks: MessageBlock[],
    maxBlockSize: number
  ): Promise<MessageBlock[]> {
    const processed: MessageBlock[] = [];
    
    for (const block of blocks) {
      if (block.type === "text" && typeof block.content === "string") {
        // 分割长文本
        const textBlocks = this.splitLongText(
          block.content,
          maxBlockSize
        );
        
        for (const text of textBlocks) {
          processed.push({
            type: "text",
            content: text,
            metadata: block.metadata,
          });
        }
      } else {
        processed.push(block);
      }
    }
    
    return processed;
  }
  
  /**
   * 分割长文本 (智能分割)
   */
  private splitLongText(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) {
      return [text];
    }
    
    const chunks: string[] = [];
    let remaining = text;
    
    while (remaining.length > maxLen) {
      // 优先在段落处分割
      let cutPos = remaining.lastIndexOf("\n\n", maxLen);
      
      // 其次在句子处分割
      if (cutPos === -1 || cutPos < maxLen * 0.5) {
        cutPos = remaining.lastIndexOf(".", maxLen);
      }
      
      // 再次在空格处分割
      if (cutPos === -1 || cutPos < maxLen * 0.5) {
        cutPos = remaining.lastIndexOf(" ", maxLen);
      }
      
      // 强制分割
      if (cutPos === -1 || cutPos < maxLen * 0.3) {
        cutPos = maxLen;
      }
      
      chunks.push(remaining.slice(0, cutPos).trim());
      remaining = remaining.slice(cutPos).trimStart();
    }
    
    if (remaining) {
      chunks.push(remaining);
    }
    
    return chunks;
  }
  
  /**
   * 发送单个块
   */
  private async sendBlock(
    to: string,
    block: MessageBlock
  ): Promise<SendResult> {
    switch (block.type) {
      case "text":
        return this.sendText(to, block.content as string);
      
      case "image":
        return this.sendImage(to, block.content);
      
      case "file":
        return this.sendFile(to, block.content, block.metadata);
      
      case "emoji":
        return this.sendEmoji(to, block.content as string);
      
      default:
        throw new Error(`不支持的块类型：${block.type}`);
    }
  }
  
  /**
   * 发送文本
   */
  private async sendText(to: string, text: string): Promise<SendResult> {
    const action = to.startsWith("group:") ? "send_group_msg" : "send_private_msg";
    const params = {
      [to.startsWith("group:") ? "group_id" : "user_id"]: parseInt(to.split(":")[1]),
      message: text,
    };
    
    const result = await this.client.sendAction(action, params);
    return {
      ok: true,
      messageId: result.message_id,
      type: "text",
    };
  }
  
  /**
   * 发送图片
   */
  private async sendImage(to: string, image: any): Promise<SendResult> {
    const action = to.startsWith("group:") ? "send_group_msg" : "send_private_msg";
    const params = {
      [to.startsWith("group:") ? "group_id" : "user_id"]: parseInt(to.split(":")[1]),
      message: [
        { type: "image", data: { file: image.url || image.file } }
      ],
    };
    
    const result = await this.client.sendAction(action, params);
    return {
      ok: true,
      messageId: result.message_id,
      type: "image",
    };
  }
  
  /**
   * 发送文件
   */
  private async sendFile(
    to: string,
    file: any,
    metadata?: { fileName?: string }
  ): Promise<SendResult> {
    if (to.startsWith("group:")) {
      // 群文件
      const groupId = parseInt(to.split(":")[1]);
      const result = await this.client.sendAction("upload_group_file", {
        group_id: groupId,
        file: file.url || file.file,
        name: metadata?.fileName || "file",
      });
      
      return {
        ok: true,
        messageId: result.file_id,
        type: "file",
      };
    } else {
      // 私聊文件
      const userId = parseInt(to.split(":")[1]);
      const result = await this.client.sendAction("upload_private_file", {
        user_id: userId,
        file: file.url || file.file,
        name: metadata?.fileName || "file",
      });
      
      return {
        ok: true,
        messageId: result.file_id,
        type: "file",
      };
    }
  }
  
  /**
   * 发送表情
   */
  private async sendEmoji(to: string, emojiId: string): Promise<SendResult> {
    const action = to.startsWith("group:") ? "send_group_msg" : "send_private_msg";
    const params = {
      [to.startsWith("group:") ? "group_id" : "user_id"]: parseInt(to.split(":")[1]),
      message: [
        { type: "face", data: { id: emojiId } }
      ],
    };
    
    const result = await this.client.sendAction(action, params);
    return {
      ok: true,
      messageId: result.message_id,
      type: "emoji",
    };
  }
  
  /**
   * 显示打字状态
   */
  private async showTyping(to: string): Promise<void> {
    if (!to.startsWith("group:")) {
      // 私聊打字状态
      await this.client.sendAction("set_input_status", {
        user_id: parseInt(to.split(":")[1]),
        event_type: 1, // 正在输入
      });
    }
    // 群聊暂不支持打字状态
  }
  
  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 判断是否是严重错误
   */
  private isCriticalError(error: Error): boolean {
    const criticalErrors = [
      "WebSocket not open",
      "Connection closed",
      "Authentication failed",
      "Rate limit exceeded",
    ];
    
    return criticalErrors.some(msg => error.message.includes(msg));
  }
}

interface SendResult {
  ok: boolean;
  messageId?: string;
  type?: string;
  error?: string;
  blockIndex?: number;
}
```

### 2.4 使用示例

```typescript
// 在 Channel 中使用 BlockSender

export const napcatChannel: ChannelPlugin = {
  id: "napcat",
  // ...
  outbound: {
    deliveryMode: "streaming",
    
    sendBlocks: async ({ blocks, to, accountId, options }) => {
      const client = getClientForAccount(accountId);
      const sender = new BlockSender(client);
      
      const results = await sender.sendBlocks(to, blocks, {
        typing: true,
        delayBetweenBlocks: 1000,
        rateLimit: 1000,
      });
      
      // 返回最后一条消息的 ID
      const lastSuccess = results.filter(r => r.ok).pop();
      return {
        ok: results.some(r => r.ok),
        messageId: lastSuccess?.messageId,
        blockCount: results.length,
        successCount: results.filter(r => r.ok).length,
      };
    },
  },
};
```

### 2.5 智能分块策略

```typescript
// src/streaming/smart-splitter.ts

export interface SplitStrategy {
  maxChars: number;
  keepParagraphs: boolean;
  keepSentences: boolean;
  respectCodeBlocks: boolean;
}

export class SmartSplitter {
  private strategy: SplitStrategy;
  
  constructor(strategy: Partial<SplitStrategy> = {}) {
    this.strategy = {
      maxChars: strategy.maxChars || 2000,
      keepParagraphs: strategy.keepParagraphs ?? true,
      keepSentences: strategy.keepSentences ?? true,
      respectCodeBlocks: strategy.respectCodeBlocks ?? true,
    };
  }
  
  /**
   * 智能分割消息
   */
  split(text: string): string[] {
    // 1. 检测代码块
    if (this.strategy.respectCodeBlocks) {
      return this.splitWithCodeBlocks(text);
    }
    
    // 2. 普通文本分割
    return this.splitPlainText(text);
  }
  
  /**
   * 分割包含代码块的文本
   */
  private splitWithCodeBlocks(text: string): string[] {
    const chunks: string[] = [];
    const codeBlockRegex = /```[\s\S]*?```/g;
    
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    
    while ((match = codeBlockRegex.exec(text)) !== null) {
      // 处理代码块前的文本
      const beforeCode = text.slice(lastIndex, match.index);
      if (beforeCode.trim()) {
        chunks.push(...this.splitPlainText(beforeCode));
      }
      
      // 整个代码块作为一个块
      chunks.push(match[0]);
      
      lastIndex = match.index + match[0].length;
    }
    
    // 处理剩余文本
    const remaining = text.slice(lastIndex);
    if (remaining.trim()) {
      chunks.push(...this.splitPlainText(remaining));
    }
    
    return chunks;
  }
  
  /**
   * 分割普通文本
   */
  private splitPlainText(text: string): string[] {
    if (text.length <= this.strategy.maxChars) {
      return [text];
    }
    
    const chunks: string[] = [];
    let remaining = text;
    
    while (remaining.length > this.strategy.maxChars) {
      let cutPos = this.findBestCutPoint(remaining, this.strategy.maxChars);
      chunks.push(remaining.slice(0, cutPos).trim());
      remaining = remaining.slice(cutPos).trimStart();
    }
    
    if (remaining) {
      chunks.push(remaining);
    }
    
    return chunks;
  }
  
  /**
   * 找到最佳分割点
   */
  private findBestCutPoint(text: string, maxLen: number): number {
    // 1. 优先在段落处分割
    if (this.strategy.keepParagraphs) {
      const paraPos = text.lastIndexOf("\n\n", maxLen);
      if (paraPos !== -1 && paraPos > maxLen * 0.5) {
        return paraPos + 2; // 包含换行符
      }
    }
    
    // 2. 其次在句子处分割
    if (this.strategy.keepSentences) {
      const sentencePos = text.lastIndexOf(".", maxLen);
      if (sentencePos !== -1 && sentencePos > maxLen * 0.5) {
        return sentencePos + 1;
      }
    }
    
    // 3. 在空格处分割
    const spacePos = text.lastIndexOf(" ", maxLen);
    if (spacePos !== -1 && spacePos > maxLen * 0.3) {
      return spacePos;
    }
    
    // 4. 强制分割
    return maxLen;
  }
}

// 使用示例
const splitter = new SmartSplitter({
  maxChars: 1500,
  keepParagraphs: true,
  keepSentences: true,
  respectCodeBlocks: true,
});

const chunks = splitter.split(longMessage);
// chunks: ["第一段...", "第二段...", "```code```", "第三段..."]
```

---

## 🎯 三、完整实现方案

### 3.1 项目结构

```
openclaw-napcat-channel/
├── src/
│   ├── index.ts                    # 插件入口
│   ├── channel.ts                  # Channel 主实现
│   ├── client.ts                   # WebSocket 客户端
│   ├── config.ts                   # 配置 Schema
│   ├── types.ts                    # 类型定义
│   ├── database/
│   │   ├── index.ts                # 数据库管理器
│   │   ├── schema.ts               # 数据库 Schema
│   │   └── models/
│   │       ├── message.ts          # 消息模型
│   │       ├── user.ts             # 用户模型
│   │       └── emotion.ts          # 情感模型
│   ├── message/
│   │   ├── parser.ts               # 消息解析器
│   │   ├── handler.ts              # 消息处理器
│   │   └── converter.ts            # 格式转换器
│   ├── file/
│   │   ├── manager.ts              # 文件管理器
│   │   └── downloader.ts           # 文件下载器
│   ├── streaming/
│   │   ├── block-sender.ts         # 分块发送器
│   │   └── smart-splitter.ts       # 智能分割器
│   └── intelligence/
│       ├── decision.ts             # 发言决策
│       └── emotion.ts              # 情感系统
├── openclaw.plugin.json            # 插件清单
├── package.json
└── README.md
```

### 3.2 插件清单

```json
{
  "id": "napcat",
  "name": "NapCat QQ Channel",
  "description": "基于 NapCatQQ 的完整功能 QQ 频道插件",
  "version": "0.1.0",
  "openclaw": {
    "extensions": ["./src/index.ts"],
    "channel": {
      "id": "napcat",
      "label": "NapCat QQ",
      "selectionLabel": "QQ (NapCat)",
      "docsPath": "/channels/napcat",
      "blurb": "功能完善的 QQ 频道插件，支持完整消息类型和历史存储",
      "aliases": ["qq", "onebot"]
    }
  },
  "configSchema": {
    "type": "object",
    "properties": {
      "wsUrl": {
        "type": "string",
        "description": "NapCat WebSocket 地址"
      },
      "accessToken": {
        "type": "string",
        "description": "访问令牌"
      },
      "database": {
        "type": "object",
        "properties": {
          "type": { "type": "string", "enum": ["sqlite", "postgres"] },
          "path": { "type": "string" },
          "connectionString": { "type": "string" }
        }
      },
      "streaming": {
        "type": "object",
        "properties": {
          "enabled": { "type": "boolean" },
          "maxBlockSize": { "type": "number" },
          "delayBetweenBlocks": { "type": "number" }
        }
      }
    }
  },
  "uiHints": {
    "wsUrl": { "label": "WebSocket 地址", "placeholder": "ws://127.0.0.1:3001" },
    "accessToken": { "label": "访问令牌", "sensitive": true }
  }
}
```

### 3.3 核心实现清单

| 模块 | 状态 | 优先级 |
|------|------|--------|
| WebSocket 客户端 | ⏳ 待实现 | P0 |
| 消息收发 | ⏳ 待实现 | P0 |
| 数据库管理 | ⏳ 待实现 | P0 |
| 消息解析 | ⏳ 待实现 | P0 |
| 文件处理 | ⏳ 待实现 | P1 |
| Block Streaming | ⏳ 待实现 | P1 |
| 情感系统 | ⏳ 待实现 | P2 |
| 智能交互 | ⏳ 待实现 | P2 |

---

## ✅ 四、可行性结论

### 4.1 技术可行性

| 功能 | SDK 支持 | 实现难度 | 结论 |
|------|---------|----------|------|
| 完整消息收发 | ✅ | 中 | ✅ 可行 |
| 文件/图片/表情 | ✅ | 中 | ✅ 可行 |
| 历史消息存储 | ✅ | 中 | ✅ 可行 |
| Block Streaming | ✅ | 中高 | ✅ 可行 |
| 智能交互 | ✅ | 高 | ✅ 可行 |
| 情感系统 | ✅ | 高 | ✅ 可行 |

### 4.2 关键优势

1. **OpenClaw Plugin SDK 完整支持 Channel 开发**
2. **Block Streaming 机制有官方接口支持**
3. **NapCat OneBot API 功能完善**
4. **MaiBot 设计理念可借鉴**

### 4.3 风险点

1. **QQ 风控风险** - 需要合理控制发言频率
2. **消息 ID 过期** - NapCat 的 LRU 缓存机制
3. **开发复杂度** - 完整功能需要较多工作量

---

_技术可行性分析 v0.2.0_  
_分析日期：2026-03-05_  
_分析人：有鱼喵 (Catsitate)_
