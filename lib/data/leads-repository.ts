import { createAuditLog } from "./audit-repository";
import { listAuditLogs } from "./audit-repository";
import { getDataMode } from "./data-source";
import { mapLeadRow } from "./mappers";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import { buildLeadFacts, leadFactsToLeadPatch } from "@/lib/lead-facts";
import { buildQuoteApprovalGate, isQuoteSentPatch } from "@/lib/boss-ops";
import { isProductionHiddenLead } from "@/lib/production-visibility";
import { calculateLeadLevel, missionForLead } from "@/lib/sales-control";
import { scoreTestLead } from "@/lib/test-lead-cleanup";
import {
  classifyConversationIntent,
  isSalesEligibleLead,
  type ConversationIntent,
  type IntentGateDecision
} from "@/lib/whatsapp-intent-gate";
import type { LatestUnansweredQuestion } from "@/lib/whatsapp-conversation-safety";
import type { Division, Lead, LeadCategory, LeadFile, LeadIntakeProfile, LeadMessage, LeadStatus } from "@/lib/types";

type ListLeadsOptions = { includeInactive?: boolean; includeTest?: boolean; includeNonSales?: boolean };

const INTENT_GATE_ROW_COLUMNS = new Set([
  "conversation_intent",
  "lead_eligible",
  "conversation_route",
  "intent_confidence",
  "intent_reason_codes",
  "intent_classifier_version",
  "intent_manual_override",
  "intent_classified_at",
  "non_sales_acknowledged_at",
  "latest_unanswered_question",
  "conversation_safety_state"
]);

function isMissingIntentGateColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const detail = `${error.code ?? ""} ${error.message ?? ""}`;
  return /PGRST204|42703|schema cache|column/i.test(detail) &&
    [...INTENT_GATE_ROW_COLUMNS].some((column) => detail.includes(column));
}

export class ManualLeadCreateError extends Error {
  constructor(message = "Manual lead creation failed. No external message or booking was sent.") {
    super(message);
    this.name = "ManualLeadCreateError";
  }
}

export type ManualLeadCreateInput = {
  clientName: string;
  phone: string;
  source?: string;
  division?: Division;
  propertyType: string;
  serviceType: string;
  scopeSummary: string;
  preferredContactTime?: string;
  leadCategory?: LeadCategory;
  leadScore?: number;
  riskFlags?: string[];
  missingInfo?: string[];
  isTest?: boolean;
  notes?: string;
};

function shouldShowLead(lead: Lead, options?: ListLeadsOptions) {
  if (!options?.includeInactive && (lead.deletedAt || lead.archivedAt || lead.isSpam)) return false;
  if (!options?.includeNonSales && !isSalesEligibleLead(lead)) return false;
  if (!options?.includeTest && lead.isTest) return false;
  if (!options?.includeTest && scoreTestLead(lead).clearlyTest) return false;
  if (!options?.includeTest && isProductionHiddenLead(lead)) return false;
  return true;
}

