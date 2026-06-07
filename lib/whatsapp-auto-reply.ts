import "server-only";

import {
  getWhatsAppSendPayloadSummary,
  WhatsAppCloudApiAdapter,
  WhatsAppCloudApiSendError,
  type WhatsAppAdapter
} from "@/lib/adapters/whatsapp-adapter";
import { createAuditLog } from "@/lib/data/audit-repository";
import {
  countRecentWhatsAppAutoReplies,
  findLeadMessageByProviderId,
  listRecentLeadMessagesForWebhook,
  saveLeadMessage,
  upsertWhatsAppLead
} from "@/lib/data/lead-messages-repository";
import { getWhatsAppRuntime, normalizeWhatsAppPhone } from "@/lib/whatsapp-config";
import { processWhatsAppHandoffEmail } from "@/lib/handoff-email";
import { storeWhatsAppMediaForLead } from "@/lib/whatsapp-media-storage";
import type { ParsedWhatsAppMessage } from "@/lib/whatsapp-parser";
import { buildWhatsAppReplyDecision, type WhatsAppReplyDecision } from "@/lib/whatsapp-reply-decision";
import { validateWhatsAppAutoReply, WHATSAPP_ULTRA_SAFE_FALLBACK_REPLY } from "@/lib/whatsapp-safety";

export type WhatsAppInboundHandleResult = {
  providerMessageId: string;
  leadId?: string;
  status:
    | "ignored_duplicate"
    | "ignored_disabled"
    | "ignored_own_number"
    | "saved_inbound"
    | "auto_reply_sent"
    | "auto_reply_blocked"
    | "auto_reply_disabled"
    | "auto_reply_failed";
  reason: string;
  reply?: string;
};

function tenMinutesAgoIso() {
  return new Date(Date.now() - 10 * 60 * 1000).toISOString();
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown WhatsApp webhook failure";
}

function safeSendErrorMetadata(error: unknown) {
  if (error instanceof WhatsAppCloudApiSendError) {
    return {
      status: error.status,
      metaCode: error.metaCode ?? "",
      metaMessage: error.metaMessage ?? "",
      metaType: error.metaType ?? ""
    };
  }

  return {
    status: "",
    metaCode: "",
    metaMessage: safeError(error),
    metaType: ""
  };
}

function logWhatsApp(stage: string, metadata: Record<string, unknown> = {}) {
  console.info(stage, metadata);
}

function logWhatsAppError(stage: string, metadata: Record<string, unknown> = {}) {
  console.error("whatsapp_webhook_error", { stage, ...metadata });
}

function canBuildReplyDecision(message: ParsedWhatsAppMessage) {
  const type = message.type.toLowerCase();
  if (type === "text") return Boolean(message.text.trim());
  if (type === "audio" || type === "voice") return true;
  if (["image", "document", "video"].includes(type)) return Boolean(message.text.trim());
  return false;
}

async function auditWhatsApp(input: {
  action: string;
  leadId: string;
  summary: string;
  metadata?: Record<string, unknown>;
  afterData?: Record<string, unknown> | null;
}) {
  const runtime = getWhatsAppRuntime();
  try {
    await createAuditLog({
      actorType: "system",
      actorName: "WhatsApp Sales Brain",
      action: input.action,
      entityType: "lead",
      entityId: input.leadId,
      summary: input.summary,
      beforeData: null,
      afterData: input.afterData ?? null,
      metadata: {
        channel: "whatsapp",
        closedTest: runtime.closedTestAutoReplyAllowed,
        marcusApprovedLiveMode: runtime.liveAutoReplyApproved,
        publicAutoReplyEnabled: runtime.publicAutoReplyEnabled,
        testMode: runtime.testMode,
        autoReplyModeAllowed: runtime.autoReplyModeAllowed,
        noCalendarBooking: true,
        noPricing: true,
        ...(input.metadata ?? {})
      }
    });
  } catch (error) {
    logWhatsAppError("audit_insert", { action: input.action, leadId: input.leadId, reason: safeError(error) });
    throw error;
  }
  logWhatsApp("whatsapp_audit_written", { action: input.action, leadId: input.leadId });
}

