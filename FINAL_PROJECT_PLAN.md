# OpenClaw NapCat Channel 最终项目计划书

_版本：v9.0 (生产级代码审查 + 全面修复)_  
_创建日期：2026-03-05_  
_最后更新：2026-03-20_  
_状态：Phase 1 全部完成并通过生产级代码审查，准备进入 Phase 2_

---

## 📋 执行摘要

### 项目名称
**OpenClaw NapCat Channel** - 基于 NapCatQQ (OneBot v11) 的完整功能 QQ 频道插件

### 核心价值
1. ✅ **完整消息支持** — 27 种 QQ 消息类型全部实现
2. ✅ **历史消息存储** — SQLite 持久化，6 张表，7 个查询接口
3. ✅ **Block Streaming** — 边生成边发送
4. ✅ **输入状态显示** — 私聊原生 `set_input_status` API + 群聊名片后缀
5. ✅ **上下文注入** — 群聊历史 + 回复上下文 + 机器人权限状态
6. ✅ **访问控制** — 群白名单、用户黑名单、管理员模式
7. ✅ **主动 API** — 配套 napcat-tools skill（18 个命令）
8. ⏳ **智能交互** — Phase 2 开发中

### 配套项目
- **napcat-tools** skill: `~/.openclaw/workspace/skills/napcat-tools/`
  - 18 个命令：发消息/文件/语音/视频、查历史、群管理、精华消息等
  - GitHub: https://github.com/Hesitate-P/napcat-tools

---

## 二、功能实现状态

### 2.1 已完成功能（Phase 1）

#### 连接管理 ✅
- WebSocket 客户端（`client.ts`）
- 指数退避自动重连（最多 10 次）
- 心跳保活（45s 发送，180s 超时强制重连）
- Stale generation 防护（多实例并发安全）
- `disconnect()` 永久销毁 vs `closeConnection()` 允许重连（明确区分）

#### 消息接收 ✅
- 私聊/群聊消息接收
- 27 种消息类型全部解析（`message-resolver.ts`）
- CQ 码字符串解析（`parser.ts`）
- 通知事件转换为消息（`notice-handler.ts`）：9 种通知类型
- 回复上下文自动解析（检测 reply 元素，调用 `get_msg` API）

#### 消息发送 ✅
- 文本/图片/表情发送（`outbound.sendText`）
- Block Streaming 分块发送
- 输入状态显示（`typing-indicator.ts`）
  - 私聊：`set_input_status` API，每 450ms 保持
  - 群聊：修改群名片添加后缀（引用计数并发安全）

#### 上下文注入 ✅
所有上下文通过 `BodyForAgent` 的 `<qq_context>` 和 `<system_instruction>` 注入：

```
<qq_context>
userId=...
senderName=...
isAdmin=...
chatType=group
groupId=...
botRole=admin          ← 机器人群角色（owner/admin/member/unknown）
botIsGroupAdmin=true   ← 是否有管理员权限
</qq_context>

<system_instruction>...

【群聊上下文】
张三: 消息1
李四: 消息2
【当前消息】

【回复的消息】（张三）：被回复的内容

当前消息正文
```

> **重要经验**：`BodyForAgent` 是向 Agent 注入元数据的唯一可靠方式。`InboundHistory`/`UntrustedContext`/`GroupSystemPrompt` 等 SDK 字段当前版本不渲染到 Agent prompt，仅用于统计。

#### 数据库 ✅
6 张表：`messages`、`message_elements`、`users`、`groups`、`group_members`、`config`  
7 个查询接口：`getRecentMessages`、`getMessagesByUser`、`getMessagesByTimeRange`、`getMessageById`、`getMessagesBySession`、`getSessionList`、`getMessagesNotInOpenClawHistory`

#### 触发判断 ✅（`trigger.ts`）
- 私聊：永远触发
- 群聊：被@（排除 @全体成员）/ 关键词 / 戳机器人

#### 访问控制 ✅（`access-control.ts`）
优先级：用户黑名单 → 群白名单 → 管理员模式 → 放行

#### 主动 API（napcat-tools skill）✅
18 个命令，覆盖消息收发、文件操作、群管理、精华消息等全部常用操作。

---

## 三、开发经验与踩坑记录

> 本章保留所有重要开发经验，作为后续开发和维护的参考。

### 3.1 NapCat API 重要注意事项