function leadPatchToRow(patch: Partial<Lead>, now: string) {
  const row: Record<string, unknown> = {
    status: patch.status,
    boss_approval_needed: patch.bossApprovalNeeded,
    quotation_readiness_score: patch.quotationReadiness,
    appointment_readiness: patch.appointmentReadiness,
    missing_info: patch.missingInfo,
    next_action: patch.aiRecommendedNextAction,
    updated_at: now
  };
  const optional: Array<[keyof Lead, string]> = [
    ["propertyType", "property_type"],
    ["serviceType", "service_type"],
    ["scopeSummary", "scope_summary"],
    ["leadScore", "lead_score"],
    ["leadCategory", "lead_category"],
    ["lastClientMessage", "last_client_message"],
    ["lastReplyAt", "last_reply_at"],
    ["firstOperatorResponseAt", "first_operator_response_at"],
    ["preferredContactTime", "preferred_contact_time"],
    ["deletedAt", "deleted_at"],
    ["deletedBy", "deleted_by"],
    ["deleteReason", "delete_reason"],
    ["archivedAt", "archived_at"],
    ["archivedBy", "archived_by"],
    ["archivedReason", "archived_reason"],
    ["isTest", "is_test"],
    ["isSpam", "is_spam"],
    ["duplicateOf", "duplicate_of"],
    ["restoredAt", "restored_at"],
    ["restoredBy", "restored_by"],
    ["botPaused", "bot_paused"],
    ["botPausedAt", "bot_paused_at"],
    ["botPausedBy", "bot_paused_by"],
    ["botPauseReason", "bot_pause_reason"],
    ["assignedTo", "assigned_to"],
    ["needsMarcus", "needs_marcus"],
    ["followedUpAt", "followed_up_at"],
    ["followedUpBy", "followed_up_by"],
    ["leadLevel", "lead_level"],
    ["conversationSummary", "conversation_summary"],
    ["missionCategory", "mission_category"],
    ["salesStage", "sales_stage"],
    ["leadOwner", "lead_owner"],
    ["salesNextAction", "sales_next_action"],
    ["followUpDate", "follow_up_date"],
    ["probabilityPercent", "probability_percent"],
    ["potentialValue", "potential_value"],
    ["expectedCloseDate", "expected_close_date"],
    ["leadSource", "lead_source"],
    ["wonLostReason", "won_lost_reason"],
    ["stageNotes", "stage_notes"],
    ["quotationStatus", "quotation_status"],
    ["quotedAmount", "quoted_amount"],
    ["quoteSentDate", "quote_sent_date"],
    ["quoteExpiryDate", "quote_expiry_date"],
    ["quoteRevisionCount", "quote_revision_count"],
    ["quoteFollowUpDate", "quote_follow_up_date"],
    ["quoteNotes", "quote_notes"],
    ["confirmedValue", "confirmed_value"],
    ["wonDate", "won_date"],
    ["lostDate", "lost_date"],
    ["projectId", "project_id"],
    ["propertyArea", "property_area"],
    ["postalCode", "postal_code"],
    ["projectAddress", "project_address"],
    ["planningRegion", "planning_region"],
    ["planningArea", "planning_area"],
    ["mapLat", "map_lat"],
    ["mapLng", "map_lng"],
    ["locationConfidence", "location_confidence"],
    ["locationSource", "location_source"],
    ["locationNotes", "location_notes"],
    ["intakeProfile", "intake_profile"],
    ["conversationIntent", "conversation_intent"],
    ["leadEligible", "lead_eligible"],
    ["conversationRoute", "conversation_route"],
    ["intentConfidence", "intent_confidence"],
    ["intentReasonCodes", "intent_reason_codes"],
    ["intentClassifierVersion", "intent_classifier_version"],
    ["intentManualOverride", "intent_manual_override"],
    ["intentClassifiedAt", "intent_classified_at"],
    ["nonSalesAcknowledgedAt", "non_sales_acknowledged_at"],
    ["latestUnansweredQuestion", "latest_unanswered_question"],
    ["conversationSafetyState", "conversation_safety_state"]
  ];
  for (const [key, column] of optional) {
    if (key in patch) row[column] = patch[key];
  }
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

export async function listLeads(options?: ListLeadsOptions) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("leads")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!error && data) {
      const leads = data.map(mapLeadRow);
      return leads.filter((lead) => shouldShowLead(lead, options));
    }
  }

  return mockClone(getMockStore().leads)
    .filter((lead) => shouldShowLead(lead, options))
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
}

export async function getLeadById(id: string) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase!.from("leads").select("*").eq("id", id).maybeSingle();
    if (!error && data) return mapLeadRow(data);
  }

  const lead = getMockStore().leads.find((item) => item.id === id) ?? null;
  return lead ? mockClone(lead) : null;
}

function cleanList(values: string[] = []) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function manualLeadToRow(input: ManualLeadCreateInput, now: string) {
  const isTest = Boolean(input.isTest);
  const nextAction = "Review manually. No WhatsApp/email/calendar action was sent.";
  const leadScore = Number.isFinite(input.leadScore) ? Number(input.leadScore) : 0;
  return {
    client_name: input.clientName.trim(),
    phone: input.phone.trim(),
    email: "",
    source: input.source?.trim() || "Manual / Internal",
    division: input.division || "LIMM Works",
    property_type: input.propertyType.trim(),
    service_type: input.serviceType.trim(),
    scope_summary: input.scopeSummary.trim(),
    lead_score: leadScore,
    lead_category: input.leadCategory || "Warm",
    status: "New Enquiry",
    missing_info: cleanList(input.missingInfo),
    risk_flags: cleanList(input.riskFlags),
    boss_approval_needed: false,
    appointment_suitable: false,
    appointment_type: "initial_project_review",
    appointment_readiness: 0,
    quotation_readiness_score: 0,
    next_action: nextAction,
    preferred_contact_time: input.preferredContactTime?.trim() || "",
    is_test: isTest,
    is_spam: false,
    lead_level: isTest ? "Spam/Test" : "Warm Lead",
    mission_category: isTest ? "Test/Spam Cleanup" : "Sales Follow-Up",
    conversation_summary: "Manual internal lead created from Command Centre.",
    sales_stage: "New Lead",
    sales_next_action: nextAction,
    lead_source: input.source?.trim() || "Manual / Internal",
    stage_notes: input.notes?.trim() || "",
    created_at: now,
    updated_at: now
  };
}

