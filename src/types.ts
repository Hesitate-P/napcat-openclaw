/**
 * OpenClaw NapCat Channel - TypeScript 类型定义
 * 
 * 包含所有核心类型定义，确保类型安全
 */

// ============================================================================
// NapCat/OneBot 事件类型
// ============================================================================

/**
 * OneBot v11 消息事件
 */
export interface NapCatMessageEvent {
  time: number;
  self_id: number;
  post_type: 'message';
  message_type: 'private' | 'group';
  sub_type?: 'friend' | 'group' | 'normal';
  message_id: number | string;
  user_id: number;
  message: MessageElement[];
  raw_message: string;
  font: number;
  sender?: MessageSender;
}

/**
 * 私聊消息事件
 */
export interface NapCatPrivateMessageEvent extends NapCatMessageEvent {
  message_type: 'private';
  sub_type: 'friend';
  user_id: number;
  sender: {
    user_id: number;
    nickname: string;
    remark?: string;
  };
}

/**
 * 群聊消息事件
 */
export interface NapCatGroupMessageEvent extends NapCatMessageEvent {
  message_type: 'group';
  sub_type: 'normal';
  group_id: number;
  user_id: number;
  anonymous?: {
    id: number;
    name: string;
    flag: string;
  };
  sender: GroupMemberInfo;
}

/**
 * 消息元素类型
 */
export type MessageElement =
  | { type: 'text'; data: { text: string } }
  | { type: 'image'; data: { file: string; url?: string; file_size?: string } }
  | { type: 'face'; data: { id: string } }
  | { type: 'record'; data: { file: string; url?: string } }
  | { type: 'video'; data: { file: string; url?: string } }
  | { type: 'at'; data: { qq: string | number } }
  | { type: 'reply'; data: { id: string | number } }
  | { type: 'forward'; data: { id: string } }
  | { type: 'file'; data: { name: string; url?: string; path?: string } }
  | { type: 'dice'; data: { value?: string; result?: string } }
  | { type: 'rps'; data: { value?: string; result?: string } }
  | { type: 'shake'; data: Record<string, never> }
  | { type: 'poke'; data: { user_id?: number; type?: string; id?: string; target_id?: number } }
  | { type: 'json'; data: { data: string | object } }
  | { type: 'xml'; data: { data: string } }
  | { type: 'music'; data: { type: string; id?: string; url?: string; audio?: string; title?: string; content?: string; image?: string } };

/**
 * 消息发送者信息
 */
export interface MessageSender {
  user_id: number;
  nickname: string;
  remark?: string;
  sex?: 'male' | 'female' | 'unknown';
  age?: number;
  area?: string;
  level?: string;
  role?: 'owner' | 'admin' | 'member';
  title?: string;
  card?: string;
}

/**
 * 群成员信息
 */
export interface GroupMemberInfo {
  user_id: number;
  nickname: string;
  card?: string;
  sex?: 'male' | 'female' | 'unknown';
  age?: number;
  area?: string;
  level: string;
  role: 'owner' | 'admin' | 'member';
  title: string;
  unfriendly?: boolean;
  title_expire_time: number;
  card_changeable?: boolean;
  join_time?: number;
  last_speak_time?: number;
  shut_up_timestamp?: number;
}

// ============================================================================
// NapCat API 请求/响应类型
// ============================================================================

/**
 * OneBot API 请求
 */
export interface NapCatApiRequest {
  action: string;
  params?: Record<string, unknown>;
  echo?: string;
}

/**
 * OneBot API 响应
 */
export interface NapCatApiResponse<T = unknown> {
  status: 'ok' | 'failed' | 'async' | 'failed_async';
  retcode: number;
  data?: T;
  message?: string;
  wording?: string;
  echo?: string;
}

// ============================================================================
// 数据库模型类型
// ============================================================================

/**
 * 消息记录
 */
export interface MessageRecord {
  id?: number;
  message_id: string;
  account_id: string;
  chat_type: 'direct' | 'group';
  chat_id: string;
  user_id: number;
  user_name: string;
  message_type: 'text' | 'image' | 'file' | 'voice' | 'video' | 'face' | 'mixed' | 'notice';
  content: string;
  raw_content: string;
  raw_message: string;
  timestamp: number;
  created_at?: number;
}

/**
 * 消息元素记录
 */
export interface MessageElementRecord {
  id?: number;
  message_id: string;
  element_type: string;
  element_data: string;
  sort_order: number;
}

/**
 * 用户记录
 */
export interface UserRecord {
  id?: number;
  user_id: number;
  nickname?: string;
  remark?: string;
  gender?: string;
  age?: number;
  level?: number;
  expression_style?: string;
  last_active?: number;
  created_at?: number;
}

/**
 * 群聊记录
 */
export interface GroupRecord {
  id?: number;
  group_id: number;
  group_name?: string;
  member_count?: number;
  max_member?: number;
  created_at?: number;
}

/**
 * 群成员记录
 */
export interface GroupMemberRecord {
  id?: number;
  group_id: number;
  user_id: number;
  card?: string;
  role?: 'owner' | 'admin' | 'member';
  title?: string;
  join_time?: number;
  last_speak?: number;
  speak_count?: number;
}

/**
 * 连接状态
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface NormalizedNapCatEventResult {
  kind: 'heartbeat' | 'message' | 'other';
  event?: NapCatMessageEvent | Record<string, unknown>;
  eventType?: string;
}
