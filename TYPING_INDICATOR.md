# 输入状态显示实现方案

_版本：v1.0_  
_创建日期：2026-03-05_

---

## 📊 一、QQ 输入状态机制

### 1.1 私聊输入状态

**NapCat 支持原生输入状态 API**：

```typescript
// 设置私聊输入状态
await client.sendAction("set_input_status", {
  user_id: 123456789,
  event_type: 1,  // 1=正在输入，0=取消输入
});
```

**效果**：
- 对方在私聊窗口会看到"正在输入..."提示
- 这是 QQ 原生功能，体验最好

### 1.2 群聊输入状态

**QQ 群聊不支持原生输入状态**：

只能通过 **修改群名片后缀** 来模拟：

```typescript
// 修改群名片，添加"（输入中）"后缀
await client.sendAction("set_group_card", {
  group_id: 123456789,
  user_id: botUserId,
  card: "原昵称（输入中）",
});

// 发送完成后恢复
await client.sendAction("set_group_card", {
  group_id: 123456789,
  user_id: botUserId,
  card: "原昵称",
});
```

**效果**：
- 群成员看到机器人昵称变成"XXX（输入中）"
- 发送完成后自动恢复原名

---

## 🔧 二、实现方案

### 2.1 TypingIndicator 类

```typescript
// src/streaming/typing-indicator.ts

import { NapCatClient } from '../client';

export interface TypingIndicatorConfig {
  enabled: boolean;
  privateChat: "api" | "none";      // 私聊模式
  groupChat: "nickname" | "none";   // 群聊模式
  nicknameSuffix: string;           // 群名片后缀
  delayMs: number;                  // 显示延迟
}

export class TypingIndicator {
  private client: NapCatClient;
  private config: TypingIndicatorConfig;
  private botUserId: number | null = null;
  
  // 群名片缓存（用于恢复）
  private groupCardCache = new Map<string, string>();
  
  // 计数器（支持并发）
  private groupCounter = new Map<string, number>();
  
  constructor(client: NapCatClient, config: TypingIndicatorConfig) {
    this.client = client;
    this.config = config;
  }
  
  /**
   * 设置 Bot 用户 ID
   */
  async setBotUserId(userId: number) {
    this.botUserId = userId;
  }
  
  /**
   * 开始输入状态
   */
  async startTyping(to: string): Promise<void> {
    if (!this.config.enabled) return;
    
    if (to.startsWith("user:")) {
      // 私聊
      await this.startPrivateTyping(parseInt(to.split(":")[1]));
    } else if (to.startsWith("group:")) {
      // 群聊
      await this.startGroupTyping(parseInt(to.split(":")[1]));
    }
  }
  
  /**
   * 结束输入状态
   */
  async endTyping(to: string): Promise<void> {
    if (!this.config.enabled) return;
    
    if (to.startsWith("user:")) {
      // 私聊
      await this.endPrivateTyping(parseInt(to.split(":")[1]));
    } else if (to.startsWith("group:")) {
      // 群聊
      await this.endGroupTyping(parseInt(to.split(":")[1]));
    }
  }
  
  /**
   * 开始私聊输入状态
   */
  private async startPrivateTyping(userId: number): Promise<void> {
    if (this.config.privateChat !== "api") return;
    
    try {
      await this.client.sendAction("set_input_status", {
        user_id: userId,
        event_type: 1,  // 正在输入
      });
    } catch (error) {
      console.error(`[TypingIndicator] 私聊输入状态设置失败：`, error);
    }
  }
  
  /**
   * 结束私聊输入状态
   */
  private async endPrivateTyping(userId: number): Promise<void> {
    if (this.config.privateChat !== "api") return;
    
    try {
      await this.client.sendAction("set_input_status", {
        user_id: userId,
        event_type: 0,  // 取消输入
      });
    } catch (error) {
      // 忽略错误（可能已经超时自动取消）
    }
  }
  
  /**
   * 开始群聊输入状态
   */
  private async startGroupTyping(groupId: number): Promise<void> {
    if (this.config.groupChat !== "nickname") return;
    if (!this.botUserId) {
      console.error("[TypingIndicator] Bot 用户 ID 未设置");
      return;
    }
    
    const groupKey = `${groupId}`;
    
    // 增加计数器
    const count = (this.groupCounter.get(groupKey) || 0) + 1;
    this.groupCounter.set(groupKey, count);
    
    // 如果已经有输入状态，不需要重复设置
    if (count > 1) return;
    
    try {
      // 获取当前群名片（用于恢复）
      const memberInfo = await this.client.sendAction("get_group_member_info", {
        group_id: groupId,
        user_id: this.botUserId,
        no_cache: true,
      });
      
      const currentCard = memberInfo?.card || memberInfo?.nickname || "";
      
      // 检查是否已经有后缀
      if (currentCard.endsWith(this.config.nicknameSuffix)) {
        return;  // 已经显示输入状态
      }
      
      // 缓存原名片
      this.groupCardCache.set(groupKey, currentCard);
      
      // 设置新名片
      const newCard = `${currentCard}${this.config.nicknameSuffix}`;
      await this.client.sendAction("set_group_card", {
        group_id: groupId,
        user_id: this.botUserId,
        card: newCard,
      });
      
      console.log(`[TypingIndicator] 群 ${groupId} 名片已修改：${currentCard} → ${newCard}`);
    } catch (error) {
      console.error(`[TypingIndicator] 群聊输入状态设置失败：`, error);
    }
  }
  
  /**
   * 结束群聊输入状态
   */
  private async endGroupTyping(groupId: number): Promise<void> {
    if (this.config.groupChat !== "nickname") return;
    if (!this.botUserId) return;
    
    const groupKey = `${groupId}`;
    
    // 减少计数器
    const count = (this.groupCounter.get(groupKey) || 1) - 1;
    this.groupCounter.set(groupKey, count);
    
    // 如果还有其他输入状态，不需要恢复
    if (count > 0) return;
    
    try {
      // 获取缓存的原名片
      const originalCard = this.groupCardCache.get(groupKey);
      
      if (originalCard) {
        // 恢复原名片
        await this.client.sendAction("set_group_card", {
          group_id: groupId,
          user_id: this.botUserId,
          card: originalCard,
        });
        
        console.log(`[TypingIndicator] 群 ${groupId} 名片已恢复：${originalCard}`);
        this.groupCardCache.delete(groupKey);
      }
    } catch (error) {
      console.error(`[TypingIndicator] 群聊输入状态恢复失败：`, error);
    }
  }
  
  /**
   * 清理（用于断开连接时）
   */
  async cleanup(): Promise<void> {
    // 恢复所有群名片
    for (const [groupKey, originalCard] of this.groupCardCache.entries()) {
      const groupId = parseInt(groupKey);
      try {
        await this.client.sendAction("set_group_card", {
          group_id: groupId,
          user_id: this.botUserId!,
          card: originalCard,
        });
      } catch (error) {
        console.error(`[TypingIndicator] 清理群名片失败 ${groupId}:`, error);
      }
    }
    
    this.groupCardCache.clear();
    this.groupCounter.clear();
  }
}
```