export async function createManualLead(input: ManualLeadCreateInput, actor = "Marcus") {
  const now = new Date().toISOString();
  const row = manualLeadToRow(input, now);

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseAdminClient() ?? (await getSupabaseServerClient());
    const { data, error } = await supabase!
      .from("leads")
      .insert(row)
      .select("*")
      .maybeSingle();

    if (error || !data) {
      throw new ManualLeadCreateError("Manual lead creation failed in Supabase. No WhatsApp/email/calendar action was sent.");
    }

    const lead = mapLeadRow(data);
    await createAuditLog({
      actorType: "boss",
      actorName: actor,
      action: "lead_manual_created",
      entityType: "lead",
      entityId: lead.id,
      summary: "Manual internal lead created from Command Centre.",
      beforeData: null,
      afterData: { id: lead.id, clientName: lead.clientName, isTest: Boolean(lead.isTest), status: lead.status },
      metadata: {
        manualCreate: true,
        noWhatsAppSend: true,
        noEmailSend: true,
        noCalendarBooking: true,
        noPriceGuideAutomation: true,
        isTest: Boolean(lead.isTest)
      }
    });
    return lead;
  }

  const lead: Lead = {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    clientName: row.client_name,
    phone: row.phone,
    email: "",
    source: row.source,
    division: row.division as Division,
    propertyType: row.property_type,
    serviceType: row.service_type,
    scopeSummary: row.scope_summary,
    leadScore: row.lead_score,
    leadCategory: row.lead_category as LeadCategory,
    status: "New Enquiry",
    missingInfo: row.missing_info,
    aiRecommendedNextAction: row.next_action,
    bossApprovalNeeded: false,
    appointmentSuitable: false,
    appointmentType: "initial_project_review",
    appointmentReadiness: 0,
    quotationReadiness: 0,
    lastClientMessage: "",
    lastReplyAt: null,
    createdAt: now,
    updatedAt: now,
    preferredContactTime: row.preferred_contact_time,
    riskFlags: row.risk_flags,
    isTest: row.is_test,
    isSpam: false,
    leadLevel: row.lead_level as Lead["leadLevel"],
    missionCategory: row.mission_category,
    conversationSummary: row.conversation_summary,
    salesStage: "New Lead",
    salesNextAction: row.sales_next_action,
    leadSource: row.lead_source,
    stageNotes: row.stage_notes
  };
  getMockStore().leads.unshift(lead);
  await createAuditLog({
    actorType: "boss",
    actorName: actor,
    action: "lead_manual_created",
    entityType: "lead",
    entityId: lead.id,
    summary: "Manual internal lead created from Command Centre.",
    beforeData: null,
    afterData: { id: lead.id, clientName: lead.clientName, isTest: Boolean(lead.isTest), status: lead.status },
    metadata: {
      manualCreate: true,
      noWhatsAppSend: true,
      noEmailSend: true,
      noCalendarBooking: true,
      noPriceGuideAutomation: true,
      isTest: Boolean(lead.isTest)
    }
  });
  return mockClone(lead);
}

async function updateLead(id: string, patch: Partial<Lead>, action: string, summary: string, metadata: Record<string, unknown> = {}) {
  const before = await getLeadById(id);
  const now = new Date().toISOString();

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseAdminClient() ?? (await getSupabaseServerClient());
    const fullRow = leadPatchToRow(patch, now);
    let { data, error } = await supabase!
      .from("leads")
      .update(fullRow)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (
      isMissingIntentGateColumnError(error) &&
      Object.keys(fullRow).some((column) => INTENT_GATE_ROW_COLUMNS.has(column))
    ) {
      const compatibilityRow = Object.fromEntries(
        Object.entries(fullRow).filter(([column]) => !INTENT_GATE_ROW_COLUMNS.has(column))
      );
      const retry = await supabase!
        .from("leads")
        .update(compatibilityRow)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (!error && data) {
      const after = mapLeadRow(data);
      await createAuditLog({
        actorType: String(metadata.auditActorType ?? "boss"),
        actorName: String(metadata.auditActorName ?? "Marcus"),
        action,
        entityType: "lead",
        entityId: id,
        summary,
        beforeData: before ? { status: before.status, bossApprovalNeeded: before.bossApprovalNeeded } : null,
        afterData: { status: after.status, bossApprovalNeeded: after.bossApprovalNeeded },
        metadata
      });
      return after;
    }
    if (error) throw new Error(`Lead update failed: ${error.message}`);
  }

  const store = getMockStore();
  const index = store.leads.findIndex((item) => item.id === id);
  if (index === -1) return null;
  store.leads[index] = { ...store.leads[index], ...patch, updatedAt: now };
  const after = store.leads[index];
  await createAuditLog({
    actorType: String(metadata.auditActorType ?? "boss"),
    actorName: String(metadata.auditActorName ?? "Marcus"),
    action,
    entityType: "lead",
    entityId: id,
    summary,
    beforeData: before ? { status: before.status, bossApprovalNeeded: before.bossApprovalNeeded } : null,
    afterData: { status: after.status, bossApprovalNeeded: after.bossApprovalNeeded },
    metadata
  });
  return mockClone(after);
}

