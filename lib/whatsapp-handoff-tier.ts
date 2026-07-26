import type { Lead, LeadMessage } from "@/lib/types";
import type { WhatsAppReplyDecision } from "@/lib/whatsapp-reply-decision";

export const WHATSAPP_HANDOFF_TIER_VERSION = "v11.4.11_tiered_handoff";

export type WhatsAppHandoffTier =
  | "pause_and_escalate"
  | "notify_marcus_continue_bot"
  | "bot_handles_normally";

export type WhatsAppHandoffTierDecision = {
  tier: WhatsAppHandoffTier;
  reasons: string[];
  pauseRequired: boolean;
  notifyMarcus: boolean;
  botContinues: boolean;
  version: string;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/https?:\/\/\S+|www\.\S+/g, " link ")
    .replace(/[^a-z0-9\u4e00-\u9fff$?&+\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metadataText(message: LeadMessage) {
  const metadata = message.metadata ?? {};
  return [
    metadata.caption,
    metadata.filename,
    metadata.messageType,
    metadata.mimeType,
    metadata.fileCategory
  ].filter(Boolean).map(String).join(" ");
}

function conversationText(latestMessage: string, recentMessages: LeadMessage[]) {
  return normalize([
    ...recentMessages
      .filter((message) => message.direction === "inbound")
      .slice(0, 8)
      .map((message) => `${message.body} ${metadataText(message)}`),
    latestMessage
  ].join("\n"));
}

function traceIntents(decision: WhatsAppReplyDecision) {
  const raw = decision.blackBoxTrace.detectedIntents;
  return Array.isArray(raw) ? raw.map((value) => normalize(value)).filter(Boolean) : [];
}

function traceFlag(decision: WhatsAppReplyDecision, key: string) {
  return Boolean(decision.blackBoxTrace[key]);
}

function explicitHumanRequest(text: string) {
  return /\b(?:speak|talk|chat)\s+(?:to|with)\s+(?:a\s+)?(?:human|person|staff|manager|boss|marcus)|\b(?:human|person|staff|manager|boss|marcus)\s+(?:please|reply|call|contact|take over)|\bcall me\b|\bi want (?:a )?(?:human|person|manager|marcus)\b|\bstop (?:the )?bot\b/.test(text);
}

function seriousFrustration(text: string) {
  return /\b(?:angry|furious|unacceptable|complaint|complain|wtf|stupid|nonsense|already told you|why (?:do )?you keep repeating|why ask again|you asked already|are you blind|terrible service|very disappointed|fed up)\b|\?\?\?/.test(text);
}

function legalOrPaymentDispute(text: string) {
  return /\b(?:lawyer|legal action|sue|lawsuit|police report|case complaint|small claims|tribunal|contract dispute|breach of contract|refund dispute|payment dispute|overpaid|overpayment|wrong invoice|invoice dispute|deposit dispute|progress payment dispute|refuse to pay|withhold payment|chargeback)\b/.test(text);
}

function safetyOrDamageIssue(text: string) {
  return /\b(?:unsafe|dangerous|injury|injured|accident|electric shock|electrocution|fire hazard|gas leak|major leak|flooding|water damage|property damage|ceiling collapse|wall collapse|stop work order|worksite hazard)\b/.test(text);
}

function authorityProblem(text: string) {
  return /\b(?:approval rejected|permit rejected|submission rejected|authority notice|bca notice|ura notice|hdb notice|mcst notice|illegal work|unauthorised work|unauthorized work|without approval|stop work notice|enforcement notice)\b/.test(text);
}

function appointmentSignal(text: string, intents: string[], decision: WhatsAppReplyDecision) {
  return decision.appointmentStatus !== "none" ||
    intents.some((intent) => /appointment|meeting_availability/.test(intent)) ||
    /\b(?:appointment|site visit|meet|meeting|come down|office visit|available on|available this|book a slot)\b/.test(text);
}

function quotationSignal(text: string, intents: string[]) {
  return intents.some((intent) => /price_question|quotation|quote/.test(intent)) ||
    /\b(?:prepare|send|need|want|request)\s+(?:a\s+)?(?:quote|quotation|proposal|estimate)|\bready to quote\b/.test(text);
}

function seriousBudgetOrTimeline(text: string, lead: Lead) {
  const hasBudget = /(?:\$|s\$)\s*\d[\d,.]*|\bbudget\s+(?:is|around|about|of)\b/.test(text) || Boolean(lead.intakeProfile?.budgetExpectation);
  const hasTimeline = /\b(?:move in|move-in|key collection|collect keys|start work|complete by|finish by|deadline|within \d+ (?:weeks?|months?))\b/.test(text) || Boolean(lead.intakeProfile?.timeline || lead.intakeProfile?.moveInDate || lead.intakeProfile?.keyCollectionDate);
  return hasBudget && hasTimeline;
}

function fileSignal(decision: WhatsAppReplyDecision, recentMessages: LeadMessage[]) {
  if (traceFlag(decision, "imageDetected") || traceFlag(decision, "documentDetected") || traceFlag(decision, "likelyFloorPlanDetected") || traceFlag(decision, "likelySitePhotoDetected")) return true;
  return recentMessages.some((message) => {
    if (message.direction !== "inbound") return false;
    const metadata = message.metadata ?? {};
    const type = normalize(metadata.messageType ?? metadata.type);
    const fileCategory = normalize(metadata.fileCategory);
    const body = normalize(`${message.body} ${metadataText(message)}`);
    return ["image", "document", "video"].includes(type) || /floor plan|floorplan|site photo|drawing|layout/.test(body) || /floor_plan|site_photo|quotation/.test(fileCategory);
  });
}

function highlyQualified(lead: Lead) {
  return lead.leadCategory === "Hot" ||
    lead.leadLevel === "Gold Lead" ||
    lead.leadScore >= 75 ||
    lead.quotationReadiness >= 75 ||
    (lead.intakeProfile?.proposalReadinessScore ?? 0) >= 75 ||
    (lead.intakeProfile?.meetingReadinessScore ?? 0) >= 80;
}

function normalOnlySignal(text: string, intents: string[]) {
  return /^(?:hi|hello|hey|good morning|good afternoon|good evening|你好)[?.! ]*$/.test(text) ||
    intents.includes("portfolio_request") ||
    /\b(?:portfolio|past works?|instagram|project photos?)\b/.test(text);
}

export function classifyWhatsAppHandoffTier(input: {
  lead: Lead;
  latestMessage: string;
  recentMessages: LeadMessage[];
  decision: WhatsAppReplyDecision;
}): WhatsAppHandoffTierDecision {
  const text = conversationText(input.latestMessage, input.recentMessages);
  const intents = traceIntents(input.decision);
  const pauseReasons = [
    input.decision.conversationIntent === "existing_client_project_message" ? "Existing client project issue" : "",
    input.decision.conversationIntent === "human_takeover_or_bot_paused" ? "Human takeover requested" : "",
    explicitHumanRequest(text) ? "Explicit human request" : "",
    seriousFrustration(text) ? "Serious client frustration" : "",
    legalOrPaymentDispute(text) ? "Legal or payment dispute" : "",
    safetyOrDamageIssue(text) ? "Safety or property-damage issue" : "",
    authorityProblem(text) ? "Authority or approval enforcement issue" : ""
  ].filter(Boolean);
  if (pauseReasons.length) {
    return {
      tier: "pause_and_escalate",
      reasons: [...new Set(pauseReasons)],
      pauseRequired: true,
      notifyMarcus: true,
      botContinues: false,
      version: WHATSAPP_HANDOFF_TIER_VERSION
    };
  }

  const notifyReasons = [
    appointmentSignal(text, intents, input.decision) ? "Appointment interest" : "",
    quotationSignal(text, intents) ? "Quotation or proposal interest" : "",
    fileSignal(input.decision, input.recentMessages) ? "Floor plan, site photo or project file received" : "",
    seriousBudgetOrTimeline(text, input.lead) ? "Serious budget and timeline shared" : "",
    highlyQualified(input.lead) ? "Highly qualified renovation lead" : "",
    input.decision.handoffRequired ? "Technical or manager review recommended" : ""
  ].filter(Boolean);
  if (notifyReasons.length && !normalOnlySignal(text, intents)) {
    return {
      tier: "notify_marcus_continue_bot",
      reasons: [...new Set(notifyReasons)],
      pauseRequired: false,
      notifyMarcus: true,
      botContinues: true,
      version: WHATSAPP_HANDOFF_TIER_VERSION
    };
  }

  return {
    tier: "bot_handles_normally",
    reasons: normalOnlySignal(text, intents) ? ["Routine enquiry handled by bot"] : ["No Marcus intervention required"],
    pauseRequired: false,
    notifyMarcus: false,
    botContinues: true,
    version: WHATSAPP_HANDOFF_TIER_VERSION
  };
}
