import "server-only";

import { evaluateBookingReadiness, type BookingReadiness } from "@/lib/calendar-booking";
import { getOpenAiWhatsAppReplyRuntime } from "@/lib/openai-whatsapp-config";
import type { Lead, LeadMessage } from "@/lib/types";
import {
  findQuestionBankEntry,
  matchQuestionBankIntent,
  selectQuestionBankReply,
  type QuestionBankIntentKey,
  type QuestionBankMatch
} from "@/lib/whatsapp-question-bank";
import { validateWhatsAppAutoReply, WHATSAPP_SAFE_FALLBACK_REPLY } from "@/lib/whatsapp-safety";

export type WhatsAppBrainIntent =
  | "landed_renovation"
  | "aa_works"
  | "general_enquiry"
  | "design_theme"
  | "condo_renovation"
  | "commercial_renovation"
  | "hacking_demo"
  | "carpentry"
  | "price_question"
  | "site_visit_request"
  | "appointment_request"
  | "floorplan_or_photos_sent"
  | "follow_up_ping"
  | "timeline_question"
  | "submission_approval"
  | "structural_wall"
  | "waterproofing_drainage_roof"
  | "bathroom_kitchen"
  | "small_handyman"
  | "spam_unrelated"
  | "vague_enquiry"
  | "unsupported_media"
  | "repeated_enquiry"
  | "complaint_or_risk"
  | "unsupported";

export type WhatsAppBrainPropertyType = "landed" | "condo" | "commercial" | "unknown";

export type WhatsAppBrainNextAction =
  | "ask_for_floor_plan"
  | "ask_for_site_photos"
  | "ask_for_scope"
  | "ask_for_address_or_area"
  | "ask_for_preferred_time"
  | "acknowledge_received_info"
  | "suggest_initial_project_review"
  | "boss_review_required"
  | "safe_decline"
  | "ask_for_design_references"
  | "ask_for_issue_photos"
  | "request_manager_review";

export interface WhatsAppBrainSchema {
  intent: WhatsAppBrainIntent;
  property_type: WhatsAppBrainPropertyType;
  scope_summary: string;
  missing_info: string[];
  risk_flags: string[];
  appointment_intent: boolean;
  appointment_type:
    | "initial_project_review"
    | "site_visit"
    | "phone_review"
    | "zoom_review"
    | "landed_aa_review"
    | "unknown";
  next_best_action: WhatsAppBrainNextAction;
  reply: string;
  internal_note: string;
  confidence: number;
  should_auto_send: boolean;
  should_request_boss_review: boolean;
  safety_notes: string[];
}

export interface WhatsAppBrainResult {
  schema: WhatsAppBrainSchema;
  reply: string;
  replySource: "openai" | "fallback_template" | "rewritten_openai" | "blocked" | "boss_review_required";
  templateKey: string;
  openAiEnabled: boolean;
  model: string;
  bookingReadiness: BookingReadiness;
  safetyResult: "passed" | "blocked";
  toneResult: "passed" | "cold_rewritten" | "too_salesy_blocked";
  repetitionResult: "passed" | "rewritten" | "fallback_variation" | "boss_review_required";
  blockedReason: string;
  auditMetadata: Record<string, unknown>;
}

export interface WhatsAppBrainContext {
  lead: Lead;
  latestInboundMessage: string;
  messages: LeadMessage[];
}

