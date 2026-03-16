import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { NapCatClient } from "./client.js";

export type NapcatTarget = {
  id: number;
  isGroup: boolean;
};

type ReplyLike = {
  messageId?: string | number;
};

export type SendResult = {
  ok: boolean;
  channel?: string;
  messageId?: string;
  error?: string;
  code?: "invalid_target" | "invalid_message" | "missing_message_id" | "send_failed";
};

type MediaLike = {
  kind?: string;
  type?: string;
  mimeType?: string;
  filename?: string;
  url?: string;
  path?: string;
  file?: string;
  base64?: string;
  data?: Uint8Array | ArrayBuffer | Buffer | string;
};

type MessageSegment = {
  type: string;
  data: Record<string, unknown>;
};

function normalizeFileValue(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("base64://") ||
    trimmed.startsWith("file://")
  ) {
    return trimmed;
  }

  if (path.isAbsolute(trimmed)) {
    return pathToFileURL(trimmed).href;
  }

  return trimmed;
}

function normalizeBufferToBase64(data: MediaLike["data"]): string | undefined {
  if (!data) return undefined;
  if (typeof data === "string") return `base64://${data}`;
  if (data instanceof Uint8Array) return `base64://${Buffer.from(data).toString("base64")}`;
  if (data instanceof ArrayBuffer) return `base64://${Buffer.from(data).toString("base64")}`;
  return undefined;
}

function normalizeReplySegment(replyTo?: ReplyLike): MessageSegment[] {
  if (!replyTo?.messageId) return [];
  return [{ type: "reply", data: { id: String(replyTo.messageId) } }];
}

function buildMediaSegment(media: MediaLike): MessageSegment {
  const explicitFile = normalizeFileValue(media.file ?? media.path ?? media.url);
  const base64File = normalizeBufferToBase64(media.data) ?? (media.base64 ? `base64://${media.base64}` : undefined);
  const file = explicitFile ?? base64File;

  if (!file) {
    throw new Error("Media payload is missing file/url/path/base64/data");
  }

  const mediaKind = (media.kind || media.type || "").toLowerCase();
  const mimeType = (media.mimeType || "").toLowerCase();

  if (mediaKind === "image" || mimeType.startsWith("image/")) {
    return { type: "image", data: { file } };
  }
  if (mediaKind === "audio" || mediaKind === "record" || mimeType.startsWith("audio/")) {
    return { type: "record", data: { file } };
  }
  if (mediaKind === "video" || mimeType.startsWith("video/")) {
    return { type: "video", data: { file } };
  }

  return {
    type: "file",
    data: {
      file,
      ...(media.filename ? { name: media.filename } : {}),
    },
  };
}

export function parseNapcatTarget(to: string, kind?: string): NapcatTarget {
  if (/^\d+$/.test(to) && kind) {
    return { id: parseInt(to, 10), isGroup: kind === "group" };
  }

  if (to.startsWith("user:")) {
    return { id: parseInt(to.slice(5), 10), isGroup: false };
  }

  if (to.startsWith("group:")) {
    return { id: parseInt(to.slice(6), 10), isGroup: true };
  }

  if (to.startsWith("direct:")) {
    const parts = to.split(":");
    return { id: parseInt(parts[parts.length - 1], 10), isGroup: false };
  }

  throw new Error(`Invalid target format: ${to}`);
}

export async function sendNapcatSegments(
  client: NapCatClient,
  target: NapcatTarget,
  messages: MessageSegment[],
  replyTo?: ReplyLike,
): Promise<SendResult> {
  try {
    const segments = [...normalizeReplySegment(replyTo), ...messages];
    if (segments.length === 0) {
      return { ok: false, code: "invalid_message", error: "Message payload is empty" };
    }

    const action = target.isGroup ? "send_group_msg" : "send_private_msg";
    const result = await client.sendAction<{ message_id?: string | number }>(action, {
      [target.isGroup ? "group_id" : "user_id"]: target.id,
      message: segments,
    });

    return {
      ok: true,
      channel: "napcat",
      messageId: result?.message_id ? String(result.message_id) : "",
    };
  } catch (error) {
    return {
      ok: false,
      code: "send_failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendTextOutbound(ctx: any, client: NapCatClient): Promise<SendResult> {
  try {
    const text = String(ctx.text ?? "");
    if (!text.trim()) {
      return { ok: false, code: "invalid_message", error: "Text payload is empty" };
    }
    const target = parseNapcatTarget(String(ctx.to ?? ctx.target?.id ?? ""), ctx.target?.kind);
    return sendNapcatSegments(
      client,
      target,
      [{ type: "text", data: { text } }],
      ctx.replyTo,
    );
  } catch (error) {
    return {
      ok: false,
      code: "invalid_target",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendMediaOutbound(ctx: any, client: NapCatClient): Promise<SendResult> {
  try {
    const targetValue = ctx.to ?? ctx.target?.id ?? "";
    const target = parseNapcatTarget(String(targetValue), ctx.target?.kind);
    const mediaList = Array.isArray(ctx.media) ? ctx.media : [ctx.media];
    const messages = mediaList.filter(Boolean).map(buildMediaSegment);
    return sendNapcatSegments(client, target, messages, ctx.replyTo);
  } catch (error) {
    return {
      ok: false,
      code: "send_failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function deleteMessageOutbound(ctx: any, client: NapCatClient): Promise<SendResult> {
  const messageId = ctx.messageId ?? ctx.message?.id ?? ctx.message?.messageId;
  if (!messageId) {
    return { ok: false, code: "missing_message_id", error: "Missing messageId" };
  }

  try {
    await client.deleteMessage(messageId);
    return {
      ok: true,
      channel: "napcat",
      messageId: String(messageId),
    };
  } catch (error) {
    return {
      ok: false,
      code: "send_failed",
      error: error instanceof Error ? error.message : String(error),
      messageId: String(messageId),
    };
  }
}

export function buildSegmentsFromReplyPayload(payload: any): MessageSegment[] {
  const messages: MessageSegment[] = [];

  if (payload.text && String(payload.text).trim()) {
    messages.push({ type: "text", data: { text: String(payload.text) } });
  }

  const mediaUrls = payload.mediaUrls || payload.MediaUrls || payload.imageUrls || payload.images;
  if (Array.isArray(mediaUrls)) {
    for (const url of mediaUrls) {
      const file = normalizeFileValue(url);
      if (file) {
        messages.push({ type: "image", data: { file } });
      }
    }
  }

  const faces = payload.faces || payload.Faces || payload.emotions || [];
  if (Array.isArray(faces)) {
    for (const face of faces) {
      const faceId = typeof face === "number" ? face : face?.id ?? face?.face_id;
      if (faceId !== undefined && faceId !== null) {
        messages.push({ type: "face", data: { id: String(faceId) } });
      }
    }
  }

  return messages;
}
