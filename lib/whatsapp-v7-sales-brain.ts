import type { Lead, LeadMessage } from "@/lib/types";
import {
  buildNormalizedWhatsAppLeadContext,
  getLimmInstagramUrl,
  isBudgetStatementText,
  isConfusionPingText,
  isShortPingText,
  type NormalizedWhatsAppLeadContext
} from "@/lib/whatsapp-lead-context";

export const V7_WORLD_CLASS_SALES_BRAIN_VERSION = "v7_world_class_whatsapp_sales_brain";

export type V7WhatsAppIntent =
  | "greeting"
  | "renovation_enquiry"
  | "provide_project_details"
  | "provide_budget_expectation"
  | "price_question"
  | "appointment_request"
  | "design_question"
  | "portfolio_request"
  | "file_or_media_sent"
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

export interface V7WhatsAppSalesBrainInput {
  inboundMessageText: string;
  inboundMessageType: string;
  lead: Lead;
  previousMessages: LeadMessage[];
  autoReplyEnabled: boolean;
  calendarEventId?: string | null;
}

export interface V7WhatsAppSalesBrainDecision {
  version: typeof V7_WORLD_CLASS_SALES_BRAIN_VERSION;
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
  if (has(text, /\b(i already told you|i said already|i told you already|already told you|already sent|already mentioned)\b/i)) add("already_told_you");
  if (isConfusionPingText(text)) add("confusion_ping");
  if (isShortPingText(text)) add("short_ping");
  if (has(normalized, /\b(hello|hi|good morning|good afternoon)\b/i) && normalized.length <= 80) add("greeting");
  if (isBudgetStatementText(text) || has(normalized, /\b(set aside|budget expectation|budget around|my budget|budget 500k|budget 80k|budget 120k)\b/i)) add("provide_budget_expectation");
  if (!intents.includes("provide_budget_expectation") && has(normalized, /\b(how much|roughly how much|price|cost|estimate|quote|quotation|package)\b/i)) add("price_question");
  if (has(normalized, /\b(appt|appointment|meeting|meet|site visit|come down|slot|available|wed|wednesday|tomorrow|next available)\b/i)) add("appointment_request");
  if (has(normalized, /\b(design theme|design concept|design direction|design ideas?|style|moodboard|japandi|modern luxury|minimalist)\b/i)) add("design_question");
  if (has(normalized, /\b(past works?|past projects?|project photos?|portfolio|before after|before and after|show me your work|can see your work|got landed photo|completed project)\b/i)) add("portfolio_request");
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
    "confusion_ping",
    "short_ping",
    "provide_budget_expectation",
    "design_question",
    "portfolio_request",
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
  if (intent === "appointment_request") return "appointment_preference_collection";
  if (intent === "design_question") return "design_discussion";
  if (intent === "portfolio_request") return "portfolio_routing";
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
  if (!context.known_facts_summary) return "";
  return `${prefix} This is ${context.known_facts_summary}.`;
}

function shortKnownAcknowledgement(context: NormalizedWhatsAppLeadContext) {
  if (!context.known_facts_summary) return "";
  return `We've noted: ${context.known_facts_summary}.`;
}

function composeProjectDetailsReply(context: NormalizedWhatsAppLeadContext) {
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
    const next = fields.length
      ? `You can send the ${readableList(fields.map(fieldLabel))} when available, and the team can review the next step for an initial project review.`
      : "The team can review the next step for an initial project review.";
    return `Yes, noted. We have the main details so far. ${next}`;
  }
  return "Hi, yes we're here. You can share your property type, basic renovation scope, and any floor plan or site photos if available for an initial project review.";
}

function composePriceQuestionReply(context: NormalizedWhatsAppLeadContext) {
  if (context.scope_summary || context.floor_plan_received || context.budget_expectation) {
    const known = context.known_facts_summary ? ` ${shortKnownAcknowledgement(context)}` : "";
    const fields = selectMissingFields(context, "price").filter((field) => field !== "scope");
    const ask = fields.length ? ` If possible, send the ${readableList(fields.map(fieldLabel))} so the team can review more accurately.` : "";
    return `I understand you'd like a rough idea.${known} To avoid giving the wrong figure, the team needs to review the scope, drawings/site photos, site condition and material direction first.${ask} We can advise the next step for an initial project review.`;
  }
  return "I understand you'd like a rough idea. To avoid giving the wrong figure, the team needs to review the scope, drawings/site photos, site condition and material direction first. If you can send the floor plan, site photos and main areas involved, we can advise the next step for an initial project review.";
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
  if (primary === "short_ping" || primary === "confusion_ping" || primary === "follow_up_ping" || primary === "thanks_or_acknowledgement") return composeShortPingReply(input.inboundMessageText, context);
  if (primary === "provide_budget_expectation") return composeBudgetStatementReply(context);
  if (primary === "price_question") return composePriceQuestionReply(context);
  if (primary === "appointment_request") return composeAppointmentReply(input.inboundMessageText, context);
  if (primary === "design_question") return composeDesignReply(context);
  if (primary === "portfolio_request") return composePortfolioReply(context);
  if (primary === "complaint_or_frustration" || primary === "human_takeover_request") return composeRiskOrHandoffReply(context, "complaint");
  if (has(normalise(input.inboundMessageText), /\bhack|hacking|wall\b/i)) return composeRiskOrHandoffReply(context, "hacking");
  if (has(normalise(input.inboundMessageText), /\bapproval|permit|submission|ura|bca\b/i)) return composeRiskOrHandoffReply(context, "approval");
  if (primary === "provide_project_details" || primary === "renovation_enquiry" || primary === "file_or_media_sent" || primary === "greeting") return composeProjectDetailsReply(context);
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
    file_or_media_sent: "acknowledge_file_context",
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

export function buildV7WorldClassWhatsAppSalesBrainDecision(input: V7WhatsAppSalesBrainInput): V7WhatsAppSalesBrainDecision {
  const context = buildNormalizedWhatsAppLeadContext({
    lead: input.lead,
    previousMessages: input.previousMessages,
    inboundText: input.inboundMessageText
  });
  const intents = detectV7WhatsAppIntents(input.inboundMessageText, input.inboundMessageType, context);
  const primary = primaryIntent(intents);
  const replyText = composeReply(input, intents, primary, context).trim();
  const askedFields = fieldsAskedInReply(replyText);
  const stage = determineStage(primary, context);

  return {
    version: V7_WORLD_CLASS_SALES_BRAIN_VERSION,
    shouldReply: input.autoReplyEnabled && Boolean(replyText),
    replyText,
    intents,
    primaryIntent: primary,
    stage,
    confidence: context.known_facts_summary || intents.length > 1 ? 92 : 84,
    salesMove: salesMoveFor(primary),
    answeredClientQuestion: true,
    askedFields,
    missingInfo: context.missing_fields,
    repeatedQuestionRisk: context.repeated_question_risk,
    context,
    trace: {
      v7_version: V7_WORLD_CLASS_SALES_BRAIN_VERSION,
      worldClassSalesConversationBrainAvailable: true,
      memoryFirstReplyComposerAvailable: true,
      knownInfoAcknowledgementBeforeQuestions: true,
      detectedIntents: intents,
      primaryIntent: primary,
      conversationStage: stage,
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
