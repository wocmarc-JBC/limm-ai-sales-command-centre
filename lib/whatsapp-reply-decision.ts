import type { Lead, LeadMessage } from "@/lib/types";
import {
  coachWhatsAppReply,
  evaluateReplyQuality,
  type WhatsAppConversationStage,
  type WhatsAppSalesMove
} from "@/lib/whatsapp-reply-coach";
import { validateWhatsAppAutoReply } from "@/lib/whatsapp-safety";
import { buildV6WhatsAppSalesBrainDecision } from "@/lib/whatsapp-v6/sales-brain";
import { buildV7WorldClassWhatsAppSalesBrainDecision } from "@/lib/whatsapp-v7-sales-brain";

export type WhatsAppReplySource =
  | "world_class_sales_brain"
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

const ULTRA_SAFE_MINIMAL_FALLBACK_REPLY =
  "Thanks for your message. The team will review the details and get back to you shortly. If you have site photos, design references or preferred timing, you can send them here too.";

const LEGACY_REPLY_TEMPLATE_PATTERNS = [
  /Giving a rough figure too early can be misleading/i,
  /To avoid giving (?:you )?the wrong figure/i,
  /Could you share the scope of work/i,
  /Could you share main renovation scope/i,
  /WhatsApp renovation enquiry pending review/i,
  /This is a at/i,
  /This is with/i
];

function containsLegacyReplyTemplate(text: string) {
  return LEGACY_REPLY_TEMPLATE_PATTERNS.some((pattern) => pattern.test(text));
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
  const type = input.inboundMessageType.toLowerCase();
  if (!["text", "image", "document", "video"].includes(type)) return false;
  return normalise(input.inboundMessageText).length > 0;
}

function isVoiceOrAudio(input: WhatsAppReplyDecisionInput) {
  const type = input.inboundMessageType.toLowerCase();
  return type === "audio" || type === "voice";
}

function isSinglish(text: string) {
  return /\b(how much ah|price ah|budget how|can make appt anot|can meet anot|got landed photo|got project photo|can hack wall or not|need approval meh|reno landed can|can do anot)\b/i.test(text);
}

function voiceFallbackReply() {
  return "Sorry, we're not able to listen to voice messages here. Could you type the key details instead, such as your property type, renovation scope, and preferred appointment timing for an initial project review?";
}

function mediaTrace(type: string) {
  const normalizedType = type.toLowerCase();
  return {
    inboundMessageType: normalizedType,
    mediaDetected: ["image", "document", "video", "audio", "voice"].includes(normalizedType),
    imageDetected: normalizedType === "image",
    documentDetected: normalizedType === "document",
    audioDetected: normalizedType === "audio",
    voiceMessageDetected: normalizedType === "voice" || normalizedType === "audio",
    voiceTranscriptionAttempted: false
  };
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
    return "I understand you'd like a rough idea. The team needs to review the project details, site condition and material direction first before advising. If you have site photos or design references, you can send them here too.";
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
  return ULTRA_SAFE_MINIMAL_FALLBACK_REPLY;
}

