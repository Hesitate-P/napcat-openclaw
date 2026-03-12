# OpenClaw Streaming 能力验证报告

_验证日期：2026-03-05_  
_来源：OpenClaw 官方文档 + Telegram Channel 实现_

---

## ✅ 确认：OpenClaw 支持 Block Streaming！

### 关键发现

根据官方文档 ([Streaming and Chunking](https://docs.openclaw.ai/concepts/streaming.md))：

> OpenClaw has two separate streaming layers:
> 
> * **Block streaming (channels):** emit completed **blocks** as the assistant writes. These are normal channel messages (not token deltas).
> * **Preview streaming (Telegram/Discord/Slack):** update a temporary **preview message** while generating.

**Block Streaming 是真实存在的！**

---

## 📊 两种 Streaming 模式

### 1. Block Streaming（频道消息）

```
Model output
  └─ text_delta/events
       ├─ (blockStreamingBreak=text_end)
       │    └─ chunker emits blocks as buffer grows
       └─ (blockStreamingBreak=message_end)
            └─ chunker flushes at message_end
                   └─ channel send (block replies)
```

**关键特性**：
- ✅ 发送的是 **完成的块**（不是 token delta）
- ✅ 边生成边发送（当 `blockStreamingBreak: "text_end"`）
- ✅ 块大小可配置（minChars/maxChars）
- ✅ 支持语义分割（paragraph/newline/sentence）

### 2. Preview Streaming（Telegram/Discord/Slack）

**模式**：
- `off`: 禁用
- `partial`: 单个预览消息，不断更新
- `block`: 分块更新预览
- `progress`: 进度预览 + 最终答案

**Telegram 实现**：
- DM：使用 Bot API `sendMessageDraft` 原生草稿
- 群组：预览消息 + `editMessageText` 更新

---

## ⚙️ Block Streaming 配置

### 启用 Block Streaming

```json5
{
  agents: {
    defaults: {
      blockStreamingDefault: "on",  // 默认关闭，需要显式启用
      blockStreamingBreak: "text_end",  // "text_end" 或 "message_end"
      blockStreamingChunk: {
        minChars: 800,    // 低边界：达到这个值才开始发送
        maxChars: 1500,   // 高边界：优先在这个值前分割
        breakPreference: "paragraph"  // 分割优先级
      },
      blockStreamingCoalesce: {
        minChars: 1500,   // 合并最小字符数
        maxChars: 3000,   // 合并最大字符数
        idleMs: 500       // 空闲等待时间
      },
      humanDelay: {
        mode: "natural",  // "off" | "natural" | "custom"
        minMs: 800,
        maxMs: 2500
      }
    }
  },
  channels: {
    napcat: {  // 我们的 QQ Channel
      blockStreaming: true,  // Channel 级别启用
      textChunkLimit: 2000,  // 频道最大块大小
      chunkMode: "length"  // "length" 或 "newline"
    }
  }
}
```

### 配置说明

| 配置项 | 说明 | 推荐值 |
|--------|------|--------|
| `blockStreamingDefault` | 是否启用块流式 | `"on"` |
| `blockStreamingBreak` | 何时发送块 | `"text_end"` (实时) 或 `"message_end"` (完成后) |
| `blockStreamingChunk.minChars` | 最小块大小 | 800 |
| `blockStreamingChunk.maxChars` | 最大块大小 | 1500 |
| `blockStreamingChunk.breakPreference` | 分割优先级 | `"paragraph"` |
| `blockStreamingCoalesce` | 合并配置 | 减少碎片 |
| `humanDelay` | 人类化延迟 | `"natural"` (800-2500ms) |
| `textChunkLimit` | 频道块大小上限 | 2000 |
| `chunkMode` | 分割模式 | `"newline"` (优先段落) |

---

## 🎯 Block Streaming 工作流程

### 完整流程

```
1. LLM 开始生成回复
       ↓
2. 文本累积到 minChars (800)
       ↓
3. Chunker 检查是否达到分割点
       ↓
4. 在语义完整处分割 (paragraph > newline > sentence)
       ↓
5. 发送第一个块到 Channel
       ↓
6. 继续生成，重复步骤 2-5
       ↓
7. LLM 生成完成 (text_end)
       ↓
8. 发送最后一个块
```

### 时间线示例

假设 AI 生成一条 3000 字符的回复：

```
[0s]  AI 开始生成
[1s]  生成 800 字符 → 发送块 1 (用户可见 ✅)
[2s]  生成 1500 字符 → 发送块 2 (用户可见 ✅)
[3s]  生成 2200 字符 → 发送块 3 (用户可见 ✅)
[4s]  生成 3000 字符 (完成) → 发送块 4 (用户可见 ✅)
```

**对比批处理模式**：
```
[0s]  AI 开始生成
[1s]  生成 800 字符 (用户看不到)
[2s]  生成 1500 字符 (用户看不到)
[3s]  生成 2200 字符 (用户看不到)
[4s]  生成 3000 字符 (完成) → 一次性发送所有块
[4s]  用户看到所有块
```

**首条消息延迟**：4 秒 → 1 秒 (减少 75%！)

---

## 📱 Telegram Channel 的实现

根据 Telegram 文档：

### 原生草稿流式 (Bot API 9.5+)

```typescript
// DM 中
await bot.api.sendMessageDraft({
  chat_id: userId,
  text: "正在生成的内容...",
});

// 更新草稿
await bot.api.editMessageText({
  chat_id: userId,
  message_id: draftMessageId,
  text: "更新后的内容",
});

// 最终发送
await bot.api.sendMessage({
  chat_id: userId,
  text: "最终内容",
});
```

### 群组预览流式

```typescript
// 发送预览消息
const preview = await bot.api.sendMessage({
  chat_id: groupId,
  text: "正在思考...",
});

// 更新预览
await bot.api.editMessageText({
  chat_id: groupId,
  message_id: preview.message_id,
  text: "思考中...",
});

// 最终答案（删除预览）
await bot.api.deleteMessage({
  chat_id: groupId,
  message_id: preview.message_id,
});
await bot.api.sendMessage({
  chat_id: groupId,
  text: "最终答案",
});
```

---

## 🔧 NapCat Channel 实现方案

### 配置要求

```json5
{
  channels: {
    napcat: {
      enabled: true,
      wsUrl: "ws://127.0.0.1:3001",
      accessToken: "your_token",
      
      // 启用 Block Streaming
      blockStreaming: true,
      textChunkLimit: 2000,
      chunkMode: "newline",  // 优先段落分割
      
      // 人类化延迟
      humanDelay: {
        mode: "natural",
        minMs: 800,
        maxMs: 2000
      }
    }
  },
  agents: {
    defaults: {
      blockStreamingDefault: "on",
      blockStreamingBreak: "text_end",
      blockStreamingChunk: {
        minChars: 800,
        maxChars: 1500,
        breakPreference: "paragraph"
      },
      humanDelay: {
        mode: "natural"
      }
    }
  }
}
```

### Channel 实现要点

```typescript
// src/channel.ts

export const napcatChannel: ChannelPlugin = {
  id: "napcat",
  meta: { ... },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    // 不需要特别声明 streaming，由 config 控制
  },
  
  config: {
    // ... 配置解析
  },
  
  gateway: {
    startAccount: async (ctx) => {
      // WebSocket 连接和消息接收
      // ...
    },
  },
  
  outbound: {
    deliveryMode: "direct",  // 或 "streaming"
    
    // 基础发送接口
    sendText: async ({ text, to, accountId }) => {
      const client = getClientForAccount(accountId);
      const isGroup = to.startsWith("group:");
      const id = parseInt(to.split(":")[1]);
      
      const result = await client.sendAction(
        isGroup ? "send_group_msg" : "send_private_msg",
        {
          [isGroup ? "group_id" : "user_id"]: id,
          message: text,
        }
      );
      
      return {
        ok: true,
        messageId: result.message_id?.toString(),
      };
    },
    
    // 注意：不需要实现 sendBlocks！
    // OpenClaw 的 chunker 会自动调用 sendText 多次
  },
};
```

### 关键点

**不需要实现 `sendBlocks` 接口！**

OpenClaw 的 `EmbeddedBlockChunker` 会：
1. 接收 LLM 的流式输出
2. 根据配置分割成块
3. **多次调用 `sendText`**，每次发送一个块

**Channel 需要做的**：
- ✅ 实现 `sendText` 接口
- ✅ 在配置中启用 `blockStreaming: true`
- ✅ 设置合理的 `textChunkLimit`

---

## ✅ 验证清单

### Phase 1 必须实现

- [ ] WebSocket 客户端 (连接 NapCat)
- [ ] `sendText` 接口实现
- [ ] 消息接收和解析
- [ ] 数据库存储
- [ ] 配置文件支持 `blockStreaming`

### Phase 1 可选优化

- [ ] 智能块分割 (优先段落)
- [ ] 人类化延迟 (800-2000ms 随机)
- [ ] 打字状态显示
- [ ] 文件/图片/表情支持

### Phase 2 智能交互

- [ ] 发言决策系统
- [ ] 情感系统
- [ ] 记忆系统
- [ ] 主动发言

---

## 📊 性能预期

### 首条消息延迟

| 场景 | 批处理 | Block Streaming | 提升 |
|------|--------|-----------------|------|
| 1000 字符回复 | ~2 秒 | **~1 秒** | 50% |
| 3000 字符回复 | ~4 秒 | **~1 秒** | 75% |
| 5000 字符回复 | ~6 秒 | **~1 秒** | 83% |

### 用户体验

**批处理模式**：
```
用户：问题
[等待 4 秒...]
机器人：[块 1][块 2][块 3] (同时到达)
```

**Block Streaming 模式**：
```
用户：问题
[等待 1 秒...]
机器人：[块 1] ✅
[1 秒后]
机器人：[块 2] ✅
[1 秒后]
机器人：[块 3] ✅
```

---

## 🎯 结论

### 技术可行性：✅ 完全可行！

1. **OpenClaw 原生支持 Block Streaming**
2. **Telegram Channel 已实现**
3. **NapCat Channel 可以复用相同模式**
4. **不需要修改 OpenClaw 核心代码**

### 实现难度：⭐⭐ (中等)

1. **核心**：实现 `sendText` 接口
2. **配置**：启用 `blockStreaming: true`
3. **优化**：智能分割 + 人类化延迟

### 下一步行动

1. ✅ 确认技术可行性 (已完成)
2. ⏳ 开始 Phase 1 开发
3. ⏳ 测试 Block Streaming 效果
4. ⏳ 优化分割策略和延迟

---

_OpenClaw Streaming 能力验证报告_  
_验证日期：2026-03-05_  
_结论：Block Streaming 完全可行！_
