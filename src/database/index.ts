/**
 * 数据库管理器
 * 
 * 提供 SQLite 数据库连接和操作接口
 */

import Database from 'better-sqlite3';
import { DATABASE_SCHEMA, DATABASE_VERSION } from './schema.js';
import type {
  MessageRecord,
  MessageElementRecord,
  UserRecord,
  GroupRecord,
  GroupMemberRecord,
} from '../types.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  type: 'sqlite';
  path: string;
}

/**
 * 数据库管理器
 */
export class DatabaseManager {
  private db: Database.Database | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * 初始化数据库
   */
  initialize(): void {
    // 确保数据库目录存在
    const dbDir = path.dirname(this.config.path);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log('[DatabaseManager] 创建数据库目录:', dbDir);
    }
    
    console.log('[DatabaseManager] 初始化数据库:', this.config.path);

    try {
      this.db = new Database(this.config.path);
      
      // 启用外键约束
      this.db.pragma('foreign_keys = ON');
      
      // 设置 WAL 模式（提高并发性能）
      this.db.pragma('journal_mode = WAL');
      
      // 执行 Schema（使用 exec 执行多条 SQL 语句）
      this.db.exec(DATABASE_SCHEMA);
      
      console.log('[DatabaseManager] 数据库初始化完成，版本:', DATABASE_VERSION);
    } catch (error: any) {
      console.error('[DatabaseManager] 数据库初始化失败:', error.message);
      console.error('[DatabaseManager] SQL 错误详情:', error);
      throw error;
    }
  }

  /**
   * 关闭数据库
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[DatabaseManager] 数据库已关闭');
    }
  }

  /**
   * 检查数据库是否已初始化
   */
  isInitialized(): boolean {
    return this.db !== null;
  }

  // ============================================================================
  // 消息操作
  // ============================================================================

  /**
   * 保存消息
   */
  saveMessage(message: MessageRecord): void {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages 
      (message_id, account_id, chat_type, chat_id, user_id, user_name, 
       message_type, content, raw_content, raw_message, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.message_id,
      message.account_id,
      message.chat_type,
      message.chat_id,
      message.user_id,
      message.user_name,
      message.message_type,
      message.content,
      message.raw_content,
      message.raw_message,
      message.timestamp
    );
  }

  /**
   * 保存消息元素
   */
  saveMessageElement(element: MessageElementRecord): void {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const stmt = this.db.prepare(`
      INSERT INTO message_elements (message_id, element_type, element_data, sort_order)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(element.message_id, element.element_type, element.element_data, element.sort_order);
  }

  /**
   * 批量保存消息和元素
   */
  saveMessageWithElements(message: MessageRecord, elements: MessageElementRecord[]): void {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const transaction = this.db.transaction(() => {
      this.saveMessage(message);
      for (const element of elements) {
        this.saveMessageElement(element);
      }
    });

    transaction();
  }

  /**
   * 查询最近消息
   */
  getRecentMessages(chatType: 'direct' | 'group', chatId: string, limit: number = 20): MessageRecord[] {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE chat_type = ? AND chat_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(chatType, chatId, limit) as MessageRecord[];
  }

  /**
   * 按用户查询消息
   */
  getMessagesByUser(userId: number, limit: number = 20): MessageRecord[] {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(userId, limit) as MessageRecord[];
  }

  /**
   * 按时间范围查询消息
   */
  getMessagesByTimeRange(
    chatType: 'direct' | 'group',
    chatId: string,
    startTime: number,
    endTime: number,
    limit: number = 100
  ): MessageRecord[] {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE chat_type = ? AND chat_id = ?
        AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
      LIMIT ?
    `);

    return stmt.all(chatType, chatId, startTime, endTime, limit) as MessageRecord[];
  }

  /**
   * 按消息 ID 查询消息
   */
  getMessageById(messageId: string): MessageRecord | null {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const stmt = this.db.prepare('SELECT * FROM messages WHERE message_id = ?');
    return stmt.get(messageId) as MessageRecord | null;
  }

  /**
   * 按会话查询消息（支持群聊和私聊）
   */
  getMessagesBySession(
    chatType: 'direct' | 'group',
    chatId: string,
    limit: number = 50,
    beforeTimestamp?: number
  ): MessageRecord[] {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    let sql = `
      SELECT * FROM messages
      WHERE chat_type = ? AND chat_id = ?
    `;
    
    const params: any[] = [chatType, chatId, limit];
    
    if (beforeTimestamp) {
      sql += ` AND timestamp < ?`;
      params.splice(2, 0, beforeTimestamp);
    }
    
    sql += ` ORDER BY timestamp DESC LIMIT ?`;

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as MessageRecord[];
  }

  /**
   * 获取所有会话列表（用于快速查询）
   */
  getSessionList() {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const stmt = this.db.prepare(`
      SELECT 
        chat_type,
        chat_id,
        MAX(timestamp) as lastMessageTime,
        COUNT(*) as messageCount,
        (SELECT user_name FROM messages m2 
         WHERE m2.chat_type = m1.chat_type 
         AND m2.chat_id = m1.chat_id 
         ORDER BY timestamp DESC LIMIT 1) as lastUserName,
        (SELECT content FROM messages m3 
         WHERE m3.chat_type = m1.chat_type 
         AND m3.chat_id = m1.chat_id 
         ORDER BY timestamp DESC LIMIT 1) as lastContent
      FROM messages m1
      GROUP BY chat_type, chat_id
      ORDER BY lastMessageTime DESC
    `);

    return stmt.all();
  }

  /**
   * 查询指定会话在 OpenClaw 历史记录之外的消息
   * （用于补充 Agent 缺失的上下文）
   */
  getMessagesNotInOpenClawHistory(
    sessionKey: string,
    openClawMessageIds: string[],
    limit: number = 50
  ): MessageRecord[] {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    // 从 sessionKey 解析 chat_type 和 chat_id
    // 格式：group:accountId:group:groupId 或 direct:accountId:user:userId
    const parts = sessionKey.split(':');
    let chatType: 'direct' | 'group';
    let chatId: string;
    
    if (parts[0] === 'group') {
      chatType = 'group';
      chatId = parts[parts.length - 1];
    } else {
      chatType = 'direct';
      chatId = parts[parts.length - 1];
    }

    // 查询不在 OpenClaw 历史记录中的消息
    const placeholders = openClawMessageIds.map(() => '?').join(',');
    const sql = `
      SELECT * FROM messages
      WHERE chat_type = ? AND chat_id = ?
      ${openClawMessageIds.length > 0 ? `AND message_id NOT IN (${placeholders})` : ''}
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const params = [
      chatType,
      chatId,
      ...openClawMessageIds,
      limit
    ];

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as MessageRecord[];
  }

  // ============================================================================
  // 用户操作
  // ============================================================================

  /**
   * 保存或更新用户
   */
  saveUser(user: UserRecord): void {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const stmt = this.db.prepare(`
      INSERT INTO users (user_id, nickname, remark, gender, age, level, expression_style, last_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        nickname = excluded.nickname,
        remark = excluded.remark,
        last_active = excluded.last_active
    `);

    stmt.run(
      user.user_id,
      user.nickname,
      user.remark,
      user.gender,
      user.age,
      user.level,
      user.expression_style,
      user.last_active
    );
  }

  /**
   * 查询用户
   */
  getUser(userId: number): UserRecord | null {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const stmt = this.db.prepare('SELECT * FROM users WHERE user_id = ?');
    return stmt.get(userId) as UserRecord | null;
  }

  // ============================================================================
  // 群聊操作
  // ============================================================================

  /**
   * 保存或更新群聊
   */
  saveGroup(group: GroupRecord): void {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const stmt = this.db.prepare(`
      INSERT INTO groups (group_id, group_name, member_count, max_member)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(group_id) DO UPDATE SET
        group_name = excluded.group_name,
        member_count = excluded.member_count
    `);

    stmt.run(group.group_id, group.group_name, group.member_count, group.max_member);
  }

  /**
   * 保存或更新群成员
   */
  saveGroupMember(member: GroupMemberRecord): void {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const stmt = this.db.prepare(`
      INSERT INTO group_members (group_id, user_id, card, role, title, join_time, last_speak, speak_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(group_id, user_id) DO UPDATE SET
        card = excluded.card,
        role = excluded.role,
        title = excluded.title,
        last_speak = excluded.last_speak,
        speak_count = speak_count + 1
    `);

    stmt.run(
      member.group_id,
      member.user_id,
      member.card,
      member.role,
      member.title,
      member.join_time,
      member.last_speak,
      member.speak_count
    );
  }

  /**
   * 获取群成员列表
   */
  getGroupMembers(groupId: number): GroupMemberRecord[] {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const stmt = this.db.prepare('SELECT * FROM group_members WHERE group_id = ?');
    return stmt.all(groupId) as GroupMemberRecord[];
  }

  /**
   * 更新群成员发言统计
   */
  updateMemberSpeakCount(groupId: number, userId: number): void {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      INSERT INTO group_members (group_id, user_id, last_speak, speak_count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(group_id, user_id) DO UPDATE SET
        last_speak = ?,
        speak_count = speak_count + 1
    `);

    stmt.run(groupId, userId, now, now);
  }
}