async function auditReplyDecisionTrace(input: {
  leadId: string;
  providerMessageId: string;
  decision: WhatsAppReplyDecision;
}) {
  const metadata = {
    providerMessageId: input.providerMessageId,
    ...input.decision.blackBoxTrace
  };
  const events = [
    ["whatsapp_reply_decision_started", "WhatsApp reply decision started."],
    ["whatsapp_sales_brain_classified", "WhatsApp sales brain classified the inbound message."],
    ["whatsapp_conversation_stage_detected", "WhatsApp conversation stage detected."],
    ["whatsapp_sales_move_selected", "WhatsApp sales move selected."],
    ["whatsapp_reply_candidate_created", "WhatsApp reply candidate created."],
    ["whatsapp_reply_safety_checked", "WhatsApp reply safety checked."],
    ["whatsapp_reply_repetition_checked", "WhatsApp reply repetition checked."],
    ["whatsapp_reply_quality_checked", "WhatsApp reply quality checked."],
    ["whatsapp_no_silence_guard_checked", "WhatsApp no-silence guard checked."],
    ["whatsapp_reply_finalized", "WhatsApp reply decision finalized."]
  ] as const;

  for (const [action, summary] of events) {
    await auditWhatsApp({
      action,
      leadId: input.leadId,
      summary,
      metadata
    });
  }

  if (input.decision.noSilenceGuardResult === "used") {
    await auditWhatsApp({
      action: "whatsapp_no_silence_fallback_used",
      leadId: input.leadId,
      summary: "WhatsApp no-silence fallback was used to avoid an empty reply.",
      metadata
    });
  }

  if (input.decision.handoffRequired) {
    await auditWhatsApp({
      action: "whatsapp_handoff_required",
      leadId: input.leadId,
      summary: "WhatsApp reply marked the conversation for Marcus or manager review.",
      metadata
    });
  }

  if (input.decision.blackBoxTrace.portfolioRequestDetected) {
    await auditWhatsApp({
      action: "whatsapp_portfolio_follow_up_trace",
      leadId: input.leadId,
      summary: "Client requested past works or portfolio references; trace recorded for human follow-up if relevant.",
      metadata
    });
  }
}

