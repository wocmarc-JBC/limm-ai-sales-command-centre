import "server-only";

import { createAuditLog } from "@/lib/data/audit-repository";
import { beginVerifiedCompletion, observeVerifiedCompletion, type VerifiedCompletionStatus } from "@/lib/data/verified-completion-repository";
import { getDataMode } from "@/lib/data/data-source";
import { getMockStore } from "@/lib/data/mock-store";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import type { SalesStage } from "@/lib/types";
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

const SALES_STAGE_ORDER: SalesStage[] = [
  "New Lead",
  "Qualified",
  "Info Requested",
  "Floor Plan / Scope Received",
  "Initial Project Review",
  "Site Visit Needed",
  "Site Visit Booked",
  "Quotation Needed",
  "Quotation Sent",
  "Follow-Up Due",
  "Negotiation",
  "Won",
  "Lost",
  "Archived"
];

function targetSalesStage(reason: string): SalesStage {
  if (/quotation|proposal/i.test(reason)) return "Quotation Needed";
  if (/site visit/i.test(reason)) return "Site Visit Needed";
  if (/appointment|landed a&a/i.test(reason)) return "Initial Project Review";
  return "Qualified";
}

function shouldAdvanceStage(current: string, target: SalesStage) {
  if (["Won", "Lost", "Archived", "Quotation Sent", "Negotiation", "Site Visit Booked"].includes(current)) return false;
  const currentIndex = SALES_STAGE_ORDER.indexOf(current as SalesStage);
  const targetIndex = SALES_STAGE_ORDER.indexOf(target);
  return currentIndex < 0 || currentIndex < targetIndex;
}

function nextSalesAction(reason: string) {
  if (/quotation|proposal/i.test(reason)) return "Marcus to review the scope and prepare the quotation path.";
  if (/site visit/i.test(reason)) return "Marcus to confirm the site-review timing with the client.";
  if (/appointment|office/i.test(reason)) return "Marcus to confirm the initial project review timing with the client.";
  if (/call|chat|human/i.test(reason)) return "Marcus to contact the client directly.";
  return "Marcus to review the conversation and take over the next sales step.";
}

type HandoffControlReadBack = {
  needsMarcus: boolean;
  botPaused: boolean;
  botPauseReason: string;
  salesStage: string;
  salesNextAction: string;
};

async function readControl(leadId: string): Promise<HandoffControlReadBack | null> {
  if (getDataMode() === "Mock Mode") {
    const lead = getMockStore().leads.find((item) => item.id === leadId);
    return lead ? {
      needsMarcus: Boolean(lead.needsMarcus),
      botPaused: Boolean(lead.botPaused),
      botPauseReason: lead.botPauseReason ?? "",
      salesStage: lead.salesStage ?? "New Lead",
      salesNextAction: lead.salesNextAction ?? ""
    } : null;
  }

  const { data, error } = await adminClient()
    .from("leads")
    .select("needs_marcus, bot_paused, bot_pause_reason, sales_stage, sales_next_action")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(`Tiered WhatsApp handoff read-back failed: ${error.message}`);
  return data ? {
    needsMarcus: Boolean(data.needs_marcus),
    botPaused: Boolean(data.bot_paused),
    botPauseReason: String(data.bot_pause_reason ?? ""),
    salesStage: String(data.sales_stage ?? "New Lead"),
    salesNextAction: String(data.sales_next_action ?? "")
  } : null;
}

