/**
 * NapCat Channel Plugin
 *
 * 只负责 OpenClaw ChannelPlugin 接口实现、账号生命周期管理、outbound 发送。
 * 消息处理逻辑见 handler/inbound-handler.ts。
 */

import type { ChannelPlugin, ChannelAccountSnapshot } from 'openclaw/plugin-sdk';
import { DEFAULT_ACCOUNT_ID, buildChannelConfigSchema } from 'openclaw/plugin-sdk';
import * as path from 'node:path';
import * as fs   from 'node:fs';

import { NapCatClient } from './client.js';
import { NapCatConfigSchema, type NapCatConfig, toNestedConfig } from './config.js';
import { handleIncomingMessage } from './handler/inbound-handler.js';
import { cleanupGroupCards } from './streaming/typing-indicator.js';
import { DatabaseManager } from './database/index.js';

export type ResolvedNapcatAccount = ChannelAccountSnapshot & {
  config: NapCatConfig;
  client?: NapCatClient;
};

// ── 运行时状态（模块级单例）────────────────────────────────────────────────────

const clients          = new Map<string, NapCatClient>();
const accountConfigs   = new Map<string, NapCatConfig>();
const accountGenMap    = new Map<string, number>();     // 防止 stale handler
const databases        = new Map<string, DatabaseManager>();

// ── 工具函数 ────────────────────────────────────────────────────────────────────

function getClient(accountId: string): NapCatClient | undefined {
  return clients.get(accountId || DEFAULT_ACCOUNT_ID);
}

function parseTarget(to: string): { type: 'private' | 'group'; id: number } {
  if (to.startsWith('user:'))   return { type: 'private', id: parseInt(to.slice(5)) };
  if (to.startsWith('direct:')) return { type: 'private', id: parseInt(to.split(':').pop()!) };
  if (to.startsWith('group:')) {
    const parts = to.split(':');
    return { type: 'group', id: parseInt(parts[parts.length - 1]) };
  }
  if (/^\d+$/.test(to))         return { type: 'group',   id: parseInt(to) };
  throw new Error(`[NapCat] Invalid target format: ${to}`);
}

// ── Plugin 定义 ─────────────────────────────────────────────────────────────────

