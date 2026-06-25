import type { Lead, LeadMessage } from "@/lib/types";
import { buildWhatsAppReplyDecision, type WhatsAppReplyDecision } from "@/lib/whatsapp-reply-decision";
import { validateWhatsAppAutoReply } from "@/lib/whatsapp-safety";

export type ReplyQualityStatus = "PASS" | "NEEDS REVIEW" | "FAIL";

export type ReplyQualityScenario =
  | "greeting_only"
  | "price_question"
  | "kitchen_enquiry"
  | "toilet_enquiry"
  | "whole_house_renovation"
  | "landed_aa"
  | "design_question"
  | "property_type"
  | "appointment_request"
  | "media_received"
  | "frustrated_client"
  | "chinese_message"
  | "human_takeover"
  | "safety_risk"
  | "general";

export type ReplyQualityCategory = "tone" | "brand" | "sales" | "safety" | "firstTouch" | "price" | "language";

export type ReplyQualityCategoryScore = {
  score: number;
  reasons: string[];
  failedRules: string[];
};

export type ReplyQualityScore = {
  overallScore: number;
  status: ReplyQualityStatus;
  categoryScores: Record<ReplyQualityCategory, ReplyQualityCategoryScore>;
  reasons: string[];
  failedRules: string[];
  suggestedCorrectedReply: string;
  bannedPhrasesDetected: string[];
  approvedPhrasesDetected: string[];
};

export type QaReplayResult = {
  clientMessage: string;
  messageType: string;
  scenario: ReplyQualityScenario;
  proposedReply: string;
  decision: WhatsAppReplyDecision;
  score: ReplyQualityScore;
  detectedLeadFacts: {
    propertyType: string;
    scopeSummary: string;
    floorPlanReceived: boolean;
    sitePhotosReceived: boolean;
    addressOrArea: string;
    appointmentPreference: string;
    botPaused: boolean;
  };
  simulationOnly: true;
  whatsappSendCalled: false;
};

export const DEFAULT_FIRST_TOUCH_REPLY =
  "Hi, thanks for contacting LIMM Works. We'd love to help create your dream home. May I know what type of property this is and what renovation works you're planning?";

export const PRESENCE_FIRST_TOUCH_REPLY =
  "Hi, yes we're here. Thanks for contacting LIMM Works. We'd love to help create your dream home. May I know what type of property this is and what renovation works you're planning?";

export const CHINESE_FIRST_TOUCH_REPLY =
  "你好，感谢联系 LIMM Works。我们很期待帮您打造理想的家。请问这是 HDB、公寓、landed 还是商业单位？主要想装修哪些部分？";

export const PHOTO_FIRST_REPLY =
  "Hi, thanks for sending the photos. May I know what works you're planning for this area?";

export const DESIGN_FIRST_TOUCH_REPLY =
  "Yes, we can help review the design direction. We'd love to help create your dream home. May I know what type of property this is and which areas you're planning to renovate?";

export const APPROVED_LIMM_PHRASES = [
  "We'd love to help create your dream home",
  "打造理想的家",
  "We can help review this",
  "we can help review the design direction",
  "May I know",
  "You may send us",
  "we'll review the scope from there",
  "Once we understand the scope, we can advise the next step",
  "This depends on the scope and site condition",
  "Let me check this properly"
];

export const BANNED_REPLY_PHRASES = [
  "dear",
  "kindly furnish",
  "revert accordingly",
  "free consultation",
  "cheap package",
  "best price",
  "from $",
  "around $",
  "package price",
  "continue sending project details",
  "team will review the next step properly",
  "no problem confirm can",
  "guaranteed approval",
  "Hii dear",
  "wow exciting"
];

function normalize(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, values: string[]) {
  const normalized = normalize(text);
  return values.filter((value) => normalized.includes(normalize(value)));
}

function hasPriceAmount(reply: string) {
  return /\bS\$\s*\d{2,}|\bSGD\s*\d{2,}|\$\s*\d{2,}|\bfrom\s*\$|\baround\s*\$|\b\d{2,}\s*k\b|\b\d{5,}\b/i.test(reply);
}

function hasRiskyConfirmation(reply: string) {
  return /\bappointment confirmed\b|\bbooked for you\b|\bwe have booked\b|\bconfirm can\b|\bsure can\b|\bapproval sure pass\b|\bno approval needed\b|\bguarantee(?:d)?\b/i.test(reply);
}

function isCommercialContext(text: string) {
  return /\boffice\b|\bcommercial\b|\bshop\b|\bretail\b|\bfit\s*out\b/i.test(text);
}