export function buildWhatsAppReplyDecision(input: WhatsAppReplyDecisionInput): WhatsAppReplyDecision {
  const validText = isValidClientText(input);
  const voiceMessage = isVoiceOrAudio(input);
  const baseTrace: Record<string, unknown> = {
    providerMessageId: input.providerMessageId ?? "",
    inbound_text: input.inboundMessageText,
    normalized_text: normalise(input.inboundMessageText),
    ...mediaTrace(input.inboundMessageType),
    valid_client_text: validText,
    auto_reply_enabled: input.autoReplyEnabled,
    openai_enabled: input.openAiEnabled,
    rate_limit_exceeded: Boolean(input.rateLimitExceeded),
    singlishDetected: isSinglish(input.inboundMessageText),
    replyLanguage: "professional_english",
    handoffEmailTriggered: false,
    handoffEmailSent: false,
    handoffEmailSkippedReason: "",
    handoffEmailCooldownApplied: false,
    handoffEmailToMasked: "",
    duplicateSuppressionReason: ""
  };

  if (voiceMessage) {
    const replyText = voiceFallbackReply();
    return {
      shouldReply: input.autoReplyEnabled,
      replyText,
      intentionalNoReplyReason: input.autoReplyEnabled ? null : "auto_reply_disabled",
      intent: "unsupported_media",
      stage: "unsupported_or_spam",
      confidence: 100,
      replySource: "safe_fallback",
      salesMove: "safe_fallback",
      answeredClientQuestion: true,
      askedNextBestQuestion: true,
      handoffRequired: true,
      riskFlags: ["voice_message_needs_typed_details"],
      missingInfo: ["property_type", "scope", "preferred_date_time"],
      nextAction: "Ask client to type key project and appointment details.",
      safetyResult: "pass",
      repetitionResult: "pass",
      qualityResult: "pass",
      noSilenceGuardResult: "not_needed",
      appointmentStatus: "none",
      calendarEventId: input.calendarEventId ?? null,
      blackBoxTrace: {
        ...baseTrace,
        valid_client_text: false,
        voiceMessageDetected: true,
        voiceTranscriptionAttempted: false,
        detected_intent: "voice_message",
        detectedIntents: ["unsupported_media"],
        primaryIntent: "unsupported_media",
        multiIntentDetected: false,
        leadContextChecked: true,
        knownContextSummary: "Voice/audio message received; content not transcribed.",
        missingFieldsAsked: ["property_type", "scope", "preferred_date_time"],
        repeatedInfoAvoided: [],
        contextUsedInReply: true,
        contextFromCurrentMessage: false,
        contextFromPreviousMessages: false,
        likelyFloorPlanDetected: false,
        likelySitePhotoDetected: false,
        likelyDesignReferenceDetected: false,
        repeatedInfoRequestPrevented: false,
        needsHuman: true,
        escalationReason: "voice_message_received",
        final_reply_text: replyText,
        reply_source: "safe_fallback",
        safety_result: "pass",
        repetition_result: "pass",
        quality_result: "pass",
        no_silence_guard_result: "not_needed",
        appointment_status: "none",
        handoff_required: true,
        final_send_result: "pending_send",
        error: ""
      }
    };
  }

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
        intentional_no_reply_reason: input.inboundMessageType === "text" ? "system_event" : "unsupported_media",
        duplicateSuppressionReason: input.inboundMessageType === "text" ? "" : "unsupported_media_without_caption"
      }
    };
  }

  const coach = coachWhatsAppReply({
    inboundText: input.inboundMessageText,
    lead: input.lead,
    previousMessages: input.previousMessages,
    calendarEventId: input.calendarEventId
  });
  const v6Decision = buildV6WhatsAppSalesBrainDecision({
    inboundMessageText: input.inboundMessageText,
    inboundMessageType: input.inboundMessageType,
    lead: input.lead,
    previousMessages: input.previousMessages,
    autoReplyEnabled: input.autoReplyEnabled,
    calendarEventId: input.calendarEventId,
    providerMessageId: input.providerMessageId
  });
  const v7Decision = buildV7WorldClassWhatsAppSalesBrainDecision({
    inboundMessageText: input.inboundMessageText,
    inboundMessageType: input.inboundMessageType,
    lead: input.lead,
    previousMessages: input.previousMessages,
    autoReplyEnabled: input.autoReplyEnabled,
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

  let usingV7Reply = Boolean(v7Decision.replyText.trim());
  let replyText = usingV7Reply ? v7Decision.replyText : ULTRA_SAFE_MINIMAL_FALLBACK_REPLY;
  let replySource: WhatsAppReplySource = usingV7Reply ? "world_class_sales_brain" : "safe_fallback";
  let templateId = usingV7Reply ? `v7:${v7Decision.salesMove}` : "ultra_safe_minimal_fallback";
  let blockedLegacyTemplate = false;
  let safetyResult: WhatsAppReplyDecision["safetyResult"] = "pass";
  let repetitionResult: WhatsAppReplyDecision["repetitionResult"] = "pass";
  let qualityResult: WhatsAppReplyDecision["qualityResult"] = "pass";
  let noSilenceGuardResult: WhatsAppReplyDecision["noSilenceGuardResult"] = "not_needed";
  const priorOutbound = previousOutbound(input.previousMessages);

  let safety = validateWhatsAppAutoReply(replyText, { calendarEventId: input.calendarEventId ?? "" });
  if (!safety.ok) {
    replyText = usingV7Reply ? ULTRA_SAFE_MINIMAL_FALLBACK_REPLY : safeRewriteFor(coach.intent);
    usingV7Reply = false;
    replySource = "safe_fallback";
    templateId = usingV7Reply ? "v7_safety_fallback" : "safe_rewrite";
    safetyResult = "rewritten";
    safety = validateWhatsAppAutoReply(replyText, { calendarEventId: input.calendarEventId ?? "" });
  }

  const repeated = priorOutbound.some((previous) => normalise(previous) === normalise(replyText) || similarity(previous, replyText) > 0.9);
  if (repeated && !usingV7Reply && coach.intent !== "follow_up_ping") {
    replyText = safeRewriteFor(coach.intent);
    replySource = "repetition_rewrite";
    templateId = "repetition_rewrite";
    repetitionResult = "rewritten";
  }

  let quality = evaluateReplyQuality({
    reply: replyText,
    intent: coach.intent,
    stage: coach.stage,
    previousReplies: priorOutbound,
    calendarEventId: input.calendarEventId
  });
  if (quality.rewriteRequired && !usingV7Reply) {
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
    templateId = "quality_rewrite";
    qualityResult = rewrittenQuality.rewriteRequired ? "fallback_used" : "rewritten";
  }

  if (!replyText.trim()) {
    replyText = ULTRA_SAFE_MINIMAL_FALLBACK_REPLY;
    usingV7Reply = false;
    replySource = "safe_fallback";
    templateId = "ultra_safe_no_silence_fallback";
    safetyResult = "fallback_used";
    noSilenceGuardResult = "used";
  }

  safety = validateWhatsAppAutoReply(replyText, { calendarEventId: input.calendarEventId ?? "" });
  if (!safety.ok) {
    replyText = ULTRA_SAFE_MINIMAL_FALLBACK_REPLY;
    usingV7Reply = false;
    replySource = "safe_fallback";
    templateId = "ultra_safe_final_safety_fallback";
    safetyResult = "fallback_used";
    noSilenceGuardResult = "used";
    safety = validateWhatsAppAutoReply(replyText, { calendarEventId: input.calendarEventId ?? "" });
  }

  if (containsLegacyReplyTemplate(replyText)) {
    replyText = ULTRA_SAFE_MINIMAL_FALLBACK_REPLY;
    usingV7Reply = false;
    replySource = "safe_fallback";
    templateId = "blocked_legacy_template_ultra_safe_fallback";
    blockedLegacyTemplate = true;
    safetyResult = "fallback_used";
    safety = validateWhatsAppAutoReply(replyText, { calendarEventId: input.calendarEventId ?? "" });
  }

  const finalQuality = evaluateReplyQuality({
    reply: replyText,
    intent: coach.intent,
    stage: coach.stage,
    previousReplies: priorOutbound,
    calendarEventId: input.calendarEventId
  });
  const detectedIntents = coach.detectedIntents;
  const needsHuman =
    coach.handoffRequired ||
    v6Decision.replyPlan.handoffNeeded ||
    coach.multiIntentDetected ||
    detectedIntents.some((intent) =>
      [
        "appointment_request",
        "meeting_availability",
        "price_question",
        "portfolio_request",
        "hacking_wall",
        "approval_submission",
        "landed_renovation",
        "landed_aa",
        "complaint_or_risk"
      ].includes(intent)
    ) ||
    coach.leadContext.hasImageOrDocument ||
    coach.confidence < 75;
  const escalationReason = [
    coach.handoffRequired ? "risk_or_complaint" : "",
    coach.multiIntentDetected ? "multi_intent_high_value_lead" : "",
    detectedIntents.includes("appointment_request") || detectedIntents.includes("meeting_availability") ? "appointment_request" : "",
    detectedIntents.includes("price_question") ? "price_budget_question" : "",
    detectedIntents.includes("portfolio_request") ? "portfolio_request" : "",
    detectedIntents.includes("hacking_wall") || detectedIntents.includes("approval_submission") ? "hacking_or_approval_question" : "",
    coach.leadContext.hasImageOrDocument ? "floor_plan_photo_or_document_received" : "",
    coach.confidence < 75 ? "bot_confidence_low" : ""
  ].filter(Boolean).join(" + ");

  return {
    shouldReply: input.autoReplyEnabled && validText && Boolean(replyText.trim()),
    replyText,
    intentionalNoReplyReason: null,
    intent: coach.intent,
    stage: coach.stage,
    confidence: coach.confidence,
    replySource,
    salesMove: coach.salesMove,
    answeredClientQuestion: usingV7Reply ? v7Decision.answeredClientQuestion : finalQuality.answeredActualQuestion,
    askedNextBestQuestion: usingV7Reply ? v7Decision.askedFields.length > 0 || /\?/.test(replyText) : /\?/.test(replyText),
    handoffRequired: needsHuman,
    riskFlags: [...new Set([...coach.riskFlags, ...riskFlagsFromIntents(coach.detectedIntents), ...v6Decision.understanding.detectedRisks])],
    missingInfo: v7Decision.missingInfo.length ? v7Decision.missingInfo : v6Decision.verifiedContext.missingFields.length ? v6Decision.verifiedContext.missingFields : coach.missingInfo,
    nextAction: usingV7Reply
      ? `Sales move: ${v7Decision.salesMove}. Ask only for missing info: ${v7Decision.askedFields.join(", ") || "none"}.`
      : v6Decision.replyPlan.askOnlyMissingInfo.length
      ? `Ask only for missing info: ${v6Decision.replyPlan.askOnlyMissingInfo.join(", ")}.`
      : coach.nextAction,
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
      v6_version: v6Decision.version,
      v7_version: v7Decision.version,
      replyEngine: usingV7Reply ? "v7_2_planner" : "ultra_safe_fallback",
      primaryMove: v7Decision.salesMove,
      templateId,
      usedPlanner: usingV7Reply,
      blockedLegacyTemplate,
      v7_detectedIntents: v7Decision.intents,
      v7_primaryIntent: v7Decision.primaryIntent,
      v7_stage: v7Decision.stage,
      v7_salesMove: v7Decision.salesMove,
      v7_normalizedContext: v7Decision.context,
      v7_askedFields: v7Decision.askedFields,
      v7_missingInfo: v7Decision.missingInfo,
      v7_repeatedQuestionRisk: v7Decision.repeatedQuestionRisk,
      v7_trace: v7Decision.trace,
      worldClassSalesConversationBrainAvailable: true,
      memoryFirstReplyComposerAvailable: true,
      knownInfoAcknowledgementBeforeQuestions: true,
      shortPingSmartReplyAvailable: true,
      confusionPingSmartReplyAvailable: true,
      alreadyToldYouRecoveryAvailable: true,
      budgetStatementNotPriceQuestionAvailable: true,
      contextAwareMissingInfoQuestionsAvailable: true,
      maxThreeQuestionsDefaultAvailable: true,
      genericFallbackReducedAvailable: true,
      v6_detectedIntents: v6Decision.understanding.detectedIntents,
      v6_detectedScopes: v6Decision.understanding.detectedScopes,
      v6_detectedRisks: v6Decision.understanding.detectedRisks,
      v6_clientQuestion: v6Decision.understanding.clientQuestion,
      v6_singlishDetected: v6Decision.understanding.singlishDetected,
      v6_chineseDetected: v6Decision.understanding.chineseDetected,
      v6_renovationShortformDetected: v6Decision.understanding.renovationShortformDetected,
      v6_verifiedContext: v6Decision.verifiedContext,
      v6_contextTruthGate: v6Decision.contextTruthGate,
      v6_replyPlan: v6Decision.replyPlan,
      v6_safetyGovernor: v6Decision.safety,
      v6_qualityJudge: v6Decision.quality,
      humanLikeSalesBrainAvailable: true,
      contextTruthGateAvailable: true,
      singaporeRenovationMeaningBrainAvailable: true,
      naturalReplyComposerAvailable: true,
      safetyGovernorAvailable: true,
      replyQualityJudgeAvailable: true,
      overClaimPreventionAvailable: true,
      primaryIntent: coach.primaryIntent,
      multiIntentDetected: coach.multiIntentDetected,
      leadContextChecked: true,
      knownContextSummary: coach.leadContext.knownContextSummary,
      knownPropertyType: coach.leadContext.knownPropertyType,
      inboundMessageType: input.inboundMessageType,
      mediaDetected: coach.leadContext.hasMedia || mediaTrace(input.inboundMessageType).mediaDetected,
      imageDetected: coach.leadContext.hasImageOrDocument || mediaTrace(input.inboundMessageType).imageDetected,
      documentDetected: mediaTrace(input.inboundMessageType).documentDetected,
      audioDetected: false,
      voiceMessageDetected: false,
      likelyFloorPlanDetected: coach.leadContext.likelyFloorPlan || coach.leadContext.hasFloorPlan,
      likelySitePhotoDetected: coach.leadContext.likelySitePhoto || coach.leadContext.hasSitePhotos,
      likelyDesignReferenceDetected: coach.leadContext.likelyDesignReference || coach.leadContext.hasDesignReferences,
      contextFromCurrentMessage: coach.leadContext.contextFromCurrentMessage,
      contextFromPreviousMessages: coach.leadContext.contextFromPreviousMessages,
      contextUsedInReply: true,
      missingFieldsAsked: coach.missingFieldsAsked,
      repeatedInfoAvoided: coach.repeatedInfoAvoided,
      repeatedInfoRequestPrevented: coach.repeatedInfoAvoided.length > 0,
      portfolioRequestDetected: coach.portfolioRequestDetected,
      instagramUrlAvailable: coach.instagramUrlAvailable,
      humanFollowUpTaskCreated: coach.humanFollowUpTaskCreated,
      humanFollowUpTaskSkippedReason: coach.humanFollowUpTaskSkippedReason,
      combinedReplyUsed: coach.combinedReplyUsed,
      singlishDetected: isSinglish(input.inboundMessageText),
      replyLanguage: "professional_english",
      needsHuman,
      escalationReason: escalationReason || v6Decision.replyPlan.handoffReason.join(" + "),
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
      handoff_required: needsHuman,
      intentional_no_reply_reason: null,
      final_send_result: "pending_send",
      error: ""
    }
  };
}
