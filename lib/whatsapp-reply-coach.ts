import type { Lead, LeadMessage } from "@/lib/types";
import {
  BUDGET_EXPECTATION_WORDING,
  SHORT_EARLY_STAGE_INTAKE_MESSAGE,
  composeSmartLeadIntakeMessage,
  type SmartLeadIntakeStage
} from "@/lib/lead-intake";
import {
  buildMissingInfoAsk,
  describeReceivedInfo,
  getLimmInstagramUrl,
  inferWhatsAppLeadContext,
  type WhatsAppLeadContextMemory
} from "@/lib/whatsapp-lead-context";
import {
  detectWhatsAppMessageIntents,
  mapDetectedIntentToQuestionBankIntent,
  type WhatsAppDetectedIntent
} from "@/lib/whatsapp-multi-intent";
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
  detectedIntents: WhatsAppDetectedIntent[];
  primaryIntent: WhatsAppDetectedIntent;
  multiIntentDetected: boolean;
  combinedReplyUsed: boolean;
  portfolioRequestDetected: boolean;
  instagramUrlAvailable: boolean;
  humanFollowUpTaskCreated: boolean;
  humanFollowUpTaskSkippedReason: string;
  leadContext: WhatsAppLeadContextMemory;
  missingFieldsAsked: string[];
  repeatedInfoAvoided: string[];
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
  `Thanks for your message. ${SHORT_EARLY_STAGE_INTAKE_MESSAGE}`;

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function readableList(items: string[]) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
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
  const raw = text.toLowerCase();
  if (/你好|在吗|hello|hi/.test(raw) && normalized.length <= 32) return "follow_up_ping";
  if (/多少钱|报价|价格/.test(raw)) return "price_question";
  if (/预约|见面|会议|可以约/.test(raw)) return "appointment_request";
  if (/作品|案例|照片/.test(raw)) return "design_theme";
  if (/敲墙|拆墙/.test(raw)) return "structural_wall";
  if (/申请|批准|审批|报批/.test(raw)) return "submission_approval";
  if (!normalized) return "unsupported";
  if (has(normalized, /\b(past works?|past projects?|project photos?|portfolio|before[-\s]?after|before and after|show me your work|photos of your works?|renovation photos?|completed project|design photos?|got landed photo|got project photo)\b/i)) return "design_theme";
  if (has(normalized, /\b(refund|lawyer|complaint|unhappy|angry|defect|your work.*problem|call me|urgent|paid deposit|cancel project|cancel)\b/i)) return "complaint_or_risk";
  if (has(normalized, /\b(how much|roughly|price|cost|estimate|quotation|quote|package|budget|budget how|price ah)\b/i)) return "price_question";
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

function repeatedInfoAvoided(context: WhatsAppLeadContextMemory) {
  return context.receivedFields.filter((field) => ["floor plan", "floor plan/image", "scope", "site photos", "property type", "address/area", "timeline", "budget expectation", "household/lifestyle", "design references"].includes(field));
}

function intakeContext(context: WhatsAppLeadContextMemory) {
  return {
    hasPropertyType: context.hasPropertyType,
    hasAddressOrArea: context.hasAddressOrArea,
    hasScopeOfWork: context.hasScopeOfWork,
    hasFloorPlan: context.hasFloorPlan,
    hasSitePhotos: context.hasSitePhotos,
    hasDesignReferences: context.hasDesignReferences,
    hasTimeline: context.hasTimeline,
    hasBudgetExpectation: context.hasBudgetExpectation,
    hasHouseholdInfo: context.hasHouseholdInfo,
    hasSafetyAccessibilityNeeds: context.hasSafetyAccessibilityNeeds,
    hasPreferredAppointmentTime: context.hasPreferredAppointmentTime,
    hasMustHaveNiceToHave: context.hasMustHaveNiceToHave
  };
}

function composeSmartIntakeReply(context: WhatsAppLeadContextMemory, stage: SmartLeadIntakeStage = "first_enquiry", intro = "Sure, we can help review this.") {
  return composeSmartLeadIntakeMessage(intakeContext(context), stage, intro);
}

function missingAsked(context: WhatsAppLeadContextMemory, reply: string) {
  return context.missingFields.filter((field) => {
    if (field === "floor_plan") return /\bfloor plan\b/i.test(reply);
    if (field === "site_photos") return /\bsite photos?\b|\bphotos?\b/i.test(reply);
    if (field === "scope") return /\bscope\b/i.test(reply);
    if (field === "property_type") return /\bproperty type\b/i.test(reply);
    if (field === "address_or_area") return /\baddress\b|\barea\b/i.test(reply);
    return false;
  });
}