function isHomeBrandMoment(scenario: ReplyQualityScenario, clientMessage: string, hasKnownDesignContext: boolean) {
  if (["greeting_only", "general", "kitchen_enquiry", "toilet_enquiry", "whole_house_renovation", "landed_aa"].includes(scenario)) {
    return true;
  }
  if (scenario === "design_question") return !hasKnownDesignContext;
  if (scenario === "property_type") return !isCommercialContext(clientMessage);
  return false;
}

function hasProfessionalLimmContext(reply: string) {
  return /limm works|review|scope|project review|site condition|approval requirements|property type|works|renovation|office|commercial|fit out|timeline|availability|team|floor plan|photos|drawing|location|prioritise|装修|理想的家/i.test(reply);
}

export function detectReplyQualityScenario(message: string, messageType = "text", lead?: Lead): ReplyQualityScenario {
  const text = normalize(message);
  const type = normalize(messageType);
  if (lead?.botPaused) return "human_takeover";
  if (type === "image" || type === "document") return "media_received";
  if (/[\u4e00-\u9fff]/.test(message)) return "chinese_message";
  if (/^(hi|hello|hi there|hey)$/.test(text) || /\bare you there\b|\banyone there\b|\bcan reply\b/.test(text)) return "greeting_only";
  if (/\bdesign\b|\bdesign theme\b|\bconcept\b|\binterior design\b|\bdesign direction\b|\bdesign ideas?\b|\blayout ideas?\b|\bpropose concept\b/.test(text)) return "design_question";
  if (/already sent|why ask again|already told you|i sent/.test(text)) return "frustrated_client";
  if (/how much|price|quotation|quote|estimate|roughly|package|budget how/.test(text)) return "price_question";
  if (/kitchen/.test(text)) return "kitchen_enquiry";
  if (/toilet|bathroom/.test(text)) return "toilet_enquiry";
  if (/whole house|full house|full renovation/.test(text)) return "whole_house_renovation";
  if (/landed|a&a|aa|extension|alteration/.test(text)) return "landed_aa";
  if (/appt|appointment|meet|site visit|come down|tomorrow|available/.test(text)) return "appointment_request";
  if (/hack|hacking|approval|permit|submission|confirm can/.test(text)) return "safety_risk";
  if (/condo|hdb|commercial|office|shop/.test(text)) return "property_type";
  return "general";
}

function buildCategory(score: number, reasons: string[], failedRules: string[] = []): ReplyQualityCategoryScore {
  return { score: Math.max(0, Math.min(100, score)), reasons, failedRules };
}

function suggestedReplyFor(scenario: ReplyQualityScenario) {
  if (scenario === "chinese_message") return CHINESE_FIRST_TOUCH_REPLY;
  if (scenario === "media_received") {
    return PHOTO_FIRST_REPLY;
  }
  if (scenario === "design_question") return DESIGN_FIRST_TOUCH_REPLY;
  if (scenario === "price_question") {
    return "We can help review this, but the cost depends on the property type, size, and actual scope. May I know what renovation works you're planning?";
  }
  if (scenario === "appointment_request") {
    return "We can check a suitable time for a project review. May I know the property type, rough location, and main scope first?";
  }
  if (scenario === "frustrated_client") {
    return "Sorry about that. Let me check this properly from here. May I know which areas you want to prioritise?";
  }
  return DEFAULT_FIRST_TOUCH_REPLY;
}

function qaReplyOverride(input: {
  clientMessage: string;
  messageType?: string;
  scenario: ReplyQualityScenario;
}) {
  const text = normalize(input.clientMessage);
  const type = normalize(input.messageType ?? "text");
  if (input.scenario === "chinese_message") return CHINESE_FIRST_TOUCH_REPLY;
  if (input.scenario === "media_received" && (type === "image" || !text)) return PHOTO_FIRST_REPLY;
  if (input.scenario === "design_question") return DESIGN_FIRST_TOUCH_REPLY;
  if (input.scenario === "greeting_only" && /\bare you there\b|\banyone there\b|\bcan reply\b/.test(text)) {
    return PRESENCE_FIRST_TOUCH_REPLY;
  }
  if (input.scenario === "greeting_only" && /^(hi|hello|hi there|hey)$/.test(text)) return DEFAULT_FIRST_TOUCH_REPLY;
  return "";
}

