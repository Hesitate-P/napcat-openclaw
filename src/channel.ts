/**
 * NapCat Channel Plugin
 * 
 * ChannelPlugin 接口实现
 * 基于 NapCatQQ 的完整功能 QQ 频道插件
 * 
 * 已实现功能：
 * - WebSocket 连接管理（自动重连/心跳保活）
 * - 消息接收（私聊/群聊）
 * - 消息发送（文本/图片/表情）
 * - 消息解析（支持 27 种消息类型）
 * - 数据库存储（SQLite 持久化）
 * - 触发判断（@、戳一戳、关键词）
 * - QQ 聊天元数据嵌入（injectGatewayMeta）
 */

import type {
  ChannelPlugin,
  ChannelAccountSnapshot,
} from "openclaw/plugin-sdk";
import {
  DEFAULT_ACCOUNT_ID,
  buildChannelConfigSchema,
} from "openclaw/plugin-sdk";
import { NapCatClient } from "./client.js";
import { NapCatConfigSchema, type NapCatConfig, toNestedConfig } from "./config.js";
import { getNapcatRuntime } from "./runtime.js";
import { extractImageUrls, parseCQCode } from "./message/parser.js";
import { resolveMessageText } from "./utils/message-resolver.js";
import { DatabaseManager } from "./database/index.js";
import { getUserNickname } from "./utils/userinfo.js";
import { startPrivateTyping, stopPrivateTyping, setGroupTypingCard, clearGroupTypingCard, cleanupGroupCards } from "./streaming/typing-indicator.js";

import * as path from "node:path";

export type ResolvedNapcatAccount = ChannelAccountSnapshot & {
  config: NapCatConfig;
  client?: NapCatClient;
};

// 客户端实例映射
const clients = new Map<string, NapCatClient>();
const accountConfigs = new Map<string, NapCatConfig>();
const accountStartGeneration = new Map<string, number>();
const databases = new Map<string, DatabaseManager>();


/**
 * 构建 QQ 隐藏元数据块 - 完全照抄旧 qq 插件
 */
function buildQQHiddenMetaBlock(params: {
  accountId: string;
  userId: number;
  isGroup: boolean;
  groupId?: number;
  senderName?: string;
  isAdmin: boolean;
}): string {
  const chatType = params.isGroup ? "group" : "direct";
  const lines = [
    "<qq_context>",
    `userId=${params.userId}`,
    `senderName=${params.senderName || "unknown"}`,
    `isAdmin=${String(params.isAdmin)}`,
    `chatType=${chatType}`,
    params.isGroup ? `groupId=${String(params.groupId ?? "")}` : "",
    "</qq_context>",
  ].filter(Boolean);
  return `${lines.join("\n")}\n\n`;
}

/**
 * 获取账号对应的客户端
 */
function getClientForAccount(accountId: string): NapCatClient | undefined {
  return clients.get(accountId || DEFAULT_ACCOUNT_ID);
}

/**
 * 构建会话键
 */
function buildSessionKey(event: any, accountId: string): string {
  const isGroup = event.message_type === 'group';
  const userId = event.user_id;
  const groupId = event.group_id;
  
  if (isGroup) {
    return `group:${accountId}:group:${groupId}`;
  } else {
    return `direct:${accountId}:user:${userId}`;
  }
}

/**
 * NapCat Channel Plugin
 */
