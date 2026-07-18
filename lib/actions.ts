"use server";

import { Buffer } from "node:buffer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defaultAppointmentSettings } from "@/lib/appointment-engine";
import { requirePermission } from "@/lib/auth/session";
import {
  bossReviewActionForKey,
  jobStartChecklistActionForKey,
  suggestedQuoteFollowUpDate
} from "@/lib/boss-ops";
import { singaporeDateKey } from "@/lib/date-safety";
import {
  getWhatsAppSendPayloadSummary,
  WhatsAppCloudApiAdapter,
  WhatsAppCloudApiSendError
} from "@/lib/adapters/whatsapp-adapter";
import { decideApprovalRequest } from "@/lib/data/approvals-repository";
import { saveAppointmentSettings } from "@/lib/data/appointment-settings-repository";
import { createAuditLog } from "@/lib/data/audit-repository";
import { generateAndSaveAiDryRunRecommendation, recordAiDraftReviewAction } from "@/lib/data/ai-decisions-repository";
import {
  LEAD_FILE_CATEGORIES,
  createLeadUploadLink,
  getUploadLinkByToken,
  listAllLeadFiles,
  listLeadFiles,
  markLeadFileReviewed,
  markUploadLinkUsed,
  restoreLeadFile,
  uploadLeadFile,
  voidLeadFile
} from "@/lib/data/lead-files-repository";
import { hideTestFollowUp, listFollowUps, updateFollowUpStatus } from "@/lib/data/followups-repository";
import {
  archiveLead,
  approveAppointmentBooking,
  createManualLead,
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
  setLeadConversationIntentOverride,
  softDeleteLead,
  takeOverLead,
  updateLeadSalesTracking,
  updateLeadIntakeProfile,
  updateLeadStatus
} from "@/lib/data/leads-repository";
import {
  buildQuotationSendGate,
  createQuotationPackage,
  getLatestActiveQuotationForLead,
  getQuotationPackageById,
  markQuotationClientAccepted,
  markQuotationClientRejected,
  markQuotationSent,
  qaSimulateQuotationAccepted,
  qaSimulateQuotationSent,
  recordQuotationBossDecision,
  submitQuotationForBossReview,
  updateQuotationReadinessStatus,
  uploadDraftQuotation,
  voidQuotationPackage
} from "@/lib/data/quotation-repository";
import {
  createQaTestCollectionSchedule,
  createQaTestProjectForQuotation,
  createDefaultPaymentScheduleForProject,
  createProjectFromWonLead,
  listPaymentRecords,
  markPaymentRecordReceived,
  restoreVoidedPaymentRecord,
  saveMonthlySalesTarget,
  voidPaymentRecord
} from "@/lib/data/sales-collection-repository";
import { listLeadMessages, saveLeadMessage } from "@/lib/data/lead-messages-repository";
import { getOpenAiBrainRuntime } from "@/lib/openai-brain-config";
import { buildLeadIntakePlan } from "@/lib/lead-intake";
import { isQaE2EMode, qaE2eSafetyMetadata } from "@/lib/qa-e2e-mode";
import { getQaWorkflowTestEligibility, qaWorkflowSafetyMetadata } from "@/lib/qa-workflow-test-mode";
import { currentMonthKey, defaultMonthlyTarget } from "@/lib/sales-collection";
import { setShowTestDemoRecordsPreference } from "@/lib/data-visibility-preference";
import { getProductionLeadVisibilityReasons } from "@/lib/production-visibility";
import {
  WHATSAPP_CONVERSATION_INTENTS,
  isSalesEligibleLead,
  type ConversationIntent
} from "@/lib/whatsapp-intent-gate";
import { buildTestFollowUpCleanupPlan, buildTestLeadCleanupPlan, isProtectedLead } from "@/lib/test-lead-cleanup";
import type { Permission } from "@/lib/auth/roles";
import type { AiDraftReviewStatus, ApprovalStatus, Division, FollowUpStatus, LeadCategory, LeadFileCategory, LeadStatus, QuotationReadinessRecord } from "@/lib/types";

const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const allowedQuotationMimeTypes = new Set([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
]);

function text(formData: FormData, key: string, fallback = "") {
  return String(formData.get(key) ?? fallback);
}

