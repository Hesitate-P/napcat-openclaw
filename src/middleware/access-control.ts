/**
 * 访问控制中间件
 *
 * 根据配置决定是否允许处理该消息。
 * 返回 false 表示拦截（不处理），true 表示放行。
 */

import type { NapCatConfig } from '../config.js';
import { toNestedConfig } from '../config.js';

export interface AccessContext {
  userId:  number;
  groupId?: number;
  isGroup: boolean;
}

/**
 * 检查是否允许处理该消息。
 * @returns true = 放行, false = 拦截
 */
export function checkAccess(
  ctx:    AccessContext,
  config: NapCatConfig,
): boolean {
  const nested = toNestedConfig(config);
  const ac     = nested.accessControl;

  if (!ac.enabled) return true;

  // 用户黑名单
  const blacklist = ac.userBlacklist
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (blacklist.includes(String(ctx.userId))) {
    console.log(`[AccessControl] 用户 ${ctx.userId} 在黑名单中，已拦截`);
    return false;
  }

  // 群白名单
  if (ctx.isGroup && ctx.groupId !== undefined) {
    const whitelist = ac.groupWhitelist
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (whitelist.length > 0 && !whitelist.includes(String(ctx.groupId))) {
      console.log(`[AccessControl] 群 ${ctx.groupId} 不在白名单，已拦截`);
      return false;
    }
  }

  // 管理员模式
  if (ac.adminModeEnabled) {
    const adminIds = nested.admins
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const isAdmin = adminIds.includes(String(ctx.userId));

    if (!ctx.isGroup && ac.adminModePrivateChat && !isAdmin) {
      console.log(`[AccessControl] 私聊管理员模式：用户 ${ctx.userId} 不是管理员，已拦截`);
      return false;
    }
    if (ctx.isGroup && ac.adminModeGroupChat && !isAdmin) {
      console.log(`[AccessControl] 群聊管理员模式：用户 ${ctx.userId} 不是管理员，已拦截`);
      return false;
    }
  }

  return true;
}

/**
 * 检查用户是否是管理员
 */
export function isAdmin(userId: number, config: NapCatConfig): boolean {
  const nested   = toNestedConfig(config);
  const adminIds = nested.admins
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return adminIds.includes(String(userId));
}
