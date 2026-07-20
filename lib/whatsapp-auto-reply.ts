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
import {
  recordConversationSafetyOutcome,
  updateConversationRouting,
  updateLeadFactsFromEvidence
} from "@/lib/data/leads-repository";
import {
  getWhatsAppLeadControlState,
  type WhatsAppLeadControlState
} from "@/lib/data/whatsapp-lead-control-repository";
import {
  acquireWhatsAppConversationReplyLease,
  completeWhatsAppConversationReplyReservation,
  newWhatsAppReplyLeaseOwnerToken,
  releaseWhatsAppConversationReplyLease,
  reserveWhatsAppConversationReply
} from "@/lib/data/whatsapp-conversation-lock-repository";
import { getWhatsAppRuntime, normalizeWhatsAppPhone } from "@/lib/whatsapp-config";
import { processWhatsAppHandoffEmail } from "@/lib/handoff-email";
import { storeWhatsAppMediaForLead } from "@/lib/whatsapp-media-storage";
import type { ParsedWhatsAppMessage } from "@/lib/whatsapp-parser";
import {
  orchestrateWhatsAppConversationReply,
  type WhatsAppReplyDecision
} from "@/lib/whatsapp-reply-decision";
// Compatibility audit marker: buildWhatsAppReplyDecision delegates to the
// orchestrator; the live webhook intentionally calls the orchestrator directly.
import { classifyConversationIntent, WHATSAPP_INTENT_CONTEXT_MESSAGE_LIMIT } from "@/lib/whatsapp-intent-gate";
import {
  applySemanticDuplicateGuard,
  identifyLatestUnansweredQuestion,
  isDirectClientQuestion,
  replySemanticSignature
} from "@/lib/whatsapp-conversation-safety";
import {
  findNewInboundProviderIds,
  latestInboundMessage,
  settleWhatsAppInboundBurst,
  WHATSAPP_REPLY_COOLDOWN_SECONDS,
  WHATSAPP_REPLY_NO_SEND_COOLDOWN_SECONDS
} from "@/lib/whatsapp-conversation-concurrency";
import { validateWhatsAppAutoReply, WHATSAPP_ULTRA_SAFE_FALLBACK_REPLY } from "@/lib/whatsapp-safety";
import { buildSilentCaptureNoteFromDecision } from "@/lib/whatsapp-silent-capture";
import { evaluateWhatsAppReplyQuality } from "@/lib/ai-quality";
import { linkAiQualityObservationsToMessage, recordAiQualityObservation } from "@/lib/data/team-inbox-repository";
import type { Lead } from "@/lib/types";
import { getWhatsAppServiceWindowFromMessages, whatsappServiceWindowErrorMessage } from "@/lib/whatsapp-service-window";

export type WhatsAppInboundTerminalOutcome =
  | "outbound_sent"
  | "outbound_send_failed"
  | "intentional_no_send"
  | "unexpected_no_send"
  | "inbound_ignored";

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
    | "auto_reply_coalesced"
    | "auto_reply_silent_capture"
    | "auto_reply_failed";
  reason: string;
  reply?: string;
  terminalOutcome: WhatsAppInboundTerminalOutcome;
  externalSendAttempted: boolean;
};

function applyLeadControlState(lead: Lead, control: WhatsAppLeadControlState): Lead {
  return {
    ...lead,
    botPaused: control.botPaused,
    botPausedAt: control.botPausedAt,
    botPausedBy: control.botPausedBy,
    botPauseReason: control.botPauseReason,
    needsMarcus: control.needsMarcus
  };
}

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

