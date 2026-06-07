import type { Lead, LeadMessage } from "@/lib/types";
import {
  buildClientFacingKnownSummary,
  buildNormalizedWhatsAppLeadContext,
  getLimmInstagramUrl,
  isBudgetStatementText,
  isConfusionPingText,
  isShortPingText,
  type NormalizedWhatsAppLeadContext
} from "@/lib/whatsapp-lead-context";

export const V7_WORLD_CLASS_SALES_BRAIN_VERSION = "v7_world_class_whatsapp_sales_brain";
export const V7_1_MEMORY_CONTRACT_VERSION = "v7_1_whatsapp_conversation_memory_contract_fix";
export const V7_2_SINGLE_REPLY_PLANNER_VERSION = "v7_2_single_reply_planner_playbook_v5";
export const V7_2_1_CONTEXT_AWARE_NEXT_ITEM_VERSION = "v7_2_1_context_aware_next_item_client_name_rule";
export const V7_2_2_PRICE_REPLY_KNOWN_CONTEXT_VERSION = "v7_2_2_price_reply_uses_known_context";
export const V7_2_3_LEGACY_TEMPLATE_REMOVAL_VERSION = "v7_2_3_remove_legacy_whatsapp_reply_templates";

export type V7WhatsAppIntent =
  | "greeting"
  | "renovation_enquiry"
  | "provide_project_details"
  | "provide_budget_expectation"
  | "price_question"
  | "appointment_request"
  | "design_question"
  | "portfolio_request"
  | "hacking_question"
  | "approval_question"
  | "file_or_media_sent"
  | "file_status_question"
  | "floorplan_status_question"
  | "media_status_question"
  | "short_ping"
  | "confusion_ping"
  | "already_told_you"
  | "complaint_or_frustration"
  | "human_takeover_request"
  | "thanks_or_acknowledgement"
  | "follow_up_ping";

export type V7ConversationStage =
  | "new_lead"
  | "context_collection"
  | "context_confirmed"
  | "budget_expectation_given"
  | "price_safety"
  | "appointment_preference_collection"
  | "design_discussion"
  | "portfolio_routing"
  | "human_review_needed"
  | "short_recovery";

export type V7PlaybookLeadStage =
  | "new_unknown"
  | "project_identified"
  | "serious_project"
  | "files_requested"
  | "files_received"
  | "meeting_ready"
  | "handoff_needed"
  | "nurture_follow_up";

export type V7ClientState =
  | "curious"
  | "serious"
  | "price_checking"
  | "file_checking"
  | "ready_to_meet"
  | "confused"
  | "annoyed"
  | "high_risk_of_dropoff";

export type V7ClientPatience = "normal" | "slightly_confused" | "annoyed" | "high_risk_of_dropoff";

export type V7LeadSeriousness = "low" | "medium" | "serious" | "premium";

export type V7PrimaryMove =
  | "greet"
  | "acknowledge_details"
  | "answer_direct_question"
  | "confirm_file_status"
  | "safe_price_reply"
  | "request_files"
  | "collect_meeting_preference"
  | "collect_design_lifestyle_info"
  | "route_to_portfolio"
  | "clarify_confusion"
  | "recover_from_mistake"
  | "handoff_to_team"
  | "escalate_to_manager"
  | "simple_acknowledgement";

export interface V7WhatsAppSalesReplyPlan {
  salesMoment: string;
  clientState: V7ClientState;
  leadStage: V7PlaybookLeadStage;
  leadSeriousness: V7LeadSeriousness;
  primaryMove: V7PrimaryMove;
  knownFactsSummary: string;
  directAnswer: string;
  shouldAskQuestions: boolean;
  questionBudget: number;
  missingInfoToAsk: string[];
  forbiddenFieldsToAskAgain: string[];
  fileStatusAnswer: string;
  handoffRecommended: boolean;
  replyLengthTier: "tier_1" | "tier_2" | "tier_3" | "tier_4";
  safetyNotes: string[];
  clientNameKnown: boolean;
  shouldAskClientName: boolean;
  clientNamePrompt: string;
}

export interface V7HumanFeelJudgement {
  score: number;
  passed: boolean;
  minimumScore: number;
  failReasons: string[];
}

export interface V7WhatsAppSalesBrainInput {
  inboundMessageText: string;
  inboundMessageType: string;
  lead: Lead;
  previousMessages: LeadMessage[];
  autoReplyEnabled: boolean;
  calendarEventId?: string | null;
}

export interface V7WhatsAppSalesBrainDecision {
  version: typeof V7_2_3_LEGACY_TEMPLATE_REMOVAL_VERSION;
  shouldReply: boolean;
  replyText: string;
  intents: V7WhatsAppIntent[];
  primaryIntent: V7WhatsAppIntent;
  stage: V7ConversationStage;
  confidence: number;
  salesMove: string;
  answeredClientQuestion: boolean;
  askedFields: string[];
  missingInfo: string[];
  repeatedQuestionRisk: boolean;
  context: NormalizedWhatsAppLeadContext;
  trace: Record<string, unknown>;
}

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s?]/g, " ").replace(/\s+/g, " ").trim();
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function readableList(items: string[]) {
  const unique = [...new Set(items.filter(Boolean))];
  if (unique.length <= 1) return unique.join("");
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

function extractPreferredTiming(text: string, context: NormalizedWhatsAppLeadContext) {
  if (context.preferred_meeting_time) return context.preferred_meeting_time;
  const normalized = normalise(text);
  const day = normalized.match(/\b(mon|monday|tue|tuesday|wed|wednesday|thu|thursday|fri|friday|sat|saturday|sun|sunday)\b/i)?.[0];
  const time = normalized.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i)?.[0];
  if (day && time) return `${day.replace(/^\w/, (char) => char.toUpperCase())} ${time.toUpperCase().replace(/\s+/g, "")}`;
  if (day) return day.replace(/^\w/, (char) => char.toUpperCase());
  if (has(normalized, /\btomorrow\b/i)) return time ? `tomorrow ${time.toUpperCase().replace(/\s+/g, "")}` : "tomorrow";
  return time ? time.toUpperCase().replace(/\s+/g, "") : "the requested timing";
}

export function detectV7WhatsAppIntents(text: string, type: string, context: NormalizedWhatsAppLeadContext): V7WhatsAppIntent[] {
  const normalized = normalise(text);
  const intents: V7WhatsAppIntent[] = [];
  const add = (intent: V7WhatsAppIntent) => {
    if (!intents.includes(intent)) intents.push(intent);
  };

  if (["image", "document", "video"].includes(type.toLowerCase()) || context.floor_plan_received || context.site_photos_received || context.reference_images_received) {
    add("file_or_media_sent");
  }
  if (has(normalized, /\b(can you see|did you receive|did you get|you received|i sent already|i uploaded already|sent already|uploaded already).{0,40}\b(floor\s*plan|floorplan|file|photo|image|document|drawing|layout)\b/i)) {
    add("file_status_question");
    if (has(normalized, /\bfloor\s*plan|floorplan|drawing|layout\b/i)) add("floorplan_status_question");
    if (has(normalized, /\bphoto|image|file|document\b/i)) add("media_status_question");
  }
  if (has(text, /\b(i already told you|i said already|i told you already|already told you|already sent|already mentioned)\b/i)) add("already_told_you");
  if (isConfusionPingText(text)) add("confusion_ping");
  if (isShortPingText(text)) add("short_ping");
  if (has(normalized, /\b(hello|hi|hey|good morning|good afternoon)\b/i) && normalized.length <= 80) add("greeting");
  if (isBudgetStatementText(text) || has(normalized, /\b(set aside|budget expectation|budget around|my budget|budget 500k|budget 80k|budget 120k)\b/i)) add("provide_budget_expectation");
  if (!intents.includes("provide_budget_expectation") && has(normalized, /\b(how much|roughly how much|price|cost|estimate|quote|quotation|package)\b/i)) add("price_question");
  if (has(normalized, /\b(appt|appointment|meeting|meet|site visit|come down|slot|available|wed|wednesday|tomorrow|next available)\b/i)) add("appointment_request");
  if (has(normalized, /\b(design theme|design concept|design direction|design ideas?|style|moodboard|japandi|modern luxury|minimalist)\b/i)) add("design_question");
  if (has(normalized, /\b(past works?|past projects?|project photos?|portfolio|before after|before and after|show me your work|can see your work|got landed photo|completed project)\b/i)) add("portfolio_request");
  if (has(normalized, /\b(hack|hacking|wall hacking|demolish|demolition|remove wall|wall)\b/i)) add("hacking_question");
  if (has(normalized, /\b(approval|permit|submission|ura|bca|approve|pass)\b/i)) add("approval_question");
  if (has(normalized, /\b(landed|condo|hdb|commercial|office|clinic|shop|renovation|reno|a a|aa works|a&a|addition and alteration|kitchen|bathroom|carpentry|hacking|full house|whole house)\b/i)) add("provide_project_details");
  if (has(normalized, /\b(i want to renovate|want to do|can help with house|reno landed can)\b/i)) add("renovation_enquiry");
  if (has(normalized, /\b(refund|lawyer|complaint|unhappy|cancel project|paid deposit|urgent|call me|start project)\b/i)) {
    add("complaint_or_frustration");
    add("human_takeover_request");
  }
  if (has(normalized, /\b(thanks|thank you|noted)\b/i) && normalized.length <= 48) add("thanks_or_acknowledgement");
  if (has(normalized, /\b(are you there|you there|can reply|any update)\b/i)) add("follow_up_ping");

  if (!intents.length && normalized) add("renovation_enquiry");
  return intents;
}

