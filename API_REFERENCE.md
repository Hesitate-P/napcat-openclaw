# API 参考文档

_最后更新：2026-03-19_  
_适用版本：NapCat (OneBot v11) + OpenClaw Plugin SDK_

本文档汇总项目中用到的所有 NapCat API 与 OpenClaw Plugin SDK 接口，防止遗忘，供开发时参考。

---

## 一、NapCat API（OneBot v11 扩展）

### 1.1 连接方式

- **协议**：WebSocket（反向 WS）
- **地址**：`ws://<host>:<port>`（默认 3001）
- **鉴权**：Header `Authorization: Bearer <token>` 或 URL 参数 `?access_token=<token>`
- **请求格式**：
  ```json
  { "action": "<api_name>", "params": { ... }, "echo": "<唯一标识>" }
  ```
- **响应格式**：
  ```json
  { "status": "ok", "retcode": 0, "data": { ... }, "echo": "<唯一标识>" }
  ```

---

### 1.2 消息收发

#### 发送群消息
```
action: send_group_msg
params: { group_id: number|string, message: MessageElement[] }
returns: { message_id: number }
```

#### 发送私聊消息
```
action: send_private_msg
params: { user_id: number|string, message: MessageElement[] }
returns: { message_id: number }
```

#### 撤回消息
```
action: delete_msg
params: { message_id: number|string }
```

#### 获取消息详情
```
action: get_msg
params: { message_id: number|string }
returns: { message_id, message_type, group_id?, user_id, sender, message, raw_message, time }
```

#### 获取群历史消息
```
action: get_group_msg_history
params: { group_id: number|string, count: number, message_seq?: number }
returns: { messages: Message[] }
```

#### 获取好友历史消息
```
action: get_friend_msg_history
params: { user_id: number|string, count: number, message_seq?: number, reverseOrder?: boolean }
returns: { messages: Message[] }
```

#### 获取合并转发消息
```
action: get_forward_msg
params: { message_id: number|string }
returns: { messages: Message[] }
```

---

### 1.3 消息元素类型（MessageElement）

| type | 说明 | 主要 data 字段 |
|------|------|----------------|
| `text` | 纯文本 | `text: string` |
| `at` | @提及 | `qq: string\|'all'` |
| `face` | QQ表情 | `id: string` (0-104+) |
| `image` | 图片 | `file: string`, `url?: string`, `summary?: string`, `file_size?: string` |
| `record` | 语音 | `file: string`, `url?: string`, `file_size?: string` |
| `video` | 视频 | `file: string`, `url?: string`, `file_size?: string` |
| `file` | 文件 | `name: string`, `file_id: string`, `file_size?: number`, `url?: string` |
| `reply` | 回复 | `id: string\|number` |
| `forward` | 合并转发 | `id: string` |
| `node` | 转发节点 | `id?: string`, `name?: string`, `content?: MessageElement[]` |
| `mface` | 商城表情 | `emoji_id: string`, `emoji_package_id: string`, `summary?: string` |
| `dice` | 骰子 | `result?: string`, `value?: string` |
| `rps` | 猜拳 | `result?: string`（1=石头,2=剪刀,3=布）|
| `poke`/`shake` | 戳一戳 | `user_id?: number`, `target_id?: number` |
| `json` | JSON卡片 | `data: string\|object` |
| `xml` | XML卡片 | `data: string` |
| `music` | 音乐分享 | `type: string`, `id?: string`, `title?: string`, `singer?: string`, `url?: string`, `audio?: string` |
| `contact` | 联系人分享 | `type: 'qq'\|'group'`, `id: string` |
| `location` | 位置分享 | `lat: number`, `lon: number`, `title?: string`, `content?: string` |
| `share` | 链接分享 | `url: string`, `title?: string`, `content?: string`, `image?: string` |
| `miniapp` | 小程序 | `data: string(JSON)`, `title?: string`（JSON内嵌 meta.detail_1.title）|
| `tts` | TTS语音 | `text: string` |
| `markdown` | Markdown | `content: string` |

---

### 1.4 用户/好友接口

#### 获取登录信息
```
action: get_login_info
returns: { user_id: number, nickname: string }
```