function intentGateIntakeProfile(
  lead: Lead,
  gate: IntentGateDecision,
  latestUnansweredQuestion: LatestUnansweredQuestion | null,
  classifiedAt: string,
  safetyState: Record<string, unknown> = lead.conversationSafetyState ?? {}
): LeadIntakeProfile {
  return {
    ...(lead.intakeProfile ?? {}),
    trace: {
      ...(lead.intakeProfile?.trace ?? {}),
      intentGate: {
        conversationIntent: gate.conversationIntent,
        primaryIntent: gate.primaryIntent,
        leadEligible: gate.leadEligible,
        salesEligible: gate.salesEligible,
        conversationRoute: gate.conversationRoute,
        confidence: gate.confidence,
        reasonCodes: gate.reasonCodes,
        autoReplyPolicy: gate.autoReplyPolicy,
        classifierVersion: gate.classifierVersion,
        ruleVersion: gate.ruleVersion,
        manualOverride: lead.intentManualOverride ?? null,
        manualOverrideApplied: gate.manualOverrideApplied,
        classifiedAt,
        classificationLatencyMs: gate.classificationLatencyMs,
        latestUnansweredQuestion,
        nonSalesAcknowledgedAt: lead.nonSalesAcknowledgedAt ?? null,
        conversationSafetyState: safetyState
      }
    }
  };
}

export async function updateConversationRouting(
  lead: Lead,
  gate: IntentGateDecision,
  latestUnansweredQuestion: LatestUnansweredQuestion | null,
  metadata: Record<string, unknown> = {}
) {
  const classifiedAt = new Date().toISOString();
  const provisional = lead.serviceType === "conversation_pending_classification" || lead.conversationRoute === "intent_review";
  const salesPatch: Partial<Lead> = gate.leadEligible && provisional
    ? {
        serviceType: "initial_project_review",
        leadScore: 25,
        leadCategory: "Cold",
        status: "New Enquiry",
        missingInfo: ["property_type", "scope", "floor_plan", "site_photos"],
        aiRecommendedNextAction: "Ask only for the next useful renovation detail before project review.",
        leadLevel: "Cold Lead",
        missionCategory: "Sales Follow-Up"
      }
    : !gate.leadEligible && provisional
      ? {
          leadScore: 0,
          leadCategory: "Low Fit",
          status: "Not Suitable",
          missingInfo: [],
          quotationReadiness: 0,
          appointmentReadiness: 0,
          aiRecommendedNextAction: `Route conversation to ${gate.conversationRoute.replace(/_/g, " ")}; keep it out of sales queues.`,
          leadLevel: "Low Fit",
          missionCategory: `Conversation: ${gate.conversationRoute.replace(/_/g, " ")}`
        }
      : {};
  const intakeProfile = intentGateIntakeProfile(lead, gate, latestUnansweredQuestion, classifiedAt);

  return updateLead(
    lead.id,
    {
      ...salesPatch,
      conversationIntent: gate.conversationIntent,
      leadEligible: gate.leadEligible,
      conversationRoute: gate.conversationRoute,
      intentConfidence: gate.confidence,
      intentReasonCodes: gate.reasonCodes,
      intentClassifierVersion: gate.classifierVersion,
      intentManualOverride: lead.intentManualOverride ?? null,
      intentClassifiedAt: classifiedAt,
      latestUnansweredQuestion,
      conversationSafetyState: lead.conversationSafetyState ?? {},
      intakeProfile
    },
    "whatsapp_conversation_routed",
    "WhatsApp conversation classified and routed before the renovation sales brain.",
    {
      auditActorType: "system",
      auditActorName: "WhatsApp Intent Gate",
      conversationIntent: gate.conversationIntent,
      leadEligible: gate.leadEligible,
      conversationRoute: gate.conversationRoute,
      confidence: gate.confidence,
      reasonCodes: gate.reasonCodes,
      classifierVersion: gate.classifierVersion,
      ruleVersion: gate.ruleVersion,
      manualOverride: lead.intentManualOverride ?? null,
      manualOverrideApplied: gate.manualOverrideApplied,
      latestUnansweredQuestion: latestUnansweredQuestion?.text ?? "",
      ...metadata
    }
  );
}

