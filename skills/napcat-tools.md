# NapCat Tools Skill

_让 Agent 能够主动调用 NapCat QQ 的 API_

---

## 可用工具

### 1. 发送 QQ 消息

**工具名**: `napcat_send_message`

**功能**: 向指定 QQ 用户或群聊发送消息

**参数**:
- `chat_type`: "direct" | "group" - 聊天类型（私聊/群聊）
- `chat_id`: string - 聊天 ID（私聊为 `user:QQ 号`，群聊为群号）
- `message`: string - 消息内容
- `image_urls`: string[] (可选) - 图片 URL 列表

**示例**:
```json
{
  "tool": "napcat_send_message",
  "arguments": {
    "chat_type": "group",
    "chat_id": "870560083",
    "message": "你好，这是一条测试消息喵～"
  }
}
```

---

### 2. 查询历史消息

**工具名**: `napcat_query_messages`

**功能**: 从数据库中查询历史消息

**参数**:
- `chat_type`: "direct" | "group" (可选) - 聊天类型
- `chat_id`: string (可选) - 聊天 ID
- `user_id`: number (可选) - 用户 QQ 号
- `limit`: number (可选，默认 20) - 返回消息数量
- `before_timestamp`: number (可选) - 查询此时间戳之前的消息

**示例**:
```json
{
  "tool": "napcat_query_messages",
  "arguments": {
    "chat_type": "group",
    "chat_id": "870560083",
    "limit": 10
  }
}
```

**返回**:
```json
{
  "messages": [
    {
      "chat_type": "group",
      "chat_id": "870560083",
      "user_name": "Hesitate_P",
      "content": "测试消息",
      "timestamp": 1772789332000
    }
  ]
}
```

---

### 3. 获取会话列表

**工具名**: `napcat_get_sessions`

**功能**: 获取所有保存的会话列表

**参数**: 无

**示例**:
```json
{
  "tool": "napcat_get_sessions",
  "arguments": {}
}
```

**返回**:
```json
{
  "sessions": [
    {
      "chat_type": "group",
      "chat_id": "870560083",
      "messageCount": 15,
      "lastMessageTime": 1772789332000,
      "lastUserName": "Hesitate_P",
      "lastContent": "最后一条消息内容"
    }
  ]
}
```

---

### 4. 获取群成员列表

**工具名**: `napcat_get_group_members`

**功能**: 获取指定群聊的成员列表

**参数**:
- `group_id`: number - 群号

**示例**:
```json
{
  "tool": "napcat_get_group_members",
  "arguments": {
    "group_id": 870560083
  }
}
```

---

### 5. 发送群文件

**工具名**: `napcat_send_group_file`

**功能**: 向群聊发送文件

**参数**:
- `group_id`: number - 群号
- `file_path`: string - 文件路径
- `file_name`: string (可选) - 文件名

**示例**:
```json
{
  "tool": "napcat_send_group_file",
  "arguments": {
    "group_id": 870560083,
    "file_path": "/path/to/file.pdf",
    "file_name": "测试文件.pdf"
  }
}
```

---

## 使用指南

### 何时使用这些工具

**发送消息**:
- 用户明确要求发送消息
- 需要主动通知用户
- 回复群聊消息

**查询历史消息**:
- 用户询问之前的聊天内容
- 需要上下文信息
- 用户问"我之前说过什么"

**获取会话列表**:
- 用户询问有哪些聊天记录
- 需要列出所有对话

**获取群成员**:
- 用户询问群成员信息
- 需要@特定用户

**发送文件**:
- 用户要求发送文件
- 需要分享文档/图片

---

## 注意事项

1. **隐私保护**: 不要泄露用户的 QQ 号等隐私信息
2. **频率限制**: 避免短时间内发送大量消息
3. **权限检查**: 确保有权限执行操作（如发送群文件需要群成员权限）
4. **错误处理**: 工具调用失败时要友好提示用户

---

_Skill 版本：v1.0_  
_最后更新：2026-03-06_
