import type { Lead, LeadMessage } from "@/lib/types";
import { matchQuestionBankIntent, type QuestionBankIntentKey } from "@/lib/whatsapp-question-bank";
import { validateWhatsAppAutoReply } from "@/lib/whatsapp-safety";

export type WhatsAppConversationStage =
  | "new_lead"
  | "scope_discovery"
  | "design_discussion"
  | "price_pressure"
  | "appointment_request"
  | "appointment_pending"
  | "appointment_followup"
  | "technical_risk"
  | "authority_risk"
  | "timeline_pressure"
  | "complaint_or_legal"
  | "unclear_or_low_context"
  | "unsupported_or_spam";

export type WhatsAppSalesMove =
  | "answer_and_collect_scope"
  | "answer_design_direction_and_request_refs"
  | "safe_price_deflection_and_collect_info"
  | "appointment_pending_review"
  | "appointment_followup_pending_review"
  | "warm_ping_reassurance"
  | "general_greeting_and_discovery"
  | "technical_caution_and_collect_drawings"
  | "authority_caution_and_collect_scope"
  | "timeline_caution_and_collect_scope"
  | "complaint_or_legal_handoff"
  | "clarify_unclear_request"
  | "safe_fallback";

export interface WhatsAppReplyCoachInput {
  inboundText: string;
  lead: Lead;
  previousMessages: LeadMessage[];
  calendarEventId?: string | null;
  forceVariant?: "normal" | "quality" | "repetition" | "safety";
}

export interface WhatsAppReplyQualityResult {
  qualityScore: number;
  answeredActualQuestion: boolean;
  warmHumanTone: boolean;
  asksOnlyUsefulNextQuestion: boolean;
  safe: boolean;
  notRepetitive: boolean;
  rewriteRequired: boolean;
  rewriteReason: string | null;
}

export interface WhatsAppReplyCoachResult {
  intent: QuestionBankIntentKey;
  stage: WhatsAppConversationStage;
  confidence: number;
  salesMove: WhatsAppSalesMove;
  replyText: string;
  missingInfo: string[];
  riskFlags: string[];
  nextAction: string;
  handoffRequired: boolean;
  appointmentStatus: "none" | "requested_pending_review" | "pending_calendar_confirmation" | "confirmed_with_calendar_event";
  quality: WhatsAppReplyQualityResult;
}

export const NO_SILENCE_FALLBACK_REPLY =
  "Thanks for your message. I'll help route this properly. Could you send your property type, basic renovation scope, and any floor plan or site photos if available? The team can then review the next step for an initial project review.";

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function questionCount(reply: string) {
  return (reply.match(/\?/g) ?? []).length;
}

function previousOutbound(input: WhatsAppReplyCoachInput) {
  return input.previousMessages
    .filter((message) => message.direction === "outbound" && message.channel === "whatsapp")
    .slice(0, 3)
    .map((message) => message.body);
}

