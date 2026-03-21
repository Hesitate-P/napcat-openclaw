/**
 * 数据库管理器
 *
 * 提供 SQLite 数据库连接和操作接口。
 * 只保留实际使用的接口：saveMessage、getMessagesBySession、getSessionList。
 */

import Database from 'better-sqlite3';
import { DATABASE_SCHEMA, DATABASE_VERSION } from './schema.js';
import type { MessageRecord } from '../types.js';
import * as path from 'node:path';
import * as fs   from 'node:fs';

export interface DatabaseConfig {
  type: 'sqlite';
  path: string;
}

export class DatabaseManager {
  private db: Database.Database | null = null;
  private readonly config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  // ── 生命周期 ────────────────────────────────────────────────────────────────

  initialize(): void {
    const dbDir = path.dirname(this.config.path);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log('[DatabaseManager] 创建数据库目录:', dbDir);
    }
    console.log('[DatabaseManager] 初始化数据库:', this.config.path);
    try {
      this.db = new Database(this.config.path);
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');
      this.db.exec(DATABASE_SCHEMA);
      console.log('[DatabaseManager] 数据库初始化完成，版本:', DATABASE_VERSION);
    } catch (error: any) {
      console.error('[DatabaseManager] 数据库初始化失败:', error.message);
      throw error;
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[DatabaseManager] 数据库已关闭');
    }
  }

  isInitialized(): boolean {
    return this.db !== null;
  }

  // ── 消息操作 ────────────────────────────────────────────────────────────────

  /** 保存（或覆盖）一条消息记录 */
  saveMessage(message: MessageRecord): void {
    if (!this.db) throw new Error('数据库未初始化');
    this.db.prepare(`
      INSERT OR REPLACE INTO messages
      (message_id, account_id, chat_type, chat_id, user_id, user_name,
       message_type, content, raw_content, raw_message, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
      message.timestamp,
    );
  }

  /**
   * 按会话查询消息，支持分页（beforeTimestamp 游标）。
   * 结果按时间降序排列（最新在前）。
   */
  getMessagesBySession(
    chatType: 'direct' | 'group',
    chatId: string,
    limit: number = 50,
    beforeTimestamp?: number,
  ): MessageRecord[] {
    if (!this.db) throw new Error('数据库未初始化');

    const params: (string | number)[] = [chatType, chatId];
    let sql = `
      SELECT * FROM messages
      WHERE chat_type = ? AND chat_id = ?
    `;
    if (beforeTimestamp !== undefined) {
      sql += ' AND timestamp < ?';
      params.push(beforeTimestamp);
    }
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(sql).all(...params) as MessageRecord[];
  }

  /**
   * 获取所有会话摘要列表（按最后消息时间降序）。
   */
  getSessionList(): Array<{
    chat_type: string;
    chat_id: string;
    lastMessageTime: number;
    messageCount: number;
    lastUserName: string;
    lastContent: string;
  }> {
    if (!this.db) throw new Error('数据库未初始化');
    return this.db.prepare(`
      SELECT
        m.chat_type,
        m.chat_id,
        m.timestamp   AS lastMessageTime,
        s.messageCount,
        m.user_name   AS lastUserName,
        m.content     AS lastContent
      FROM messages m
      INNER JOIN (
        SELECT chat_type, chat_id,
               MAX(timestamp) AS maxTs,
               COUNT(*)       AS messageCount
        FROM messages
        GROUP BY chat_type, chat_id
      ) s ON m.chat_type = s.chat_type
         AND m.chat_id   = s.chat_id
         AND m.timestamp = s.maxTs
      ORDER BY lastMessageTime DESC
    `).all() as any[];
  }
}
