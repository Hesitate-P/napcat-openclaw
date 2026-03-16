/**
 * NapCat WebSocket 客户端
 * 
 * 实现与 NapCatQQ 的 WebSocket 连接，处理消息收发和自动重连
 */

import WebSocket from 'ws';
import type { NapCatMessageEvent, NapCatApiRequest, NapCatApiResponse, ConnectionStatus } from './types.js';
import { normalizeNapCatEvent } from './message/notice-normalizer.js';

/**
 * WebSocket 客户端配置
 */
export interface NapCatClientConfig {
  wsUrl: string;
  accessToken: string;
  heartbeatInterval?: number;    // 心跳间隔 (ms)
  heartbeatTimeout?: number;     // 心跳超时 (ms)
  reconnectDelay?: number;       // 重连延迟 (ms)
  maxReconnectDelay?: number;    // 最大重连延迟 (ms)
}

/**
 * 事件处理器类型
 */
export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

/**
 * NapCat WebSocket 客户端
 */
export class NapCatClient {
  private config: NapCatClientConfig;
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private selfId: number | null = null;
  private echoCounter = 0;
  private pendingRequests = new Map<string, {
    resolve: (data: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private heartbeatTimer?: NodeJS.Timeout;
  private heartbeatTimeoutTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private botUserId: number | null = null;
  private intentionalClose = false;

  // 事件常量
  static readonly EVENT_MESSAGE = 'message';
  static readonly EVENT_CONNECTED = 'connected';
  static readonly EVENT_DISCONNECTED = 'disconnected';
  static readonly EVENT_HEARTBEAT = 'heartbeat';
  static readonly EVENT_ERROR = 'error';

  constructor(config: NapCatClientConfig) {
    this.config = {
      wsUrl: config.wsUrl,
      accessToken: config.accessToken,
      heartbeatInterval: config.heartbeatInterval ?? 45000,  // 45 秒
      heartbeatTimeout: config.heartbeatTimeout ?? 180000,   // 180 秒
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
    };
  }

  /**
   * 获取当前连接状态
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.status === 'connected' && this.ws !== null;
  }

  /**
   * 获取 Bot 用户 ID
   */
  getBotUserId(): number | null {
    return this.botUserId;
  }

  /**
   * 设置 Bot 用户 ID
   */
  setSelfId(id: number): void {
    this.selfId = id;
  }

  /**
   * 获取 Bot 用户 ID
   */
  getSelfId(): number | null {
    return this.selfId;
  }

  /**
   * 连接 WebSocket
   */
  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') {
      return;
    }

    this.intentionalClose = false;
    this.setStatus('connecting');
    console.log('[NapCatClient] 正在连接到:', this.config.wsUrl);

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.config.wsUrl, {
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
          },
        });

        ws.on('open', () => {
          console.log('[NapCatClient] WebSocket 连接成功');
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
          }
          this.setStatus('connected');
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.emit(NapCatClient.EVENT_CONNECTED);
          resolve();
        });

        ws.on('message', (data: Buffer) => {
          this.handleMessage(data);
        });

        ws.on('error', (error: Error) => {
          const wasConnecting = this.status === 'connecting';
          console.error('[NapCatClient] WebSocket 错误:', error.message);
          this.setStatus('disconnected');
          this.emit(NapCatClient.EVENT_ERROR, error);
          if (wasConnecting) {
            reject(error);
          }
        });

        ws.on('close', (code: number, reason: Buffer) => {
          console.log('[NapCatClient] WebSocket 关闭:', code, reason.toString());
          this.setStatus('disconnected');
          this.stopHeartbeat();
          this.emit(NapCatClient.EVENT_DISCONNECTED, { code, reason: reason.toString() });
          this.ws = null;

          if (this.intentionalClose) {
            this.intentionalClose = false;
            return;
          }

          this.scheduleReconnect();
        });

        this.ws = ws;
      } catch (error) {
        this.setStatus('disconnected');
        reject(error);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    this.clearPendingRequests();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
    }
    
    this.setStatus('disconnected');
  }

  /**
   * 发送 API 请求
   */
  async sendAction<T = unknown>(action: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.ws || this.status !== 'connected') {
      throw new Error('WebSocket 未连接');
    }

    const echo = `${action}_${++this.echoCounter}`;
    
    return new Promise((resolve, reject) => {
      const request: NapCatApiRequest = {
        action,
        params: params || {},
        echo,
      };

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(echo);
        reject(new Error(`API 请求超时：${action}`));
      }, 30000);

      this.pendingRequests.set(echo, { resolve, reject, timeout });

      const message = JSON.stringify(request);
      this.ws!.send(message);
      console.log(`[NapCatClient] 发送 API 请求: ${action}`);
    });
  }

  /**
   * 注册事件处理器
   */
  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * 注销事件处理器
   */
  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * 获取登录信息
   */
  async getLoginInfo(): Promise<{ user_id: number; nickname: string }> {
    return this.sendAction('get_login_info');
  }

  /**
   * 获取好友列表
   */
  async getFriendList(): Promise<Array<{ user_id: number; nickname: string; remark?: string }>> {
    return this.sendAction('get_friend_list');
  }

  /**
   * 获取群列表
   */
  async getGroupList(): Promise<Array<{ group_id: number; group_name: string; member_count?: number }>> {
    return this.sendAction('get_group_list');
  }

  /**
   * 获取群成员信息
   */
  async getGroupMemberInfo(groupId: number, userId: number): Promise<any> {
    return this.sendAction('get_group_member_info', { group_id: groupId, user_id: userId });
  }

  /**
   * 获取群成员列表
   */
  async getGroupMemberList(groupId: number): Promise<any[]> {
    return this.sendAction('get_group_member_list', { group_id: groupId });
  }

  async deleteMessage(messageId: string | number): Promise<void> {
    await this.sendAction('delete_msg', { message_id: messageId });
  }

  async getMessage(messageId: string | number): Promise<any> {
    return this.sendAction('get_msg', { message_id: messageId });
  }

  async setGroupBan(groupId: number, userId: number, duration: number): Promise<void> {
    await this.sendAction('set_group_ban', { group_id: groupId, user_id: userId, duration });
  }

  async setGroupKick(groupId: number, userId: number, rejectAddRequest = false): Promise<void> {
    await this.sendAction('set_group_kick', {
      group_id: groupId,
      user_id: userId,
      reject_add_request: rejectAddRequest,
    });
  }

  async sendGroupNotice(groupId: number, content: string): Promise<any> {
    return this.sendAction('_send_group_notice', { group_id: groupId, content });
  }

  async getGroupNotice(groupId: number): Promise<any> {
    return this.sendAction('_get_group_notice', { group_id: groupId });
  }

  async deleteGroupNotice(groupId: number, noticeId: string): Promise<any> {
    return this.sendAction('_del_group_notice', { group_id: groupId, notice_id: noticeId });
  }

  async setEssenceMessage(messageId: string | number): Promise<void> {
    await this.sendAction('set_essence_msg', { message_id: messageId });
  }

  async deleteEssenceMessage(messageId: string | number): Promise<void> {
    await this.sendAction('delete_essence_msg', { message_id: messageId });
  }

  async getEssenceMessageList(groupId: number): Promise<any> {
    return this.sendAction('get_essence_msg_list', { group_id: groupId });
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    console.log('[NapCatClient] 状态变更:', status);
  }

  private handleMessage(data: Buffer): void {
    try {
      const payload = JSON.parse(data.toString());
      
      // 检查是否是 API 响应
      if (payload.echo && this.pendingRequests.has(payload.echo)) {
        this.handleApiResponse(payload);
        return;
      }

      // 处理事件
      if (payload.post_type) {
        this.handleEvent(payload);
      }
    } catch (error) {
      console.error('[NapCatClient] 解析消息失败:', error instanceof Error ? error.message : String(error));
    }
  }

  private handleApiResponse(payload: NapCatApiResponse): void {
    const { echo, status, retcode, data, message } = payload;
    
    if (!echo) {
      return;
    }
    
    const pending = this.pendingRequests.get(echo);
    
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(echo);

    if (status === 'ok' || retcode === 0) {
      pending.resolve(data);
    } else {
      pending.reject(new Error(`API 请求失败：${message || `retcode=${retcode}`}`));
    }
  }

  private handleEvent(payload: any): void {
    const normalized = normalizeNapCatEvent(payload, this.getSelfId());

    if (normalized.kind === 'heartbeat') {
      this.handleHeartbeat(normalized.event);
      return;
    }

    if (normalized.kind === 'message') {
      const messagePayload = normalized.event;
      this.emit(NapCatClient.EVENT_MESSAGE, messagePayload as NapCatMessageEvent);
      return;
    }
  }

  private handleHeartbeat(_payload: any): void {
    // 重置心跳超时计时器
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
    }
    this.emit(NapCatClient.EVENT_HEARTBEAT, _payload);
    this.heartbeatTimeoutTimer = setTimeout(() => {
      console.warn('[NapCatClient] 心跳超时，强制重连');
      this.forceReconnect();
    }, this.config.heartbeatTimeout);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    // 定期发送心跳
    this.heartbeatTimer = setInterval(() => {
      if (this.status === 'connected' && this.ws) {
        // OneBot v11 心跳通过 get_status API 实现
        this.sendAction('get_status').catch(err => {
          console.warn('[NapCatClient] 心跳检查失败:', err instanceof Error ? err.message : String(err));
        });
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = undefined;
    }
  }

  private scheduleReconnect(): void {
    if (this.status === 'disconnected' && this.reconnectAttempts < 10) {
      const delay = Math.min(
        this.config.reconnectDelay! * Math.pow(2, this.reconnectAttempts),
        this.config.maxReconnectDelay!
      );
      
      console.log(`[NapCatClient] 计划 ${Math.round(delay / 1000)} 秒后重连 (尝试 ${this.reconnectAttempts + 1}/10)`);

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }

      this.reconnectTimer = setTimeout(() => {
        if (this.status === 'disconnected') {
          this.reconnectAttempts++;
          this.setStatus('reconnecting');
          this.connect().catch(err => {
            console.error('[NapCatClient] 重连失败:', err instanceof Error ? err.message : String(err));
            this.setStatus('disconnected');
          });
        }
      }, delay);
    } else if (this.reconnectAttempts >= 10) {
      console.error('[NapCatClient] 重连次数过多，放弃重连');
    }
  }

  private forceReconnect(): void {
    this.stopHeartbeat();
    this.clearPendingRequests();
    this.intentionalClose = false;
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.close(1012, 'Force reconnect');
      return;
    }

    this.setStatus('disconnected');
    this.scheduleReconnect();
  }

  private clearPendingRequests(): void {
    for (const [_echo, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  private emit(event: string, data?: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          const result = handler(data);
          if (result instanceof Promise) {
            result.catch(err => {
              console.error(`[NapCatClient] 事件处理器错误 (${event}):`, err instanceof Error ? err.message : String(err));
            });
          }
        } catch (error) {
          console.error(`[NapCatClient] 事件处理器错误 (${event}):`, error instanceof Error ? error.message : String(error));
        }
      }
    }
  }
}
