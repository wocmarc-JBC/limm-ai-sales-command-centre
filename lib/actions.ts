"use server";

import { revalidatePath } from "next/cache";
import { defaultAppointmentSettings } from "@/lib/appointment-engine";
import { requirePermission } from "@/lib/auth/session";
import { decideApprovalRequest } from "@/lib/data/approvals-repository";
import { saveAppointmentSettings } from "@/lib/data/appointment-settings-repository";
import { generateAndSaveAiDryRunRecommendation, recordAiDraftReviewAction } from "@/lib/data/ai-decisions-repository";
import { hideTestFollowUp, listFollowUps, updateFollowUpStatus } from "@/lib/data/followups-repository";
import {
  archiveLead,
  approveAppointmentBooking,
  getLeadById,
  hardDeleteLead,
  listLeads,
  markBossApprovalNeeded,
  markLeadAsDuplicate,
  markLeadAsSpam,
  markLeadAsTest,
  markLeadFollowedUp,
  markLeadNotSuitable,
  markLeadNeedsMarcus,
  moveLeadToQuotationReadiness,
  pauseBotForLead,
  recordCalendarEventCreateRequested,
  requestAppointmentMissingInfo,
  requestAppointmentReview,
  restoreLead,
  resumeBotForLead,
  softDeleteLead,
  takeOverLead,
  updateLeadIntakeProfile,
  updateLeadStatus
} from "@/lib/data/leads-repository";
import { updateQuotationReadinessStatus } from "@/lib/data/quotation-repository";
import { saveMonthlySalesTarget } from "@/lib/data/sales-collection-repository";
import { listLeadMessages } from "@/lib/data/lead-messages-repository";
import { getOpenAiBrainRuntime } from "@/lib/openai-brain-config";
import { buildLeadIntakePlan } from "@/lib/lead-intake";
import { currentMonthKey, defaultMonthlyTarget } from "@/lib/sales-collection";
import { buildTestFollowUpCleanupPlan, buildTestLeadCleanupPlan } from "@/lib/test-lead-cleanup";
import type { Permission } from "@/lib/auth/roles";
import type { AiDraftReviewStatus, ApprovalStatus, FollowUpStatus, LeadStatus, QuotationReadinessRecord } from "@/lib/types";

const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function text(formData: FormData, key: string, fallback = "") {
  return String(formData.get(key) ?? fallback);
}

function parseSlot(value: string, fallback: Array<{ start: string; end: string }>) {
  const slots = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [start, end] = item.split("-").map((part) => part.trim());
      return start && end ? { start, end } : null;
    })
    .filter((slot): slot is { start: string; end: string } => Boolean(slot));
  return slots.length ? slots : fallback;
}

export async function saveAppointmentSettingsAction(formData: FormData) {
  const permission = await requirePermission("edit_appointment_settings");
  if (!permission.ok) return;

  const current = defaultAppointmentSettings;
  const days = { ...current.days };
  for (const day of dayKeys) {
    days[day] = {
      enabled: formData.get(`day_enabled_${day}`) === "on",
      approvalRequired: formData.get(`day_approval_${day}`) === "on",
      slots: parseSlot(text(formData, `day_slots_${day}`), current.days[day].slots)
    };
  }

  const auditMarker = text(formData, "audit_marker");
  await saveAppointmentSettings(
    {
      ...current,
      timezone: text(formData, "timezone", current.timezone),
      minimumNoticeHours: Number(text(formData, "minimum_notice_hours", String(current.minimumNoticeHours))),
      maxAppointmentsPerDay: Number(text(formData, "max_per_day", String(current.maxAppointmentsPerDay))),
      bufferBetweenAppointmentsMinutes: Number(text(formData, "buffer_minutes", String(current.bufferBetweenAppointmentsMinutes))),
      sameDayBookingRule: text(formData, "same_day_rule", current.sameDayBookingRule) as typeof current.sameDayBookingRule,
      publicHolidayRule: text(formData, "public_holiday_rule", current.publicHolidayRule) as typeof current.publicHolidayRule,
      days
    },
    auditMarker ? { marker: auditMarker, source: "v4.3 browser-write QA" } : {}
  );
  revalidatePath("/appointment-settings");
  revalidatePath("/appointments");
  revalidatePath("/audit-log");
}

export async function updateLeadStatusAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  await updateLeadStatus(text(formData, "lead_id"), text(formData, "status") as LeadStatus);
  revalidatePath("/leads");
  revalidatePath(`/leads/${text(formData, "lead_id")}`);
  revalidatePath("/audit-log");
}

export async function saveLeadIntakeProfileAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  const lead = await getLeadById(leadId);
  if (!lead) return;

  const actor = permission.auth.profile?.fullName ?? "Marcus";
  const rawProfile = {
    ...(lead.intakeProfile ?? {}),
    lifestyleNotes: text(formData, "lifestyle_notes").trim(),
    occupants: text(formData, "occupants").trim(),
    helper: text(formData, "helper").trim(),
    pets: text(formData, "pets").trim(),
    safetyNeeds: text(formData, "safety_needs").trim(),
    budgetExpectation: text(formData, "budget_expectation").trim(),
    timeline: text(formData, "timeline").trim(),
    keyCollectionDate: text(formData, "key_collection_date").trim(),
    moveInDate: text(formData, "move_in_date").trim(),
    preferredMeetingTiming: text(formData, "preferred_meeting_timing").trim(),
    propertyType: text(formData, "property_type", lead.propertyType).trim(),
    propertyAreaOrAddress: text(formData, "property_area_or_address", lead.projectAddress || lead.propertyArea).trim(),
    scopeOfWork: text(formData, "scope_of_work", lead.scopeSummary).trim(),
    floorPlanStatus: text(formData, "floor_plan_status").trim(),
    sitePhotosStatus: text(formData, "site_photos_status").trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: actor
  };

  const leadMessages = await listLeadMessages(leadId);
  const plan = buildLeadIntakePlan({ ...lead, intakeProfile: rawProfile }, leadMessages);
  const profile = {
    ...plan.profile,
    updatedAt: rawProfile.updatedAt,
    updatedBy: actor
  };

  await updateLeadIntakeProfile(leadId, profile, {
    actor,
    changedFields: [
      "lifestyleNotes",
      "occupants",
      "helper",
      "pets",
      "safetyNeeds",
      "budgetExpectation",
      "timeline",
      "keyCollectionDate",
      "moveInDate",
      "preferredMeetingTiming",
      "propertyType",
      "propertyAreaOrAddress",
      "scopeOfWork",
      "floorPlanStatus",
      "sitePhotosStatus"
    ],
    completedFields: plan.completedFields,
    missingFields: plan.missingInfo,
    suggestedQuestions: plan.suggestedQuestions,
    suggestedQuestionCount: plan.suggestedQuestions.length,
    meetingReadinessScore: plan.meetingReadinessScore,
    proposalReadinessScore: plan.proposalReadinessScore,
    intakeTrace: profile.trace
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/audit-log");
}

export async function markBossApprovalNeededAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  await markBossApprovalNeeded(text(formData, "lead_id"));
  revalidatePath("/leads");
  revalidatePath(`/leads/${text(formData, "lead_id")}`);
  revalidatePath("/audit-log");
}

export async function markLeadNotSuitableAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  await markLeadNotSuitable(text(formData, "lead_id"));
  revalidatePath("/leads");
  revalidatePath(`/leads/${text(formData, "lead_id")}`);
  revalidatePath("/audit-log");
}

export async function moveLeadToQuotationReadinessAction(formData: FormData) {
  const permission = await requirePermission("update_quotation_readiness");
  if (!permission.ok) return;

  await moveLeadToQuotationReadiness(text(formData, "lead_id"));
  revalidatePath("/leads");
  revalidatePath(`/leads/${text(formData, "lead_id")}`);
  revalidatePath("/quotation-readiness");
  revalidatePath("/audit-log");
}

export async function requestAppointmentReviewAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  await requestAppointmentReview(leadId);
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/appointments");
  revalidatePath("/audit-log");
}

export async function approveAppointmentBookingAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  await approveAppointmentBooking(leadId);
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/appointments");
  revalidatePath("/audit-log");
}

export async function requestAppointmentMissingInfoAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  await requestAppointmentMissingInfo(leadId);
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/appointments");
  revalidatePath("/audit-log");
}

export async function requestCalendarEventCreateAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  await recordCalendarEventCreateRequested(leadId);
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/appointments");
  revalidatePath("/audit-log");
}

export async function decideApprovalAction(formData: FormData) {
  const permission = await requirePermission("approve_requests");
  if (!permission.ok) return;

  await decideApprovalRequest(text(formData, "approval_id"), text(formData, "decision") as ApprovalStatus, text(formData, "notes"));
  revalidatePath("/approvals");
  revalidatePath("/audit-log");
}