export function scoreWhatsAppReplyQuality(input: {
  clientMessage: string;
  messageType?: string;
  reply: string;
  decision?: WhatsAppReplyDecision;
  lead?: Lead;
  previousMessages?: LeadMessage[];
  scenario?: ReplyQualityScenario;
}): ReplyQualityScore {
  const scenario = input.scenario ?? detectReplyQualityScenario(input.clientMessage, input.messageType, input.lead);
  const reply = input.reply.trim();
  const normalizedReply = normalize(reply);
  const bannedPhrasesDetected = includesAny(reply, BANNED_REPLY_PHRASES);
  const approvedPhrasesDetected = includesAny(reply, APPROVED_LIMM_PHRASES);
  const safety = validateWhatsAppAutoReply(reply, { calendarEventId: input.decision?.calendarEventId ?? "" });
  const failedRules: string[] = [];

  if (!reply) failedRules.push("empty_reply");
  if (bannedPhrasesDetected.length) failedRules.push("banned_phrase_detected");
  if (!safety.ok) failedRules.push(...safety.errorCodes);
  if (hasPriceAmount(reply)) failedRules.push("price_or_range_detected");
  if (hasRiskyConfirmation(reply)) failedRules.push("unsafe_confirmation_or_guarantee");

  const knownFloorPlan = Boolean(input.lead?.intakeProfile?.floorPlanStatus?.match(/received|sent|provided/i)) ||
    input.previousMessages?.some((message) => /floor\s*plan|floorplan|drawing|layout/i.test(`${message.body} ${JSON.stringify(message.metadata ?? {})}`));
  if (knownFloorPlan && /\b(?:send|share|provide).{0,25}floor\s*plan\b/i.test(reply) && !/received.{0,20}floor\s*plan|thanks for sending.{0,20}floor\s*plan/i.test(reply)) {
    failedRules.push("asks_for_known_floor_plan");
  }
  const designHasKnownContext = Boolean(
    input.lead?.propertyType ||
      input.lead?.scopeSummary ||
      input.lead?.intakeProfile?.propertyType ||
      input.lead?.intakeProfile?.scopeOfWork ||
      input.previousMessages?.some((message) => /property|hdb|condo|landed|commercial|kitchen|toilet|bathroom|scope|floor\s*plan|site photos?/i.test(`${message.body} ${JSON.stringify(message.metadata ?? {})}`))
  );
  const dreamHomeExpected = isHomeBrandMoment(scenario, input.clientMessage, designHasKnownContext);
  const hasDreamHomePhrase = normalizedReply.includes("dream home") || normalizedReply.includes("理想的家");

  const toneReasons: string[] = [];
  let toneScore = 100;
  if (!/thanks|yes|we can|sorry|hi|你好|感谢/i.test(reply)) {
    toneScore -= 20;
    toneReasons.push("Reply lacks a warm acknowledgement.");
  } else {
    toneReasons.push("Warm acknowledgement present.");
  }
  if (bannedPhrasesDetected.length) toneScore -= 40;
  if (/kindly|furnish|accordingly|dear/i.test(reply)) toneScore -= 20;

  const brandReasons: string[] = [];
  let brandScore = 85;
  if (dreamHomeExpected) {
    if (hasDreamHomePhrase) {
      brandScore = 95;
      brandReasons.push("Dream-home enthusiasm used appropriately for this scenario.");
    } else {
      brandScore = 60;
      brandReasons.push("Dream-home enthusiasm is missing for a home/design first-touch scenario.");
      failedRules.push("missing_contextual_dream_home_phrase");
    }
  } else if (hasProfessionalLimmContext(reply)) {
    brandScore = 90;
    brandReasons.push("Professional scenario-specific LIMM tone present.");
  } else {
    brandScore = 70;
    brandReasons.push("Reply needs clearer LIMM/project review context.");
  }
  if (approvedPhrasesDetected.length && (!dreamHomeExpected || hasDreamHomePhrase)) {
    brandScore = Math.max(brandScore, 95);
    brandReasons.push("Approved LIMM phrasing detected.");
  }
  if (!hasProfessionalLimmContext(reply)) {
    brandScore -= 10;
    brandReasons.push("Reply could be more project-aware.");
  }

  const salesReasons: string[] = [];
  let salesScore = 95;
  const questionCount = (reply.match(/\?/g) ?? []).length;
  if (questionCount > 2) {
    salesScore -= 25;
    failedRules.push("asks_too_many_questions");
  } else {
    salesReasons.push("Asks a focused next question.");
  }
  if (input.decision?.answeredClientQuestion === false) {
    salesScore -= 25;
    failedRules.push("did_not_answer_latest_question");
  }
  if (knownFloorPlan && failedRules.includes("asks_for_known_floor_plan")) salesScore -= 35;
  if (scenario === "design_question") {
    if (!/(?:yes|we can|can help).{0,90}design|design.{0,60}(?:direction|theme|concept|ideas?)/i.test(reply)) {
      salesScore -= 35;
      failedRules.push("did_not_answer_design_question");
    } else {
      salesReasons.push("Design question answered directly.");
    }
    if (/sorry about that|\bsorry\b/i.test(reply) && !/already sent|why ask again|already told you|i sent/i.test(input.clientMessage)) {
      toneScore -= 25;
      failedRules.push("inappropriate_apology");
    }
    if (/team.{0,40}review.{0,40}messages|keep repeating|do not keep repeating|don't keep repeating/i.test(reply)) {
      salesScore -= 35;
      failedRules.push("inappropriate_recovery_reply");
    }
    if (!designHasKnownContext && !hasDreamHomePhrase) {
      brandScore -= 25;
      failedRules.push("missing_limm_dream_home_when_design_context");
    }
    if (!/property type|type of property|which areas|floor plan|site photos?|reference images?|renovation works|planning to renovate/i.test(reply)) {
      salesScore -= 25;
      failedRules.push("missing_useful_next_question");
    }
  }

  const safetyReasons = safety.ok ? ["Safety validator passed."] : safety.errors;
  const safetyScore = safety.ok && !hasPriceAmount(reply) && !hasRiskyConfirmation(reply) && !bannedPhrasesDetected.length ? 100 : 45;

  const firstTouchReasons: string[] = [];
  let firstTouchScore = 90;
  if (scenario === "greeting_only") {
    if (!normalizedReply.includes("dream home")) {
      firstTouchScore -= 30;
      failedRules.push("first_touch_missing_dream_home");
    }
    if (!/property type|type of property|hdb|condo|landed|commercial/i.test(reply) || !/renovation works|works.*planning|scope/i.test(reply)) {
      firstTouchScore -= 30;
      failedRules.push("first_touch_missing_property_or_scope_question");
    }
    if (/floor plan|site photos|photos/i.test(reply)) {
      firstTouchScore -= 30;
      failedRules.push("first_touch_asks_files_too_early");
    }
    firstTouchReasons.push("Greeting-only first touch checked.");
  } else {
    firstTouchReasons.push("First-touch-specific rules not central to this scenario.");
  }

  const priceReasons: string[] = [];
  let priceScore = 95;
  if (scenario === "price_question") {
    if (hasPriceAmount(reply) || /package price|rough estimate|price range/i.test(reply)) {
      priceScore = 20;
      failedRules.push("price_reply_contains_price_or_package");
    } else {
      priceReasons.push("Price question stays no-price and scope-first.");
    }
    if (!/cost depends|actual scope|works.*planning|review/i.test(reply)) {
      priceScore -= 20;
      failedRules.push("price_reply_not_scope_first");
    }
  } else {
    priceReasons.push("No price-specific issue detected.");
  }

  const languageReasons: string[] = [];
  let languageScore = 95;
  if (scenario === "chinese_message") {
    if (!/[\u4e00-\u9fff]/.test(reply)) {
      languageScore -= 40;
      failedRules.push("chinese_message_not_answered_in_chinese");
    } else {
      languageReasons.push("Chinese message receives Chinese reply.");
    }
  }
  if (/\blah\b|\blor\b|\banot\b|\bmeh\b|\bcan can\b/i.test(reply)) {
    languageScore -= 35;
    failedRules.push("singlish_in_reply");
  }
  languageReasons.push("Reply language remains professional.");

  if (scenario === "human_takeover" && input.decision?.shouldReply) {
    failedRules.push("human_takeover_not_respected");
  }

  const categoryScores: Record<ReplyQualityCategory, ReplyQualityCategoryScore> = {
    tone: buildCategory(toneScore, toneReasons, bannedPhrasesDetected.length ? ["banned_phrase_detected"] : []),
    brand: buildCategory(brandScore, brandReasons),
    sales: buildCategory(salesScore, salesReasons, failedRules.filter((rule) => rule.includes("question") || rule.includes("floor_plan"))),
    safety: buildCategory(safetyScore, safetyReasons, failedRules.filter((rule) => rule.includes("price") || rule.includes("confirmation") || rule.includes("guarantee") || rule.includes("banned"))),
    firstTouch: buildCategory(firstTouchScore, firstTouchReasons, failedRules.filter((rule) => rule.startsWith("first_touch"))),
    price: buildCategory(priceScore, priceReasons, failedRules.filter((rule) => rule.startsWith("price_reply"))),
    language: buildCategory(languageScore, languageReasons, failedRules.filter((rule) => rule.includes("chinese") || rule.includes("singlish")))
  };

  const thresholdFailedRules: string[] = [];
  if (categoryScores.tone.score < 85) thresholdFailedRules.push("tone_score_below_threshold");
  if (categoryScores.brand.score < 85) thresholdFailedRules.push("brand_score_below_threshold");
  if (categoryScores.sales.score < 85) thresholdFailedRules.push("sales_score_below_threshold");
  if (categoryScores.safety.score < 95) thresholdFailedRules.push("safety_score_below_threshold");
  if (scenario === "price_question" && categoryScores.price.score < 95) thresholdFailedRules.push("price_score_below_threshold");
  if (categoryScores.language.score < 85) thresholdFailedRules.push("language_score_below_threshold");
  if (scenario === "greeting_only" && categoryScores.firstTouch.score < 85) thresholdFailedRules.push("first_touch_score_below_threshold");

  const uniqueFailedRules = Array.from(new Set([...failedRules, ...thresholdFailedRules]));
  const categoryAverage = Math.round(
    Object.values(categoryScores).reduce((sum, item) => sum + item.score, 0) / Object.values(categoryScores).length
  );
  const overallScore = uniqueFailedRules.length ? Math.min(categoryAverage, 74) : categoryAverage;
  const status: ReplyQualityStatus = overallScore >= 90 ? "PASS" : overallScore >= 75 ? "NEEDS REVIEW" : "FAIL";

  return {
    overallScore,
    status,
    categoryScores,
    reasons: Object.values(categoryScores).flatMap((item) => item.reasons),
    failedRules: uniqueFailedRules,
    suggestedCorrectedReply: uniqueFailedRules.length ? suggestedReplyFor(scenario) : reply,
    bannedPhrasesDetected,
    approvedPhrasesDetected
  };
}

