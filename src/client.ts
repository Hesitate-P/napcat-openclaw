/**
 * NapCat WebSocket 客户端
 * 
 * 实现与 NapCatQQ 的 WebSocket 连接，处理消息收发和自动重连
 */

import WebSocket from 'ws';
import type { NapCatMessageEvent, NapCatApiRequest, NapCatApiResponse, ConnectionStatus } from './types.js';

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
  private reconnectAttempts = 0;
  private botUserId: number | null = null;

  // 事件常量
  static readonly EVENT_MESSAGE = 'message';
  static readonly EVENT_CONNECTED = 'connected';
  static readonly EVENT_DISCONNECTED = 'disconnected';
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
          console.error('[NapCatClient] WebSocket 错误:', error);
          this.setStatus('disconnected');
          this.emit(NapCatClient.EVENT_ERROR, error);
          if (this.status === 'connecting') {
            reject(error);
          }
        });

        ws.on('close', (code: number, reason: Buffer) => {
          console.log('[NapCatClient] WebSocket 关闭:', code, reason.toString());
          this.setStatus('disconnected');
          this.stopHeartbeat();
          this.emit(NapCatClient.EVENT_DISCONNECTED, { code, reason: reason.toString() });
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
    this.stopHeartbeat();
    this.clearPendingRequests();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
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
      console.log('[NapCatClient] 发送 API 请求:', action, params);
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
      console.error('[NapCatClient] 解析消息失败:', error);
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
    const { post_type, message_type, event_type, notice_type, sub_type } = payload;
    
    // 调试：打印所有事件
    console.log('[NapCatClient] 收到事件:', {
      post_type,
      message_type,
      notice_type,
      sub_type,
      event_type,
      user_id: payload.user_id,
      target_id: payload.target_id,
    });
    
    // 心跳事件
    if (post_type === 'meta_event' && event_type === 'heartbeat') {
      this.handleHeartbeat(payload);
      return;
    }

    // 戳一戳等 notice 事件转换为消息事件（参考 qq 插件逻辑）
    if (post_type === 'notice' && notice_type === 'notify' && sub_type === 'poke') {
      console.log('[NapCatClient] 收到戳一戳 notice 事件:', payload);
      
      // 转换为消息，保留完整信息（来源和被戳对象）
      payload.post_type = 'message';
      payload.message_type = payload.group_id ? 'group' : 'private';
      const userId = payload.user_id || payload.operator_id || 'unknown';
      const targetId = payload.target_id || 'unknown';
      const selfId = this.getSelfId();
      const isPokeBot = selfId && String(targetId) === String(selfId);
      
      // 获取用户名称（从 payload 中或默认）
      const userName = payload.sender?.nickname || payload.user_id?.toString() || '未知用户';
      // 获取被戳者名称（从 payload 中或默认）
      const targetName = payload.target_name || payload.target_id?.toString() || '未知用户';
      
      // 构建详细的戳一戳消息（包含用户昵称和 ID）
      payload.raw_message = `[戳一戳] ${userName}(${userId}) 戳了 ${targetName}(${targetId})`;
      payload.message = [{ 
        type: 'text', 
        data: { 
          text: payload.raw_message,
          poke_info: {
            user_id: userId,
            user_name: userName,
            target_id: targetId,
            target_name: targetName,
            is_poke_bot: isPokeBot,
            group_id: payload.group_id || null
          }
        } 
      }];
      
      console.log('[NapCatClient] 戳一戳转换为消息:', payload);
      this.emit(NapCatClient.EVENT_MESSAGE, payload as NapCatMessageEvent);
      return;
    }

    // 消息事件 - 添加详细调试日志
    if (post_type === 'message') {
      console.log('[NapCatClient] 收到原始消息事件:');
      console.log('  - message_type:', payload.message_type);
      console.log('  - message 类型:', Array.isArray(payload.message) ? 'Array' : typeof payload.message);
      console.log('  - message 内容:', JSON.stringify(payload.message).substring(0, 300));
      console.log('  - raw_message:', payload.raw_message?.substring(0, 300));
      
      this.emit(NapCatClient.EVENT_MESSAGE, payload as NapCatMessageEvent);
      return;
    }

    // 其他 notice 事件 - 转换为消息格式让 Agent 知道
    if (post_type === 'notice') {
      console.log('[NapCatClient] 收到 notice 事件:', { notice_type, sub_type, ...payload });
      
      // 群文件上传
      if (notice_type === 'group_upload' && payload.file) {
        const userId = payload.user_id || 'unknown';
        const fileName = payload.file.name || '未知文件';
        const fileSize = payload.file.size ? `${(payload.file.size / 1024).toFixed(1)}KB` : '';
        const fileId = payload.file.id || '';
        const busid = payload.file.busid || '';
        
        payload.post_type = 'message';
        payload.message_type = 'group';
        payload.raw_message = `[群文件上传] 用户${userId} 上传了文件：${fileName} (${fileSize})`;
        payload.message = [{ 
          type: 'text', 
          data: { 
            text: payload.raw_message,
            upload_info: {
              user_id: userId,
              file_name: fileName,
              file_size: payload.file.size,
              file_id: fileId,
              busid: busid
            }
          } 
        }];
        console.log('[NapCatClient] 群文件上传转换为消息');
        this.emit(NapCatClient.EVENT_MESSAGE, payload as NapCatMessageEvent);
        return;
      }
      
      // 群精华消息
      if (notice_type === 'essence') {
        const subType = payload.sub_type || 'add';
        const senderId = payload.sender_id || 'unknown';
        const operatorId = payload.operator_id || 'unknown';
        const messageId = payload.message_id || '';
        const action = subType === 'add' ? '设为精华' : '移除精华';
        
        payload.post_type = 'message';
        payload.message_type = 'group';
        payload.raw_message = `[精华消息] 用户${operatorId} 将 用户${senderId} 的消息${action}`;
        payload.message = [{ 
          type: 'text', 
          data: { 
            text: payload.raw_message,
            essence_info: {
              action: subType,
              sender_id: senderId,
              operator_id: operatorId,
              message_id: messageId
            }
          } 
        }];
        console.log('[NapCatClient] 精华消息通知转换为消息');
        this.emit(NapCatClient.EVENT_MESSAGE, payload as NapCatMessageEvent);
        return;
      }
      
      // 群成员增加
      if (notice_type === 'group_increase') {
        const userId = payload.user_id || 'unknown';
        const operatorId = payload.operator_id || 'unknown';
        const subType = payload.sub_type || 'approve';
        const subTypeText = subType === 'approve' ? '同意加群' : subType === 'invite' ? '邀请加群' : subType;
        
        payload.post_type = 'message';
        payload.message_type = 'group';
        payload.raw_message = `[群成员增加] 用户${userId} 加入群聊 (${subTypeText}) 操作者：${operatorId}`;
        payload.message = [{ 
          type: 'text', 
          data: { 
            text: payload.raw_message,
            increase_info: {
              user_id: userId,
              operator_id: operatorId,
              sub_type: subType
            }
          } 
        }];
        console.log('[NapCatClient] 群成员增加转换为消息');
        this.emit(NapCatClient.EVENT_MESSAGE, payload as NapCatMessageEvent);
        return;
      }
      
      // 群成员减少
      if (notice_type === 'group_decrease') {
        const userId = payload.user_id || 'unknown';
        const operatorId = payload.operator_id || 'unknown';
        const subType = payload.sub_type || 'leave';
        const subTypeText = subType === 'leave' ? '主动退群' : subType === 'kick' ? '被踢' : subType === 'kick_me' ? '我被踢' : subType === 'disband' ? '群解散' : subType;
        
        payload.post_type = 'message';
        payload.message_type = 'group';
        payload.raw_message = `[群成员减少] 用户${userId} 离开群聊 (${subTypeText}) 操作者：${operatorId}`;
        payload.message = [{ 
          type: 'text', 
          data: { 
            text: payload.raw_message,
            decrease_info: {
              user_id: userId,
              operator_id: operatorId,
              sub_type: subType
            }
          } 
        }];
        console.log('[NapCatClient] 群成员减少转换为消息');
        this.emit(NapCatClient.EVENT_MESSAGE, payload as NapCatMessageEvent);
        return;
      }
      
      // 群管理员变动
      if (notice_type === 'group_admin') {
        const userId = payload.user_id || 'unknown';
        const subType = payload.sub_type || 'set';
        const action = subType === 'set' ? '成为' : '卸任';
        
        payload.post_type = 'message';
        payload.message_type = 'group';
        payload.raw_message = `[管理员变动] 用户${userId} ${action}管理员`;
        payload.message = [{ 
          type: 'text', 
          data: { 
            text: payload.raw_message,
            admin_info: {
              user_id: userId,
              sub_type: subType
            }
          } 
        }];
        console.log('[NapCatClient] 管理员变动转换为消息');
        this.emit(NapCatClient.EVENT_MESSAGE, payload as NapCatMessageEvent);
        return;
      }
      
      // 群禁言
      if (notice_type === 'group_ban') {
        const userId = payload.user_id || 'unknown';
        const operatorId = payload.operator_id || 'unknown';
        const subType = payload.sub_type || 'ban';
        const duration = payload.duration || 0;
        const action = subType === 'ban' ? `禁言 ${duration}秒` : '解除禁言';
        
        payload.post_type = 'message';
        payload.message_type = 'group';
        payload.raw_message = `[群禁言] 用户${operatorId} ${action} 用户${userId}`;
        payload.message = [{ 
          type: 'text', 
          data: { 
            text: payload.raw_message,
            ban_info: {
              user_id: userId,
              operator_id: operatorId,
              sub_type: subType,
              duration: duration
            }
          } 
        }];
        console.log('[NapCatClient] 群禁言转换为消息');
        this.emit(NapCatClient.EVENT_MESSAGE, payload as NapCatMessageEvent);
        return;
      }
      
      // 群名片变更
      if (notice_type === 'group_card') {
        const userId = payload.user_id || 'unknown';
        const cardNew = payload.card_new || '';
        const cardOld = payload.card_old || '';
        
        payload.post_type = 'message';
        payload.message_type = 'group';
        payload.raw_message = `[群名片变更] 用户${userId} 修改名片 "${cardOld}" → "${cardNew}"`;
        payload.message = [{ 
          type: 'text', 
          data: { 
            text: payload.raw_message,
            card_info: {
              user_id: userId,
              card_new: cardNew,
              card_old: cardOld
            }
          } 
        }];
        console.log('[NapCatClient] 群名片变更转换为消息');
        this.emit(NapCatClient.EVENT_MESSAGE, payload as NapCatMessageEvent);
        return;
      }
      
      // 表情回应
      if (notice_type === 'group_msg_emoji_like' && payload.likes) {
        const messageId = payload.message_id || '';
        const userId = payload.user_id || 'unknown';
        const likes = payload.likes.map((l: any) => `${l.emoji_id}:${l.count}`).join(', ');
        
        payload.post_type = 'message';
        payload.message_type = 'group';
        payload.raw_message = `[表情回应] 消息${messageId} 收到表情回应：${likes}`;
        payload.message = [{ 
          type: 'text', 
          data: { 
            text: payload.raw_message,
            emoji_like_info: {
              message_id: messageId,
              user_id: userId,
              likes: payload.likes
            }
          } 
        }];
        console.log('[NapCatClient] 表情回应转换为消息');
        this.emit(NapCatClient.EVENT_MESSAGE, payload as NapCatMessageEvent);
        return;
      }
    }
    
    // 其他事件
    const eventType = `${post_type}.${message_type || notice_type || event_type || '*'}`;
    console.log('[NapCatClient] 发射其他事件:', eventType);
    this.emit(eventType, payload);
    this.emit('*', payload);
  }

  private handleHeartbeat(_payload: any): void {
    // 重置心跳超时计时器
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
    }
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
          console.warn('[NapCatClient] 心跳检查失败:', err);
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
      
      setTimeout(() => {
        if (this.status === 'disconnected') {
          this.reconnectAttempts++;
          this.setStatus('reconnecting');
          this.connect().catch(err => {
            console.error('[NapCatClient] 重连失败:', err);
            this.setStatus('disconnected');
          });
        }
      }, delay);
    } else if (this.reconnectAttempts >= 10) {
      console.error('[NapCatClient] 重连次数过多，放弃重连');
    }
  }

  private forceReconnect(): void {
    this.disconnect();
    this.reconnectAttempts = 0;
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
              console.error(`[NapCatClient] 事件处理器错误 (${event}):`, err);
            });
          }
        } catch (error) {
          console.error(`[NapCatClient] 事件处理器错误 (${event}):`, error);
        }
      }
    }
  }
}