export async function setLeadConversationIntentOverride(
  id: string,
  intent: ConversationIntent | null,
  actorName = "Marcus"
) {
  const lead = await getLeadById(id);
  if (!lead) return null;
  const overriddenLead: Lead = { ...lead, intentManualOverride: intent };
  const gate = classifyConversationIntent({
    currentMessageText: lead.lastClientMessage,
    currentMessageType: "text",
    recentMessages: [],
    lead: overriddenLead,
    botPaused: lead.botPaused
  });
  return updateConversationRouting(overriddenLead, gate, lead.latestUnansweredQuestion ?? null, {
    auditActorType: "boss",
    auditActorName: actorName,
    manualIntentCorrection: true,
    previousIntent: lead.conversationIntent ?? "",
    requestedOverride: intent ?? "cleared"
  });
}

export async function recordConversationSafetyOutcome(input: {
  lead: Lead;
  providerMessageId: string;
  conversationIntent: IntentGateDecision["conversationIntent"];
  acknowledgementIntent?: IntentGateDecision["conversationIntent"] | null;
  replySent?: boolean;
  semanticDuplicateBlocked?: boolean;
  unrelatedReplyBlocked?: boolean;
  noReplySafetySuppression?: boolean;
  replySignature?: string;
  suppressionReason?: string;
}) {
  const latestLead = await getLeadById(input.lead.id) ?? input.lead;
  const previousState = latestLead.conversationSafetyState ?? {};
  const acknowledgedIntents = Array.isArray(previousState.acknowledgedIntents)
    ? previousState.acknowledgedIntents.map(String)
    : [];
  const acknowledgementSent = Boolean(input.replySent && input.acknowledgementIntent);
  if (acknowledgementSent && input.acknowledgementIntent && !acknowledgedIntents.includes(input.acknowledgementIntent)) {
    acknowledgedIntents.push(input.acknowledgementIntent);
  }
  const now = new Date().toISOString();
  const count = (key: string, increment: boolean | undefined) => Number(previousState[key] ?? 0) + (increment ? 1 : 0);
  const safetyState: Record<string, unknown> = {
    ...previousState,
    acknowledgedIntents,
    duplicateRepliesBlocked: count("duplicateRepliesBlocked", input.semanticDuplicateBlocked),
    unrelatedRepliesBlocked: count("unrelatedRepliesBlocked", input.unrelatedReplyBlocked),
    noReplySafetySuppressions: count("noReplySafetySuppressions", input.noReplySafetySuppression),
    lastReplySignature: input.replySignature || previousState.lastReplySignature || "",
    lastSuppressionReason: input.suppressionReason ?? "",
    lastProviderMessageId: input.providerMessageId,
    updatedAt: now
  };
  const gate = {
    ...(latestLead.intakeProfile?.trace?.intentGate as Record<string, unknown> | undefined),
    conversationSafetyState: safetyState,
    nonSalesAcknowledgedAt: acknowledgementSent ? now : latestLead.nonSalesAcknowledgedAt ?? null,
    latestUnansweredQuestion: input.replySent ? null : latestLead.latestUnansweredQuestion ?? null
  };
  const intakeProfile: LeadIntakeProfile = {
    ...(latestLead.intakeProfile ?? {}),
    trace: {
      ...(latestLead.intakeProfile?.trace ?? {}),
      intentGate: gate
    }
  };

  return updateLead(
    latestLead.id,
    {
      nonSalesAcknowledgedAt: acknowledgementSent ? now : latestLead.nonSalesAcknowledgedAt ?? null,
      latestUnansweredQuestion: input.replySent ? null : latestLead.latestUnansweredQuestion ?? null,
      conversationSafetyState: safetyState,
      lastReplyAt: input.replySent ? now : latestLead.lastReplyAt,
      firstOperatorResponseAt: input.replySent ? latestLead.firstOperatorResponseAt || now : latestLead.firstOperatorResponseAt,
      intakeProfile
    },
    "whatsapp_conversation_safety_outcome",
    "WhatsApp conversation safety outcome recorded.",
    {
      auditActorType: "system",
      auditActorName: "WhatsApp Conversation Safety",
      providerMessageId: input.providerMessageId,
      conversationIntent: input.conversationIntent,
      acknowledgementSent,
      semanticDuplicateBlocked: Boolean(input.semanticDuplicateBlocked),
      unrelatedReplyBlocked: Boolean(input.unrelatedReplyBlocked),
      noReplySafetySuppression: Boolean(input.noReplySafetySuppression),
      suppressionReason: input.suppressionReason ?? ""
    }
  );
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  return updateLead(id, { status }, "lead_status_updated", `Lead status updated to ${status}.`);
}