const intents: WhatsAppBrainIntent[] = [
  "landed_renovation",
  "aa_works",
  "general_enquiry",
  "design_theme",
  "condo_renovation",
  "commercial_renovation",
  "hacking_demo",
  "carpentry",
  "price_question",
  "site_visit_request",
  "appointment_request",
  "floorplan_or_photos_sent",
  "follow_up_ping",
  "timeline_question",
  "submission_approval",
  "structural_wall",
  "waterproofing_drainage_roof",
  "bathroom_kitchen",
  "small_handyman",
  "spam_unrelated",
  "vague_enquiry",
  "unsupported_media",
  "repeated_enquiry",
  "complaint_or_risk",
  "unsupported"
];

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function nextActionForQuestionBank(match: QuestionBankMatch): WhatsAppBrainNextAction {
  switch (match.entry.intent_key) {
    case "design_theme":
      return "ask_for_design_references";
    case "price_question":
      return "ask_for_scope";
    case "site_visit_request":
    case "appointment_request":
      return "ask_for_address_or_area";
    case "floorplan_or_photos_sent":
      return "acknowledge_received_info";
    case "follow_up_ping":
      return "ask_for_scope";
    case "submission_approval":
    case "structural_wall":
    case "complaint_or_risk":
      return "request_manager_review";
    case "waterproofing_drainage_roof":
      return "ask_for_issue_photos";
    case "hacking_demo":
    case "carpentry":
      return "ask_for_site_photos";
    case "spam_unrelated":
      return "safe_decline";
    default:
      return match.entry.required_missing_info.includes("floor_plan") ? "ask_for_floor_plan" : "ask_for_scope";
  }
}

function propertyTypeForQuestionBank(match: QuestionBankMatch, lead?: Lead): WhatsAppBrainPropertyType {
  if (match.entry.intent_key === "landed_renovation" || match.entry.intent_key === "aa_works") return "landed";
  if (match.entry.intent_key === "condo_renovation") return "condo";
  if (match.entry.intent_key === "commercial_renovation") return "commercial";
  if (lead?.propertyType) {
    if (/landed/i.test(lead.propertyType)) return "landed";
    if (/condo|apartment/i.test(lead.propertyType)) return "condo";
    if (/commercial|clinic|office|shop/i.test(lead.propertyType)) return "commercial";
  }
  return "unknown";
}

function appointmentTypeForQuestionBank(match: QuestionBankMatch) {
  if (match.entry.intent_key === "aa_works") return "landed_aa_review" as const;
  if (match.entry.intent_key === "site_visit_request") return "site_visit" as const;
  if (match.entry.intent_key === "appointment_request") return "initial_project_review" as const;
  return "initial_project_review" as const;
}

function questionBankIntentForBrainIntent(intent: WhatsAppBrainIntent): QuestionBankIntentKey {
  if (intent === "vague_enquiry") return "general_enquiry";
  return findQuestionBankEntry(intent as QuestionBankIntentKey).intent_key;
}