#### 获取好友列表
```
action: get_friend_list
returns: Array<{ user_id: number, nickname: string, remark?: string }>
```

#### 获取陌生人信息
```
action: get_stranger_info
params: { user_id: number|string, no_cache?: boolean }
returns: { user_id, nickname, sex, age, level }
```

#### 点赞
```
action: send_like
params: { user_id: number|string, times?: number }
```

#### 处理加好友请求
```
action: set_friend_add_request
params: { flag: string, approve: boolean, remark?: string }
```

#### 设置好友备注
```
action: set_friend_remark  (NapCat扩展)
params: { user_id: number|string, remark: string }
```

#### 获取最近会话
```
action: get_recent_contact  (NapCat扩展)
params: { count?: number }
returns: Array<{ ...会话信息 }>
```

---

### 1.5 群组接口

#### 获取群列表
```
action: get_group_list
returns: Array<{ group_id: number, group_name: string, member_count?: number }>
```

#### 获取群信息
```
action: get_group_info
params: { group_id: number|string, no_cache?: boolean }
returns: { group_id, group_name, member_count, max_member_count }
```

#### 获取群成员列表
```
action: get_group_member_list
params: { group_id: number|string }
returns: Array<GroupMemberInfo>
```

#### 获取群成员信息
```
action: get_group_member_info
params: { group_id: number|string, user_id: number|string, no_cache?: boolean }
returns: GroupMemberInfo { user_id, nickname, card, role, title, join_time, last_speak_time }
```

#### 群组禁言
```
action: set_group_ban
params: { group_id: string, user_id: string, duration: number }  ← 注意均为 string
duration=0 表示解除禁言
```

#### 全员禁言
```
action: set_group_whole_ban
params: { group_id: number|string, enable: boolean }
```

#### 群组踢人
```
action: set_group_kick
params: { group_id: number|string, user_id: number|string, reject_add_request?: boolean }
```

#### 设置群管理员
```
action: set_group_admin
params: { group_id: number|string, user_id: number|string, enable: boolean }
```

#### 设置群名片
```
action: set_group_card
params: { group_id: number|string, user_id: number|string, card: string }
```

#### 设置群名称
```
action: set_group_name
params: { group_id: number|string, group_name: string }
```

#### 退出群组
```
action: set_group_leave
params: { group_id: number|string, is_dismiss?: boolean }
```

#### 设置专属头衔
```
action: set_group_special_title
params: { group_id: number|string, user_id: number|string, special_title: string }
```

#### 处理加群请求
```
action: set_group_add_request
params: { flag: string, sub_type: 'add'|'invite', approve: boolean, reason?: string }
```

#### 获取群公告
```
action: _get_group_notice
params: { group_id: number|string }
returns: Array<{ notice_id: string, sender_id: number, publish_time: number, message: { text: string } }>
```

#### 发送群公告
```
action: _send_group_notice
params: { group_id: number|string, content: string, image?: string }
```

#### 删除群公告
```
action: _del_group_notice
params: { group_id: number|string, notice_id: string }
```

#### 设置精华消息
```
action: set_essence_msg
params: { message_id: number|string }
```

#### 移出精华消息
```
action: delete_essence_msg
params: { message_id: number|string }
```

#### 获取精华消息列表
```
action: get_essence_msg_list
params: { group_id: number|string }
returns: Array<{ msg_seq, msg_random, sender_id, sender_nick, operator_id, operator_nick, message_id, operator_time }>
```

#### 获取群禁言列表
```
action: get_group_shut_list
params: { group_id: number|string }
```

#### 群打卡
```
action: send_group_sign
params: { group_id: number|string }
```

#### 批量踢人（NapCat扩展）
```
action: set_group_kick_members  (NapCat扩展)
params: { group_id: number|string, user_ids: number[], reject_add_request?: boolean }
```

#### 设置群待办
```
action: set_group_todo  (NapCat扩展)
params: { message_id: number|string }
```

---

### 1.6 系统/扩展接口

#### 获取运行状态
```
action: get_status
returns: { online: boolean, good: boolean }
```