function contextAwareInfoAsk(context: WhatsAppLeadContextMemory, focus: "appointment" | "price" | "general" = "general") {
  const received = describeReceivedInfo(context);
  const ask = buildMissingInfoAsk(context, focus);
  if (received && ask) return `${received} ${ask}`;
  if (received) return `${received} The team can review these details and advise the next step for an initial project review.`;
  return ask || "The team can review the details and advise the next step for an initial project review.";
}

function composePriceReply(context: WhatsAppLeadContextMemory) {
  if (context.hasFloorPlan && context.hasScopeOfWork) {
    const photoAsk = context.hasSitePhotos ? "" : " If possible, you can also send site photos so the team can review the condition more accurately.";
    const budgetAsk = context.hasBudgetExpectation ? "" : ` ${BUDGET_EXPECTATION_WORDING}`;
    return `I understand you'd like a rough idea. Thanks, we've received the floor plan and scope. We'll need to review the details, drawings, site condition and material direction first, because giving a rough figure too early can be misleading.${photoAsk}${budgetAsk} The team can go through this properly during the initial project review.`;
  }
  if (context.hasScopeOfWork) {
    const ask = context.hasFloorPlan
      ? context.hasSitePhotos ? "" : " If possible, you can also send site photos so the team can review the condition more accurately."
      : " Could you send the floor plan and site photos if available?";
    const budgetAsk = context.hasBudgetExpectation ? "" : ` ${BUDGET_EXPECTATION_WORDING}`;
    return `I understand you'd like a rough idea. Thanks, we've received the scope. We'll need to review the layout, site condition and material direction first, because giving a rough figure too early can be misleading.${ask}${budgetAsk} The team can go through this properly during the initial project review.`;
  }
  return `I understand you'd like a rough idea. To advise properly, could you share the scope of work first? Pricing depends on the property type, areas involved, site condition, material direction and whether any A&A or authority-related work is needed. ${BUDGET_EXPECTATION_WORDING} Once we understand the scope, we can review the next step more accurately for an initial project review.`;
}

function composeAppointmentReply(input: WhatsAppReplyCoachInput, context: WhatsAppLeadContextMemory, followUp = false) {
  const requestedTime = appointmentTimeText(input.inboundText);
  if (context.hasPropertyType && context.hasScopeOfWork && context.hasAddressOrArea) {
    const received = describeReceivedInfo(context);
    const prep = context.hasHouseholdInfo && context.hasDesignReferences && context.hasBudgetExpectation
      ? ""
      : ` ${composeSmartIntakeReply(context, "serious_lead", "Before the meeting, it would also help to prepare a few lifestyle and design details.")}`;
    return `${requestedTime} noted. We can help check availability, but the appointment is not confirmed yet. ${received || "Since we've received the main details,"} the team will review and confirm whether that slot works for an initial project review.${prep}`;
  }
  const received = describeReceivedInfo(context);
  if (followUp) {
    const ask = buildMissingInfoAsk(context, "appointment");
    return `We can help check the next available meeting slot, but it is not confirmed yet. ${received ? `${received} ` : ""}${ask || "The team will review the current details and confirm availability for an initial project review."}`;
  }
  const ask = buildMissingInfoAsk(context, "appointment");
  return `${requestedTime} noted. We can help check availability, but the appointment is not confirmed yet. ${received ? `${received} ` : ""}${ask || "The team will review the current details and confirm availability for an initial project review."}`;
}

function composePortfolioReply(context: WhatsAppLeadContextMemory) {
  const instagramUrl = getLimmInstagramUrl();
  const projectContext = context.knownScopeSummary || context.knownPropertyType;
  if (!instagramUrl) {
    return "Yes, we can share relevant references. Could you let us know what type of project you want to see, such as landed A&A, kitchen, bathroom, carpentry, hacking works, design works or commercial renovation? The team can then share suitable references for your initial project review.";
  }
  if (projectContext) {
    return `Yes, you can view some of our renovation works, design references and project-related content on our Instagram here:\n\n${instagramUrl}\n\nSince you're looking at ${projectContext}, we can also help shortlist more relevant examples based on your scope. Final design and scope still depend on your site condition, drawings and requirements for an initial project review.`;
  }
  return `Yes, you can view some of our renovation works, design references and project-related content on our Instagram here:\n\n${instagramUrl}\n\nIf you're looking for a specific type of reference, let us know whether it's for landed A&A, full house renovation, kitchen, bathroom, carpentry, hacking works, design works or commercial renovation. We can then point you to the more relevant examples for your initial project review.`;
}

