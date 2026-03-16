import assert from "node:assert/strict";
import test from "node:test";
import { checkAccessControl } from "../src/access-control.js";
import { toNestedConfig, validateConfig } from "../src/config.js";
import { buildInboundBodies } from "../src/inbound-context.js";
import { normalizeNapCatEvent } from "../src/message/notice-normalizer.js";
import { deleteMessageOutbound, parseNapcatTarget, sendTextOutbound } from "../src/outbound.js";
import { persistInboundMessage } from "../src/persistence.js";

test("checkAccessControl handles blacklist and admin mode", () => {
  const blocked = checkAccessControl({
    isGroup: false,
    userId: 123,
    access: {
      enabled: true,
      userBlacklist: "123,456",
    },
    admins: "",
  });
  assert.equal(blocked.allowed, false);

  const allowedAdmin = checkAccessControl({
    isGroup: true,
    userId: 42,
    groupId: 99,
    access: {
      enabled: true,
      adminModeEnabled: true,
      adminModeGroupChat: true,
    },
    admins: "42",
  });
  assert.equal(allowedAdmin.allowed, true);
  assert.equal(allowedAdmin.isAdmin, true);
});

test("buildInboundBodies keeps history in body and prepends implicit hint to rawBody", () => {
  const result = buildInboundBodies("你好", "【群聊上下文】\nA: hi\n【当前消息】\n", {
    senderId: 1,
    senderName: "Alice",
    isGroup: true,
    groupId: 100,
    isAdmin: false,
    hasMedia: true,
  });

  assert.match(result.body, /群聊上下文/);
  assert.match(result.rawBody, /^系统补充：当前会话=群聊/);
  assert.match(result.rawBody, /本条消息含媒体/);
});

test("normalizeNapCatEvent converts poke notice into message event", () => {
  const payload = {
    post_type: "notice",
    notice_type: "notify",
    sub_type: "poke",
    group_id: 123,
    user_id: 11,
    target_id: 22,
    sender: { nickname: "Alice" },
  };

  const normalized = normalizeNapCatEvent(payload, 22);
  assert.equal(normalized.kind, "message");
  assert.equal(normalized.event?.post_type, "message");
  assert.match(normalized.event?.raw_message, /\[戳一戳\]/);
});

test("validateConfig accepts nested schema and toNestedConfig keeps defaults", () => {
  const result = validateConfig({
    connection: { wsUrl: "ws://127.0.0.1:3001", accessToken: "" },
    messaging: { blockStreaming: true, textChunkLimit: 1800, chunkMode: "newline" },
    typing: { enabled: true, privateChat: "api", groupChat: "nickname", nicknameSuffix: "输入中", delayMs: 100 },
    database: { type: "sqlite", path: "./napcat.db" },
    trigger: { enabled: true, atBot: true, keywords: "bot" },
    context: { enabled: true, messageCount: 3 },
    accessControl: {
      enabled: false,
      groupWhitelist: "",
      userBlacklist: "",
      adminMode: { enabled: false, privateChat: false, groupChat: false },
    },
    admins: "",
    media: { sharedHostDir: "", sharedContainerDir: "/openclaw_media" },
  });

  assert.equal(result.valid, true);
  const nested = toNestedConfig({
    connection: { wsUrl: "ws://127.0.0.1:3001", accessToken: "" },
    messaging: { blockStreaming: true, textChunkLimit: 1800, chunkMode: "newline" },
    typing: { enabled: true, privateChat: "api", groupChat: "nickname", nicknameSuffix: "输入中", delayMs: 100 },
    database: { type: "sqlite", path: "./napcat.db" },
    trigger: { enabled: true, atBot: true, keywords: "bot" },
    context: { enabled: true, messageCount: 3 },
    accessControl: {
      enabled: false,
      groupWhitelist: "",
      userBlacklist: "",
      adminMode: { enabled: false, privateChat: false, groupChat: false },
    },
    admins: "",
    media: { sharedHostDir: "", sharedContainerDir: "/openclaw_media" },
  });
  assert.equal(nested.messaging.textChunkLimit, 1800);
  assert.equal(nested.typingIndicator.privateChat, "api");
});

test("parseNapcatTarget supports native and prefixed identifiers", () => {
  assert.deepEqual(parseNapcatTarget("12345", "group"), { id: 12345, isGroup: true });
  assert.deepEqual(parseNapcatTarget("user:42"), { id: 42, isGroup: false });
  assert.deepEqual(parseNapcatTarget("direct:acc:user:9"), { id: 9, isGroup: false });
});

test("sendTextOutbound and deleteMessageOutbound return structured failures", async () => {
  const fakeClient = {
    async deleteMessage() {
      throw new Error("boom");
    },
    async sendAction() {
      throw new Error("offline");
    },
  };

  const sendResult = await sendTextOutbound({ to: "group:1", text: "hello" }, fakeClient as any);
  assert.equal(sendResult.ok, false);
  assert.equal(sendResult.code, "send_failed");

  const deleteResult = await deleteMessageOutbound({ messageId: 123 }, fakeClient as any);
  assert.equal(deleteResult.ok, false);
  assert.equal(deleteResult.code, "send_failed");
});

test("persistInboundMessage writes normalized record fields", async () => {
  const saved: any[] = [];
  const fakeDb = {
    saveMessage(record: any) {
      saved.push(record);
    },
  };

  await persistInboundMessage({
    db: fakeDb as any,
    accountId: "acc",
    event: {
      message_id: 123,
      message: [{ type: "text", data: { text: "hi" } }],
      raw_message: "hi",
      time: 10,
      sender: { nickname: "Alice" },
    },
    isGroup: false,
    userId: 1,
    fullContent: "hi",
  });

  assert.equal(saved.length, 1);
  assert.equal(saved[0].account_id, "acc");
  assert.equal(saved[0].chat_type, "direct");
  assert.equal(saved[0].content, "hi");
});
