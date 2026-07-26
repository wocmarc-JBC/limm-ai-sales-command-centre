import { parseWhatsAppInbound, type ParsedWhatsAppMessage } from "@/lib/whatsapp-parser";
import {
  parseWhatsAppReferralContext,
  referralContextForStorage,
  type WhatsAppReferralContext
} from "@/lib/whatsapp-referral-context";

export type ParsedWhatsAppMessageWithReferral = ParsedWhatsAppMessage & {
  whatsappReferral?: WhatsAppReferralContext | null;
};

function referralMap(payload: unknown) {
  const map = new Map<string, WhatsAppReferralContext>();
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const entry of entries) {
    const entryRecord = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const changes = Array.isArray(entryRecord.changes) ? entryRecord.changes : [];
    for (const change of changes) {
      const changeRecord = change && typeof change === "object" ? change as Record<string, unknown> : {};
      const value = changeRecord.value && typeof changeRecord.value === "object"
        ? changeRecord.value as Record<string, unknown>
        : {};
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const rawMessage of messages) {
        const message = rawMessage && typeof rawMessage === "object"
          ? rawMessage as Record<string, unknown>
          : {};
        const providerMessageId = String(message.id ?? "").trim();
        const context = parseWhatsAppReferralContext(message.referral);
        if (providerMessageId && context) map.set(providerMessageId, context);
      }
    }
  }
  return map;
}

export function parseWhatsAppInboundWithReferral(payload: unknown): ParsedWhatsAppMessageWithReferral[] {
  const referrals = referralMap(payload);
  return parseWhatsAppInbound(payload).map((message) => {
    const context = referrals.get(message.providerMessageId) ?? null;
    if (!context) return { ...message, whatsappReferral: null };
    const stored = referralContextForStorage(context);
    const safeContextLabel = `Confirmed Meta ad context: ${context.serviceLabel}`;
    return {
      ...message,
      // Preserve the client's original text. Text messages do not use caption,
      // so this supplies a sanitized internal context label to the existing
      // memory-first reply pipeline without exposing campaign identifiers.
      caption: message.caption || safeContextLabel,
      whatsappReferral: stored
    };
  });
}