function numberValue(formData: FormData, key: string, fallback = 0) {
  const value = Number(text(formData, key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

function redirectToQuotationFailure(leadId: string, message: string): never {
  redirect(`/leads/${leadId}?quotationStatus=failed&message=${encodeURIComponent(message)}#quotation-package`);
}

function redirectToQuotationQaStatus(quotationId: string, status: string, message: string): never {
  redirect(`/quotations/${encodeURIComponent(quotationId)}?qaStatus=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}`);
}

function listValue(formData: FormData, key: string) {
  return text(formData, key)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeWhatsAppError(error: unknown) {
  if (error instanceof WhatsAppCloudApiSendError) {
    return [
      `Meta status ${error.status}`,
      error.metaCode ? `code ${error.metaCode}` : "",
      error.metaMessage ? error.metaMessage : ""
    ].filter(Boolean).join(" - ");
  }
  return error instanceof Error ? error.message : "Unknown WhatsApp send failure.";
}

function isNextRedirectError(error: unknown) {
  if (typeof error === "string") return /NEXT_REDIRECT/i.test(error);
  if (!error || typeof error !== "object") return false;
  const digest = "digest" in error ? (error as { digest?: unknown }).digest : undefined;
  const message = "message" in error ? (error as { message?: unknown }).message : undefined;
  return (
    (typeof digest === "string" && /NEXT_REDIRECT/i.test(digest)) ||
    (typeof message === "string" && /NEXT_REDIRECT/i.test(message))
  );
}

function leadReplyRedirect(leadId: string, params: Record<string, string>): never {
  const query = new URLSearchParams(params);
  redirect(`/leads/${encodeURIComponent(leadId)}?${query.toString()}`);
}

function manualReplyRedirect(formData: FormData, leadId: string, params: Record<string, string>): never {
  const query = new URLSearchParams(params);
  const returnTo = text(formData, "return_to").trim();
  if (returnTo === "inbox") redirect(`/inbox?lead=${encodeURIComponent(leadId)}&${query.toString()}`);
  leadReplyRedirect(leadId, params);
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

export async function setShowTestDemoRecordsAction(formData: FormData) {
  const permission = await requirePermission("edit_settings");
  if (!permission.ok) return;
  setShowTestDemoRecordsPreference(formData.get("show_test_demo_records") === "on");
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/sales-pipeline");
  revalidatePath("/approvals");
  revalidatePath("/delivery");
  revalidatePath("/sales-collection");
  redirect("/settings#data-visibility");
}

export async function createManualLeadAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) {
    redirect(`/leads/new?createStatus=failed&message=${encodeURIComponent(permission.error || "Permission denied.")}`);
  }

  const required = ["client_name", "phone", "source", "division", "property_type", "service_type", "scope_summary"];
  const missing = required.filter((key) => !text(formData, key).trim());
  if (missing.length) {
    redirect(`/leads/new?createStatus=failed&message=${encodeURIComponent(`Missing required fields: ${missing.join(", ")}`)}`);
  }

  let leadId = "";
  try {
    const lead = await createManualLead(
      {
        clientName: text(formData, "client_name"),
        phone: text(formData, "phone"),
        source: text(formData, "source", "Manual / Internal"),
        division: text(formData, "division", "LIMM Works") as Division,
        propertyType: text(formData, "property_type"),
        serviceType: text(formData, "service_type"),
        scopeSummary: text(formData, "scope_summary"),
        preferredContactTime: text(formData, "preferred_contact_time"),
        leadCategory: text(formData, "lead_category", "Warm") as LeadCategory,
        leadScore: numberValue(formData, "lead_score", 0),
        riskFlags: listValue(formData, "risk_flags"),
        missingInfo: listValue(formData, "missing_info"),
        isTest: formData.get("is_test") === "on",
        notes: text(formData, "notes")
      },
      permission.auth.profile?.fullName ?? "Marcus"
    );
    leadId = lead.id;

    revalidatePath("/");
    revalidatePath("/leads");
    revalidatePath(`/leads/${lead.id}`);
    revalidatePath("/audit-log");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual lead creation failed. No external action was sent.";
    redirect(`/leads/new?createStatus=failed&message=${encodeURIComponent(message.slice(0, 220))}`);
  }
  redirect(`/leads/${encodeURIComponent(leadId)}?created=1`);
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

export async function createLeadUploadLinkAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  const actor = permission.auth.profile?.fullName ?? "Marcus";
  const { token } = await createLeadUploadLink({ leadId, createdBy: actor, expiresInDays: 14, maxUploads: 20 });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/client-files");
  revalidatePath("/audit-log");
  redirect(`/leads/${leadId}?uploadLink=${encodeURIComponent(token)}`);
}

export async function markLeadFileReviewedAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  await markLeadFileReviewed({
    fileId: text(formData, "file_id"),
    reviewedBy: permission.auth.profile?.fullName ?? "Marcus"
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/client-files");
  revalidatePath("/audit-log");
}

export async function voidLeadFileAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  await voidLeadFile({
    fileId: text(formData, "file_id"),
    voidedBy: permission.auth.profile?.fullName ?? "Marcus",
    reason: text(formData, "void_reason", "Voided from lead detail.")
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/client-files");
  revalidatePath("/audit-log");
}

export async function uploadClientFileByTokenAction(formData: FormData) {
  const token = text(formData, "token");
  const category = text(formData, "file_category") as LeadFileCategory;
  const uploadLink = await getUploadLinkByToken(token).catch(() => null);
  if (!uploadLink) redirect(`/upload/${encodeURIComponent(token)}?error=invalid_or_expired`);
  if (!LEAD_FILE_CATEGORIES.includes(category)) redirect(`/upload/${encodeURIComponent(token)}?error=invalid_category`);
  const existingFiles = await listLeadFiles(uploadLink.leadId);
  const uploadLinkCount = existingFiles.filter((file) => file.source === "upload_link" && file.fileStatus !== "voided").length;
  if (uploadLinkCount >= uploadLink.maxUploads) redirect(`/upload/${encodeURIComponent(token)}?error=max_uploads`);

  const file = formData.get("file");
  if (!(file instanceof File) || !file.name) redirect(`/upload/${encodeURIComponent(token)}?error=no_file`);

  try {
    await uploadLeadFile({
      leadId: uploadLink.leadId,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      bytes: Buffer.from(await file.arrayBuffer()),
      fileCategory: category,
      source: "upload_link",
      uploadedBy: "Client upload link",
      notes: text(formData, "notes")
    });
    await markUploadLinkUsed(uploadLink.id);
  } catch {
    redirect(`/upload/${encodeURIComponent(token)}?error=upload_failed`);
  }

  revalidatePath(`/leads/${uploadLink.leadId}`);
  revalidatePath("/client-files");
  redirect(`/upload/${encodeURIComponent(token)}?uploaded=1`);
}

export async function sendManualWhatsAppReplyAction(formData: FormData) {
  const permission = await requirePermission("control_bot");
  const leadId = text(formData, "lead_id");
  if (!permission.ok) manualReplyRedirect(formData, leadId, { manualReplyStatus: "failed", manualReplyError: permission.error || "Permission denied." });

  const body = text(formData, "manual_reply_body").trim();
  if (!leadId) redirect("/leads?manualReplyStatus=failed&manualReplyError=Missing%20lead%20id");
  if (!body) manualReplyRedirect(formData, leadId, { manualReplyStatus: "failed", manualReplyError: "Reply message is empty." });

  const lead = await getLeadById(leadId);
  if (!lead) manualReplyRedirect(formData, leadId, { manualReplyStatus: "failed", manualReplyError: "Lead was not found." });

  const actor = permission.auth.profile?.fullName ?? "Marcus";
  const actorEmail = permission.auth.profile?.email ?? "";
  const actorId = permission.auth.profile?.id ?? null;
  const payloadSummary = getWhatsAppSendPayloadSummary(lead.phone, body);
  if (isQaE2EMode()) {
    await saveLeadMessage({
      leadId,
      direction: "outbound",
      body,
      safeToSend: false,
      whatsappStatus: "disabled",
      metadata: {
        manualReply: true,
        manualTakeover: true,
        replaySafePostRedirect: true,
        ...qaE2eSafetyMetadata()
      }
    });
    await takeOverLead(leadId, actor);
    await createAuditLog({
      actorName: actor,
      actorEmail,
      actorId,
      action: "whatsapp_manual_reply_qa_dry_run",
      entityType: "lead",
      entityId: leadId,
      summary: "QA_E2E_MODE recorded manual WhatsApp reply without external send.",
      metadata: {
        toDigitsLength: payloadSummary.toDigitsLength,
        bodyLength: payloadSummary.bodyLength,
        manualTakeover: true,
        ...qaE2eSafetyMetadata()
      }
    });
    revalidateLeadPaths(leadId);
    manualReplyRedirect(formData, leadId, { manualReplyStatus: "sent", metaMessageId: "qa-dry-run" });
  }

  const adapter = new WhatsAppCloudApiAdapter();
  console.info("whatsapp_manual_reply_send_payload_summary", {
    leadId,
    phoneNumberIdPresent: payloadSummary.phoneNumberIdPresent,
    toDigitsLength: payloadSummary.toDigitsLength,
    bodyLength: payloadSummary.bodyLength,
    hasMessagingProduct: payloadSummary.hasMessagingProduct,
    hasRecipientType: payloadSummary.hasRecipientType,
    hasTextBody: payloadSummary.hasTextBody,
    graphVersion: payloadSummary.graphVersion
  });

  try {
    const sent = await adapter.sendReply(lead.phone, body);
    console.info("whatsapp_manual_reply_sent", {
      leadId,
      providerMessageIdPresent: Boolean(sent.providerMessageId),
      toDigitsLength: payloadSummary.toDigitsLength,
      bodyLength: payloadSummary.bodyLength
    });
    await saveLeadMessage({
      leadId,
      direction: "outbound",
      body,
      safeToSend: true,
      providerMessageId: sent.providerMessageId || undefined,
      whatsappStatus: "sent",
      metadata: {
        manualReply: true,
        manualTakeover: true,
        sentBy: actor,
        mode: sent.mode,
        metaMessageId: sent.providerMessageId || "",
        replaySafePostRedirect: true,
        noAutoPricing: true,
        noCalendarBooking: true,
        noVoiceTranscription: true
      }
    });
    await takeOverLead(leadId, actor);
    await createAuditLog({
      actorName: actor,
      actorEmail,
      actorId,
      action: "whatsapp_manual_reply_sent",
      entityType: "lead",
      entityId: leadId,
      summary: "Manual WhatsApp reply sent by Marcus/admin and bot paused for human takeover.",
      metadata: {
        providerMessageIdPresent: Boolean(sent.providerMessageId),
        metaMessageId: sent.providerMessageId || "",
        toDigitsLength: payloadSummary.toDigitsLength,
        bodyLength: payloadSummary.bodyLength,
        manualTakeover: true,
        noTokenLogged: true
      }
    });
    revalidateLeadPaths(leadId);
    manualReplyRedirect(formData, leadId, { manualReplyStatus: "sent", metaMessageId: sent.providerMessageId || "recorded" });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const reason = safeWhatsAppError(error);
    console.error("whatsapp_manual_reply_failed", {
      leadId,
      reason,
      toDigitsLength: payloadSummary.toDigitsLength,
      bodyLength: payloadSummary.bodyLength
    });
    await saveLeadMessage({
      leadId,
      direction: "outbound",
      body,
      safeToSend: false,
      whatsappStatus: "failed",
      metadata: {
        manualReply: true,
        manualTakeover: true,
        failedBy: actor,
        error: reason,
        replaySafePostRedirect: true,
        noTokenLogged: true
      }
    }).catch(() => null);
    await pauseBotForLead(leadId, "Manual WhatsApp reply attempted; bot paused for human takeover.", actor).catch(() => null);
    await createAuditLog({
      actorName: actor,
      actorEmail,
      actorId,
      action: "whatsapp_manual_reply_failed",
      entityType: "lead",
      entityId: leadId,
      summary: "Manual WhatsApp reply failed. Error was shown in Command Centre without exposing secrets.",
      metadata: {
        error: reason,
        toDigitsLength: payloadSummary.toDigitsLength,
        bodyLength: payloadSummary.bodyLength,
        manualTakeover: true,
        noTokenLogged: true
      }
    }).catch(() => null);
    revalidateLeadPaths(leadId);
    manualReplyRedirect(formData, leadId, { manualReplyStatus: "failed", manualReplyError: reason.slice(0, 220) });
  }
}

export async function sendManualWhatsAppTestAction(formData: FormData) {
  const permission = await requirePermission("control_bot");
  const returnLeadId = text(formData, "lead_id");
  if (!permission.ok) leadReplyRedirect(returnLeadId, { manualTestStatus: "failed", manualTestError: permission.error || "Permission denied." });

  const to = text(formData, "test_recipient_phone").trim();
  const body = text(
    formData,
    "test_message_body",
    "LIMM Works manual WhatsApp test. Please ignore if this was not expected."
  ).trim();
  if (!to) leadReplyRedirect(returnLeadId, { manualTestStatus: "failed", manualTestError: "Test recipient phone is empty." });
  if (!body) leadReplyRedirect(returnLeadId, { manualTestStatus: "failed", manualTestError: "Test message is empty." });

  const actor = permission.auth.profile?.fullName ?? "Marcus";
  const actorEmail = permission.auth.profile?.email ?? "";
  const actorId = permission.auth.profile?.id ?? null;
  const payloadSummary = getWhatsAppSendPayloadSummary(to, body);
  if (isQaE2EMode()) {
    await createAuditLog({
      actorName: actor,
      actorEmail,
      actorId,
      action: "whatsapp_manual_test_qa_dry_run",
      entityType: "system",
      entityId: "whatsapp_manual_test",
      summary: "QA_E2E_MODE recorded manual WhatsApp test without external send.",
      metadata: {
        toDigitsLength: payloadSummary.toDigitsLength,
        bodyLength: payloadSummary.bodyLength,
        ...qaE2eSafetyMetadata()
      }
    });
    leadReplyRedirect(returnLeadId, { manualTestStatus: "sent", metaMessageId: "qa-dry-run" });
  }

  const adapter = new WhatsAppCloudApiAdapter();
  console.info("whatsapp_manual_test_send_payload_summary", {
    phoneNumberIdPresent: payloadSummary.phoneNumberIdPresent,
    toDigitsLength: payloadSummary.toDigitsLength,
    bodyLength: payloadSummary.bodyLength,
    hasMessagingProduct: payloadSummary.hasMessagingProduct,
    hasRecipientType: payloadSummary.hasRecipientType,
    hasTextBody: payloadSummary.hasTextBody,
    graphVersion: payloadSummary.graphVersion
  });

  try {
    const sent = await adapter.sendReply(to, body);
    await createAuditLog({
      actorName: actor,
      actorEmail,
      actorId,
      action: "whatsapp_manual_test_sent",
      entityType: "system",
      entityId: "whatsapp_manual_test",
      summary: "Manual WhatsApp test message sent before client reply.",
      metadata: {
        providerMessageIdPresent: Boolean(sent.providerMessageId),
        metaMessageId: sent.providerMessageId || "",
        toDigitsLength: payloadSummary.toDigitsLength,
        bodyLength: payloadSummary.bodyLength,
        noTokenLogged: true
      }
    });
    if (returnLeadId) {
      revalidateLeadPaths(returnLeadId);
      leadReplyRedirect(returnLeadId, { manualTestStatus: "sent", manualTestMetaMessageId: sent.providerMessageId || "recorded" });
    }
    redirect("/leads?manualTestStatus=sent");
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const reason = safeWhatsAppError(error);
    console.error("whatsapp_manual_test_failed", {
      reason,
      toDigitsLength: payloadSummary.toDigitsLength,
      bodyLength: payloadSummary.bodyLength
    });
    await createAuditLog({
      actorName: actor,
      actorEmail,
      actorId,
      action: "whatsapp_manual_test_failed",
      entityType: "system",
      entityId: "whatsapp_manual_test",
      summary: "Manual WhatsApp test message failed. Error was shown without exposing secrets.",
      metadata: {
        error: reason,
        toDigitsLength: payloadSummary.toDigitsLength,
        bodyLength: payloadSummary.bodyLength,
        noTokenLogged: true
      }
    }).catch(() => null);
    if (returnLeadId) leadReplyRedirect(returnLeadId, { manualTestStatus: "failed", manualTestError: reason.slice(0, 220) });
    redirect(`/leads?manualTestStatus=failed&manualTestError=${encodeURIComponent(reason.slice(0, 220))}`);
  }
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

export async function recordBossReviewAction(formData: FormData) {
  const permission = await requirePermission("approve_requests");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  const actionKey = text(formData, "action_key");
  const note = text(formData, "note", "Boss reviewed without extra note.").trim();
  const bossAction = bossReviewActionForKey(actionKey);
  if (!leadId || !bossAction) return;

  const lead = await getLeadById(leadId);
  if (!lead) return;

  const actor = permission.auth.profile?.fullName ?? "Marcus";
  const actorEmail = permission.auth.profile?.email ?? "";
  const actorId = permission.auth.profile?.id ?? null;

  await createAuditLog({
    actorType: "boss",
    actorName: actor,
    actorEmail,
    actorId,
    action: bossAction.auditAction,
    entityType: "lead",
    entityId: leadId,
    summary: bossAction.summary,
    beforeData: {
      status: lead.status,
      salesStage: lead.salesStage,
      quotationStatus: lead.quotationStatus,
      bossApprovalNeeded: lead.bossApprovalNeeded
    },
    afterData: null,
    metadata: {
      note,
      bossAction: bossAction.key,
      noWhatsAppSend: true,
      noCalendarBooking: true,
      noPriceGuideAutomation: true
    }
  });

  if (bossAction.key === "approve_quote") {
    await updateLeadSalesTracking(
      leadId,
      {
        bossApprovalNeeded: false,
        quotationStatus: lead.quotationStatus === "Sent" ? "Sent" : "Preparing",
        salesNextAction: "Boss approved the quote pack. Send quotation only after manual review."
      },
      "Boss approved quotation pack. No price was generated by the system."
    );
  } else if (bossAction.key === "reject_quote") {
    await updateLeadSalesTracking(
      leadId,
      {
        bossApprovalNeeded: true,
        quotationStatus: "Revision Requested",
        salesNextAction: "Revise quotation pack before any client-facing quote is sent."
      },
      "Boss rejected quotation pack and requested revision."
    );
  } else if (bossAction.key === "need_site_visit_first") {
    await updateLeadSalesTracking(
      leadId,
      {
        status: "Appointment Pending",
        salesStage: "Site Visit Needed",
        bossApprovalNeeded: true,
        salesNextAction: "Arrange site visit before quotation."
      },
      "Boss requires site visit before quotation."
    );
  } else if (bossAction.key === "ask_for_more_info") {
    await updateLeadSalesTracking(
      leadId,
      {
        status: "Awaiting Client",
        bossApprovalNeeded: true,
        salesNextAction: "Collect more information before quote review."
      },
      "Boss requested more information before quotation."
    );
  } else if (bossAction.key === "escalate_to_manager") {
    await updateLeadSalesTracking(
      leadId,
      {
        needsMarcus: true,
        bossApprovalNeeded: true,
        assignedTo: "Manager",
        salesNextAction: "Manager escalation required before next client-facing step."
      },
      "Boss escalated lead to manager review."
    );
  } else if (bossAction.key === "pause_bot") {
    await pauseBotForLead(leadId, note || "Boss review action: pause bot.", actor);
  } else if (bossAction.key === "human_takeover") {
    await takeOverLead(leadId, actor);
  }

  revalidateLeadPaths(leadId);
  revalidatePath("/approvals");
  revalidatePath("/quotation-readiness");
  revalidatePath("/sales-pipeline");
  revalidatePath("/audit-log");
}

export async function markQuotationSentAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  const quotationId = text(formData, "quotation_id");
  const lead = await getLeadById(leadId);
  if (!lead) return;

  const quotation = quotationId
    ? await getQuotationPackageById(quotationId)
    : await getLatestActiveQuotationForLead(leadId, { includeTestDemo: true });
  const actor = permission.auth.profile?.fullName ?? "Marcus";
  const gate = buildQuotationSendGate(quotation, lead);
  if (!quotation || !gate.canMarkSent) {
    await markQuotationSent(quotation?.id ?? quotationId, lead, actor);
    revalidateLeadPaths(leadId);
    revalidatePath("/quotations");
    revalidatePath("/approvals");
    revalidatePath("/audit-log");
    return;
  }

  const sent = await markQuotationSent(quotation.id, lead, actor);
  if (!sent.ok) {
    revalidateLeadPaths(leadId);
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${quotation.id}`);
    revalidatePath("/audit-log");
    return;
  }

  const result = await updateLeadSalesTracking(
    leadId,
    {
      salesStage: "Quotation Sent",
      quotationStatus: "Sent",
      quotedAmount: quotation.quotationAmount,
      quoteExpiryDate: quotation.expiryDate,
      quoteSentDate: `${singaporeDateKey()}T10:00:00+08:00`,
      quoteFollowUpDate: suggestedQuoteFollowUpDate(),
      salesNextAction: "Follow up quotation manually. Do not auto-send WhatsApp."
    },
    "Lead marked Quotation Sent manually after boss-approved quotation package check."
  );
  if (!result) {
    revalidatePath("/sales-pipeline");
    revalidatePath("/approvals");
    revalidatePath("/audit-log");
    return;
  }

  revalidateLeadPaths(leadId);
  revalidatePath("/sales-pipeline");
  revalidatePath("/sales-collection");
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quotation.id}`);
  revalidatePath("/audit-log");
}

export async function recordJobStartChecklistAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  const projectId = text(formData, "project_id");
  const checklistKey = text(formData, "checklist_key");
  const note = text(formData, "note", "Start checklist confirmed from Command Centre.").trim();
  const checklistAction = jobStartChecklistActionForKey(checklistKey);
  if (!leadId || !projectId || !checklistAction) return;

  await createAuditLog({
    actorType: "boss",
    actorName: permission.auth.profile?.fullName ?? "Marcus",
    actorEmail: permission.auth.profile?.email ?? "",
    actorId: permission.auth.profile?.id ?? null,
    action: checklistAction.auditAction,
    entityType: "lead",
    entityId: leadId,
    summary: `${checklistAction.label} recorded for project start gate.`,
    beforeData: null,
    afterData: {
      projectId,
      checklistKey,
      confirmed: true
    },
    metadata: {
      note,
      projectId,
      doNotStartGate: true
    }
  });

  revalidateLeadPaths(leadId);
  revalidatePath("/delivery");
  revalidatePath("/sales-collection");
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

export async function createQuotationPackageAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  const lead = await getLeadById(leadId);
  if (!lead) return;
  if (!isSalesEligibleLead(lead)) {
    redirectToQuotationFailure(leadId, "This conversation is routed outside the sales pipeline and cannot create a quotation package.");
  }

  const actor = permission.auth.profile?.fullName ?? "Marcus";
  const role = permission.auth.profile?.role ?? "sales";
  const internalCostEstimate = role === "boss" || role === "admin" ? numberValue(formData, "internal_cost_estimate", 0) : null;
  const marginEstimate = role === "boss" || role === "admin" ? numberValue(formData, "margin_estimate", 0) : null;
  const baseInput = {
    lead,
    quotationNumber: text(formData, "quotation_number"),
    quotationAmount: numberValue(formData, "quotation_amount", lead.quotedAmount ?? lead.potentialValue ?? 0),
    scopeSummary: text(formData, "scope_summary", lead.scopeSummary),
    preparedBy: text(formData, "prepared_by", actor),
    expiryDate: text(formData, "expiry_date") || null,
    bossNotes: text(formData, "boss_notes"),
    internalCostEstimate,
    marginEstimate,
    actorName: actor
  };

  const file = formData.get("file");
  const hasValidQuotationFile = file instanceof File && file.name.trim().length > 0 && file.size > 0;
  if (hasValidQuotationFile && !allowedQuotationMimeTypes.has((file.type || "application/octet-stream").toLowerCase())) {
    redirectToQuotationFailure(leadId, "Selected quotation file type is not supported. Please choose a PDF, Excel, Word, JPG, PNG, or WEBP file.");
  }

  const quotation = hasValidQuotationFile
    ? await uploadDraftQuotation({
        ...baseInput,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        bytes: Buffer.from(await file.arrayBuffer())
      })
    : await createQuotationPackage(baseInput);

  await updateLeadSalesTracking(
    leadId,
    {
      quotationStatus: "Preparing",
      quotedAmount: quotation.quotationAmount,
      quoteExpiryDate: quotation.expiryDate,
      quoteRevisionCount: quotation.versionNumber - 1,
      quoteNotes: quotation.bossNotes,
      salesNextAction: "Submit quotation package for boss review before any manual send."
    },
    "Quotation package prepared manually without price generation."
  );

  revalidateLeadPaths(leadId);
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quotation.id}`);
  revalidatePath("/approvals");
  revalidatePath("/audit-log");
  redirect(`/quotations/${quotation.id}?created=1`);
}

export async function submitQuotationForBossReviewAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;
  const quotationId = text(formData, "quotation_id");
  const quotation = await submitQuotationForBossReview(
    quotationId,
    permission.auth.profile?.fullName ?? "Marcus",
    text(formData, "note")
  );
  if (!quotation) return;
  await updateLeadSalesTracking(
    quotation.leadId,
    {
      bossApprovalNeeded: true,
      quotationStatus: "Preparing",
      salesNextAction: "Boss review pending for uploaded quotation package."
    },
    "Quotation package submitted for boss review."
  );
  revalidateLeadPaths(quotation.leadId);
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quotation.id}`);
  revalidatePath("/approvals");
  revalidatePath("/audit-log");
}

export async function recordQuotationBossAction(formData: FormData) {
  const permission = await requirePermission("approve_requests");
  if (!permission.ok) return;

  const quotationId = text(formData, "quotation_id");
  const actionKey = text(formData, "action_key");
  const note = text(formData, "note", "Boss reviewed without extra note.").trim();
  const quotation = await getQuotationPackageById(quotationId);
  if (!quotation) return;

  const actor = permission.auth.profile?.fullName ?? "Marcus";
  const role = permission.auth.profile?.role ?? "boss";
  const saved = await recordQuotationBossDecision({
    quotationId,
    actionKey,
    actorName: actor,
    actorRole: role,
    note
  });
  if (!saved) return;

  if (actionKey === "approve_quote") {
    await updateLeadSalesTracking(
      quotation.leadId,
      {
        bossApprovalNeeded: false,
        quotationStatus: "Preparing",
        quotedAmount: saved.quotationAmount,
        quoteExpiryDate: saved.expiryDate,
        salesNextAction: "Boss approved quote package. Mark sent manually only after final check."
      },
      "Boss approved a specific quotation package version. No send happened."
    );
  } else if (["request_revision", "ask_for_more_info", "need_site_visit_first", "reject_quote", "reject_hold"].includes(actionKey)) {
    await updateLeadSalesTracking(
      quotation.leadId,
      {
        bossApprovalNeeded: true,
        quotationStatus: "Revision Requested",
        salesNextAction: actionKey === "need_site_visit_first"
          ? "Arrange site visit before revising quotation."
          : "Revise quotation package before any client-facing send."
      },
      "Boss requested quotation revision, more info, site visit, or hold."
    );
  } else if (actionKey === "pause_bot") {
    await pauseBotForLead(quotation.leadId, note || "Boss paused bot from quotation package.", actor);
  } else if (actionKey === "human_takeover") {
    await takeOverLead(quotation.leadId, actor);
  }

  revalidateLeadPaths(quotation.leadId);
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quotation.id}`);
  revalidatePath("/approvals");
  revalidatePath("/audit-log");
}

export async function markQuoteAcceptedAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;
  const quotationId = text(formData, "quotation_id");
  const quotation = await markQuotationClientAccepted(
    quotationId,
    permission.auth.profile?.fullName ?? "Marcus",
    text(formData, "client_notes")
  );
  if (!quotation) return;
  const lead = await getLeadById(quotation.leadId);
  if (!lead) return;

  const actor = permission.auth.profile?.fullName ?? "Marcus";
  const updatedLead = await updateLeadSalesTracking(
    lead.id,
    {
      salesStage: "Won",
      quotationStatus: "Accepted",
      quotedAmount: quotation.quotationAmount,
      confirmedValue: quotation.quotationAmount,
      wonDate: new Date().toISOString(),
      salesNextAction: "Create project, collect deposit, and clear Do Not Start Gate before work starts."
    },
    "Client accepted quotation manually. Project/payment creation is audited and non-GST."
  );
  const project = updatedLead ? await createProjectFromWonLead(updatedLead, actor) : null;
  if (project && updatedLead) {
    await updateLeadSalesTracking(updatedLead.id, { projectId: project.id }, "Project/account linked after quote acceptance.");
    await createDefaultPaymentScheduleForProject(project, updatedLead, actor);
  }

  revalidateLeadPaths(quotation.leadId);
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quotation.id}`);
  revalidatePath("/sales-collection");
  revalidatePath("/delivery");
  revalidatePath("/audit-log");
}