export async function updateLeadSalesTracking(id: string, patch: Partial<Lead>, reason = "Sales tracking updated.") {
  const lead = await getLeadById(id);
  if (lead && !isSalesEligibleLead(lead)) {
    await createAuditLog({
      actorType: "system",
      actorName: "Intent Gate",
      action: "non_sales_sales_tracking_blocked",
      entityType: "lead",
      entityId: id,
      summary: "Sales tracking update blocked because the conversation is not sales eligible.",
      beforeData: { conversationIntent: lead.conversationIntent, conversationRoute: lead.conversationRoute },
      afterData: null,
      metadata: { requestedFields: Object.keys(patch), reason }
    });
    return null;
  }
  if (lead && isQuoteSentPatch(patch)) {
    const auditLogs = await listAuditLogs({ entityType: "lead", entityId: id });
    const gate = buildQuoteApprovalGate(lead, auditLogs);
    if (!gate.canMoveToQuoted) {
      await createAuditLog({
        actorType: "boss",
        actorName: "Marcus",
        action: "boss_quote_gate_blocked",
        entityType: "lead",
        entityId: id,
        summary: "Quotation Sent / Quoted move blocked because boss approval is missing.",
        beforeData: { salesStage: lead.salesStage, quotationStatus: lead.quotationStatus, bossApprovalNeeded: lead.bossApprovalNeeded },
        afterData: null,
        metadata: {
          blockedReason: gate.blockedReason,
          riskBadges: gate.badges.map((badge) => badge.label),
          requiresApproval: gate.requiresApproval,
          approved: gate.approved,
          noPriceGuideAutomation: true
        }
      });
      return null;
    }
  }

  return updateLead(
    id,
    patch,
    "lead_sales_tracking_updated",
    reason,
    {
      moneyChangeAudit: true,
      manualOnly: true,
      noPriceGuideAutomation: true,
      changedFields: Object.keys(patch)
    }
  );
}

export async function updateLeadIntakeProfile(
  id: string,
  intakeProfile: LeadIntakeProfile,
  metadata: Record<string, unknown> = {}
) {
  const missingInfo = intakeProfile.missingInfo ?? [];
  const suggestedQuestions = intakeProfile.suggestedQuestions ?? [];
  return updateLead(
    id,
    {
      intakeProfile,
      missingInfo,
      appointmentReadiness: intakeProfile.meetingReadinessScore ?? 0,
      quotationReadiness: intakeProfile.proposalReadinessScore ?? 0,
      aiRecommendedNextAction: suggestedQuestions.length
        ? `Collect intake: ${suggestedQuestions.slice(0, 3).join(" ")}`
        : "Review completed intake profile before the initial project review."
    },
    "lead_intake_fields_updated",
    "Smart intake profile updated for meeting and proposal preparation.",
    {
      smartLeadIntakeVersion: "v6.5",
      intakeFieldsUpdated: true,
      meetingReadinessScore: intakeProfile.meetingReadinessScore ?? 0,
      proposalReadinessScore: intakeProfile.proposalReadinessScore ?? 0,
      missingInfo,
      suggestedQuestionCount: suggestedQuestions.length,
      noPriceReplyRule: true,
      noCalendarBookingRule: true,
      ...metadata
    }
  );
}

export async function updateLeadFactsFromEvidence(
  lead: Lead,
  messages: LeadMessage[] = [],
  files: LeadFile[] = [],
  metadata: Record<string, unknown> = {}
) {
  const facts = buildLeadFacts(lead, messages, files);
  const patch = leadFactsToLeadPatch(lead, facts);
  const changedFields = Object.entries(patch)
    .filter(([key, value]) => {
      if (key === "intakeProfile") return true;
      return JSON.stringify((lead as unknown as Record<string, unknown>)[key]) !== JSON.stringify(value);
    })
    .map(([key]) => key);

  if (!changedFields.length) return lead;

  return updateLead(
    lead.id,
    patch,
    "lead_facts_updated",
    "Lead facts updated from WhatsApp evidence.",
    {
      leadFactsTruthLayer: true,
      changedFields,
      locationStatus: facts.locationStatus,
      infoCompletenessScore: facts.infoCompletenessScore,
      missingFields: facts.missingFields,
      conflictFields: facts.conflictFields,
      ...metadata
    }
  );
}

export async function markLeadWon(id: string, confirmedValue: number, wonReason: string) {
  const now = new Date().toISOString();
  return updateLeadSalesTracking(
    id,
    {
      salesStage: "Won",
      status: "Quotation Readiness",
      quotationStatus: "Accepted",
      confirmedValue,
      wonDate: now,
      wonLostReason: wonReason || "Other"
    },
    "Lead marked Won with manually entered confirmed value."
  );
}

export async function markLeadLost(id: string, lostReason: string) {
  const now = new Date().toISOString();
  return updateLeadSalesTracking(
    id,
    {
      salesStage: "Lost",
      status: "Not Suitable",
      lostDate: now,
      wonLostReason: lostReason || "Other"
    },
    "Lead marked Lost with reason retained for reporting."
  );
}

