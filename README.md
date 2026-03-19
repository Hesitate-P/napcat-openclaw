# NapCat OpenClaw Extension

基于 NapCatQQ (OneBot v11) 的完整功能 QQ 频道插件，让 OpenClaw Agent 能够通过 QQ 与你互动。

## 特性

- **完整消息支持** — 27 种 QQ 消息类型（文本、图片、语音、视频、文件、表情、戳一戳等）
- **Block Streaming** — 边生成边发送，实时流式回复
- **输入状态显示** — 私聊原生 `set_input_status` API + 群聊名片后缀
- **群聊上下文** — 自动获取最近 N 条历史消息，结构化传递给 Agent
- **回复上下文** — 自动解析被回复消息内容，随当前消息一并传递
- **通知事件转换** — 戳一戳/群文件/精华/禁言/成员变动等转换为结构化消息
- **消息持久化** — SQLite 存储完整消息历史（6 张表，7 个查询接口）
- **访问控制** — 群号白名单、用户黑名单、管理员模式
- **稳定连接** — 指数退避自动重连、45s 心跳保活、180s 强制重连

## 快速开始

### 前置要求

- Node.js 18+
- NapCatQQ 已安装并运行
- OpenClaw 已安装

### 安装

```bash
git clone https://github.com/Hesitate-P/napcat-openclaw.git ~/.openclaw/extensions/qq-channel
cd ~/.openclaw/extensions/qq-channel
npm install && npm run build
```

然后在 OpenClaw Dashboard 中将插件路径指向 `~/.openclaw/extensions/qq-channel`。

## 配置说明

在 Dashboard 中配置以下 9 个分组：

| 分组 | 关键配置 |
|------|----------|
| **连接** | `wsUrl`（NapCat WebSocket 地址）、`accessToken` |
| **消息发送** | `blockStreaming`（分块发送开关）、`textChunkLimit`（每块字符上限）、`chunkMode` |
| **输入状态** | `enabled`、`privateChat`（api/none）、`groupChat`（nickname/none）、`nicknameSuffix` |
| **数据库** | `type`（sqlite）、`path`（数据库文件路径） |
| **触发** | `enabled`、`atBot`（被@触发）、`keywords`（关键词列表） |
| **上下文** | `enabled`、`messageCount`（历史消息条数，默认 5） |
| **访问控制** | `groupWhitelist`、`userBlacklist`、`adminMode` |
| **管理员** | `admins`（管理员 QQ 号列表） |
| **媒体存储** | `sharedHostDir`、`sharedContainerDir` |

## 项目结构

```
qq-channel/
├── src/
│   ├── channel.ts              # Channel 主入口
│   ├── client.ts               # WebSocket 客户端（重连/心跳）
│   ├── config.ts               # 配置 Schema（Zod）
│   ├── types.ts                # TypeScript 类型定义
│   ├── runtime.ts              # OpenClaw Plugin SDK 运行时桥接
│   ├── database/
│   │   ├── index.ts            # 数据库管理器（7 个查询接口）
│   │   └── schema.ts           # SQLite 表结构（6 张表）
│   ├── event/
│   │   └── notice-handler.ts   # 通知事件转换（poke/群文件/禁言等）
│   ├── handler/
│   │   └── inbound-handler.ts  # 入站消息处理（触发/上下文/分发）
│   ├── message/
│   │   └── parser.ts           # CQ 码/文件信息解析
│   ├── middleware/
│   │   ├── access-control.ts   # 访问控制（白名单/黑名单/管理员）
│   │   └── trigger.ts          # 触发判断（@/关键词/戳一戳）
│   ├── streaming/
│   │   └── typing-indicator.ts # 输入状态（私聊 API + 群聊名片）
│   └── utils/
│       ├── markdown.ts         # Markdown 工具
│       ├── message-resolver.ts # 消息元素→文本解析（27 种类型）
│       └── userinfo.ts         # 用户昵称缓存（5min TTL）
├── openclaw.plugin.json        # 插件清单
├── package.json
└── tsconfig.json
```