function primaryIntent(intents: V7WhatsAppIntent[]) {
  const priority: V7WhatsAppIntent[] = [
    "already_told_you",
    "complaint_or_frustration",
    "human_takeover_request",
    "price_question",
    "appointment_request",
    "floorplan_status_question",
    "file_status_question",
    "media_status_question",
    "confusion_ping",
    "short_ping",
    "provide_budget_expectation",
    "design_question",
    "portfolio_request",
    "hacking_question",
    "approval_question",
    "provide_project_details",
    "file_or_media_sent",
    "follow_up_ping",
    "greeting",
    "renovation_enquiry",
    "thanks_or_acknowledgement"
  ];
  return priority.find((intent) => intents.includes(intent)) ?? intents[0] ?? "renovation_enquiry";
}

function determineStage(intent: V7WhatsAppIntent, context: NormalizedWhatsAppLeadContext): V7ConversationStage {
  if (intent === "already_told_you" || intent === "short_ping" || intent === "confusion_ping" || intent === "follow_up_ping") return "short_recovery";
  if (intent === "complaint_or_frustration" || intent === "human_takeover_request") return "human_review_needed";
  if (intent === "price_question") return "price_safety";
  if (intent === "file_status_question" || intent === "floorplan_status_question" || intent === "media_status_question") return "context_confirmed";
  if (intent === "appointment_request") return "appointment_preference_collection";
  if (intent === "design_question") return "design_discussion";
  if (intent === "portfolio_request") return "portfolio_routing";
  if (intent === "hacking_question" || intent === "approval_question") return "human_review_needed";
  if (intent === "provide_budget_expectation") return "budget_expectation_given";
  if (context.known_facts_summary) return "context_confirmed";
  return "context_collection";
}

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    property_type: "property type",
    scope: "scope of work",
    floor_plan: "floor plan",
    site_photos: "site photos",
    address_or_area: "property area/address",
    design_references: "design references",
    timeline: "preferred timeline"
  };
  return labels[field] ?? field.replace(/_/g, " ");
}

function selectMissingFields(context: NormalizedWhatsAppLeadContext, mode: "first" | "normal" | "appointment" | "price" | "design" = "normal") {
  const base = context.missing_fields.filter((field) => !context.last_bot_asked_fields.includes(field) || mode === "first");
  const priority = mode === "appointment"
    ? ["address_or_area", "scope", "floor_plan", "site_photos", "property_type"]
    : mode === "price"
      ? ["scope", "floor_plan", "site_photos", "address_or_area"]
      : mode === "design"
        ? ["design_references", "floor_plan", "site_photos", "scope", "lifestyle"]
        : ["floor_plan", "site_photos", "scope", "address_or_area", "design_references", "timeline", "property_type"];
  const ordered = priority.filter((field) => field === "lifestyle" ? !context.lifestyle_needs.length : base.includes(field));
  const limit = mode === "first" && !context.known_facts_summary ? 5 : 3;
  return ordered.slice(0, limit);
}

function askForFields(fields: string[], suffix = "for an initial project review") {
  if (!fields.length) return "";
  return `Could you send the ${readableList(fields.map(fieldLabel))} if available ${suffix}?`;
}

function knownAcknowledgement(context: NormalizedWhatsAppLeadContext, prefix = "Thanks, noted.") {
  const summary = buildClientFacingKnownSummary(context);
  if (!summary) return "";
  if (context.property_type) return `${prefix} This is a ${summary}.`;
  if (context.property_address || context.property_area || context.postal_code) return `${prefix} - ${summary}.`;
  return `${prefix} ${summary}.`;
}

function shortKnownAcknowledgement(context: NormalizedWhatsAppLeadContext) {
  const summary = buildClientFacingKnownSummary(context);
  if (!summary) return "";
  return `We've noted: ${summary}.`;
}

function composeProjectDetailsReply(context: NormalizedWhatsAppLeadContext) {
  const hasOnlyAddress = Boolean(!context.property_type && !context.scope_summary && !context.timeline && !context.budget_expectation && (context.property_address || context.property_area || context.postal_code));
  if (hasOnlyAddress) {
    const summary = buildClientFacingKnownSummary(context);
    return `Thanks, noted - ${summary}. Could you share what type of property this is and what renovation works you're planning? If you have a floor plan or site photos, you can send them here too.`;
  }
  const intro = knownAcknowledgement(context) || "Thanks, noted. We can help review this.";
  const fields = selectMissingFields(context, context.known_facts_summary ? "normal" : "first");
  const ask = askForFields(fields);
  if (!ask) return `${intro} The team can review these details and advise the next step for an initial project review.`;
  const extra = fields.length < 3 && !context.areas_involved.length ? " It would also help to know the main areas you are planning to change." : "";
  return `${intro}\n\nFor the initial project review, ${ask.charAt(0).toLowerCase()}${ask.slice(1)}${extra}`;
}

function composeBudgetStatementReply(context: NormalizedWhatsAppLeadContext) {
  const intro = knownAcknowledgement(context) || "Thanks, noted. We have recorded your budget expectation.";
  const fields = selectMissingFields(context, "normal").filter((field) => field !== "timeline");
  const ask = fields.length
    ? `For the initial project review, could you send the ${readableList(fields.map(fieldLabel))} if available?`
    : "The team can review the details properly for an initial project review.";
  const design = context.design_direction || context.reference_images_received ? "" : " Any preferred design direction or reference images would also be useful.";
  return `${intro}\n\n${ask}${design}`;
}

function composeAlreadyToldYouReply(context: NormalizedWhatsAppLeadContext) {
  const known = shortKnownAcknowledgement(context) || "We've noted the details you shared so far.";
  const fields = selectMissingFields(context, "normal");
  const remaining = fields.length
    ? `The main items still helpful for review are the ${readableList(fields.map(fieldLabel))}.`
    : "The team has enough main details to review the next step.";
  const design = !context.reference_images_received ? " If you have design references, you can send those too." : "";
  return `You're right, sorry about that. ${known}\n\n${remaining}${design}`;
}

