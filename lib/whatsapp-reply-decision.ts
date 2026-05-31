import type { Lead, LeadMessage } from "@/lib/types";
import {
  coachWhatsAppReply,
  evaluateReplyQuality,
  NO_SILENCE_FALLBACK_REPLY,
  type WhatsAppConversationStage,
  type WhatsAppSalesMove
} from "@/lib/whatsapp-reply-coach";
import { validateWhatsAppAutoReply } from "@/lib/whatsapp-safety";

export type WhatsAppReplySource =
  | "reply_coach"
  | "question_bank"
  | "safe_fallback"
  | "quality_rewrite"
  | "repetition_rewrite"
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

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function previousOutbound(messages: LeadMessage[]) {
  return messages
    .filter((message) => message.direction === "outbound" && message.channel === "whatsapp")
    .slice(0, 3)
    .map((message) => message.body);
}

function similarity(a: string, b: string) {
  const left = new Set(normalise(a).split(" ").filter(Boolean));
  const right = new Set(normalise(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  const overlap = [...left].filter((word) => right.has(word)).length;
  return overlap / Math.max(left.size, right.size);
}

function isValidClientText(input: WhatsAppReplyDecisionInput) {
  if (input.inboundMessageType !== "text") return false;
  return normalise(input.inboundMessageText).length > 0;
}

function isSpamIntent(intent: string) {
  return intent === "spam_unrelated";
}

function riskFlagsFromIntents(intents: string[]) {
  return [
    intents.includes("price_question") ? "pricing_request" : "",
    intents.includes("appointment_request") || intents.includes("meeting_availability") ? "appointment_request" : "",
    intents.includes("hacking_wall") ? "structural_or_hacking_review" : "",
    intents.includes("approval_submission") ? "approval_or_submission_review" : "",
    intents.includes("portfolio_request") ? "portfolio_reference_request" : ""
  ].filter(Boolean);
}

function safeRewriteFor(intent: string) {
  if (intent === "price_question") {
    return "I understand you'd like a rough idea. To avoid giving you the wrong figure, we need to understand the scope, layout, site condition and material direction first. Could you send the floor plan, photos and the main areas you're planning to renovate for an initial project review?";
  }
  if (intent === "appointment_request" || intent === "site_visit_request") {
    return "We can help check availability. Before confirming a slot, could you share your property type, property area/address and basic renovation scope? The team will review availability before confirming for an initial project review.";
  }
  if (intent === "submission_approval") {
    return "It depends on the property type and exact scope. Some works may require proper checking or submission, so we should review the drawings, site condition and proposed changes before advising. Could you send the floor plan or a short description of the works for an initial project review?";
  }
  if (intent === "structural_wall" || intent === "hacking_demo") {
    return "We can help review it, but wall hacking should not be advised blindly because the wall type, services and structure need to be checked. Could you send the floor plan and photos of the wall so the team can review the next step for an initial project review?";
  }
  return NO_SILENCE_FALLBACK_REPLY;
}

export function buildWhatsAppReplyDecision(input: WhatsAppReplyDecisionInput): WhatsAppReplyDecision {
  const validText = isValidClientText(input);
  const baseTrace: Record<string, unknown> = {
    providerMessageId: input.providerMessageId ?? "",
    inbound_text: input.inboundMessageText,
    normalized_text: normalise(input.inboundMessageText),
    valid_client_text: validText,
    auto_reply_enabled: input.autoReplyEnabled,
    openai_enabled: input.openAiEnabled,
    rate_limit_exceeded: Boolean(input.rateLimitExceeded)
  };

  if (!validText) {
    return {
      shouldReply: false,
      replyText: "",
      intentionalNoReplyReason: input.inboundMessageType === "text" ? "system_event" : "unsupported_media",
      intent: input.inboundMessageType === "text" ? "system_event" : "unsupported_media",
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
        ...baseTrace,
        final_send_result: "intentional_no_reply",
        intentional_no_reply_reason: input.inboundMessageType === "text" ? "system_event" : "unsupported_media"
      }
    };
  }

  const coach = coachWhatsAppReply({
    inboundText: input.inboundMessageText,
    lead: input.lead,
    previousMessages: input.previousMessages,
    calendarEventId: input.calendarEventId
  });

  if (isSpamIntent(coach.intent)) {
    return {
      shouldReply: false,
      replyText: "",
      intentionalNoReplyReason: "spam",
      intent: coach.intent,
      stage: coach.stage,
      confidence: coach.confidence,
      replySource: "intentional_no_reply",
      salesMove: coach.salesMove,
      answeredClientQuestion: false,
      askedNextBestQuestion: false,
      handoffRequired: false,
      riskFlags: coach.riskFlags,
      missingInfo: coach.missingInfo,
      nextAction: "No auto-reply for spam or unrelated message.",
      safetyResult: "pass",
      repetitionResult: "pass",
      qualityResult: "pass",
      noSilenceGuardResult: "intentional_no_reply",
      appointmentStatus: "none",
      calendarEventId: input.calendarEventId ?? null,
      blackBoxTrace: {
        ...baseTrace,
        intent: coach.intent,
        conversation_stage: coach.stage,
        final_send_result: "intentional_no_reply",
        intentional_no_reply_reason: "spam"
      }
    };
  }

  let replyText = coach.replyText;
  let replySource: WhatsAppReplySource = coach.handoffRequired && coach.intent === "complaint_or_risk" ? "handoff_holding" : "reply_coach";
  let safetyResult: WhatsAppReplyDecision["safetyResult"] = "pass";
  let repetitionResult: WhatsAppReplyDecision["repetitionResult"] = "pass";
  let qualityResult: WhatsAppReplyDecision["qualityResult"] = "pass";
  let noSilenceGuardResult: WhatsAppReplyDecision["noSilenceGuardResult"] = "not_needed";
  const priorOutbound = previousOutbound(input.previousMessages);

  let safety = validateWhatsAppAutoReply(replyText, { calendarEventId: input.calendarEventId ?? "" });
  if (!safety.ok) {
    replyText = safeRewriteFor(coach.intent);
    replySource = "safe_fallback";
    safetyResult = "rewritten";
    safety = validateWhatsAppAutoReply(replyText, { calendarEventId: input.calendarEventId ?? "" });
  }

  const repeated = priorOutbound.some((previous) => normalise(previous) === normalise(replyText) || similarity(previous, replyText) > 0.9);
  if (repeated && coach.intent !== "follow_up_ping") {
    replyText = safeRewriteFor(coach.intent);
    replySource = "repetition_rewrite";
    repetitionResult = "rewritten";
  }

  let quality = evaluateReplyQuality({
    reply: replyText,
    intent: coach.intent,
    stage: coach.stage,
    previousReplies: priorOutbound,
    calendarEventId: input.calendarEventId
  });
  if (quality.rewriteRequired) {
    const qualityReply = safeRewriteFor(coach.intent);
    const rewrittenQuality = evaluateReplyQuality({
      reply: qualityReply,
      intent: coach.intent,
      stage: coach.stage,
      previousReplies: priorOutbound,
      calendarEventId: input.calendarEventId
    });
    replyText = qualityReply;
    quality = rewrittenQuality;
    replySource = "quality_rewrite";
    qualityResult = rewrittenQuality.rewriteRequired ? "fallback_used" : "rewritten";
  }

  if (!replyText.trim()) {
    replyText = NO_SILENCE_FALLBACK_REPLY;
    replySource = "safe_fallback";
    safetyResult = "fallback_used";
    noSilenceGuardResult = "used";
  }

  safety = validateWhatsAppAutoReply(replyText, { calendarEventId: input.calendarEventId ?? "" });
  if (!safety.ok) {
    replyText = NO_SILENCE_FALLBACK_REPLY;
    replySource = "safe_fallback";
    safetyResult = "fallback_used";
    noSilenceGuardResult = "used";
    safety = validateWhatsAppAutoReply(replyText, { calendarEventId: input.calendarEventId ?? "" });
  }

  const finalQuality = evaluateReplyQuality({
    reply: replyText,
    intent: coach.intent,
    stage: coach.stage,
    previousReplies: priorOutbound,
    calendarEventId: input.calendarEventId
  });

  return {
    shouldReply: input.autoReplyEnabled && validText && Boolean(replyText.trim()),
    replyText,
    intentionalNoReplyReason: null,
    intent: coach.intent,
    stage: coach.stage,
    confidence: coach.confidence,
    replySource,
    salesMove: coach.salesMove,
    answeredClientQuestion: finalQuality.answeredActualQuestion,
    askedNextBestQuestion: /\?/.test(replyText),
    handoffRequired: coach.handoffRequired,
    riskFlags: [...new Set([...coach.riskFlags, ...riskFlagsFromIntents(coach.detectedIntents)])],
    missingInfo: coach.missingInfo,
    nextAction: coach.nextAction,
    safetyResult,
    repetitionResult,
    qualityResult,
    noSilenceGuardResult,
    appointmentStatus: coach.appointmentStatus,
    calendarEventId: input.calendarEventId ?? null,
    blackBoxTrace: {
      ...baseTrace,
      inbound_text: input.inboundMessageText,
      detected_intent: coach.intent,
      detectedIntents: coach.detectedIntents,
      primaryIntent: coach.primaryIntent,
      multiIntentDetected: coach.multiIntentDetected,
      leadContextChecked: true,
      knownContextSummary: coach.leadContext.knownContextSummary,
      missingFieldsAsked: coach.missingFieldsAsked,
      repeatedInfoAvoided: coach.repeatedInfoAvoided,
      portfolioRequestDetected: coach.portfolioRequestDetected,
      instagramUrlAvailable: coach.instagramUrlAvailable,
      humanFollowUpTaskCreated: coach.humanFollowUpTaskCreated,
      humanFollowUpTaskSkippedReason: coach.humanFollowUpTaskSkippedReason,
      combinedReplyUsed: coach.combinedReplyUsed,
      conversation_stage: coach.stage,
      confidence: coach.confidence,
      selected_sales_move: coach.salesMove,
      reply_source: replySource,
      final_reply_text: replyText,
      safety_result: safetyResult,
      safety_errors: safety.errors,
      repetition_result: repetitionResult,
      quality_result: qualityResult,
      quality_score: finalQuality.qualityScore,
      no_silence_guard_result: noSilenceGuardResult,
      appointment_status: coach.appointmentStatus,
      handoff_required: coach.handoffRequired,
      intentional_no_reply_reason: null,
      final_send_result: "pending_send",
      error: ""
    }
  };
}
