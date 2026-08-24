import { DirectMessageLedger, fingerprint } from "./ledger.mjs";
import { routeDirectMessage, validateDirectConfig } from "./direct-router.mjs";

const DIRECT_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MAX_MESSAGE_HISTORY = 20;

function idsFromParty(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(idsFromParty);
  if (Array.isArray(value.data)) return value.data.flatMap(idsFromParty);
  return value.id === undefined ? [] : [String(value.id)];
}

function senderOf(message) {
  return message?.from ?? message?.sender ?? null;
}

function messageIdOf(message) {
  return String(message?.id ?? message?.mid ?? "");
}

function createdMsOf(message) {
  const value = Date.parse(String(message?.created_time ?? message?.createdTime ?? ""));
  return Number.isFinite(value) ? value : null;
}

export function isBusinessAuthoredMessage(message, businessId) {
  if (message?.is_echo === true || message?.is_self === true || message?.message?.is_echo === true) return true;
  return idsFromParty(senderOf(message)).includes(String(businessId));
}

function isInboundMessage(message, businessId) {
  return !isBusinessAuthoredMessage(message, businessId) && idsFromParty(senderOf(message)).length > 0;
}

function visionFor(visionByMessageId, messageId) {
  if (!visionByMessageId) return undefined;
  if (visionByMessageId instanceof Map) return visionByMessageId.get(messageId);
  return visionByMessageId[messageId];
}

function mergeMessage(stub, details) {
  return {
    ...stub,
    ...details,
    attachments: details?.attachments ?? stub?.attachments,
    reply_to: details?.reply_to ?? stub?.reply_to,
  };
}

function attachmentsOf(message) {
  if (Array.isArray(message?.attachments)) return message.attachments;
  if (Array.isArray(message?.attachments?.data)) return message.attachments.data;
  return [];
}

function burstMessage(messages) {
  const latest = messages.at(-1);
  return {
    ...latest,
    id: messageIdOf(latest),
    message: messages
      .map((message) => String(message?.message ?? message?.text ?? "").trim())
      .filter(Boolean)
      .join("\n"),
    attachments: messages.flatMap(attachmentsOf),
    reply_to: messages.findLast?.((message) => message?.reply_to)?.reply_to ?? latest?.reply_to,
  };
}

async function listRecentConversations(client, maximum) {
  const conversations = [];
  let after;
  while (conversations.length < maximum) {
    const page = await client.listConversations({
      limit: Math.min(100, maximum - conversations.length),
      ...(after ? { after } : {}),
    });
    const items = Array.isArray(page?.data) ? page.data : [];
    conversations.push(...items.slice(0, maximum - conversations.length));
    const next = page?.paging?.cursors?.after;
    if (!next || items.length === 0) break;
    after = next;
  }
  return conversations;
}

async function loadConversationMessages(client, conversationId) {
  const page = await client.listConversationMessages(conversationId, { limit: MAX_MESSAGE_HISTORY });
  const stubs = Array.isArray(page?.data) ? [...page.data] : [];
  const messages = [];
  for (const stub of stubs) {
    const messageId = messageIdOf(stub);
    if (!messageId) continue;
    const details = typeof client.getMessageDetails === "function"
      ? await client.getMessageDetails(messageId)
      : stub;
    messages.push(mergeMessage(stub, details));
  }
  messages.sort((left, right) => {
    const leftTime = createdMsOf(left);
    const rightTime = createdMsOf(right);
    if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return leftTime - rightTime;
    return messageIdOf(left).localeCompare(messageIdOf(right));
  });
  return messages;
}

function lastIndexOf(messages, predicate) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index])) return index;
  }
  return -1;
}