async function requireQaQuotationWorkflowContext(formData: FormData) {
  const permission = await requirePermission("approve_requests");
  const quotationId = text(formData, "quotation_id");
  if (!quotationId) redirect(`/quotations?qaStatus=failed&message=${encodeURIComponent("Missing quotation id.")}`);
  if (!permission.ok) redirectToQuotationQaStatus(quotationId, "permissionDenied", permission.error || "QA workflow controls require boss/admin role.");

  const quotation = await getQuotationPackageById(quotationId);
  if (!quotation) redirectToQuotationQaStatus(quotationId, "failed", "Quotation package was not found.");
  const lead = await getLeadById(quotation.leadId);
  if (!lead) redirectToQuotationQaStatus(quotationId, "failed", "Quotation lead was not found.");

  const actor = permission.auth.profile?.fullName ?? "Marcus";
  const role = permission.auth.profile?.role ?? "boss";
  const eligibility = getQaWorkflowTestEligibility({ role, lead, quotation });
  if (!eligibility.eligible) {
    redirectToQuotationQaStatus(quotationId, "blocked", `QA workflow blocked: ${eligibility.reasons.join(" ")}`);
  }
  return { permission, quotation, lead, actor, role };
}

function revalidateQaQuotationWorkflowPaths(leadId: string, quotationId: string) {
  revalidateLeadPaths(leadId);
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/sales-collection");
  revalidatePath("/delivery");
  revalidatePath("/audit-log");
}