| API | 注意点 |
|-----|--------|
| `set_input_status` | `user_id` 必须为 **string** 类型 |
| `set_group_ban` | `group_id`/`user_id` 必须为 **string**，`user_id=0` 表示全员禁言 |
| `set_group_kick` | `group_id`/`user_id` 必须为 **string** |
| `set_essence_msg` | **已知 NapCat bug**：权限不足时仍返回 `retcode=0`（假成功）。Agent 应检查 `botIsGroupAdmin` 字段 |
| 所有群组接口 | `group_id`/`user_id` 参数统一用 `String()` 转换 |
| `_get_group_notice` | 返回 `message.text`，需兼容 `.text`/`.content` fallback |
| `get_group_msg_history` | 返回包含当前消息，需过滤 `message_id === currentMsgId` |
| poke notice | 发起者昵称在 `nick` 字段，无 `sender` |
| `group_ban` notice | `user_id=0` 表示全员禁言，不是普通用户 |

### 3.2 OpenClaw Plugin SDK 经验

| 场景 | 经验 |
|------|------|
| 元数据注入 | `BodyForAgent` 是唯一可靠方式，其他字段不渲染到 prompt |
| 图片传递 | `MediaUrls` 字段（数组）传给 Agent，多模态模型可直接看到 |
| 命令授权 | `CommandAuthorized: true` 开启后 Agent 可执行 bash 命令 |
| 历史记录 | `Body`（干净正文）存入历史，`BodyForAgent`（含上下文）传给 Agent |

### 3.3 架构决策记录

| 决策 | 原因 |
|------|------|
| notice 事件转换为 message | 统一消费路径，不需要单独处理通知类型 |
| botRole 带 5min 缓存 | 避免每条消息都查询 `get_group_member_info` |
| botRole 仅 trigger 时查询 | 非触发消息不需要管理员状态，节省 API 调用 |
| `setPrivateTyping` 废弃删除 | 统一使用 `startPrivateTyping`/`stopPrivateTyping` |
| `disconnect()` vs `closeConnection()` | 明确区分永久销毁（不重连）和临时断开（允许重连） |
| message-resolver 使用 `fetch` | 在线获取 QQ 表情映射，Node.js 18+ 全局 `fetch` 可用 |
| napcat-tools 独立 git 仓库 | skill 与插件独立版本管理，便于单独更新 |

### 3.4 历史 Bug 修复记录

#### Phase 1 基础 Bug（#1-#13）
| 编号 | 问题 | 修复 |
|------|------|------|
| #1 | Dashboard 无法以表单修改配置 | 引入 `buildChannelConfigSchema` 包装 Zod schema |
| #2 | 触发判断失效 | @触发和戳一戳触发逻辑修复 |
| #6 | 戳一戳自身消息过滤条件错误 | 改为检测 `[戳一戳]` 字符串 |
| #9 | 配置格式迁移问题 | 嵌套→扁平化，添加 `toNestedConfig()` |
| #10 | 缺少访问控制 | 实现白名单/黑名单/管理员模式 |
| #13 | Markdown 转换修改原始内容 | 删除 `smartFormat` 调用 |
| #14 | `set_input_status` user_id 类型错误 | 改为 `String(userId)` |
| #15 | `disconnect()` 设 `destroyed=true` 导致重连失效 | 拆分 `disconnect()`/`closeConnection()` |

#### Phase 1 进阶 Bug（#16-#31）
| 编号 | 问题 | 修复 |
|------|------|------|
| #16 | poke notice 用 `payload.sender?.nickname`，但无 `sender` 字段 | 改为 `payload.nick` |
| #17 | `fetchGroupContext` 未过滤当前消息，Agent 收到重复上下文 | 多取一条后过滤 `message_id` |
| #18 | `get_group_notice` 解析只读 `message.text`，无 fallback | 增加 `.text ?? .content` 兜底 |
| #19 | 戳一戳昵称在 inbound-handler 被二次覆盖 | 删除冗余昵称覆盖代码 |
| #20 | senderName 优先 nickname 而非群名片 card | 改为 `card \|\| nickname` |
| #21 | @全体成员（qq='all'）触发 Agent 回复 | 去掉 `\|\| qq === 'all'` 触发条件 |
| #22 | 群名片恢复时 `stripSuffix` 被重复调用 | 直接用 `groupBaseCard.get(key)` |
| #23 | notice 事件用户信息全为纯数字 ID | 优先使用 payload 内 nick/user_name 等字段 |
| #24 | 被回复消息内容无法传递给 Agent | 新增 reply 元素检测 + `get_msg` API 注入 |
| #25 | `convertGroupBan` 全员禁言显示"禁言 0秒" | `user_id=0` 判断为全员禁言，显示正确文本 |
| #26 | `botRole` 对所有消息都查询（含非 trigger） | 移到 `trigger && isGroup` 条件内 |
| #27 | `cleanupGroupCards` 中 `selfId` 可为 null | 加 `if (selfId)` 保护（已在重构中修正）|
| #28 | `setPrivateTyping` 废弃函数残留 | 删除，统一使用 `start/stopPrivateTyping` |
| #29 | `client.ts` `handleClose` 函数体意外丢失 | 恢复完整函数体 |
| #30 | `getMessagesBySession` SQL params 顺序 bug | 修复参数数组构建顺序，`limit` 最后追加 |
| #31 | `mergeConfig` 浅合并导致嵌套配置被整体覆盖 | 改为深合并（逐键处理 object 类型字段）|