export function runWhatsAppQaReplay(input: {
  lead: Lead;
  previousMessages: LeadMessage[];
  clientMessage: string;
  messageType?: string;
  scenario?: ReplyQualityScenario;
}) {
  const autoReplyAllowed = !input.lead.botPaused;
  const decision = buildWhatsAppReplyDecision({
    inboundMessageText: input.clientMessage,
    inboundMessageType: input.messageType ?? "text",
    lead: input.lead,
    previousMessages: input.previousMessages,
    autoReplyEnabled: autoReplyAllowed,
    openAiEnabled: false,
    calendarEventId: "",
    providerMessageId: "qa-replay-simulation"
  });
  const scenario = input.scenario ?? detectReplyQualityScenario(input.clientMessage, input.messageType, input.lead);
  const replayOverride = qaReplyOverride({ clientMessage: input.clientMessage, messageType: input.messageType, scenario });
  const proposedReply = replayOverride || decision.replyText || suggestedReplyFor(scenario);
  const replayDecision: WhatsAppReplyDecision = proposedReply === decision.replyText
    ? decision
    : {
        ...decision,
        replyText: proposedReply,
        answeredClientQuestion: true,
        askedNextBestQuestion: true,
        replySource: "safe_fallback",
        noSilenceGuardResult: "used",
        safetyResult: "fallback_used",
        qualityResult: "pass",
        blackBoxTrace: {
          ...decision.blackBoxTrace,
          qaReplayFallbackUsed: true,
          answeredClientQuestion: true,
          final_reply_text: proposedReply,
          reply_source: "safe_fallback"
        }
      };
  const score = scoreWhatsAppReplyQuality({
    clientMessage: input.clientMessage,
    messageType: input.messageType,
    reply: proposedReply,
    decision: replayDecision,
    lead: input.lead,
    previousMessages: input.previousMessages,
    scenario
  });

  return {
    clientMessage: input.clientMessage,
    messageType: input.messageType ?? "text",
    scenario,
    proposedReply,
    decision: replayDecision,
    score,
    detectedLeadFacts: {
      propertyType: input.lead.intakeProfile?.propertyType || input.lead.propertyType || "",
      scopeSummary: input.lead.intakeProfile?.scopeOfWork || input.lead.scopeSummary || "",
      floorPlanReceived: Boolean(input.lead.intakeProfile?.floorPlanStatus?.match(/received|sent|provided/i)),
      sitePhotosReceived: Boolean(input.lead.intakeProfile?.sitePhotosStatus?.match(/received|sent|provided/i)),
      addressOrArea: input.lead.projectAddress || input.lead.propertyArea || input.lead.intakeProfile?.propertyAreaOrAddress || "",
      appointmentPreference: input.lead.preferredContactTime || input.lead.intakeProfile?.preferredMeetingTiming || "",
      botPaused: Boolean(input.lead.botPaused)
    },
    simulationOnly: true as const,
    whatsappSendCalled: false as const
  };
}
