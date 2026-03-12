/**
 * 数据库 Schema 定义
 * 
 * 定义 SQLite 数据库表结构
 * 注意：SQLite 不支持在 CREATE TABLE 中使用 INDEX 关键字
 * 必须分开创建表和索引
 */

export const DATABASE_VERSION = 1;

export const DATABASE_SCHEMA = `
-- ============================================================================
-- 消息表
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE NOT NULL,
  account_id TEXT NOT NULL,
  chat_type TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  user_name TEXT,
  message_type TEXT NOT NULL,
  content TEXT,
  raw_content TEXT,
  raw_message TEXT,
  timestamp INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 消息表索引
CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON messages (chat_type, chat_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_id ON messages (message_id);

-- ============================================================================
-- 消息元素表
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_elements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  element_type TEXT NOT NULL,
  element_data TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE
);

-- 消息元素表索引
CREATE INDEX IF NOT EXISTS idx_elements_message_id ON message_elements (message_id);

-- ============================================================================
-- 用户表
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  nickname TEXT,
  remark TEXT,
  gender TEXT,
  age INTEGER,
  level INTEGER DEFAULT 0,
  expression_style TEXT,
  last_active INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 用户表索引
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users (user_id);

-- ============================================================================
-- 群聊表
-- ============================================================================
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER UNIQUE NOT NULL,
  group_name TEXT,
  member_count INTEGER,
  max_member INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 群聊表索引
CREATE INDEX IF NOT EXISTS idx_groups_group_id ON groups (group_id);

-- ============================================================================
-- 群成员表
-- ============================================================================
CREATE TABLE IF NOT EXISTS group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  card TEXT,
  role TEXT,
  title TEXT,
  join_time INTEGER,
  last_speak INTEGER,
  speak_count INTEGER DEFAULT 0,
  FOREIGN KEY (group_id) REFERENCES groups(group_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE (group_id, user_id)
);

-- 群成员表索引
CREATE INDEX IF NOT EXISTS idx_members_group_user ON group_members (group_id, user_id);

-- ============================================================================
-- 配置表
-- ============================================================================
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 插入默认配置
INSERT OR IGNORE INTO config (key, value) VALUES 
  ('version', '${DATABASE_VERSION}'),
  ('created_at', strftime('%s', 'now'));
`;

/**
 * 数据库迁移（未来扩展用）
 */
export const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: DATABASE_SCHEMA,
  },
];