export async function qaMarkSentSimulationAction(formData: FormData) {
  const { quotation, lead, actor, role } = await requireQaQuotationWorkflowContext(formData);
  const result = await qaSimulateQuotationSent({
    quotationId: quotation.id,
    lead,
    actorName: actor,
    actorRole: role
  });
  if (!result.ok || !result.quotation) {
    redirectToQuotationQaStatus(quotation.id, "failed", result.error || "QA Mark Sent simulation failed.");
  }

  await updateLeadSalesTracking(
    lead.id,
    {
      isTest: true,
      salesStage: "Quotation Sent",
      quotationStatus: "Sent",
      quotedAmount: result.quotation.quotationAmount,
      quoteExpiryDate: result.quotation.expiryDate,
      quoteSentDate: `${singaporeDateKey()}T10:00:00+08:00`,
      quoteFollowUpDate: suggestedQuoteFollowUpDate(),
      salesNextAction: "QA sent simulation only. No WhatsApp/email/calendar action was sent."
    },
    "QA Mark Sent simulation recorded without using the real Send Gate or external sends."
  );

  revalidateQaQuotationWorkflowPaths(lead.id, quotation.id);
  redirectToQuotationQaStatus(quotation.id, "sentSimulated", "QA Mark Sent simulated. No WhatsApp/email/calendar action was sent.");
}

