import { createAuditLog } from "./audit-repository";
import { getDataMode } from "./data-source";
import { mapLeadRow } from "./mappers";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseServerClient } from "./supabase-server";
import { scoreTestLead } from "@/lib/test-lead-cleanup";
import type { Lead, LeadIntakeProfile, LeadStatus } from "@/lib/types";

type ListLeadsOptions = { includeInactive?: boolean; includeTest?: boolean };

function shouldShowLead(lead: Lead, options?: ListLeadsOptions) {
  if (!options?.includeInactive && (lead.deletedAt || lead.archivedAt || lead.isSpam)) return false;
  if (!options?.includeTest && lead.isTest) return false;
  if (!options?.includeTest && scoreTestLead(lead).clearlyTest) return false;
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
    ["intakeProfile", "intake_profile"]
  ];
  for (const [key, column] of optional) {
    if (key in patch) row[column] = patch[key];
  }
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

export async function listLeads(options?: ListLeadsOptions) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
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
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!.from("leads").select("*").eq("id", id).maybeSingle();
    if (!error && data) return mapLeadRow(data);
  }

  const lead = getMockStore().leads.find((item) => item.id === id) ?? null;
  return lead ? mockClone(lead) : null;
}

async function updateLead(id: string, patch: Partial<Lead>, action: string, summary: string, metadata: Record<string, unknown> = {}) {
  const before = await getLeadById(id);
  const now = new Date().toISOString();

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("leads")
      .update(leadPatchToRow(patch, now))
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (!error && data) {
      const after = mapLeadRow(data);
      await createAuditLog({
        actorType: "boss",
        actorName: "Marcus",
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
  }

  const store = getMockStore();
  const index = store.leads.findIndex((item) => item.id === id);
  if (index === -1) return null;
  store.leads[index] = { ...store.leads[index], ...patch, updatedAt: now };
  const after = store.leads[index];
  await createAuditLog({
    actorType: "boss",
    actorName: "Marcus",
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

export async function updateLeadStatus(id: string, status: LeadStatus) {
  return updateLead(id, { status }, "lead_status_updated", `Lead status updated to ${status}.`);
}

export async function updateLeadSalesTracking(id: string, patch: Partial<Lead>, reason = "Sales tracking updated.") {
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
      restoredAt: now,
      restoredBy: actorName
    },
    "lead_restored",
    "Lead restored to active command queues.",
    { restoredAt: now }
  );
}

export async function markLeadAsTest(id: string) {
  return updateLead(id, { isTest: true, leadLevel: "Spam/Test", missionCategory: "Test/Spam Cleanup" }, "lead_marked_test", "Lead marked as test data.");
}

export async function markLeadAsSpam(id: string) {
  return updateLead(id, { isSpam: true, leadLevel: "Spam/Test", missionCategory: "Test/Spam Cleanup" }, "lead_marked_spam", "Lead marked as spam and hidden from active queue.");
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
  return updateLead(
    id,
    {
      status: "Awaiting Client",
      botPaused: true,
      botPausedAt: now,
      botPausedBy: actorName,
      botPauseReason: "Human takeover",
      needsMarcus: false,
      bossApprovalNeeded: false
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
    const supabase = getSupabaseServerClient();
    await supabase!.from("leads").delete().eq("id", id);
    return before;
  }

  const store = getMockStore();
  const index = store.leads.findIndex((item) => item.id === id);
  if (index >= 0) store.leads.splice(index, 1);
  return before;
}