function composeShortPingReply(text: string, context: NormalizedWhatsAppLeadContext) {
  if (isConfusionPingText(text)) {
    const known = shortKnownAcknowledgement(context) || "We've noted the details shared so far.";
    const fields = selectMissingFields(context, "normal").slice(0, 3);
    const next = fields.length
      ? `The next helpful items are the ${readableList(fields.map(fieldLabel))} if available.`
      : "The team can review the next step for an initial project review.";
    return `Sorry if that was unclear. ${known} ${next}`;
  }
  const fields = selectMissingFields(context, "normal").slice(0, 2);
  if (context.known_facts_summary) {
    const summary = buildClientFacingKnownSummary(context);
    const nextFields = selectMissingFields(context, "normal").slice(0, 3);
    if (/^\s*ok\?\s*$/i.test(text) && summary) {
      const next = nextFields.length
        ? `The next helpful items are the ${readableList(nextFields.map(fieldLabel))}.`
        : "The team can review the next step for an initial project review.";
      return `Yes, noted. We have the main details so far: ${summary}. ${next}`;
    }
    const next = fields.length
      ? `You can send the ${readableList(fields.map(fieldLabel))} when available, and the team can review the next step for an initial project review.`
      : "The team can review the next step for an initial project review.";
    return `Yes, noted. We have the main details so far. ${next}`;
  }
  return "Hi, yes we're here. You can share your property type, basic renovation scope, and any floor plan or site photos if available for an initial project review.";
}

function composeGreetingReply(context: NormalizedWhatsAppLeadContext) {
  if (buildClientFacingKnownSummary(context)) return composeShortPingReply("hello", context);
  return "Hi, yes we're here. Could you share what type of renovation you're planning and which areas are involved? If you have a floor plan or site photos, you can send them here too.";
}

function composePriceQuestionReply(context: NormalizedWhatsAppLeadContext) {
  if (context.scope_summary || context.floor_plan_received || context.budget_expectation) {
    const known = context.known_facts_summary ? ` ${shortKnownAcknowledgement(context)}` : "";
    const fields = selectMissingFields(context, "price").filter((field) => field !== "scope");
    const ask = fields.length ? ` If possible, send the ${readableList(fields.map(fieldLabel))} so the team can review more accurately.` : "";
    return `I understand you'd like a rough idea.${known} The team should review the drawings/site photos, site condition and material direction first before advising.${ask} We can advise the next step after review.`;
  }
  return "I understand you'd like a rough idea. The team needs to review your property type, renovation scope, floor plan/site photos, site condition and material direction first before advising.";
}

function composeAppointmentReply(text: string, context: NormalizedWhatsAppLeadContext) {
  const timing = extractPreferredTiming(text, context);
  const fields = selectMissingFields(context, "appointment").slice(0, 3);
  const missing = fields.length
    ? ` Could you share the ${readableList(fields.map(fieldLabel))} first so the team can review before confirming?`
    : " Since we have the main details, the team will review and check whether that slot works.";
  return `${timing} noted. We can help check availability, but the appointment is not confirmed yet.${missing} This will be for an initial project review.`;
}

function composeDesignReply(context: NormalizedWhatsAppLeadContext) {
  const known = context.known_facts_summary ? `${shortKnownAcknowledgement(context)} ` : "";
  const fields = selectMissingFields(context, "design").slice(0, 3);
  const ask = fields.length ? ` If you can send the ${readableList(fields.map(fieldLabel))}, we can review what direction fits best.` : " The team can review what direction fits best during the initial project review.";
  return `${known}Yes, we can help propose a suitable design direction. The right theme should match your layout, lighting, lifestyle, storage needs and renovation scope, such as modern warm luxury, Japandi, minimalist or contemporary landed style.${ask}`;
}

function composePortfolioReply(context: NormalizedWhatsAppLeadContext) {
  const instagram = getLimmInstagramUrl();
  const tailored = context.scope_summary || context.property_type
    ? ` Since you're looking at ${readableList([context.property_type, context.scope_summary].filter(Boolean))}, the team can also point you to more relevant examples based on your scope.`
    : " If you're looking for a specific type of reference, let us know whether it's for landed A&A, full house renovation, kitchen, bathroom, carpentry, hacking works, design works or commercial renovation.";
  if (!instagram) {
    return `Yes, we can share relevant references.${tailored} Final design and scope still depend on your site condition, drawings and requirements for an initial project review.`;
  }
  return `Yes, you can view some of our renovation works, design references and project-related content on our Instagram here:\n\n${instagram}\n\n${tailored} Final design and scope still depend on your site condition, drawings and requirements for an initial project review.`;
}

function composeFileStatusReply(context: NormalizedWhatsAppLeadContext) {
  if (context.floor_plan_received) {
    return "Yes, we've received the floor plan. The team can review it together with the site photos and any design references if available for an initial project review.";
  }
  if (context.site_photos_received || context.reference_images_received || context.memory.hasImageOrDocument || context.memory.hasMedia) {
    return "Yes, we've received the file/photo. The team will review it and match it to your renovation enquiry for an initial project review.";
  }
  return "I don't see the floor plan confirmed on our side yet. Could you resend it here, or use the upload link if provided?";
}

function composeRiskOrHandoffReply(context: NormalizedWhatsAppLeadContext, kind: "complaint" | "hacking" | "approval") {
  if (kind === "complaint") {
    return "Thanks for raising this. I'll get the team to follow up with you directly and review the matter properly before advising the next step. Could you share the relevant details, photos or messages so it can be checked carefully?";
  }
  if (kind === "hacking") {
    const ask = context.floor_plan_received ? "photos of the wall or affected area" : "floor plan and photos of the wall or affected area";
    return `We'll need to check the drawings and site condition first. Wall hacking depends on the wall type, structure, services, property rules and approval/submission requirements if applicable. Could you send the ${ask} for an initial project review?`;
  }
  return "It depends on the exact scope and property type. Some works may require proper checking or submission, so we should review the drawings, site condition and proposed changes before advising for an initial project review.";
}

function composeCombinedReply(text: string, intents: V7WhatsAppIntent[], context: NormalizedWhatsAppLeadContext) {
  const parts: string[] = [];
  if (context.known_facts_summary) parts.push(knownAcknowledgement(context));
  else parts.push("Thanks, noted. We can help review this.");

  if (intents.includes("design_question")) {
    parts.push("For the design theme, we can propose a suitable direction after reviewing your layout, lighting, storage needs, lifestyle and preferred style.");
  }
  if (intents.includes("appointment_request")) {
    const timing = extractPreferredTiming(text, context);
    parts.push(`${timing} noted. We can help check availability, but the appointment is not confirmed yet until the team confirms.`);
  }
  if (intents.includes("price_question")) {
    parts.push("I understand you'd like a rough idea. The team needs to review the scope, drawings/site photos, site condition and material direction first, so we should not give a figure too early.");
  }
  if (intents.includes("portfolio_request")) {
    parts.push(`You can also view some renovation works and design references here: ${getLimmInstagramUrl()}`);
  }
  const riskNotes = [
    has(normalise(text), /\bhack|hacking|wall\b/i) ? "For wall hacking, we need to review the drawings and site condition first because it depends on wall type, structure and services." : "",
    has(normalise(text), /\bapproval|permit|submission|ura|bca\b/i) ? "For approval or submission matters, requirements depend on the property type, exact scope and authority requirements." : ""
  ].filter(Boolean);
  if (riskNotes.length) parts.push(riskNotes.join(" "));

  const fields = selectMissingFields(context, "normal").slice(0, 3);
  if (fields.length) {
    parts.push(`For the initial project review, could you send the ${readableList(fields.map(fieldLabel))} if available?`);
  } else {
    parts.push("The team can review the details shared so far and advise the next step for an initial project review.");
  }
  return parts.filter(Boolean).join("\n\n");
}

function composeFallbackReply(context: NormalizedWhatsAppLeadContext) {
  if (context.known_facts_summary) {
    const fields = selectMissingFields(context, "normal").slice(0, 2);
    const ask = fields.length ? ` You can send the ${readableList(fields.map(fieldLabel))} if available.` : "";
    return `${shortKnownAcknowledgement(context)}${ask} The team can review the next step for an initial project review.`;
  }
  return "Thanks for your message. Could you share your property type, basic renovation scope, and any floor plan or site photos if available? The team can review the next step for an initial project review.";
}

