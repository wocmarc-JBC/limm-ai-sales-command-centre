import type { Lead, LeadMessage } from "@/lib/types";

export const WHATSAPP_INTENT_GATE_VERSION = "v10.2.0";
export const WHATSAPP_INTENT_GATE_RULE_VERSION = "v10_2_0_intent_gate_rules_1";
export const WHATSAPP_INTENT_CONTEXT_MESSAGE_LIMIT = 10;

export type ConversationIntent =
  | "genuine_new_renovation_lead"
  | "existing_client_project_message"
  | "vendor_supplier_solicitation"
  | "partnership_collaboration_outreach"
  | "recruitment_job_enquiry"
  | "spam_scam_irrelevant"
  | "wrong_number_or_general_chat"
  | "unclear_intent"
  | "human_takeover_or_bot_paused"
  | "existing_vendor_or_business_contact";

export type ConversationRoute =
  | "sales_lead"
  | "existing_client"
  | "vendor_inbox"
  | "partnership_review"
  | "recruitment_review"
  | "spam_suppressed"
  | "general_enquiry"
  | "intent_review"
  | "human_takeover"
  | "business_contact";

export type IntentAutoReplyPolicy =
  | "sales_brain"
  | "existing_client_acknowledgement"
  | "one_time_vendor_acknowledgement"
  | "one_time_partnership_acknowledgement"
  | "one_time_recruitment_acknowledgement"
  | "one_time_neutral_clarification"
  | "no_auto_reply";

export type LeadEligibilityDecision = {
  leadEligible: boolean;
  salesEligible: boolean;
  conversationRoute: ConversationRoute;
  shouldExtractLeadFacts: boolean;
  excludeFromCommandCoreSales: boolean;
  excludeFromMissionMap: boolean;
  excludeFromFollowUps: boolean;
  excludeFromQuotationReadiness: boolean;
  excludeFromLeadScoring: boolean;
  excludeFromSalesMetrics: boolean;
};

export type NormalizedInboundContent = {
  currentText: string;
  normalizedCurrentText: string;
  currentMessageType: string;
  recentMeaningfulMessages: LeadMessage[];
  recentInboundText: string;
  recentOutboundText: string;
  mergedContextText: string;
  meaningfulMessageCount: number;
};

export type IntentGateDecision = LeadEligibilityDecision & {
  primaryIntent: ConversationIntent;
  conversationIntent: ConversationIntent;
  confidence: number;
  reasonCodes: string[];
  autoReplyPolicy: IntentAutoReplyPolicy;
  suggestedReply: string;
  classifierVersion: string;
  ruleVersion: string;
  classificationLatencyMs: number;
  classificationFailed: boolean;
  manualOverrideApplied: boolean;
  normalizedContent: NormalizedInboundContent;
};

export type IntentGateReplyPlan = {
  shouldUseSalesBrain: boolean;
  shouldReply: boolean;
  replyText: string;
  intentionalNoReplyReason: string | null;
  acknowledgementAlreadySent: boolean;
  acknowledgementIntent: ConversationIntent | null;
};

export const WHATSAPP_CONVERSATION_INTENTS: readonly ConversationIntent[] = [
  "genuine_new_renovation_lead",
  "existing_client_project_message",
  "vendor_supplier_solicitation",
  "partnership_collaboration_outreach",
  "recruitment_job_enquiry",
  "spam_scam_irrelevant",
  "wrong_number_or_general_chat",
  "unclear_intent",
  "human_takeover_or_bot_paused",
  "existing_vendor_or_business_contact"
] as const;

const INTENTS = new Set<ConversationIntent>(WHATSAPP_CONVERSATION_INTENTS);

const VENDOR_ACKNOWLEDGEMENT =
  "Thanks for reaching out and sharing your photography services. We’ll keep your details for future consideration.";

const GENERIC_VENDOR_ACKNOWLEDGEMENT =
  "Thanks for reaching out and sharing your services. We’ll keep your details for future consideration.";

const PARTNERSHIP_ACKNOWLEDGEMENT =
  "Thanks for reaching out about a possible collaboration. We’ll keep your details for the team to review.";

const RECRUITMENT_ACKNOWLEDGEMENT =
  "Thanks for your interest in LIMM Works. We’ll keep your message for the team to review.";

const NEUTRAL_CLARIFICATION =
  "Hi, you’ve reached LIMM Works. Are you enquiring about a renovation project, an existing project, or something else?";