export async function updateFollowUpStatusAction(formData: FormData) {
  const permission = await requirePermission("manage_followups");
  if (!permission.ok) {
    return { ok: false, error: permission.error || "Permission denied." };
  }

  const result = await updateFollowUpStatus(text(formData, "followup_id"), text(formData, "status") as FollowUpStatus, text(formData, "notes"));
  revalidatePath("/followups");
  revalidatePath("/audit-log");
  if (!result) return { ok: false, error: "Follow-up update failed. Please refresh and try again." };
  return { ok: true, error: "" };
}

export async function updateQuotationReadinessAction(formData: FormData) {
  const permission = await requirePermission("update_quotation_readiness");
  if (!permission.ok) return;

  await updateQuotationReadinessStatus(
    text(formData, "readiness_id"),
    text(formData, "status") as QuotationReadinessRecord["status"]
  );
  revalidatePath("/quotation-readiness");
  revalidatePath("/audit-log");
}

export async function saveMonthlySalesTargetAction(formData: FormData) {
  const permission = await requirePermission("edit_settings");
  if (!permission.ok) return;

  const month = text(formData, "target_month", currentMonthKey());
  const base = defaultMonthlyTarget(month);
  await saveMonthlySalesTarget(
    {
      ...base,
      monthlySalesTarget: Number(text(formData, "monthly_sales_target", "0")),
      monthlyConfirmedJobsTarget: Number(text(formData, "monthly_confirmed_jobs_target", "0")),
      monthlySiteVisitTarget: Number(text(formData, "monthly_site_visit_target", "0")),
      monthlyQuotationTarget: Number(text(formData, "monthly_quotation_target", "0")),
      monthlyLandedLeadTarget: Number(text(formData, "monthly_landed_lead_target", "0")),
      monthlyCommercialLeadTarget: Number(text(formData, "monthly_commercial_lead_target", "0")),
      monthlyCollectionTarget: Number(text(formData, "monthly_collection_target", "0")),
      notes: text(formData, "notes")
    },
    permission.auth.profile?.fullName ?? "Marcus"
  );
  revalidatePath("/targets");
  revalidatePath("/sales-collection");
  revalidatePath("/reports");
  revalidatePath("/audit-log");
}

export async function generateAiDryRunRecommendationAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;
  const runtime = getOpenAiBrainRuntime();
  if (!runtime.dryRunEnabled) return;

  const leadId = text(formData, "lead_id");
  await generateAndSaveAiDryRunRecommendation(leadId);
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/audit-log");
}

export async function reviewAiDraftAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  const recommendationId = text(formData, "recommendation_id");
  const reviewStatus = text(formData, "review_status") as AiDraftReviewStatus;
  if (!leadId || !recommendationId || reviewStatus === "pending") return;

  await recordAiDraftReviewAction({
    leadId,
    recommendationId,
    reviewStatus: reviewStatus as Exclude<AiDraftReviewStatus, "pending">,
    notes: text(formData, "notes")
  });
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/audit-log");
}

function revalidateLeadPaths(leadId: string) {
  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/settings");
  revalidatePath("/audit-log");
}

export async function archiveLeadAction(formData: FormData) {
  const permission = await requirePermission("soft_delete_leads");
  if (!permission.ok) return;
  const leadId = text(formData, "lead_id");
  await archiveLead(leadId, text(formData, "reason", "Archived by Marcus/admin."), permission.auth.profile?.fullName ?? "Marcus");
  revalidateLeadPaths(leadId);
}

export async function softDeleteLeadAction(formData: FormData) {
  const permission = await requirePermission("soft_delete_leads");
  if (!permission.ok) return;
  const leadId = text(formData, "lead_id");
  await softDeleteLead(leadId, text(formData, "reason", "Soft deleted by Marcus/admin."), permission.auth.profile?.fullName ?? "Marcus");
  revalidateLeadPaths(leadId);
}

export async function restoreLeadAction(formData: FormData) {
  const permission = await requirePermission("restore_leads");
  if (!permission.ok) return;
  const leadId = text(formData, "lead_id");
  await restoreLead(leadId, permission.auth.profile?.fullName ?? "Marcus");
  revalidateLeadPaths(leadId);
}

export async function hardDeleteLeadAction(formData: FormData) {
  const permission = await requirePermission("hard_delete_leads");
  if (!permission.ok) return;
  const leadId = text(formData, "lead_id");
  const reason = text(formData, "reason");
  const confirmation = text(formData, "confirmation");
  if (!reason || confirmation !== "PERMANENT DELETE") return;
  await hardDeleteLead(leadId, reason);
  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/audit-log");
}

