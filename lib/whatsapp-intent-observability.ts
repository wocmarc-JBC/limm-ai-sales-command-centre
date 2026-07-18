import { WHATSAPP_CONVERSATION_INTENTS, type ConversationIntent } from "@/lib/whatsapp-intent-gate";
import type { AuditLog } from "@/lib/types";

export type IntentConfidenceDistribution = {
  below50: number;
  from50To74: number;
  from75To94: number;
  from95To100: number;
};

export type IntentGateObservabilitySnapshot = {
  sampleSize: number;
  inboundByIntent: Record<ConversationIntent, number>;
  eligibleInboundCount: number;
  eligibleRatePercent: number;
  vendorCount: number;
  spamCount: number;
  unclearCount: number;
  confidenceDistribution: IntentConfidenceDistribution;
  manualCorrections: number;
  inferredFalsePositives: number;
  duplicateRepliesBlocked: number;
  unrelatedRepliesBlocked: number;
  noReplySuppressions: number;
  oneTimeVendorAcknowledgements: number;
};

function metadataBoolean(log: AuditLog, key: string) {
  return log.metadata?.[key] === true;
}

function metadataString(log: AuditLog, key: string) {
  return typeof log.metadata?.[key] === "string" ? String(log.metadata[key]) : "";
}

function isConversationIntent(value: string): value is ConversationIntent {
  return WHATSAPP_CONVERSATION_INTENTS.includes(value as ConversationIntent);
}

export function buildIntentGateObservabilitySnapshot(auditLogs: AuditLog[]): IntentGateObservabilitySnapshot {
  const inboundByIntent = Object.fromEntries(
    WHATSAPP_CONVERSATION_INTENTS.map((intent) => [intent, 0])
  ) as Record<ConversationIntent, number>;
  const confidenceDistribution: IntentConfidenceDistribution = {
    below50: 0,
    from50To74: 0,
    from75To94: 0,
    from95To100: 0
  };
  const classifications = auditLogs.filter((log) => log.action === "whatsapp_conversation_intent_classified");
  let eligibleInboundCount = 0;
  for (const log of classifications) {
    const intent = metadataString(log, "conversationIntent") || metadataString(log, "primaryIntent");
    if (isConversationIntent(intent)) inboundByIntent[intent] += 1;
    if (metadataBoolean(log, "leadEligible")) eligibleInboundCount += 1;
    const confidence = Number(log.metadata?.confidence ?? 0);
    if (confidence < 0.5) confidenceDistribution.below50 += 1;
    else if (confidence < 0.75) confidenceDistribution.from50To74 += 1;
    else if (confidence < 0.95) confidenceDistribution.from75To94 += 1;
    else confidenceDistribution.from95To100 += 1;
  }

  const corrections = auditLogs.filter((log) => log.metadata?.manualIntentCorrection === true);
  const safetyOutcomes = auditLogs.filter((log) => log.action === "whatsapp_conversation_safety_outcome");
  return {
    sampleSize: classifications.length,
    inboundByIntent,
    eligibleInboundCount,
    eligibleRatePercent: classifications.length ? Math.round((eligibleInboundCount / classifications.length) * 1000) / 10 : 0,
    vendorCount: inboundByIntent.vendor_supplier_solicitation,
    spamCount: inboundByIntent.spam_scam_irrelevant,
    unclearCount: inboundByIntent.unclear_intent,
    confidenceDistribution,
    manualCorrections: corrections.length,
    inferredFalsePositives: corrections.filter((log) =>
      metadataString(log, "previousIntent") === "genuine_new_renovation_lead" &&
      !["", "cleared", "genuine_new_renovation_lead"].includes(metadataString(log, "requestedOverride"))
    ).length,
    duplicateRepliesBlocked: safetyOutcomes.filter((log) => metadataBoolean(log, "semanticDuplicateBlocked")).length,
    unrelatedRepliesBlocked: safetyOutcomes.filter((log) => metadataBoolean(log, "unrelatedReplyBlocked")).length,
    noReplySuppressions: safetyOutcomes.filter((log) => metadataBoolean(log, "noReplySafetySuppression")).length,
    oneTimeVendorAcknowledgements: safetyOutcomes.filter((log) =>
      metadataBoolean(log, "acknowledgementSent") && metadataString(log, "conversationIntent") === "vendor_supplier_solicitation"
    ).length
  };
}