async function recordConversationSafetyOutcomeSafely(
  input: Parameters<typeof recordConversationSafetyOutcome>[0]
) {
  try {
    await recordConversationSafetyOutcome(input);
  } catch (error) {
    logWhatsAppError("conversation_safety_outcome", {
      providerMessageId: input.providerMessageId,
      leadId: input.lead.id,
      reason: safeError(error)
    });
  }
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
  const sharedEvents = [
    ["whatsapp_reply_decision_started", "WhatsApp reply decision started."],
    ["whatsapp_conversation_stage_detected", "WhatsApp conversation stage detected."],
    ["whatsapp_reply_candidate_created", "WhatsApp reply candidate created."],
    ["whatsapp_reply_safety_checked", "WhatsApp reply safety checked."],
    ["whatsapp_reply_repetition_checked", "WhatsApp reply repetition checked."],
    ["whatsapp_reply_quality_checked", "WhatsApp reply quality checked."],
    ["whatsapp_no_silence_guard_checked", "WhatsApp no-silence guard checked."],
    ["whatsapp_reply_finalized", "WhatsApp reply decision finalized."]
  ] as const;
  const routeEvents = input.decision.leadEligible
    ? [
        ["whatsapp_sales_brain_classified", "WhatsApp sales brain classified the eligible renovation enquiry."],
        ["whatsapp_sales_move_selected", "WhatsApp sales move selected."]
      ] as const
    : [
        ["whatsapp_non_sales_route_selected", "WhatsApp non-sales routing policy selected without invoking the sales brain."]
      ] as const;

  for (const [action, summary] of [...sharedEvents, ...routeEvents]) {
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
      reason: "WHATSAPP_LIVE_INBOUND_ENABLED is false.",
      terminalOutcome: "inbound_ignored",
      externalSendAttempted: false
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
      reason: "Provider message id was already processed.",
      terminalOutcome: "inbound_ignored",
      externalSendAttempted: false
    };
  }

  if (runtime.businessNumber && senderPhone === runtime.businessNumber) {
    logWhatsApp("whatsapp_auto_reply_disabled", { providerMessageId, reason: "own_business_number" });
    return {
      providerMessageId,
      status: "ignored_own_number",
      reason: "Inbound sender matches configured WhatsApp business number.",
      terminalOutcome: "inbound_ignored",
      externalSendAttempted: false
    };
  }

  const inboundBody = message.text || message.caption || `[WhatsApp ${message.type || "message"} received]`;
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

  let savedInboundMessage: Awaited<ReturnType<typeof saveLeadMessage>>;
  try {
    logWhatsApp("whatsapp_inbound_message_save_started", { providerMessageId, leadId: lead.id });
    savedInboundMessage = await saveLeadMessage({
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
        providerMessageId,
        rawInboundSavedBeforeIntentClassification: true
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
    metadata: {
      providerMessageId,
      messageType: message.type,
      rawInboundSavedBeforeIntentClassification: true,
      intentGateVersion: "v10.2.0"
    }
  });

  let recentMessages: Awaited<ReturnType<typeof listRecentLeadMessagesForWebhook>> = [savedInboundMessage];
  try {
    recentMessages = await listRecentLeadMessagesForWebhook(lead.id, WHATSAPP_INTENT_CONTEXT_MESSAGE_LIMIT);
  } catch (error) {
    logWhatsAppError("intent_context_load", { providerMessageId, leadId: lead.id, reason: safeError(error) });
    await auditWhatsApp({
      action: "whatsapp_context_load_failed",
      leadId: lead.id,
      summary: "WhatsApp intent context lookup failed; classification continued with the saved inbound message only.",
      metadata: { providerMessageId, reason: safeError(error), contextFallback: "saved_inbound_only" }
    });
  }

  let intentGate = classifyConversationIntent({
    currentMessageText: inboundBody,
    currentMessageType: message.type,
    recentMessages,
    lead,
    botPaused: lead.botPaused
  });
  let latestUnansweredQuestion = identifyLatestUnansweredQuestion({
    messages: recentMessages,
    currentMessageText: message.text || message.caption,
    currentProviderMessageId: providerMessageId,
    currentCreatedAt: savedInboundMessage.createdAt
  });

  try {
    const routedLead = await updateConversationRouting(lead, intentGate, latestUnansweredQuestion, {
      providerMessageId,
      rawInboundMessageId: savedInboundMessage.id,
      rawInboundSavedBeforeIntentClassification: true,
      classificationLatencyMs: intentGate.classificationLatencyMs,
      ruleVersion: intentGate.ruleVersion
    });
    if (routedLead) lead = routedLead;
  } catch (error) {
    logWhatsAppError("intent_routing_persist", { providerMessageId, leadId: lead.id, reason: safeError(error) });
    await auditWhatsApp({
      action: "whatsapp_intent_routing_failed_safe_suppression",
      leadId: lead.id,
      summary: "WhatsApp intent routing could not be persisted, so auto-reply was safely suppressed.",
      metadata: {
        providerMessageId,
        primaryIntent: intentGate.primaryIntent,
        confidence: intentGate.confidence,
        reasonCodes: intentGate.reasonCodes,
        classifierVersion: intentGate.classifierVersion,
        ruleVersion: intentGate.ruleVersion,
        reason: safeError(error)
      }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "Intent routing could not be persisted; no auto-reply was sent.",
      terminalOutcome: "unexpected_no_send",
      externalSendAttempted: false
    };
  }

  await auditWhatsApp({
    action: "whatsapp_conversation_intent_classified",
    leadId: lead.id,
    summary: "WhatsApp conversation intent and sales eligibility classified before the sales brain.",
    metadata: {
      providerMessageId,
      rawInboundMessageId: savedInboundMessage.id,
      primaryIntent: intentGate.primaryIntent,
      conversationIntent: intentGate.conversationIntent,
      leadEligible: intentGate.leadEligible,
      salesEligible: intentGate.salesEligible,
      conversationRoute: intentGate.conversationRoute,
      confidence: intentGate.confidence,
      reasonCodes: intentGate.reasonCodes,
      classifierVersion: intentGate.classifierVersion,
      ruleVersion: intentGate.ruleVersion,
      manualOverride: lead.intentManualOverride ?? null,
      manualOverrideApplied: intentGate.manualOverrideApplied,
      classificationFailed: intentGate.classificationFailed,
      classificationLatencyMs: intentGate.classificationLatencyMs,
      latestUnansweredQuestion: latestUnansweredQuestion?.text ?? "",
      classifiedAt: lead.intentClassifiedAt ?? new Date().toISOString(),
      timestamp: lead.intentClassifiedAt ?? new Date().toISOString()
    }
  });

  if (intentGate.shouldExtractLeadFacts) {
    try {
      const updatedLead = await updateLeadFactsFromEvidence(lead, [savedInboundMessage], [], {
        providerMessageId,
        source: "whatsapp_inbound_after_intent_gate",
        liveExtraction: true,
        conversationIntent: intentGate.conversationIntent,
        leadEligible: intentGate.leadEligible
      });
      if (updatedLead) lead = updatedLead;
      logWhatsApp("lead_facts_extracted", { providerMessageId, leadId: lead.id, intentGatePassed: true });
    } catch (factsError) {
      logWhatsAppError("lead_facts_extract", { providerMessageId, leadId: lead.id, reason: safeError(factsError) });
    }
  } else {
    logWhatsApp("lead_facts_extraction_skipped", {
      providerMessageId,
      leadId: lead.id,
      conversationIntent: intentGate.conversationIntent,
      leadEligible: false
    });
  }

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
    await recordConversationSafetyOutcomeSafely({
      lead,
      providerMessageId,
      conversationIntent: intentGate.conversationIntent,
      noReplySafetySuppression: true,
      unrelatedReplyBlocked: true,
      suppressionReason: "human_takeover_or_bot_paused"
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "Bot paused for this lead.",
      terminalOutcome: "intentional_no_send",
      externalSendAttempted: false
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
      reason: "WHATSAPP_TEST_AUTO_REPLY_ENABLED is false.",
      terminalOutcome: "intentional_no_send",
      externalSendAttempted: false
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
      reason: "Auto-reply requires either closed test mode or Marcus-approved live mode.",
      terminalOutcome: "unexpected_no_send",
      externalSendAttempted: false
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
      reason: "WhatsApp credentials missing.",
      terminalOutcome: "unexpected_no_send",
      externalSendAttempted: false
    };
  }

  const replyLeaseOwnerToken = newWhatsAppReplyLeaseOwnerToken();
  let replyLeaseCooldownSeconds = WHATSAPP_REPLY_NO_SEND_COOLDOWN_SECONDS;
  let replyReservationId = "";
  let replyInboundBody = inboundBody;
  let replyInboundMessageType = message.type;
  let replyTriggerProviderMessageId = providerMessageId;
  let replyLease;
  try {
    replyLease = await acquireWhatsAppConversationReplyLease({
      leadId: lead.id,
      ownerToken: replyLeaseOwnerToken,
      directQuestion: isDirectClientQuestion(inboundBody)
    });
  } catch (error) {
    logWhatsAppError("conversation_reply_lease_acquire", {
      providerMessageId,
      leadId: lead.id,
      reason: safeError(error)
    });
    await auditWhatsApp({
      action: "whatsapp_conversation_reply_lease_failed_safe_suppression",
      leadId: lead.id,
      summary: "WhatsApp auto-reply was suppressed because the cross-instance conversation lease was unavailable.",
      metadata: { providerMessageId, reason: safeError(error), failClosed: true }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "Conversation safety lease unavailable; no auto-reply was sent.",
      reply: "",
      terminalOutcome: "unexpected_no_send",
      externalSendAttempted: false
    };
  }

  if (!replyLease.acquired) {
    logWhatsApp("whatsapp_inbound_coalesced_without_send", {
      providerMessageId,
      leadId: lead.id,
      leaseReason: replyLease.reason
    });
    await auditWhatsApp({
      action: "whatsapp_inbound_coalesced_without_send",
      leadId: lead.id,
      summary: "Inbound WhatsApp message was saved but did not start another reply while the conversation lease or cooldown was active.",
      metadata: {
        providerMessageId,
        leaseReason: replyLease.reason,
        leaseExpiresAt: replyLease.leaseExpiresAt,
        rawInboundPreserved: true,
        noAdditionalReply: true
      }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_coalesced",
      reason: `Inbound message coalesced: ${replyLease.reason}.`,
      reply: "",
      terminalOutcome: "intentional_no_send",
      externalSendAttempted: false
    };
  }

  try {
    await settleWhatsAppInboundBurst();
    try {
      recentMessages = await listRecentLeadMessagesForWebhook(lead.id, WHATSAPP_INTENT_CONTEXT_MESSAGE_LIMIT);
    } catch (error) {
      logWhatsAppError("post_lease_context_refresh", { providerMessageId, leadId: lead.id, reason: safeError(error) });
      throw error;
    }
    const latestPlanningInbound = latestInboundMessage(recentMessages);
    const latestPlanningInboundIdentity = latestPlanningInbound?.providerMessageId || latestPlanningInbound?.id || "";
    const currentInboundIdentity = providerMessageId || savedInboundMessage.id;
    if (latestPlanningInbound && latestPlanningInboundIdentity !== currentInboundIdentity) {
      const latestLeadControl = await getWhatsAppLeadControlState(lead.id);
      if (!latestLeadControl) throw new Error("Lead control state unavailable while consolidating the inbound WhatsApp burst.");
      lead = applyLeadControlState(lead, latestLeadControl);
      replyInboundBody = latestPlanningInbound.body;
      replyInboundMessageType = typeof latestPlanningInbound.metadata?.messageType === "string"
        ? latestPlanningInbound.metadata.messageType
        : "text";
      replyTriggerProviderMessageId = latestPlanningInbound.providerMessageId || providerMessageId;
      intentGate = classifyConversationIntent({
        currentMessageText: replyInboundBody,
        currentMessageType: replyInboundMessageType,
        recentMessages,
        lead,
        botPaused: lead.botPaused
      });
      latestUnansweredQuestion = identifyLatestUnansweredQuestion({
        messages: recentMessages,
        currentMessageText: replyInboundBody,
        currentProviderMessageId: replyTriggerProviderMessageId,
        currentCreatedAt: latestPlanningInbound.createdAt
      });
      const consolidatedLead = await updateConversationRouting(lead, intentGate, latestUnansweredQuestion, {
        providerMessageId: replyTriggerProviderMessageId,
        rawInboundMessageId: latestPlanningInbound.id,
        burstConsolidationOwnerProviderMessageId: providerMessageId,
        burstReclassifiedFromLatestInbound: true,
        noStaleFirstMessagePlanning: true
      });
      if (consolidatedLead) lead = consolidatedLead;
      if (intentGate.shouldExtractLeadFacts) {
        const updatedLead = await updateLeadFactsFromEvidence(lead, [latestPlanningInbound], [], {
          providerMessageId: replyTriggerProviderMessageId,
          source: "whatsapp_inbound_burst_consolidation",
          liveExtraction: true,
          conversationIntent: intentGate.conversationIntent,
          leadEligible: intentGate.leadEligible
        });
        if (updatedLead) lead = updatedLead;
      }
      await auditWhatsApp({
        action: "whatsapp_inbound_burst_reclassified_from_latest_message",
        leadId: lead.id,
        summary: "The conversation lease owner consolidated the inbound burst and replanned from the newest client message.",
        metadata: {
          providerMessageId,
          replyTriggerProviderMessageId,
          conversationIntent: intentGate.conversationIntent,
          leadEligible: intentGate.leadEligible,
          rawInboundPreserved: true,
          noStaleFirstMessagePlanning: true
        }
      });
    }
    const replyPlanningMessages = [...recentMessages];

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

  logWhatsApp("whatsapp_reply_decision_started", { providerMessageId, leadId: lead.id });
  logWhatsApp("whatsapp_auto_reply_generate_started", { providerMessageId, leadId: lead.id });
  const decision = orchestrateWhatsAppConversationReply({
    inboundMessageText: replyInboundBody,
    inboundMessageType: replyInboundMessageType,
    lead,
    previousMessages: recentMessages,
    autoReplyEnabled: runtime.testAutoReplyEnabled && runtime.autoReplyModeAllowed && runtime.credentialsReady,
    openAiEnabled: false,
    calendarEventId: "",
    rateLimitExceeded: rateLimitWarning,
    providerMessageId: replyTriggerProviderMessageId,
    intentGateDecision: intentGate,
    latestUnansweredQuestion
  });
  await auditReplyDecisionTrace({ leadId: lead.id, providerMessageId, decision });
  let reply = decision.replyText;
  const finalValidationFallbackEligible =
    decision.shouldReply &&
    (decision.replySource === "safe_fallback" ||
      decision.noSilenceGuardResult === "used" ||
      (decision.replySource as string) === "no_silence_fallback");
  const traceId = `${replyTriggerProviderMessageId}:${lead.id}`;
  const handoffEmail = await processWhatsAppHandoffEmail({
    lead,
    phone: senderPhone,
    latestMessage: replyInboundBody,
    recentMessages,
    decision,
    botReply: reply,
    traceId
  });
  Object.assign(decision.blackBoxTrace, handoffEmail.trace);
  let brainMetadata = {
    providerMessageId,
    replyTriggerProviderMessageId,
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
    summary: "WhatsApp reply/no-reply plan passed through the v10.2 intent and conversation safety gates.",
    metadata: brainMetadata
  });

  if (!decision.shouldReply) {
    const silentCaptureNote = buildSilentCaptureNoteFromDecision(decision, {
      leadId: lead.id,
      sourceMessageId: providerMessageId
    });
    if (silentCaptureNote) {
      logWhatsApp("whatsapp_silent_capture_internal_note_created", {
        providerMessageId,
        leadId: lead.id,
        reason: silentCaptureNote.metadata.reason,
        capturedFieldCount: Object.keys(silentCaptureNote.metadata.capturedFields as Record<string, unknown>).length
      });
      await saveLeadMessage(silentCaptureNote);
      await auditWhatsApp({
        action: "whatsapp_silent_capture_recorded",
        leadId: lead.id,
        summary: "AI captured WhatsApp facts silently to avoid repeated client-facing replies.",
        metadata: {
          ...brainMetadata,
          ...silentCaptureNote.metadata
        }
      });
      await recordConversationSafetyOutcomeSafely({
        lead,
        providerMessageId,
        conversationIntent: decision.conversationIntent,
        semanticDuplicateBlocked: decision.semanticDuplicateBlocked,
        unrelatedReplyBlocked: decision.unrelatedReplyBlocked,
        noReplySafetySuppression: decision.noReplySafetySuppression,
        suppressionReason: decision.intentionalNoReplyReason ?? "silent_capture"
      });
      return {
        providerMessageId,
        leadId: lead.id,
        status: "auto_reply_silent_capture",
        reason: "AI captured facts silently to avoid repeated replies.",
        reply: "",
        terminalOutcome: "intentional_no_send",
        externalSendAttempted: false
      };
    }

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
    if (reply.trim()) {
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
    }
    await recordConversationSafetyOutcomeSafely({
      lead,
      providerMessageId,
      conversationIntent: decision.conversationIntent,
      semanticDuplicateBlocked: decision.semanticDuplicateBlocked,
      unrelatedReplyBlocked: decision.unrelatedReplyBlocked,
      noReplySafetySuppression: decision.noReplySafetySuppression,
      suppressionReason: decision.intentionalNoReplyReason ?? "intentional_no_reply"
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: decision.intentionalNoReplyReason || "Intentional no-reply.",
      reply,
      terminalOutcome: "intentional_no_send",
      externalSendAttempted: false
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
    const fallbackSemanticGuard = applySemanticDuplicateGuard(reply, recentMessages);
    Object.assign(decision.blackBoxTrace, {
      finalSafetyFallbackRewriteUsed: safety.ok,
      finalSafetyFallbackRewriteErrorCodes: safety.errorCodes,
      finalSafetyFallbackRewriteErrorLabels: safety.errorLabels,
      finalSafetyFallbackRewriteCharacterCount: reply.length,
      finalFallbackSemanticDuplicateGuard: fallbackSemanticGuard,
      final_reply_text: safety.ok && !fallbackSemanticGuard.blocked ? reply : "",
      finalReplyHash: safety.ok && !fallbackSemanticGuard.blocked ? fallbackSemanticGuard.candidateSignature : ""
    });
    if (safety.ok && fallbackSemanticGuard.blocked) {
      decision.shouldReply = false;
      decision.replyText = "";
      decision.intentionalNoReplyReason = "semantic_duplicate_reply";
      decision.semanticDuplicateBlocked = true;
      decision.noReplySafetySuppression = true;
      decision.repetitionResult = "blocked";
      Object.assign(decision.blackBoxTrace, {
        semanticDuplicateBlocked: true,
        noReplySafetySuppression: true,
        intentional_no_reply_reason: "semantic_duplicate_reply",
        final_send_result: "semantic_duplicate_blocked_after_safety_rewrite"
      });
      brainMetadata = { providerMessageId, replyTriggerProviderMessageId, ...decision.blackBoxTrace };
      await auditWhatsApp({
        action: "whatsapp_semantic_duplicate_blocked",
        leadId: lead.id,
        summary: "WhatsApp safety fallback was suppressed because it duplicated a recent AI reply.",
        metadata: brainMetadata
      });
      await recordConversationSafetyOutcomeSafely({
        lead,
        providerMessageId,
        conversationIntent: decision.conversationIntent,
        semanticDuplicateBlocked: true,
        noReplySafetySuppression: true,
        suppressionReason: "semantic_duplicate_reply"
      });
      return {
        providerMessageId,
        leadId: lead.id,
        status: "auto_reply_disabled",
        reason: "Semantic duplicate reply was safely suppressed.",
        reply: "",
        terminalOutcome: "intentional_no_send",
        externalSendAttempted: false
      };
    }
    if (safety.ok) {
      decision.replyText = reply;
      decision.replySignature = fallbackSemanticGuard.candidateSignature;
    }
    brainMetadata = {
      providerMessageId,
      replyTriggerProviderMessageId,
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
    await recordConversationSafetyOutcomeSafely({
      lead,
      providerMessageId,
      conversationIntent: decision.conversationIntent,
      noReplySafetySuppression: true,
      unrelatedReplyBlocked: decision.unrelatedReplyBlocked,
      suppressionReason: "final_safety_validator_blocked"
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_blocked",
      reason: safety.errors.join("; "),
      reply,
      terminalOutcome: "intentional_no_send",
      externalSendAttempted: false
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
    const finalLeadControl = await getWhatsAppLeadControlState(lead.id);
    if (!finalLeadControl) throw new Error("Lead control state unavailable before WhatsApp send.");
    const finalLeadState = applyLeadControlState(lead, finalLeadControl);
    if (finalLeadState.botPaused) {
      logWhatsApp("whatsapp_final_human_takeover_guard_blocked", { providerMessageId, leadId: lead.id });
      await auditWhatsApp({
        action: "whatsapp_final_human_takeover_guard_blocked",
        leadId: lead.id,
        summary: "WhatsApp auto-reply was suppressed because human takeover became active before send.",
        metadata: { ...brainMetadata, final_send_result: "human_takeover_blocked" }
      });
      await recordConversationSafetyOutcomeSafely({
        lead: finalLeadState,
        providerMessageId,
        conversationIntent: decision.conversationIntent,
        unrelatedReplyBlocked: true,
        noReplySafetySuppression: true,
        suppressionReason: "human_takeover_or_bot_paused"
      });
      return {
        providerMessageId,
        leadId: lead.id,
        status: "auto_reply_disabled",
        reason: "Human takeover became active before send.",
        reply: "",
        terminalOutcome: "intentional_no_send",
        externalSendAttempted: false
      };
    }
  } catch (error) {
    logWhatsAppError("final_human_takeover_guard_refresh", {
      providerMessageId,
      leadId: lead.id,
      reason: safeError(error)
    });
    await recordConversationSafetyOutcomeSafely({
      lead,
      providerMessageId,
      conversationIntent: decision.conversationIntent,
      noReplySafetySuppression: true,
      suppressionReason: "final_human_takeover_state_unavailable"
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "Final human-takeover state could not be verified; no auto-reply was sent.",
      reply: "",
      terminalOutcome: "unexpected_no_send",
      externalSendAttempted: false
    };
  }

  let finalReplyMessages: Awaited<ReturnType<typeof listRecentLeadMessagesForWebhook>>;
  try {
    finalReplyMessages = await listRecentLeadMessagesForWebhook(lead.id, WHATSAPP_INTENT_CONTEXT_MESSAGE_LIMIT);
  } catch (error) {
    logWhatsAppError("final_conversation_context_refresh", {
      providerMessageId,
      leadId: lead.id,
      reason: safeError(error)
    });
    await auditWhatsApp({
      action: "whatsapp_final_context_unavailable_safe_suppression",
      leadId: lead.id,
      summary: "WhatsApp auto-reply was suppressed because the final conversation state could not be verified before send.",
      metadata: { ...brainMetadata, providerMessageId, reason: safeError(error), failClosed: true }
    });
    await recordConversationSafetyOutcomeSafely({
      lead,
      providerMessageId,
      conversationIntent: decision.conversationIntent,
      noReplySafetySuppression: true,
      suppressionReason: "final_conversation_context_unavailable"
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "Final conversation state could not be verified; no auto-reply was sent.",
      reply: "",
      terminalOutcome: "unexpected_no_send",
      externalSendAttempted: false
    };
  }

  const newerInboundProviderIds = findNewInboundProviderIds(replyPlanningMessages, finalReplyMessages);
  if (newerInboundProviderIds.length) {
    Object.assign(decision.blackBoxTrace, {
      newerInboundDuringPlanning: true,
      newerInboundProviderIds,
      final_send_result: "newer_inbound_coalesced_without_send"
    });
    brainMetadata = { providerMessageId, replyTriggerProviderMessageId, ...decision.blackBoxTrace };
    logWhatsApp("whatsapp_newer_inbound_during_planning_safe_suppression", {
      providerMessageId,
      leadId: lead.id,
      newerInboundCount: newerInboundProviderIds.length
    });
    await auditWhatsApp({
      action: "whatsapp_newer_inbound_during_planning_safe_suppression",
      leadId: lead.id,
      summary: "A stale WhatsApp reply was suppressed because newer client messages arrived while it was being planned.",
      metadata: { ...brainMetadata, rawInboundPreserved: true, noStaleReply: true }
    });
    await recordConversationSafetyOutcomeSafely({
      lead,
      providerMessageId,
      conversationIntent: decision.conversationIntent,
      noReplySafetySuppression: true,
      unrelatedReplyBlocked: true,
      suppressionReason: "newer_inbound_during_reply_planning"
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_coalesced",
      reason: "Newer inbound messages arrived during planning; stale reply suppressed.",
      reply: "",
      terminalOutcome: "intentional_no_send",
      externalSendAttempted: false
    };
  }

  const finalSemanticGuard = applySemanticDuplicateGuard(reply, finalReplyMessages);
  Object.assign(decision.blackBoxTrace, {
    finalPreSendSemanticGuard: finalSemanticGuard,
    finalReplyHash: finalSemanticGuard.candidateSignature
  });
  brainMetadata = { providerMessageId, replyTriggerProviderMessageId, ...decision.blackBoxTrace };
  if (finalSemanticGuard.blocked) {
    await auditWhatsApp({
      action: "whatsapp_final_semantic_duplicate_blocked",
      leadId: lead.id,
      summary: "WhatsApp auto-reply was suppressed by the final pre-send semantic duplicate check.",
      metadata: { ...brainMetadata, final_send_result: "semantic_duplicate_blocked_before_reservation" }
    });
    await recordConversationSafetyOutcomeSafely({
      lead,
      providerMessageId,
      conversationIntent: decision.conversationIntent,
      semanticDuplicateBlocked: true,
      noReplySafetySuppression: true,
      suppressionReason: "final_pre_send_semantic_duplicate"
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "Final pre-send semantic duplicate reply was safely suppressed.",
      reply: "",
      terminalOutcome: "intentional_no_send",
      externalSendAttempted: false
    };
  }

  const serviceWindow = getWhatsAppServiceWindowFromMessages(finalReplyMessages);
  Object.assign(decision.blackBoxTrace, {
    whatsappServiceWindowStatus: serviceWindow.status,
    whatsappServiceWindowReason: serviceWindow.reason,
    whatsappServiceWindowExpiresAt: serviceWindow.expiresAt,
    whatsappServiceWindowProviderOpenedAt: serviceWindow.providerOpenedAt
  });
  brainMetadata = { providerMessageId, replyTriggerProviderMessageId, ...decision.blackBoxTrace };
  if (!serviceWindow.canSendFreeform) {
    await auditWhatsApp({
      action: "whatsapp_auto_reply_service_window_blocked",
      leadId: lead.id,
      summary: "WhatsApp auto-reply was blocked before provider send because Meta's 24-hour customer-service window was not open.",
      metadata: {
        ...brainMetadata,
        externalSendAttempted: false,
        final_send_result: "service_window_blocked_before_reservation"
      }
    });
    await recordConversationSafetyOutcomeSafely({
      lead,
      providerMessageId,
      conversationIntent: decision.conversationIntent,
      noReplySafetySuppression: true,
      suppressionReason: `whatsapp_service_window_${serviceWindow.status}`
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_blocked",
      reason: whatsappServiceWindowErrorMessage(serviceWindow),
      reply: "",
      terminalOutcome: "intentional_no_send",
      externalSendAttempted: false
    };
  }

  const finalReplySignature = replySemanticSignature(reply);
  const liveQuality = evaluateWhatsAppReplyQuality(reply);
  const shadowQuality = evaluateWhatsAppReplyQuality(reply, { strict: true });
  const [liveQualityEventId, shadowQualityEventId] = await Promise.all([
    recordAiQualityObservation({
      leadId: lead.id,
      traceId,
      reply,
      primaryMove: decision.salesMove,
      qualityScores: {
        overall: liveQuality.overall,
        safety: liveQuality.safety,
        focus: liveQuality.focus,
        humanTone: liveQuality.humanTone,
        questionCount: liveQuality.questionCount,
        releaseEligible: liveQuality.releaseEligible
      },
      metadata: {
        source: "live_single_reply_planner",
        flagCount: liveQuality.flags.length,
        intent: decision.intent,
        replySource: decision.replySource
      }
    }),
    recordAiQualityObservation({
      leadId: lead.id,
      traceId,
      reply,
      primaryMove: decision.salesMove,
      qualityScores: {
        overall: shadowQuality.overall,
        safety: shadowQuality.safety,
        focus: shadowQuality.focus,
        humanTone: shadowQuality.humanTone,
        questionCount: shadowQuality.questionCount,
        releaseEligible: shadowQuality.releaseEligible
      },
      shadowCandidate: true,
      metadata: {
        source: "shadow_quality_evaluator",
        flagCount: shadowQuality.flags.length,
        wouldPass: shadowQuality.releaseEligible
      }
    })
  ]).catch(() => [null, null]);
  try {
    const reservation = await reserveWhatsAppConversationReply({
      leadId: lead.id,
      ownerToken: replyLeaseOwnerToken,
      inboundProviderMessageId: replyTriggerProviderMessageId,
      replySignature: finalReplySignature
    });
    if (!reservation.reserved || !reservation.reservationId) {
      await auditWhatsApp({
        action: "whatsapp_reply_reservation_blocked_safe_suppression",
        leadId: lead.id,
        summary: "WhatsApp auto-reply was suppressed because the atomic send reservation was not granted.",
        metadata: {
          ...brainMetadata,
          reservationReason: reservation.reason,
          replySignature: finalReplySignature,
          final_send_result: "reply_reservation_not_granted"
        }
      });
      await recordConversationSafetyOutcomeSafely({
        lead,
        providerMessageId,
        conversationIntent: decision.conversationIntent,
        semanticDuplicateBlocked: reservation.reason === "duplicate_reply_reservation",
        noReplySafetySuppression: true,
        suppressionReason: reservation.reason
      });
      return {
        providerMessageId,
        leadId: lead.id,
        status: "auto_reply_coalesced",
        reason: `Atomic reply reservation not granted: ${reservation.reason}.`,
        reply: "",
        terminalOutcome: "intentional_no_send",
        externalSendAttempted: false
      };
    }
    replyReservationId = reservation.reservationId;
    decision.replySignature = finalReplySignature;
    Object.assign(decision.blackBoxTrace, {
      replyReservationId,
      replyReservationGranted: true,
      finalReplyHash: finalReplySignature
    });
    brainMetadata = { providerMessageId, replyTriggerProviderMessageId, ...decision.blackBoxTrace };
  } catch (error) {
    logWhatsAppError("conversation_reply_reservation", {
      providerMessageId,
      leadId: lead.id,
      reason: safeError(error)
    });
    await auditWhatsApp({
      action: "whatsapp_reply_reservation_failed_safe_suppression",
      leadId: lead.id,
      summary: "WhatsApp auto-reply was suppressed because the atomic send reservation was unavailable.",
      metadata: { ...brainMetadata, reason: safeError(error), failClosed: true }
    });
    await recordConversationSafetyOutcomeSafely({
      lead,
      providerMessageId,
      conversationIntent: decision.conversationIntent,
      noReplySafetySuppression: true,
      suppressionReason: "reply_reservation_unavailable"
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "Atomic reply reservation unavailable; no auto-reply was sent.",
      reply: "",
      terminalOutcome: "unexpected_no_send",
      externalSendAttempted: false
    };
  }

  let externalSendCompleted = false;
  try {
    logWhatsApp("whatsapp_auto_reply_send_payload_summary", getWhatsAppSendPayloadSummary(senderPhone, reply));
    logWhatsApp("whatsapp_auto_reply_send_started", { providerMessageId, leadId: lead.id });
    const sent = await adapter.sendReply(senderPhone, reply);
    externalSendCompleted = true;
    replyLeaseCooldownSeconds = WHATSAPP_REPLY_COOLDOWN_SECONDS;
    logWhatsApp("whatsapp_auto_reply_sent", { providerMessageId, leadId: lead.id, outboundProviderMessageId: sent.providerMessageId || "" });
    try {
      await completeWhatsAppConversationReplyReservation({
        reservationId: replyReservationId,
        status: "sent",
        outboundProviderMessageId: sent.providerMessageId || undefined
      });
    } catch (error) {
      logWhatsAppError("reply_reservation_completion", {
        providerMessageId,
        leadId: lead.id,
        reservationId: replyReservationId,
        reason: safeError(error),
        externalSendCompleted: true
      });
    }
    const savedOutboundMessage = await saveLeadMessage({
      leadId: lead.id,
      direction: "outbound",
      body: reply,
      safeToSend: true,
      providerMessageId: sent.providerMessageId || undefined,
      whatsappStatus: "sent",
      metadata: {
        inboundProviderMessageId: replyTriggerProviderMessageId,
        leaseOwnerInboundProviderMessageId: providerMessageId,
        outboundProviderMessageId: sent.providerMessageId,
        mode: sent.mode,
        aiGeneratedReply: true,
        aiQualityEventId: liveQualityEventId,
        aiShadowQualityEventId: shadowQualityEventId,
        ...decision.blackBoxTrace,
        final_send_result: "sent"
      }
    });
    await linkAiQualityObservationsToMessage({
      qualityEventIds: [liveQualityEventId, shadowQualityEventId],
      messageId: savedOutboundMessage.id
    }).catch(() => false);
    await auditWhatsApp({
      action: "whatsapp_auto_reply_sent",
      leadId: lead.id,
      summary: "WhatsApp auto-reply sent after safety validation.",
      metadata: { ...brainMetadata, outboundProviderMessageId: sent.providerMessageId, final_send_result: "sent" }
    });
    await recordConversationSafetyOutcomeSafely({
      lead,
      providerMessageId,
      conversationIntent: decision.conversationIntent,
      acknowledgementIntent: decision.acknowledgementIntent,
      replySent: true,
      replySignature: decision.replySignature || String(decision.blackBoxTrace.finalReplyHash ?? "")
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_sent",
      reason: "WhatsApp auto-reply sent after safety validation.",
      reply,
      terminalOutcome: "outbound_sent",
      externalSendAttempted: true
    };
  } catch (error) {
    const sendError = safeSendErrorMetadata(error);
    if (externalSendCompleted) {
      logWhatsAppError("auto_reply_post_send_persistence", {
        providerMessageId,
        leadId: lead.id,
        reason: safeError(error),
        externalSendCompleted: true,
        reservationId: replyReservationId
      });
      try {
        await auditWhatsApp({
          action: "whatsapp_auto_reply_post_send_persistence_failed",
          leadId: lead.id,
          summary: "Meta accepted the WhatsApp reply, but a later local persistence step failed and needs operator review.",
          metadata: {
            ...brainMetadata,
            providerMessageId,
            replyTriggerProviderMessageId,
            reservationId: replyReservationId,
            reason: safeError(error),
            externalSendCompleted: true,
            final_send_result: "sent_post_send_persistence_failed"
          }
        });
      } catch (auditError) {
        logWhatsAppError("auto_reply_post_send_persistence_audit", {
          providerMessageId,
          leadId: lead.id,
          reason: safeError(auditError),
          externalSendCompleted: true
        });
      }
      await recordConversationSafetyOutcomeSafely({
        lead,
        providerMessageId,
        conversationIntent: decision.conversationIntent,
        acknowledgementIntent: decision.acknowledgementIntent,
        replySent: true,
        replySignature: decision.replySignature || String(decision.blackBoxTrace.finalReplyHash ?? "")
      });
      return {
        providerMessageId,
        leadId: lead.id,
        status: "auto_reply_sent",
        reason: "WhatsApp auto-reply was sent, but post-send persistence needs operator review.",
        reply,
        terminalOutcome: "outbound_sent",
        externalSendAttempted: true
      };
    }
    try {
      await completeWhatsAppConversationReplyReservation({
        reservationId: replyReservationId,
        status: "failed",
        failureReason: safeError(error)
      });
    } catch (reservationError) {
      logWhatsAppError("reply_reservation_completion", {
        providerMessageId,
        leadId: lead.id,
        reservationId: replyReservationId,
        reason: safeError(reservationError),
        externalSendCompleted: false
      });
    }
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
        inboundProviderMessageId: replyTriggerProviderMessageId,
        leaseOwnerInboundProviderMessageId: providerMessageId,
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
      reply,
      terminalOutcome: "outbound_send_failed",
      externalSendAttempted: true
    };
  }
  } finally {
    try {
      await releaseWhatsAppConversationReplyLease({
        leadId: lead.id,
        ownerToken: replyLeaseOwnerToken,
        cooldownSeconds: replyLeaseCooldownSeconds
      });
    } catch (error) {
      logWhatsAppError("conversation_reply_lease_release", {
        providerMessageId,
        leadId: lead.id,
        reason: safeError(error),
        leaseExpiresNaturally: true
      });
    }
  }
}