export async function qaMarkAcceptedSimulationAction(formData: FormData) {
  const { quotation, lead, actor, role } = await requireQaQuotationWorkflowContext(formData);
  const accepted = await qaSimulateQuotationAccepted({
    quotationId: quotation.id,
    lead,
    actorName: actor,
    actorRole: role,
    note: "QA accepted simulation only. Not a real client acceptance."
  });
  if (!accepted.ok || !accepted.quotation) {
    redirectToQuotationQaStatus(quotation.id, "failed", accepted.error || "QA Mark Accepted simulation failed.");
  }

  const updatedLead = await updateLeadSalesTracking(
    lead.id,
    {
      isTest: true,
      salesStage: "Won",
      quotationStatus: "Accepted",
      quotedAmount: accepted.quotation.quotationAmount,
      confirmedValue: accepted.quotation.quotationAmount,
      wonDate: new Date().toISOString(),
      salesNextAction: "QA accepted simulation only. Downstream records are test-marked and hidden by default."
    },
    "QA quote accepted simulation recorded. No external action was sent."
  );
  const qaLead = updatedLead ?? { ...lead, isTest: true, confirmedValue: accepted.quotation.quotationAmount };
  const project = await createQaTestProjectForQuotation(qaLead, accepted.quotation, actor);
  await updateLeadSalesTracking(lead.id, { projectId: project.id, isTest: true }, "QA project/account linked after simulated acceptance.");
  await createQaTestCollectionSchedule(project, qaLead, actor);

  revalidateQaQuotationWorkflowPaths(lead.id, quotation.id);
  redirectToQuotationQaStatus(quotation.id, "acceptedSimulated", "QA quote accepted simulation complete. Test project and payment schedule are hidden by default.");
}

