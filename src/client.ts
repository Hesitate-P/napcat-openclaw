/**
 * NapCat WebSocket 客户端
 *
 * 职责：WebSocket 连接管理、心跳、API 请求/响应。
 * 不包含任何业务逻辑或消息格式转换——这些由上层模块（notice-handler.ts 等）负责。
 */

import WebSocket from 'ws';
import type { NapCatMessageEvent, NapCatApiRequest, ConnectionStatus } from './types.js';
import { handleNoticeEvent } from './event/notice-handler.js';

export interface NapCatClientConfig {
  wsUrl: string;
  accessToken: string;
  /** 心跳发送间隔 (ms)，默认 45000 */
  heartbeatInterval?: number;
  /** 心跳超时阈值 (ms)，默认 180000 */
  heartbeatTimeout?: number;
  /** 初始重连延迟 (ms)，默认 1000 */
  reconnectDelay?: number;
  /** 最大重连延迟 (ms)，默认 30000 */
  maxReconnectDelay?: number;
  /** API 请求超时 (ms)，默认 30000 */
  apiTimeout?: number;
  /** 最大重连次数，默认 10 */
  maxReconnectAttempts?: number;
}

export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

export class NapCatClient {
  private readonly cfg: Required<NapCatClientConfig>;
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private selfId: number | null = null;
  private echoSeq = 0;
  private pendingRequests = new Map<string, {
    resolve: (data: any) => void;
    reject:  (err: Error) => void;
    timer:   ReturnType<typeof setTimeout>;
  }>();
  private handlers = new Map<string, Set<EventHandler>>();
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private heartbeatTimeoutTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;
  private destroyed = false;

  static readonly EVENT_MESSAGE    = 'message';
  static readonly EVENT_CONNECTED  = 'connect';
  static readonly EVENT_DISCONNECTED = 'disconnect';
  static readonly EVENT_ERROR      = 'error';

  constructor(config: NapCatClientConfig) {
    this.cfg = {
      wsUrl:                 config.wsUrl,
      accessToken:           config.accessToken,
      heartbeatInterval:     config.heartbeatInterval     ?? 45_000,
      heartbeatTimeout:      config.heartbeatTimeout      ?? 180_000,
      reconnectDelay:        config.reconnectDelay         ?? 1_000,
      maxReconnectDelay:     config.maxReconnectDelay      ?? 30_000,
      apiTimeout:            config.apiTimeout             ?? 30_000,
      maxReconnectAttempts:  config.maxReconnectAttempts   ?? 10,
    };
  }

  // ── 公开状态查询 ────────────────────────────────────────────────────────────

  getStatus():    ConnectionStatus { return this.status; }
  isConnected():  boolean { return this.status === 'connected' && this.ws !== null; }
  getSelfId():    number | null { return this.selfId; }
  setSelfId(id:   number): void { this.selfId = id; }