export const napcatChannel: ChannelPlugin<ResolvedNapcatAccount> = {
  id: "napcat",
  meta: {
    id: "napcat",
    label: "NapCat QQ",
    selectionLabel: "QQ (NapCat)",
    docsPath: "projects/openclaw-napcat-channel",
    blurb: "功能完善的 QQ 频道插件，支持完整消息类型、历史存储和 Block Streaming",
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
  },
  configSchema: buildChannelConfigSchema(NapCatConfigSchema),
  config: {
    listAccountIds: (cfg) => {
      const napcat = cfg.channels?.napcat;
      if (!napcat) return [];
      if ((napcat as any).accounts) return Object.keys((napcat as any).accounts);
      return [DEFAULT_ACCOUNT_ID];
    },
    resolveAccount: (cfg, accountId) => {
      const id = accountId ?? DEFAULT_ACCOUNT_ID;
      const napcat = cfg.channels?.napcat;
      const accountConfig = id === DEFAULT_ACCOUNT_ID ? napcat : (napcat as any)?.accounts?.[id];
      return {
        accountId: id,
        name: accountConfig?.name ?? "NapCat Default",
        enabled: true,
        configured: Boolean(accountConfig?.wsUrl),
        tokenSource: accountConfig?.accessToken ? "config" : "none",
        config: accountConfig || {},
      };
    },
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    describeAccount: (acc) => ({
      accountId: acc.accountId,
      configured: acc.configured,
    }),
  },
  directory: {
    listPeers: async ({ accountId }) => {
      const client = getClientForAccount(accountId || DEFAULT_ACCOUNT_ID);
      if (!client) return [];
      try {
        const friends = await client.getFriendList();
        return friends.map(f => ({
          id: String(f.user_id),
          name: f.remark || f.nickname,
          kind: "user" as const,
          metadata: { ...f }
        }));
      } catch (e) {
        console.error("[NapCat] listPeers error:", e);
        return [];
      }
    },
    listGroups: async ({ accountId }) => {
      const client = getClientForAccount(accountId || DEFAULT_ACCOUNT_ID);
      if (!client) return [];
      try {
        const groups = await client.getGroupList();
        return groups.map(g => ({
          id: String(g.group_id),
          name: g.group_name,
          kind: "group" as const,
          metadata: { ...g }
        }));
      } catch (e) {
        console.error("[NapCat] listGroups error:", e);
        return [];
      }
    }
  },
  status: {
    probeAccount: async ({ account, timeoutMs }) => {
      const config = account.config as NapCatConfig;
      const nestedConfig = toNestedConfig(config);
      if (!nestedConfig.connection.wsUrl) return { ok: false, error: "Missing wsUrl" };

      const runningClient = clients.get(account.accountId);
      if (runningClient) {
        try {
          const info = await Promise.race([
            runningClient.getLoginInfo(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Probe timeout")), timeoutMs || 5000)),
          ]);
          const data = info as any;
          return {
            ok: true,
            bot: { id: String(data?.user_id ?? ""), username: data?.nickname },
          };
        } catch (err) {
          return { ok: false, error: String(err) };
        }
      }

      const client = new NapCatClient({
        wsUrl: nestedConfig.connection.wsUrl || '',
        accessToken: nestedConfig.connection.accessToken || '',
      });

      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          client.disconnect();
          resolve({ ok: false, error: "Connection timeout" });
        }, timeoutMs || 5000);

        client.on("connect", async () => {
          try {
            const info = await client.getLoginInfo();
            clearTimeout(timer);
            client.disconnect();
            resolve({
              ok: true,
              bot: { id: String(info.user_id), username: info.nickname }
            });
          } catch (e) {
            clearTimeout(timer);
            client.disconnect();
            resolve({ ok: false, error: String(e) });
          }
        });

        client.on("error", (err) => {
          clearTimeout(timer);
          client.disconnect();
          resolve({ ok: false, error: String(err) });
        });

        client.connect().catch((err) => {
          clearTimeout(timer);
          resolve({ ok: false, error: String(err) });
        });
      });
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const { account, cfg } = ctx;
      const config = account.config as NapCatConfig;
      const nestedConfig = toNestedConfig(config);
      accountConfigs.set(account.accountId, config);
      
      // 初始化数据库
      if (nestedConfig.database.path) {
        const dbPath = path.isAbsolute(nestedConfig.database.path) 
          ? nestedConfig.database.path 
          : path.join(process.env.HOME || process.env.USERPROFILE || '.', '.openclaw', 'extensions', 'napcat', nestedConfig.database.path);
        
        const db = new DatabaseManager({
          type: 'sqlite',
          path: dbPath,
        });
        db.initialize();
        databases.set(account.accountId, db);
        console.log('[NapCat] 数据库已初始化:', dbPath);
      }

      if (!nestedConfig.connection.wsUrl) throw new Error("NapCat: wsUrl is required");

      // 检查是否已有客户端
      const existingLiveClient = clients.get(account.accountId);
      if (existingLiveClient?.isConnected()) {
        console.log(`[NapCat] Existing live client detected for account ${account.accountId}`);
        
        // 等待断开信号
        await new Promise<void>((resolve) => {
          if (ctx.abortSignal.aborted) {
            resolve();
            return;
          }
          ctx.abortSignal.addEventListener("abort", () => resolve(), { once: true });
        });
        return;
      }

      const accountGen = (accountStartGeneration.get(account.accountId) || 0) + 1;
      accountStartGeneration.set(account.accountId, accountGen);

      // 断开旧客户端
      const existingSet = clients.get(account.accountId);
      if (existingSet) {
        console.log(`[NapCat] Disconnecting stale client for account ${account.accountId}`);
        existingSet.disconnect();
      }

      const client = new NapCatClient({
        wsUrl: nestedConfig.connection.wsUrl || '',
        accessToken: nestedConfig.connection.accessToken || '',
      });

      const isStaleGeneration = () => accountStartGeneration.get(account.accountId) !== accountGen;

      clients.set(account.accountId, client);

      client.on("connect", async () => {
        console.log(`[NapCat] ===== connect 事件触发，account ${account.accountId} =====`);
        if (isStaleGeneration()) {
          console.log(`[NapCat] Ignore stale client connect for account ${account.accountId} gen=${accountGen}`);
          client.disconnect();
          return;
        }
        console.log(`[NapCat] Connected account ${account.accountId}`);
        try {
          console.log(`[NapCat] 正在获取登录信息...`);
          const info = await client.getLoginInfo();
          console.log(`[NapCat] 登录信息:`, info);
          if (info && info.user_id) {
            client.setSelfId(info.user_id);
            console.log(`[TypingIndicator] Bot ID: ${info.user_id}`);
          }
          if (info && info.nickname) console.log(`[NapCat] Logged in as: ${info.nickname} (${info.user_id})`);
          getNapcatRuntime().channel.activity.record({
            channel: "napcat", accountId: account.accountId, direction: "inbound",
          });
        } catch (err) {
          console.error("[NapCat] getLoginInfo error:", err);
        }
      });

      client.on("heartbeat", () => {
        if (isStaleGeneration()) return;
        getNapcatRuntime().channel.activity.record({
          channel: "napcat",
          accountId: account.accountId,
          direction: "inbound",
        });
      });

      client.on("message", async (event: any) => {
        try {
          if (isStaleGeneration()) return;
          
          getNapcatRuntime().channel.activity.record({
            channel: "napcat",
            accountId: account.accountId,
            direction: "inbound",
          });

          // 过滤自身消息（戳一戳消息不过滤）- 修复：使用 [戳一戳] 而非 [动作]
          const selfId = client.getSelfId() || event.self_id;
          const isPokeMessage = event.raw_message?.includes('[戳一戳]');
          if (selfId && String(event.user_id) === String(selfId) && !isPokeMessage) return;

          // 处理消息
          await handleIncomingMessage(account.accountId, event, config, client, cfg);
        } catch (err) {
          console.error("[NapCat] message handler error:", err);
        }
      });

      client.on("disconnect", () => {
        console.log(`[NapCat] Disconnected account ${account.accountId}`);
      });

      client.on("error", (err) => {
        console.error(`[NapCat] Error account ${account.accountId}:`, err);
      });

      // 连接
      await client.connect();

      // 等待断开信号
      await new Promise<void>((resolve) => {
        if (ctx.abortSignal.aborted) {
          resolve();
          return;
        }
        ctx.abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
    logoutAccount: async (ctx) => {
      const { account } = ctx;
      console.log(`[NapCat] Logout account ${account.accountId}`);
      
      const client = clients.get(account.accountId);
      if (client) {
        // 清理群名片
        await cleanupGroupCards(client);
        
        client.disconnect();
        clients.delete(account.accountId);
      }
      accountConfigs.delete(account.accountId);
      
      return { ok: true, cleared: true };
    },
  },
  outbound: {
    deliveryMode: "direct",
    
    /**
     * 发送文本消息
     * 注意：Block Streaming 由 OpenClaw 的 EmbeddedBlockChunker 处理
     * chunker 会根据配置多次调用 sendText，每次发送一个块
     */
    sendText: async (ctx: any) => {
      const { account, to, text } = ctx;
      const client = clients.get(account.accountId);
      
      if (!client) {
        throw new Error("NapCat client not initialized");
      }

      // 解析目标
      let target: { type: string; id: number; isGroup: boolean };
      if (to.startsWith("user:")) {
        target = { type: "private", id: parseInt(to.slice(5)), isGroup: false };
      } else if (to.startsWith("group:")) {
        target = { type: "group", id: parseInt(to.slice(6)), isGroup: true };
      } else if (to.startsWith("direct:")) {
        const parts = to.split(":");
        target = { type: "private", id: parseInt(parts[parts.length - 1]), isGroup: false };
      } else {
        throw new Error(`Invalid target format: ${to}`);
      }

      console.log('[NapCat] 发送文本消息:', {
        textLength: text.length,
        isGroup: target.isGroup,
        targetId: target.id,
      });

      const action = target.isGroup ? 'send_group_msg' : 'send_private_msg';
      const result: any = await client.sendAction(action, {
        [target.isGroup ? 'group_id' : 'user_id']: target.id,
        message: [{ type: 'text', data: { text: text } }],
      });

      return { 
        ok: true, 
        channel: "napcat", 
        messageId: result?.message_id ? String(result.message_id) : '',
      };
    },
  },
};