function composeReply(input: V7WhatsAppSalesBrainInput, intents: V7WhatsAppIntent[], primary: V7WhatsAppIntent, context: NormalizedWhatsAppLeadContext) {
  if (intents.length >= 3 && !intents.includes("short_ping") && !intents.includes("confusion_ping")) return composeCombinedReply(input.inboundMessageText, intents, context);
  if (primary === "already_told_you") return composeAlreadyToldYouReply(context);
  if (primary === "file_status_question" || primary === "floorplan_status_question" || primary === "media_status_question") return composeFileStatusReply(context);
  if (primary === "short_ping" || primary === "confusion_ping" || primary === "follow_up_ping" || primary === "thanks_or_acknowledgement") return composeShortPingReply(input.inboundMessageText, context);
  if (primary === "provide_budget_expectation") return composeBudgetStatementReply(context);
  if (primary === "price_question") return composePriceQuestionReply(context);
  if (primary === "appointment_request") return composeAppointmentReply(input.inboundMessageText, context);
  if (primary === "design_question") return composeDesignReply(context);
  if (primary === "portfolio_request") return composePortfolioReply(context);
  if (primary === "complaint_or_frustration" || primary === "human_takeover_request") return composeRiskOrHandoffReply(context, "complaint");
  if (has(normalise(input.inboundMessageText), /\bhack|hacking|wall\b/i)) return composeRiskOrHandoffReply(context, "hacking");
  if (has(normalise(input.inboundMessageText), /\bapproval|permit|submission|ura|bca\b/i)) return composeRiskOrHandoffReply(context, "approval");
  if (primary === "greeting") return composeGreetingReply(context);
  if (primary === "provide_project_details" || primary === "renovation_enquiry" || primary === "file_or_media_sent") return composeProjectDetailsReply(context);
  return composeFallbackReply(context);
}

function salesMoveFor(primary: V7WhatsAppIntent) {
  const moves: Record<V7WhatsAppIntent, string> = {
    greeting: "short_welcome_and_collect_context",
    renovation_enquiry: "acknowledge_project_and_collect_missing_info",
    provide_project_details: "acknowledge_known_context_first",
    provide_budget_expectation: "record_budget_expectation_without_quoting",
    price_question: "safe_price_scope_first_reply",
    appointment_request: "collect_preferred_timing_without_confirmation",
    design_question: "answer_design_direction_and_request_references",
    portfolio_request: "route_to_instagram_portfolio",
    hacking_question: "technical_caution_and_collect_drawings",
    approval_question: "authority_caution_and_collect_scope",
    file_or_media_sent: "acknowledge_file_context",
    file_status_question: "answer_file_status_question",
    floorplan_status_question: "answer_floorplan_status_question",
    media_status_question: "answer_media_status_question",
    short_ping: "short_context_reassurance",
    confusion_ping: "clarify_without_full_intake",
    already_told_you: "apologise_and_summarise_known_info",
    complaint_or_frustration: "human_review_handoff",
    human_takeover_request: "human_review_handoff",
    thanks_or_acknowledgement: "short_context_reassurance",
    follow_up_ping: "warm_ping_reassurance"
  };
  return moves[primary];
}

function fieldsAskedInReply(reply: string) {
  return [
    /\bfloor plan\b/i.test(reply) ? "floor_plan" : "",
    /\bsite photos?\b|\bphotos?\b/i.test(reply) ? "site_photos" : "",
    /\bscope\b|\bmain areas\b/i.test(reply) ? "scope" : "",
    /\bproperty type\b/i.test(reply) ? "property_type" : "",
    /\baddress\b|\barea\b/i.test(reply) ? "address_or_area" : "",
    /\bdesign references?\b|\breference images?\b/i.test(reply) ? "design_references" : "",
    /\btimeline\b|\btarget date\b/i.test(reply) ? "timeline" : ""
  ].filter(Boolean);
}

function playbookKnownSummary(context: NormalizedWhatsAppLeadContext, mode: "short" | "full" = "full") {
  const summary = buildClientFacingKnownSummary(context)
    .replace(/,\s+with A&A works/i, " for A&A works")
    .replace(/,\s+with aa works/i, " for A&A works")
    .replace(/\s+/g, " ")
    .trim();
  if (!summary || /pending review|unknown|not provided|This is a at|This is with/i.test(summary)) return "";
  if (mode === "short") {
    const location = context.property_address || context.property_area || context.postal_code;
    if (context.property_type && /a&a|aa works|addition and alteration/i.test(context.scope_summary) && location) {
      return `${context.property_type} A&A enquiry at ${location}`;
    }
    if (context.property_type && location) return `${context.property_type} enquiry at ${location}`;
    return summary;
  }
  return summary;
}

function isAAndA(context: NormalizedWhatsAppLeadContext) {
  return /a&a|aa works|a a works|addition and alteration/i.test(context.scope_summary || context.renovation_type);
}

function isSeriousLandedAa(context: NormalizedWhatsAppLeadContext) {
  return Boolean(
    /landed/i.test(context.property_type) &&
      isAAndA(context) &&
      (context.property_address || context.property_area || context.postal_code) &&
      (context.timeline || context.key_collection_date || context.move_in_date || context.budget_expectation)
  );
}

function isKnownLandedAa(context: NormalizedWhatsAppLeadContext) {
  return Boolean(/landed/i.test(context.property_type) && isAAndA(context));
}

function shouldUseKnownLandedAaPriceContext(context: NormalizedWhatsAppLeadContext) {
  return Boolean(
    isKnownLandedAa(context) &&
      (
        context.floor_plan_received ||
        context.site_photos_received ||
        context.reference_images_received ||
        context.property_address ||
        context.property_area ||
        context.postal_code ||
        context.timeline ||
        context.key_collection_date ||
        context.move_in_date ||
        context.budget_expectation
      )
  );
}

function isReviewReadySeriousLandedAa(context: NormalizedWhatsAppLeadContext) {
  return isSeriousLandedAa(context) && context.floor_plan_received;
}

function hasUsableClientName(name: string | null | undefined) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return false;
  if (/^\+?\d[\d\s-]{5,}$/.test(trimmed)) return false;
  if (/\b(unknown|test|demo|sample|whatsapp|lead|client|customer|no name|n\/a)\b/i.test(trimmed)) return false;
  return /[a-z]/i.test(trimmed);
}

function whatsappProfileNameFromHistory(messages: LeadMessage[]) {
  for (const message of messages) {
    const metadata = message.metadata ?? {};
    const candidates = [
      metadata.profile_name,
      metadata.profileName,
      metadata.whatsappProfileName,
      metadata.contactName,
      metadata.senderName,
      metadata.fromName
    ];
    const usable = candidates.find((candidate) => typeof candidate === "string" && hasUsableClientName(candidate));
    if (typeof usable === "string") return usable;
  }
  return "";
}

function clientNameKnown(input: V7WhatsAppSalesBrainInput) {
  return hasUsableClientName(input.lead.clientName) || hasUsableClientName(whatsappProfileNameFromHistory(input.previousMessages));
}

function classifyClientState(intents: V7WhatsAppIntent[]): V7ClientState {
  if (intents.includes("already_told_you") || intents.includes("complaint_or_frustration")) return "annoyed";
  if (intents.includes("confusion_ping")) return "confused";
  if (intents.includes("price_question")) return "price_checking";
  if (intents.includes("file_status_question") || intents.includes("floorplan_status_question") || intents.includes("media_status_question")) return "file_checking";
  if (intents.includes("appointment_request")) return "ready_to_meet";
  if (intents.includes("provide_budget_expectation") || intents.includes("provide_project_details") || intents.includes("file_or_media_sent")) return "serious";
  return "curious";
}

function detectClientPatience(text: string, intents: V7WhatsAppIntent[]): V7ClientPatience {
  if (has(text, /\b(i already told you|you asked already|why you ask again|i said already|already told you)\b/i)) return "annoyed";
  if (has(text, /\?\?\??|huh|unclear/i) || intents.includes("confusion_ping")) return "slightly_confused";
  if (has(text, /\b(can reply|any update|are you there)\b/i)) return "slightly_confused";
  return "normal";
}