#### 获取版本信息
```
action: get_version_info
returns: { app_name, app_version, protocol_version }
```

#### 设置输入状态（NapCat扩展）
```
action: set_input_status
params: { user_id: string, event_type: 0|1 }  ← user_id 必须是 STRING 类型！
event_type: 1=开始输入, 0=停止输入
注意：QQ输入状态约8-10秒自动消失，需每450ms重复发送
```

#### 获取文件信息
```
action: get_file
params: { file_id: string }
returns: { file: string, file_name: string, file_size: number, base64?: string }
```

#### 图片OCR（仅Windows）
```
action: ocr_image
params: { image: string }  ← 图片URL或base64
returns: { texts: Array<{ text, confidence, coordinates }>, language }
```

#### 发送戳一戳
```
action: send_poke  (NapCat扩展)
params: { user_id?: number|string, group_id?: number|string }
```

#### 设置在线状态
```
action: set_online_status  (NapCat扩展)
params: { status: number, ext_status: number, battery_status: number }
```

#### 获取AI角色列表
```
action: get_ai_characters  (NapCat扩展)
params: { group_id: number|string, chat_type: number }
returns: Array<{ character_id, character_name, preview_url }>
```

#### 发送群AI语音
```
action: send_group_ai_record  (NapCat扩展)
params: { group_id: number|string, character: string, text: string }
returns: { message_id }
```

#### 英文翻译
```
action: translate_en2zh  (NapCat扩展)
params: { words: string[] }
returns: string[]
```

#### 设置个性签名
```
action: set_self_longnick  (NapCat扩展)
params: { longNick: string }
```

#### 设置QQ头像
```
action: set_qq_avatar  (NapCat扩展)
params: { file: string }  ← 文件路径/URL/base64
```

#### 获取Cookies
```
action: get_cookies
params: { domain: string }
returns: { cookies: string }
```

#### 获取CSRF Token
```
action: get_csrf_token
returns: { token: number }
```

#### 清理缓存
```
action: clean_cache
```

---

### 1.7 NapCat 事件类型（推送）

#### 消息事件
```
post_type: 'message'
message_type: 'private' | 'group'
关键字段: user_id, group_id?, message[], raw_message, sender, time, message_id, self_id
```

#### 通知事件（notice）

| notice_type | sub_type | 说明 | 关键字段 |
|-------------|----------|------|----------|
| `notify` | `poke` | 戳一戳 | `user_id`, `target_id`, `group_id?`, `nick` |
| `group_upload` | - | 群文件上传 | `group_id`, `user_id`, `file{name,id,size}` |
| `group_increase` | `approve`/`invite` | 群成员增加 | `group_id`, `user_id`, `operator_id` |
| `group_decrease` | `leave`/`kick`/`kick_me` | 群成员减少 | `group_id`, `user_id`, `operator_id` |
| `group_admin` | `set`/`unset` | 管理员变动 | `group_id`, `user_id` |
| `group_ban` | `ban`/`lift_ban` | 群禁言 | `group_id`, `user_id`, `operator_id`, `duration` |
| `group_card` | - | 群名片变更 | `group_id`, `user_id`, `card_new`, `card_old` |
| `essence` | `add`/`delete` | 精华消息 | `group_id`, `sender_id`, `operator_id`, `message_id` |
| `group_msg_emoji_like` | - | 表情回应 | `group_id`, `user_id`, `message_id`, `likes[{emoji_id,count}]` |

---

## 二、OpenClaw Plugin SDK

### 2.1 插件入口

```typescript
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema, buildChannelConfigSchema, DEFAULT_ACCOUNT_ID } from 'openclaw/plugin-sdk';

const plugin = {
  id: 'my-plugin',
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: myChannel });
  },
};
export default plugin;
```

### 2.2 ChannelPlugin 接口

