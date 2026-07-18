import { openAiBrainDryRunAdapter } from "@/lib/adapters/openai-adapter";
import { validateAiDryRunRecommendation } from "@/lib/ai-dry-run";
import { getOpenAiBrainRuntime } from "@/lib/openai-brain-config";
import { createAuditLog } from "./audit-repository";
import { getDataMode } from "./data-source";
import { getLeadById } from "./leads-repository";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseServerClient } from "./supabase-server";
import type { AiDraftReviewStatus, AiDryRunRecommendation } from "@/lib/types";

const bossReviewAuditActions: Record<Exclude<AiDraftReviewStatus, "pending">, string> = {
  saved: "ai_draft_saved",
  marked_useful: "ai_draft_marked_useful",
  marked_not_useful: "ai_draft_marked_not_useful",
  needs_edit: "ai_draft_needs_edit",
  rejected_unsafe: "ai_draft_rejected_unsafe",
  copied: "ai_draft_copied"
};

const bossReviewLabels: Record<Exclude<AiDraftReviewStatus, "pending">, string> = {
  saved: "AI draft saved for boss review",
  marked_useful: "AI draft marked useful",
  marked_not_useful: "AI draft marked not useful",
  needs_edit: "AI draft marked as needing edit",
  rejected_unsafe: "AI draft rejected as unsafe",
  copied: "AI draft copied for manual boss review"
};

function mapAiDecisionRow(row: any): AiDryRunRecommendation {
  const decision = row.decision ?? {};
  const recommendation: AiDryRunRecommendation = {
    id: row.id,
    leadId: row.lead_id,
    mode: decision.mode ?? "dry_run",
    draftNotice: decision.draftNotice ?? decision.draft_notice ?? "Draft only — boss approval required",
    provider: decision.provider ?? "safe_fallback",
    model: decision.model ?? "unknown",
    decision: decision.decision ?? {
      division: "LIMM Works",
      property_type: "",
      service_type: "",
      scope_summary: "",
      lead_score: 0,
      lead_category: "Cold",
      missing_info: [],
      risk_flags: [],
      appointment_suitable: false,
      appointment_type: "initial_project_review",
      auto_booking_allowed: false,
      boss_approval_needed: true,
      quotation_readiness_score: 0,
      quote_preparation_checklist: [],
      client_reply: row.client_reply ?? "",
      internal_notes: row.internal_notes ?? ""
    },
    validation: decision.validation ?? { ok: false, errors: ["Legacy AI record missing validation."], warnings: [] },
    reviewStatus: decision.reviewStatus ?? "pending",
    reviewNotes: decision.reviewNotes ?? "",
    reviewedAt: decision.reviewedAt ?? "",
    createdAt: row.created_at
  };
  recommendation.validation = validateAiDryRunRecommendation(recommendation);
  return recommendation;
}

