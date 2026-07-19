import type { LeadMessage } from "@/lib/types";

export const HISTORICAL_AI_DUPLICATE_COLLAPSE_WINDOW_MS = 10 * 60 * 1000;

function timestamp(message: LeadMessage) {
  const parsed = Date.parse(message.createdAt || message.providerTimestamp || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedBody(message: LeadMessage) {
  return message.body.trim().replace(/\s+/g, " ").toLowerCase();
}

function metadataText(message: LeadMessage, key: string) {
  const value = message.metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function inboxMessageBodyText(message: LeadMessage) {
  const body = message.body.trim();
  const messageType = metadataText(message, "messageType").toLowerCase();
  const isMediaPlaceholder = (messageType === "image" || messageType === "document")
    && /^\[(?:unsupported\s+)?whatsapp\s+(?:image|document)\s+received\]$/i.test(body);
  if (!isMediaPlaceholder) return body;
  return metadataText(message, "caption");
}

export function inboxMessagePreview(message: LeadMessage) {
  const body = inboxMessageBodyText(message);
  if (body) return body;
  const messageType = metadataText(message, "messageType").toLowerCase();
  if (messageType === "image") return "Image received";
  if (messageType === "document") {
    const filename = metadataText(message, "filename");
    return filename ? `Document received · ${filename}` : "Document received";
  }
  return message.body;
}

function isDeliveredAiReply(message: LeadMessage) {
  if (message.direction !== "outbound" || message.metadata?.manualReply === true || !normalizedBody(message)) return false;
  const status = String(message.whatsappStatus ?? "").toLowerCase();
  if (["failed", "blocked", "disabled"].includes(status)) return false;
  return ["sent", "delivered", "read"].includes(status) || Boolean(message.providerMessageId) || message.safeToSend;
}

function metadataNumber(message: LeadMessage, key: string, fallback: number) {
  const value = message.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function metadataStringArray(message: LeadMessage, key: string) {
  const value = message.metadata?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Collapses only consecutive, identical, delivered AI replies for display. The
 * underlying message array remains untouched for Meta delivery and audit views.
 */
export function collapseHistoricalDuplicateAiMessages(messages: LeadMessage[]) {
  const ordered = [...messages].sort((a, b) => timestamp(a) - timestamp(b));
  const collapsed: LeadMessage[] = [];
  let activeAiIndex = -1;

  for (const message of ordered) {
    if (!isDeliveredAiReply(message)) {
      collapsed.push(message);
      activeAiIndex = -1;
      continue;
    }

    const previous = activeAiIndex >= 0 ? collapsed[activeAiIndex] : null;
    const withinWindow = previous
      ? Math.abs(timestamp(message) - timestamp(previous)) <= HISTORICAL_AI_DUPLICATE_COLLAPSE_WINDOW_MS
      : false;
    if (previous && withinWindow && normalizedBody(previous) === normalizedBody(message)) {
      const count = metadataNumber(previous, "uiCollapsedDuplicateCount", 1) + 1;
      const timestamps = metadataStringArray(previous, "uiCollapsedDuplicateTimestamps");
      const messageIds = metadataStringArray(previous, "uiCollapsedDuplicateMessageIds");
      collapsed[activeAiIndex] = {
        ...message,
        metadata: {
          ...message.metadata,
          uiCollapsedDuplicateCount: count,
          uiCollapsedDuplicateTimestamps: [...timestamps, message.createdAt],
          uiCollapsedDuplicateMessageIds: [...messageIds, message.id],
          uiHistoricalDuplicateDisplayOnly: true
        }
      };
      continue;
    }

    collapsed.push({
      ...message,
      metadata: {
        ...message.metadata,
        uiCollapsedDuplicateTimestamps: [message.createdAt],
        uiCollapsedDuplicateMessageIds: [message.id]
      }
    });
    activeAiIndex = collapsed.length - 1;
  }

  return collapsed;
}