export function classifyWhatsAppIntent(text = "", lead?: Lead): WhatsAppBrainSchema {
  const questionBank = matchQuestionBankIntent(text);
  if (questionBank.score > 0 && questionBank.entry.intent_key !== "unsupported") {
    const missing = new Set(questionBank.entry.required_missing_info);
    if (lead?.propertyType) missing.delete("property_type");
    if (lead?.scopeSummary && !/pending review|not provided/i.test(lead.scopeSummary)) missing.delete("scope");
    const appointmentIntent = ["site_visit_request", "appointment_request"].includes(questionBank.entry.intent_key);
    const shouldRequestBoss = questionBank.entry.escalation_rule !== "auto_safe";
    const bossOnly = ["boss_only", "no_auto_reply"].includes(questionBank.entry.escalation_rule);
    return {
      intent: questionBank.entry.intent_key as WhatsAppBrainIntent,
      property_type: propertyTypeForQuestionBank(questionBank, lead),
      scope_summary: text.slice(0, 180) || lead?.scopeSummary || "",
      missing_info: [...missing],
      risk_flags: questionBank.entry.risk_flags,
      appointment_intent: appointmentIntent,
      appointment_type: appointmentTypeForQuestionBank(questionBank),
      next_best_action: nextActionForQuestionBank(questionBank),
      reply: "",
      internal_note: `Question bank matched ${questionBank.entry.category}: ${questionBank.entry.safe_answer_strategy}`,
      confidence: Math.min(95, 70 + questionBank.score * 5),
      should_auto_send: !bossOnly,
      should_request_boss_review: shouldRequestBoss,
      safety_notes: [
        "Question bank safety rules applied.",
        `Forbidden claims: ${questionBank.entry.forbidden_claims.join(", ") || "none"}`
      ]
    };
  }

  const combined = `${text} ${lead?.propertyType ?? ""} ${lead?.scopeSummary ?? ""}`.toLowerCase();
  const missing = new Set(["property_type", "scope", "floor_plan", "site_photos"]);
  const risk = new Set<string>();
  let intent: WhatsAppBrainIntent = "vague_enquiry";
  let propertyType: WhatsAppBrainPropertyType = "unknown";
  let action: WhatsAppBrainNextAction = "ask_for_scope";

  if (has(combined, /\b(price|cost|how much|roughly|budget|quote|quotation|\$|s\$|discount)\b/i)) {
    intent = "price_question";
    risk.add("pricing_request");
    action = "ask_for_scope";
  }
  if (has(combined, /\bcomplain|angry|upset|bad|lawyer|refund|defect\b/i)) {
    intent = "complaint_or_risk";
    risk.add("complaint");
    action = "boss_review_required";
  }
  if (has(combined, /\bfloor\s*plan|drawing|photo|picture|image|attached|send.*plan|have.*plan\b/i)) {
    intent = "floorplan_or_photos_sent";
    missing.delete("floor_plan");
    missing.delete("site_photos");
    action = "acknowledge_received_info";
  }
  if (has(combined, /\ba\s*&\s*a\b|\baa\b|addition|alteration|extension|roofline|drainage|waterproofing/i)) {
    intent = "aa_works";
    propertyType = "landed";
    risk.add("structural_or_aa");
    action = "ask_for_floor_plan";
  } else if (has(combined, /\blanded|terrace|semi[-\s]?d|bungalow|inter[-\s]?terrace\b/i)) {
    intent = intent === "price_question" ? intent : "landed_renovation";
    propertyType = "landed";
    action = action === "boss_review_required" ? action : "ask_for_floor_plan";
  } else if (has(combined, /\bcondo|apartment\b/i)) {
    intent = intent === "price_question" ? intent : "condo_renovation";
    propertyType = "condo";
  } else if (has(combined, /\bcommercial|clinic|office|shop|restaurant|treatment room|reception\b/i)) {
    intent = intent === "price_question" ? intent : "commercial_renovation";
    propertyType = "commercial";
    risk.add("commercial_project");
  } else if (has(combined, /\bhacking|demolition|dispose|debris|site protection\b/i)) {
    intent = "hacking_demo";
    action = "ask_for_site_photos";
  } else if (has(combined, /\bcarpentry|wardrobe|cabinet|feature wall|vanity\b/i)) {
    intent = "carpentry";
    action = "ask_for_site_photos";
  }

  const appointmentIntent = has(combined, /\bsite\s*(visit|discussion)|appointment|come\s+(down|site|today|tomorrow)|meet|schedule|book|call me\b/i);
  if (appointmentIntent && intent !== "price_question" && intent !== "complaint_or_risk") {
    intent = has(combined, /\bsite\s*(visit|discussion)|come\s+(down|site|today|tomorrow)\b/i) ? "site_visit_request" : "appointment_request";
    action = "ask_for_address_or_area";
  }
  if (appointmentIntent) missing.add("address_or_area");
  if (has(combined, /\btoday|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(am|pm)\b/i)) {
    missing.delete("preferred_date_time");
  } else if (appointmentIntent) {
    missing.add("preferred_date_time");
  }

  if (lead?.propertyType) missing.delete("property_type");
  if (lead?.scopeSummary && !/pending review|not provided/i.test(lead.scopeSummary)) missing.delete("scope");
  if (propertyType === "unknown" && lead?.propertyType) {
    if (/landed/i.test(lead.propertyType)) propertyType = "landed";
    else if (/condo/i.test(lead.propertyType)) propertyType = "condo";
    else if (/commercial/i.test(lead.propertyType)) propertyType = "commercial";
  }

  return {
    intent,
    property_type: propertyType,
    scope_summary: text.slice(0, 180) || lead?.scopeSummary || "",
    missing_info: [...missing],
    risk_flags: [...risk],
    appointment_intent: appointmentIntent,
    appointment_type: intent === "aa_works" ? "landed_aa_review" : appointmentIntent ? "site_visit" : "initial_project_review",
    next_best_action: action,
    reply: "",
    internal_note: "Deterministic WhatsApp classification generated with OpenAI off or before OpenAI validation.",
    confidence: intent === "vague_enquiry" ? 55 : 82,
    should_auto_send: intent !== "complaint_or_risk",
    should_request_boss_review: intent === "complaint_or_risk",
    safety_notes: ["No pricing, no booking confirmation, initial project review wording required."]
  };
}

