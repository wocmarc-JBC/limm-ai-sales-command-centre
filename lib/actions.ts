"use server";

import { revalidatePath } from "next/cache";
import { defaultAppointmentSettings } from "@/lib/appointment-engine";
import { requirePermission } from "@/lib/auth/session";
import { decideApprovalRequest } from "@/lib/data/approvals-repository";
import { saveAppointmentSettings } from "@/lib/data/appointment-settings-repository";
import { generateAndSaveAiDryRunRecommendation, recordAiDraftReviewAction } from "@/lib/data/ai-decisions-repository";
import { updateFollowUpStatus } from "@/lib/data/followups-repository";
import {
  markBossApprovalNeeded,
  markLeadNotSuitable,
  moveLeadToQuotationReadiness,
  updateLeadStatus
} from "@/lib/data/leads-repository";
import { updateQuotationReadinessStatus } from "@/lib/data/quotation-repository";
import { getOpenAiBrainRuntime } from "@/lib/openai-brain-config";
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

export async function decideApprovalAction(formData: FormData) {
  const permission = await requirePermission("approve_requests");
  if (!permission.ok) return;

  await decideApprovalRequest(text(formData, "approval_id"), text(formData, "decision") as ApprovalStatus, text(formData, "notes"));
  revalidatePath("/approvals");
  revalidatePath("/audit-log");
}

export async function updateFollowUpStatusAction(formData: FormData) {
  const permission = await requirePermission("manage_followups");
  if (!permission.ok) return;

  await updateFollowUpStatus(text(formData, "followup_id"), text(formData, "status") as FollowUpStatus, text(formData, "notes"));
  revalidatePath("/followups");
  revalidatePath("/audit-log");
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
