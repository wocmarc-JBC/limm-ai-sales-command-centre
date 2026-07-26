import "server-only";

import { createAuditLog } from "@/lib/data/audit-repository";
import { getDataMode } from "@/lib/data/data-source";
import { getMockStore } from "@/lib/data/mock-store";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import type { WhatsAppHandoffTier } from "@/lib/whatsapp-handoff-tier";

export type WhatsAppHandoffFinalOutcome =
  | "reply_sent"
  | "reply_send_failed"
  | "post_send_persistence_failed";

function adminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin credentials are required for tiered WhatsApp handoff control.");
  return client;
}

async function updateControl(input: {
  leadId: string;
  needsMarcus: boolean;
  pause: boolean;
  reason: string;
}) {
  const now = new Date().toISOString();
  if (getDataMode() === "Mock Mode") {
    const store = getMockStore();
    const index = store.leads.findIndex((lead) => lead.id === input.leadId);
    if (index < 0) throw new Error("Tiered handoff could not find the mock lead.");
    store.leads[index] = {
      ...store.leads[index],
      needsMarcus: input.needsMarcus,
      ...(input.pause ? {
        botPaused: true,
        botPausedAt: now,
        botPausedBy: "WhatsApp Tiered Handoff",
        botPauseReason: input.reason
      } : {})
    };
    return;
  }

  const patch: Record<string, unknown> = {
    needs_marcus: input.needsMarcus,
    updated_at: now
  };
  if (input.pause) {
    patch.bot_paused = true;
    patch.bot_paused_at = now;
    patch.bot_paused_by = "WhatsApp Tiered Handoff";
    patch.bot_pause_reason = input.reason;
  }
  const { error } = await adminClient().from("leads").update(patch).eq("id", input.leadId);
  if (error) throw new Error(`Tiered WhatsApp handoff control failed: ${error.message}`);
}

async function audit(input: {
  leadId: string;
  tier: WhatsAppHandoffTier;
  reasons: string[];
  action: string;
  pauseApplied: boolean;
  botContinues: boolean;
  outcome?: WhatsAppHandoffFinalOutcome;
}) {
  await createAuditLog({
    actorType: "system",
    actorName: "WhatsApp Tiered Handoff",
    action: input.action,
    entityType: "lead",
    entityId: input.leadId,
    summary: input.pauseApplied
      ? "WhatsApp bot paused and Marcus attention activated by the tiered handoff policy."
      : "Marcus attention activated while the WhatsApp bot remains available.",
    beforeData: null,
    afterData: {
      handoffTier: input.tier,
      needsMarcus: input.tier !== "bot_handles_normally",
      botPaused: input.pauseApplied
    },
    metadata: {
      handoffTier: input.tier,
      handoffReasons: input.reasons,
      pauseApplied: input.pauseApplied,
      botContinues: input.botContinues,
      handoffFinalOutcome: input.outcome ?? "",
      noClientMessageSentByControl: true,
      noPriceChange: true,
      noCalendarBooking: true
    }
  });
}

export async function prepareWhatsAppHandoffControl(input: {
  leadId: string;
  tier: WhatsAppHandoffTier;
  reasons: string[];
  replyPlanned: boolean;
}) {
  if (input.tier === "bot_handles_normally") {
    return { needsMarcusApplied: false, pauseApplied: false, pauseAfterReply: false };
  }
  const reason = input.reasons.join(" + ") || "Tiered WhatsApp handoff";
  const pauseNow = input.tier === "pause_and_escalate" && !input.replyPlanned;
  await updateControl({ leadId: input.leadId, needsMarcus: true, pause: pauseNow, reason });
  await audit({
    leadId: input.leadId,
    tier: input.tier,
    reasons: input.reasons,
    action: pauseNow ? "whatsapp_handoff_pause_applied" : "whatsapp_handoff_attention_marked",
    pauseApplied: pauseNow,
    botContinues: !pauseNow
  });
  return {
    needsMarcusApplied: true,
    pauseApplied: pauseNow,
    pauseAfterReply: input.tier === "pause_and_escalate" && input.replyPlanned
  };
}

export async function finalizeWhatsAppHandoffPause(input: {
  leadId: string;
  tier: WhatsAppHandoffTier;
  reasons: string[];
  pauseAfterReply: boolean;
  outcome: WhatsAppHandoffFinalOutcome;
}) {
  if (!input.pauseAfterReply || input.tier !== "pause_and_escalate") {
    return { pauseApplied: false, outcome: input.outcome };
  }
  const reason = input.reasons.join(" + ") || "Tiered WhatsApp handoff after acknowledgement";
  await updateControl({ leadId: input.leadId, needsMarcus: true, pause: true, reason });
  await audit({
    leadId: input.leadId,
    tier: input.tier,
    reasons: input.reasons,
    action: input.outcome === "reply_sent"
      ? "whatsapp_handoff_pause_applied_after_reply"
      : "whatsapp_handoff_pause_applied_after_reply_failure",
    pauseApplied: true,
    botContinues: false,
    outcome: input.outcome
  });
  return { pauseApplied: true, outcome: input.outcome };
}