```typescript
import type { ChannelPlugin, ChannelAccountSnapshot } from 'openclaw/plugin-sdk';

export const myChannel: ChannelPlugin<ResolvedAccount> = {
  id: 'channel-id',
  meta: {
    id, label, selectionLabel, docsPath, blurb,
  },
  capabilities: { chatTypes: ['direct', 'group'], media: true },
  configSchema: buildChannelConfigSchema(ZodSchema),

  config: {
    listAccountIds: (cfg) => string[],
    resolveAccount: (cfg, accountId) => ResolvedAccount,
    defaultAccountId: () => string,
    describeAccount: (acc) => { accountId, configured },
  },

  directory: {
    listPeers:  async ({ accountId }) => Array<{ id, name, kind: 'user', metadata }>,
    listGroups: async ({ accountId }) => Array<{ id, name, kind: 'group', metadata }>,
  },

  status: {
    probeAccount: async ({ account, timeoutMs }) => { ok: boolean, bot?: { id, username }, error?: string },
  },

  gateway: {
    startAccount: async (ctx) => void,   // 持续阻塞直到 ctx.abortSignal 触发
    logoutAccount: async (ctx) => { ok: boolean, cleared: boolean },
  },

  outbound: {
    deliveryMode: 'direct',
    sendText: async (ctx) => { ok: boolean, channel: string, messageId: string },
  },
};
```

### 2.3 startAccount ctx 对象

```typescript
ctx: {
  account: ResolvedAccount,        // 账号信息（含 config）
  cfg: any,                        // 全局 OpenClaw 配置
  abortSignal: AbortSignal,        // 停止信号，abort 时退出
  channelRuntime: ChannelRuntime,  // 运行时接口（见下）
}
```

### 2.4 ChannelRuntime 接口

```typescript
channelRuntime.routing.resolveAgentRoute({
  cfg, channel, accountId,
  peer: { kind: 'group'|'direct', id: string },
}) => { agentId: string, sessionKey: string, accountId: string }

channelRuntime.session.resolveStorePath(storeConfig, { agentId }) => string

channelRuntime.reply.finalizeInboundContext({
  Provider, Channel, Surface,
  From, To,
  Body,         // 不含 system 块的干净正文（存入历史）
  RawBody,      // 原始正文
  BodyForAgent, // 传给 Agent 的完整正文（含 system_instruction）
  SenderId, SenderName,
  SessionKey, AccountId,
  ChatType: 'group'|'direct',
  Timestamp: number,          // 毫秒时间戳
  CommandAuthorized: boolean,
  MediaUrls?: string[],       // 图片 URL 列表（多模态）
}) => CtxPayload

channelRuntime.session.recordInboundSession({
  storePath, sessionKey, ctx,
  updateLastRoute: { sessionKey, channel, to, accountId },
  onRecordError: (err) => void,
}) => Promise<void>

channelRuntime.reply.dispatchReplyFromConfig({
  ctx, cfg, dispatcher,
}) => Promise<void>

// Block Streaming 回复分发器
channelRuntime.reply.createReplyDispatcherWithTyping({ deliver }) => { dispatcher }
// dispatcher.sendFinalReply(payload) — 发送回复
// dispatcher.waitForIdle()           — 等待所有块发送完毕
```

### 2.5 Inbound Context Payload 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `Provider` | string | 渠道提供商标识（如 `'napcat'`）|
| `Channel` | string | 渠道 ID |
| `Surface` | string | 界面类型 |
| `From` | string | 消息来源（群号/`user:QQ号`）|
| `To` | string | 目标（如 `'napcat:bot'`）|
| `Body` | string | 干净正文（无 system 块，存入历史）|
| `RawBody` | string | 原始正文 |
| `BodyForAgent` | string | 含 `<qq_context>` 和 `<system_instruction>` 的完整正文 |
| `SenderId` | string | 发送者 QQ 号（字符串）|
| `SenderName` | string | 发送者昵称 |
| `SessionKey` | string | 会话键 |
| `AccountId` | string | 账号 ID |
| `ChatType` | `'group'\|'direct'` | 聊天类型 |
| `Timestamp` | number | 毫秒时间戳 |
| `CommandAuthorized` | boolean | 是否允许执行命令 |
| `MediaUrls` | string[] | 图片 URL 列表（可选，用于多模态）|

### 2.6 Deliver Payload 字段