export async function markLeadTestAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;
  const leadId = text(formData, "lead_id");
  await markLeadAsTest(leadId);
  revalidateLeadPaths(leadId);
}

export async function markLeadSpamAction(formData: FormData) {
  const permission = await requirePermission("soft_delete_leads");
  if (!permission.ok) return;
  const leadId = text(formData, "lead_id");
  await markLeadAsSpam(leadId);
  revalidateLeadPaths(leadId);
}

export async function markLeadDuplicateAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;
  const leadId = text(formData, "lead_id");
  await markLeadAsDuplicate(leadId, text(formData, "duplicate_of"));
  revalidateLeadPaths(leadId);
}

export async function takeOverLeadAction(formData: FormData) {
  const permission = await requirePermission("control_bot");
  if (!permission.ok) return;
  const leadId = text(formData, "lead_id");
  await takeOverLead(leadId, permission.auth.profile?.fullName ?? "Marcus");
  revalidateLeadPaths(leadId);
}

export async function pauseBotForLeadAction(formData: FormData) {
  const permission = await requirePermission("control_bot");
  if (!permission.ok) return;
  const leadId = text(formData, "lead_id");
  await pauseBotForLead(leadId, text(formData, "reason", "Manual pause"), permission.auth.profile?.fullName ?? "Marcus");
  revalidateLeadPaths(leadId);
}

export async function resumeBotForLeadAction(formData: FormData) {
  const permission = await requirePermission("control_bot");
  if (!permission.ok) return;
  const leadId = text(formData, "lead_id");
  await resumeBotForLead(leadId, permission.auth.profile?.fullName ?? "Marcus");
  revalidateLeadPaths(leadId);
}

export async function markNeedsMarcusAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;
  const leadId = text(formData, "lead_id");
  await markLeadNeedsMarcus(leadId, text(formData, "reason", "Marked from command centre."));
  revalidateLeadPaths(leadId);
}

export async function markFollowedUpAction(formData: FormData) {
  const permission = await requirePermission("manage_followups");
  if (!permission.ok) return;
  const leadId = text(formData, "lead_id");
  await markLeadFollowedUp(leadId, permission.auth.profile?.fullName ?? "Marcus");
  revalidateLeadPaths(leadId);
}

export async function cleanupOldTestLeadsAction(formData: FormData) {
  const mode = text(formData, "cleanup_mode", "soft_delete");
  const permissionName: Permission = mode === "hard_delete_soft_deleted"
    ? "hard_delete_leads"
    : mode === "followups_only"
      ? "manage_followups"
      : "soft_delete_leads";
  const permission = await requirePermission(permissionName);
  if (!permission.ok) return;

  const leads = await listLeads({ includeInactive: true, includeTest: true });
  const messages = await Promise.all(leads.map(async (lead) => [lead.id, await listLeadMessages(lead.id)] as const));
  const plan = buildTestLeadCleanupPlan(leads, new Map(messages), { hardDeleteTestData: mode === "hard_delete_soft_deleted" });
  const followUps = await listFollowUps({ includeTest: true, includeCompleted: true, status: "all", pageSize: 500, scanAll: true });
  const followUpPlan = buildTestFollowUpCleanupPlan(followUps);
  const actor = permission.auth.profile?.fullName ?? "Marcus";

  if (mode !== "followups_only") {
    for (const item of plan) {
      if (mode === "hard_delete_soft_deleted") {
        if (item.action !== "hard_delete_test_data") continue;
        await hardDeleteLead(
          item.lead.id,
          `v6.1.5 in-app hard cleanup for already-soft-deleted test lead: ${[...item.reasons, ...item.weakReasons].join("; ") || "clearly identified test lead"}`
        );
      } else {
        if (item.action !== "mark_test_and_soft_delete") continue;
        await markLeadAsTest(item.lead.id);
        await softDeleteLead(
          item.lead.id,
          `v6.1.5 in-app cleanup: ${[...item.reasons, ...item.weakReasons].join("; ") || "clearly identified test lead"}`,
          actor
        );
      }
    }
  }

  if (mode !== "hard_delete_soft_deleted") {
    for (const item of followUpPlan) {
      if (item.action !== "hide_or_complete_test_followup") continue;
      await hideTestFollowUp(
        item.followUp.id,
        [...item.reasons, ...item.weakReasons].join("; ") || "clearly identified test follow-up"
      );
    }
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/followups");
  revalidatePath("/settings");
  revalidatePath("/audit-log");
}
