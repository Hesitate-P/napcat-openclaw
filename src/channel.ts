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
 * - 入站上下文构建与隐式平台提示
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
import { DatabaseManager } from "./database/index.js";
import { cleanupGroupCards } from "./streaming/typing-indicator.js";
import { deleteMessageOutbound, sendMediaOutbound, sendTextOutbound } from "./outbound.js";
import { handleIncomingNapcatMessage } from "./messaging.js";

import * as path from "node:path";

export type ResolvedNapcatAccount = ChannelAccountSnapshot & {
  config: NapCatConfig;
  client?: NapCatClient;
};

// 客户端实例映射
const clients = new Map<string, NapCatClient>();
const accountStartGeneration = new Map<string, number>();
const databases = new Map<string, DatabaseManager>();


/**
 * 获取账号对应的客户端
 */
function getClientForAccount(accountId: string): NapCatClient | undefined {
  return clients.get(accountId || DEFAULT_ACCOUNT_ID);
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
      const wsUrl = accountConfig?.connection?.wsUrl ?? accountConfig?.wsUrl;
      const accessToken = accountConfig?.connection?.accessToken ?? accountConfig?.accessToken;
      return {
        accountId: id,
        name: accountConfig?.name ?? "NapCat Default",
        enabled: true,
        configured: Boolean(wsUrl),
        tokenSource: accessToken ? "config" : "none",
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

        client.on("connected", async () => {
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

      client.on("connected", async () => {
        console.log(`[NapCat] ===== connected 事件触发，account ${account.accountId} =====`);
        if (isStaleGeneration()) {
          console.log(`[NapCat] Ignore stale client connected event for account ${account.accountId} gen=${accountGen}`);
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
          await handleIncomingNapcatMessage({
            accountId: account.accountId,
            event,
            config,
            client,
            cfg,
            db: databases.get(account.accountId),
          });
        } catch (err) {
          console.error("[NapCat] message handler error:", err);
        }
      });

      client.on("disconnected", () => {
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
      const db = databases.get(account.accountId);
      if (db) {
        db.close();
        databases.delete(account.accountId);
      }
      
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
      const { account } = ctx;
      const client = clients.get(account.accountId);
      
      if (!client) {
        return { ok: false, code: "send_failed", error: "NapCat client not initialized" };
      }
      return sendTextOutbound(ctx, client);
    },
    sendMedia: async (ctx: any) => {
      const client = clients.get(ctx.account.accountId);
      if (!client) {
        return { ok: false, code: "send_failed", error: "NapCat client not initialized" };
      }
      return sendMediaOutbound(ctx, client);
    },
    deleteMessage: async (ctx: any) => {
      const client = clients.get(ctx.account.accountId);
      if (!client) {
        return { ok: false, code: "send_failed", error: "NapCat client not initialized" };
      }
      return deleteMessageOutbound(ctx, client);
    },
  },
};