export async function handleWhatsAppInboundMessage(
  message: ParsedWhatsAppMessage,
  adapter: WhatsAppAdapter = new WhatsAppCloudApiAdapter()
): Promise<WhatsAppInboundHandleResult> {
  const runtime = getWhatsAppRuntime();
  const providerMessageId = message.providerMessageId || `missing-provider-id-${Date.now()}`;
  const senderPhone = normalizeWhatsAppPhone(message.senderPhone);

  logWhatsApp("whatsapp_auto_reply_enabled_state", {
    providerMessageId,
    liveInboundEnabled: runtime.liveInboundEnabled,
    testAutoReplyEnabled: runtime.testAutoReplyEnabled,
    publicAutoReplyEnabled: runtime.publicAutoReplyEnabled,
    testMode: runtime.testMode,
    credentialsReady: runtime.credentialsReady
  });

  if (!runtime.liveInboundEnabled) {
    logWhatsApp("whatsapp_auto_reply_disabled", { providerMessageId, reason: "WHATSAPP_LIVE_INBOUND_ENABLED=false" });
    return {
      providerMessageId,
      status: "ignored_disabled",
      reason: "WHATSAPP_LIVE_INBOUND_ENABLED is false."
    };
  }

  let duplicate: Awaited<ReturnType<typeof findLeadMessageByProviderId>>;
  try {
    duplicate = await findLeadMessageByProviderId(providerMessageId);
  } catch (error) {
    logWhatsAppError("dedupe_lookup", { providerMessageId, reason: safeError(error) });
    throw error;
  }
  logWhatsApp("whatsapp_dedupe_checked", { providerMessageId, duplicate: Boolean(duplicate) });
  if (duplicate) {
    return {
      providerMessageId,
      leadId: duplicate.leadId,
      status: "ignored_duplicate",
      reason: "Provider message id was already processed."
    };
  }

  if (runtime.businessNumber && senderPhone === runtime.businessNumber) {
    logWhatsApp("whatsapp_auto_reply_disabled", { providerMessageId, reason: "own_business_number" });
    return {
      providerMessageId,
      status: "ignored_own_number",
      reason: "Inbound sender matches configured WhatsApp business number."
    };
  }

  const inboundBody = message.text || message.caption || `[Unsupported WhatsApp ${message.type || "message"} received]`;
  let lead: Awaited<ReturnType<typeof upsertWhatsAppLead>>;
  try {
    logWhatsApp("whatsapp_lead_upsert_started", { providerMessageId });
    lead = await upsertWhatsAppLead({
      phone: senderPhone,
      contactName: message.contactName,
      latestMessage: inboundBody
    });
    logWhatsApp("whatsapp_lead_upserted", { providerMessageId, leadId: lead.id });
  } catch (error) {
    logWhatsAppError("lead_upsert", { providerMessageId, reason: safeError(error) });
    throw error;
  }

  try {
    logWhatsApp("whatsapp_inbound_message_save_started", { providerMessageId, leadId: lead.id });
    await saveLeadMessage({
      leadId: lead.id,
      direction: "inbound",
      body: inboundBody,
      safeToSend: false,
      providerMessageId,
      providerTimestamp: message.timestamp,
      whatsappStatus: "received",
      metadata: {
        messageType: message.type,
        caption: message.caption,
        filename: message.filename,
        mimeType: message.mimeType,
        mediaId: message.mediaId,
        isVoiceMessage: message.isVoiceMessage,
        businessPhoneNumberId: message.businessPhoneNumberId,
        providerMessageId
      }
    });
    logWhatsApp("whatsapp_inbound_message_saved", { providerMessageId, leadId: lead.id });
  } catch (error) {
    logWhatsAppError("inbound_message_save", { providerMessageId, leadId: lead.id, reason: safeError(error) });
    throw error;
  }

  logWhatsApp("whatsapp_inbound_audit_started", { providerMessageId, leadId: lead.id });
  await auditWhatsApp({
    action: "whatsapp_inbound_received",
    leadId: lead.id,
    summary: "WhatsApp inbound message received and saved for review.",
    metadata: { providerMessageId, messageType: message.type }
  });

  if (["image", "document"].includes(message.type.toLowerCase())) {
    try {
      const mediaStorage = await storeWhatsAppMediaForLead({ leadId: lead.id, message });
      logWhatsApp(mediaStorage.stored ? "whatsapp_media_stored" : "whatsapp_media_received_but_not_stored", {
        providerMessageId,
        leadId: lead.id,
        attempted: mediaStorage.attempted,
        stored: mediaStorage.stored,
        category: mediaStorage.category ?? "",
        reason: mediaStorage.reason
      });
    } catch (error) {
      logWhatsAppError("whatsapp_media_storage", { providerMessageId, leadId: lead.id, reason: safeError(error) });
      await auditWhatsApp({
        action: "whatsapp_media_storage_failed",
        leadId: lead.id,
        summary: "WhatsApp media was received but storage failed; inbound message remains saved for review.",
        metadata: {
          providerMessageId,
          mediaId: message.mediaId,
          messageType: message.type,
          reason: safeError(error),
          noTokenLogged: true
        }
      });
    }
  }

  if (lead.botPaused) {
    logWhatsApp("whatsapp_auto_reply_disabled", { providerMessageId, leadId: lead.id, reason: "bot_paused_for_lead" });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_disabled",
      leadId: lead.id,
      summary: "WhatsApp auto-reply skipped because human takeover or bot pause is active for this lead.",
      metadata: {
        providerMessageId,
        reason: "bot_paused_for_lead",
        botPausedAt: lead.botPausedAt ?? "",
        botPauseReason: lead.botPauseReason ?? ""
      }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "Bot paused for this lead."
    };
  }

  const typeForDecision = message.type.toLowerCase();
  if (!canBuildReplyDecision(message) && !["image", "document"].includes(typeForDecision)) {
    logWhatsApp("whatsapp_auto_reply_disabled", { providerMessageId, leadId: lead.id, reason: "unsupported_or_empty_message" });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_disabled",
      leadId: lead.id,
      summary: "WhatsApp auto-reply disabled for unsupported or empty inbound message.",
      metadata: { providerMessageId, reason: "unsupported_or_empty_message" }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "Unsupported or empty inbound message was saved, but no auto-reply was sent."
    };
  }

  if (!runtime.testAutoReplyEnabled) {
    logWhatsApp("whatsapp_auto_reply_disabled", { providerMessageId, leadId: lead.id, reason: "WHATSAPP_TEST_AUTO_REPLY_ENABLED=false" });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_disabled",
      leadId: lead.id,
      summary: "WhatsApp auto-reply disabled by kill switch.",
      metadata: { providerMessageId, reason: "WHATSAPP_TEST_AUTO_REPLY_ENABLED=false" }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "WHATSAPP_TEST_AUTO_REPLY_ENABLED is false."
    };
  }

  if (!runtime.autoReplyModeAllowed) {
    logWhatsApp("whatsapp_auto_reply_disabled", {
      providerMessageId,
      leadId: lead.id,
      reason: "invalid_auto_reply_mode",
      publicAutoReplyEnabled: runtime.publicAutoReplyEnabled,
      testMode: runtime.testMode
    });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_disabled",
      leadId: lead.id,
      summary: "WhatsApp auto-reply disabled because the public/test mode pairing is invalid.",
      metadata: { providerMessageId, publicAutoReplyEnabled: runtime.publicAutoReplyEnabled, testMode: runtime.testMode }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "Auto-reply requires either closed test mode or Marcus-approved live mode."
    };
  }

  if (!runtime.credentialsReady) {
    logWhatsApp("whatsapp_auto_reply_disabled", { providerMessageId, leadId: lead.id, reason: "missing_credentials" });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_disabled",
      leadId: lead.id,
      summary: "WhatsApp auto-reply disabled because Cloud API credentials are missing.",
      metadata: { providerMessageId, reason: "missing_credentials" }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "WhatsApp credentials missing."
    };
  }

  const recentReplyCount = await countRecentWhatsAppAutoReplies(lead.id, tenMinutesAgoIso());
  const rateLimitWarning = recentReplyCount >= 3;
  if (rateLimitWarning) {
    logWhatsApp("whatsapp_rate_limit_warning", { providerMessageId, leadId: lead.id, recentReplyCount, distinctTextWillStillReply: true });
    await auditWhatsApp({
      action: "whatsapp_rate_limit_warning",
      leadId: lead.id,
      summary: "WhatsApp rate-limit threshold reached, but valid distinct client text will continue through the no-silence guard.",
      metadata: { providerMessageId, recentReplyCount, limit: 3, noSilenceGuard: true }
    });
  }

  let recentMessages: Awaited<ReturnType<typeof listRecentLeadMessagesForWebhook>> = [];
  try {
    recentMessages = await listRecentLeadMessagesForWebhook(lead.id, 8);
  } catch (error) {
    logWhatsAppError("context_load", { providerMessageId, leadId: lead.id, reason: safeError(error) });
    await auditWhatsApp({
      action: "whatsapp_context_load_failed",
      leadId: lead.id,
      summary: "WhatsApp sales brain context lookup failed; safe fallback path will continue.",
      metadata: { providerMessageId, reason: safeError(error) }
    });
  }

  logWhatsApp("whatsapp_reply_decision_started", { providerMessageId, leadId: lead.id });
  logWhatsApp("whatsapp_auto_reply_generate_started", { providerMessageId, leadId: lead.id });
  const decision = buildWhatsAppReplyDecision({
    inboundMessageText: message.text,
    inboundMessageType: message.type,
    lead,
    previousMessages: recentMessages,
    autoReplyEnabled: runtime.testAutoReplyEnabled && runtime.autoReplyModeAllowed && runtime.credentialsReady,
    openAiEnabled: false,
    calendarEventId: "",
    rateLimitExceeded: rateLimitWarning,
    providerMessageId
  });
  await auditReplyDecisionTrace({ leadId: lead.id, providerMessageId, decision });
  let reply = decision.replyText;
  const finalValidationFallbackEligible =
    decision.shouldReply &&
    (decision.replySource === "safe_fallback" ||
      decision.noSilenceGuardResult === "used" ||
      (decision.replySource as string) === "no_silence_fallback");
  const traceId = `${providerMessageId}:${lead.id}`;
  const handoffEmail = await processWhatsAppHandoffEmail({
    lead,
    phone: senderPhone,
    latestMessage: inboundBody,
    recentMessages,
    decision,
    botReply: reply,
    traceId
  });
  Object.assign(decision.blackBoxTrace, handoffEmail.trace);
  let brainMetadata = {
    providerMessageId,
    ...decision.blackBoxTrace
  };
  if (handoffEmail.triggered) {
    await auditWhatsApp({
      action: handoffEmail.sent ? "whatsapp_handoff_email_sent" : "whatsapp_handoff_email_skipped",
      leadId: lead.id,
      summary: handoffEmail.sent
        ? "WhatsApp lead handoff email sent to Marcus."
        : "WhatsApp lead handoff email was triggered but not sent.",
      metadata: {
        ...brainMetadata,
        handoffReasons: handoffEmail.reasons,
        handoffEmailSkippedReason: handoffEmail.skippedReason,
        handoffEmailCooldownApplied: handoffEmail.cooldownApplied
      }
    });
  }
  logWhatsApp("whatsapp_auto_reply_generated", {
    providerMessageId,
    leadId: lead.id,
    characterCount: reply.length,
    intent: decision.intent,
    replySource: decision.replySource,
    shouldAutoSend: decision.shouldReply
  });

  await auditWhatsApp({
    action: "whatsapp_auto_reply_requested",
    leadId: lead.id,
    summary: "WhatsApp auto-reply requested and passed through the v5.3 reply coach gates.",
    metadata: brainMetadata
  });

  if (!decision.shouldReply) {
    logWhatsApp("whatsapp_auto_reply_disabled", {
      providerMessageId,
      leadId: lead.id,
      reason: decision.intentionalNoReplyReason || "intentional_no_reply",
      intent: decision.intent
    });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_intentional_no_reply",
      leadId: lead.id,
      summary: "WhatsApp reply decision ended with an intentional no-reply reason.",
      metadata: brainMetadata
    });
    await saveLeadMessage({
      leadId: lead.id,
      direction: "outbound",
      body: reply,
      safeToSend: false,
      whatsappStatus: "disabled",
      metadata: {
        inboundProviderMessageId: providerMessageId,
        reason: decision.intentionalNoReplyReason || "intentional_no_reply",
        ...decision.blackBoxTrace
      }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: decision.intentionalNoReplyReason || "Intentional no-reply.",
      reply
    };
  }

  logWhatsApp("whatsapp_auto_reply_validation_started", {
    providerMessageId,
    leadId: lead.id,
    replySource: decision.replySource,
    intent: decision.intent,
    characterCount: reply.length
  });
  const calendarEventId = decision.calendarEventId ?? "";
  let safety = validateWhatsAppAutoReply(reply, { calendarEventId });
  if (!safety.ok && finalValidationFallbackEligible) {
    logWhatsApp("whatsapp_auto_reply_fallback_rewrite_attempted", {
      providerMessageId,
      leadId: lead.id,
      validationErrorCodes: safety.errorCodes,
      validationErrorLabels: safety.errorLabels,
      replySource: decision.replySource,
      intent: decision.intent,
      characterCount: reply.length
    });
    Object.assign(decision.blackBoxTrace, {
      finalSafetyFallbackRewriteAttempted: true,
      finalSafetyOriginalErrorCodes: safety.errorCodes,
      finalSafetyOriginalErrorLabels: safety.errorLabels,
      finalSafetyOriginalCharacterCount: reply.length
    });
    reply = WHATSAPP_ULTRA_SAFE_FALLBACK_REPLY;
    safety = validateWhatsAppAutoReply(reply, { calendarEventId });
    Object.assign(decision.blackBoxTrace, {
      finalSafetyFallbackRewriteUsed: safety.ok,
      finalSafetyFallbackRewriteErrorCodes: safety.errorCodes,
      finalSafetyFallbackRewriteErrorLabels: safety.errorLabels,
      finalSafetyFallbackRewriteCharacterCount: reply.length
    });
    brainMetadata = {
      providerMessageId,
      ...decision.blackBoxTrace
    };
  }
  if (!safety.ok) {
    logWhatsApp("whatsapp_auto_reply_blocked_unsafe", {
      providerMessageId,
      leadId: lead.id,
      errorCount: safety.errors.length,
      validationErrorCodes: safety.errorCodes,
      validationErrorLabels: safety.errorLabels,
      replySource: decision.replySource,
      intent: decision.intent,
      characterCount: reply.length
    });
    await saveLeadMessage({
      leadId: lead.id,
      direction: "outbound",
      body: reply,
      safeToSend: false,
      whatsappStatus: "blocked",
      metadata: {
        providerMessageId,
        validationErrorCodes: safety.errorCodes,
        validationErrorLabels: safety.errorLabels,
        safety,
        ...decision.blackBoxTrace
      }
    });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_blocked_unsafe",
      leadId: lead.id,
      summary: "WhatsApp auto-reply blocked by safety validator.",
      metadata: {
        ...brainMetadata,
        validationErrorCodes: safety.errorCodes,
        validationErrorLabels: safety.errorLabels,
        safety
      }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_blocked",
      reason: safety.errors.join("; "),
      reply
    };
  }
  logWhatsApp("whatsapp_auto_reply_validation_passed", {
    providerMessageId,
    leadId: lead.id,
    validationWarnings: safety.warningCodes,
    replySource: decision.replySource,
    intent: decision.intent,
    characterCount: reply.length
  });

  try {
    logWhatsApp("whatsapp_auto_reply_send_payload_summary", getWhatsAppSendPayloadSummary(senderPhone, reply));
    logWhatsApp("whatsapp_auto_reply_send_started", { providerMessageId, leadId: lead.id });
    const sent = await adapter.sendReply(senderPhone, reply);
    logWhatsApp("whatsapp_auto_reply_sent", { providerMessageId, leadId: lead.id, outboundProviderMessageId: sent.providerMessageId || "" });
    await saveLeadMessage({
      leadId: lead.id,
      direction: "outbound",
      body: reply,
      safeToSend: true,
      providerMessageId: sent.providerMessageId || undefined,
      whatsappStatus: "sent",
      metadata: {
        inboundProviderMessageId: providerMessageId,
        outboundProviderMessageId: sent.providerMessageId,
        mode: sent.mode,
        ...decision.blackBoxTrace,
        final_send_result: "sent"
      }
    });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_sent",
      leadId: lead.id,
      summary: "WhatsApp auto-reply sent after safety validation.",
      metadata: { ...brainMetadata, outboundProviderMessageId: sent.providerMessageId, final_send_result: "sent" }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_sent",
      reason: "WhatsApp auto-reply sent after safety validation.",
      reply
    };
  } catch (error) {
    const sendError = safeSendErrorMetadata(error);
    logWhatsApp("whatsapp_auto_reply_failed", {
      providerMessageId,
      leadId: lead.id,
      status: sendError.status,
      metaCode: sendError.metaCode,
      metaMessage: sendError.metaMessage,
      metaType: sendError.metaType
    });
    logWhatsAppError("auto_reply_send", {
      providerMessageId,
      leadId: lead.id,
      reason: safeError(error),
      status: sendError.status,
      metaCode: sendError.metaCode,
      metaMessage: sendError.metaMessage,
      metaType: sendError.metaType
    });
    await saveLeadMessage({
      leadId: lead.id,
      direction: "outbound",
      body: reply,
      safeToSend: false,
      whatsappStatus: "failed",
      metadata: {
        inboundProviderMessageId: providerMessageId,
        error: error instanceof Error ? error.message : "Unknown WhatsApp send failure",
        status: sendError.status,
        metaCode: sendError.metaCode,
        metaMessage: sendError.metaMessage,
        metaType: sendError.metaType,
        ...decision.blackBoxTrace,
        final_send_result: "failed"
      }
    });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_failed",
      leadId: lead.id,
      summary: "WhatsApp auto-reply failed. No retry loop was started.",
      metadata: {
        providerMessageId,
        error: error instanceof Error ? error.message : "Unknown WhatsApp send failure",
        status: sendError.status,
        metaCode: sendError.metaCode,
        metaMessage: sendError.metaMessage,
        metaType: sendError.metaType,
        ...decision.blackBoxTrace,
        final_send_result: "failed"
      }
    });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_send_failed",
      leadId: lead.id,
      summary: "WhatsApp auto-reply send failed and was logged without starting a retry loop.",
      metadata: {
        providerMessageId,
        error: error instanceof Error ? error.message : "Unknown WhatsApp send failure",
        status: sendError.status,
        metaCode: sendError.metaCode,
        metaMessage: sendError.metaMessage,
        metaType: sendError.metaType,
        ...decision.blackBoxTrace,
        final_send_result: "failed"
      }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_failed",
      reason: error instanceof Error ? error.message : "Unknown WhatsApp send failure",
      reply
    };
  }
}