const EXISTING_CLIENT_ACKNOWLEDGEMENT =
  "Thanks, noted. I’ll pass this to the project team to review and follow up.";

function normalize(text: unknown) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/https?:\/\/\S+|www\.\S+/g, " link ")
    .replace(/[^a-z0-9\u4e00-\u9fff$?\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function timestamp(message: LeadMessage) {
  const parsed = Date.parse(message.createdAt || message.providerTimestamp || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function metadataText(message: LeadMessage) {
  const metadata = message.metadata ?? {};
  return [metadata.caption, metadata.filename, metadata.messageType, metadata.mimeType]
    .filter((value) => typeof value === "string" && value.trim())
    .map(String)
    .join(" ");
}

function isMeaningfulConversationMessage(message: LeadMessage) {
  if (message.direction !== "inbound" && message.direction !== "outbound") return false;
  if (message.channel !== "whatsapp") return false;
  const body = `${message.body ?? ""} ${metadataText(message)}`.trim();
  if (!body) return false;
  const type = String(message.metadata?.type ?? message.metadata?.event ?? "");
  return !/audit|debug|webhook|technical|internal_note/i.test(type);
}

export function assembleRecentContext(messages: LeadMessage[], limit = WHATSAPP_INTENT_CONTEXT_MESSAGE_LIMIT) {
  return [...messages]
    .filter(isMeaningfulConversationMessage)
    .sort((a, b) => timestamp(a) - timestamp(b))
    .slice(-Math.max(1, Math.min(WHATSAPP_INTENT_CONTEXT_MESSAGE_LIMIT, limit)));
}

export function normalizeInboundContent(input: {
  currentMessageText: string;
  currentMessageType: string;
  recentMessages?: LeadMessage[];
  lead?: Lead | null;
}): NormalizedInboundContent {
  const recentMeaningfulMessages = assembleRecentContext(input.recentMessages ?? []);
  const inbound = recentMeaningfulMessages
    .filter((message) => message.direction === "inbound")
    .map((message) => `${message.body} ${metadataText(message)}`.trim())
    .filter(Boolean);
  const outbound = recentMeaningfulMessages
    .filter((message) => message.direction === "outbound")
    .map((message) => message.body.trim())
    .filter(Boolean);
  const currentText = String(input.currentMessageText ?? "").trim();
  const recentInboundText = inbound.join("\n");
  const recentOutboundText = outbound.join("\n");
  const mergedContextText = [
    input.lead?.conversationIntent,
    input.lead?.conversationRoute,
    input.lead?.propertyType,
    input.lead?.serviceType,
    input.lead?.scopeSummary,
    input.lead?.lastClientMessage,
    recentInboundText,
    currentText
  ].filter(Boolean).join("\n");

  return {
    currentText,
    normalizedCurrentText: normalize(currentText),
    currentMessageType: normalize(input.currentMessageType),
    recentMeaningfulMessages,
    recentInboundText,
    recentOutboundText,
    mergedContextText,
    meaningfulMessageCount: recentMeaningfulMessages.length
  };
}

function isExistingClient(lead?: Lead | null) {
  if (!lead) return false;
  return Boolean(
    lead.projectId ||
    lead.wonDate ||
    (lead.confirmedValue ?? 0) > 0 ||
    lead.salesStage === "Won" ||
    lead.quotationStatus === "Accepted" ||
    lead.conversationRoute === "existing_client" ||
    lead.conversationIntent === "existing_client_project_message"
  );
}

function hasStrongRenovationSignal(text: string, messageType: string) {
  if (["image", "document", "video"].includes(messageType) && /floor plan|floorplan|layout|site photo|renovation|kitchen|bathroom|toilet|carpentry/.test(text)) return true;
  return /\b(?:hdb|bto|condo|landed|terrace|semi d|bungalow|commercial unit|office renovation|renovat(?:e|ion)|reno|a\s*&?\s*a|addition|alteration|extension|kitchen|bathroom|toilet|carpentry|wardrobe|cabinet|hack(?:ing)?|floor plan|floorplan|site visit|interior design)\b|\u88c5\u4fee|\u5168\u5c4b|\u6574\u5c4b/.test(text);
}

function hasExistingProjectSignal(text: string) {
  return /\b(?:our|my)\s+(?:current\s+)?(?:project|renovation|site)|\b(?:your worker|your workers|project manager|site progress|defect|rectification|variation order|progress payment|handover|warranty|after sales|after-sales|ongoing works?)\b/.test(text);
}

function hasExplicitNewProjectSignal(text: string) {
  return /\b(?:another|new|separate|second)\s+(?:home|house|unit|property|project)|\b(?:planning|want|looking)\s+to\s+renovat(?:e|ion)\s+(?:a\s+)?(?:new|another|second)|\bnew renovation enquiry\b/.test(text);
}

function hasSpamOrScamSignal(text: string) {
  return /\b(?:crypto|bitcoin|forex signal|investment return|guaranteed return|online casino|betting|loan offer|instant loan|claim your prize|you have won|verify your account|password|one time password|otp|adult service|click link to unlock)\b/.test(text);
}

function hasRecruitmentSignal(text: string) {
  return /\b(?:apply for (?:a )?(?:job|position|role)|job application|job vacancy|career opportunity|internship|intern position|looking for (?:a )?job|seeking employment|send (?:my )?(?:cv|resume)|attached (?:my )?(?:cv|resume)|are you hiring|work for your company)\b|\u6c42\u804c|\u62db\u8058/.test(text);
}

function hasPartnershipSignal(text: string) {
  return /\b(?:partnership|collaborat(?:e|ion)|work together|referral partnership|cross promotion|cross-promotion|strategic partner|business proposal|affiliate|influencer collaboration|joint venture)\b/.test(text);
}

function hasVendorSignal(text: string) {
  const offeringLanguage = /\b(?:i am|i'm|im|we are|we're|from|represent)\b.{0,45}\b(?:provide|offer|specialise|specialize|supplier|services?)\b|\b(?:we provide|we offer|our services?|our pricing|our rates?|our packages?|supplier of|would like to introduce|hope to hear from you)\b/.test(text);
  const vendorService = /\b(?:photograph(?:y|er)|videograph(?:y|er)|drone|content creation|digital marketing|seo services?|social media services?|printing services?|signage supplier|material supplier|tile supplier|sanitary supplier|lighting supplier|furniture supplier|software services?|web design services?|lead generation services?|cleaning services?|courier services?|interior design services?|renovation services?|carpentry services?|contractor|subcontractor|electrician|plumbing services?)\b/.test(text);
  const salesCollateral = /\b(?:our pricing|price list|rate card|promo(?:tion)?|package|quotation attached|catalogue|brochure)\b|\$\s*\d+/.test(text);
  return (offeringLanguage && (vendorService || salesCollateral)) || (vendorService && salesCollateral && /\b(?:our|we|from)\b/.test(text));
}

function hasWrongNumberOrGeneralSignal(text: string) {
  return /\b(?:wrong number|wrong person|stop messaging|do not contact|don't contact|not interested|who is this|how are you|what time is it|happy birthday|good night friend|personal chat)\b/.test(text);
}

function hasOptOutSignal(text: string) {
  return /\b(?:stop messaging|stop contacting|do not contact|don't contact|unsubscribe|remove my number)\b/.test(text);
}

function isGreetingOrBusinessPing(text: string) {
  return /^(?:hi|hello|hey|good morning|good afternoon|good evening|are you there|can reply|anyone there|\u4f60\u597d)[?.!\s]*$/.test(text);
}

function isShortLeadFact(text: string) {
  return /^(?:hdb|bto|condo|landed|terrace|semi d|bungalow|commercial|office|[1-5]\s*(?:(?:room|rm)(?:\s+flat)?|flat)?|full work|full works|full reno|full renovation|kitchen|bathroom|toilet|carpentry|a\s*&?\s*a|aa|\u5168\u5c4b\u88c5\u4fee|[1-5]\s*\u623f)$/.test(text);
}

function hasActiveSalesConversationContext(content: NormalizedInboundContent, lead?: Lead | null) {
  if (
    lead?.conversationIntent === "genuine_new_renovation_lead" ||
    lead?.conversationRoute === "sales_lead" ||
    lead?.leadEligible === true ||
    (
      lead?.leadEligible !== false &&
      lead?.leadCategory !== "Low Fit" &&
      (lead?.leadScore ?? 0) > 0
    )
  ) return true;

  return /\b(?:renovation works|planning to renovate|dream home|hdb,? condo|landed property|floor plan|site photos?|reference images?)\b|\u88c5\u4fee/.test(
    normalize(content.recentOutboundText)
  );
}

function routeForIntent(intent: ConversationIntent): ConversationRoute {
  return {
    genuine_new_renovation_lead: "sales_lead",
    existing_client_project_message: "existing_client",
    vendor_supplier_solicitation: "vendor_inbox",
    partnership_collaboration_outreach: "partnership_review",
    recruitment_job_enquiry: "recruitment_review",
    spam_scam_irrelevant: "spam_suppressed",
    wrong_number_or_general_chat: "general_enquiry",
    unclear_intent: "intent_review",
    human_takeover_or_bot_paused: "human_takeover",
    existing_vendor_or_business_contact: "business_contact"
  }[intent] as ConversationRoute;
}

function policyForIntent(intent: ConversationIntent): IntentAutoReplyPolicy {
  return {
    genuine_new_renovation_lead: "sales_brain",
    existing_client_project_message: "existing_client_acknowledgement",
    vendor_supplier_solicitation: "one_time_vendor_acknowledgement",
    partnership_collaboration_outreach: "one_time_partnership_acknowledgement",
    recruitment_job_enquiry: "one_time_recruitment_acknowledgement",
    spam_scam_irrelevant: "no_auto_reply",
    wrong_number_or_general_chat: "one_time_neutral_clarification",
    unclear_intent: "one_time_neutral_clarification",
    human_takeover_or_bot_paused: "no_auto_reply",
    existing_vendor_or_business_contact: "no_auto_reply"
  }[intent] as IntentAutoReplyPolicy;
}

function replyForIntent(intent: ConversationIntent, currentText = "") {
  if (intent === "vendor_supplier_solicitation") {
    return /photograph|videograph|drone/.test(currentText) ? VENDOR_ACKNOWLEDGEMENT : GENERIC_VENDOR_ACKNOWLEDGEMENT;
  }
  if (intent === "partnership_collaboration_outreach") return PARTNERSHIP_ACKNOWLEDGEMENT;
  if (intent === "recruitment_job_enquiry") return RECRUITMENT_ACKNOWLEDGEMENT;
  if (intent === "wrong_number_or_general_chat" || intent === "unclear_intent") return NEUTRAL_CLARIFICATION;
  if (intent === "existing_client_project_message") return EXISTING_CLIENT_ACKNOWLEDGEMENT;
  return "";
}

export function determineLeadEligibility(intent: ConversationIntent): LeadEligibilityDecision {
  const leadEligible = intent === "genuine_new_renovation_lead";
  return {
    leadEligible,
    salesEligible: leadEligible,
    conversationRoute: routeForIntent(intent),
    shouldExtractLeadFacts: leadEligible,
    excludeFromCommandCoreSales: !leadEligible,
    excludeFromMissionMap: !leadEligible,
    excludeFromFollowUps: !leadEligible,
    excludeFromQuotationReadiness: !leadEligible,
    excludeFromLeadScoring: !leadEligible,
    excludeFromSalesMetrics: !leadEligible
  };
}

export function isSalesEligibleLead(lead: Lead | null | undefined) {
  return Boolean(lead && lead.leadEligible !== false);
}

function priorNonSalesIntent(lead?: Lead | null): ConversationIntent | null {
  const intent = lead?.conversationIntent;
  if (!intent || !INTENTS.has(intent)) return null;
  if ([
    "vendor_supplier_solicitation",
    "partnership_collaboration_outreach",
    "recruitment_job_enquiry",
    "existing_vendor_or_business_contact"
  ].includes(intent)) return intent;
  return null;
}

function classifyDeterministically(input: {
  content: NormalizedInboundContent;
  lead?: Lead | null;
  botPaused?: boolean;
}): { intent: ConversationIntent; confidence: number; reasonCodes: string[]; manualOverrideApplied: boolean } {
  if (input.botPaused || input.lead?.botPaused) {
    return { intent: "human_takeover_or_bot_paused", confidence: 1, reasonCodes: ["bot_paused_or_human_takeover"], manualOverrideApplied: false };
  }

  const manualOverride = input.lead?.intentManualOverride;
  if (manualOverride && INTENTS.has(manualOverride)) {
    return { intent: manualOverride, confidence: 1, reasonCodes: ["manual_intent_override"], manualOverrideApplied: true };
  }

  const text = input.content.normalizedCurrentText;
  const messageType = input.content.currentMessageType;
  const priorIntent = priorNonSalesIntent(input.lead);
  const existingClient = isExistingClient(input.lead);

  if (hasSpamOrScamSignal(text)) {
    return { intent: "spam_scam_irrelevant", confidence: 0.99, reasonCodes: ["spam_or_scam_language"], manualOverrideApplied: false };
  }
  if (hasRecruitmentSignal(text)) {
    return { intent: "recruitment_job_enquiry", confidence: 0.98, reasonCodes: ["recruitment_or_job_language"], manualOverrideApplied: false };
  }
  if (hasPartnershipSignal(text)) {
    return { intent: "partnership_collaboration_outreach", confidence: 0.96, reasonCodes: ["partnership_or_collaboration_language"], manualOverrideApplied: false };
  }
  if (hasVendorSignal(text)) {
    return { intent: "vendor_supplier_solicitation", confidence: 0.98, reasonCodes: ["sender_offers_business_service", "vendor_sales_collateral"], manualOverrideApplied: false };
  }
  if (existingClient && (hasExistingProjectSignal(text) || !hasExplicitNewProjectSignal(text))) {
    return { intent: "existing_client_project_message", confidence: 0.98, reasonCodes: ["existing_project_record", "project_message_routing"], manualOverrideApplied: false };
  }
  if (hasWrongNumberOrGeneralSignal(text)) {
    return {
      intent: "wrong_number_or_general_chat",
      confidence: 0.97,
      reasonCodes: [hasOptOutSignal(text) ? "explicit_contact_opt_out" : "explicit_wrong_number_or_general_chat"],
      manualOverrideApplied: false
    };
  }
  if (priorIntent && !hasStrongRenovationSignal(text, messageType)) {
    return { intent: "existing_vendor_or_business_contact", confidence: 0.95, reasonCodes: ["persisted_non_sales_business_context"], manualOverrideApplied: false };
  }
  if (hasStrongRenovationSignal(text, messageType)) {
    return { intent: "genuine_new_renovation_lead", confidence: 0.97, reasonCodes: ["renovation_project_signal"], manualOverrideApplied: false };
  }
  if (isGreetingOrBusinessPing(text)) {
    return { intent: "genuine_new_renovation_lead", confidence: 0.9, reasonCodes: ["first_contact_business_greeting"], manualOverrideApplied: false };
  }
  if (isShortLeadFact(text)) {
    return { intent: "genuine_new_renovation_lead", confidence: 0.92, reasonCodes: ["progressive_renovation_intake_fact"], manualOverrideApplied: false };
  }
  if (hasActiveSalesConversationContext(input.content, input.lead) && text.length <= 160) {
    return { intent: "genuine_new_renovation_lead", confidence: 0.9, reasonCodes: ["active_sales_conversation_context"], manualOverrideApplied: false };
  }
  if (["audio", "voice", "image", "document", "video"].includes(messageType) && input.lead?.leadEligible !== false) {
    return { intent: "genuine_new_renovation_lead", confidence: 0.86, reasonCodes: ["media_in_existing_sales_conversation"], manualOverrideApplied: false };
  }
  if (/\b(?:quote|quotation|price|how much|site visit|appointment|meet|design|theme|can you help)\b/.test(text)) {
    return { intent: "genuine_new_renovation_lead", confidence: 0.84, reasonCodes: ["business_enquiry_signal"], manualOverrideApplied: false };
  }
  return { intent: "unclear_intent", confidence: 0.62, reasonCodes: ["insufficient_intent_evidence"], manualOverrideApplied: false };
}

export function classifyConversationIntent(input: {
  currentMessageText: string;
  currentMessageType: string;
  recentMessages?: LeadMessage[];
  lead?: Lead | null;
  botPaused?: boolean;
}): IntentGateDecision {
  const startedAt = performance.now();
  let normalizedContent: NormalizedInboundContent = {
    currentText: "",
    normalizedCurrentText: "",
    currentMessageType: "",
    recentMeaningfulMessages: [],
    recentInboundText: "",
    recentOutboundText: "",
    mergedContextText: "",
    meaningfulMessageCount: 0
  };
  try {
    normalizedContent = normalizeInboundContent(input);
    const classified = classifyDeterministically({ content: normalizedContent, lead: input.lead, botPaused: input.botPaused });
    const eligibility = determineLeadEligibility(classified.intent);
    const contactOptOut = classified.reasonCodes.includes("explicit_contact_opt_out");
    return {
      ...eligibility,
      primaryIntent: classified.intent,
      conversationIntent: classified.intent,
      confidence: classified.confidence,
      reasonCodes: classified.reasonCodes,
      autoReplyPolicy: contactOptOut ? "no_auto_reply" : policyForIntent(classified.intent),
      suggestedReply: contactOptOut ? "" : replyForIntent(classified.intent, normalizedContent.normalizedCurrentText),
      classifierVersion: WHATSAPP_INTENT_GATE_VERSION,
      ruleVersion: WHATSAPP_INTENT_GATE_RULE_VERSION,
      classificationLatencyMs: Math.max(0, performance.now() - startedAt),
      classificationFailed: false,
      manualOverrideApplied: classified.manualOverrideApplied,
      normalizedContent
    };
  } catch {
    const intent: ConversationIntent = "unclear_intent";
    return {
      ...determineLeadEligibility(intent),
      primaryIntent: intent,
      conversationIntent: intent,
      confidence: 0,
      reasonCodes: ["classifier_failure_safe_suppression"],
      autoReplyPolicy: "no_auto_reply",
      suggestedReply: "",
      classifierVersion: WHATSAPP_INTENT_GATE_VERSION,
      ruleVersion: WHATSAPP_INTENT_GATE_RULE_VERSION,
      classificationLatencyMs: Math.max(0, performance.now() - startedAt),
      classificationFailed: true,
      manualOverrideApplied: false,
      normalizedContent
    };
  }
}

function acknowledgedIntentsFromLead(lead?: Lead | null) {
  const state = lead?.conversationSafetyState ?? {};
  const values = state.acknowledgedIntents;
  return Array.isArray(values) ? values.map(String) : [];
}

function acknowledgementAlreadySent(
  intent: ConversationIntent,
  expectedReply: string,
  lead: Lead | null | undefined,
  messages: LeadMessage[]
) {
  if (acknowledgedIntentsFromLead(lead).includes(intent)) return true;
  const expected = normalize(expectedReply);
  return messages.some((message) => {
    if (message.direction !== "outbound" || !message.body.trim()) return false;
    const metadataIntent = String(message.metadata?.conversationIntent ?? message.metadata?.intentGateIntent ?? "");
    const policy = String(message.metadata?.autoReplyPolicy ?? "");
    return metadataIntent === intent || policy === policyForIntent(intent) || (expected && normalize(message.body) === expected);
  });
}

export function planReplyOrNoReply(input: {
  intentGate: IntentGateDecision;
  lead?: Lead | null;
  recentMessages?: LeadMessage[];
  autoReplyEnabled: boolean;
}): IntentGateReplyPlan {
  const gate = input.intentGate;
  if (gate.leadEligible && gate.autoReplyPolicy === "sales_brain") {
    return {
      shouldUseSalesBrain: true,
      shouldReply: input.autoReplyEnabled,
      replyText: "",
      intentionalNoReplyReason: input.autoReplyEnabled ? null : "auto_reply_disabled",
      acknowledgementAlreadySent: false,
      acknowledgementIntent: null
    };
  }

  if (gate.autoReplyPolicy === "no_auto_reply" || gate.classificationFailed) {
    return {
      shouldUseSalesBrain: false,
      shouldReply: false,
      replyText: "",
      intentionalNoReplyReason: gate.classificationFailed ? "intent_classifier_failed_safe_suppression" : `${gate.primaryIntent}_suppressed`,
      acknowledgementAlreadySent: false,
      acknowledgementIntent: null
    };
  }

  const alreadySent = acknowledgementAlreadySent(
    gate.primaryIntent,
    gate.suggestedReply,
    input.lead,
    input.recentMessages ?? []
  );
  return {
    shouldUseSalesBrain: false,
    shouldReply: input.autoReplyEnabled && !alreadySent && Boolean(gate.suggestedReply.trim()),
    replyText: alreadySent ? "" : gate.suggestedReply,
    intentionalNoReplyReason: alreadySent
      ? `${gate.primaryIntent}_acknowledgement_already_sent`
      : input.autoReplyEnabled
        ? null
        : "auto_reply_disabled",
    acknowledgementAlreadySent: alreadySent,
    acknowledgementIntent: gate.primaryIntent
  };
}

export function conversationIntentLabel(intent: ConversationIntent) {
  return {
    genuine_new_renovation_lead: "Renovation lead",
    existing_client_project_message: "Existing client",
    vendor_supplier_solicitation: "Vendor / supplier",
    partnership_collaboration_outreach: "Partnership",
    recruitment_job_enquiry: "Recruitment",
    spam_scam_irrelevant: "Spam / scam",
    wrong_number_or_general_chat: "General / wrong number",
    unclear_intent: "Intent unclear",
    human_takeover_or_bot_paused: "Human takeover",
    existing_vendor_or_business_contact: "Business contact"
  }[intent];
}