export async function markBossApprovalNeeded(id: string) {
  return updateLead(
    id,
    { bossApprovalNeeded: true, status: "Waiting Boss Approval" },
    "lead_boss_approval_marked",
    "Lead marked as needing Marcus approval."
  );
}

export async function markLeadNotSuitable(id: string) {
  return updateLead(id, { status: "Not Suitable" }, "lead_marked_not_suitable", "Lead marked not suitable.");
}

export async function moveLeadToQuotationReadiness(id: string) {
  const lead = await getLeadById(id);
  if (lead && !isSalesEligibleLead(lead)) {
    await createAuditLog({
      actorType: "system",
      actorName: "Intent Gate",
      action: "non_sales_quotation_readiness_blocked",
      entityType: "lead",
      entityId: id,
      summary: "Quotation readiness move blocked because the conversation is not sales eligible.",
      beforeData: { conversationIntent: lead.conversationIntent, conversationRoute: lead.conversationRoute },
      afterData: null
    });
    return null;
  }
  return updateLead(
    id,
    { status: "Quotation Readiness", aiRecommendedNextAction: "Prepare quotation readiness pack for Marcus review." },
    "lead_moved_to_quotation_readiness",
    "Lead moved to quotation readiness without generating prices."
  );
}

export async function requestAppointmentReview(id: string) {
  return updateLead(
    id,
    {
      status: "Appointment Pending",
      bossApprovalNeeded: true,
      aiRecommendedNextAction: "Review appointment readiness before offering or confirming any slot."
    },
    "appointment_review_requested",
    "Lead marked ready for appointment review. Booking confirmation still requires Marcus approval and an actual event."
  );
}

export async function approveAppointmentBooking(id: string) {
  return updateLead(
    id,
    {
      status: "Ready To Book",
      bossApprovalNeeded: false,
      aiRecommendedNextAction: "Create a Calendar event only after availability and required details are confirmed."
    },
    "appointment_booking_approved",
    "Marcus approved this lead for booking workflow. No Calendar event was created by this action."
  );
}

export async function requestAppointmentMissingInfo(id: string) {
  return updateLead(
    id,
    {
      status: "Awaiting Client",
      bossApprovalNeeded: false,
      aiRecommendedNextAction: "Ask the client for missing appointment details before booking review."
    },
    "appointment_missing_info_requested",
    "Appointment workflow needs more information before booking can proceed."
  );
}

export async function recordCalendarEventCreateRequested(id: string) {
  const lead = await updateLead(
    id,
    {
      status: "Ready To Book",
      aiRecommendedNextAction: "Calendar event creation requested, but live Calendar booking is disabled."
    },
    "calendar_event_create_requested",
    "Calendar event creation was requested from the CRM."
  );
  await createAuditLog({
    actorType: "system",
    actorName: "Calendar Adapter",
    action: "calendar_event_create_failed",
    entityType: "lead",
    entityId: id,
    summary: "Calendar event was not created because the live Calendar adapter is disabled.",
    beforeData: null,
    afterData: { calendarEventId: "", status: "disabled" },
    metadata: {
      calendarBookingEnabled: false,
      autoBookingEnabled: false,
      bossApprovalRequired: true,
      noFakeBooking: true
    }
  });
  return lead;
}

export async function archiveLead(id: string, reason: string, actorName = "Marcus") {
  const now = new Date().toISOString();
  return updateLead(
    id,
    { archivedAt: now, archivedBy: actorName, archivedReason: reason || "Archived from command centre." },
    "lead_archived",
    "Lead archived and hidden from active command queues.",
    { reason }
  );
}

export async function softDeleteLead(id: string, reason: string, actorName = "Marcus") {
  const now = new Date().toISOString();
  return updateLead(
    id,
    { deletedAt: now, deletedBy: actorName, deleteReason: reason || "Soft deleted from command centre." },
    "lead_soft_deleted",
    "Lead soft-deleted and hidden from active command queues.",
    { reason, hardDeleteAllowedOnlyAfterSoftDelete: true }
  );
}

export async function restoreLead(id: string, actorName = "Marcus") {
  const now = new Date().toISOString();
  const existing = await getLeadById(id);
  const restoringLegacySpamClassification = Boolean(
    existing?.isSpam &&
    !existing.isTest &&
    (existing.leadLevel === "Spam/Test" || existing.missionCategory === "Test/Spam Cleanup")
  );
  const restoredLead = existing ? {
    ...existing,
    deletedAt: null,
    archivedAt: null,
    isSpam: false
  } : null;
  return updateLead(
    id,
    {
      deletedAt: null,
      deletedBy: "",
      deleteReason: "",
      archivedAt: null,
      archivedBy: "",
      archivedReason: "",
      isSpam: false,
      ...(restoringLegacySpamClassification && restoredLead ? {
        leadLevel: calculateLeadLevel(restoredLead),
        missionCategory: missionForLead(restoredLead)
      } : {}),
      restoredAt: now,
      restoredBy: actorName
    },
    "lead_restored",
    "Lead restored to active command queues.",
    { restoredAt: now, restoredFromSpam: Boolean(existing?.isSpam), repairedLegacySpamClassification: restoringLegacySpamClassification }
  );
}