function composePingReply(input: WhatsAppReplyCoachInput, context: WhatsAppLeadContextMemory) {
  const normalized = normalise(input.inboundText);
  if (/^hello$|^hi$/.test(normalized)) {
    if (context.receivedFields.length) {
      return `Hi, yes we're here. ${describeReceivedInfo(context)} The team can review the next step for an initial project review.`;
    }
    return "Hi, yes we're here. You can send your floor plan, site photos or renovation scope, and we'll help review the next step for an initial project review.";
  }
  if (context.receivedFields.length) {
    return `Yes, we're here. Sorry if you were waiting. ${describeReceivedInfo(context)} The team can review the next step properly for an initial project review.`;
  }
  return "Yes, we're here. Sorry if you were waiting. Could you share what type of renovation you're planning, or send the floor plan/scope if you already have it for an initial project review?";
}

function composeVoiceMessageReply() {
  return "Sorry, we're not able to listen to voice messages here. Could you type the key details instead, such as your property type, renovation scope, and preferred appointment timing for an initial project review?";
}

function composeWhatNextReply(context: WhatsAppLeadContextMemory) {
  const received = describeReceivedInfo(context);
  if (received) {
    return `${received} The next step is for the team to review the layout, site condition and requirements before advising what should be checked or arranged for an initial project review. ${composeSmartIntakeReply(context, "serious_lead", "To prepare better")}`;
  }
  return NO_SILENCE_FALLBACK_REPLY;
}

