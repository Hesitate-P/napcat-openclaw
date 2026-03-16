import type { NapCatConfig } from "./config.js";
import { toNestedConfig } from "./config.js";
import { getNapcatRuntime } from "./runtime.js";
import { extractImageUrls, parseCQCode } from "./message/parser.js";
import { resolveMessageText } from "./utils/message-resolver.js";
import type { NapCatClient } from "./client.js";
import type { DatabaseManager } from "./database/index.js";
import { startPrivateTyping, stopPrivateTyping, setGroupTypingCard, clearGroupTypingCard } from "./streaming/typing-indicator.js";
import { buildSegmentsFromReplyPayload, sendNapcatSegments } from "./outbound.js";
import { buildInboundBodies } from "./inbound-context.js";
import { checkAccessControl } from "./access-control.js";
import { normalizePokeMessage, determineShouldTrigger } from "./message/trigger.js";
import { fetchGroupContextHistory } from "./message/context-history.js";
import { persistInboundMessage } from "./persistence.js";

function normalizeTypingSuffix(suffix: string | undefined): string {
  if (!suffix) return "输入中";
  return suffix.replace(/[()（）]/g, "").trim() || "输入中";
}

export async function handleIncomingNapcatMessage(params: {
  accountId: string;
  event: any;
  config: NapCatConfig;
  client: NapCatClient;
  cfg: any;
  db?: DatabaseManager;
}): Promise<void> {
  const { accountId, event, config, client, cfg, db } = params;

  try {
    const runtime = getNapcatRuntime();
    const isGroup = event.message_type === "group";
    const userId = event.user_id;
    const groupId = event.group_id;
    const fromId = isGroup ? String(groupId) : `user:${userId}`;

    const nestedConfig = toNestedConfig(config);
    const accessResult = checkAccessControl({
      isGroup,
      userId,
      groupId,
      access: nestedConfig.accessControl || { enabled: false },
      admins: nestedConfig.admins || "",
    });
    if (!accessResult.allowed) {
      console.log(`[NapCat] ${accessResult.reason}，已忽略`);
      return;
    }

    const triggerConfig = nestedConfig.trigger || { enabled: true, atBot: true, keywords: "" };
    const selfId = client.getSelfId() || event.self_id;
    await normalizePokeMessage(event, client, isGroup, groupId);
    const shouldTrigger = determineShouldTrigger({
      event,
      isGroup,
      selfId,
      trigger: triggerConfig,
    });

    let contextHistory = "";
    if (shouldTrigger && isGroup && nestedConfig.context?.enabled) {
      try {
        contextHistory = await fetchGroupContextHistory({
          client,
          groupId,
          messageCount: nestedConfig.context.messageCount || 5,
          cfg,
        });
      } catch (error) {
        console.error("[NapCat] 获取历史消息失败:", error);
      }
    }

    let fullContent = event.raw_message || "";
    let messageElements = event.message;

    if (typeof event.message === "string") {
      const cqElements = parseCQCode(event.message);
      messageElements = cqElements.map((el) => ({ type: el.type, data: el.data }));
    }

    if (Array.isArray(messageElements)) {
      fullContent = await resolveMessageText(messageElements, client, isGroup ? groupId : undefined, cfg);
    }

    const imageUrls = extractImageUrls(messageElements);

    const deliver = async (payload: any): Promise<void> => {
      const messages = buildSegmentsFromReplyPayload(payload);
      if (messages.length === 0) return;

      const result = await sendNapcatSegments(
        client,
        { id: isGroup ? groupId : userId, isGroup },
        messages,
        payload.replyTo,
      );
      if (!result.ok) {
        throw new Error(result.error || "NapCat outbound delivery failed");
      }
    };

    const route = runtime.channel.routing.resolveAgentRoute({
      cfg,
      channel: "napcat",
      accountId,
      peer: {
        kind: isGroup ? "group" : "direct",
        id: fromId,
      },
    });

    const { dispatcher } = runtime.channel.reply.createReplyDispatcherWithTyping({ deliver });
    const senderName = event.sender?.nickname || event.sender?.card || "Unknown";
    const { body: cleanBody, rawBody: bodyWithMeta } = buildInboundBodies(fullContent, contextHistory, {
      senderId: userId,
      senderName,
      isGroup,
      groupId,
      isAdmin: accessResult.isAdmin,
      hasMedia: imageUrls.length > 0,
    });

    const ctxPayload = runtime.channel.reply.finalizeInboundContext({
      Provider: "napcat",
      Channel: "napcat",
      From: fromId,
      To: "napcat:bot",
      Body: cleanBody,
      RawBody: bodyWithMeta,
      SenderId: String(userId),
      SenderName: senderName,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: isGroup ? "group" : "direct",
      Timestamp: event.time * 1000,
      Surface: "napcat",
      CommandAuthorized: true,
      ...(imageUrls.length > 0 && { MediaUrls: imageUrls }),
    });

    await runtime.channel.session.recordInboundSession({
      storePath: runtime.channel.session.resolveStorePath(cfg.session?.store, { agentId: route.agentId }),
      sessionKey: ctxPayload.SessionKey!,
      ctx: ctxPayload,
      updateLastRoute: undefined,
      onRecordError: (err: unknown) => console.error("[NapCat] Session Record Error:", err),
    });

    if (shouldTrigger) {
      if (!client.getSelfId() && event.self_id) {
        client.setSelfId(event.self_id);
      }

      const typingConfig = nestedConfig.typingIndicator;
      const typingEnabled = typingConfig.enabled !== false;
      const groupTypingEnabled = typingEnabled && isGroup && typingConfig.groupChat !== "none";
      const privateTypingEnabled = typingEnabled && !isGroup && typingConfig.privateChat === "api";
      const busySuffix = normalizeTypingSuffix(typingConfig.nicknameSuffix);

      if (typingEnabled && typingConfig.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, typingConfig.delayMs));
      }

      if (groupTypingEnabled) {
        await setGroupTypingCard(client, accountId, groupId, busySuffix);
      } else if (privateTypingEnabled) {
        await startPrivateTyping(client, userId);
      }

      try {
        await runtime.channel.reply.dispatchReplyFromConfig({
          ctx: ctxPayload,
          cfg,
          dispatcher,
          replyOptions: {},
        });
        await dispatcher.waitForIdle();
      } finally {
        if (groupTypingEnabled) {
          clearGroupTypingCard(client, accountId, groupId, busySuffix);
        } else if (privateTypingEnabled) {
          await stopPrivateTyping(client, userId);
        }
      }
    }

    await persistInboundMessage({
      db,
      accountId,
      event,
      isGroup,
      groupId,
      userId,
      fullContent,
    });
  } catch (err) {
    console.error("[NapCat] handleIncomingMessage error:", err);
  }
}
