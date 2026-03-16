import { getUserNickname } from "../utils/userinfo.js";
import type { NapCatClient } from "../client.js";

export interface TriggerConfigLike {
  enabled?: boolean;
  atBot?: boolean;
  keywords?: string;
}

export async function normalizePokeMessage(
  event: any,
  client: NapCatClient,
  isGroup: boolean,
  groupId?: number,
): Promise<void> {
  if (!event.raw_message || !event.raw_message.includes("[戳一戳]") || !isGroup) {
    return;
  }

  const pokeMatch = event.raw_message.match(/\[戳一戳\] (.+?)\((\d+)\) 戳了 (.+?)\((\d+)\)/);
  if (!pokeMatch) return;

  const pokeUserId = pokeMatch[2];
  const pokeTargetId = pokeMatch[4];

  let pokeUserName = pokeUserId;
  let pokeTargetName = pokeTargetId;

  try {
    pokeUserName = await getUserNickname(client, parseInt(pokeUserId, 10), groupId);
  } catch {}

  try {
    pokeTargetName = await getUserNickname(client, parseInt(pokeTargetId, 10), groupId);
  } catch {}

  if (pokeUserName && pokeTargetName) {
    event.raw_message = `[戳一戳] ${pokeUserName}(${pokeUserId}) 戳了 ${pokeTargetName}(${pokeTargetId})`;
    event.message = [{ type: "text", data: { text: event.raw_message } }];
  }
}

export function determineShouldTrigger(params: {
  event: any;
  isGroup: boolean;
  selfId: string | number | undefined;
  trigger: TriggerConfigLike;
}): boolean {
  const { event, isGroup, selfId, trigger } = params;
  const rawMessage = event.raw_message || "";
  const isPokeMessage = rawMessage.includes("[戳一戳]");

  if (isPokeMessage) {
    let targetId = "";
    let pokeMatch = rawMessage.match(/\[戳一戳\] (.+?)\((\d+)\) 戳了 (.+?)\((\d+)\)/);
    if (pokeMatch) {
      targetId = pokeMatch[4];
    } else {
      pokeMatch = rawMessage.match(/\[戳一戳\].*?(\d+).*?戳了.*?(\d+)/);
      if (pokeMatch) {
        targetId = pokeMatch[2];
      }
    }
    return Boolean(targetId && String(targetId) === String(selfId));
  }

  if (!isGroup) {
    return true;
  }

  if (!trigger.enabled) {
    return false;
  }

  if (trigger.atBot && Array.isArray(event.message)) {
    const hasAt = event.message.some(
      (seg: any) => seg.type === "at" && (String(seg.data?.qq) === String(selfId) || seg.data?.qq === "all"),
    );
    if (hasAt) return true;
  }

  const keywords = typeof trigger.keywords === "string"
    ? trigger.keywords.split(",").map((k) => k.trim()).filter((k) => k.length > 0)
    : [];
  return keywords.some((keyword) => rawMessage.includes(keyword));
}