function composeMultiIntentReply(input: WhatsAppReplyCoachInput, intents: WhatsAppDetectedIntent[], context: WhatsAppLeadContextMemory) {
  const parts: string[] = [];
  const hasAppointment = intents.includes("appointment_request") || intents.includes("meeting_availability");
  const hasDesign = intents.includes("design_theme");
  const hasLanded = intents.includes("landed_renovation") || intents.includes("landed_aa");
  const hasHack = intents.includes("hacking_wall");
  const hasApproval = intents.includes("approval_submission");
  const hasPrice = intents.includes("price_question");
  const hasPortfolio = intents.includes("portfolio_request");

  if (hasPrice) parts.push(composePriceReply(context));

  if (hasLanded || hasDesign || hasAppointment) {
    const capabilities = [
      hasLanded ? "landed renovation" : "",
      hasDesign ? "design direction" : "",
      hasAppointment ? "appointment request" : ""
    ].filter(Boolean);
    if (capabilities.length) {
      parts.push(`Yes, we can help with the ${readableList(capabilities)}.`);
    }
  }

  if (hasDesign) {
    parts.push("For the design theme, we can propose a suitable direction after reviewing your layout, lighting, storage needs and preferred style.");
  }

  if (hasAppointment) {
    parts.push(composeAppointmentReply(input, context, intents.includes("meeting_availability")));
  }

  if (hasHack || hasApproval) {
    parts.push("For wall hacking or approval matters, we'll need to review the drawings and site condition first because it depends on the wall type, structure, services, scope and whether submission is required.");
  }

  if (hasPortfolio) {
    parts.push(composePortfolioReply(context));
  }

  const info = contextAwareInfoAsk(context, hasAppointment ? "appointment" : "general");
  if (!hasPrice && !hasAppointment && !parts.join(" ").includes(info) && info) {
    parts.push(info);
  }
  if (!hasPrice && !hasAppointment && !context.hasHouseholdInfo) {
    parts.push(composeSmartIntakeReply(context, "serious_lead", "To prepare the meeting and proposal better"));
  }

  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function composeDesignReply(context: WhatsAppLeadContextMemory) {
  const received = describeReceivedInfo(context);
  const intake = composeSmartIntakeReply(context, "design_question", "To make the design direction practical");
  return `Yes, we can help propose a suitable design direction. The right theme should match your layout, lighting, lifestyle, storage needs and renovation scope, for example modern warm luxury, Japandi, minimalist or contemporary landed style. ${received ? `${received} ` : ""}${intake}`;
}

function replyFor(input: WhatsAppReplyCoachInput, intent: QuestionBankIntentKey, stage: WhatsAppConversationStage) {
  const requestedTime = appointmentTimeText(input.inboundText);
  const hasPriorContext = input.previousMessages.length > 1;
  const context = inferWhatsAppLeadContext({ lead: input.lead, previousMessages: input.previousMessages, inboundText: input.inboundText });
  const scan = detectWhatsAppMessageIntents(input.inboundText);
  if (intent === "unsupported_media" && /audio|voice/i.test(input.inboundText)) return composeVoiceMessageReply();
  if (scan.multiIntentDetected) return composeMultiIntentReply(input, scan.detectedIntents, context);
  if (scan.portfolioRequestDetected) return composePortfolioReply(context);
  if (normalise(input.inboundText).includes("what next")) return composeWhatNextReply(context);
  switch (intent) {
    case "design_theme":
      return composeDesignReply(context);
    case "price_question":
      return composePriceReply(context);
    case "appointment_request":
      if (stage === "appointment_followup") {
        return composeAppointmentReply(input, context, true);
      }
      return composeAppointmentReply(input, context);
    case "site_visit_request":
      return composeAppointmentReply(input, context);
    case "follow_up_ping":
      return composePingReply(input, context);
    case "structural_wall":
    case "hacking_demo":
      return "We can help review it, but wall hacking should not be advised blindly because the wall type, services and structure need to be checked. Could you send the floor plan and photos of the wall so the team can review the next step for an initial project review?";
    case "submission_approval":
      return "It depends on the property type and exact scope. Some works may require proper checking or submission, so we should review the drawings, site condition and proposed changes before advising. Could you send the floor plan or a short description of the works for an initial project review?";
    case "timeline_question":
      return "We should avoid promising a timeline before reviewing the full scope and site condition. Duration can depend on material lead time, trade sequencing and site readiness. Could you share the areas involved and your target date so the team can review it properly for an initial project review?";
    case "complaint_or_risk":
      return "Thanks, I'll get the team to follow up with you directly on this. Could you share the key details or photos/messages related to the issue so it can be checked properly for an initial project review?";
    case "aa_works":
      return "Thanks for sharing. For landed A&A works, items like roofline, drainage, waterproofing, access and submission requirements can affect the scope. If you have the floor plan or site photos, send them over and we will review it more properly for an initial project review.";
    case "landed_renovation":
      return composeSmartIntakeReply(context, "first_enquiry", "Thanks for reaching out. For landed renovation, layout, site condition and lifestyle needs can affect the right scope.");
    case "floorplan_or_photos_sent":
      return "Thanks, received. We will take a look at the layout/details and check what else is needed before advising the next step for an initial project review.";
    case "commercial_renovation":
      return composeSmartIntakeReply(context, "first_enquiry", "Thanks for reaching out. For commercial renovation, use of space, services and site access can affect planning.");
    case "carpentry":
      return "Thanks for reaching out. For carpentry, it helps to know the item, location and rough measurements or photos. Could you send photos of the area and what you would like built for an initial project review?";
    case "waterproofing_drainage_roof":
      return "Thanks for sharing. Water leakage or drainage issues should be reviewed carefully because the source may not be obvious from the message alone. Could you send photos or a short video of the affected area for an initial project review?";
    default:
      return composeSmartIntakeReply(context, "first_enquiry");
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
    : input.intent === "appointment_request" || input.intent === "site_visit_request" ? /\bcheck\b|\bbefore confirming\b|\bavailability\b|\bnot confirmed\b/i.test(input.reply)
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
  const multiIntent = detectWhatsAppMessageIntents(input.inboundText);
  const intent = multiIntent.multiIntentDetected ? mapDetectedIntentToQuestionBankIntent(multiIntent.primaryIntent) : detectReplyCoachIntent(input.inboundText);
  const stage = detectConversationStage(intent, input.inboundText);
  const salesMove = selectSalesMove(stage, intent);
  const questionBank = matchQuestionBankIntent(input.inboundText);
  const leadContext = inferWhatsAppLeadContext({ lead: input.lead, previousMessages: input.previousMessages, inboundText: input.inboundText });
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
    detectedIntents: multiIntent.detectedIntents,
    primaryIntent: multiIntent.primaryIntent,
    multiIntentDetected: multiIntent.multiIntentDetected,
    combinedReplyUsed: multiIntent.multiIntentDetected,
    portfolioRequestDetected: multiIntent.portfolioRequestDetected,
    instagramUrlAvailable: Boolean(getLimmInstagramUrl()),
    humanFollowUpTaskCreated: false,
    humanFollowUpTaskSkippedReason: multiIntent.portfolioRequestDetected ? "trace_only_no_task_repository" : "",
    leadContext,
    missingFieldsAsked: missingAsked(leadContext, replyText),
    repeatedInfoAvoided: repeatedInfoAvoided(leadContext),
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
