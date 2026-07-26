import "server-only";

import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import { recordAiReplyOutcome } from "@/lib/data/ai-reply-outcome-repository";
import { evaluateReplyOutcomeFromInbound } from "@/lib/whatsapp-reply-outcome";
import type { LeadMessage } from "@/lib/types";

function asMessage(row: Record<string, unknown>): LeadMessage {
  return {
    id: String(row.id ?? ""),
    leadId: String(row.lead_id ?? ""),
    direction: String(row.direction ?? "inbound") as LeadMessage["direction"],
    channel: String(row.channel ?? "whatsapp") as LeadMessage["channel"],
    body: String(row.body ?? ""),
    safeToSend: Boolean(row.safe_to_send),
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : undefined,
    providerTimestamp: row.provider_timestamp ? String(row.provider_timestamp) : null,
    whatsappStatus: String(row.whatsapp_status ?? "") as LeadMessage["whatsappStatus"],
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
    createdAt: String(row.created_at ?? new Date().toISOString())
  };
}

export async function processAiReplyOutcomes(limit = 100) {
  const admin = getSupabaseAdminClient();
  if (!admin) return { scanned: 0, recorded: 0, skipped: 0, failed: 1, reason: "database_unavailable" };
  const boundedLimit = Math.max(1, Math.min(limit, 250));
  const { data: events, error } = await admin
    .from("ai_reply_quality_events")
    .select("id,lead_id,message_id,metadata,created_at")
    .eq("shadow_candidate", false)
    .not("message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(boundedLimit);
  if (error) return { scanned: 0, recorded: 0, skipped: 0, failed: 1, reason: error.code || "quality_scan_failed" };

  let recorded = 0;
  let skipped = 0;
  let failed = 0;
  for (const event of events ?? []) {
    const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {};
    if (metadata.outcomeRecordedAt) {
      skipped += 1;
      continue;
    }
    const leadId = String(event.lead_id ?? "");
    const outboundMessageId = String(event.message_id ?? "");
    if (!leadId || !outboundMessageId) {
      skipped += 1;
      continue;
    }
    const { data: outbound, error: outboundError } = await admin
      .from("lead_messages")
      .select("*")
      .eq("id", outboundMessageId)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (outboundError || !outbound) {
      failed += 1;
      continue;
    }
    const { data: inboundRows, error: inboundError } = await admin
      .from("lead_messages")
      .select("*")
      .eq("lead_id", leadId)
      .eq("channel", "whatsapp")
      .eq("direction", "inbound")
      .gt("created_at", String(outbound.created_at))
      .order("created_at", { ascending: true })
      .limit(1);
    if (inboundError) {
      failed += 1;
      continue;
    }
    const inbound = inboundRows?.[0];
    if (!inbound) {
      skipped += 1;
      continue;
    }
    const outboundMessage = asMessage({
      ...outbound,
      metadata: {
        ...(outbound.metadata && typeof outbound.metadata === "object" ? outbound.metadata as Record<string, unknown> : {}),
        aiGeneratedReply: true,
        aiQualityEventId: String(event.id)
      }
    });
    const inboundMessage = asMessage(inbound);
    const result = evaluateReplyOutcomeFromInbound({
      messages: [outboundMessage, inboundMessage],
      currentInbound: inboundMessage
    });
    if (!result) {
      skipped += 1;
      continue;
    }
    const update = await recordAiReplyOutcome({
      leadId,
      inboundMessageId: inboundMessage.id,
      inboundProviderMessageId: inboundMessage.providerMessageId,
      result
    });
    if (update.updated) recorded += 1;
    else if (update.reason === "outcome_already_recorded") skipped += 1;
    else failed += 1;
  }
  return {
    scanned: events?.length ?? 0,
    recorded,
    skipped,
    failed,
    reason: failed ? "completed_with_failures" : "completed"
  };
}
