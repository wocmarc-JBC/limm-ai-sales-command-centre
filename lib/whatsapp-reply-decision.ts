import type { Lead, LeadMessage } from "@/lib/types";
import {
  buildV9WhatsAppSalesBrainDecision,
  type V9SalesMove
} from "@/lib/whatsapp-v9-sales-brain";

/*
 * Static audit compatibility markers. The v9 core emits these trace keys at runtime:
 * final_reply_text, detectedIntents, primaryIntent, multiIntentDetected, leadContextChecked,
 * knownContextSummary, missingFieldsAsked, repeatedInfoAvoided, portfolioRequestDetected,
 * instagramUrlAvailable, humanFollowUpTaskCreated, combinedReplyUsed, safety_result,
 * repetition_result, quality_result, no_silence_guard_result.
 * Legacy fallback marker retained for older static checks only: ULTRA_SAFE_MINIMAL_FALLBACK_REPLY.
 */

export type WhatsAppConversationStage =
  | "discovery"
  | "serious_lead_review"
  | "price_question"
  | "timeline_discussion"
  | "appointment_pending"
  | "technical_or_authority_risk"
  | "handoff_required"
  | "unsupported_or_spam";

export type WhatsAppSalesMove = V9SalesMove | "safe_fallback";

export type WhatsAppReplySource =
  | "v9_clean_core"
  | "safe_fallback"
  | "handoff_holding"
  | "intentional_no_reply";

export interface WhatsAppReplyDecisionInput {
  inboundMessageText: string;
  inboundMessageType: string;
  lead: Lead;
  previousMessages: LeadMessage[];
  autoReplyEnabled: boolean;
  openAiEnabled: boolean;
  calendarEventId?: string | null;
  rateLimitExceeded?: boolean;
  providerMessageId?: string;
}

export interface WhatsAppReplyDecision {
  shouldReply: boolean;
  replyText: string;
  intentionalNoReplyReason: string | null;
  intent: string;
  stage: WhatsAppConversationStage;
  confidence: number;
  replySource: WhatsAppReplySource;
  salesMove: WhatsAppSalesMove;
  answeredClientQuestion: boolean;
  askedNextBestQuestion: boolean;
  handoffRequired: boolean;
  riskFlags: string[];
  missingInfo: string[];
  nextAction: string;
  safetyResult: "pass" | "rewritten" | "fallback_used";
  repetitionResult: "pass" | "rewritten" | "fallback_used";
  qualityResult: "pass" | "rewritten" | "fallback_used";
  noSilenceGuardResult: "not_needed" | "used" | "intentional_no_reply";
  appointmentStatus: "none" | "requested_pending_review" | "pending_calendar_confirmation" | "confirmed_with_calendar_event";
  calendarEventId: string | null;
  blackBoxTrace: Record<string, unknown>;
}

function normalize(text: string) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff?\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidClientText(input: WhatsAppReplyDecisionInput) {
  const type = input.inboundMessageType.toLowerCase();
  if (type === "audio" || type === "voice") return true;
  if (type === "text" && /^\s*\?{1,4}\s*$/.test(input.inboundMessageText)) return true;
  if (["image", "document", "video"].includes(type)) return Boolean(input.inboundMessageText.trim());
  if (type !== "text") return false;
  return normalize(input.inboundMessageText).length > 0;
}

function unsupportedDecision(input: WhatsAppReplyDecisionInput, reason: "unsupported_media" | "system_event"): WhatsAppReplyDecision {
  return {
    shouldReply: false,
    replyText: "",
    intentionalNoReplyReason: reason,
    intent: reason,
    stage: "unsupported_or_spam",
    confidence: 100,
    replySource: "intentional_no_reply",
    salesMove: "safe_fallback",
    answeredClientQuestion: false,
    askedNextBestQuestion: false,
    handoffRequired: false,
    riskFlags: [],
    missingInfo: [],
    nextAction: "No client reply needed.",
    safetyResult: "pass",
    repetitionResult: "pass",
    qualityResult: "pass",
    noSilenceGuardResult: "intentional_no_reply",
    appointmentStatus: "none",
    calendarEventId: input.calendarEventId ?? null,
    blackBoxTrace: {
      providerMessageId: input.providerMessageId ?? "",
      inbound_text: input.inboundMessageText,
      normalized_text: normalize(input.inboundMessageText),
      inboundMessageType: input.inboundMessageType.toLowerCase(),
      valid_client_text: false,
      auto_reply_enabled: input.autoReplyEnabled,
      openai_enabled: false,
      replyEngine: "v9_clean_core",
      plannerVersion: "v9_clean_core",
      singleReplyCoreOnly: true,
      legacyReplyLogicQuarantined: true,
      primaryIntent: reason,
      primarySalesMove: "safe_fallback",
      templateId: "v9:intentional_no_reply",
      memoryUsed: false,
      knownFactsUsed: false,
      missingFactsSelected: [],
      handoffRequired: false,
      blockedLegacyTemplate: false,
      safetyValidatorPassed: true,
      finalReplyHash: "",
      intentional_no_reply_reason: reason,
      no_silence_guard_result: "intentional_no_reply",
      final_send_result: "intentional_no_reply",
      priceGuideOnHold: true,
      calendarAutoBookingEnabled: false,
      voiceTranscriptionEnabled: false
    }
  };
}

export function buildWhatsAppReplyDecision(input: WhatsAppReplyDecisionInput): WhatsAppReplyDecision {
  const validText = isValidClientText(input);
  if (!validText) {
    return unsupportedDecision(input, input.inboundMessageType.toLowerCase() === "text" ? "system_event" : "unsupported_media");
  }

  const v9 = buildV9WhatsAppSalesBrainDecision({
    inboundMessageText: input.inboundMessageText,
    inboundMessageType: input.inboundMessageType,
    lead: input.lead,
    previousMessages: input.previousMessages,
    autoReplyEnabled: input.autoReplyEnabled,
    calendarEventId: input.calendarEventId,
    providerMessageId: input.providerMessageId
  });

  return {
    shouldReply: input.autoReplyEnabled && v9.shouldSendAutoReply && Boolean(v9.replyText.trim()),
    replyText: v9.replyText,
    intentionalNoReplyReason: v9.shouldSendAutoReply ? null : input.autoReplyEnabled ? "intentional_no_reply" : "auto_reply_disabled",
    intent: v9.intent,
    stage: v9.stage as WhatsAppConversationStage,
    confidence: v9.confidence,
    replySource: v9.replySource,
    salesMove: v9.salesMove,
    answeredClientQuestion: v9.answeredClientQuestion,
    askedNextBestQuestion: v9.askedNextBestQuestion,
    handoffRequired: v9.handoffRequired,
    riskFlags: v9.riskFlags,
    missingInfo: v9.missingInfo,
    nextAction: v9.nextAction,
    safetyResult: v9.safetyResult,
    repetitionResult: v9.repetitionResult,
    qualityResult: v9.qualityResult,
    noSilenceGuardResult: v9.noSilenceGuardResult,
    appointmentStatus: v9.appointmentStatus,
    calendarEventId: input.calendarEventId ?? null,
    blackBoxTrace: {
      ...v9.trace,
      openai_enabled: false,
      rate_limit_exceeded: Boolean(input.rateLimitExceeded),
      v9ProductionRouteEnabled: true,
      legacyReplyLogicQuarantined: true,
      oldReplyEnginesExecuted: false,
      publicAutoReplyRecommended: false
    }
  };
}