function suffixAfterSafetyBoundary(messages, cutover, businessId) {
  const lastBusinessIndex = lastIndexOf(messages, (message) => isBusinessAuthoredMessage(message, businessId));
  const cutoverIndex = messages.findIndex((message) => messageIdOf(message) === cutover.messageId);
  const saturated = messages.length >= MAX_MESSAGE_HISTORY;

  if (cutoverIndex < 0 && lastBusinessIndex < 0 && saturated) {
    return { ok: false, reason: "insufficient_history", lastBusinessIndex, cutoverIndex };
  }

  if (cutoverIndex >= 0) {
    const boundaryIndex = Math.max(cutoverIndex, lastBusinessIndex);
    return {
      ok: true,
      suffix: messages.slice(boundaryIndex + 1),
      anchorId: messageIdOf(messages[boundaryIndex]),
      lastBusinessIndex,
      cutoverIndex,
    };
  }

  const cutoverMs = Date.parse(String(cutover.createdTime ?? ""));
  if (!Number.isFinite(cutoverMs)) {
    return { ok: false, reason: "insufficient_history", lastBusinessIndex, cutoverIndex };
  }
  const businessIsNewer = lastBusinessIndex >= 0
    && (createdMsOf(messages[lastBusinessIndex]) ?? Number.NEGATIVE_INFINITY) > cutoverMs;
  const anchorId = businessIsNewer ? messageIdOf(messages[lastBusinessIndex]) : cutover.messageId;
  const suffix = messages.filter((message, index) => {
    const createdMs = createdMsOf(message);
    return index > lastBusinessIndex && createdMs !== null && createdMs > cutoverMs;
  });
  return { ok: true, suffix, anchorId, lastBusinessIndex, cutoverIndex };
}

function addAbstention(result, conversationId, reason, details = {}) {
  result.abstained.push({ conversationId, reason, ...details });
}