async function updateControl(input: {
  leadId: string;
  needsMarcus: boolean;
  pause: boolean;
  reason: string;
}) {
  const now = new Date().toISOString();
  const before = await readControl(input.leadId);
  if (!before) throw new Error("Tiered handoff could not find the lead for verified control update.");
  const requestedStage = targetSalesStage(input.reason);
  const salesStage = shouldAdvanceStage(before.salesStage, requestedStage) ? requestedStage : before.salesStage;
  const salesNextAction = nextSalesAction(input.reason);
  const expectedPostcondition = {
    needsMarcus: input.needsMarcus,
    botPaused: input.pause ? true : before.botPaused,
    salesStage,
    salesNextAction
  };
  const completionReceipt = await beginVerifiedCompletion({
    actionType: "lead_stage_change",
    entityType: "lead",
    entityId: input.leadId,
    leadId: input.leadId,
    intent: input.reason,
    expectedPostcondition,
    actorType: "system",
    actorName: "WhatsApp Sales-Ready Handoff",
    metadata: { sourceAction: "whatsapp_handoff_control", pauseRequested: input.pause }
  });

  if (getDataMode() === "Mock Mode") {
    const store = getMockStore();
    const index = store.leads.findIndex((lead) => lead.id === input.leadId);
    if (index < 0) throw new Error("Tiered handoff could not find the mock lead.");
    store.leads[index] = {
      ...store.leads[index],
      needsMarcus: input.needsMarcus,
      salesStage: salesStage as SalesStage,
      salesNextAction,
      ...(input.pause ? {
        botPaused: true,
        botPausedAt: now,
        botPausedBy: "WhatsApp Tiered Handoff",
        botPauseReason: input.reason
      } : {})
    };
  } else {
    const patch: Record<string, unknown> = {
      needs_marcus: input.needsMarcus,
      sales_stage: salesStage,
      sales_next_action: salesNextAction,
      updated_at: now
    };
    if (input.pause) {
      patch.bot_paused = true;
      patch.bot_paused_at = now;
      patch.bot_paused_by = "WhatsApp Tiered Handoff";
      patch.bot_pause_reason = input.reason;
    }
    const { error } = await adminClient().from("leads").update(patch).eq("id", input.leadId);
    if (error) {
      await observeVerifiedCompletion(completionReceipt, {
        independentlyObserved: false,
        postconditionMatched: false,
        terminalFailure: true,
        failureReason: error.message,
        observedEvidence: { updateAccepted: false }
      }).catch(() => null);
      throw new Error(`Tiered WhatsApp handoff control failed: ${error.message}`);
    }
  }

  const observed = await readControl(input.leadId);
  const matches = Boolean(observed) &&
    observed?.needsMarcus === expectedPostcondition.needsMarcus &&
    observed?.botPaused === expectedPostcondition.botPaused &&
    observed?.salesStage === expectedPostcondition.salesStage &&
    observed?.salesNextAction === expectedPostcondition.salesNextAction;
  const completionStatus: VerifiedCompletionStatus = await observeVerifiedCompletion(completionReceipt, {
    independentlyObserved: Boolean(observed),
    postconditionMatched: matches,
    terminalFailure: Boolean(observed) && !matches,
    failureReason: matches ? "" : "Handoff control read-back did not match the requested postcondition.",
    observedEvidence: { readBackFound: Boolean(observed), ...observed }
  });
  if (completionStatus !== "verified") {
    throw new Error(`Tiered WhatsApp handoff completion remained ${completionStatus}; the control state was not proven.`);
  }
  return { completionReceiptId: completionReceipt.receiptId, completionStatus, salesStage };
}

async function audit(input: {
  leadId: string;
  tier: WhatsAppHandoffTier;
  reasons: string[];
  action: string;
  pauseApplied: boolean;
  botContinues: boolean;
  outcome?: WhatsAppHandoffFinalOutcome;
  completionReceiptId?: string;
  completionStatus?: VerifiedCompletionStatus;
  salesStage?: string;
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
      completionReceiptId: input.completionReceiptId ?? "",
      completionStatus: input.completionStatus ?? "",
      salesStage: input.salesStage ?? "",
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
  const completion = await updateControl({ leadId: input.leadId, needsMarcus: true, pause: pauseNow, reason });
  await audit({
    leadId: input.leadId,
    tier: input.tier,
    reasons: input.reasons,
    action: pauseNow ? "whatsapp_handoff_pause_applied" : "whatsapp_handoff_attention_marked",
    pauseApplied: pauseNow,
    botContinues: !pauseNow,
    ...completion
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
  const completion = await updateControl({ leadId: input.leadId, needsMarcus: true, pause: true, reason });
  await audit({
    leadId: input.leadId,
    tier: input.tier,
    reasons: input.reasons,
    action: input.outcome === "reply_sent"
      ? "whatsapp_handoff_pause_applied_after_reply"
      : "whatsapp_handoff_pause_applied_after_reply_failure",
    pauseApplied: true,
    botContinues: false,
    outcome: input.outcome,
    ...completion
  });
  return { pauseApplied: true, outcome: input.outcome, ...completion };
}
