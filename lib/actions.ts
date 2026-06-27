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
  listLeadFiles,
  markLeadFileReviewed,
  markUploadLinkUsed,
  uploadLeadFile,
  voidLeadFile
} from "@/lib/data/lead-files-repository";
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
  updateLeadSalesTracking,
  updateLeadIntakeProfile,
  updateLeadStatus
} from "@/lib/data/leads-repository";
import { updateQuotationReadinessStatus } from "@/lib/data/quotation-repository";
import { saveMonthlySalesTarget } from "@/lib/data/sales-collection-repository";
import { listLeadMessages, saveLeadMessage } from "@/lib/data/lead-messages-repository";
import { getOpenAiBrainRuntime } from "@/lib/openai-brain-config";
import { buildLeadIntakePlan } from "@/lib/lead-intake";
import { currentMonthKey, defaultMonthlyTarget } from "@/lib/sales-collection";
import { buildTestFollowUpCleanupPlan, buildTestLeadCleanupPlan } from "@/lib/test-lead-cleanup";
import type { Permission } from "@/lib/auth/roles";
import type { AiDraftReviewStatus, ApprovalStatus, FollowUpStatus, LeadFileCategory, LeadStatus, QuotationReadinessRecord } from "@/lib/types";

const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function text(formData: FormData, key: string, fallback = "") {
  return String(formData.get(key) ?? fallback);
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
  const adapter = new WhatsAppCloudApiAdapter();
  const payloadSummary = getWhatsAppSendPayloadSummary(lead.phone, body);
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
  const adapter = new WhatsAppCloudApiAdapter();
  const payloadSummary = getWhatsAppSendPayloadSummary(to, body);
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
  const permission = await requirePermission("update_quotation_readiness");
  if (!permission.ok) return;

  const leadId = text(formData, "lead_id");
  const lead = await getLeadById(leadId);
  if (!lead) return;

  const result = await updateLeadSalesTracking(
    leadId,
    {
      salesStage: "Quotation Sent",
      quotationStatus: "Sent",
      quoteSentDate: `${singaporeDateKey()}T10:00:00+08:00`,
      quoteFollowUpDate: suggestedQuoteFollowUpDate(),
      salesNextAction: "Follow up quotation manually. Do not auto-send WhatsApp."
    },
    "Lead marked Quotation Sent manually after boss gate check."
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