### 2.2 在 Channel 中使用

```typescript
// src/channel.ts

import { TypingIndicator } from "./streaming/typing-indicator";

export const napcatChannel: ChannelPlugin = {
  // ...
  gateway: {
    startAccount: async (ctx) => {
      const { account, cfg } = ctx;
      const config = account.config;
      
      // 创建客户端
      const client = new NapCatClient(config.wsUrl, config.accessToken);
      
      // 创建输入状态管理器
      const typingIndicator = new TypingIndicator(client, {
        enabled: config.typingIndicator?.enabled ?? true,
        privateChat: config.typingIndicator?.privateChat ?? "api",
        groupChat: config.typingIndicator?.groupChat ?? "nickname",
        nicknameSuffix: config.typingIndicator?.nicknameSuffix ?? "（输入中）",
        delayMs: config.typingIndicator?.delayMs ?? 500,
      });
      
      client.on("connect", async () => {
        // 获取 Bot 用户 ID
        const loginInfo = await client.sendAction("get_login_info", {});
        typingIndicator.setBotUserId(loginInfo.user_id);
      });
      
      // ... 其他初始化代码
    },
  },
  
  outbound: {
    deliveryMode: "streaming",
    
    sendText: async ({ text, to, accountId }) => {
      const client = getClientForAccount(accountId);
      const typingIndicator = getTypingIndicatorForAccount(accountId);
      
      // 开始输入状态
      await typingIndicator.startTyping(to);
      
      try {
        // 发送消息
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
      } finally {
        // 结束输入状态
        await typingIndicator.endTyping(to);
      }
    },
  },
};
```