function scoreLeadSeriousness(context: NormalizedWhatsAppLeadContext, intents: V7WhatsAppIntent[]): V7LeadSeriousness {
  if (isSeriousLandedAa(context)) return "premium";
  const score = [
    /landed|commercial/i.test(context.property_type) ? 1 : 0,
    isAAndA(context) ? 1 : 0,
    context.property_address || context.property_area || context.postal_code ? 1 : 0,
    context.budget_expectation ? 1 : 0,
    context.timeline || context.key_collection_date || context.move_in_date ? 1 : 0,
    context.floor_plan_received || context.site_photos_received || context.reference_images_received ? 1 : 0,
    intents.includes("appointment_request") ? 1 : 0
  ].reduce((total, item) => total + item, 0);
  if (score >= 4) return "serious";
  if (score >= 2) return "medium";
  return "low";
}

function classifyLeadStage(context: NormalizedWhatsAppLeadContext, intents: V7WhatsAppIntent[], seriousness: V7LeadSeriousness): V7PlaybookLeadStage {
  if (intents.includes("complaint_or_frustration") || intents.includes("human_takeover_request")) return "handoff_needed";
  if (context.floor_plan_received || context.site_photos_received || context.reference_images_received) return "files_received";
  if (intents.includes("appointment_request") && (context.property_type || context.scope_summary || context.property_address)) return "meeting_ready";
  if (seriousness === "premium" || seriousness === "serious") return "serious_project";
  if (context.last_bot_asked_fields.includes("floor_plan") || context.last_bot_asked_fields.includes("site_photos")) return "files_requested";
  if (context.known_facts_summary) return "project_identified";
  return "new_unknown";
}

function fieldAlreadyKnown(context: NormalizedWhatsAppLeadContext, field: string) {
  if (field === "property_type") return Boolean(context.property_type);
  if (field === "scope") return Boolean(context.scope_summary);
  if (field === "floor_plan") return context.floor_plan_received;
  if (field === "site_photos") return context.site_photos_received;
  if (field === "address_or_area") return Boolean(context.property_address || context.property_area || context.postal_code);
  if (field === "design_references") return context.reference_images_received;
  if (field === "timeline") return Boolean(context.timeline || context.key_collection_date || context.move_in_date);
  if (field === "budget_expectation") return Boolean(context.budget_expectation);
  if (field === "lifestyle") return Boolean(context.occupants_summary || context.lifestyle_needs.length || context.children_present || context.elderly_present || context.helper_present || context.pets_present);
  if (field === "meeting_timing") return Boolean(context.preferred_meeting_time);
  return false;
}

function selectQuestionBudget(state: V7ClientState, stage: V7PlaybookLeadStage, seriousness: V7LeadSeriousness) {
  if (state === "annoyed" || state === "confused" || state === "file_checking" || state === "ready_to_meet") return 1;
  if (seriousness === "premium" || seriousness === "serious" || stage === "serious_project" || stage === "files_received") return 2;
  if (stage === "new_unknown") return 4;
  return 3;
}

function playbookMissingFields(context: NormalizedWhatsAppLeadContext, planSeed: {
  primaryMove: V7PrimaryMove;
  leadStage: V7PlaybookLeadStage;
  leadSeriousness: V7LeadSeriousness;
  questionBudget: number;
}) {
  const seriousLandedAaNextItems = () => {
    const priority = !context.floor_plan_received
      ? ["floor_plan", "site_photos", "design_references"]
      : !context.site_photos_received
        ? ["site_photos", "design_references"]
        : !context.reference_images_received
          ? ["design_references", "lifestyle"]
          : ["meeting_timing"];
    return priority.filter((field) => !fieldAlreadyKnown(context, field)).slice(0, planSeed.questionBudget);
  };

  if (["confirm_file_status", "safe_price_reply", "route_to_portfolio", "clarify_confusion", "recover_from_mistake", "simple_acknowledgement", "handoff_to_team", "escalate_to_manager"].includes(planSeed.primaryMove)) {
    if (planSeed.primaryMove === "safe_price_reply") {
      if (shouldUseKnownLandedAaPriceContext(context)) return seriousLandedAaNextItems();
      return ["scope", "floor_plan", "site_photos", "design_references"].filter((field) => !fieldAlreadyKnown(context, field)).slice(0, planSeed.questionBudget);
    }
    if (planSeed.primaryMove === "route_to_portfolio" && isSeriousLandedAa(context)) {
      return seriousLandedAaNextItems();
    }
    if (planSeed.primaryMove === "clarify_confusion" || planSeed.primaryMove === "recover_from_mistake") {
      return ["floor_plan", "site_photos", "design_references"].filter((field) => !fieldAlreadyKnown(context, field)).slice(0, planSeed.questionBudget);
    }
    return [];
  }

  let priority: string[] = [];
  if (isSeriousLandedAa(context)) {
    priority = seriousLandedAaNextItems();
  } else if (planSeed.primaryMove === "collect_meeting_preference") {
    priority = ["property_type", "scope", "address_or_area", "floor_plan", "site_photos"];
  } else if (planSeed.primaryMove === "collect_design_lifestyle_info") {
    priority = ["design_references", "floor_plan", "site_photos", "lifestyle"];
  } else if (planSeed.leadStage === "new_unknown") {
    priority = ["property_type", "scope", "floor_plan", "site_photos"];
  } else if (planSeed.leadStage === "files_received") {
    priority = ["design_references", "lifestyle", "meeting_timing"];
  } else {
    priority = ["floor_plan", "site_photos", "design_references", "timeline", "meeting_timing", "lifestyle", "scope", "address_or_area", "property_type"];
  }

  return priority
    .filter((field) => !fieldAlreadyKnown(context, field))
    .filter((field) => !(isKnownLandedAa(context) && field === "scope"))
    .slice(0, planSeed.questionBudget);
}

function selectPrimaryMove(intents: V7WhatsAppIntent[], clientState: V7ClientState, context: NormalizedWhatsAppLeadContext): V7PrimaryMove {
  if (clientState === "annoyed" || intents.includes("already_told_you")) return "recover_from_mistake";
  if (intents.includes("complaint_or_frustration") || intents.includes("human_takeover_request")) return "escalate_to_manager";
  if (intents.includes("floorplan_status_question") || intents.includes("file_status_question") || intents.includes("media_status_question")) return "confirm_file_status";
  if (intents.includes("price_question")) return "safe_price_reply";
  if (intents.includes("appointment_request")) return "collect_meeting_preference";
  if (intents.includes("portfolio_request")) return "route_to_portfolio";
  if (intents.includes("design_question")) return "collect_design_lifestyle_info";
  if (intents.includes("hacking_question") || intents.includes("approval_question")) return "answer_direct_question";
  if (intents.includes("confusion_ping")) return "clarify_confusion";
  if (intents.includes("short_ping") || intents.includes("follow_up_ping") || intents.includes("thanks_or_acknowledgement")) return "simple_acknowledgement";
  if (isSeriousLandedAa(context)) return "request_files";
  if (intents.includes("provide_budget_expectation") || intents.includes("provide_project_details") || intents.includes("file_or_media_sent")) return "acknowledge_details";
  if (intents.includes("greeting")) return "greet";
  return context.known_facts_summary ? "acknowledge_details" : "greet";
}

function fileStatusAnswerFor(context: NormalizedWhatsAppLeadContext) {
  if (context.floor_plan_received) return "Yes, we've received the floor plan. That will help the team review the layout and A&A scope more properly.";
  if (context.site_photos_received || context.reference_images_received || context.memory.hasImageOrDocument || context.memory.hasMedia) {
    return "Yes, we've received the file/photo. The team can verify it against your enquiry and review the next step.";
  }
  return "I don't see the floor plan confirmed on our side yet. Could you resend it here?";
}

