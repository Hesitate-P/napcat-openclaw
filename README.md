# @openclaw/napcat-channel

基于 [NapCatQQ](https://github.com/NapNeko/NapCatQQ)（OneBot v11）的 OpenClaw QQ 频道插件。

支持完整消息类型解析、群聊/私聊、输入状态指示、历史消息存储、访问控制等生产级功能。

---

## 目录

- [前置要求](#前置要求)
- [安装](#安装)
- [配置](#配置)
- [功能特性](#功能特性)
- [项目结构](#项目结构)
- [开发](#开发)

---

## 前置要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| [OpenClaw](https://openclaw.ai) | ≥ 2026.3.13 | 主框架 |
| [NapCatQQ](https://github.com/NapNeko/NapCatQQ) | 最新版 | OneBot v11 实现 |
| Node.js | ≥ 20.0.0 | 运行时 |

确保 NapCatQQ 已启动，并开启了 WebSocket 服务端（默认端口 3001）。

---

## 安装

### 1. 克隆插件到 extensions 目录

```bash
cd ~/.openclaw/extensions
git clone <repo-url> napcat-channel
cd napcat-channel
npm install
```

### 2. 注册插件

编辑 `~/.openclaw/openclaw.json`，在 `plugins` 部分添加：

```json
{
  "plugins": {
    "allow": ["napcat-channel"],
    "entries": {
      "napcat-channel": {
        "enabled": true
      }
    }
  }
}
```

### 3. 配置频道

在 `~/.openclaw/openclaw.json` 的 `channels` 部分添加：

```json
{
  "channels": {
    "napcat-channel": {
      "enabled": true,
      "connection": {
        "wsUrl": "ws://127.0.0.1:3001",
        "accessToken": "你的Token"
      },
      "messaging": {
        "blockStreaming": true,
        "textChunkLimit": 2000,
        "chunkMode": "paragraph"
      },
      "typing": {
        "enabled": true,
        "privateChat": "api",
        "groupChat": "nickname",
        "nicknameSuffix": "（输入中）"
      },
      "database": {
        "type": "sqlite",
        "path": "./napcat.db"
      },
      "trigger": {
        "enabled": true,
        "atBot": true,
        "keywords": "机器人,bot"
      },
      "context": {
        "enabled": true,
        "messageCount": 5
      },
      "accessControl": {
        "enabled": false,
        "groupWhitelist": "",
        "userBlacklist": "",
        "adminMode": {
          "enabled": false,
          "privateChat": false,
          "groupChat": false
        }
      },
      "admins": "你的QQ号"
    }
  }
}
```

### 4. 重启 OpenClaw

```bash
openclaw gateway start
```

---

## 配置

所有配置项均可通过 OpenClaw Dashboard 的表单界面修改，无需手动编辑 JSON。

### 连接配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `connection.wsUrl` | string | — | NapCat WebSocket 地址，如 `ws://127.0.0.1:3001` |
| `connection.accessToken` | string | — | 访问令牌，与 NapCat 配置一致，没有可留空 |

### 消息发送

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `messaging.blockStreaming` | boolean | `true` | 启用分块发送，避免长消息被风控 |
| `messaging.textChunkLimit` | number | `2000` | 每块最大字符数 |
| `messaging.chunkMode` | string | `newline` | 分块模式：`length`/`newline`/`paragraph` |

### 输入状态

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `typing.enabled` | boolean | `true` | 是否显示输入状态 |
| `typing.privateChat` | string | `api` | 私聊方式：`api`（QQ 原生）/`none` |
| `typing.groupChat` | string | `nickname` | 群聊方式：`nickname`（修改名片）/`none` |
| `typing.nicknameSuffix` | string | `（输入中）` | 群名片后缀文本 |
| `typing.delayMs` | number | `500` | 收到消息后延迟显示（ms） |

### 触发配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `trigger.enabled` | boolean | `true` | 开启触发判断（关闭则所有消息都触发） |
| `trigger.atBot` | boolean | `true` | 被@时触发 |
| `trigger.keywords` | string | — | 触发关键词，逗号分隔，如 `机器人,bot` |

### 上下文

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `context.enabled` | boolean | `true` | 自动附加群聊历史消息作为上下文 |
| `context.messageCount` | number | `5` | 上下文消息条数 |

### 访问控制

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `accessControl.enabled` | boolean | `false` | 是否启用访问控制 |
| `accessControl.groupWhitelist` | string | — | 允许的群号白名单，逗号分隔，留空=全部允许 |
| `accessControl.userBlacklist` | string | — | 屏蔽的 QQ 号黑名单，逗号分隔 |
| `accessControl.adminMode.enabled` | boolean | `false` | 启用管理员模式 |
| `accessControl.adminMode.privateChat` | boolean | `false` | 私聊仅管理员触发 |
| `accessControl.adminMode.groupChat` | boolean | `false` | 群聊仅管理员触发 |
| `admins` | string | — | 管理员 QQ 号，逗号分隔 |

---

## 功能特性

### 消息类型支持

支持解析 27 种 OneBot 消息类型：文本、图片、文件、语音、视频、表情、@、回复、转发、位置、小程序、音乐分享、Markdown 等。

### 输入状态指示

- **私聊**：调用 `set_input_status` API，450ms 自动刷新保持
- **群聊**：临时修改群名片添加后缀（如「有鱼喵（输入中）」），回复完成后自动恢复
- 引用计数支持并发，多个 Handler 不会互相干扰

### 触发机制

- **@触发**：群聊中 @ 机器人
- **关键词触发**：消息包含配置的关键词
- **戳一戳触发**：戳机器人本身
- **私聊**：始终触发

### 历史消息存储

使用 SQLite（WAL 模式）持久化所有消息，支持按会话查询和分页。

### 回复上下文

自动检测消息中的回复元素，通过 `get_msg` API 获取被回复的消息内容，注入 Agent 上下文。

### 表情名称解析

从 [QFace](https://koishi.js.org/QFace/) 在线获取最新 QQ 表情名称，持久化到本地 `face-map-cache.json`，离线时自动使用缓存。

### 机器人角色感知

自动查询机器人在群中的角色（owner/admin/member），注入 `qq_context` 供 Agent 判断是否有权限执行群管理操作。5 分钟 TTL 缓存。

---

## 项目结构

```
napcat-channel/
├── index.ts                    # 插件入口，注册 OpenClaw Plugin
├── openclaw.plugin.json        # 插件清单
├── package.json
├── tsconfig.json
└── src/
    ├── channel.ts              # ChannelPlugin 接口实现，账号生命周期
    ├── client.ts               # WebSocket 客户端，心跳/重连/API 请求
    ├── config.ts               # Zod Schema，配置验证与转换
    ├── runtime.ts              # OpenClaw runtime 访问接口
    ├── types.ts                # TypeScript 类型定义
    ├── database/
    │   ├── index.ts            # DatabaseManager，SQLite 读写
    │   └── schema.ts           # 数据库表结构定义
    ├── event/
    │   └── notice-handler.ts   # notice 事件 → message 事件转换
    ├── handler/
    │   └── inbound-handler.ts  # 消息处理主逻辑，分发 Agent
    ├── message/
    │   └── parser.ts           # CQ 码解析
    ├── middleware/
    │   ├── access-control.ts   # 白名单/黑名单/管理员模式
    │   └── trigger.ts          # 触发判断
    ├── streaming/
    │   └── typing-indicator.ts # 输入状态管理
    └── utils/
        ├── message-resolver.ts # 消息元素 → 可读文本（27种类型）
        └── userinfo.ts         # 用户昵称查询，5min TTL 缓存
```

---

## 开发

```bash
# 安装依赖
npm install

# 类型检查
npm run typecheck

# 监听模式编译
npm run dev
```

### 已知 NapCat 限制

- `set_essence_msg` 权限不足时仍返回 `retcode=0`（假成功），需通过 `botIsGroupAdmin` 字段提前判断
- `group_id`/`user_id` 参数统一传 `string` 类型
- 群文件通知中 `file` 字段可能是 JSON 字符串，需手动解析

---

_版本：1.0.0 | 协议：MIT_
