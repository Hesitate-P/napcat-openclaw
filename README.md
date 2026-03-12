# NapCat OpenClaw Extension

基于 NapCatQQ 的完整功能 QQ 频道插件，让 OpenClaw Agent 能够通过 QQ 与你互动！

## 核心功能

### 消息收发
- 完整支持私聊和群聊消息收发
- 支持 27 种 QQ 消息类型（文本、图片、语音、视频、文件、表情、戳一戳等）
- Block Streaming 分块发送，边生成边发送
- 输入状态显示（私聊原生 API + 群聊名片后缀）

### 消息持久化
- SQLite 数据库存储所有历史消息
- 支持按会话、用户、时间范围查询
- 自动缓存群成员信息（@时自动获取昵称）

### 访问控制
- 群号白名单（只响应指定群聊）
- 用户黑名单（屏蔽指定 QQ 号）
- 管理员模式（可分别设置私聊和群聊）

### 智能交互
- 群聊上下文自动获取（最近 N 条历史消息）
- 多模态支持（Agent 可直接看到图片和 URL）
- 完整的 QQ 表情映射（140+ 表情）

## 快速开始

### 前置要求
- Node.js 18+
- NapCatQQ 插件已安装并运行
- OpenClaw 框架已安装

### 安装步骤

1. 克隆仓库
```bash
git clone https://github.com/Hesitate-P/napcat-openclaw.git
cd napcat-openclaw
```

2. 安装依赖
```bash
npm install
```

3. 构建插件
```bash
npm run build
```

4. 在 OpenClaw Dashboard 中配置插件路径

### 配置说明

插件配置分为 9 个分组：

**连接配置**
- WebSocket 地址（默认：ws://localhost:3000/ws）
- 自动重连、心跳保活

**消息发送**
- 默认发送配置
- 表情映射

**输入状态**
- 私聊输入状态开关
- 群聊名片修改开关
- 状态更新间隔（默认 450ms）

**数据库**
- SQLite 数据库路径
- 自动备份配置

**触发配置**
- @触发开关
- 关键词触发列表
- 戳一戳触发开关

**上下文**
- 群聊历史消息数量（默认 5 条）

**访问控制**
- 群号白名单
- 用户黑名单

**管理员**
- 管理员 QQ 号列表
- 私聊管理员模式开关
- 群聊管理员模式开关

**媒体存储**
- 图片/语音/文件存储路径

## 项目结构

```
napcat-openclaw/
├── src/
│   ├── channel.ts          # Channel 主入口
│   ├── client.ts           # WebSocket 客户端
│   ├── config.ts           # 配置 Schema
│   ├── types.ts            # TypeScript 类型定义
│   ├── database/           # 数据库管理
│   │   ├── index.ts        # 数据库管理器
│   │   └── schema.ts       # 数据库表结构
│   ├── message/            # 消息处理
│   │   └── parser.ts       # 消息解析器
│   ├── streaming/          # 流式传输
│   │   └── typing-indicator.ts  # 输入状态显示
│   └── utils/              # 工具函数
│       ├── markdown.ts     # Markdown 转换
│       ├── message-resolver.ts  # 消息解析
│       └── userinfo.ts     # 用户信息缓存
├── openclaw.plugin.json    # 插件清单
├── package.json
└── tsconfig.json
```

## 开发指南

### 开发模式
```bash
npm run dev
```

### 构建
```bash
npm run build
```

### 测试
```bash
npm test
```

## 技术架构

```
┌─────────────────────────────────────┐
│        OpenClaw Gateway             │
│   (模型调度 / 会话管理 / Agent 路由)   │
└─────────────────────────────────────┘
                    ↕ Plugin SDK
┌─────────────────────────────────────┐
│    NapCat OpenClaw Channel Plugin   │
│  ┌───────────┐  ┌───────────────┐   │
│  │ WebSocket │  │  消息处理引擎 │   │
│  │  客户端   │  │               │   │
│  └───────────┘  └───────────────┘   │
│  ┌───────────┐  ┌───────────────┐   │
│  │  数据库   │  │  文件处理器   │   │
│  │  管理器   │  │               │   │
│  └───────────┘  └───────────────┘   │
└─────────────────────────────────────┘
                    ↕ WebSocket
┌─────────────────────────────────────┐
│      NapCatQQ (OneBot v11)          │
└─────────────────────────────────────┘
                    ↕ QQ 协议
┌─────────────────────────────────────┐
│           QQ Network                │
└─────────────────────────────────────┘
```

## 开发进度

### Phase 1 - 基础功能 ✅ 已完成
- WebSocket 连接管理（自动重连/心跳保活）
- 消息接收（私聊/群聊）
- 消息发送（文本/图片/表情/文件/语音/视频）
- 消息解析（27 种消息类型）
- 数据库存储（SQLite 持久化）
- 输入状态显示
- 访问控制（白名单/黑名单/管理员模式）
- 群聊上下文自动获取

### Phase 2 - 智能交互 ⏳ 准备开发
- 发言决策系统
- 情感系统
- 动作系统
- 学习系统

### Phase 3 - 高级功能 ⏳ 准备开发
- 性能优化
- 图片 OCR
- AI 语音生成

## 依赖项目

- [NapCatQQ](https://github.com/NapNeko/NapCatQQ) - QQ 机器人框架
- [OpenClaw](https://github.com/openclaw/openclaw) - AI Agent 框架
- [napcat-tools](https://github.com/Hesitate-P/napcat-tools) - NapCat 主动 API 技能

## 许可证

MIT License

## 致谢

感谢 NapCatQQ 团队和 OpenClaw 团队提供的优秀框架！