```typescript
// dispatcher.sendFinalReply 收到的 payload
{
  text?: string,          // 文字内容
  mediaUrls?: string[],   // 图片 URL 列表
  MediaUrls?: string[],   // 同上（两种命名均支持）
  imageUrls?: string[],   // 同上
  images?: string[],      // 同上
}
```

---

## 三、项目内部约定

### 3.1 消息 ID 格式

| 场景 | chat_id 格式 | 示例 |
|------|-------------|------|
| 私聊 | `user:<QQ号>` | `user:3341299096` |
| 群聊 | `<群号>` | `870560083` |

### 3.2 触发规则

| 条件 | 说明 |
|------|------|
| 私聊 | 永远触发 |
| 群聊 + 被@ | 触发 |
| 群聊 + 关键词 | 触发（逗号分隔，中英文逗号均支持）|
| 群聊 + 戳一戳机器人 | 触发（target_id === selfId）|
| 群聊 + @全体 | 不触发（避免刷屏）|

### 3.3 访问控制优先级

```
用户黑名单 → 群白名单 → 管理员模式 → 放行
```

### 3.4 napcat-tools Skill 命令表

| 命令 | 参数 | 说明 |
|------|------|------|
| `send_message` | `chat_type chat_id message` | 发送文本消息 |
| `send_file` | `chat_type chat_id file_path [file_name]` | 发送文件 |
| `send_record` | `chat_type chat_id file_path` | 发送语音 |
| `send_video` | `chat_type chat_id file_path` | 发送视频 |
| `download_file` | `file_id [save_path]` | 下载文件 |
| `query_messages` | `chat_type chat_id [limit]` | 查询历史消息 |
| `get_sessions` | - | 获取会话列表 |
| `get_group_members` | `group_id` | 获取群成员列表 |
| `delete_msg` | `message_id` | 撤回消息 |
| `get_msg` | `message_id` | 获取消息详情 |
| `set_group_ban` | `group_id user_id [duration=600]` | 群禁言（0=解禁）|
| `set_group_kick` | `group_id user_id [reject_add=false]` | 群踢人 |
| `send_group_notice` | `group_id content` | 发送群公告 |
| `get_group_notice` | `group_id` | 获取群公告列表 |
| `del_group_notice` | `group_id notice_id` | 删除群公告 |
| `set_essence_msg` | `message_id` | 设置精华消息 |
| `delete_essence_msg` | `message_id` | 移出精华消息 |
| `get_essence_msg_list` | `group_id` | 获取精华消息列表 |

**调用方式**：
```bash
node ~/.openclaw/workspace/skills/napcat-tools/scripts/napcat-tools.js <命令> [参数...]
```

### 3.5 已知 API 注意事项

| API | 注意点 |
|-----|--------|
| `set_input_status` | `user_id` 必须为 **string** 类型，不能传 number |
| `set_group_ban` | `group_id`/`user_id` 必须为 **string** 类型（示例值 `'123456'`），`duration` 为 number |
| `set_group_kick` | `group_id`/`user_id` 必须为 **string** 类型 |
| `send_group_notice`/`get_group_notice`/`del_group_notice` | `group_id` 必须为 **string** 类型 |
| `set_essence_msg`/`delete_essence_msg` | `message_id` 支持 number 或 string，建议传 **string**；**NapCat 已知 bug**：权限不足时仍返回 `retcode=0`（假成功），Agent 应在调用前先检查 `BodyForAgent` 的 `qq_context` 中 `botIsGroupAdmin` 字段 |
| `get_essence_msg_list`/`get_group_member_list` | `group_id` 必须为 **string** 类型 |
| `_get_group_notice` | 返回 `message.text`，需兼容 `.text`/`.content` fallback |
| `get_group_msg_history` | 返回包含当前消息，需按 `message_id` 过滤后再使用 |
| `get_friend_msg_history` | 参数为 `user_id`，非 `chat_id` |
| `NapCatClient.disconnect()` | 设 `destroyed=true`，之后不可重连；正常断开用内部 `closeConnection()` |
| poke notice | 无 `sender` 字段，发起者昵称在 `nick` 字段 |

---

_文档版本：v1.0_  
_创建日期：2026-03-19_  
_维护者：qq-channel 插件开发_
 