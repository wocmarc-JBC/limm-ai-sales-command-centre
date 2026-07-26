import "server-only";

import { getDataMode } from "./data-source";
import { getSupabaseAdminClient } from "./supabase-admin";
import type { WhatsAppReplyOutcomeResult } from "@/lib/whatsapp-reply-outcome";

export async function recordAiReplyOutcome(input: {
  leadId: string;
  inboundMessageId: string;
  inboundProviderMessageId?: string;
  result: WhatsAppReplyOutcomeResult;
}) {
  if (getDataMode() === "Mock Mode") return { updated: true, reason: "mock_recorded" };
  if (!/^[0-9a-f-]{36}$/i.test(input.result.priorQualityEventId)) {
    return { updated: false, reason: "invalid_quality_event_id" };
  }
  const admin = getSupabaseAdminClient();
  if (!admin) return { updated: false, reason: "database_unavailable" };
  const { data, error: lookupError } = await admin
    .from("ai_reply_quality_events")
    .select("id,lead_id,message_id,metadata,shadow_candidate")
    .eq("id", input.result.priorQualityEventId)
    .eq("lead_id", input.leadId)
    .eq("shadow_candidate", false)
    .maybeSingle();
  if (lookupError) return { updated: false, reason: lookupError.code || "outcome_lookup_failed" };
  if (!data?.id) return { updated: false, reason: "quality_observation_not_found" };
  if (String(data.message_id ?? "") !== input.result.priorOutboundMessageId) {
    return { updated: false, reason: "quality_observation_message_mismatch" };
  }
  const metadata = data.metadata && typeof data.metadata === "object"
    ? data.metadata as Record<string, unknown>
    : {};
  if (metadata.outcomeRecordedAt) return { updated: false, reason: "outcome_already_recorded" };
  const outcomeMetadata = {
    ...metadata,
    clientResponded: true,
    replyOutcome: input.result.outcome,
    positiveProgression: input.result.positiveProgression,
    responseLatencySeconds: input.result.responseLatencySeconds,
    outcomeReason: input.result.reason,
    outcomeInboundMessageId: input.inboundMessageId,
    outcomeInboundProviderMessageId: input.inboundProviderMessageId || "",
    outcomeRecordedAt: new Date().toISOString(),
    outcomeVersion: "v11.4.7"
  };
  const { error } = await admin
    .from("ai_reply_quality_events")
    .update({ metadata: outcomeMetadata })
    .eq("id", data.id);
  return error
    ? { updated: false, reason: error.code || "outcome_update_failed" }
    : { updated: true, reason: "reply_outcome_recorded" };
}