  // ── 生命周期 ─────────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') return;
    if (this.destroyed) throw new Error('NapCatClient has been destroyed');
    this.setStatus('connecting');

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.cfg.wsUrl, {
        headers: { Authorization: `Bearer ${this.cfg.accessToken}` },
      });

      let settled = false;
      const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

      ws.once('open', () => {
        this.ws = ws;
        this.reconnectAttempts = 0;
        this.setStatus('connected');
        this.startHeartbeat();
        this.emit(NapCatClient.EVENT_CONNECTED);
        settle(resolve);
      });

      ws.on('message', (data: Buffer) => this.onRawMessage(data));

      ws.once('error', (err: Error) => {
        this.emit(NapCatClient.EVENT_ERROR, err);
        // 仅在 connecting 阶段才 reject Promise；close 事件会紧随触发，由 handleClose 统一处理重连
        settle(() => reject(err));
      });

      ws.once('close', () => {
        // 如果 Promise 还未 settle（如直接 close 未触发 error），也 reject
        settle(() => reject(new Error('Connection closed before open')));
        this.handleClose();
      });
    });
  }

  /** 主动断开并销毁，不再重连（由外部调用 logoutAccount 时使用）。 */
  disconnect(): void {
    this.destroyed = true;
    this.stopHeartbeat();
    this.rejectAllPending('Connection closed');
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  /** 仅关闭当前连接，允许后续重连（内部 handleClose 使用）。 */
  private closeConnection(): void {
    this.stopHeartbeat();
    this.rejectAllPending('Connection closed');
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  // ── API 请求 ─────────────────────────────────────────────────────────────────

  async sendAction<T = unknown>(
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    if (!this.ws || this.status !== 'connected') {
      throw new Error(`NapCatClient: not connected (status=${this.status})`);
    }

    const echo = `${action}_${++this.echoSeq}`;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(echo);
        reject(new Error(`NapCat API timeout: ${action}`));
      }, this.cfg.apiTimeout);

      this.pendingRequests.set(echo, { resolve, reject, timer });
      const req: NapCatApiRequest = { action, params, echo };
      this.ws!.send(JSON.stringify(req));
    });
  }

  // ── 事件系统 ─────────────────────────────────────────────────────────────────

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  // ── 常用 API 封装 ─────────────────────────────────────────────────────────────

  getLoginInfo(): Promise<{ user_id: number; nickname: string }> {
    return this.sendAction('get_login_info');
  }

  getFriendList(): Promise<Array<{ user_id: number; nickname: string; remark?: string }>> {
    return this.sendAction('get_friend_list');
  }

  getGroupList(): Promise<Array<{ group_id: number; group_name: string; member_count?: number }>> {
    return this.sendAction('get_group_list');
  }

  getGroupMemberInfo(groupId: number, userId: number): Promise<any> {
    return this.sendAction('get_group_member_info', { group_id: String(groupId), user_id: String(userId) });
  }

  getGroupMemberList(groupId: number): Promise<any[]> {
    return this.sendAction('get_group_member_list', { group_id: String(groupId) });
  }

  // ── 私有方法 ─────────────────────────────────────────────────────────────────

  private setStatus(s: ConnectionStatus): void {
    this.status = s;
  }

  private handleClose(): void {
    this.closeConnection();
    this.emit(NapCatClient.EVENT_DISCONNECTED);
    if (!this.destroyed) this.scheduleReconnect();
  }

  private async onRawMessage(data: Buffer): Promise<void> {
    let payload: any;
    try { payload = JSON.parse(data.toString()); }
    catch { return; }

    // API 响应
    if (payload.echo && this.pendingRequests.has(payload.echo)) {
      const pending = this.pendingRequests.get(payload.echo)!;
      clearTimeout(pending.timer);
      this.pendingRequests.delete(payload.echo);
      const ok = payload.status === 'ok' || payload.retcode === 0;
      if (ok) pending.resolve(payload.data);
      else    pending.reject(new Error(payload.message ?? `retcode=${payload.retcode}`));
      return;
    }

    // 事件分发
    if (!payload.post_type) return;

    const { post_type, meta_event_type } = payload;

    // 心跳
    if (post_type === 'meta_event' && meta_event_type === 'heartbeat') {
      this.resetHeartbeatTimeout();
      return;
    }

    // 普通消息事件
    if (post_type === 'message') {
      this.emit(NapCatClient.EVENT_MESSAGE, payload as NapCatMessageEvent);
      return;
    }

    // notice 事件：委托给 notice-handler 转换
    if (post_type === 'notice') {
      const converted = await handleNoticeEvent(payload, this);
      if (converted) {
        this.emit(NapCatClient.EVENT_MESSAGE, converted as NapCatMessageEvent);
      }
      return;
    }

    // 其他事件（request / meta_event 非心跳）
    const { message_type, notice_type, event_type } = payload;
    const eventKey = `${post_type}.${message_type ?? notice_type ?? event_type ?? '*'}`;
    this.emit(eventKey, payload);
    this.emit('*', payload);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.status === 'connected') {
        this.sendAction('get_status').catch(() => { /* ignore */ });
      }
    }, this.cfg.heartbeatInterval);
    this.resetHeartbeatTimeout();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer)        { clearInterval(this.heartbeatTimer);        this.heartbeatTimer        = undefined; }
    if (this.heartbeatTimeoutTimer) { clearTimeout(this.heartbeatTimeoutTimer);  this.heartbeatTimeoutTimer = undefined; }
  }

  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) clearTimeout(this.heartbeatTimeoutTimer);
    this.heartbeatTimeoutTimer = setTimeout(() => {
      console.warn('[NapCatClient] 心跳超时，强制重连');
      this.handleClose();
    }, this.cfg.heartbeatTimeout);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.cfg.maxReconnectAttempts) {
      console.error(`[NapCatClient] 达到最大重连次数 (${this.cfg.maxReconnectAttempts})，放弃重连`);
      return;
    }
    const delay = Math.min(
      this.cfg.reconnectDelay * 2 ** this.reconnectAttempts,
      this.cfg.maxReconnectDelay,
    );
    this.reconnectAttempts++;
    console.log(`[NapCatClient] ${Math.round(delay / 1000)}s 后重连 (第 ${this.reconnectAttempts}/${this.cfg.maxReconnectAttempts} 次)`);
    setTimeout(() => {
      if (!this.destroyed && this.status === 'disconnected') {
        this.setStatus('reconnecting');
        this.connect().catch(err => {
          console.error('[NapCatClient] 重连失败:', err);
          this.setStatus('disconnected');
        });
      }
    }, delay);
  }

  private rejectAllPending(reason: string): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  private emit(event: string, data?: unknown): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    for (const h of handlers) {
      try {
        const r = h(data);
        if (r instanceof Promise) r.catch(err => console.error(`[NapCatClient] 事件处理器错误 (${event}):`, err));
      } catch (err) {
        console.error(`[NapCatClient] 事件处理器错误 (${event}):`, err);
      }
    }
  }
}