function directAnswerFor(input: V7WhatsAppSalesBrainInput, intents: V7WhatsAppIntent[], primaryMove: V7PrimaryMove, context: NormalizedWhatsAppLeadContext) {
  if (primaryMove === "confirm_file_status") return fileStatusAnswerFor(context);
  if (primaryMove === "safe_price_reply" && shouldUseKnownLandedAaPriceContext(context)) {
    return "I understand you'd like a rough idea. For landed A&A works, the team should review the floor plan, site photos, site condition and material direction first before advising.";
  }
  if (primaryMove === "safe_price_reply") return "I understand you'd like a rough idea. The team needs to review your property type, renovation scope, floor plan/site photos and material direction first before advising.";
  if (primaryMove === "collect_meeting_preference") {
    const timing = extractPreferredTiming(input.inboundMessageText, context);
    return `${timing} noted as your preferred timing. The team will check availability before confirming.`;
  }
  if (primaryMove === "route_to_portfolio") return `You can view some of our past works here: ${getLimmInstagramUrl()}`;
  if (primaryMove === "collect_design_lifestyle_info") return "Yes, we can help with design direction and renovation planning.";
  if (intents.includes("hacking_question") && intents.includes("approval_question")) {
    return "For wall hacking and approval/submission matters, the team will need to review the drawings, site condition, scope and applicable requirements before advising what is suitable.";
  }
  if (intents.includes("hacking_question")) {
    return "The team can review wall hacking works, but they need to check the floor plan and site condition before advising what is suitable.";
  }
  if (intents.includes("approval_question")) {
    return "It depends on the exact scope and property type. Some works may require proper checking or submission before the team can advise.";
  }
  if (primaryMove === "recover_from_mistake") return "You're right, sorry about that.";
  if (primaryMove === "clarify_confusion") return "Sorry if that was unclear.";
  if (primaryMove === "escalate_to_manager") return "Thanks for raising this. I'll get the team to follow up directly and review the matter properly.";
  if (primaryMove === "greet") return "Hi, yes we're here.";
  if (primaryMove === "simple_acknowledgement") return "Yes, noted.";
  if (intents.includes("provide_budget_expectation")) return "Thanks, that budget expectation helps. The team can use it to consider the right scope and material direction, while final pricing still depends on confirmed drawings, site condition and works.";
  return "Thanks, noted.";
}

export function planWhatsAppSalesReply(input: V7WhatsAppSalesBrainInput): {
  plan: V7WhatsAppSalesReplyPlan;
  intents: V7WhatsAppIntent[];
  primaryIntent: V7WhatsAppIntent;
  context: NormalizedWhatsAppLeadContext;
} {
  const context = buildNormalizedWhatsAppLeadContext({
    lead: input.lead,
    previousMessages: input.previousMessages,
    inboundText: input.inboundMessageText
  });
  const intents = detectV7WhatsAppIntents(input.inboundMessageText, input.inboundMessageType, context);
  const primary = primaryIntent(intents);
  const clientState = classifyClientState(intents);
  const leadSeriousness = scoreLeadSeriousness(context, intents);
  const leadStage = classifyLeadStage(context, intents, leadSeriousness);
  const primaryMove = selectPrimaryMove(intents, clientState, context);
  const patience = detectClientPatience(input.inboundMessageText, intents);
  const questionBudget = patience !== "normal" ? 1 : selectQuestionBudget(clientState, leadStage, leadSeriousness);
  const missingInfoToAsk = playbookMissingFields(context, { primaryMove, leadStage, leadSeriousness, questionBudget });
  const hasClientName = clientNameKnown(input);
  const shouldAskClientName =
    !hasClientName &&
    patience === "normal" &&
    !["clarify_confusion", "recover_from_mistake", "greet", "simple_acknowledgement"].includes(primaryMove) &&
    (
      leadStage === "serious_project" ||
      leadStage === "files_received" ||
      leadStage === "meeting_ready" ||
      leadStage === "handoff_needed" ||
      leadSeriousness === "premium" ||
      primaryMove === "collect_meeting_preference"
    );
  const forbiddenFieldsToAskAgain = [
    fieldAlreadyKnown(context, "property_type") ? "property_type" : "",
    fieldAlreadyKnown(context, "address_or_area") ? "address_or_area" : "",
    fieldAlreadyKnown(context, "budget_expectation") ? "budget_expectation" : "",
    fieldAlreadyKnown(context, "timeline") ? "timeline" : "",
    fieldAlreadyKnown(context, "scope") ? "scope" : "",
    fieldAlreadyKnown(context, "floor_plan") ? "floor_plan" : "",
    fieldAlreadyKnown(context, "site_photos") ? "site_photos" : "",
    fieldAlreadyKnown(context, "design_references") ? "design_references" : "",
    isKnownLandedAa(context) ? "main_areas" : ""
  ].filter(Boolean);
  const directAnswer = directAnswerFor(input, intents, primaryMove, context);
  const plan: V7WhatsAppSalesReplyPlan = {
    salesMoment: primary,
    clientState,
    leadStage,
    leadSeriousness,
    primaryMove,
    knownFactsSummary: playbookKnownSummary(context),
    directAnswer,
    shouldAskQuestions: missingInfoToAsk.length > 0,
    questionBudget,
    missingInfoToAsk,
    forbiddenFieldsToAskAgain,
    fileStatusAnswer: fileStatusAnswerFor(context),
    handoffRecommended:
      leadStage === "handoff_needed" ||
      leadSeriousness === "premium" ||
      intents.includes("appointment_request") ||
      intents.includes("price_question") ||
      intents.includes("provide_budget_expectation") ||
      intents.includes("hacking_question") ||
      intents.includes("approval_question") ||
      context.floor_plan_received ||
      context.site_photos_received,
    replyLengthTier: leadStage === "new_unknown" ? "tier_2" : leadSeriousness === "premium" ? "tier_2" : "tier_1",
    safetyNotes: [
      "No pricing, ranges or package amounts.",
      "No appointment confirmation without a calendar event.",
      "No approval, hacking, structural or timeline guarantees."
    ],
    clientNameKnown: hasClientName,
    shouldAskClientName,
    clientNamePrompt: shouldAskClientName ? "May I also have your name so the team can record the enquiry properly?" : ""
  };
  return { plan, intents, primaryIntent: primary, context };
}

function askSentence(fields: string[], context: NormalizedWhatsAppLeadContext) {
  if (!fields.length) return "";
  const labels = fields.map((field) => field === "lifestyle"
    ? "who will be staying there, such as children, elderly family members, helper or pets"
    : field === "meeting_timing"
      ? "preferred meeting timing"
      : fieldLabel(field));
  if (fields.includes("lifestyle")) {
    const nonLifestyle = labels.filter((label) => !label.startsWith("who will be staying"));
    const lifestyle = labels.find((label) => label.startsWith("who will be staying"));
    if (nonLifestyle.length) {
      return `Could you send the ${readableList(nonLifestyle)} if available? It would also help to know ${lifestyle}, so the team can plan the proposal direction more properly.`;
    }
    return `It would also help to know ${lifestyle}, so the team can consider layout, safety, storage and material direction.`;
  }
  const prefix = isSeriousLandedAa(context) ? "Could you send" : "Could you share";
  const suffix = isSeriousLandedAa(context) ? "so the team can review from there" : "for an initial project review";
  return `${prefix} the ${readableList(labels)} if available ${suffix}?`;
}

function nextUsefulFileLine(context: NormalizedWhatsAppLeadContext, tone: "portfolio" | "price" | "general" = "general") {
  if (context.floor_plan_received && context.site_photos_received && context.reference_images_received) {
    return "We've received the floor plan, site photos and design references, so the team has enough key details to start reviewing.";
  }
  if (context.floor_plan_received && context.site_photos_received) {
    return tone === "price"
      ? "We've received the floor plan and site photos, so any design references would be useful next."
      : "We've received the floor plan and site photos, so any design references would be useful if available.";
  }
  if (context.floor_plan_received) {
    return tone === "price"
      ? "We've received the floor plan, so site photos and any design references would be useful next."
      : "We've received your floor plan, so site photos or design references would be useful if available.";
  }
  if (context.site_photos_received) {
    return "We've received your site photos, so the floor plan or design references would be useful if available.";
  }
  if (tone === "portfolio") {
    return "You can also send your floor plan or site photos when available, and the team can review from there.";
  }
  return "Could you send the floor plan and site photos if available?";
}

function reviewReadyLine(context: NormalizedWhatsAppLeadContext) {
  if (!isReviewReadySeriousLandedAa(context)) return "";
  if (context.site_photos_received && context.reference_images_received) {
    return "We have enough key details for the team to start reviewing. The team can already review the floor plan, site photos, references and project details.";
  }
  return `We have enough key details for the team to start reviewing. ${nextUsefulFileLine(context, "general")}`;
}

