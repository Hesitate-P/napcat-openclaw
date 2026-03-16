export interface AccessControlConfigLike {
  enabled?: boolean;
  groupWhitelist?: string;
  userBlacklist?: string;
  adminModeEnabled?: boolean;
  adminModePrivateChat?: boolean;
  adminModeGroupChat?: boolean;
}

export interface CheckAccessInput {
  isGroup: boolean;
  userId: number;
  groupId?: number;
  access: AccessControlConfigLike;
  admins: string;
}

export interface CheckAccessResult {
  allowed: boolean;
  isAdmin: boolean;
  reason?: string;
}

export function parseIdCsv(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export function isAdminUser(admins: string | undefined, userId: number): boolean {
  return parseIdCsv(admins).includes(String(userId));
}

export function checkAccessControl(input: CheckAccessInput): CheckAccessResult {
  const isAdmin = isAdminUser(input.admins, input.userId);
  const access = input.access || {};

  if (!access.enabled) {
    return { allowed: true, isAdmin };
  }

  const blacklist = parseIdCsv(access.userBlacklist);
  if (blacklist.includes(String(input.userId))) {
    return { allowed: false, isAdmin, reason: `用户 ${input.userId} 在黑名单中` };
  }

  if (input.isGroup) {
    const whitelist = parseIdCsv(access.groupWhitelist);
    if (whitelist.length > 0 && !whitelist.includes(String(input.groupId))) {
      return { allowed: false, isAdmin, reason: `群 ${input.groupId} 不在白名单中` };
    }
  }

  if (access.adminModeEnabled) {
    if (!input.isGroup && access.adminModePrivateChat && !isAdmin) {
      return { allowed: false, isAdmin, reason: `私聊管理员模式开启，用户 ${input.userId} 不是管理员` };
    }

    if (input.isGroup && access.adminModeGroupChat && !isAdmin) {
      return { allowed: false, isAdmin, reason: `群聊管理员模式开启，用户 ${input.userId} 不是管理员` };
    }
  }

  return { allowed: true, isAdmin };
}