export async function listAiRecommendationsForLead(leadId: string) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("lead_ai_decisions")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (!error && data) return data.map(mapAiDecisionRow);
  }

  return mockClone(getMockStore().aiRecommendations)
    .filter((item) => item.leadId === leadId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLatestAiRecommendationForLead(leadId: string) {
  const recommendations = await listAiRecommendationsForLead(leadId);
  return recommendations[0] ?? null;
}

export async function saveAiDryRunRecommendation(recommendation: AiDryRunRecommendation) {
  const validation = validateAiDryRunRecommendation(recommendation);
  const record: AiDryRunRecommendation = {
    ...recommendation,
    validation,
    createdAt: recommendation.createdAt || new Date().toISOString()
  };

  if (!validation.ok) {
    throw new Error(`Unsafe AI dry-run recommendation rejected: ${validation.errors.join("; ")}`);
  }

  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("lead_ai_decisions")
      .insert({
        lead_id: record.leadId,
        decision: record,
        client_reply: record.decision.client_reply,
        internal_notes: record.decision.internal_notes,
        boss_approval_needed: true,
        created_at: record.createdAt
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`AI dry-run insert failed: ${error.message}`);
    const mapped = mapAiDecisionRow(data);
    await createAiDryRunAudit(mapped);
    return mapped;
  }

  const store = getMockStore();
  const saved = { ...record, id: record.id ?? `ai-dry-run-${Date.now()}` };
  store.aiRecommendations.unshift(saved);
  await createAiDryRunAudit(saved);
  return mockClone(saved);
}

async function createAiDryRunAudit(recommendation: AiDryRunRecommendation) {
  await createAuditLog({
    actorType: "boss",
    actorName: "Marcus",
    action: "ai_dry_run_recommendation_saved",
    entityType: "lead_ai_decision",
    entityId: recommendation.id ?? recommendation.leadId,
    summary: "AI dry-run draft recommendation saved for boss approval. No sending, booking, or pricing action performed.",
    beforeData: null,
    afterData: {
      leadId: recommendation.leadId,
      draftNotice: recommendation.draftNotice,
      provider: recommendation.provider,
      validationOk: recommendation.validation.ok,
      bossApprovalNeeded: recommendation.decision.boss_approval_needed,
      autoBookingAllowed: recommendation.decision.auto_booking_allowed
    },
    metadata: {
      dryRun: true,
      noAutoSend: true,
      noWhatsApp: true,
      noCalendarBooking: true,
      noBooking: true,
      noPricing: true
    }
  });
}

export async function recordAiDraftReviewAction(input: {
  leadId: string;
  recommendationId: string;
  reviewStatus: Exclude<AiDraftReviewStatus, "pending">;
  notes?: string;
}) {
  const now = new Date().toISOString();
  const auditAction = bossReviewAuditActions[input.reviewStatus];
  const label = bossReviewLabels[input.reviewStatus];
  let beforeData: Record<string, unknown> | null = null;
  let afterData: Record<string, unknown> = {
    leadId: input.leadId,
    recommendationId: input.recommendationId,
    reviewStatus: input.reviewStatus,
    reviewNotes: input.notes ?? "",
    reviewedAt: now
  };

  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("lead_ai_decisions")
      .select("*")
      .eq("id", input.recommendationId)
      .maybeSingle();
    if (error) throw new Error(`AI draft review lookup failed: ${error.message}`);
    if (data) {
      const previous = mapAiDecisionRow(data);
      beforeData = {
        reviewStatus: previous.reviewStatus ?? "pending",
        reviewNotes: previous.reviewNotes ?? "",
        reviewedAt: previous.reviewedAt ?? ""
      };
      const updated: AiDryRunRecommendation = {
        ...previous,
        reviewStatus: input.reviewStatus,
        reviewNotes: input.notes ?? "",
        reviewedAt: now
      };
      const { error: updateError } = await supabase!
        .from("lead_ai_decisions")
        .update({ decision: updated })
        .eq("id", input.recommendationId);
      if (updateError) throw new Error(`AI draft review update failed: ${updateError.message}`);
      afterData = {
        ...afterData,
        validationOk: updated.validation.ok,
        provider: updated.provider,
        draftNotice: updated.draftNotice
      };
    }
  } else {
    const store = getMockStore();
    const index = store.aiRecommendations.findIndex((item) => item.id === input.recommendationId);
    if (index >= 0) {
      const previous = store.aiRecommendations[index];
      beforeData = {
        reviewStatus: previous.reviewStatus ?? "pending",
        reviewNotes: previous.reviewNotes ?? "",
        reviewedAt: previous.reviewedAt ?? ""
      };
      store.aiRecommendations[index] = {
        ...previous,
        reviewStatus: input.reviewStatus,
        reviewNotes: input.notes ?? "",
        reviewedAt: now
      };
      afterData = {
        ...afterData,
        validationOk: store.aiRecommendations[index].validation.ok,
        provider: store.aiRecommendations[index].provider,
        draftNotice: store.aiRecommendations[index].draftNotice
      };
    }
  }

  await createAuditLog({
    actorType: "boss",
    actorName: "Marcus",
    action: auditAction,
    entityType: "lead_ai_decision",
    entityId: input.recommendationId,
    summary: `${label}. No external message, WhatsApp send, calendar booking, or pricing action performed.`,
    beforeData,
    afterData,
    metadata: {
      dryRun: true,
      bossApprovalRequired: true,
      noAutoSend: true,
      noWhatsApp: true,
      noCalendarBooking: true,
      noBooking: true,
      noPricing: true,
      copiedOnly: input.reviewStatus === "copied"
    }
  });
}

export async function generateAndSaveAiDryRunRecommendation(leadId: string) {
  const runtime = getOpenAiBrainRuntime();
  if (!runtime.dryRunEnabled) {
    throw new Error("OpenAI brain dry-run is disabled by default.");
  }
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error(`Lead not found: ${leadId}`);
  const recommendation = await openAiBrainDryRunAdapter.draftRecommendation({ lead });
  return saveAiDryRunRecommendation(recommendation);
}
