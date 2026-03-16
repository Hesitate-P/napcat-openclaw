# NapCat OpenClaw Extension

`napcat-openclaw` 是一个面向 OpenClaw 的 NapCat / OneBot v11 Channel 插件，负责把 QQ 私聊、群聊、notice 事件和出站消息统一接入 OpenClaw runtime。

## 当前状态

- 已完成 Phase 1 需求能力，并完成一轮工程收口
- `channel.ts` 只保留账号 wiring，入站消息主流程已拆入 `src/messaging.ts`
- `NapCatClient` 收敛为 5 类稳定事件：`connected`、`disconnected`、`heartbeat`、`message`、`error`
- 提供最小可运行测试、schema 校验脚本和 GitHub Actions CI

## 能力边界

- 该仓库只负责 Channel 适配，不承载人格、记忆或业务策略层
- 主动副作用命令统一由 `napcat-tools` 仓库承担
- 入站上下文采用隐式平台提示，不再注入显式 XML 样式元数据块

## 主要能力

- 私聊、群聊消息收发
- notice 事件归一化为可消费消息
- Block Streaming 与输入状态联动
- SQLite 消息持久化
- 群上下文拉取、访问控制、管理员模式
- 文本、图片、文件、语音、视频等出站封装

## 环境要求

- Node.js 20+
- 可连接的 NapCat / OneBot v11 WebSocket 服务
- OpenClaw runtime

## 安装与构建

```bash
npm install
npm run build
```

## 开发命令

```bash
npm run typecheck
npm run test
npm run validate:schema
npm run ci
```

说明：

- `test` 会先编译测试入口到 `.test-dist/`，再执行 `node:test`
- `validate:schema` 会校验 `openclaw.plugin.json` 与 `NapCatConfigSchema` 的字段结构是否漂移
- `ci` 会串行执行 schema 校验、typecheck、test、build

## 配置说明

插件配置以 `src/config.ts` 中的 `NapCatConfigSchema` 为准，分为以下分组：

- `connection`：NapCat WebSocket 地址与访问令牌
- `messaging`：分块发送策略
- `typing`：私聊/群聊输入状态
- `database`：SQLite 路径
- `trigger`：@与关键词触发
- `context`：群上下文条数
- `accessControl`：白名单、黑名单、管理员模式
- `admins`：管理员 QQ 列表
- `media`：宿主机/容器共享媒体目录

## 仓库结构

```text
src/
  channel.ts                # Channel 入口与账号生命周期 wiring
  client.ts                 # NapCat WebSocket 客户端
  messaging.ts              # 入站消息编排
  outbound.ts               # 出站目标解析与错误模型
  config.ts                 # Zod 配置 schema
  types.ts                  # 核心类型
  message/
    parser.ts               # CQ 码解析与图片 URL 提取
    notice-normalizer.ts    # notice -> message 归一化
    trigger.ts              # 触发逻辑
    context-history.ts      # 群历史上下文
  utils/
    message-resolver.ts     # 消息元素转文本与展示归一化
    userinfo.ts             # 用户昵称查询与缓存
  database/
    index.ts                # SQLite 管理器
    schema.ts               # 数据表定义
```

说明：

- 已移除未接入主链路的 `src/utils/markdown.ts`
- 已移除 `src/message/parser.ts` 中未进入主链路的大量历史解析接口，只保留 CQ 解析与图片提取
- 当前目录按职责分为 `message / utils / database / streaming` 四类子模块，入口编排保持在 `channel.ts` 与 `messaging.ts`

## 发布前自检

1. 确认 NapCat WebSocket 可连通，`wsUrl` 与 `accessToken` 正确。
2. 执行 `npm run ci`。
3. 在 OpenClaw 中加载插件并验证私聊、群聊、notice、typing、撤回等关键链路。
4. 如启用共享媒体目录，确认宿主机与容器目录映射一致。

## 相关仓库

- [NapCatQQ](https://github.com/NapNeko/NapCatQQ)
- [OpenClaw](https://github.com/openclaw/openclaw)
- [napcat-tools](https://github.com/Hesitate-P/napcat-tools)

## 许可证

MIT
