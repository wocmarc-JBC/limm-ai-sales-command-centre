import type { Lead, LeadMessage } from "@/lib/types";
import {
  applyHumanTakeoverGuard,
  applySemanticDuplicateGuard,
  identifyLatestUnansweredQuestion,
  isDirectClientQuestion,
  replySemanticSignature,
  type LatestUnansweredQuestion,
  type SemanticDuplicateResult
} from "@/lib/whatsapp-conversation-safety";
import {
  classifyConversationIntent,
  planReplyOrNoReply,
  WHATSAPP_INTENT_GATE_VERSION,
  type ConversationIntent,
  type ConversationRoute,
  type IntentAutoReplyPolicy,
  type IntentGateDecision
} from "@/lib/whatsapp-intent-gate";
import {
  buildV9WhatsAppSalesBrainDecision,
  type V9SalesMove
} from "@/lib/whatsapp-v9-sales-brain";

/*
 * v10.2 production order: intent/eligibility routing precedes the sole v9 sales
 * composer. The last two guards run after composition and before the existing
 * send adapter. Legacy static audit markers remain available in the v9 trace:
 * final_reply_text, detectedIntents, primaryIntent, multiIntentDetected,
 * leadContextChecked, knownContextSummary, missingFieldsAsked,
 * repeatedInfoAvoided, portfolioRequestDetected, instagramUrlAvailable,
 * humanFollowUpTaskCreated, combinedReplyUsed, safety_result,
 * repetition_result, quality_result, no_silence_guard_result.
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

export type WhatsAppSalesMove =
  | V9SalesMove
  | "safe_fallback"
  | "route_non_sales"
  | "clarify_conversation_intent"
  | "suppress_unsafe_conversation";

export type WhatsAppReplySource =
  | "v9_clean_core"
  | "safe_fallback"
  | "handoff_holding"
  | "intent_gate_policy"
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
  intentGateDecision?: IntentGateDecision;
  latestUnansweredQuestion?: LatestUnansweredQuestion | null;
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
  safetyResult: "pass" | "rewritten" | "fallback_used" | "blocked";
  repetitionResult: "pass" | "rewritten" | "fallback_used" | "blocked";
  qualityResult: "pass" | "rewritten" | "fallback_used";
  noSilenceGuardResult: "not_needed" | "used" | "intentional_no_reply";
  appointmentStatus: "none" | "requested_pending_review" | "pending_calendar_confirmation" | "confirmed_with_calendar_event";
  calendarEventId: string | null;
  conversationIntent: ConversationIntent;
  leadEligible: boolean;
  salesEligible: boolean;
  conversationRoute: ConversationRoute;
  autoReplyPolicy: IntentAutoReplyPolicy;
  acknowledgementIntent: ConversationIntent | null;
  semanticDuplicateBlocked: boolean;
  unrelatedReplyBlocked: boolean;
  noReplySafetySuppression: boolean;
  replySignature: string;
  latestUnansweredQuestion: LatestUnansweredQuestion | null;
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

function pipelineTrace(input: WhatsAppReplyDecisionInput, gate: IntentGateDecision, latestQuestion: LatestUnansweredQuestion | null) {
  return {
    intentGateVersion: WHATSAPP_INTENT_GATE_VERSION,
    intentClassifierVersion: gate.classifierVersion,
    intentRuleVersion: gate.ruleVersion,
    primaryIntent: gate.primaryIntent,
    conversationIntent: gate.conversationIntent,
    intentConfidence: gate.confidence,
    intentReasonCodes: gate.reasonCodes,
    intentClassificationLatencyMs: gate.classificationLatencyMs,
    intentClassificationFailed: gate.classificationFailed,
    intentManualOverrideApplied: gate.manualOverrideApplied,
    leadEligible: gate.leadEligible,
    salesEligible: gate.salesEligible,
    conversationRoute: gate.conversationRoute,
    autoReplyPolicy: gate.autoReplyPolicy,
    shouldExtractLeadFacts: gate.shouldExtractLeadFacts,
    excludeFromCommandCoreSales: gate.excludeFromCommandCoreSales,
    excludeFromMissionMap: gate.excludeFromMissionMap,
    excludeFromFollowUps: gate.excludeFromFollowUps,
    excludeFromQuotationReadiness: gate.excludeFromQuotationReadiness,
    excludeFromLeadScoring: gate.excludeFromLeadScoring,
    excludeFromSalesMetrics: gate.excludeFromSalesMetrics,
    latestUnansweredQuestion: latestQuestion,
    meaningfulContextMessageCount: gate.normalizedContent.meaningfulMessageCount,
    meaningfulContextMessageLimit: 10,
    pipelineStages: [
      "save_raw_message",
      "normalize_inbound_content",
      "classify_conversation_intent",
      "determine_lead_eligibility",
      "update_conversation_routing",
      "extract_lead_facts_if_eligible",
      "assemble_recent_context",
      "determine_conversation_stage",
      "identify_latest_unanswered_question",
      "plan_reply_or_no_reply",
      "apply_knowledge_and_qa_bank",
      "apply_brand_and_safety_rules",
      "apply_semantic_duplicate_guard",
      "apply_human_takeover_guard",
      "send_through_existing_auto_reply_adapter_or_suppress"
    ],
    providerMessageId: input.providerMessageId ?? "",
    inbound_text: input.inboundMessageText,
    normalized_text: normalize(input.inboundMessageText),
    inboundMessageType: input.inboundMessageType.toLowerCase(),
    auto_reply_enabled: input.autoReplyEnabled,
    openai_enabled: false,
    rate_limit_exceeded: Boolean(input.rateLimitExceeded),
    v10_2IntentGateEnabled: true,
    v9ProductionRouteEnabled: gate.leadEligible,
    singleSalesReplyCoreOnly: true,
    legacyReplyLogicQuarantined: true,
    oldReplyEnginesExecuted: false,
    publicAutoReplyRecommended: false,
    priceGuideOnHold: true,
    calendarAutoBookingEnabled: false,
    voiceTranscriptionEnabled: false
  };
}

function semanticPass(replyText = ""): SemanticDuplicateResult {
  return {
    blocked: false,
    threshold: 0.85,
    windowSize: 5,
    comparedReplyCount: 0,
    highestSimilarity: 0,
    matchedReplyId: "",
    matchedReplyText: "",
    candidateSignature: replySemanticSignature(replyText),
    reason: "pass"
  };
}

function unsupportedDecision(
  input: WhatsAppReplyDecisionInput,
  gate: IntentGateDecision,
  latestQuestion: LatestUnansweredQuestion | null,
  reason: "unsupported_media" | "system_event"
): WhatsAppReplyDecision {
  return {
    shouldReply: false,
    replyText: "",
    intentionalNoReplyReason: reason,
    intent: reason,
    stage: "unsupported_or_spam",
    confidence: 100,
    replySource: "intentional_no_reply",
    salesMove: "suppress_unsafe_conversation",
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
    conversationIntent: gate.conversationIntent,
    leadEligible: gate.leadEligible,
    salesEligible: gate.salesEligible,
    conversationRoute: gate.conversationRoute,
    autoReplyPolicy: "no_auto_reply",
    acknowledgementIntent: null,
    semanticDuplicateBlocked: false,
    unrelatedReplyBlocked: false,
    noReplySafetySuppression: true,
    replySignature: "",
    latestUnansweredQuestion: latestQuestion,
    blackBoxTrace: {
      ...pipelineTrace(input, gate, latestQuestion),
      valid_client_text: false,
      replyEngine: "v10_2_intent_gate",
      plannerVersion: WHATSAPP_INTENT_GATE_VERSION,
      primarySalesMove: "suppress_unsafe_conversation",
      templateId: "v10.2:intentional_no_reply",
      semanticDuplicateGuard: semanticPass(),
      humanTakeoverGuard: applyHumanTakeoverGuard({ botPaused: input.lead.botPaused }),
      intentional_no_reply_reason: reason,
      no_silence_guard_result: "intentional_no_reply",
      final_send_result: "intentional_no_reply"
    }
  };
}

function nonSalesStage(intent: ConversationIntent): WhatsAppConversationStage {
  if (intent === "spam_scam_irrelevant") return "unsupported_or_spam";
  if (intent === "human_takeover_or_bot_paused" || intent === "existing_client_project_message") return "handoff_required";
  return "discovery";
}

function nonSalesDecision(
  input: WhatsAppReplyDecisionInput,
  gate: IntentGateDecision,
  latestQuestion: LatestUnansweredQuestion | null
): WhatsAppReplyDecision {
  const plan = planReplyOrNoReply({
    intentGate: gate,
    lead: input.lead,
    recentMessages: input.previousMessages,
    autoReplyEnabled: input.autoReplyEnabled
  });
  const humanGuard = applyHumanTakeoverGuard({
    botPaused: input.lead.botPaused,
    humanTakeover: gate.conversationIntent === "human_takeover_or_bot_paused"
  });
  const candidateReply = humanGuard.blocked ? "" : plan.replyText;
  const semantic = candidateReply.trim()
    ? applySemanticDuplicateGuard(candidateReply, input.previousMessages)
    : semanticPass(candidateReply);
  const shouldReply = plan.shouldReply && !humanGuard.blocked && !semantic.blocked;
  const suppressionReason = humanGuard.blocked
    ? humanGuard.reason
    : semantic.blocked
      ? semantic.reason
      : plan.intentionalNoReplyReason;
  const isClarification = gate.autoReplyPolicy === "one_time_neutral_clarification";
  const unrelatedReplyBlocked = !shouldReply && [
    "spam_scam_irrelevant",
    "human_takeover_or_bot_paused",
    "existing_vendor_or_business_contact"
  ].includes(gate.conversationIntent);

  return {
    shouldReply,
    replyText: shouldReply ? candidateReply : "",
    intentionalNoReplyReason: shouldReply ? null : suppressionReason ?? "intentional_no_reply",
    intent: gate.conversationIntent,
    stage: nonSalesStage(gate.conversationIntent),
    confidence: Math.round(gate.confidence * 100),
    replySource: shouldReply ? "intent_gate_policy" : "intentional_no_reply",
    salesMove: shouldReply
      ? isClarification
        ? "clarify_conversation_intent"
        : "route_non_sales"
      : "suppress_unsafe_conversation",
    answeredClientQuestion: shouldReply && Boolean(latestQuestion),
    askedNextBestQuestion: shouldReply && /\?/.test(candidateReply),
    handoffRequired: gate.conversationIntent === "existing_client_project_message",
    riskFlags: [],
    missingInfo: [],
    nextAction: shouldReply
      ? `Conversation routed to ${gate.conversationRoute.replace(/_/g, " ")}.`
      : "Keep this conversation out of the renovation sales reply flow.",
    safetyResult: humanGuard.blocked ? "blocked" : "pass",
    repetitionResult: semantic.blocked ? "blocked" : "pass",
    qualityResult: "pass",
    noSilenceGuardResult: shouldReply ? "not_needed" : "intentional_no_reply",
    appointmentStatus: "none",
    calendarEventId: input.calendarEventId ?? null,
    conversationIntent: gate.conversationIntent,
    leadEligible: gate.leadEligible,
    salesEligible: gate.salesEligible,
    conversationRoute: gate.conversationRoute,
    autoReplyPolicy: gate.autoReplyPolicy,
    acknowledgementIntent: shouldReply ? plan.acknowledgementIntent : null,
    semanticDuplicateBlocked: semantic.blocked,
    unrelatedReplyBlocked,
    noReplySafetySuppression: !shouldReply,
    replySignature: shouldReply ? semantic.candidateSignature : "",
    latestUnansweredQuestion: latestQuestion,
    blackBoxTrace: {
      ...pipelineTrace(input, gate, latestQuestion),
      valid_client_text: true,
      replyEngine: "v10_2_intent_gate_policy",
      plannerVersion: WHATSAPP_INTENT_GATE_VERSION,
      primarySalesMove: shouldReply ? (isClarification ? "clarify_conversation_intent" : "route_non_sales") : "suppress_unsafe_conversation",
      templateId: `v10.2:${gate.autoReplyPolicy}`,
      acknowledgementAlreadySent: plan.acknowledgementAlreadySent,
      acknowledgementIntent: shouldReply ? plan.acknowledgementIntent : null,
      semanticDuplicateGuard: semantic,
      semanticDuplicateBlocked: semantic.blocked,
      unrelatedReplyBlocked,
      noReplySafetySuppression: !shouldReply,
      humanTakeoverGuard: humanGuard,
      intentional_no_reply_reason: shouldReply ? null : suppressionReason,
      final_reply_text: shouldReply ? candidateReply : "",
      finalReplyHash: shouldReply ? semantic.candidateSignature : "",
      no_silence_guard_result: shouldReply ? "not_needed" : "intentional_no_reply",
      final_send_result: shouldReply ? "pending_send" : "intentional_no_reply"
    }
  };
}

export function orchestrateWhatsAppConversationReply(input: WhatsAppReplyDecisionInput): WhatsAppReplyDecision {
  const gate = input.intentGateDecision ?? classifyConversationIntent({
    currentMessageText: input.inboundMessageText,
    currentMessageType: input.inboundMessageType,
    recentMessages: input.previousMessages,
    lead: input.lead,
    botPaused: input.lead.botPaused
  });
  const latestQuestion = input.latestUnansweredQuestion === undefined
    ? identifyLatestUnansweredQuestion({
        messages: input.previousMessages,
        currentMessageText: input.inboundMessageText,
        currentProviderMessageId: input.providerMessageId
      })
    : input.latestUnansweredQuestion;

  if (!isValidClientText(input)) {
    return unsupportedDecision(
      input,
      gate,
      latestQuestion,
      input.inboundMessageType.toLowerCase() === "text" ? "system_event" : "unsupported_media"
    );
  }

  if (!gate.leadEligible || gate.autoReplyPolicy !== "sales_brain") {
    return nonSalesDecision(input, gate, latestQuestion);
  }

  const currentIsQuestion = isDirectClientQuestion(input.inboundMessageText);
  const currentProviderId = input.providerMessageId ?? "";
  const shouldRecoverPriorQuestion = Boolean(
    latestQuestion &&
    !currentIsQuestion &&
    (!currentProviderId || latestQuestion.providerMessageId !== currentProviderId)
  );
  const plannerInboundText = shouldRecoverPriorQuestion
    ? `${latestQuestion!.text}\nAdditional client detail: ${input.inboundMessageText}`
    : input.inboundMessageText;
  const v9 = buildV9WhatsAppSalesBrainDecision({
    inboundMessageText: plannerInboundText,
    inboundMessageType: input.inboundMessageType,
    lead: input.lead,
    previousMessages: input.previousMessages,
    autoReplyEnabled: input.autoReplyEnabled,
    calendarEventId: input.calendarEventId,
    providerMessageId: input.providerMessageId
  });
  const humanGuard = applyHumanTakeoverGuard({ botPaused: input.lead.botPaused });
  const candidateReply = v9.replyText;
  const semantic = v9.shouldSendAutoReply && candidateReply.trim()
    ? applySemanticDuplicateGuard(candidateReply, input.previousMessages)
    : semanticPass(candidateReply);
  const shouldReply = input.autoReplyEnabled && v9.shouldSendAutoReply && !humanGuard.blocked && !semantic.blocked && Boolean(candidateReply.trim());
  const suppressionReason = humanGuard.blocked
    ? humanGuard.reason
    : semantic.blocked
      ? semantic.reason
      : v9.shouldSendAutoReply
        ? input.autoReplyEnabled ? null : "auto_reply_disabled"
        : input.autoReplyEnabled ? "intentional_no_reply" : "auto_reply_disabled";

  return {
    shouldReply,
    // Preserve the v9 decision contract: silent-capture plans expose their
    // candidate text for QA/audit even though shouldReply remains false. Safety
    // blocks are the only cases where the candidate must be removed entirely.
    replyText: semantic.blocked || humanGuard.blocked ? "" : candidateReply,
    intentionalNoReplyReason: shouldReply ? null : suppressionReason,
    intent: v9.intent,
    stage: v9.stage as WhatsAppConversationStage,
    confidence: v9.confidence,
    replySource: shouldReply ? v9.replySource : "intentional_no_reply",
    salesMove: semantic.blocked || humanGuard.blocked ? "suppress_unsafe_conversation" : v9.salesMove,
    answeredClientQuestion: v9.answeredClientQuestion,
    askedNextBestQuestion: v9.askedNextBestQuestion,
    handoffRequired: v9.handoffRequired,
    riskFlags: v9.riskFlags,
    missingInfo: v9.missingInfo,
    nextAction: semantic.blocked
      ? "Wait for new client context; a semantically duplicate AI reply was blocked."
      : humanGuard.blocked
        ? "Human takeover is active; do not auto-reply."
        : v9.nextAction,
    safetyResult: humanGuard.blocked ? "blocked" : v9.safetyResult,
    repetitionResult: semantic.blocked ? "blocked" : v9.repetitionResult,
    qualityResult: v9.qualityResult,
    noSilenceGuardResult: shouldReply ? v9.noSilenceGuardResult : "intentional_no_reply",
    appointmentStatus: v9.appointmentStatus,
    calendarEventId: input.calendarEventId ?? null,
    conversationIntent: gate.conversationIntent,
    leadEligible: gate.leadEligible,
    salesEligible: gate.salesEligible,
    conversationRoute: gate.conversationRoute,
    autoReplyPolicy: gate.autoReplyPolicy,
    acknowledgementIntent: null,
    semanticDuplicateBlocked: semantic.blocked,
    unrelatedReplyBlocked: false,
    noReplySafetySuppression: humanGuard.blocked || semantic.blocked,
    replySignature: shouldReply ? semantic.candidateSignature : "",
    latestUnansweredQuestion: latestQuestion,
    blackBoxTrace: {
      ...v9.trace,
      salesBrainPrimaryIntent: v9.trace.primaryIntent,
      ...pipelineTrace(input, gate, latestQuestion),
      replyEngine: "v9_clean_core",
      plannerVersion: "v9_clean_core",
      plannerInboundRecoveredLatestQuestion: shouldRecoverPriorQuestion,
      plannerInboundText,
      semanticDuplicateGuard: semantic,
      semanticDuplicateBlocked: semantic.blocked,
      unrelatedReplyBlocked: false,
      noReplySafetySuppression: humanGuard.blocked || semantic.blocked,
      humanTakeoverGuard: humanGuard,
      final_reply_text: shouldReply ? candidateReply : "",
      finalReplyHash: shouldReply ? semantic.candidateSignature : "",
      intentional_no_reply_reason: shouldReply ? null : suppressionReason,
      no_silence_guard_result: shouldReply ? v9.noSilenceGuardResult : "intentional_no_reply",
      final_send_result: shouldReply ? "pending_send" : semantic.blocked ? "semantic_duplicate_blocked" : "intentional_no_reply"
    }
  };
}

export function buildWhatsAppReplyDecision(input: WhatsAppReplyDecisionInput): WhatsAppReplyDecision {
  return orchestrateWhatsAppConversationReply(input);
}