function withClientNamePrompt(reply: string, plan: V7WhatsAppSalesReplyPlan) {
  const trimmed = reply.trim();
  if (!plan.shouldAskClientName || !plan.clientNamePrompt) return trimmed;
  if (trimmed.includes(plan.clientNamePrompt)) return trimmed;
  return `${trimmed}\n\n${plan.clientNamePrompt}`;
}

function dedupeInitialProjectReview(reply: string) {
  let seen = false;
  return reply.replace(/\binitial project review\b/gi, (match) => {
    if (!seen) {
      seen = true;
      return match;
    }
    return "project review";
  });
}

function finalisePlannerReply(reply: string, plan: V7WhatsAppSalesReplyPlan) {
  return dedupeInitialProjectReview(withClientNamePrompt(reply, plan));
}

export function composeReplyFromPlan(plan: V7WhatsAppSalesReplyPlan, input: V7WhatsAppSalesBrainInput, context: NormalizedWhatsAppLeadContext, intents: V7WhatsAppIntent[]) {
  const knownFull = plan.knownFactsSummary;
  const knownShort = playbookKnownSummary(context, "short");
  const ask = askSentence(plan.missingInfoToAsk, context);

  if (plan.primaryMove === "recover_from_mistake") {
    const known = knownFull ? ` We have your ${knownFull} noted.` : " We have the details you shared noted.";
    const remaining = ask ? `\n\n${ask.replace(/^Could you share/i, "The remaining useful items are").replace(/^Could you send/i, "The remaining useful items are")}` : "\n\nThe team can review the details shared so far and advise the next step.";
    return `${plan.directAnswer}${known}${remaining}`;
  }

  if (plan.primaryMove === "clarify_confusion") {
    const contextLine = knownShort ? ` We have your ${knownShort} noted.` : "";
    const next = ask ? ` ${ask}` : " The team can review the next step for an initial project review.";
    return `${plan.directAnswer}${contextLine}${next}`;
  }

  if (plan.primaryMove === "confirm_file_status") {
    return plan.fileStatusAnswer;
  }

  if (plan.primaryMove === "safe_price_reply") {
    if (shouldUseKnownLandedAaPriceContext(context)) {
      const next = context.floor_plan_received
        ? nextUsefulFileLine(context, "price")
        : "Could you send the floor plan and site photos if available?";
      return `${plan.directAnswer}\n\n${next}`;
    }
    if (context.scope_summary || context.floor_plan_received || context.budget_expectation) {
      const known = knownFull ? ` Thanks, we've noted your ${knownFull}.` : "";
      const followUp = ask ? ` ${ask}` : " The team can go through this properly during the initial project review.";
      return `${plan.directAnswer}${known}${followUp}`;
    }
    const followUp = ask || "Could you share the property type, renovation scope and any floor plan/site photos if available?";
    return `${plan.directAnswer} ${followUp}`;
  }

  if (plan.primaryMove === "collect_meeting_preference") {
    const known = knownShort ? ` We have your ${knownShort} recorded.` : "";
    const followUp = ask ? ` ${ask.replace("if available for an initial project review", "first so the team can review before confirming")}` : " The team will review and check whether that slot works for an initial project review.";
    return `${plan.directAnswer}${known}${followUp}`;
  }

  if (plan.primaryMove === "route_to_portfolio") {
    const tailored = `\n\n${nextUsefulFileLine(context, "portfolio")}`;
    return `${plan.directAnswer}${tailored}`;
  }

  if (plan.primaryMove === "collect_design_lifestyle_info") {
    const known = knownShort ? ` We have your ${knownShort} noted.` : "";
    const next = ask || "If you have reference images, you can send them here for an initial project review.";
    return `${plan.directAnswer}${known} The right direction should match the layout, lighting, lifestyle, storage needs and renovation scope. ${next}`;
  }

  if (plan.primaryMove === "answer_direct_question") {
    const parts = [plan.directAnswer];
    if (intents.includes("design_question")) parts.push("For the design direction, the team can propose a suitable direction after reviewing your layout, lighting, storage needs and preferred style.");
    if (intents.includes("appointment_request")) parts.push(directAnswerFor(input, ["appointment_request"], "collect_meeting_preference", context));
    if (knownFull) parts.push(`We have your ${knownFull} noted.`);
    if (ask) parts.push(ask);
    return parts.join("\n\n");
  }

  if (plan.primaryMove === "escalate_to_manager") {
    return "Thanks for raising this. I'll get the team to follow up directly and review the matter properly before advising the next step.";
  }

  if (plan.primaryMove === "simple_acknowledgement") {
    if (/^\s*(hello|hi|hey)\??\s*$/i.test(input.inboundMessageText) && knownShort) {
      const next = ask ? ` ${ask}` : "";
      return `Hi, yes we're here. We have your ${knownShort} noted.${next}`;
    }
    if (/^\s*ok\?\s*$/i.test(input.inboundMessageText) && knownShort) {
      const next = ask || "You can send the floor plan, site photos or design references when available.";
      return `Yes, noted. We have your ${knownShort} recorded. ${next}`;
    }
    if (knownShort) {
      const next = ask || "The team can review the next step for an initial project review.";
      return `Yes, noted. We have your ${knownShort} recorded. ${next}`;
    }
    return "Hi, yes we're here. Could you share the property type, what kind of renovation you're planning, and whether you have a floor plan or site photos available?";
  }

  if (plan.primaryMove === "greet") {
    if (knownShort) return `Hi, yes we're here. We have your ${knownShort} noted.${ask ? ` ${ask}` : ""}`;
    return "Hi, yes we're here. Could you share the property type, what kind of renovation you're planning, and whether you have a floor plan or site photos available?";
  }

  if (plan.primaryMove === "acknowledge_details" && intents.includes("provide_budget_expectation") && !intents.includes("price_question")) {
    return plan.directAnswer;
  }

  if (isSeriousLandedAa(context)) {
    const summary = knownFull || "landed A&A enquiry";
    const next = reviewReadyLine(context) || ask || "The team can review the details shared so far and advise the next step.";
    return `Thanks, noted. This is a ${summary}.\n\n${next}`;
  }

  if (knownFull) {
    const next = ask || "The team can review the details shared so far and advise the next step for an initial project review.";
    return `Thanks, noted. This is a ${knownFull}.\n\n${next}`;
  }

  return `Thanks, noted. ${ask || "The team can review the next step for an initial project review."}`;
}

