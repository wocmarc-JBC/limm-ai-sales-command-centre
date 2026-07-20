import type { LeadMessage } from "@/lib/types";

export const WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const WHATSAPP_SEND_SAFETY_BUFFER_MS = 2 * 60 * 1000;
const MAX_PROVIDER_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type WhatsAppServiceWindowStatus = "open" | "closed" | "unknown";

export type WhatsAppServiceWindow = {
  status: WhatsAppServiceWindowStatus;
  canSendFreeform: boolean;
  providerOpenedAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number;
  reason:
    | "open"
    | "expired"
    | "expiry_safety_buffer"
    | "provider_timestamp_missing"
    | "provider_timestamp_invalid"
    | "provider_timestamp_future";
};

type ServiceWindowMessage = Pick<LeadMessage, "direction" | "providerTimestamp" | "createdAt">;

function unknownWindow(reason: WhatsAppServiceWindow["reason"]): WhatsAppServiceWindow {
  return {
    status: "unknown",
    canSendFreeform: false,
    providerOpenedAt: null,
    expiresAt: null,
    remainingSeconds: 0,
    reason
  };
}

export function computeWhatsAppServiceWindow(
  providerTimestamp: string | null | undefined,
  nowMs = Date.now()
): WhatsAppServiceWindow {
  if (!providerTimestamp) return unknownWindow("provider_timestamp_missing");
  const providerMs = Date.parse(providerTimestamp);
  if (!Number.isFinite(providerMs) || providerMs <= 0) return unknownWindow("provider_timestamp_invalid");
  if (providerMs - nowMs > MAX_PROVIDER_CLOCK_SKEW_MS) return unknownWindow("provider_timestamp_future");

  const openedMs = Math.min(providerMs, nowMs);
  const expiresMs = openedMs + WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS;
  const remainingMs = Math.max(0, expiresMs - nowMs);
  const base = {
    providerOpenedAt: new Date(openedMs).toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
    remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000))
  };

  if (remainingMs <= 0) {
    return { ...base, status: "closed", canSendFreeform: false, reason: "expired" };
  }
  if (remainingMs <= WHATSAPP_SEND_SAFETY_BUFFER_MS) {
    return { ...base, status: "closed", canSendFreeform: false, reason: "expiry_safety_buffer" };
  }
  return { ...base, status: "open", canSendFreeform: true, reason: "open" };
}

export function getWhatsAppServiceWindowFromMessages(
  messages: ServiceWindowMessage[],
  nowMs = Date.now()
): WhatsAppServiceWindow {
  const providerTimestamps = messages
    .filter((message) => message.direction === "inbound" && Boolean(message.providerTimestamp))
    .map((message) => String(message.providerTimestamp))
    .filter((timestamp) => Number.isFinite(Date.parse(timestamp)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));

  if (!providerTimestamps.length) {
    const hasInbound = messages.some((message) => message.direction === "inbound");
    return unknownWindow(hasInbound ? "provider_timestamp_missing" : "provider_timestamp_missing");
  }
  return computeWhatsAppServiceWindow(providerTimestamps[0], nowMs);
}

export function whatsappServiceWindowErrorMessage(window: WhatsAppServiceWindow) {
  if (window.reason === "expiry_safety_buffer") {
    return "The WhatsApp 24-hour reply window is too close to expiry. Wait for the client to message again before sending a free-form reply.";
  }
  if (window.status === "closed") {
    return "The WhatsApp 24-hour reply window is closed. Wait for the client to message again before sending a free-form reply.";
  }
  return "The WhatsApp 24-hour reply window could not be verified from Meta's message timestamp. No free-form reply was sent.";
}