const templates: Partial<Record<WhatsAppBrainIntent, string[]>> = {
  landed_renovation: [
    "Thanks for reaching out. For landed renovation, it's best not to advise blindly because layout, access and site conditions can affect the scope. Could you send the floor plan or site photos if available? We can take a look properly before advising the next step for an initial project review.",
    "No worries, we can help you review it properly. For landed work, the layout, access and existing condition matter quite a bit, so floor plans or site photos would be useful before we advise on the next step for an initial project review.",
    "Thanks for sharing. For a landed home, we'll need to understand the layout and site condition before guiding you properly. If you have a floor plan or site photos, send them over and we can review the enquiry for an initial project review."
  ],
  aa_works: [
    "Thanks for sharing. For landed A&A works, items like roofline, drainage, waterproofing, access and submission requirements can affect the scope. If you have the floor plan or site photos, send them over and we'll review it more properly for an initial project review.",
    "No worries, we can take a look. For A&A, it's important not to advise blindly because site condition, structure, drainage and submission matters may affect the scope. Could you send the floor plan or photos for an initial project review?",
    "Thanks, that sounds like a landed A&A type enquiry. To guide you properly, could you send over any existing drawings, floor plan or site photos? We'll review the layout and site conditions before advising the next step for an initial project review."
  ],
  condo_renovation: [
    "Thanks for reaching out. For condo renovation, management rules, access, working hours and the exact areas involved can affect planning. Could you send the floor plan or site photos if available so we can review it for an initial project review?",
    "No worries, we can help you take a look. Could you share which areas you're planning to renovate, plus the floor plan or photos if you have them? That will help us review the next step for an initial project review.",
    "Thanks for sharing. For condo work, it helps to see the layout and understand the scope before advising. Send the floor plan or photos if available and we can review it properly for an initial project review."
  ],
  commercial_renovation: [
    "Thanks for reaching out. For commercial renovation, the use of space, services, landlord requirements and site access can affect the planning. Could you send the layout, site photos and a short scope so we can review it for an initial project review?",
    "No worries, we can review this properly. For commercial spaces, it helps to know the unit type, required rooms or functions, and any landlord requirements. If you have photos or a layout, send them over for an initial project review.",
    "Thanks for sharing. Commercial renovation needs a clearer look at layout, services and usage before we advise. Could you send the floor plan or site photos and the main scope for an initial project review?"
  ],
  hacking_demo: [
    "Thanks for reaching out. For hacking or site works, it helps to see the affected area before advising. Could you send site photos and a short note on what needs to be removed for an initial project review?",
    "No worries, we can take a look. Could you send photos of the area and let us know what hacking or disposal works are needed? That helps us review the scope properly for an initial project review.",
    "Thanks for sharing. For hacking works, site condition, access and protection can affect the method. Send photos or a plan if available and we can review the next step for an initial project review."
  ],
  carpentry: [
    "Thanks for reaching out. For carpentry, it helps to know the item, location and rough measurements or photos. Could you send photos of the area and what you'd like built for an initial project review?",
    "No worries, we can help you review the carpentry scope. If you have photos, measurements, or reference style, send them over and we'll look at what information is needed for an initial project review.",
    "Thanks for sharing. Could you send photos of the area and list the carpentry items needed? That helps us understand the layout and review the next step for an initial project review."
  ],
  price_question: [
    "I understand you'd want to get a sense of cost. To avoid giving you the wrong idea, we'll need to understand the scope first. Could you send the floor plan, site photos, and which areas you're planning to renovate for an initial project review?",
    "No worries, cost is usually one of the first things owners want to understand. We shouldn't advise blindly without the layout and scope, so could you send the floor plan or photos and the areas involved for an initial project review?",
    "Thanks for checking. We'll need to review the scope, site condition and materials before advising on any quotation direction. Could you share the floor plan, site photos and main works for an initial project review?"
  ],
  site_visit_request: [
    "No worries, we can look into arranging an initial project review. Before confirming a slot, could you send the floor plan or site photos and the property area/address? That helps us understand the scope first.",
    "Thanks for checking. Let us review the basic scope and availability first before confirming a slot. Could you send the floor plan or site photos and the property area/address for an initial project review?",
    "We can look into a site discussion, but we should understand the layout and scope first so the session is useful. Could you send the floor plan or photos and the property area/address for an initial project review?"
  ],
  appointment_request: [
    "No worries, we can look into arranging a suitable time, but before confirming anything we should understand the basic scope first. Could you send the floor plan or site photos and the property area for an initial project review?",
    "Thanks, we can review possible timing after we understand the scope. Could you send the floor plan or site photos and your preferred date/time for an initial project review?",
    "Sure, we can look into the next available option. Before confirming a slot, could you share the property type, basic scope, and any floor plan or photos for an initial project review?"
  ],
  floorplan_or_photos_sent: [
    "Thanks, received. We'll take a look at the layout/details and check what else is needed before advising the next step for an initial project review.",
    "Thanks for sending that over. We'll review the layout and scope carefully first, then advise what other details may be needed for an initial project review.",
    "Got it, thanks. We'll look through the floor plan or photos so we can understand the site better before advising the next step for an initial project review."
  ],
  vague_enquiry: [
    "Thanks for reaching out. To review your renovation enquiry properly, could you share the property type and which areas you're planning to renovate? Floor plans or site photos would also help for an initial project review.",
    "No worries, we can help you review it properly. Could you let us know the property type, main scope, and whether you have a floor plan or site photos for an initial project review?",
    "Thanks for your message. So we don't advise blindly, could you share what type of property this is and the areas you want to work on? Floor plans or photos would help for an initial project review."
  ],
  unsupported: [
    "Thanks, received. I may need a short text description as well so we can understand the renovation enquiry properly for an initial project review.",
    "Thanks for sending that. Could you also share a short note on the property type and what works you're planning? That will help us review it for an initial project review.",
    "No worries, we can review it better with a short description too. Could you tell us the property type and the main areas involved for an initial project review?"
  ],
  unsupported_media: [
    "Thanks, received. Could you also send a short text note on what you need done? That helps us review the file or photo in the right context for an initial project review.",
    "No worries, please add a short description of the property type and scope too. It will help us understand the file or photo before advising the next step for an initial project review.",
    "Thanks for sending it over. A short note on the area and works involved would help us review it properly for an initial project review."
  ],
  repeated_enquiry: [
    "No worries, once you have the floor plan or photos ready, just send them over. That will help us review the layout and scope more accurately for an initial project review.",
    "Thanks, we have your enquiry. The next useful step is still to review the layout or photos, so send those over whenever ready and we can take a closer look for an initial project review.",
    "Got it. To avoid repeating the same advice blindly, the floor plan or site photos will help us understand the layout and guide the next step for an initial project review."
  ],
  complaint_or_risk: [
    "Thanks for explaining. I'll get my manager to review the matter properly before we advise the next step for an initial project review.",
    "I understand this needs to be handled carefully. I'll get my manager to review the matter properly before any next step is advised for an initial project review.",
    "Thanks for raising this. I'll get my manager to review the matter properly so we don't give you the wrong advice for an initial project review."
  ]
};

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function similarity(a: string, b: string) {
  const left = new Set(normalize(a).split(" ").filter(Boolean));
  const right = new Set(normalize(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  const overlap = [...left].filter((word) => right.has(word)).length;
  return overlap / Math.max(left.size, right.size);
}

function pickTemplate(intent: WhatsAppBrainIntent, previousReplies: string[], seed: string) {
  const candidates = templates[intent] ?? templates.vague_enquiry ?? [WHATSAPP_SAFE_FALLBACK_REPLY];
  const start = Math.abs([...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % candidates.length;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[(start + index) % candidates.length];
    const exact = previousReplies.some((reply) => normalize(reply) === normalize(candidate));
    const high = previousReplies.some((reply) => similarity(reply, candidate) > 0.82);
    if (!exact && !high) return { reply: candidate, variationUsed: index > 0, repeated: false, reason: "none" };
  }
  return { reply: candidates[start], variationUsed: true, repeated: true, reason: "high_similarity" };
}

function toneCheck(reply: string) {
  if (/^(send|provide|give)\b/i.test(reply)) return "cold_rewritten" as const;
  if (/dream home journey|transform your life|excited to transform/i.test(reply)) return "too_salesy_blocked" as const;
  if (!/\b(thanks|no worries|i understand|sure|got it)\b/i.test(reply)) return "cold_rewritten" as const;
  return "passed" as const;
}

function normalizeSchema(value: Partial<WhatsAppBrainSchema>, fallback: WhatsAppBrainSchema): WhatsAppBrainSchema {
  const intent = intents.includes(value.intent as WhatsAppBrainIntent) ? value.intent as WhatsAppBrainIntent : fallback.intent;
  const confidence = typeof value.confidence === "number" ? Math.max(0, Math.min(100, value.confidence)) : fallback.confidence;
  return {
    ...fallback,
    ...value,
    intent,
    property_type: ["landed", "condo", "commercial", "unknown"].includes(value.property_type ?? "")
      ? value.property_type as WhatsAppBrainPropertyType
      : fallback.property_type,
    missing_info: Array.isArray(value.missing_info) ? value.missing_info.map(String) : fallback.missing_info,
    risk_flags: Array.isArray(value.risk_flags) ? value.risk_flags.map(String) : fallback.risk_flags,
    safety_notes: Array.isArray(value.safety_notes) ? value.safety_notes.map(String) : fallback.safety_notes,
    confidence,
    should_auto_send: confidence >= 65 && value.should_auto_send !== false,
    should_request_boss_review: Boolean(value.should_request_boss_review)
  };
}

async function callOpenAiWhatsAppSchema(
  context: WhatsAppBrainContext,
  fallback: WhatsAppBrainSchema,
  previousReplies: string[],
  questionBankMatch: QuestionBankMatch
) {
  const runtime = getOpenAiWhatsAppReplyRuntime();
  if (!runtime.canCallOpenAi) return null;

  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: runtime.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are LIMM Works WhatsApp reply brain for Singapore renovation enquiries.",
            "Return strict JSON only. No markdown.",
            "Never give prices, quote ranges, rough estimates, packages, approval promises, permit certainty, structural certainty, hacking certainty, or appointment confirmation before event exists.",
            `Matched playbook intent: ${questionBankMatch.entry.intent_key}. Category: ${questionBankMatch.entry.category}.`,
            `Safe answer strategy: ${questionBankMatch.entry.safe_answer_strategy}.`,
            `Forbidden claims: ${questionBankMatch.entry.forbidden_claims.join(", ")}.`,
            "Use initial project review wording.",
            "Sound friendly, warm, calm, practical, and human. Avoid repetition. Ask only the next useful detail."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            schema: fallback,
            latestInboundMessage: context.latestInboundMessage,
            lead: {
              source: context.lead.source,
              division: context.lead.division,
              propertyType: context.lead.propertyType,
              scopeSummary: context.lead.scopeSummary,
              missingInfo: context.lead.missingInfo,
              riskFlags: context.lead.riskFlags
            },
            questionBank: {
              intentKey: questionBankMatch.entry.intent_key,
              category: questionBankMatch.entry.category,
              safeAnswerStrategy: questionBankMatch.entry.safe_answer_strategy,
              requiredMissingInfo: questionBankMatch.entry.required_missing_info,
              riskFlags: questionBankMatch.entry.risk_flags,
              escalationRule: questionBankMatch.entry.escalation_rule,
              forbiddenClaims: questionBankMatch.entry.forbidden_claims,
              followUpQuestion: questionBankMatch.entry.follow_up_question
            },
            previousOutboundReplies: previousReplies
          })
        }
      ],
      temperature: 0.4
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    return normalizeSchema(parsed, fallback);
  } catch {
    return null;
  }
}