export async function qaCreateTestCollectionScheduleAction(formData: FormData) {
  const { quotation, lead, actor } = await requireQaQuotationWorkflowContext(formData);
  const project = await createQaTestProjectForQuotation(lead, quotation, actor);
  await createQaTestCollectionSchedule(project, { ...lead, isTest: true }, actor);
  await updateLeadSalesTracking(lead.id, { projectId: project.id, isTest: true }, "QA collection schedule linked to test project.");
  revalidateQaQuotationWorkflowPaths(lead.id, quotation.id);
  redirectToQuotationQaStatus(quotation.id, "collectionCreated", "QA test collection schedule created and hidden from normal queues.");
}

export async function qaCreateTestDeliveryGateAction(formData: FormData) {
  const { quotation, lead, actor } = await requireQaQuotationWorkflowContext(formData);
  const project = await createQaTestProjectForQuotation(lead, quotation, actor);
  await updateLeadSalesTracking(lead.id, { projectId: project.id, isTest: true }, "QA delivery gate linked to test project.");
  revalidateQaQuotationWorkflowPaths(lead.id, quotation.id);
  redirectToQuotationQaStatus(quotation.id, "deliveryCreated", "QA test delivery gate created and hidden from normal delivery view.");
}

export async function qaArchiveQaLeadAction(formData: FormData) {
  const { quotation, lead, actor, permission } = await requireQaQuotationWorkflowContext(formData);
  await archiveLead(lead.id, "QA workflow test complete. Soft archive only; no hard delete.", actor);
  await createAuditLog({
    actorType: permission.auth.profile?.role ?? "boss",
    actorName: actor,
    actorEmail: permission.auth.profile?.email ?? "",
    actorId: permission.auth.profile?.id ?? null,
    action: "qa_lead_archived",
    entityType: "lead",
    entityId: lead.id,
    summary: "QA lead archived after workflow test. No hard delete was performed.",
    beforeData: { archivedAt: lead.archivedAt ?? null, deletedAt: lead.deletedAt ?? null },
    afterData: { archived: true, hardDeleted: false },
    metadata: { quotationId: quotation.id, ...qaWorkflowSafetyMetadata }
  });
  revalidateQaQuotationWorkflowPaths(lead.id, quotation.id);
  redirectToQuotationQaStatus(quotation.id, "leadArchived", "QA lead archived. No hard delete was performed.");
}