## 支持的消息类型

### 接收（解析为可读文本）

| 类型 | 说明 |
|------|------|
| `text` | 纯文本 |
| `at` | @提及，自动解析昵称 |
| `reply` | 回复引用，自动获取被回复内容 |
| `face` | QQ 表情，140+ 表情完整映射 |
| `mface` | 商城表情，保留表情 ID |
| `dice` | 骰子，保留点数 |
| `rps` | 猜拳，显示石头/剪刀/布 |
| `poke` | 戳一戳，包含来源和目标昵称 |
| `image` | 图片，保留 URL |
| `record` | 语音，保留 URL/大小 |
| `video` | 视频，保留 URL/大小 |
| `file` | 文件，保留文件名/ID/大小 |
| `json` | JSON 卡片 |
| `xml` | XML 卡片 |
| `forward` | 转发消息 |
| `music` | 音乐分享，显示歌名/歌手 |
| `node` | 合并转发，展开摘要 |
| `markdown` | Markdown，提取纯文本 |
| `contact` | 联系人名片 |
| `location` | 位置分享，显示坐标/地址 |
| `share` | 链接分享 |
| `miniapp` | 小程序，解析标题 |
| `tts` | TTS 语音，显示文本 |

### 发送

- 文本、图片（URL/Base64）、表情（QQ 表情 ID）
- 文件、语音、视频 — 通过 [napcat-tools](https://github.com/Hesitate-P/napcat-tools) skill 发送

### 通知事件（转换为消息传给 Agent）

戳一戳、群文件上传、精华消息、群成员增减、管理员变动、群禁言、群名片变更、表情回应

## 技术架构

```
┌──────────────────────────────────┐
│        OpenClaw Gateway          │
│  (模型调度 / 会话管理 / Agent 路由) │
└──────────────────────────────────┘
              ↕ Plugin SDK
┌──────────────────────────────────┐
│   NapCat OpenClaw Channel Plugin │
│  ┌──────────┐  ┌───────────────┐ │
│  │WebSocket │  │  消息处理引擎 │ │
│  │  客户端  │  │  (27种类型)   │ │
│  └──────────┘  └───────────────┘ │
│  ┌──────────┐  ┌───────────────┐ │
│  │ SQLite   │  │  输入状态     │ │
│  │ 数据库   │  │  显示模块     │ │
│  └──────────┘  └───────────────┘ │
└──────────────────────────────────┘
              ↕ WebSocket (OneBot v11)
┌──────────────────────────────────┐
│      NapCatQQ                    │
└──────────────────────────────────┘
              ↕ QQ 协议
┌──────────────────────────────────┐
│           QQ Network             │
└──────────────────────────────────┘
```

## 配套 Skill

本插件配套 [napcat-tools](https://github.com/Hesitate-P/napcat-tools) skill，提供 Agent 主动调用 NapCat API 的能力：

- 发送消息（私聊/群聊）
- 查询历史消息
- 获取群成员列表
- 文件上传下载
- 撤回消息、群禁言、踢人、群公告、精华消息管理

## 开发

```bash
npm run build   # 构建
npx tsc --noEmit  # 类型检查
```

## 开发进度

- **Phase 1** ✅ 基础功能全部完成
- **Phase 2** ⏳ 智能交互（发言决策/情感系统）
- **Phase 3** ⏳ 高级功能（图片 OCR/AI 语音）

详细进度见 [FINAL_PROJECT_PLAN.md](./FINAL_PROJECT_PLAN.md)。

## 相关项目

- [NapCatQQ](https://github.com/NapNeko/NapCatQQ) — QQ 机器人框架
- [OpenClaw](https://github.com/openclaw/openclaw) — AI Agent 框架
- [napcat-tools](https://github.com/Hesitate-P/napcat-tools) — 配套主动 API skill

## 许可证

MIT