export async function buildWhatsAppSalesBrainReply(context: WhatsAppBrainContext): Promise<WhatsAppBrainResult> {
  const previousOutbound = context.messages
    .filter((message) => message.direction === "outbound" && message.channel === "whatsapp")
    .slice(0, 3)
    .map((message) => message.body);
  const questionBankMatch = matchQuestionBankIntent(context.latestInboundMessage);
  const baseSchema = classifyWhatsAppIntent(context.latestInboundMessage, context.lead);
  const openAi = getOpenAiWhatsAppReplyRuntime();
  const openAiSchema = await callOpenAiWhatsAppSchema(context, baseSchema, previousOutbound, questionBankMatch);
  let schema = openAiSchema ?? baseSchema;
  let replySource: WhatsAppBrainResult["replySource"] = openAiSchema ? "openai" : "fallback_template";
  const questionBankTemplate = selectQuestionBankReply({
    entry: questionBankMatch.score > 0 ? questionBankMatch.entry : findQuestionBankEntry(questionBankIntentForBrainIntent(schema.intent)),
    previousReplies: previousOutbound,
    seed: `${context.lead.id}-${context.latestInboundMessage}`
  });
  const template = questionBankMatch.score > 0
    ? {
        reply: questionBankTemplate.reply,
        variationUsed: questionBankTemplate.variationUsed,
        repeated: questionBankTemplate.repeated,
        reason: questionBankTemplate.similarityReason
      }
    : pickTemplate(schema.intent, previousOutbound, `${context.lead.id}-${context.latestInboundMessage}`);
  if (!schema.reply || !openAiSchema) schema = { ...schema, reply: template.reply };
  let repetitionResult: WhatsAppBrainResult["repetitionResult"] = template.variationUsed ? "fallback_variation" : "passed";
  let reply = schema.reply.trim();

  const exactRepeat = previousOutbound.some((previous) => normalize(previous) === normalize(reply));
  const highRepeat = previousOutbound.some((previous) => similarity(previous, reply) > 0.82);
  if (exactRepeat || highRepeat) {
    const alternate = questionBankMatch.score > 0
      ? selectQuestionBankReply({
          entry: questionBankMatch.entry,
          previousReplies: previousOutbound,
          seed: `${context.latestInboundMessage}-alternate`
        })
      : pickTemplate(schema.intent, previousOutbound, `${context.latestInboundMessage}-alternate`);
    reply = alternate.reply;
    repetitionResult = alternate.repeated ? "boss_review_required" : openAiSchema ? "rewritten" : "fallback_variation";
    replySource = openAiSchema ? "rewritten_openai" : "fallback_template";
  }

  const toneResult = toneCheck(reply);
  if (toneResult === "cold_rewritten") {
    const alternate = questionBankMatch.score > 0
      ? selectQuestionBankReply({
          entry: questionBankMatch.entry,
          previousReplies: previousOutbound,
          seed: `${context.latestInboundMessage}-tone`
        })
      : pickTemplate(schema.intent, previousOutbound, `${context.latestInboundMessage}-tone`);
    reply = alternate.reply;
  }

  const bookingReadiness = evaluateBookingReadiness({ lead: context.lead, latestText: context.latestInboundMessage });
  const safety = validateWhatsAppAutoReply(reply);
  const shouldRequestBoss =
    schema.should_request_boss_review ||
    repetitionResult === "boss_review_required" ||
    toneResult === "too_salesy_blocked" ||
    !safety.ok;

  const repeatedPricePressure =
    schema.intent === "price_question" &&
    previousOutbound.filter((previous) => /cost|quotation direction|scope first|wrong idea/i.test(previous)).length >= 2;
  const shouldAutoSend =
    schema.should_auto_send &&
    !["boss_only", "no_auto_reply"].includes(questionBankMatch.entry.escalation_rule) &&
    !repeatedPricePressure &&
    !(!safety.ok) &&
    repetitionResult !== "boss_review_required" &&
    toneResult !== "too_salesy_blocked" &&
    schema.confidence >= 65;
  const blockedReason = !safety.ok
    ? safety.errors.join("; ")
    : repeatedPricePressure
      ? "repeated price question requires boss review"
    : repetitionResult === "boss_review_required"
      ? "reply too similar to previous outbound replies"
      : toneResult === "too_salesy_blocked"
        ? "tone too salesy"
        : shouldAutoSend
          ? ""
          : "boss review required";

  if (!safety.ok || !shouldAutoSend) {
    replySource = !safety.ok ? "blocked" : "boss_review_required";
  }

  const finalReply = safety.ok && shouldAutoSend ? reply : WHATSAPP_SAFE_FALLBACK_REPLY;
  const finalSafety = validateWhatsAppAutoReply(finalReply);

  return {
    schema: { ...schema, reply: finalReply, should_auto_send: shouldAutoSend && finalSafety.ok, should_request_boss_review: shouldRequestBoss },
    reply: finalReply,
    replySource: finalSafety.ok && shouldAutoSend ? replySource : "boss_review_required",
    templateKey: schema.intent,
    openAiEnabled: openAi.enabled,
    model: openAi.model,
    bookingReadiness,
    safetyResult: finalSafety.ok ? "passed" : "blocked",
    toneResult: toneResult === "cold_rewritten" ? "cold_rewritten" : toneResult,
    repetitionResult,
    blockedReason: finalSafety.ok ? (shouldAutoSend ? "" : blockedReason) : finalSafety.errors.join("; "),
    auditMetadata: {
      reply_source: finalSafety.ok && shouldAutoSend ? replySource : "boss_review_required",
      question_bank_intent: questionBankMatch.entry.intent_key,
      latest_question_bank_category: questionBankMatch.entry.category,
      matched_examples: questionBankMatch.matchedExamples,
      matched_keywords: questionBankMatch.matchedKeywords,
      reply_strategy: questionBankMatch.entry.safe_answer_strategy,
      safety_category: questionBankMatch.entry.category,
      escalation_required: questionBankMatch.entry.escalation_rule !== "auto_safe" || repeatedPricePressure,
      escalation_rule: questionBankMatch.entry.escalation_rule,
      escalation_reason: repeatedPricePressure ? "repeated price question" : questionBankMatch.entry.escalation_rule,
      follow_up_question: questionBankMatch.entry.follow_up_question,
      intent: schema.intent,
      property_type: schema.property_type,
      next_best_action: schema.next_best_action,
      appointment_intent: schema.appointment_intent,
      appointment_type: schema.appointment_type,
      booking_readiness: bookingReadiness.status,
      calendar_event_id: "",
      confidence: schema.confidence,
      safety_result: finalSafety.ok ? "passed" : "blocked",
      tone_result: toneResult,
      repetition_result: repetitionResult,
      template_key: schema.intent,
      openai_enabled: openAi.enabled,
      model: openAi.model,
      should_auto_send: shouldAutoSend && finalSafety.ok,
      blocked_reason: finalSafety.ok ? blockedReason : finalSafety.errors.join("; "),
      repetition_checked: true,
      repeated_detected: exactRepeat || highRepeat,
      rewrite_attempted: exactRepeat || highRepeat,
      fallback_variation_used: template.variationUsed,
      similarity_reason: exactRepeat ? "exact_match" : highRepeat ? "high_similarity" : "none"
    }
  };
}