export async function markQuoteRejectedAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;
  const quotation = await markQuotationClientRejected(
    text(formData, "quotation_id"),
    permission.auth.profile?.fullName ?? "Marcus",
    text(formData, "client_notes")
  );
  if (!quotation) return;
  await updateLeadSalesTracking(
    quotation.leadId,
    {
      quotationStatus: "Rejected",
      salesStage: "Lost",
      lostDate: new Date().toISOString(),
      wonLostReason: text(formData, "client_notes", "Client rejected quotation."),
      salesNextAction: "Review lost reason before reactivation."
    },
    "Client rejected quotation manually."
  );
  revalidateLeadPaths(quotation.leadId);
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quotation.id}`);
  revalidatePath("/sales-pipeline");
  revalidatePath("/audit-log");
}

export async function voidQuotationPackageAction(formData: FormData) {
  const permission = await requirePermission("approve_requests");
  if (!permission.ok) return;
  const quotation = await voidQuotationPackage(
    text(formData, "quotation_id"),
    permission.auth.profile?.fullName ?? "Marcus",
    text(formData, "void_reason", "Voided from quotation workflow.")
  );
  if (!quotation) return;
  revalidateLeadPaths(quotation.leadId);
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quotation.id}`);
  revalidatePath("/approvals");
  revalidatePath("/audit-log");
}

export async function recordPaymentReceivedAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;
  await markPaymentRecordReceived(text(formData, "payment_id"), permission.auth.profile?.fullName ?? "Marcus");
  revalidatePath("/sales-collection");
  revalidatePath("/delivery");
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
  revalidatePath("/inbox");
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/settings");
  revalidatePath("/audit-log");
}

export async function setLeadConversationIntentOverrideAction(formData: FormData) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok) return;
  const leadId = text(formData, "lead_id");
  const requested = text(formData, "conversation_intent").trim();
  if (requested && !WHATSAPP_CONVERSATION_INTENTS.includes(requested as ConversationIntent)) return;
  const intent = requested ? requested as ConversationIntent : null;
  await setLeadConversationIntentOverride(
    leadId,
    intent,
    permission.auth.profile?.fullName ?? "Marcus"
  );
  revalidateLeadPaths(leadId);
  revalidatePath("/followups");
  revalidatePath("/quotation-readiness");
  revalidatePath("/reports");
}

export async function archiveLeadAction(formData: FormData) {
  const leadId = text(formData, "lead_id");
  const permission = await requirePermission("soft_delete_leads");
  if (!permission.ok) leadReplyRedirect(leadId, { deleteStatus: "permissionDenied" });
  await archiveLead(leadId, text(formData, "reason", "Archived by Marcus/admin."), permission.auth.profile?.fullName ?? "Marcus");
  revalidateLeadPaths(leadId);
  leadReplyRedirect(leadId, { deleteStatus: "softDeleted" });
}

export async function softDeleteLeadAction(formData: FormData) {
  const leadId = text(formData, "lead_id");
  const permission = await requirePermission("soft_delete_leads");
  if (!permission.ok) leadReplyRedirect(leadId, { deleteStatus: "permissionDenied" });
  await softDeleteLead(leadId, text(formData, "reason", "Soft deleted by Marcus/admin."), permission.auth.profile?.fullName ?? "Marcus");
  revalidateLeadPaths(leadId);
  leadReplyRedirect(leadId, { deleteStatus: "softDeleted" });
}