export async function pollInstagramDirect({
  client,
  config,
  previewLedgerFile,
  maxConversations = 25,
  messagesPerConversation = MAX_MESSAGE_HISTORY,
  visionByMessageId,
  mode = "dry-run",
  now = new Date(),
}) {
  if (!client || typeof client.listConversations !== "function") {
    throw new TypeError("Нужен InstagramClient с поддержкой Conversations API");
  }
  if (mode !== "dry-run") {
    throw new Error("Live-отправка Direct отключена: разрешён только mode=dry-run");
  }
  validateDirectConfig(config);
  if (!previewLedgerFile) throw new Error("Не задан отдельный preview Direct ledger");
  if (!Number.isInteger(maxConversations) || maxConversations < 1 || maxConversations > 500) {
    throw new TypeError("maxConversations должен быть целым числом от 1 до 500");
  }
  if (messagesPerConversation !== MAX_MESSAGE_HISTORY) {
    throw new TypeError(`Для безопасного Direct polling messagesPerConversation должен быть ${MAX_MESSAGE_HISTORY}`);
  }
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  if (!Number.isFinite(nowMs)) throw new TypeError("now должен быть корректной датой");

  const ledger = new DirectMessageLedger(previewLedgerFile);
  const conversations = await listRecentConversations(client, maxConversations);
  const result = {
    ok: true,
    dryRun: true,
    conversationsScanned: conversations.length,
    messagesSeen: 0,
    bootstrapCount: 0,
    burstAlreadyPlanned: 0,
    abstained: [],
    manualReview: [],
    unhandled: [],
    proposals: [],
  };

  for (const conversation of conversations) {
    const conversationId = String(conversation?.id ?? "");
    if (!conversationId) continue;
    const messages = await loadConversationMessages(client, conversationId);
    result.messagesSeen += messages.length;
    if (messages.length === 0) continue;

    const latest = messages.at(-1);
    const cutoverKey = `conversation:${conversationId}:cutover`;
    let cutover = await ledger.get(cutoverKey);
    if (!cutover) {
      const hasBusinessBoundary = messages.some((message) => isBusinessAuthoredMessage(message, client.userId));
      const reason = messages.length >= MAX_MESSAGE_HISTORY && !hasBusinessBoundary
        ? "insufficient_history"
        : "bootstrap_cutover";
      const saved = await ledger.putOnce(cutoverKey, {
        status: "cutover",
        messageId: messageIdOf(latest),
        createdTime: latest.created_time ?? latest.createdTime ?? null,
        historySaturated: messages.length >= MAX_MESSAGE_HISTORY,
      });
      cutover = saved.record;
      result.bootstrapCount += 1;
      addAbstention(result, conversationId, reason, { bootstrap: true });
      continue;
    }

    if (isBusinessAuthoredMessage(latest, client.userId)) {
      addAbstention(result, conversationId, "latest_not_inbound");
      continue;
    }
    if (!isInboundMessage(latest, client.userId)) {
      result.manualReview.push({ conversationId, reason: "latest_direction_unknown", messageId: messageIdOf(latest) });
      continue;
    }

    const boundary = suffixAfterSafetyBoundary(messages, cutover, client.userId);
    if (!boundary.ok) {
      addAbstention(result, conversationId, boundary.reason);
      continue;
    }
    if (boundary.suffix.length === 0) {
      addAbstention(result, conversationId, "no_new_inbound");
      continue;
    }
    if (!boundary.suffix.every((message) => isInboundMessage(message, client.userId))) {
      result.manualReview.push({ conversationId, reason: "ambiguous_suffix_direction" });
      continue;
    }

    const latestMs = createdMsOf(latest);
    if (latestMs === null || latestMs > nowMs + 5 * 60_000) {
      result.manualReview.push({ conversationId, reason: "invalid_latest_timestamp", messageId: messageIdOf(latest) });
      continue;
    }
    if (nowMs - latestMs > DIRECT_WINDOW_MS) {
      addAbstention(result, conversationId, "outside_24h", { messageId: messageIdOf(latest) });
      continue;
    }

    const boundaryKey = `conversation:${conversationId}:burst:${boundary.anchorId}`;
    if (await ledger.get(boundaryKey)) {
      result.burstAlreadyPlanned += 1;
      addAbstention(result, conversationId, "burst_already_planned");
      continue;
    }

    const grouped = burstMessage(boundary.suffix);
    const routed = routeDirectMessage({
      message: grouped,
      conversationId,
      config,
      vision: visionFor(visionByMessageId, messageIdOf(latest)),
    });
    if (routed.route === "manual_review") {
      result.manualReview.push({
        conversationId,
        reason: "ambiguous_question",
        messageIds: boundary.suffix.map(messageIdOf),
      });
      continue;
    }
    if (routed.route === "unhandled") {
      result.unhandled.push({
        conversationId,
        reason: "unhandled",
        messageIds: boundary.suffix.map(messageIdOf),
      });
      continue;
    }

    const saved = await ledger.putOnce(boundaryKey, {
      status: "planned",
      route: routed.route,
      templateKey: routed.templateKey,
      anchorId: boundary.anchorId,
      latestMessageId: messageIdOf(latest),
      messageFingerprint: fingerprint(boundary.suffix.map((message) => ({
        id: messageIdOf(message),
        text: message.message ?? message.text ?? "",
        attachments: message.attachments ?? null,
      }))),
      replyFingerprint: fingerprint(routed.reply),
    });
    if (!saved.created) {
      result.burstAlreadyPlanned += 1;
      continue;
    }
    result.proposals.push({
      conversationId,
      messageIds: boundary.suffix.map(messageIdOf),
      latestMessageId: messageIdOf(latest),
      recipientId: idsFromParty(senderOf(latest))[0],
      route: routed.route,
      templateKey: routed.templateKey,
      reply: routed.reply,
    });
  }

  return result;
}

export {
  DIRECT_WINDOW_MS,
  MAX_MESSAGE_HISTORY,
  burstMessage,
  idsFromParty,
  listRecentConversations,
  suffixAfterSafetyBoundary,
};