---

## ⚙️ 三、配置方案

### 3.1 完整配置示例

```json5
{
  channels: {
    napcat: {
      enabled: true,
      wsUrl: "ws://127.0.0.1:3001",
      accessToken: "your_token",
      
      // 输入状态配置
      typingIndicator: {
        enabled: true,              // 是否启用
        privateChat: "api",         // "api" | "none"
        groupChat: "nickname",      // "nickname" | "none"
        nicknameSuffix: "（输入中）", // 群名片后缀
        delayMs: 500                // 显示延迟（避免闪烁）
      },
      
      // Block Streaming 配置
      blockStreaming: true,
      textChunkLimit: 2000,
      chunkMode: "newline",
      
      // 人类化延迟配置
      humanDelay: {
        mode: "natural",
        minMs: 800,
        maxMs: 2000
      }
    }
  }
}
```

### 3.2 配置选项说明

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用输入状态 |
| `privateChat` | `"api"` \| `"none"` | `"api"` | 私聊模式：`api`=使用`set_input_status` |
| `groupChat` | `"nickname"` \| `"none"` | `"nickname"` | 群聊模式：`nickname`=修改群名片 |
| `nicknameSuffix` | string | `"（输入中）"` | 群名片后缀 |
| `delayMs` | number | `500` | 显示延迟（毫秒） |

---

## 📊 四、技术细节

### 4.1 私聊输入状态 API

**NapCat API**: `set_input_status`

```typescript
await client.sendAction("set_input_status", {
  user_id: 123456789,
  event_type: 1,  // 1=正在输入，0=取消输入
});
```

**注意**：
- 这个 API 只在私聊中有效
- 群聊中调用会被忽略
- 输入状态会自动超时取消（约 10-15 秒）

### 4.2 群名片修改

**NapCat API**: `set_group_card`

```typescript
await client.sendAction("set_group_card", {
  group_id: 123456789,
  user_id: botUserId,
  card: "新昵称",
});
```

**注意**：
- 需要机器人是群成员
- 修改后立即生效
- 频繁修改可能被风控（建议加延迟）

### 4.3 并发处理

**问题**：如果同时有多个消息在发送，如何避免名片频繁切换？

**解决方案**：使用计数器

```typescript
// 开始输入时 +1
const count = (this.groupCounter.get(groupKey) || 0) + 1;
this.groupCounter.set(groupKey, count);

// 只有第一个输入状态需要修改名片
if (count > 1) return;

// 结束输入时 -1
const count = (this.groupCounter.get(groupKey) || 1) - 1;
this.groupCounter.set(groupKey, count);

// 只有最后一个结束才恢复名片
if (count > 0) return;
```

---

## ✅ 五、验收标准

### 5.1 功能验收

- [ ] 私聊中对方能看到"正在输入..."
- [ ] 群聊中机器人昵称变成"XXX（输入中）"
- [ ] 发送完成后状态自动恢复
- [ ] 并发消息不会导致状态混乱
- [ ] 断开连接时自动恢复所有群名片

### 5.2 性能验收

- [ ] 输入状态显示延迟 < 500ms
- [ ] 名片恢复延迟 < 1 秒
- [ ] 不影响消息发送速度

### 5.3 用户体验

- [ ] 私聊输入状态自然流畅
- [ ] 群聊名片修改不明显突兀
- [ ] 不会频繁修改名片（避免刷屏感）

---

_输入状态显示实现方案 v1.0_  
_创建日期：2026-03-05_