export async function restoreLeadAction(formData: FormData) {
  const leadId = text(formData, "lead_id");
  const permission = await requirePermission("restore_leads");
  if (!permission.ok) leadReplyRedirect(leadId, { deleteStatus: "permissionDenied" });
  await restoreLead(leadId, permission.auth.profile?.fullName ?? "Marcus");
  revalidateLeadPaths(leadId);
  leadReplyRedirect(leadId, { deleteStatus: "restored" });
}

export async function hardDeleteLeadAction(formData: FormData) {
  const leadId = text(formData, "lead_id");
  const permission = await requirePermission("hard_delete_leads");
  if (!permission.ok) leadReplyRedirect(leadId, { deleteStatus: "permissionDenied" });
  const reason = text(formData, "reason");
  const confirmation = text(formData, "confirmation");
  const lead = await getLeadById(leadId);
  if (!lead?.deletedAt || !reason || confirmation !== "PERMANENT DELETE") {
    leadReplyRedirect(leadId, { deleteStatus: "failed" });
  }
  const deleted = await hardDeleteLead(leadId, reason);
  if (!deleted) leadReplyRedirect(leadId, { deleteStatus: "failed" });
  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/audit-log");
  redirect(`/leads?deleteStatus=hardDeleted`);
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

  const leads = await listLeads({ includeInactive: true, includeTest: true, includeNonSales: true });
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

export async function softArchiveProductionNoiseRecordsAction(formData: FormData) {
  const permission = await requirePermission("soft_delete_leads");
  if (!permission.ok) return;
  const selectedLeadIds = new Set(formData.getAll("lead_id").map((value) => String(value)));
  if (!selectedLeadIds.size) {
    redirect("/settings/production-data-cleanup?archived=0");
  }

  const actor = permission.auth.profile?.fullName ?? "Marcus";
  const leads = await listLeads({ includeInactive: true, includeTest: true, includeNonSales: true });
  let archived = 0;

  for (const lead of leads) {
    if (!selectedLeadIds.has(lead.id)) continue;
    if (lead.archivedAt || lead.deletedAt || isProtectedLead(lead)) continue;
    const reasons = getProductionLeadVisibilityReasons(lead);
    if (!reasons.length) continue;
    await markLeadAsTest(lead.id);
    await archiveLead(
      lead.id,
      `Production visibility cleanup, soft archive only: ${reasons.join("; ")}`,
      actor
    );
    archived += 1;
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/settings");
  revalidatePath("/settings/production-data-cleanup");
  revalidatePath("/sales-pipeline");
  revalidatePath("/approvals");
  revalidatePath("/delivery");
  revalidatePath("/sales-collection");
  revalidatePath("/audit-log");
  redirect(`/settings/production-data-cleanup?archived=${archived}`);
}

export async function dataHygieneCleanupAction(formData: FormData) {
  const permission = await requirePermission("soft_delete_leads");
  if (!permission.ok) return;

  const selectedRefs = formData.getAll("record_ref").map((value) => String(value));
  const cleanupAction = text(formData, "cleanup_action", "hide");
  const actor = permission.auth.profile?.fullName ?? "Marcus";
  if (!selectedRefs.length) redirect("/data-hygiene?changed=0");

  const leads = await listLeads({ includeInactive: true, includeTest: true, includeNonSales: true });
  const payments = await listPaymentRecords({ includeTestDemo: true });
  const files = await listAllLeadFiles();
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const fileById = new Map(files.map((file) => [file.id, file]));
  let changed = 0;

  for (const ref of selectedRefs) {
    const [type, id] = ref.split(":");
    if (!type || !id) continue;

    if (type === "lead") {
      const lead = leadById.get(id);
      if (!lead) continue;
      if (cleanupAction === "restore") {
        await restoreLead(id, actor);
      } else {
        await markLeadAsTest(id);
        if (!lead.archivedAt && !lead.deletedAt) {
          await archiveLead(id, `Data Hygiene ${cleanupAction}: soft archive only.`, actor);
        }
      }
      changed += 1;
      continue;
    }

    if (type === "payment") {
      const payment = paymentById.get(id);
      if (!payment) continue;
      if (cleanupAction === "restore") {
        await restoreVoidedPaymentRecord(id, actor);
      } else if (!payment.voidedAt) {
        await voidPaymentRecord(payment, `Data Hygiene ${cleanupAction}: soft hidden from dashboards.`, actor);
      }
      changed += 1;
      continue;
    }

    if (type === "client_file") {
      const file = fileById.get(id);
      if (!file) continue;
      if (cleanupAction === "restore") {
        await restoreLeadFile({ fileId: id, restoredBy: actor });
      } else if (file.fileStatus !== "voided") {
        await voidLeadFile({ fileId: id, voidedBy: actor, reason: `Data Hygiene ${cleanupAction}: soft hidden from dashboards.` });
      }
      changed += 1;
      continue;
    }

    await createAuditLog({
      actorType: "admin",
      actorName: actor,
      actorEmail: permission.auth.profile?.email ?? "",
      actorId: permission.auth.profile?.id ?? null,
      action: cleanupAction === "restore" ? "data_hygiene_restore_reviewed" : "data_hygiene_dashboard_hide_recorded",
      entityType: type,
      entityId: id,
      summary: cleanupAction === "restore"
        ? "Record reviewed for restore. No hard delete was performed."
        : "Record confirmed as hidden from production dashboards by strict visibility filters.",
      beforeData: null,
      afterData: null,
      metadata: {
        recordRef: ref,
        cleanupAction,
        noHardDelete: true,
        softArchiveOnly: true
      }
    });
    changed += 1;
  }

  revalidatePath("/");
  revalidatePath("/data-hygiene");
  revalidatePath("/settings");
  revalidatePath("/sales-pipeline");
  revalidatePath("/approvals");
  revalidatePath("/delivery");
  revalidatePath("/sales-collection");
  revalidatePath("/client-files");
  revalidatePath("/reports");
  revalidatePath("/targets");
  revalidatePath("/audit-log");
  redirect(`/data-hygiene?changed=${changed}`);
}