/**
 * 处理接收到的消息 - 完整实现
 */
async function handleIncomingMessage(
  accountId: string,
  event: any,
  _config: NapCatConfig,
  client: NapCatClient,
  cfg: any
): Promise<void> {
  try {
    const runtime = getNapcatRuntime();
    
    // 构建会话键（用于日志）
    buildSessionKey(event, accountId);
    
    // 解析聊天类型和目标
    const isGroup = event.message_type === 'group';
    const userId = event.user_id;
    const groupId = event.group_id;
    
    // 构建 fromId（参考 qq 插件格式：私聊用 user:前缀，群聊用纯数字）
    const fromId = isGroup ? String(groupId) : `user:${userId}`;
    
    // ========== 访问控制检查 ==========
    const nestedConfig = toNestedConfig(_config);
    const accessConfig = nestedConfig.accessControl || { enabled: false };
    
    if (accessConfig.enabled) {
      // 1. 检查用户黑名单
      const blacklistStr = accessConfig.userBlacklist || '';
      const blacklist = blacklistStr.split(',').map(id => id.trim()).filter(id => id.length > 0);
      if (blacklist.includes(String(userId))) {
        console.log(`[NapCat] 用户 ${userId} 在黑名单中，已忽略`);
        return;  // 直接返回，不处理
      }
      
      // 2. 检查群白名单（仅群聊）
      if (isGroup) {
        const whitelistStr = accessConfig.groupWhitelist || '';
        const whitelist = whitelistStr.split(',').map(id => id.trim()).filter(id => id.length > 0);
        if (whitelist.length > 0 && !whitelist.includes(String(groupId))) {
          console.log(`[NapCat] 群 ${groupId} 不在白名单中，已忽略`);
          return;  // 直接返回，不处理
        }
      }
      
      // 3. 检查管理员模式
      if (accessConfig.adminModeEnabled) {
        const adminsStr = nestedConfig.admins || '';
        const adminIds = adminsStr.split(',').map(id => id.trim()).filter(id => id.length > 0);
        const isAdmin = adminIds.includes(String(userId));
        
        // 私聊管理员模式
        if (!isGroup && accessConfig.adminModePrivateChat && !isAdmin) {
          console.log(`[NapCat] 私聊管理员模式开启，用户 ${userId} 不是管理员，已忽略`);
          return;
        }
        
        // 群聊管理员模式
        if (isGroup && accessConfig.adminModeGroupChat && !isAdmin) {
          console.log(`[NapCat] 群聊管理员模式开启，用户 ${userId} 不是管理员，已忽略`);
          return;
        }
      }
    }
    
    // 触发判断
    let shouldTrigger = false;
    const triggerConfig = nestedConfig.trigger || { enabled: true, atBot: true, keywords: '' };
    const selfId = client.getSelfId() || event.self_id;  // 修复：fallback 到 event.self_id
    
    // 戳一戳消息处理 - 只保留格式 3，解析不了直接用数字 ID
    let pokeUserName = '';
    let pokeTargetName = '';
    let pokeUserId = '';
    let pokeTargetId = '';
    
    if (event.raw_message && event.raw_message.includes('[戳一戳]') && isGroup) {
      // 只匹配格式 3: [戳一戳] Hesitate_P(3341299096) 戳了 有鱼喵 (1136868602)
      const pokeMatch = event.raw_message.match(/\[戳一戳\] (.+?)\((\d+)\) 戳了 (.+?)\((\d+)\)/);
      
      if (pokeMatch) {
        pokeUserId = pokeMatch[2];
        pokeTargetId = pokeMatch[4];
        
        // 获取昵称（使用 userinfo.ts 工具函数）
        try {
          pokeUserName = await getUserNickname(client, parseInt(pokeUserId), groupId);
        } catch (e) {
          pokeUserName = pokeUserId;
        }
        
        try {
          pokeTargetName = await getUserNickname(client, parseInt(pokeTargetId), groupId);
        } catch (e) {
          pokeTargetName = pokeTargetId;
        }
        
        // 更新消息格式
        if (pokeUserName && pokeTargetName) {
          event.raw_message = `[戳一戳] ${pokeUserName}(${pokeUserId}) 戳了 ${pokeTargetName}(${pokeTargetId})`;
          event.message = [{ type: 'text', data: { text: event.raw_message } }];
        }
      }
    }
    
    // 触发判断逻辑
    const isPokeMessage = event.raw_message && event.raw_message.includes('[戳一戳]');
    
    if (isPokeMessage) {
      // 戳一戳消息：检查是否戳了机器人
      let targetId = '';
      
      // 只匹配格式 3，解析不了直接用数字
      let pokeMatch = event.raw_message.match(/\[戳一戳\] (.+?)\((\d+)\) 戳了 (.+?)\((\d+)\)/);
      if (pokeMatch) {
        targetId = pokeMatch[4];
      } else {
        // 解析不了，尝试从其他格式提取数字
        pokeMatch = event.raw_message.match(/\[戳一戳\].*?(\d+).*?戳了.*?(\d+)/);
        if (pokeMatch) {
          targetId = pokeMatch[2];
        }
      }
      
      if (targetId && String(targetId) === String(selfId)) {
        shouldTrigger = true;
      }
    }
    else if (isGroup && triggerConfig.enabled) {
      // Check if bot is mentioned
      if (triggerConfig.atBot && Array.isArray(event.message)) {
        const hasAt = event.message.some((seg: any) => 
          seg.type === 'at' && (String(seg.data?.qq) === String(selfId) || seg.data?.qq === 'all')
        );
        if (hasAt) {
          shouldTrigger = true;
        }
      }
      
      // Check keywords
      if (!shouldTrigger) {
        const keywordsStr = typeof triggerConfig.keywords === 'string' ? triggerConfig.keywords : '';
        const keywords = keywordsStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
        if (keywords.length > 0) {
          const rawMessage = event.raw_message || '';
          const hasKeyword = keywords.some((keyword: string) => 
            rawMessage.includes(keyword)
          );
          if (hasKeyword) {
            shouldTrigger = true;
          }
        }
      }
    } else if (!isGroup) {
      // Private message, trigger by default
      shouldTrigger = true;
    }
    
    // ========== 自动获取上下文（群聊被唤醒时） ==========
    let contextHistory = '';
    if (shouldTrigger && isGroup && nestedConfig.context?.enabled) {
      try {
        const contextCount = nestedConfig.context.messageCount || 5;
        console.log(`[NapCat] 自动获取群聊历史消息，最近 ${contextCount} 条...`);
        
        // 调用 query_messages 查询历史消息
        const historyResult: any = await client.sendAction('get_group_msg_history', {
          group_id: groupId,
          message_seq: 0,  // 0 表示最新消息
          count: contextCount,
          reverseOrder: true,  // 倒序，最新的在前
        });
        
        // 格式化历史消息 - 复用已有的消息解析逻辑
        const historyMessages = await Promise.all((historyResult?.messages || []).map(async (msg: any) => {
          const senderName = msg.sender?.nickname || msg.sender?.card || '未知';
          
          // 复用 resolveMessageText 函数解析消息内容（包含@昵称、表情名称、图片描述等）
          let content = '';
          try {
            content = await resolveMessageText(msg.message || [], client, groupId, cfg);
          } catch (e) {
            // 解析失败时用简单格式
            content = (msg.message || []).map((m: any) => {
              if (m.type === 'text') return m.data?.text || '';
              if (m.type === 'file') return `[文件：${m.data?.name || 'unknown'}]`;
              if (m.type === 'image') return '[图片]';
              if (m.type === 'record') return '[语音]';
              if (m.type === 'video') return '[视频]';
              if (m.type === 'at') return `@${m.data?.qq === 'all' ? '所有人' : m.data?.qq || ''}`;
              return '';
            }).join('');
          }
          
          return `${senderName}: ${content}`;
        }));
        
        const formattedHistory = historyMessages.reverse().join('\n');  // 正序排列，旧消息在前
        
        if (formattedHistory) {
          contextHistory = `\n【群聊上下文】\n${formattedHistory}\n【当前消息】\n`;
          console.log(`[NapCat] 已获取 ${formattedHistory.split('\n').length} 条历史消息`);
        }
      } catch (error) {
        console.error('[NapCat] 获取历史消息失败:', error);
      }
    }
    
    // 解析消息内容（包含@昵称和表情名称）
    let fullContent = event.raw_message || "";
    let messageElements = event.message;
    
    console.log('[NapCat] 消息解析前:', {
      messageType: event.message_type,
      messageIsArray: Array.isArray(event.message),
      messageTypeof: typeof event.message,
      rawMessage: event.raw_message?.substring(0, 100),
    });
    
    // 如果 message 是字符串（CQ 码格式），需要解析成数组
    if (typeof event.message === 'string') {
      const cqElements = parseCQCode(event.message);
      messageElements = cqElements.map(el => ({ type: el.type, data: el.data }));
      console.log('[NapCat] CQ 码解析后元素数量:', messageElements.length);
    }
    
    // 如果 message 是数组，直接解析
    if (Array.isArray(messageElements)) {
      console.log('[NapCat] 开始解析消息元素，数量:', messageElements.length);
      fullContent = await resolveMessageText(messageElements, client, isGroup ? groupId : undefined, cfg);
      console.log('[NapCat] 解析后内容:', fullContent.substring(0, 200));
    }
    
    const imageUrls = extractImageUrls(messageElements);
    console.log('[NapCat] 提取图片 URL 数量:', imageUrls.length);
    
    // 构建发送函数
    const deliver = async (payload: any): Promise<void> => {
      const messages: Array<{ type: string; data: any }> = [];
      
      // 添加文本消息
      if (payload.text && payload.text.trim()) {
        messages.push({ type: 'text', data: { text: payload.text } });
      }
      
      // 添加图片消息
      const mediaUrls = payload.mediaUrls || payload.MediaUrls || payload.imageUrls || payload.images;
      if (mediaUrls && Array.isArray(mediaUrls)) {
        for (const url of mediaUrls) {
          let fileParam = url;
          if (!url.startsWith('http') && !url.startsWith('base64://') && !url.startsWith('file:')) {
            fileParam = `http://${url}`;
          }
          messages.push({ type: 'image', data: { file: fileParam } });
        }
      }
      
      // 添加表情消息
      const faces = payload.faces || payload.Faces || payload.emotions || [];
      if (faces && Array.isArray(faces)) {
        for (const face of faces) {
          const faceId = typeof face === 'number' ? face : face.id || face.face_id;
          if (faceId) {
            messages.push({ type: 'face', data: { id: String(faceId) } });
          }
        }
      }
      
      if (messages.length === 0) return;
      
      if (isGroup) {
        await client.sendAction('send_group_msg', {
          group_id: groupId,
          message: messages,
        });
      } else {
        await client.sendAction('send_private_msg', {
          user_id: userId,
          message: messages,
        });
      }
    };
    
    // 解析路由
    const route = runtime.channel.routing.resolveAgentRoute({
      cfg,
      channel: 'napcat',
      accountId,
      peer: {
        kind: isGroup ? 'group' : 'direct',
        id: fromId,
      },
    });
    
    // 创建分发器
    const { dispatcher } = runtime.channel.reply.createReplyDispatcherWithTyping({ deliver });
    
    // 构建 QQ 聊天元数据
    let systemBlock = '';
    
    // 管理员检测
    const adminsStr = typeof nestedConfig.admins === 'string' ? nestedConfig.admins : '';
    const adminIds = adminsStr.split(',').map(id => id.trim()).filter(id => id.length > 0);
    const isAdmin = adminIds.includes(String(userId));
    
    console.log('[NapCat] 管理员检测:', {
      adminsStr,
      adminIds,
      userId: String(userId),
      isAdmin,
      nestedConfigAdmins: nestedConfig.admins,
    });
    
    // 构建简化的 QQ 元数据块
    systemBlock += buildQQHiddenMetaBlock({
      accountId: route.accountId,
      userId,
      isGroup,
      groupId,
      senderName: event.sender?.nickname || event.sender?.card || 'Unknown',
      isAdmin,
    });
    
    // 简化系统指令
    const systemInstruction = `<system_instruction>
【重要】平台限制，请用自然拟人化风格回复，遵守：
- **禁用 Markdown**：纯文本，不用任何标记（如**、#、-等）。比如想列数据，直接说"A 手机 3000 块，B 手机 2500 左右～"而不是画表格。
- **口语化**：像真人聊天，可用表情、网络语、语气词（啦、哦、hh）。
- **连贯对话**：多轮时注意承接，就像微信/论坛里唠嗑。
- **换行别太频**：只在人类自然停顿处换行。

【多模态能力】你接入的是多模态大模型，可以直接看到图片和访问 URL：
- 消息中的图片可以直接分析和描述，不要说"我看不到图片"
- 群聊历史中的图片也可以直接看到
- URL 链接可以直接访问读取内容
- 如果用户发图片，直接描述图片内容，不要让用户描述

示例：
❌ Markdown：今天天气真好，我们去海边吧！[详情]
✅ 拟人化：今天天气真好啊，要不要一起去海边玩？

始终这样，聊得轻松点～
</system_instruction>
`;
    systemBlock += systemInstruction;
    
    // 构建上下文
    // systemBlock 包含 <qq_context> 和 <system_instruction> 标签
    // 添加群聊历史上下文到消息体中
    const bodyWithMeta = `${systemBlock}${contextHistory}${fullContent}`;
    // Body 使用纯文本（不含标签），供 Dashboard/日志显示
    const cleanBody = `${contextHistory}${fullContent}`;
    
    console.log('[NapCat] 构建上下文:', {
      fullContent: fullContent.substring(0, 200),
      bodyWithMeta: bodyWithMeta.substring(0, 500),
      systemBlockLength: systemBlock.length,
      rawBody: event.raw_message?.substring(0, 200),
      imageUrlsCount: imageUrls.length,
    });
    
    console.log('[NapCat] systemBlock 内容:', systemBlock.substring(0, 500));
    
    // 使用 BodyForAgent 字段正确传递系统指令给 Agent
    const ctxPayload = runtime.channel.reply.finalizeInboundContext({
      Provider: 'napcat',
      Channel: 'napcat',
      From: fromId,
      To: 'napcat:bot',
      Body: cleanBody,  // 干净的文本，不含标签
      RawBody: bodyWithMeta,
      SenderId: String(userId),
      SenderName: event.sender?.nickname || 'Unknown',
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: isGroup ? 'group' : 'direct',
      Timestamp: event.time * 1000,
      Surface: 'napcat',
      CommandAuthorized: true,
      ...(imageUrls.length > 0 && { MediaUrls: imageUrls }),
    });
    
    // 记录入站会话（照抄旧 qq 插件，确保元数据正确显示）
    await runtime.channel.session.recordInboundSession({
      storePath: runtime.channel.session.resolveStorePath(cfg.session?.store, { agentId: route.agentId }),
      sessionKey: ctxPayload.SessionKey!,
      ctx: ctxPayload,
      updateLastRoute: undefined,
      onRecordError: (err) => console.error('[NapCat] Session Record Error:', err),
    });
    
    // 只有触发的消息才分发给 Agent
    if (shouldTrigger) {
      console.log(`[NapCat] 开始输入状态，isGroup=${isGroup}, groupId=${groupId}, userId=${userId}`);
      
      // 确保 selfId 已设置
      if (!client.getSelfId()) {
        const selfId = event.self_id;
        if (selfId) {
          client.setSelfId(selfId);
          console.log(`[NapCat] 设置 selfId=${selfId}`);
        }
      }
      
      // 开始输入状态
      if (isGroup) {
        await setGroupTypingCard(client, accountId, groupId);
      } else {
        await startPrivateTyping(client, userId);
      }
      
      try {
        await runtime.channel.reply.dispatchReplyFromConfig({
          ctx: ctxPayload,
          cfg: cfg,
          dispatcher,
          replyOptions: {},
        });
        
        await dispatcher.waitForIdle();
      } finally {
        // 结束输入状态（确保即使出错也会执行）
        if (isGroup) {
          clearGroupTypingCard(client, accountId, groupId);
        } else {
          await stopPrivateTyping(client, userId);
        }
        console.log(`[NapCat] 结束输入状态，isGroup=${isGroup}`);
      }
    } else {
      console.log(`[NapCat] 消息未触发，shouldTrigger=${shouldTrigger}`);
    }
    
    // 保存到数据库
    const db = databases.get(accountId);
    if (db) {
      try {
        const isNoticeMessage = event.post_type === 'notice' || 
                                fullContent.includes('[戳一戳]') || 
                                fullContent.includes('[系统通知]') ||
                                fullContent.includes('[群文件上传]') ||
                                fullContent.includes('[群成员增加]') ||
                                fullContent.includes('[群成员减少]');
        
        const messageId = isNoticeMessage ? `notice_${Date.now()}` : String(event.message_id);
        const chatType = isGroup ? 'group' : 'direct';
        const chatId = isGroup ? String(groupId) : `user:${userId}`;
        const userName = event.sender?.nickname || event.sender?.card || String(userId);
        const messageType = isNoticeMessage ? 'notice' : 'text';
        
        await db.saveMessage({
          message_id: messageId,
          account_id: accountId,
          chat_type: chatType,
          chat_id: chatId,
          user_id: userId,
          user_name: userName,
          message_type: messageType,
          content: fullContent,
          raw_content: JSON.stringify(event.message),
          raw_message: event.raw_message || '',
          timestamp: event.time * 1000,
        });
      } catch (err) {
        console.error('[NapCat] 数据库保存失败:', err);
      }
    }
    
  } catch (err) {
    console.error('[NapCat] handleIncomingMessage error:', err);
  }
}
