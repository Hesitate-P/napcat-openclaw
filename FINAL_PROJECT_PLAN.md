# OpenClaw NapCat Channel 最终项目计划书

_版本：v8.4 (Phase 1 全部完成 - Bug修复#19-24 + 回复上下文 + SDK元数据调查)_  
_创建日期：2026-03-05_  
_最后更新：2026-03-19_  
_状态：Phase 1 全部完成（含所有消息类型解析、管理功能、bug修复、回复上下文），准备进入 Phase 2_

---

## 📋 执行摘要

### 项目名称
**OpenClaw NapCat Channel** - 基于 NapCatQQ 的完整功能 QQ 频道插件

### 核心价值
1. ✅ **完整消息支持** - 支持所有 QQ 消息类型的收发和解析（27 种类型全部实现）
2. ✅ **历史消息存储** - 使用 SQLite 持久化存储所有消息
3. ✅ **Block Streaming** - 边生成边发送
4. ✅ **输入状态显示** - 私聊原生 API + 群聊名片后缀
5. ⏳ **智能交互** - 借鉴 MaiBot 理念，实现类人交互（Phase 2）

### 开发周期
**10 周**（Phase 1: 4 周 ✅ + Phase 2: 4 周 ⏳ + Phase 3: 2 周 ⏳）

---

## 二、功能需求与完成状态

### 2.1 Phase 1 - 基础功能（4 周）✅ 已完成

#### 2.1.1 连接管理 (P0) ✅ 已完成
- [x] WebSocket 客户端实现
- [x] 自动重连机制（指数退避）
- [x] 心跳保活（45 秒检查，180 秒强制重连）
- [x] 连接状态管理
- [ ] ~~消息队列缓存（最多 200 条）~~ **未实现**（客户端无消息队列，由 OpenClaw gateway 负责）

#### 2.1.2 基础触发判断 (P0) ✅ 已完成
- [x] 被@触发
- [x] 关键词触发

#### 2.1.3 消息接收 (P0) ✅ 已完成
- [x] 私聊消息接收
- [x] 群聊消息接收
- [x] 消息元素完整解析（27 种类型全部实现）：
  - [x] 文本 (text)
  - [x] 图片 (image) - 保留 URL/描述
  - [x] 语音 (record) - 保留 URL/文件大小
  - [x] 视频 (video) - 保留 URL/文件大小
  - [x] 文件 (file) - 保留文件名/ID/大小/URL
  - [x] @提及 (at) - 自动解析昵称
  - [x] 回复 (reply) - 保留消息 ID
  - [x] QQ 表情 (face) - 140+ 表情完整映射
  - [x] 商城表情 (mface) - 保留表情 ID
  - [x] 骰子 (dice) - 保留点数结果
  - [x] 石头剪刀布 (rps) - 保留结果
  - [x] 戳一戳 (poke) - 保留来源和目标
  - [x] JSON 卡片 (json) - 显示为[卡片消息]
  - [x] XML 卡片 (xml) - 显示为[卡片消息]
  - [x] 转发消息 (forward) - 显示为[转发消息]
  - [x] 音乐分享 (music) - 显示歌曲名/歌手/平台
  - [x] 合并转发 (node) - 展开发送者和内容摘要
  - [x] Markdown (markdown) - 提取纯文本展示
  - [x] 联系人分享 (contact) - 显示好友/群聊名片 ID
  - [x] 位置分享 (location) - 显示标题/地址/坐标
  - [x] 链接分享 (share) - 显示标题和 URL
  - [x] 小程序 (miniapp) - 解析 JSON 内嵌标题
  - [x] TTS 语音 (tts) - 显示文本内容
- [x] 原始消息保留 (raw_message/CQ 码)
- [x] 发送者信息解析
- [x] 群成员信息缓存（@时自动获取昵称）

#### 2.1.4 历史消息存储 (P0) ✅ 已完成
- [x] SQLite 数据库初始化
- [x] 消息表（messages/message_elements）
- [x] 用户表（users）
- [x] 群聊表（groups）
- [x] 群成员表（group_members）
- [x] 配置表（config）
- [x] 消息保存接口（saveMessage/saveMessageWithElements）
- [x] 消息查询接口：
  - [x] getRecentMessages - 查询最近消息
  - [x] getMessagesByUser - 按用户查询
  - [x] getMessagesByTimeRange - 按时间范围查询
  - [x] getMessageById - 按消息 ID 查询
  - [x] getMessagesBySession - 按会话查询
  - [x] getSessionList - 获取所有会话列表
  - [x] getMessagesNotInOpenClawHistory - 查询 OpenClaw 历史外的消息

#### 2.1.5 消息发送 (P0) ✅ 已完成
- [x] 发送文本消息
- [x] 发送图片消息 (URL/Base64)
- [x] 发送表情消息 (QQ 表情)
- [x] 发送文件消息（群文件/私聊文件）- 通过 napcat-tools skill
- [x] 发送语音消息 - 通过 napcat-tools skill
- [x] 发送视频消息 - 通过 napcat-tools skill
- [x] 发送合并消息 (多元素)
- [x] **Block Streaming 分块发送**
- [x] **输入状态显示** ✅ (2026-03-11 完成)
  - [x] 私聊：set_input_status API（每 450ms 持续发送保持状态）
  - [x] 群聊：修改群名片后缀"（输入中）"
  - [x] 发送完成后恢复状态
  - [x] 并发处理（计数器机制）
  - [x] 定时器清理机制

#### 2.1.6 文件处理 (P0) ✅ 已完成
- [x] 文件信息解析（接收时）
- [x] 图片 URL 获取（get_image）
- [x] 语音 URL 获取（get_record）
- [x] 文件上传（群文件/私聊文件）- 通过 napcat-tools skill 实现
- [x] 文件下载 - 通过 napcat-tools skill 实现
- [x] 本地路径/URL/Base64 转换 - 通过 napcat-tools skill 实现

#### 2.1.7 访问控制 (P0) ✅ 已完成（2026-03-11）
- [x] 群号白名单（只响应指定群聊）
- [x] 用户黑名单（屏蔽指定 QQ 号）
- [x] 管理员模式
  - [x] 私聊管理员开关（开启后只响应管理员私聊）
  - [x] 群聊管理员开关（开启后只响应管理员群消息）
  - [x] 管理员 QQ 号列表配置

#### 2.1.8 配置优化 (P0) ✅ 已完成（2026-03-11）
- [x] 从扁平化配置改为嵌套对象结构
- [x] 9 个配置分组（连接、消息发送、输入状态、数据库、触发、上下文、访问控制、管理员、媒体存储）
- [x] Dashboard 分组表单显示
- [x] uiHints 标签、占位符、敏感字段标记
- [x] 配置迁移脚本

#### 2.1.9 群聊上下文 (P0) ✅ 已完成（2026-03-11）
- [x] 自动获取最近 N 条历史消息
- [x] 可配置消息数量（默认 5 条）
- [x] 完整消息解析（图片、表情、文件、@等）

#### 2.1.10 多模态能力提示 (P0) ✅ 已完成（2026-03-11）
- [x] AGENTS.md 添加多模态说明
- [x] system_instruction 添加多模态提示
- [x] Agent 可直接看到图片和 URL

#### 2.1.11 基础管理功能 (P1) ✅ 已完成（2026-03-19）
- [x] 消息撤回（delete_msg）
- [x] 消息详情获取（get_msg）
- [x] 群禁言/解禁（set_group_ban，duration=0 解禁）
- [x] 群踢人（set_group_kick，支持拒绝再次加群）
- [x] 群公告（发送 _send_group_notice / 获取 _get_group_notice / 删除 _del_group_notice）
- [x] 精华消息（设置 set_essence_msg / 移出 delete_essence_msg / 获取列表 get_essence_msg_list）

> 以上均通过 napcat-tools skill（v3.0）实现，Agent 可直接调用。

### 2.2 Phase 2 - 智能交互（4 周）⏳ 准备开发

#### 2.2.1 发言决策系统 (P1)
- [ ] 触发判断（是否回复）
- [ ] 时机选择（何时回复）
- [ ] 话题跟踪

#### 2.2.2 情感系统 (P2)
- [ ] 记忆系统
- [ ] 个性化回复

#### 2.2.3 动作系统 (P2)
- [ ] 表情回应
- [ ] 戳一戳（主动/被动）
- [ ] 群打卡
- [ ] 点赞

#### 2.2.4 学习系统 (P3)
- [ ] 群友说话风格模仿
- [ ] 黑话学习
- [ ] 常用语统计

### 2.3 Phase 3 - 高级功能（2 周）⏳ 准备开发

#### 2.3.1 性能优化 (P2)
- [ ] 数据库索引优化
- [ ] 消息缓存
- [ ] 并发控制

#### 2.3.2 扩展接口
- [ ] AI 语音生成

---

## 四、开发计划

### Phase 1 - 基础功能（4 周）✅ 已完成（2026-03-06）

#### Week 1: 项目初始化 + WebSocket 连接 ✅
| 天数 | 任务 | 交付物 | 状态 |
|------|------|--------|------|
| Day 1 | 项目初始化 | 项目结构/package.json | ✅ |
| Day 2 | 插件清单配置 | openclaw.plugin.json | ✅ |
| Day 3 | WebSocket 客户端 | client.ts (可连接) | ✅ |
| Day 4 | Channel 主框架 | channel.ts (基础框架) | ✅ |
| Day 5 | 测试连接 | 可连接 NapCat | ✅ |

#### Week 2: 消息收发 ✅
| 天数 | 任务 | 交付物 | 状态 |
|------|------|--------|------|
| Day 1 | 消息接收处理 | 接收私聊消息 | ✅ |
| Day 2 | 群消息接收 | 接收群消息 | ✅ |
| Day 3 | 消息解析器 | parser.ts (完整支持所有消息类型) | ✅ |
| Day 4 | 消息发送 | sendText 实现 | ✅ |
| Day 5 | 多元素消息 | 发送图片/表情 | ✅ |

#### Week 3: 文件支持 + 数据库 ✅
| 天数 | 任务 | 交付物 | 状态 |
|------|------|--------|------|
| Day 1 | 数据库 Schema | schema.ts | ✅ |
| Day 2 | 数据库管理器 | database/index.ts | ✅ |
| Day 3 | 消息持久化 | saveMessage/saveMessageWithElements | ✅ |
| Day 4 | 文件信息解析 | 接收时保留完整信息 | ✅ |
| Day 5 | 数据库查询接口 | 7 个查询方法 | ✅ |

#### Week 4: 代码清理 + 优化 ✅
| 天数 | 任务 | 交付物 | 状态 |
|------|------|--------|------|
| Day 1 | 清理冗余代码 | 删除空目录/未使用变量 | ✅ |
| Day 2 | 修复 TypeScript 错误 | 通过严格模式检查 | ✅ |
| Day 3 | 更新依赖 | package.json 版本更新 | ✅ |
| Day 4 | 完善表情映射 | 140+ QQ 表情完整对照表 | ✅ |
| Day 5 | 文档更新 | FINAL_PROJECT_PLAN.md v5.0 | ✅ |

#### Week 5-6: 输入状态 + 文件操作 + 访问控制 + 配置优化 ✅ (2026-03-11 完成)
| 天数 | 任务 | 交付物 | 状态 |
|------|------|--------|------|
| Day 1 | 删除旧 TypingIndicator 类 | 清理失效代码 | ✅ |
| Day 2 | 重写输入状态模块 | typing-indicator.ts (简化版) | ✅ |
| Day 3 | 私聊输入状态 | set_input_status API + 定时器保持 | ✅ |
| Day 4 | 群聊输入状态 | 照抄旧 qq 插件名片修改逻辑 | ✅ |
| Day 5 | 测试优化 | 间隔调整为 450ms | ✅ |
| Day 6 | 文件上传/下载 | napcat-tools skill | ✅ |
| Day 7 | 文件发送测试 | 语音、视频、文件 | ✅ |
| Day 8 | 查询历史消息 | query_messages 命令 | ✅ |
| Day 9 | 群聊上下文 | 自动获取历史消息 | ✅ |
| Day 10 | 访问控制 | 白名单/黑名单/管理员模式 | ✅ |
| Day 11 | 配置优化 | 嵌套结构 + Dashboard 分组 | ✅ |
| Day 12 | 多模态提示 | AGENTS.md + system_instruction | ✅ |

**Phase 1 验收标准**：
- [x] 可稳定连接 NapCat（断线自动重连）
- [x] 可接收私聊和群聊消息
- [x] 可发送文本/图片/表情消息
- [x] 消息自动保存到数据库
- [x] 可查询最近消息（按会话/用户/时间）
- [x] 支持主要 OneBot v11 消息类型（16 种已实现，8 种静默跳过）
- [x] 消息解析保留完整 URL 和信息
- [x] 数据库功能完整（SQLite/7 张表/7 个查询接口）
- [x] 戳一戳触发正确（戳机器人时响应）
- [x] 戳一戳昵称解析（显示用户昵称而非 QQ 号）
- [x] Block Streaming 正常工作
- [x] 输入状态显示（私聊 + 群聊）
- [x] 文件上传/下载功能（通过 napcat-tools skill）
- [x] 访问控制（白名单/黑名单/管理员模式）
- [x] 配置优化（嵌套结构 + Dashboard 分组表单）
- [x] 群聊上下文自动获取
- [x] 多模态能力提示

---

## 五、Phase 1 完成总结（2026-03-11 23:25）

### 5.0 已知问题列表 🔴

| 编号 | 问题描述 | 优先级 | 状态 | 解决进度 |
|------|----------|--------|------|----------|
| #1 | OpenClaw Dashboard 无法以表单形式更改 napcat 插件配置 | P1 | 🟢 已完成 | 导入 buildChannelConfigSchema 包装 Zod schema |
| #2 | 触发判断失效，@和戳一戳操作无反应 | P0 | 🟢 已完成 | @触发和戳一戳触发都已修复 |
| #3 | 缺少 OpenClaw Skill，Agent 无法使用主动 API | P1 | 🟢 已完成 | Skill 已创建在 workspace/skills/napcat-tools/ |
| #4 | 戳一戳消息需要解析用户名称和 ID 传给 Agent | P1 | 🟢 已完成 | 戳一戳消息包含完整信息（用户名、ID、被戳者 ID） |
| #5 | 戳一戳消息昵称解析 | P1 | 🟢 已完成 | 使用 userinfo.ts 工具函数，支持缓存和多种 API 获取昵称 |
| #6 | 戳一戳消息自身过滤条件错误 | P0 | 🟢 已完成 | 从 `[动作] 用户戳了你一下` 改为 `[戳一戳]` |
| #7 | Skill 文件位置错误 | P1 | 🟢 已完成 | 从 `extensions/napcat/skills/` 移至 `workspace/skills/napcat-tools/` |
| #8 | Dashboard 配置无中文解释 | P1 | 🟢 已完成 | 使用 .describe() 添加中文说明，参考 qq 插件 |
| #9 | 配置格式迁移（嵌套→扁平化） | P1 | 🟢 已完成 | database.type→databaseType，配置已迁移 |
| #10 | 缺少访问控制（白名单/黑名单/管理员模式） | P0 | 🟢 已完成 | Phase 1 最后一个任务已完成 |
| #11 | 配置可读性差（扁平化结构） | P1 | 🟢 已完成 | 改为嵌套对象结构，Dashboard 分组显示 |
| #12 | Agent 忘记多模态能力 | P0 | 🟢 已完成 | AGENTS.md + system_instruction 添加提示 |
| #13 | Markdown 转换修改原始内容 | P1 | 🟢 已完成 | 删除 smartFormat 调用 |
| #14 | `set_input_status` user_id 类型错误（传 number，API 要求 string） | P1 | 🟢 已完成 (2026-03-19) | `typing-indicator.ts` 改为 `String(userId)` |
| #15 | `NapCatClient.disconnect()` 设 `destroyed=true` 导致断线重连彻底失效 | P0 | 🟢 已完成 (2026-03-19) | 拆分为 `disconnect()`（永久销毁）和私有 `closeConnection()`（允许重连），`handleClose` 改用后者 |
| #16 | `notice-handler.ts` convertPoke 用 `payload.sender?.nickname` 但 poke notice 无 sender 字段 | P1 | 🟢 已完成 (2026-03-19) | 改为 `payload.nick ?? payload.sender?.nickname ?? String(userId)` |
| #17 | `fetchGroupContext` 未过滤当前消息，Agent 收到重复上下文 | P1 | 🟢 已完成 (2026-03-19) | 多取一条后过滤 `message_id === currentMsgId` |
| #18 | `napcat-tools.js` `get_group_notice` 解析只读 `n.message?.text`，无 fallback | P2 | 🟢 已完成 (2026-03-19) | 增加 `?? n.text ?? n.content ?? ''` 兜底 |

**问题#10 解决方案：**
- ✅ 在 config.ts 中添加访问控制配置项
- ✅ 在 channel.ts 中实现访问控制逻辑
- ✅ 支持群白名单、用户黑名单、管理员模式
- ✅ 管理员模式可分别设置私聊和群聊

**问题#11 解决方案：**
- ✅ 从扁平化配置改为嵌套对象结构（connection、messaging、typing 等 9 个分组）
- ✅ 更新 config.ts、channel.ts、openclaw.plugin.json
- ✅ Dashboard 显示分组表单，带标签、占位符、敏感字段标记
- ✅ 添加 toNestedConfig() 函数兼容内部使用

**问题#12 解决方案：**
- ✅ 在 AGENTS.md 中添加多模态能力说明
- ✅ 在每条消息的 system_instruction 中添加多模态提示
- ✅ Agent 不会再忘记自己可以直接看图片和 URL

**问题#13 解决方案：**
- ✅ 删除 smartFormat 函数调用
- ✅ 发送消息时不再修改原始内容，避免过滤掉不该改的字符

### 5.1 已完成功能

#### 核心功能 ✅
- ✅ WebSocket 连接管理（自动重连/心跳保活）
- ✅ 消息接收（私聊/群聊）
- ✅ 消息发送（文本/图片/表情/文件/语音/视频）
- ✅ 消息解析（支持 27 种消息类型）
- ✅ 数据库存储（SQLite 持久化）
- ✅ 群成员信息缓存
- ✅ **输入状态显示** (2026-03-11 完成)
  - ✅ 私聊：set_input_status API，每 450ms 持续发送保持状态
  - ✅ 群聊：修改群名片添加"（输入中）"后缀
  - ✅ 并发处理（计数器机制）
  - ✅ 自动恢复（发送完成后恢复原状态）
  - ✅ 断开连接时清理所有状态
- ✅ **文件操作** (2026-03-11 完成 - 已测试)
  - ✅ 文件上传（群文件/私聊文件）- 通过 napcat-tools skill ✅
  - ✅ 文件下载 - 通过 napcat-tools skill
  - ✅ 语音发送 - 通过 napcat-tools skill ✅
  - ✅ 视频发送 - 通过 napcat-tools skill ✅
- ✅ **访问控制** (2026-03-11 完成)
  - ✅ 群号白名单
  - ✅ 用户黑名单
  - ✅ 管理员模式（私聊/群聊分别配置）
- ✅ **配置优化** (2026-03-11 完成)
  - ✅ 嵌套对象结构（9 个分组）
  - ✅ Dashboard 分组表单
  - ✅ uiHints 标签、占位符、敏感字段
- ✅ **群聊上下文** (2026-03-11 完成)
  - ✅ 自动获取最近 N 条历史消息
  - ✅ 可配置消息数量（默认 5 条）
  - ✅ 完整消息解析
- ✅ **多模态能力提示** (2026-03-11 完成)
  - ✅ AGENTS.md 添加说明
  - ✅ system_instruction 添加提示
- ✅ **删除 Markdown 转换** (2026-03-11 完成)
  - ✅ 不再修改原始消息内容

#### 消息类型支持 ✅
**文本类：**
- ✅ 文本（text）
- ✅ @提及（at）- 自动解析昵称
- ✅ 回复（reply）- 保留消息 ID

**表情类：**
- ✅ QQ 表情（face）- 140+ 表情完整映射
- ✅ 商城表情（mface）- 保留表情 ID/包 ID
- ✅ 骰子（dice）- 保留点数结果
- ✅ 猜拳（rps）- 保留结果（石头/剪刀/布）
- ✅ 戳一戳（poke）- 保留来源和目标

**多媒体类：**
- ✅ 图片（image）- 保留 URL/描述/文件大小
- ✅ 语音（record）- 保留 URL/路径/文件大小
- ✅ 视频（video）- 保留 URL/缩略图/文件大小
- ✅ 文件（file）- 保留文件名/ID/大小/URL

**富媒体类：**
- ✅ JSON 卡片（json）- 显示为[卡片消息]
- ✅ XML 卡片（xml）- 显示为[卡片消息]
- ✅ 转发消息（forward）- 显示为[转发消息]
- ⚠️ 音乐分享（music）- **未实现**，静默跳过
- ⚠️ 合并转发（node）- **未实现**，静默跳过

**其他类型：**
- ⚠️ Markdown（markdown）- **未实现**，静默跳过
- ⚠️ 联系人分享（contact）- **未实现**，静默跳过
- ⚠️ 位置分享（location）- **未实现**，静默跳过
- ⚠️ 链接分享（share）- **未实现**，静默跳过
- ⚠️ 小程序（miniapp）- **未实现**，静默跳过
- ⚠️ TTS 语音（tts）- **未实现**，静默跳过

**通知事件转换：**
- ✅ 戳一戳（poke）→ 消息
- ✅ 群文件上传（group_upload）→ 消息
- ✅ 精华消息（essence）→ 消息
- ✅ 群成员增加（group_increase）→ 消息
- ✅ 群成员减少（group_decrease）→ 消息
- ✅ 管理员变动（group_admin）→ 消息
- ✅ 群禁言（group_ban）→ 消息
- ✅ 群名片变更（group_card）→ 消息
- ✅ 表情回应（group_msg_emoji_like）→ 消息

#### 数据库功能 ✅
**表结构：**
- ✅ messages - 消息表
- ✅ message_elements - 消息元素表
- ✅ users - 用户表
- ✅ groups - 群聊表
- ✅ group_members - 群成员表
- ✅ config - 配置表

**查询接口：**
- ✅ getRecentMessages - 查询最近消息
- ✅ getMessagesByUser - 按用户查询
- ✅ getMessagesByTimeRange - 按时间范围查询
- ✅ getMessageById - 按消息 ID 查询
- ✅ getMessagesBySession - 按会话查询
- ✅ getSessionList - 获取所有会话列表
- ✅ getMessagesNotInOpenClawHistory - 查询 OpenClaw 历史外的消息

**测试验证：**
- ✅ 数据库正常保存消息
- ✅ 可按群号查询消息来源
- ✅ 可按内容搜索消息
- ✅ 时间戳正确记录

### 5.2 待完成功能

#### Phase 1 剩余（消息类型补全）
- ⏳ **消息类型补全**（目前静默跳过的 8 种，低优先级）
  - music（音乐分享）
  - node（合并转发节点）
  - contact（联系人分享）
  - location（位置分享）
  - share（链接分享）
  - miniapp（小程序）
  - tts（TTS 语音）
  - markdown

#### Phase 2 智能交互
- ⏳ 发言决策系统
- ⏳ 情感系统
- ⏳ 动作系统
- ⏳ 学习系统

#### Phase 3 高级功能
- ⏳ 性能优化
- ⏳ 图片 OCR
- ⏳ AI 语音生成

---

## 六、技术架构

### 6.1 整体架构
```
┌─────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                      │
│  (模型调度 / 会话管理 / Agent 路由)                        │
└─────────────────────────────────────────────────────────┘
                          ↕ Plugin SDK
┌─────────────────────────────────────────────────────────┐
│              OpenClaw NapCat Channel Plugin              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  WebSocket  │  │  消息处理   │  │  事件分发   │     │
│  │   客户端    │  │   引擎      │  │   器        │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│  ┌─────────────┐  ┌─────────────┐                       │
│  │  数据库     │  │  文件       │                       │
│  │  管理器     │  │  处理器     │                       │
│  └─────────────┘  └─────────────┘                       │
└─────────────────────────────────────────────────────────┘
                          ↕ WebSocket
┌─────────────────────────────────────────────────────────┐
│                  NapCatQQ (OneBot v11)                   │
└─────────────────────────────────────────────────────────┘
                          ↕ QQ 协议
┌─────────────────────────────────────────────────────────┐
│                      QQ Network                          │
└─────────────────────────────────────────────────────────┘
```

### 6.2 模块划分

#### 核心模块
| 模块 | 职责 | 文件 | 状态 |
|------|------|------|------|
| `channel.ts` | Channel 主入口，消息收发 | `src/channel.ts` | ✅ |
| `client.ts` | WebSocket 客户端 | `src/client.ts` | ✅ |
| `config.ts` | 配置 Schema | `src/config.ts` | ✅ |
| `types.ts` | TypeScript 类型定义 | `src/types.ts` | ✅ |

#### 扩展模块
| 模块 | 职责 | 文件 | 状态 |
|------|------|------|------|
| `database/` | 数据库管理 | `src/database/` | ✅ |
| `message/` | 消息解析/处理 | `src/message/` | ✅ |
| `streaming/` | Block Streaming | `src/streaming/` | ⏳ |
| `intelligence/` | 智能交互 | `src/intelligence/` | ⏳ |

---

## 七、2026-03-19 Bug 修复与优化记录

### 7.1 TypeScript 编译错误修复

| 编号 | 错误 | 修复 |
|------|------|------|
| E1 | `client.ts(235,25)`: `await` 在非 async 函数中使用 | 将 `handleClose` 改为 async |
| E2 | `notice-handler.ts`: `convertPoke` 声明但未使用 | 删除冗余声明，改用 `_convertPokeSync` |
| E3 | `inbound-handler.ts`: `getUserNickname` import 未使用 | 改为 `_getUserNickname` 前缀标记 |
| E4 | `typing-indicator.ts`: `busySuffix` 参数未使用 | 改为 `_busySuffix` |

### 7.2 Bug 修复（6 项）

| 编号 | 文件 | 问题 | 修复 |
|------|------|------|------|
| A | `inbound-handler.ts` | 戳一戳昵称在 `convertPokeAsync` 已处理，`inbound-handler` 又重复覆盖，导致正确结果被重写 | 删除冗余的昵称丰富代码块 |
| B | `inbound-handler.ts` | `senderName` 优先取 `nickname`，群聊应优先取群名片 `card` | 改为 `card \|\| nickname` |
| C | `channel.ts` | 数据库相对路径基准使用 `dist/../` 不明确，某些配置下偏移 | 改为明确计算插件根目录 `dirname(dirname(import.meta.url))` |
| D | `trigger.ts` | `@全体成员`（`qq='all'`）会触发 Agent 回复 | 去掉 `\|\| seg.data?.qq === 'all'` 条件 |
| E | `typing-indicator.ts` | `clearGroupTypingCard` 恢复名片时对已干净的 `baseCard` 多调用一次 `stripSuffix` | 直接使用 `groupBaseCard.get(key)` |
| F | `notice-handler.ts` | 群成员增减/管理员变动/禁言/精华消息等通知显示为纯数字 ID，无昵称 | 优先使用 payload 内的 `nick`/`user_name`/`operator_nick`/`sender_nick` 等字段 |

### 7.3 功能改进

#### 回复上下文自动解析
- `inbound-handler.ts` 新增：检测消息中的 `reply` 元素，自动通过 `get_msg` API 获取被回复消息内容
- 以 `【回复的消息】（发送者）：内容` 形式插入 `BodyForAgent`
- 同步填充 `ReplyToBody`/`ReplyToSender` 字段到 ctxPayload

#### Plugin SDK 元数据字段调查结论
- `InboundHistory` — 仅用于 SDK 统计日志（`history_count`），不渲染到 Agent prompt
- `UntrustedContext`/`GroupSystemPrompt` — 当前版本 SDK 处理侧未消费
- **结论**：`BodyForAgent` 是唯一可靠的元数据注入方式，与 Telegram 等原生插件做法一致
- 群聊历史改为结构化 `fetchGroupHistory()` 返回 `{sender, body, timestamp}[]`，仍拼接到 `BodyForAgent`

#### Body 字段规范化
- `Body` = `cleanBody` = `fullContent`（纯消息正文，无任何元数据）
- `BodyForAgent` = `systemBlock + contextStr + replyStr + fullContent`（含所有上下文）
- `RawBody` = `cleanBody`（用于命令检测 fallback）

### 7.4 已知问题更新

计划书第五章问题列表新增：

| 编号 | 问题描述 | 优先级 | 状态 |
|------|----------|--------|------|
| #19 | 戳一戳昵称解析在 inbound-handler 被二次覆盖 | P1 | 🟢 已完成 (2026-03-19) |
| #20 | senderName 优先级错误（nickname 优先于 card） | P1 | 🟢 已完成 (2026-03-19) |
| #21 | @全体成员触发 Agent 回复 | P1 | 🟢 已完成 (2026-03-19) |
| #22 | 群名片恢复时 stripSuffix 被重复调用 | P2 | 🟢 已完成 (2026-03-19) |
| #23 | notice 事件用户信息无昵称，全为纯数字 ID | P1 | 🟢 已完成 (2026-03-19) |
| #24 | 被回复消息内容无法传递给 Agent | P1 | 🟢 已完成 (2026-03-19) |

---

_最终项目计划书 v8.4_  
_创建日期：2026-03-05_  
_最后更新：2026-03-19_  
_状态：Phase 1 全部完成（含 Bug 修复 #19-#24 + 回复上下文 + SDK 元数据调查），准备进入 Phase 2_
