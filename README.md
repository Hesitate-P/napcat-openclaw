# OpenClaw NapCat Channel

基于 NapCatQQ (OneBot v11) 的完整功能 QQ 频道插件。

## ✨ 特性

- 📨 **完整消息支持** - 支持文本、图片、文件、表情、语音、视频、@、回复等所有消息类型
- 💾 **历史消息存储** - SQLite 持久化存储所有消息，支持快速查询
- 📤 **Block Streaming** - 边生成边发送，首条消息延迟 < 1.5 秒
- ⌨️ **输入状态显示** - 私聊原生 API + 群聊名片后缀
- 🧠 **智能交互** - 发言决策、情感系统、记忆系统（Phase 2）
- 📁 **文件处理** - 完整的文件上传下载支持

## 📋 开发计划

### Phase 1 - 基础功能（4 周）

- [x] **Week 1**: 项目初始化 + WebSocket 连接
- [ ] **Week 2**: 消息收发
- [ ] **Week 3**: 文件支持 + 数据库
- [ ] **Week 4**: Block Streaming + 输入状态 + 测试

### Phase 2 - 智能交互（4 周）

- [ ] **Week 5-6**: 发言决策 + 情感系统
- [ ] **Week 7-8**: 记忆系统 + 动作系统

### Phase 3 - 高级功能（2 周）

- [ ] **Week 9**: 扩展接口（OCR/语音/翻译）
- [ ] **Week 10**: 性能优化 + 文档

## 🚀 快速开始

### 前置要求

1. **Node.js** >= 20.0.0
2. **NapCatQQ** 已安装并运行
3. **OpenClaw** >= 2026.2.0

### 安装 NapCatQQ

```bash
# 参考 NapCatQQ 官方文档
# https://github.com/NapNeko/NapCatQQ
```

### 配置 NapCatQQ

1. 打开 NapCatQQ 设置
2. 启用 WebSocket 服务端
3. 设置 Access Token
4. 记录 WebSocket 地址（默认：`ws://127.0.0.1:3001`）

### 安装插件

```bash
cd /home/pagurian/.openclaw/workspace/projects/openclaw-napcat-channel
npm install
npm run build
```

### 配置 OpenClaw

在 OpenClaw 配置中添加：

```json5
{
  channels: {
    napcat: {
      enabled: true,
      wsUrl: "ws://127.0.0.1:3001",
      accessToken: "your_token_here",
      blockStreaming: true,
      textChunkLimit: 2000,
      chunkMode: "newline",
      typingIndicator: {
        enabled: true,
        privateChat: "api",
        groupChat: "nickname",
        nicknameSuffix: "（输入中）",
        delayMs: 500
      },
      database: {
        type: "sqlite",
        path: "./napcat.db"
      }
    }
  }
}
```

### 启动

```bash
# 重启 OpenClaw Gateway
openclaw gateway restart
```

## 📖 文档

- [最终项目计划书](./FINAL_PROJECT_PLAN.md)
- [技术可行性分析](./TECHNICAL_ANALYSIS.md)
- [Block Streaming 验证](./STREAMING_VERIFICATION.md)
- [输入状态显示方案](./TYPING_INDICATOR.md)

## 🔧 开发

### 项目结构

```
openclaw-napcat-channel/
├── src/
│   ├── index.ts                    # 插件入口
│   ├── channel.ts                  # Channel 主实现
│   ├── client.ts                   # WebSocket 客户端
│   ├── config.ts                   # 配置 Schema
│   ├── types.ts                    # 类型定义
│   ├── database/                   # 数据库模块
│   ├── message/                    # 消息处理模块
│   ├── file/                       # 文件处理模块
│   ├── streaming/                  # Block Streaming 模块
│   ├── intelligence/               # 智能交互模块
│   └── admin/                      # 管理功能模块
├── openclaw.plugin.json            # 插件清单
├── package.json                    # 依赖管理
├── tsconfig.json                   # TypeScript 配置
└── README.md                       # 使用说明
```

### 构建

```bash
# 开发模式（监听）
npm run dev

# 生产构建
npm run build

# 类型检查
npm run typecheck

# 清理
npm run clean
```

## 📝 参考资料

- [NapCatQQ](https://github.com/NapNeko/NapCatQQ)
- [NapCat API](https://napcat.apifox.cn/)
- [OneBot v11](https://github.com/botuniverse/onebot-11)
- [OpenClaw Docs](https://docs.openclaw.ai/)
- [MaiBot](https://github.com/Mai-with-u/MaiBot)

## ⚠️ 注意事项

1. **不要同时运行 openclaw_qq 和此插件** - 会导致消息冲突
2. **确保 NapCatQQ 版本兼容** - 建议使用最新版
3. **首次使用需要配置** - 正确设置 WebSocket 地址和 Token
4. **数据库文件** - 默认保存在插件目录，可配置自定义路径

## 📄 许可证

MIT License

---

_版本：v0.1.0_  
_创建日期：2026-03-05_  
_作者：Hesitate_P_