---

## 四、技术架构

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                      │
│           (模型调度 / 会话管理 / Agent 路由)               │
└─────────────────────────────────────────────────────────┘
                          ↕ Plugin SDK
┌─────────────────────────────────────────────────────────┐
│              OpenClaw NapCat Channel Plugin              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ client.ts    │  │inbound-      │  │notice-       │  │
│  │ WebSocket    │  │handler.ts    │  │handler.ts    │  │
│  │ 连接/心跳    │  │ 消息处理     │  │ 通知转换     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ database/    │  │ typing-      │  │ message-     │  │
│  │ SQLite 存储  │  │ indicator.ts │  │ resolver.ts  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕ WebSocket (OneBot v11)
┌─────────────────────────────────────────────────────────┐
│                  NapCatQQ (OneBot v11)                   │
└─────────────────────────────────────────────────────────┘
```

### 4.2 模块划分

| 模块 | 文件 | 职责 | 状态 |
|------|------|------|------|
| 插件入口 | `channel.ts` | OpenClaw Plugin 接口、账号生命周期 | ✅ |
| WS 客户端 | `client.ts` | 连接/心跳/重连/API 请求 | ✅ |
| 配置 | `config.ts` | Zod Schema、toNestedConfig | ✅ |
| 类型定义 | `types.ts` | TypeScript 接口 | ✅ |
| 入站处理 | `handler/inbound-handler.ts` | 消息→ctxPayload，分发 Agent | ✅ |
| 通知转换 | `event/notice-handler.ts` | notice→message 统一格式 | ✅ |
| 消息解析 | `utils/message-resolver.ts` | 27 种类型→可读文本 | ✅ |
| CQ 码解析 | `message/parser.ts` | CQ 码字符串解析 | ✅ |
| 输入状态 | `streaming/typing-indicator.ts` | 私聊 API + 群聊名片后缀 | ✅ |
| 数据库 | `database/index.ts` | SQLite 读写，7 个查询接口 | ✅ |
| 访问控制 | `middleware/access-control.ts` | 白名单/黑名单/管理员 | ✅ |
| 触发判断 | `middleware/trigger.ts` | @/关键词/戳一戳触发 | ✅ |
| 用户缓存 | `utils/userinfo.ts` | 昵称查询，5min TTL 缓存 | ✅ |
| 运行时桥 | `runtime.ts` | OpenClaw runtime 获取 | ✅ |

---

## 五、Phase 2 开发计划（智能交互）

### 5.1 目标
让 Agent 像真实群友一样参与群聊，而不只是被@时才回复。

### 5.2 功能规划

#### 发言决策系统 (P1)
- [ ] 主动发言概率模型（根据话题热度、沉默时间等）
- [ ] 话题跟踪（检测是否在讨论相关话题）
- [ ] 冷却时间（避免刷屏）

#### 动作系统 (P2)
- [ ] 表情回应（`group_msg_emoji_like` API）
- [ ] 主动戳一戳
- [ ] 群打卡（`send_group_sign`）
- [ ] 点赞（`send_like`）

#### 记忆系统 (P2)
- [ ] 利用现有 SQLite 数据库做群友画像
- [ ] 常用语统计
- [ ] 关系网络（谁和谁聊得多）

#### 学习系统 (P3)
- [ ] 群友说话风格学习
- [ ] 黑话/梗图学习

---

## 六、Phase 3 高级功能（待定）

- [ ] 图片 OCR（`ocr_image`，仅 Windows NapCat 支持）
- [ ] AI 语音生成（`send_group_ai_record`）
- [ ] 数据库索引优化
- [ ] 性能监控

---

_最终项目计划书 v9.0_  
_创建日期：2026-03-05_  
_最后更新：2026-03-20_  
_状态：Phase 1 全部完成（生产级代码审查通过，Bug #1-#31 全部修复），准备进入 Phase 2_