export function judgeHumanFeel(reply: string, plan: V7WhatsAppSalesReplyPlan, context: NormalizedWhatsAppLeadContext, intents: V7WhatsAppIntent[]): V7HumanFeelJudgement {
  const failReasons: string[] = [];
  let score = 0;
  if (plan.directAnswer && reply.toLowerCase().startsWith(plan.directAnswer.slice(0, Math.min(18, plan.directAnswer.length)).toLowerCase())) score += 20;
  else if (!["confirm_file_status", "safe_price_reply", "collect_meeting_preference", "route_to_portfolio"].includes(plan.primaryMove)) score += 20;
  else failReasons.push("direct_question_not_answered_first");

  if (!context.known_facts_summary || reply.includes(playbookKnownSummary(context, "short")) || reply.includes(playbookKnownSummary(context)) || plan.primaryMove === "greet") score += 20;
  else failReasons.push("remembered_context_not_used");

  const repeatedKnownAsk = plan.forbiddenFieldsToAskAgain.some((field) => {
    if (field === "floor_plan") return /\bsend (?:the )?floor plan\b/i.test(reply);
    if (field === "site_photos") return /\bsend (?:the )?site photos?\b/i.test(reply);
    if (field === "property_type") return /\bshare (?:the |your )?property type\b/i.test(reply);
    if (field === "address_or_area") return /\bshare (?:the |your )?(?:property )?(?:area|address)\b/i.test(reply);
    if (field === "main_areas") return /\bmain areas|which areas\b/i.test(reply);
    return false;
  });
  if (!repeatedKnownAsk) score += 20;
  else failReasons.push("known_info_asked_again");

  if (plan.missingInfoToAsk.length || plan.handoffRecommended || /\bteam can review|team will check|initial project review\b/i.test(reply)) score += 20;
  else failReasons.push("no_useful_next_step");

  if (!/Thanks for your message\. Could you share your property type, basic renovation scope/i.test(reply) && !/1\.|2\.|3\./.test(reply)) score += 20;
  else failReasons.push("generic_or_form_like_tone");

  if (/pending review|unknown|not provided|free consultation|from \$|rough estimate|price range|quote range|appointment confirmed|guaranteed|guarantee|sure can|no problem|can hack/i.test(reply)) {
    failReasons.push("absolute_fail_phrase");
    score = Math.min(score, 60);
  }
  if (isKnownLandedAa(context) && /\bmain areas|which areas\b/i.test(reply)) {
    failReasons.push("serious_landed_aa_asked_main_areas");
    score = Math.min(score, 60);
  }
  if (intents.includes("price_question") && shouldUseKnownLandedAaPriceContext(context) && /\bscope of work|main areas|areas involved\b/i.test(reply)) {
    failReasons.push("known_landed_aa_price_asked_broad_scope");
    score = Math.min(score, 60);
  }
  if (intents.includes("provide_budget_expectation") && !intents.includes("price_question") && /^I understand you'd like a rough idea/i.test(reply)) {
    failReasons.push("budget_statement_treated_as_price_question");
    score = Math.min(score, 60);
  }
  const minimumScore = plan.leadSeriousness === "premium" || plan.leadSeriousness === "serious" ? 90 : 85;
  return { score, passed: score >= minimumScore && failReasons.length === 0, minimumScore, failReasons };
}

export function buildV7WorldClassWhatsAppSalesBrainDecision(input: V7WhatsAppSalesBrainInput): V7WhatsAppSalesBrainDecision {
  const { plan, intents, primaryIntent: primary, context } = planWhatsAppSalesReply(input);
  let replyText = finalisePlannerReply(composeReplyFromPlan(plan, input, context, intents), plan).trim();
  let humanFeel = judgeHumanFeel(replyText, plan, context, intents);
  if (!humanFeel.passed) {
    const rewritePlan: V7WhatsAppSalesReplyPlan = {
        ...plan,
        questionBudget: Math.min(plan.questionBudget, plan.leadSeriousness === "premium" ? 2 : 1),
        missingInfoToAsk: plan.missingInfoToAsk.slice(0, Math.min(plan.missingInfoToAsk.length, plan.leadSeriousness === "premium" ? 2 : 1)),
        replyLengthTier: "tier_2"
      };
    replyText = finalisePlannerReply(composeReplyFromPlan(
      rewritePlan,
      input,
      context,
      intents
    ), rewritePlan).trim();
    humanFeel = judgeHumanFeel(replyText, plan, context, intents);
  }
  const askedFields = fieldsAskedInReply(replyText);
  const stage = determineStage(primary, context);

  return {
    version: V7_2_3_LEGACY_TEMPLATE_REMOVAL_VERSION,
    shouldReply: input.autoReplyEnabled && Boolean(replyText),
    replyText,
    intents,
    primaryIntent: primary,
    stage,
    confidence: plan.leadSeriousness === "premium" ? 96 : context.known_facts_summary || intents.length > 1 ? 92 : 86,
    salesMove: plan.primaryMove,
    answeredClientQuestion: Boolean(plan.directAnswer),
    askedFields,
    missingInfo: context.missing_fields,
    repeatedQuestionRisk: context.repeated_question_risk,
    context,
    trace: {
      v7_version: V7_2_3_LEGACY_TEMPLATE_REMOVAL_VERSION,
      v7PreviousVersion: V7_WORLD_CLASS_SALES_BRAIN_VERSION,
      v7MemoryContractVersion: V7_1_MEMORY_CONTRACT_VERSION,
      v7SingleReplyPlannerVersion: V7_2_SINGLE_REPLY_PLANNER_VERSION,
      v7KnownContextPriceVersion: V7_2_2_PRICE_REPLY_KNOWN_CONTEXT_VERSION,
      worldClassSalesConversationBrainAvailable: true,
      playbookV5SingleReplyPlannerAvailable: true,
      contextAwareNextUsefulItemAvailable: true,
      legacyReplyTemplatesRemovedFromLivePath: true,
      replySourceTraceAvailable: true,
      legacyTemplateBlockedInFinalReplies: true,
      priceReplyUsesV72PlannerOnly: true,
      priceReplyNoScopeAskForSeriousAa: true,
      priceReplyUsesKnownContext: true,
      priceReplyNoBroadScopeAskForSeriousLandedAa: true,
      priceReplyDoesNotAskReceivedFiles: true,
      portfolioReplyUsesFileContext: true,
      priceReplyUsesKnownProjectContext: true,
      greetingKnownContextNatural: true,
      clientNameRuleAvailable: true,
      reviewReadyStopAskingRefinementAvailable: true,
      receivedFilesNotAskedAgain: true,
      seriousLandedAaNoBroadScopeAsk: true,
      salesMomentClassifierAvailable: true,
      clientPatienceDetectorAvailable: true,
      leadSeriousnessScorerAvailable: true,
      nextBestMoveSelectorAvailable: true,
      humanFeelJudgeAvailable: true,
      stopAskingRuleAvailable: true,
      seriousLandedAaRuleAvailable: true,
      questionBudgetByClientStateAvailable: true,
      directQuestionFirstEnforced: true,
      fileConfidenceStatusAvailable: true,
      clientFacingPlaceholderSuppressionAvailable: true,
      mergedLeadContextContractAvailable: true,
      clientFacingKnownSummaryBuilderAvailable: true,
      fileStatusQuestionIntentAvailable: true,
      floorplanStatusReplyAvailable: true,
      knownContextPersistenceAcrossReplies: true,
      shortPingUsesKnownContextAvailable: true,
      internalPlaceholderNeverClientFacing: true,
      memoryFirstReplyComposerAvailable: true,
      knownInfoAcknowledgementBeforeQuestions: true,
      detectedIntents: intents,
      primaryIntent: primary,
      conversationStage: stage,
      salesReplyPlan: plan,
      salesMoment: plan.salesMoment,
      clientState: plan.clientState,
      leadStage: plan.leadStage,
      leadSeriousness: plan.leadSeriousness,
      primaryMove: plan.primaryMove,
      knownFactsSummary: plan.knownFactsSummary,
      directAnswer: plan.directAnswer,
      shouldAskQuestions: plan.shouldAskQuestions,
      questionBudget: plan.questionBudget,
      missingInfoToAsk: plan.missingInfoToAsk,
      forbiddenFieldsToAskAgain: plan.forbiddenFieldsToAskAgain,
      clientNameKnown: plan.clientNameKnown,
      shouldAskClientName: plan.shouldAskClientName,
      clientNamePromptAdded: Boolean(plan.clientNamePrompt && replyText.includes(plan.clientNamePrompt)),
      fileStatusAnswer: plan.fileStatusAnswer,
      handoffRecommended: plan.handoffRecommended,
      replyLengthTier: plan.replyLengthTier,
      humanFeelJudge: humanFeel,
      humanFeelScore: humanFeel.score,
      humanFeelPassed: humanFeel.passed,
      humanFeelFailReasons: humanFeel.failReasons,
      knownInfoBeforeQuestions: Boolean(context.known_facts_summary),
      knownContextSummary: context.known_facts_summary,
      missingFields: context.missing_fields,
      lastBotAskedFields: context.last_bot_asked_fields,
      repeatedQuestionRisk: context.repeated_question_risk,
      askedFields,
      maxThreeQuestionsDefaultAvailable: true,
      genericFallbackReducedAvailable: true,
      shortPingSmartReplyAvailable: true,
      confusionPingSmartReplyAvailable: true,
      alreadyToldYouRecoveryAvailable: true,
      budgetStatementNotPriceQuestionAvailable: true,
      contextAwareMissingInfoQuestionsAvailable: true,
      budgetExpectationClientProvidedOnly: Boolean(context.budget_expectation)
    }
  };
}