export async function markLeadAsTest(id: string) {
  return updateLead(id, { isTest: true, leadLevel: "Spam/Test", missionCategory: "Test/Spam Cleanup" }, "lead_marked_test", "Lead marked as test data.");
}

export async function markLeadAsSpam(id: string) {
  return updateLead(id, { isSpam: true }, "lead_marked_spam", "Lead marked as spam and hidden from active queue.");
}

export async function markLeadAsDuplicate(id: string, duplicateOf: string) {
  return updateLead(id, { duplicateOf, missionCategory: "Test/Spam Cleanup" }, "lead_marked_duplicate", "Lead marked as duplicate.", { duplicateOf });
}

export async function takeOverLead(id: string, actorName = "Marcus") {
  const now = new Date().toISOString();
  return updateLead(
    id,
    { botPaused: true, botPausedAt: now, botPausedBy: actorName, botPauseReason: "Human takeover", needsMarcus: true },
    "lead_human_takeover",
    "Human takeover enabled and bot paused for this lead.",
    { botPaused: true }
  );
}

export async function markLeadAwaitingClientAfterManualReply(id: string, actorName = "Marcus") {
  const now = new Date().toISOString();
  const existing = await getLeadById(id);
  return updateLead(
    id,
    {
      status: "Awaiting Client",
      botPaused: true,
      botPausedAt: now,
      botPausedBy: actorName,
      botPauseReason: "Human takeover",
      needsMarcus: false,
      bossApprovalNeeded: false,
      lastReplyAt: now,
      firstOperatorResponseAt: existing?.firstOperatorResponseAt || now
    },
    "lead_waiting_for_client_after_manual_reply",
    "Manual WhatsApp reply sent; bot remains paused and lead is waiting for client response.",
    { botPaused: true, waitingForClient: true }
  );
}

export async function pauseBotForLead(id: string, reason: string, actorName = "Marcus") {
  const now = new Date().toISOString();
  return updateLead(
    id,
    { botPaused: true, botPausedAt: now, botPausedBy: actorName, botPauseReason: reason || "Manual pause", needsMarcus: true },
    "lead_bot_paused",
    "Bot paused for this lead.",
    { reason }
  );
}

export async function resumeBotForLead(id: string, actorName = "Marcus") {
  return updateLead(
    id,
    { botPaused: false, botPauseReason: "", botPausedBy: actorName },
    "lead_bot_resumed",
    "Bot resumed for this lead.",
    { resumedBy: actorName }
  );
}

export async function markLeadNeedsMarcus(id: string, reason: string) {
  return updateLead(
    id,
    { needsMarcus: true, bossApprovalNeeded: true, leadLevel: "Needs Marcus", missionCategory: "Needs Marcus" },
    "lead_needs_marcus_marked",
    "Lead marked as needing Marcus attention.",
    { reason }
  );
}

export async function markLeadFollowedUp(id: string, actorName = "Marcus") {
  const now = new Date().toISOString();
  return updateLead(
    id,
    { followedUpAt: now, followedUpBy: actorName, needsMarcus: false },
    "lead_followed_up",
    "Lead marked as followed up.",
    { followedUpAt: now }
  );
}

export async function hardDeleteLead(id: string, reason: string) {
  const before = await getLeadById(id);
  if (!before?.deletedAt) {
    await createAuditLog({
      actorType: "boss",
      actorName: "Marcus",
      action: "lead_hard_delete_blocked",
      entityType: "lead",
      entityId: id,
      summary: "Permanent delete blocked because lead was not soft-deleted first.",
      beforeData: before ? { deletedAt: before.deletedAt ?? null } : null,
      afterData: null,
      metadata: { reason, hardDeleteRequiresSoftDeleteFirst: true }
    });
    return null;
  }

  await createAuditLog({
    actorType: "boss",
    actorName: "Marcus",
    action: "lead_hard_delete_pre_audit",
    entityType: "lead",
    entityId: id,
    summary: "Permanent lead deletion approved after prior soft delete.",
    beforeData: { id: before.id, clientName: before.clientName, deletedAt: before.deletedAt },
    afterData: null,
    metadata: { reason, auditBeforeDelete: true }
  });

  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    await supabase!.from("leads").delete().eq("id", id);
    return before;
  }

  const store = getMockStore();
  const index = store.leads.findIndex((item) => item.id === id);
  if (index >= 0) store.leads.splice(index, 1);
  return before;
}