export const napcatChannel: ChannelPlugin<ResolvedNapcatAccount> = {
  id: 'napcat',
  meta: {
    id:             'napcat',
    label:          'NapCat QQ',
    selectionLabel: 'QQ (NapCat)',
    docsPath:       'projects/openclaw-napcat-channel',
    blurb:          '功能完善的 QQ 频道插件，支持完整消息类型、历史存储和 Block Streaming',
  },
  capabilities: { chatTypes: ['direct', 'group'], media: true },
  configSchema: buildChannelConfigSchema(NapCatConfigSchema),

  config: {
    listAccountIds: (cfg) => {
      const napcat = cfg.channels?.napcat;
      if (!napcat) return [];
      if ((napcat as any).accounts) return Object.keys((napcat as any).accounts);
      return [DEFAULT_ACCOUNT_ID];
    },
    resolveAccount: (cfg, accountId) => {
      const id      = accountId ?? DEFAULT_ACCOUNT_ID;
      const napcat  = cfg.channels?.napcat as any;
      const accConf = id === DEFAULT_ACCOUNT_ID ? napcat : napcat?.accounts?.[id];
      return {
        accountId:   id,
        name:        accConf?.name ?? 'NapCat Default',
        enabled:     true,
        configured:  Boolean(accConf?.connection?.wsUrl || accConf?.wsUrl),
        tokenSource: (accConf?.connection?.accessToken || accConf?.accessToken) ? 'config' : 'none',
        config:      accConf || {},
      };
    },
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    describeAccount:  (acc) => ({ accountId: acc.accountId, configured: acc.configured }),
  },

  directory: {
    listPeers: async ({ accountId }) => {
      const client = getClient(accountId || DEFAULT_ACCOUNT_ID);
      if (!client) return [];
      try {
        const friends = await client.getFriendList();
        return friends.map((f) => ({ id: String(f.user_id), name: f.remark || f.nickname, kind: 'user' as const, metadata: { ...f } }));
      } catch { return []; }
    },
    listGroups: async ({ accountId }) => {
      const client = getClient(accountId || DEFAULT_ACCOUNT_ID);
      if (!client) return [];
      try {
        const groups = await client.getGroupList();
        return groups.map((g) => ({ id: String(g.group_id), name: g.group_name, kind: 'group' as const, metadata: { ...g } }));
      } catch { return []; }
    },
  },

  status: {
    probeAccount: async ({ account, timeoutMs }) => {
      const config      = account.config as NapCatConfig;
      const nested      = toNestedConfig(config);
      if (!nested.connection.wsUrl) return { ok: false, error: 'Missing wsUrl' };

      const running = clients.get(account.accountId);
      if (running) {
        try {
          const info = await Promise.race([
            running.getLoginInfo(),
            new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), timeoutMs ?? 5000)),
          ]) as any;
          return { ok: true, bot: { id: String(info?.user_id ?? ''), username: info?.nickname } };
        } catch (err) { return { ok: false, error: String(err) }; }
      }

      // 临时连接探活
      const probe = new NapCatClient({ wsUrl: nested.connection.wsUrl, accessToken: nested.connection.accessToken });
      return new Promise((resolve) => {
        const timer = setTimeout(() => { probe.disconnect(); resolve({ ok: false, error: 'Connection timeout' }); }, timeoutMs ?? 5000);
        probe.on('connect', async () => {
          try {
            const info = await probe.getLoginInfo();
            clearTimeout(timer); probe.disconnect();
            resolve({ ok: true, bot: { id: String(info.user_id), username: info.nickname } });
          } catch (e) { clearTimeout(timer); probe.disconnect(); resolve({ ok: false, error: String(e) }); }
        });
        probe.on('error', (err: any) => { clearTimeout(timer); probe.disconnect(); resolve({ ok: false, error: String(err) }); });
        probe.connect().catch((err) => { clearTimeout(timer); resolve({ ok: false, error: String(err) }); });
      });
    },
  },

  gateway: {
    startAccount: async (ctx) => {
      const { account, cfg } = ctx;
      const config   = account.config as NapCatConfig;
      const nested   = toNestedConfig(config);
      accountConfigs.set(account.accountId, config);

      const channelRuntime = ctx.channelRuntime;

      // 初始化数据库
      if (nested.database.path) {
        const pluginDir = path.dirname(path.dirname(new URL(import.meta.url).pathname)); // src/../ = 插件根目录
        const dbPath = path.isAbsolute(nested.database.path)
          ? nested.database.path
          : path.join(pluginDir, nested.database.path);
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        const db = new DatabaseManager({ type: 'sqlite', path: dbPath });
        db.initialize();
        databases.set(account.accountId, db);
        console.log('[NapCat] 数据库已初始化:', dbPath);
      }

      if (!nested.connection.wsUrl) throw new Error('NapCat: wsUrl is required');

      // 检查已有存活客户端
      const existing = clients.get(account.accountId);
      if (existing?.isConnected()) {
        console.log(`[NapCat] 账号 ${account.accountId} 已有连接`);
        await new Promise<void>((resolve) => {
          if (ctx.abortSignal.aborted) { resolve(); return; }
          ctx.abortSignal.addEventListener('abort', () => resolve(), { once: true });
        });
        return;
      }

      // 新 generation，防止 stale handler
      const gen = (accountGenMap.get(account.accountId) ?? 0) + 1;
      accountGenMap.set(account.accountId, gen);
      const isStale = () => accountGenMap.get(account.accountId) !== gen;

      // 断开旧客户端
      existing?.disconnect();

      const client = new NapCatClient({
        wsUrl:        nested.connection.wsUrl,
        accessToken:  nested.connection.accessToken,
      });
      clients.set(account.accountId, client);

      client.on('connect', async () => {
        if (isStale()) { client.disconnect(); return; }
        console.log(`[NapCat] 账号 ${account.accountId} 已连接`);
        try {
          const info = await client.getLoginInfo();
          if (info?.user_id) client.setSelfId(info.user_id);
          if (info?.nickname) console.log(`[NapCat] 登录：${info.nickname} (${info.user_id})`);
        } catch (err) { console.error('[NapCat] getLoginInfo 失败:', err); }
      });

      client.on('message', async (event: any) => {
        if (isStale()) return;
        // 过滤自身消息（戳一戳除外）
        const selfId      = client.getSelfId() ?? event.self_id;
        const isPoke      = event.raw_message?.includes('[戳一戳]');
        if (selfId && String(event.user_id) === String(selfId) && !isPoke) return;
        try {
          await handleIncomingMessage(
            account.accountId, event, config, client, cfg, channelRuntime,
            databases.get(account.accountId),
          );
        } catch (err) { console.error('[NapCat] message handler error:', err); }
      });

      client.on('disconnect', () => console.log(`[NapCat] 账号 ${account.accountId} 已断开`));
      client.on('error',      (err: any) => console.error(`[NapCat] 错误 ${account.accountId}:`, err));

      await client.connect();

      // 持续等待直到 abort
      await new Promise<void>((resolve) => {
        if (ctx.abortSignal.aborted) { resolve(); return; }
        ctx.abortSignal.addEventListener('abort', () => resolve(), { once: true });
      });
    },

    logoutAccount: async (ctx) => {
      const { account } = ctx;
      const client = clients.get(account.accountId);
      if (client) {
        await cleanupGroupCards(client);
        client.disconnect();
        clients.delete(account.accountId);
      }
      accountConfigs.delete(account.accountId);
      const db = databases.get(account.accountId);
      if (db) {
        db.close();
        databases.delete(account.accountId);
      }
      return { ok: true, cleared: true };
    },
  },

  outbound: {
    deliveryMode: 'direct',
    sendText: async (ctx: any) => {
      const { account, to, text } = ctx;
      const client = clients.get(account.accountId);
      if (!client) throw new Error('NapCat client not initialized');

      const { type, id } = parseTarget(to);
      if (isNaN(id)) throw new Error(`[NapCat] Invalid target id from: ${to}`);

      const action = type === 'group' ? 'send_group_msg' : 'send_private_msg';
      const result: any = await client.sendAction(action, {
        [type === 'group' ? 'group_id' : 'user_id']: id,
        message: [{ type: 'text', data: { text } }],
      });

      return { ok: true, channel: 'napcat', messageId: result?.message_id ? String(result.message_id) : '' };
    },
  },
};