function similarity(leftText: string, rightText: string) {
  const left = new Set(normalise(leftText).split(" ").filter(Boolean));
  const right = new Set(normalise(rightText).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  const overlap = [...left].filter((word) => right.has(word)).length;
  return overlap / Math.max(left.size, right.size);
}

export function detectReplyCoachIntent(text: string): QuestionBankIntentKey {
  const normalized = normalise(text);
  if (!normalized) return "unsupported";
  if (has(normalized, /\b(refund|lawyer|complaint|unhappy|angry|defect|your work.*problem)\b/i)) return "complaint_or_risk";
  if (has(normalized, /\b(how much|roughly|price|cost|estimate|quotation|quote|package|budget)\b/i)) return "price_question";
  if (has(normalized, /\b(need approval|can approve|ura|bca|submission|permit|will this pass|will pass)\b/i)) return "submission_approval";
  if (has(normalized, /\b(hack wall|remove wall|structural wall|load bearing|need pe|pe endorsement|beam|column)\b/i)) return "structural_wall";
  if (has(normalized, /\b(can hack|hacking|demolish|demolition|debris|disposal)\b/i)) return "hacking_demo";
  if (has(normalized, /\b(finish in|how long|finish fast|complete before|before cny|timeline|urgent|rush)\b/i)) return "timeline_question";
  if (has(normalized, /\b(next available|meeting|meet|appt|appointment|wed|wednesday|tomorrow|slot|2pm|3pm|confirm.*(?:am|pm)|confirm.*wed)\b/i)) return "appointment_request";
  if (has(normalized, /\b(site visit|come site|come down|visit my place|site discussion)\b/i)) return "site_visit_request";
  if (has(normalized, /\b(design theme|design concept|style|modern luxury|japandi|minimalist|moodboard)\b/i)) return "design_theme";
  if (has(normalized, /\b(floor plan|photos|attached|layout|drawing|sent photo|see attached|i have plan)\b/i)) return "floorplan_or_photos_sent";
  if (has(normalized, /\b(are you there|hello|hi|can reply|any update|still there|\?)\b/i) && normalized.length <= 32) return "follow_up_ping";
  if (has(normalized, /\b(a a|aa|addition|alteration|extension|extend kitchen|add shelter|roofline|rebuild)\b/i)) return "aa_works";
  if (has(normalized, /\b(landed|terrace|semi d|bungalow|corner terrace|inter terrace)\b/i)) return "landed_renovation";
  if (has(normalized, /\b(commercial|office|shop|clinic|restaurant|retail|treatment room|reception)\b/i)) return "commercial_renovation";
  if (has(normalized, /\b(condo|apartment|mcst|condominium)\b/i)) return "condo_renovation";
  if (has(normalized, /\b(carpentry|wardrobe|cabinet|kitchen cabinet|feature wall|vanity|shelving)\b/i)) return "carpentry";
  if (has(normalized, /\b(water leaking|leak|drainage|waterproofing|roof leaking|seepage|ponding)\b/i)) return "waterproofing_drainage_roof";
  if (has(normalized, /\b(toilet|bathroom|wet kitchen|dry kitchen|kitchen|washroom|wc)\b/i)) return "bathroom_kitchen";
  if (has(normalized, /\b(crypto|loan|investment|casino|job offer|marketing)\b/i)) return "spam_unrelated";
  return matchQuestionBankIntent(text).entry.intent_key;
}

export function detectConversationStage(intent: QuestionBankIntentKey, text: string): WhatsAppConversationStage {
  const normalized = normalise(text);
  if (intent === "complaint_or_risk") return "complaint_or_legal";
  if (intent === "price_question") return "price_pressure";
  if (intent === "design_theme") return "design_discussion";
  if (intent === "submission_approval") return "authority_risk";
  if (intent === "structural_wall" || intent === "hacking_demo" || intent === "aa_works") return "technical_risk";
  if (intent === "timeline_question") return "timeline_pressure";
  if (intent === "appointment_request" || intent === "site_visit_request") {
    return has(normalized, /\b(next available|confirm|already|when)\b/i) ? "appointment_followup" : "appointment_request";
  }
  if (intent === "follow_up_ping") return "scope_discovery";
  if (intent === "spam_unrelated" || intent === "unsupported_media") return "unsupported_or_spam";
  if (intent === "unsupported") return "unclear_or_low_context";
  return "scope_discovery";
}

export function selectSalesMove(stage: WhatsAppConversationStage, intent: QuestionBankIntentKey): WhatsAppSalesMove {
  if (stage === "price_pressure") return "safe_price_deflection_and_collect_info";
  if (stage === "design_discussion") return "answer_design_direction_and_request_refs";
  if (stage === "appointment_request") return "appointment_pending_review";
  if (stage === "appointment_followup") return "appointment_followup_pending_review";
  if (stage === "authority_risk") return "authority_caution_and_collect_scope";
  if (stage === "technical_risk") return "technical_caution_and_collect_drawings";
  if (stage === "timeline_pressure") return "timeline_caution_and_collect_scope";
  if (stage === "complaint_or_legal") return "complaint_or_legal_handoff";
  if (intent === "follow_up_ping") return "warm_ping_reassurance";
  if (intent === "unsupported" || stage === "unclear_or_low_context") return "clarify_unclear_request";
  if (stage === "unsupported_or_spam") return "safe_fallback";
  return "answer_and_collect_scope";
}

function appointmentTimeText(text: string) {
  const normalized = normalise(text);
  if (has(normalized, /\bwed(?:nesday)?\b/i) && has(normalized, /\b2\s*pm\b/i)) return "Wednesday 2pm";
  if (has(normalized, /\bwed(?:nesday)?\b/i)) return "Wednesday";
  const time = normalized.match(/\b\d{1,2}\s*(?:am|pm)\b/i)?.[0];
  return time ? time.toUpperCase().replace(/\s+/g, "") : "the requested timing";
}

function replyFor(input: WhatsAppReplyCoachInput, intent: QuestionBankIntentKey, stage: WhatsAppConversationStage) {
  const requestedTime = appointmentTimeText(input.inboundText);
  const hasPriorContext = input.previousMessages.length > 1;
  switch (intent) {
    case "design_theme":
      return "Yes, we can help propose a suitable design direction. The right theme should match your layout, lighting, lifestyle, storage needs and renovation scope, for example modern warm luxury, Japandi, minimalist or contemporary landed style. If you can send your floor plan, photos or reference images, we can review what direction fits best for an initial project review.";
    case "price_question":
      return "I understand you'd like a rough idea. To avoid giving you the wrong figure, we need to understand the scope, layout, site condition and material direction first. Could you send the floor plan, photos and the main areas you're planning to renovate for an initial project review?";
    case "appointment_request":
      if (stage === "appointment_followup") {
        return "We can help check the next available meeting slot. Before confirming, could you share your property type, property area/address and basic renovation scope? The team will review availability before confirming for an initial project review.";
      }
      return `We can help check ${requestedTime}. Before confirming a slot, could you share your property type, property area/address and basic renovation scope? The team will review availability before confirming for an initial project review.`;
    case "site_visit_request":
      return "No worries, we can look into arranging an initial project review. Before confirming a slot, could you send the floor plan or site photos and the property area/address? That helps us understand the scope first.";
    case "follow_up_ping":
      if (/^hello$|^hi$/i.test(normalise(input.inboundText)) && !hasPriorContext) {
        return "Hi, I'm here. How can we help with your renovation? You can share your property type, basic scope, and any floor plan or site photos if available for an initial project review.";
      }
      return "Yes, I'm here. Sorry if the reply was slow. You can send over your floor plan, site photos or renovation scope, and we'll help review the next step properly for an initial project review.";
    case "structural_wall":
    case "hacking_demo":
      return "We can help review it, but wall hacking should not be advised blindly because the wall type, services and structure need to be checked. Could you send the floor plan and photos of the wall so the team can review the next step for an initial project review?";
    case "submission_approval":
      return "It depends on the property type and exact scope. Some works may require proper checking or submission, so we should review the drawings, site condition and proposed changes before advising. Could you send the floor plan or a short description of the works for an initial project review?";
    case "timeline_question":
      return "We should avoid promising a timeline before reviewing the full scope and site condition. Duration can depend on material lead time, trade sequencing and site readiness. Could you share the areas involved and your target date so the team can review it properly for an initial project review?";
    case "complaint_or_risk":
      return "Thanks for raising this. I'll get the manager to review the matter properly before advising the next step. Could you share the details, photos or messages related to the issue so it can be checked carefully for an initial project review?";
    case "aa_works":
      return "Thanks for sharing. For landed A&A works, items like roofline, drainage, waterproofing, access and submission requirements can affect the scope. If you have the floor plan or site photos, send them over and we will review it more properly for an initial project review.";
    case "landed_renovation":
      return "Thanks for reaching out. For landed renovation, it is best not to advise blindly because layout, access and site conditions can affect the scope. Could you send the floor plan or site photos if available? We can take a look properly for an initial project review.";
    case "floorplan_or_photos_sent":
      return "Thanks, received. We will take a look at the layout/details and check what else is needed before advising the next step for an initial project review.";
    case "commercial_renovation":
      return "Thanks for reaching out. For commercial renovation, the use of space, services, landlord requirements and site access can affect planning. Could you send the layout, site photos and a short scope so we can review it for an initial project review?";
    case "carpentry":
      return "Thanks for reaching out. For carpentry, it helps to know the item, location and rough measurements or photos. Could you send photos of the area and what you would like built for an initial project review?";
    case "waterproofing_drainage_roof":
      return "Thanks for sharing. Water leakage or drainage issues should be reviewed carefully because the source may not be obvious from the message alone. Could you send photos or a short video of the affected area for an initial project review?";
    default:
      return NO_SILENCE_FALLBACK_REPLY;
  }
}

export function evaluateReplyQuality(input: {
  reply: string;
  intent: QuestionBankIntentKey;
  stage: WhatsAppConversationStage;
  previousReplies: string[];
  calendarEventId?: string | null;
}): WhatsAppReplyQualityResult {
  const safety = validateWhatsAppAutoReply(input.reply, { calendarEventId: input.calendarEventId ?? "" });
  const normalizedReply = normalise(input.reply);
  const warmHumanTone = /\b(thanks|no worries|i understand|yes|hi|sorry|we can help)\b/i.test(input.reply);
  const asksOnlyUsefulNextQuestion = questionCount(input.reply) <= 2;
  const notRepetitive = !input.previousReplies.some((previous) => normalise(previous) === normalizedReply || similarity(previous, input.reply) > 0.9);
  const answeredActualQuestion =
    input.intent === "design_theme" ? /\byes\b|\bdesign direction\b|\btheme\b/i.test(input.reply)
    : input.intent === "price_question" ? /\bwrong (?:figure|idea)\b|\bscope\b|\blayout\b/i.test(input.reply)
    : input.intent === "appointment_request" || input.intent === "site_visit_request" ? /\bcheck\b|\bbefore confirming\b|\bavailability\b/i.test(input.reply)
    : input.intent === "follow_up_ping" ? /\bhere\b/i.test(input.reply)
    : input.intent === "submission_approval" ? /\bdepends\b|\bsubmission\b|\brequirements\b/i.test(input.reply)
    : input.intent === "structural_wall" || input.intent === "hacking_demo" ? /\breview\b|\bshould not be advised blindly\b|\bchecked\b/i.test(input.reply)
    : input.intent === "timeline_question" ? /\bavoid promising\b|\bduration\b|\btimeline\b/i.test(input.reply)
    : input.intent === "complaint_or_risk" ? /\bmanager\b|\breview the matter\b/i.test(input.reply)
    : input.reply.trim().length > 0;
  let qualityScore = 100;
  const reasons: string[] = [];
  if (!input.reply.trim()) {
    qualityScore -= 60;
    reasons.push("empty reply");
  }
  if (!answeredActualQuestion) {
    qualityScore -= 25;
    reasons.push("did not answer actual question");
  }
  if (!warmHumanTone) {
    qualityScore -= 15;
    reasons.push("not warm enough");
  }
  if (!asksOnlyUsefulNextQuestion) {
    qualityScore -= 15;
    reasons.push("asked too many questions");
  }
  if (!safety.ok) {
    qualityScore -= 50;
    reasons.push(`safety failed: ${safety.errors.join(", ")}`);
  }
  if (!notRepetitive) {
    qualityScore -= 20;
    reasons.push("too similar to recent reply");
  }
  return {
    qualityScore: Math.max(0, qualityScore),
    answeredActualQuestion,
    warmHumanTone,
    asksOnlyUsefulNextQuestion,
    safe: safety.ok,
    notRepetitive,
    rewriteRequired: qualityScore < 75,
    rewriteReason: reasons.length ? reasons.join("; ") : null
  };
}

function missingInfoFor(intent: QuestionBankIntentKey) {
  const match = matchQuestionBankIntent(intent);
  if (match.entry.intent_key === intent) return match.entry.required_missing_info;
  if (intent === "appointment_request" || intent === "site_visit_request") return ["property_type", "address_or_area", "scope"];
  if (intent === "price_question") return ["floor_plan", "site_photos", "scope"];
  return ["property_type", "scope"];
}

function appointmentStatusFor(intent: QuestionBankIntentKey, calendarEventId?: string | null) {
  if (calendarEventId) return "confirmed_with_calendar_event" as const;
  if (intent === "appointment_request" || intent === "site_visit_request") return "requested_pending_review" as const;
  return "none" as const;
}

export function coachWhatsAppReply(input: WhatsAppReplyCoachInput): WhatsAppReplyCoachResult {
  const intent = detectReplyCoachIntent(input.inboundText);
  const stage = detectConversationStage(intent, input.inboundText);
  const salesMove = selectSalesMove(stage, intent);
  const questionBank = matchQuestionBankIntent(input.inboundText);
  const replyText = replyFor(input, intent, stage);
  const priorOutbound = previousOutbound(input);
  const quality = evaluateReplyQuality({
    reply: replyText,
    intent,
    stage,
    previousReplies: priorOutbound,
    calendarEventId: input.calendarEventId
  });
  const handoffRequired = ["complaint_or_risk", "submission_approval", "structural_wall"].includes(intent);
  return {
    intent,
    stage,
    confidence: questionBank.score > 0 ? Math.min(96, 78 + questionBank.score * 4) : 70,
    salesMove,
    replyText,
    missingInfo: questionBank.score > 0 ? questionBank.entry.required_missing_info : missingInfoFor(intent),
    riskFlags: questionBank.score > 0 ? questionBank.entry.risk_flags : [],
    nextAction: questionBank.score > 0 ? questionBank.entry.follow_up_question : "Ask for property type and scope.",
    handoffRequired,
    appointmentStatus: appointmentStatusFor(intent, input.calendarEventId),
    quality
  };
}
