import type { Lead, LeadMessage } from "@/lib/types";
import {
  findCarpentryDemoQaItem,
  isCarpentryDemoKnowledgeTrigger,
  matchCarpentryDemoQaItem,
  type CarpentryDemoQaMatch
} from "@/lib/knowledge/limm-carpentry-demo-qa";
import { validateWhatsAppAutoReply } from "@/lib/whatsapp-safety";

export const V9_CLEAN_WHATSAPP_SALES_BRAIN_VERSION = "v9_0_clean_whatsapp_sales_brain";
export const V9_SALES_BRAIN_VERSION = "v9_clean_core";

type V9Status = "unknown" | "missing" | "received" | "client_claimed_sent" | "provided";
type V9Patience = "normal" | "impatient" | "annoyed";

export type V9SalesMove =
  | "answer_direct_question"
  | "acknowledge_and_continue"
  | "safe_price_review"
  | "timeline_reality_check"
  | "hypothetical_answer_without_context_overwrite"
  | "appointment_preference_pending_confirmation"
  | "office_visit_pending_confirmation"
  | "design_direction_noted"
  | "file_correction_acknowledgement"
  | "portfolio_route"
  | "promo_deflection"
  | "free_work_deflection"
  | "carpentry_demo_review"
  | "human_identity_answer"
  | "handoff_to_team"
  | "voice_or_unsupported_fallback";

export interface V9SalesMemory {
  property_type: string;
  storeys: string;
  address: string;
  postal_code: string;
  project_type: string;
  scope_summary: string;
  budget_expectation: string;
  timeline_expectation: string;
  key_collection: string;
  floor_plan_status: V9Status;
  site_photo_status: V9Status;
  design_direction: string;
  design_reference_status: V9Status;
  occupants: string;
  children: string;
  elderly: string;
  helper: string;
  pets: string;
  storage_needs: string;
  work_from_home: string;
  appointment_preference: string;
  office_visit_requested: boolean;
  client_patience: V9Patience;
  lead_stage: string;
  lead_seriousness: "low" | "medium" | "high";
  handoff_lock: boolean;
  do_not_ask_again: Record<string, boolean>;
  last_bot_replies: string[];
  repeated_question_count: number;
  correction_history: string[];
}

export interface V9WhatsAppSalesBrainInput {
  inboundMessageText: string;
  inboundMessageType: string;
  lead: Lead;
  previousMessages: LeadMessage[];
  autoReplyEnabled: boolean;
  calendarEventId?: string | null;
  providerMessageId?: string;
}

export interface V9WhatsAppSalesBrainDecision {
  shouldSendAutoReply: boolean;
  replyText: string;
  memoryPatch: Partial<V9SalesMemory> & Record<string, unknown>;
  trace: Record<string, unknown>;
  handoffRequired: boolean;
  safetyPassed: boolean;
  intent: string;
  stage: string;
  confidence: number;
  replySource: "v9_clean_core" | "safe_fallback" | "handoff_holding" | "intentional_no_reply";
  salesMove: V9SalesMove;
  answeredClientQuestion: boolean;
  askedNextBestQuestion: boolean;
  riskFlags: string[];
  missingInfo: string[];
  nextAction: string;
  appointmentStatus: "none" | "requested_pending_review" | "pending_calendar_confirmation" | "confirmed_with_calendar_event";
  safetyResult: "pass" | "rewritten" | "fallback_used";
  repetitionResult: "pass" | "rewritten" | "fallback_used";
  qualityResult: "pass" | "rewritten" | "fallback_used";
  noSilenceGuardResult: "not_needed" | "used" | "intentional_no_reply";
}

const TEAM_FOLLOW_UP =
  "I'll get the team to review the messages and follow up directly so we don't keep repeating the same questions.";

const HANDOFF_HOLDING_REPLY =
  "Sorry about that. Let me check this properly so we don't repeat the same questions.";

const DREAM_HOME_PHRASE = "We'd love to help create your dream home.";

const FIRST_TOUCH_GREETING_REPLY =
  "Hi, thanks for contacting LIMM Works. We'd love to help create your dream home. May I know what type of property this is and what renovation works you're planning?";

const CHINESE_FIRST_TOUCH_REPLY =
  "你好，感谢联系 LIMM Works。我们很期待帮您打造理想的家。请问这是 HDB、公寓、landed 还是商业单位？主要想装修哪些部分？";

const ULTRA_SAFE_V9_FALLBACK =
  FIRST_TOUCH_GREETING_REPLY;

const LEGACY_REPLY_TEMPLATE_PATTERNS = [
  /Giving a rough figure too early can be misleading/i,
  /To avoid giving (?:you )?the wrong figure/i,
  /Could you share the scope of work/i,
  /Could you share main renovation scope/i,
  /WhatsApp renovation enquiry pending review/i,
  /This is a at/i,
  /This is with/i
];

const BANNED_TONE_PATTERNS = [
  /\bdear\b/i,
  /\bkindly furnish\b/i,
  /\brevert accordingly\b/i,
  /\bcheap package\b/i,
  /\bbest price\b/i,
  /\bfrom\s*\$/i,
  /\baround\s*\$/i,
  /\bcontinue sending project details\b/i,
  /\bteam will review the next step properly\b/i,
  /\bno problem confirm can\b/i,
  /\bguaranteed approval\b/i,
  /\bwow exciting\b/i,
  /\bhii dear\b/i
];

function normalize(text: string) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9\u4e00-\u9fff\s?$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function hashReply(text: string) {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function textFromMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return "";
  return [
    metadata.messageType,
    metadata.caption,
    metadata.filename,
    metadata.mimeType,
    metadata.fileCategory,
    metadata.category,
    metadata.notes
  ]
    .filter(Boolean)
    .map(String)
    .join(" ");
}

function messageText(message: LeadMessage) {
  return `${message.body ?? ""} ${textFromMetadata(message.metadata)}`.trim();
}

function previousInbound(messages: LeadMessage[]) {
  return messages.filter((message) => message.direction === "inbound").map(messageText);
}

function previousInboundBeforeCurrent(input: V9WhatsAppSalesBrainInput) {
  const current = normalize(input.inboundMessageText);
  const currentType = normalize(input.inboundMessageType);
  let currentRemoved = false;
  return previousInbound(input.previousMessages)
    .map((text) => normalize(text))
    .filter((text) => {
      if (!text) return false;
      if (current && !currentRemoved && (text === current || text.startsWith(`${current} `))) {
        currentRemoved = true;
        return false;
      }
      if (!current && currentType && !currentRemoved && text.includes(currentType)) {
        currentRemoved = true;
        return false;
      }
      return true;
    });
}

function isFirstTouch(input: V9WhatsAppSalesBrainInput) {
  return previousInboundBeforeCurrent(input).length === 0;
}

function previousOutbound(messages: LeadMessage[]) {
  return messages
    .filter((message) => message.direction === "outbound" && message.channel === "whatsapp")
    .map((message) => message.body)
    .filter(Boolean)
    .slice(0, 5);
}

function statusFromString(value: unknown): V9Status {
  const text = normalize(String(value ?? ""));
  if (!text) return "unknown";
  if (text.includes("received") || text.includes("uploaded") || text.includes("attached")) return "received";
  if (text.includes("sent") || text.includes("client_claimed_sent")) return "client_claimed_sent";
  if (text.includes("provided")) return "provided";
  if (text.includes("missing")) return "missing";
  return "unknown";
}

function initialMemory(input: V9WhatsAppSalesBrainInput): V9SalesMemory {
  const traceMemory = ((input.lead.intakeProfile?.trace ?? {}) as Record<string, unknown>).v9Memory as Partial<V9SalesMemory> | undefined;
  return {
    property_type: input.lead.intakeProfile?.propertyType || input.lead.propertyType || traceMemory?.property_type || "",
    storeys: traceMemory?.storeys || "",
    address: input.lead.projectAddress || input.lead.intakeProfile?.propertyAreaOrAddress || traceMemory?.address || "",
    postal_code: input.lead.postalCode || traceMemory?.postal_code || "",
    project_type: input.lead.serviceType || traceMemory?.project_type || "",
    scope_summary: input.lead.intakeProfile?.scopeOfWork || input.lead.scopeSummary || traceMemory?.scope_summary || "",
    budget_expectation: input.lead.intakeProfile?.budgetExpectation || traceMemory?.budget_expectation || "",
    timeline_expectation: input.lead.intakeProfile?.timeline || traceMemory?.timeline_expectation || "",
    key_collection: input.lead.intakeProfile?.keyCollectionDate || traceMemory?.key_collection || "",
    floor_plan_status: statusFromString(input.lead.intakeProfile?.floorPlanStatus || traceMemory?.floor_plan_status),
    site_photo_status: statusFromString(input.lead.intakeProfile?.sitePhotosStatus || traceMemory?.site_photo_status),
    design_direction: traceMemory?.design_direction || "",
    design_reference_status: statusFromString(traceMemory?.design_reference_status),
    occupants: input.lead.intakeProfile?.occupants || traceMemory?.occupants || "",
    children: traceMemory?.children || "",
    elderly: traceMemory?.elderly || "",
    helper: input.lead.intakeProfile?.helper || traceMemory?.helper || "",
    pets: input.lead.intakeProfile?.pets || traceMemory?.pets || "",
    storage_needs: traceMemory?.storage_needs || "",
    work_from_home: traceMemory?.work_from_home || "",
    appointment_preference: input.lead.preferredContactTime || input.lead.intakeProfile?.preferredMeetingTiming || traceMemory?.appointment_preference || "",
    office_visit_requested: Boolean(traceMemory?.office_visit_requested),
    client_patience: (traceMemory?.client_patience as V9Patience | undefined) || "normal",
    lead_stage: traceMemory?.lead_stage || input.lead.status || "new_lead",
    lead_seriousness: (traceMemory?.lead_seriousness as V9SalesMemory["lead_seriousness"] | undefined) || "low",
    handoff_lock: Boolean(traceMemory?.handoff_lock || input.lead.bossApprovalNeeded),
    do_not_ask_again: { ...(traceMemory?.do_not_ask_again ?? {}) },
    last_bot_replies: Array.isArray(traceMemory?.last_bot_replies) ? traceMemory.last_bot_replies.slice(0, 5) : [],
    repeated_question_count: Number(traceMemory?.repeated_question_count ?? 0),
    correction_history: Array.isArray(traceMemory?.correction_history) ? traceMemory.correction_history.slice(0, 10) : []
  };
}

function markDoNotAsk(memory: V9SalesMemory, key: string) {
  memory.do_not_ask_again[key] = true;
}

function applyTextFacts(memory: V9SalesMemory, text: string, source: "current" | "previous") {
  const normalized = normalize(text);
  if (!normalized) return;

  if (has(normalized, /\blanded\b|\bterrace\b|\bsemi d\b|\bbungalow\b/)) memory.property_type = "landed";
  if (has(normalized, /\bhdb\b|\bbto\b/)) memory.property_type ||= "HDB";
  if (has(normalized, /\bcondo\b|\bapartment\b/)) memory.property_type ||= "condo";
  if (has(normalized, /\bcommercial\b|\boffice\b|\bshop\b/) && !has(normalized, /\byour office\b|\bgo office\b/)) memory.property_type ||= "commercial";
  if (has(normalized, /\ba\s*&\s*a\b|\baa\b|\baddition\b|\balteration\b|\bextension\b|\bextend\b/)) memory.project_type = "landed A&A";
  if (has(normalized, /\bfull reno|\bfull renovation|\brenovate\b|\breno\b/)) memory.scope_summary ||= "renovation enquiry";
  if (has(normalized, /\bkitchen\b/)) memory.scope_summary = appendUnique(memory.scope_summary, "kitchen");
  if (has(normalized, /\bbathroom\b|\btoilet\b/)) memory.scope_summary = appendUnique(memory.scope_summary, "bathroom");
  if (has(normalized, /\bcarpentry\b|\bcabinet\b|\bcabinets\b|\bwardrobe\b|\btv console\b|\bfeature wall\b|\blaminate\b|木工|橱柜|衣柜|电视柜|修改柜|加层板/)) {
    memory.scope_summary = appendUnique(memory.scope_summary, "carpentry/cabinet works");
  }
  if (has(normalized, /\bdemo\b|\bdemolition\b|\bdismantle\b|\bdismantling\b|\bremove cabinet\b|\bremove built in\b|\bremove tiles\b|\btile hacking\b|\bfloor hacking\b|拆柜|拆除|拆地砖|拆墙砖/)) {
    memory.scope_summary = appendUnique(memory.scope_summary, "demo/dismantling works");
  }
  if (has(normalized, /\bwall\b|\bhack\b|\bhacking\b|敲墙|打墙|拆墙/)) memory.scope_summary = appendUnique(memory.scope_summary, "wall/hacking review");

  const addressMatch = text.match(/\b(?:\d{1,4}\s+[A-Za-z][A-Za-z\s.'-]{2,}\s+(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Lane|Ln|Crescent|Close|Way|Place|Terrace|Walk))\b/i);
  if (addressMatch) memory.address = addressMatch[0].trim();
  const postalMatch = text.match(/\bSingapore\s*(\d{6})\b|\bpostal\s*(\d{6})\b|\b(\d{6})\b/i);
  if (postalMatch) memory.postal_code = (postalMatch[1] || postalMatch[2] || postalMatch[3] || "").trim();

  if (has(normalized, /\bfloor\s*plan\b|\bfloorplan\b|\blayout\b|\bdrawing\b|\bplan attached\b|\bfile already sent\b|\bfloorplan already sent\b|\bfloor plan already sent\b|\bfloor.{0,20}sent\b|\bi already sent floor\b/)) {
    memory.floor_plan_status = source === "current" && has(normalized, /\balready\b|\bsent\b/) ? "client_claimed_sent" : "received";
    markDoNotAsk(memory, "floor_plan");
    memory.correction_history = appendArrayUnique(memory.correction_history, "floor_plan_received_or_claimed");
  }
  if (has(normalized, /\bsite photo\b|\bsite photos\b|\bphoto already\b|\bphotos already\b|\bphotos?.{0,25}(?:sent|been sent|attached)\b|\bi sent the photos\b|\bimage attached\b|\bsite picture\b|\bpicture\b|\bimage\b/)) {
    memory.site_photo_status = source === "current" && has(normalized, /\balready\b|\bsent\b/) ? "client_claimed_sent" : "received";
    markDoNotAsk(memory, "site_photos");
    memory.correction_history = appendArrayUnique(memory.correction_history, "site_photos_received_or_claimed");
  }
  if (has(normalized, /\bdesign reference\b|\breference image\b|\bref image\b|\bmodern luxury\b|\bresort style\b|\bjapandi\b|\bminimalist\b|\bcontemporary\b/)) {
    memory.design_reference_status = "provided";
    markDoNotAsk(memory, "design_references");
    const direction = normalized.match(/\b(resort style|modern luxury|japandi|minimalist|contemporary)\b/i)?.[1];
    if (direction) memory.design_direction = direction;
  }
  if (has(normalized, /\bdesign resort style\b|\bresort style\b/)) {
    memory.design_direction = "resort style";
    memory.design_reference_status = "provided";
    markDoNotAsk(memory, "design_references");
  }

  if (has(normalized, /\bbudget\b|\bmy budget\b|\bexpectation\b/)) memory.budget_expectation = "client_provided";
  if (has(normalized, /\bkey collection\b|\bkey collect\b|\bmove in\b|\bmove-in\b/)) memory.key_collection = "client_provided";
  if (has(normalized, /\bmonth\b|\bweek\b|\bcny\b|\bbefore christmas\b|\btimeline\b|\bfinish\b|\bcomplete\b/)) memory.timeline_expectation = appendUnique(memory.timeline_expectation, text.trim().slice(0, 80));

  if (has(normalized, /\b1 kid\b|\bkid\b|\bchild\b|\bchildren\b/)) memory.children = "yes";
  if (has(normalized, /\bno elder\b|\bno elders\b|\bno elderly\b/)) memory.elderly = "no";
  if (has(normalized, /\belderly\b|\belder\b/)) memory.elderly ||= "yes";
  if (has(normalized, /\bhelper\b|\bmaid\b/)) memory.helper = "yes";
  const pets = [];
  if (has(normalized, /\bdog\b/)) pets.push("dog");
  if (has(normalized, /\bcat\b/)) pets.push("cat");
  if (has(normalized, /\bgiraffe\b/)) pets.push("giraffe");
  if (pets.length) memory.pets = appendUnique(memory.pets, pets.join(", "));

  const timing = extractAppointmentPreference(text);
  if (timing) memory.appointment_preference = timing;
  if (has(normalized, /\bgo (?:your )?office\b|\byour office\b|\boffice for meeting\b/)) memory.office_visit_requested = true;

  if (detectFrustration(normalized)) {
    memory.client_patience = "annoyed";
    memory.handoff_lock = true;
    memory.correction_history = appendArrayUnique(memory.correction_history, "client_frustration_detected");
  }
}

function appendUnique(existing: string, value: string) {
  const clean = value.trim();
  if (!clean) return existing;
  const normalizedExisting = normalize(existing);
  if (normalizedExisting.includes(normalize(clean))) return existing;
  return existing ? `${existing}; ${clean}` : clean;
}

function appendArrayUnique(existing: string[], value: string) {
  return existing.includes(value) ? existing : [...existing, value];
}

function extractAppointmentPreference(text: string) {
  const normalized = normalize(text);
  const match = text.match(/\b(?:mon|monday|tue|tues|tuesday|wed|wednesday|thu|thurs|thursday|fri|friday|sat|saturday|sun|sunday|tmr|tomorrow|tonight)\b[^.?\n]{0,35}?\b(?:\d{1,2})(?::\d{2})?\s*(?:am|pm)?\b/i);
  if (match) return titleCaseTiming(match[0].trim());
  if (has(normalized, /\bnext available\b|\bavailable slot\b/)) return "next available slot requested";
  return "";
}

function titleCaseTiming(text: string) {
  return text
    .replace(/\btmr\b/i, "tomorrow")
    .replace(/\bwed\b/i, "Wednesday")
    .replace(/\bmon\b/i, "Monday")
    .replace(/\btue\b/i, "Tuesday")
    .replace(/\bthu\b/i, "Thursday")
    .replace(/\bfri\b/i, "Friday")
    .replace(/\bsat\b/i, "Saturday")
    .replace(/\bsun\b/i, "Sunday")
    .replace(/\b(\d{1,2})\s*pm\b/i, "$1PM")
    .replace(/\b(\d{1,2})\s*am\b/i, "$1AM");
}

function detectFrustration(normalized: string) {
  return has(normalized, /\bwtf\b|\bstupid\b|\bwhy you keep repeating\b|\bwhy ask again\b|\bare you blind\b|\bnonsense\b|\byou asked already\b|\balready told you\b|\bshit\b|\?\?\?/);
}

function deriveMemory(input: V9WhatsAppSalesBrainInput) {
  const memory = initialMemory(input);
  const currentText = `${input.inboundMessageText} ${input.inboundMessageType}`.trim();
  for (const text of previousInbound(input.previousMessages)) applyTextFacts(memory, text, "previous");
  applyTextFacts(memory, currentText, "current");
  const currentType = input.inboundMessageType.toLowerCase();
  if (currentType === "image") {
    memory.site_photo_status = "received";
    markDoNotAsk(memory, "site_photos");
  }
  if (currentType === "document" && has(normalize(input.inboundMessageText), /\bfloor\s*plan\b|\bfloorplan\b|\blayout\b|\bdrawing\b|\bplan\b|\battached\b/)) {
    memory.floor_plan_status = "received";
    markDoNotAsk(memory, "floor_plan");
  }
  if (["image", "document"].includes(currentType) && has(normalize(input.inboundMessageText), /\bdesign\b|\blayout\b|\bfloor\s*plan\b|\bfloorplan\b|\bdrawing\b|\bplan\b|\battached\b/)) {
    memory.floor_plan_status = "received";
    memory.design_reference_status = "provided";
    markDoNotAsk(memory, "floor_plan");
  }
  memory.last_bot_replies = [...previousOutbound(input.previousMessages), ...memory.last_bot_replies].slice(0, 5);
  const seriousSignals = [
    memory.property_type === "landed",
    /a&a|landed/i.test(memory.project_type),
    Boolean(memory.address),
    memory.floor_plan_status === "received" || memory.floor_plan_status === "client_claimed_sent",
    Boolean(memory.budget_expectation || memory.timeline_expectation || memory.appointment_preference)
  ].filter(Boolean).length;
  memory.lead_seriousness = seriousSignals >= 2 ? "high" : seriousSignals === 1 ? "medium" : "low";
  memory.lead_stage = memory.handoff_lock ? "handoff_required" : memory.lead_seriousness === "high" ? "serious_lead_review" : "discovery";
  return memory;
}

function detectIntent(input: V9WhatsAppSalesBrainInput, memory: V9SalesMemory) {
  const text = normalize(input.inboundMessageText);
  const type = input.inboundMessageType.toLowerCase();
  if (type === "audio" || type === "voice") return "voice_message";
  if (!text && !["image", "document"].includes(type)) return "unsupported";
  if (detectFrustration(text)) return "frustration_or_correction";
  if (has(text, /\bfloor\s*plan already\b|\bfloorplan already\b|\bfloor.{0,20}sent\b|\bphotos? already\b|\bphotos?.{0,25}(?:sent|been sent)\b|\balready sent\b|\bi sent\b/)) return "file_correction";
  if (carpentryDemoMatch(input, memory)) return "carpentry_demo_qa";
  if (has(text, /\bhow much\b|\bprice\b|\bbudget how\b|\bquotation\b|\bquote\b|\bestimate\b|\brough cost\b|\broughly\b|\bpackage\b|多少钱/)) return "price_question";
  if (has(text, /\bso .*cannot finish\b|\bcannot finish\b/)) return "timeline_followup";
  if (has(text, /\bstart\s+(?:tomorrow|tmr|tonight|this week|next week)\b|\bfinish\b|\bcomplete\b|\btimeline\b|\bhow long\b|\b\d+\s*months?\b|\b\d+\s*weeks?\b/)) {
    if (has(text, /\bcondo\b/) && memory.property_type && memory.property_type !== "condo") return "hypothetical_timeline";
    return "timeline_question";
  }
  if (has(text, /\bgo (?:your )?office\b|\byour office\b|\boffice for meeting\b/)) return "office_visit_request";
  if (has(text, /\bappt\b|\bappointment\b|\bmeeting\b|\bmeet\b|\bsite visit\b|\bcome down\b|\bavailable slot\b|\bnext available\b|\bbook\b|\bconfirm .*(?:am|pm|slot)\b|预约/)) return "appointment_request";
  if (has(text, /\bpast work\b|\bproject photos?\b|\bportfolio\b|\bbefore after\b|\bbefore-and-after\b|\bshow me your work\b|\brenovation photos?\b|\bcompleted project\b|作品/)) return "portfolio_request";
  if (has(text, /\bpromo\b|\bdiscount\b|\boffer\b/)) return "promotion_question";
  if (has(text, /\bfree\b|\bdo for free\b/)) return "free_work_request";
  if (has(text, /\bare you ai\b|\bare you human\b|\bchatbot\b|\bbot\b/)) return "identity_question";
  if (has(text, /\bresort style\b|\bmodern luxury\b|\bjapandi\b|\bminimalist\b|\bcontemporary\b/)) return "design_direction_statement";
  if (has(text, /\bdesign\b|\btheme\b|\bconcept\b|\bstyle\b|\binterior design\b|\bdesign direction\b|\bdesign ideas?\b|\blayout ideas?\b|\bpropose concept\b/)) return "design_question";
  if (has(text, /\bhack\b|\bhacking\b|\bwall\b|\bstructural\b/)) return "hacking_wall";
  if (has(text, /\bapproval\b|\bapprove\b|\bpermit\b|\bsubmission\b|\bura\b|\bbca\b|申请/)) return "approval_submission";
  if (has(text, /\ba&a\b|\baa\b|\blanded\b|\brenovate\b|\breno\b|\bextension\b|\bextend\b/)) return "serious_project_enquiry";
  if (has(text, /\bhello\b|\bhi\b|\bare you there\b|\bcan reply\b|\bany update\b|你好/)) return "follow_up_ping";
  if (["image", "document"].includes(type)) return "media_received";
  return "general_enquiry";
}

function riskFlags(intent: string, memory: V9SalesMemory) {
  return [
    intent === "price_question" ? "pricing_request" : "",
    intent === "timeline_question" || intent === "timeline_followup" || intent === "hypothetical_timeline" ? "timeline_expectation" : "",
    intent === "appointment_request" || intent === "office_visit_request" ? "appointment_request" : "",
    intent === "carpentry_demo_qa" ? "carpentry_demo_knowledge_review" : "",
    intent === "hacking_wall" ? "hacking_or_structural_review" : "",
    intent === "approval_submission" ? "approval_or_submission_review" : "",
    memory.handoff_lock ? "client_frustration_handoff_lock" : "",
    memory.lead_seriousness === "high" ? "serious_landed_or_aa_lead" : ""
  ].filter(Boolean);
}

function missingInfo(memory: V9SalesMemory) {
  const missing: string[] = [];
  if (!memory.property_type) missing.push("property_type");
  if (!memory.scope_summary && !memory.project_type) missing.push("scope_summary");
  if (!memory.address && !memory.postal_code) missing.push("address_or_area");
  if (!["received", "client_claimed_sent"].includes(memory.floor_plan_status) && !memory.do_not_ask_again.floor_plan) missing.push("floor_plan");
  if (!["received", "client_claimed_sent"].includes(memory.site_photo_status) && !memory.do_not_ask_again.site_photos) missing.push("site_photos");
  if (!["provided", "received", "client_claimed_sent"].includes(memory.design_reference_status) && !memory.do_not_ask_again.design_references) missing.push("design_references");
  return missing;
}

function conciseKnownFacts(memory: V9SalesMemory) {
  return [
    memory.property_type ? `property: ${memory.property_type}` : "",
    memory.project_type ? `project: ${memory.project_type}` : "",
    memory.address ? `address: ${memory.address}` : "",
    memory.floor_plan_status !== "unknown" ? `floor plan: ${memory.floor_plan_status}` : "",
    memory.site_photo_status !== "unknown" ? `site photos: ${memory.site_photo_status}` : "",
    memory.design_direction ? `design: ${memory.design_direction}` : "",
    memory.appointment_preference ? `appointment preference: ${memory.appointment_preference}` : "",
    memory.client_patience !== "normal" ? `patience: ${memory.client_patience}` : ""
  ].filter(Boolean).join("; ");
}

function nextUsefulInfoSentence(memory: V9SalesMemory, options: { allowQuestion?: boolean } = {}) {
  if (memory.handoff_lock) return "";
  const missing: string[] = [];
  if (!["received", "client_claimed_sent"].includes(memory.site_photo_status) && !memory.do_not_ask_again.site_photos) missing.push("site photos");
  if (!["provided", "received", "client_claimed_sent"].includes(memory.design_reference_status) && !memory.do_not_ask_again.design_references) missing.push("design references");
  if (!memory.address && !memory.postal_code && !memory.do_not_ask_again.address) missing.push("property area/address");
  if (!missing.length) return "The team can review the details already shared and advise the next step.";
  const prefix = memory.floor_plan_status === "received" || memory.floor_plan_status === "client_claimed_sent"
    ? "We've received the floor plan, so"
    : "To help the team review properly,";
  const ask = `${prefix} ${joinList(missing)} would be useful next.`;
  return options.allowQuestion ? ask.replace(/\.$/, "?") : ask;
}

function hasSpecificScope(memory: V9SalesMemory) {
  const normalizedScope = normalize(`${memory.scope_summary} ${memory.project_type}`);
  if (!normalizedScope) return false;
  return !["renovation enquiry", "reno", "renovation"].includes(normalizedScope);
}

function scopePhrase(memory: V9SalesMemory) {
  const normalizedScope = normalize(`${memory.scope_summary} ${memory.project_type}`);
  if (normalizedScope.includes("kitchen")) return "kitchen works";
  if (normalizedScope.includes("toilet") || normalizedScope.includes("bathroom")) return "toilet works";
  if (normalizedScope.includes("wall") || normalizedScope.includes("hacking")) return "wall/hacking works";
  if (normalizedScope.includes("a a") || normalizedScope.includes("landed")) return "landed/A&A works";
  return "renovation works";
}

function hasAreaScope(memory: V9SalesMemory) {
  return has(normalize(memory.scope_summary), /\bkitchen\b|\btoilet\b|\bbathroom\b|\bwall\b|\bhacking\b|\bcarpentry\b|\bwhole\b|\bfull\b|\bextension\b|\bextend\b/);
}

function combinedCarpentryDemoContext(input: V9WhatsAppSalesBrainInput, memory: V9SalesMemory) {
  return [
    input.inboundMessageText,
    ...previousInbound(input.previousMessages),
    memory.scope_summary,
    memory.project_type
  ].join(" ");
}

function carpentryDemoMatch(input: V9WhatsAppSalesBrainInput, memory: V9SalesMemory): CarpentryDemoQaMatch | null {
  const match = matchCarpentryDemoQaItem(input.inboundMessageText);
  if (!match) return null;
  const context = combinedCarpentryDemoContext(input, memory);
  if (isCarpentryDemoKnowledgeTrigger(input.inboundMessageText) || isCarpentryDemoKnowledgeTrigger(context)) {
    return match;
  }
  return null;
}

function hasReceivedSitePhotos(memory: V9SalesMemory) {
  return memory.site_photo_status === "received" || memory.site_photo_status === "client_claimed_sent";
}

function hasReceivedFloorPlan(memory: V9SalesMemory) {
  return memory.floor_plan_status === "received" || memory.floor_plan_status === "client_claimed_sent";
}

function hasMeasurements(input: V9WhatsAppSalesBrainInput) {
  const context = normalize([input.inboundMessageText, ...previousInbound(input.previousMessages)].join(" "));
  return /\bmeasurement\b|\bmeasurements\b|\bdimension\b|\bdimensions\b|\b\d+\s*(?:mm|cm|m|metre|meter|ft|feet)\b|\b\d+\s*[x×]\s*\d+\b/.test(context);
}

function hasPreferredStartDate(memory: V9SalesMemory, input: V9WhatsAppSalesBrainInput) {
  const context = normalize([input.inboundMessageText, ...previousInbound(input.previousMessages), memory.timeline_expectation].join(" "));
  return Boolean(memory.timeline_expectation || /\btomorrow\b|\btmr\b|\btonight\b|\bnext week\b|\bthis week\b|\bpreferred start\b|\bstart date\b|\bcan start\b/.test(context));
}

function missingCarpentryDemoDetails(memory: V9SalesMemory, input: V9WhatsAppSalesBrainInput, options: { includeFloorPlan?: boolean } = {}) {
  const missing: string[] = [];
  if (!memory.property_type) missing.push("property type");
  if (!hasReceivedSitePhotos(memory) && !memory.do_not_ask_again.site_photos) missing.push("photos/video of the area");
  if (options.includeFloorPlan && !hasReceivedFloorPlan(memory) && !memory.do_not_ask_again.floor_plan) missing.push("floor plan");
  if (!hasMeasurements(input)) missing.push("rough measurements");
  if (!hasSpecificScope(memory)) missing.push("what you want to build, remove, modify or hack");
  if (!hasPreferredStartDate(memory, input)) missing.push("preferred start date");
  return missing;
}

function receivedCarpentryDemoAcknowledgement(memory: V9SalesMemory) {
  const received = [
    hasReceivedSitePhotos(memory) ? "photos" : "",
    memory.property_type ? "property type" : "",
    hasReceivedFloorPlan(memory) ? "floor plan" : ""
  ].filter(Boolean);
  if (!received.length) return "";
  return `Thanks, I've received the ${joinList(received)}. `;
}

function askMissingCarpentryDemoDetails(memory: V9SalesMemory, input: V9WhatsAppSalesBrainInput, options: { includeFloorPlan?: boolean } = {}) {
  const missing = missingCarpentryDemoDetails(memory, input, options);
  if (!missing.length) return "The team can review the details already shared and advise the next step for an initial review.";
  return `May I check ${joinList(missing)}?`;
}

function isMandarinMessage(text: string) {
  return /[\u4e00-\u9fff]/.test(text);
}

function hasCarpentryDemoPriceQuestion(text: string) {
  const normalized = normalize(text);
  return /\bhow much\b|\bprice\b|\bquote\b|\bquotation\b|\broughly\b|\bcost\b|多少钱/.test(normalized);
}

function composeCarpentryDemoPriceReply(memory: V9SalesMemory, input: V9WhatsAppSalesBrainInput) {
  if (isMandarinMessage(input.inboundMessageText)) {
    return "可以，我们可以先帮您 review。木工或拆除工程需要看 property type、照片/视频、rough measurements、实际范围、现场情况、保护/垃圾清理，以及是否需要批准。明天能不能做也要看 scope、现场条件、团队 availability 和 approval 情况。请先把这些资料发来，我们再 advise next step。";
  }
  const acknowledgement = receivedCarpentryDemoAcknowledgement(memory);
  const missingAsk = askMissingCarpentryDemoDetails(memory, input);
  if (acknowledgement) {
    return `${acknowledgement}Sure, we can help review this. For carpentry or demo works, pricing depends on the actual scope, size, site condition, access, disposal/protection, material choice, and whether approval is needed. ${missingAsk}`;
  }
  return findCarpentryDemoQaItem("CDQ01_PRICE_FIRST").templateEn;
}

function composeCondoWeekendHackingReply() {
  return "For condo works, hacking must follow MCST or building management rules and approved working hours. Please share the management renovation rules or form if available, together with the wall location, photos and floor plan. We should not promise Saturday works before the scope, approval and allowed hours are checked.";
}

function composeCarpentryDemoMultiIntentReply(memory: V9SalesMemory, input: V9WhatsAppSalesBrainInput) {
  const missingAsk = askMissingCarpentryDemoDetails(memory, input, { includeFloorPlan: true });
  return `We can help review the kitchen wall request, disposal scope and target start timing together. For wall hacking, we'll need to check the property type, floor plan, wall location, whether the wall is structural/restricted, hidden services, and any approval requirements first. Disposal should also be reviewed and itemised clearly after we understand the dismantling or hacking scope. Start timing depends on scope, access, disposal/protection, approval and team availability. ${missingAsk}`;
}

function composeCarpentryDemoKnowledgeReply(match: CarpentryDemoQaMatch, memory: V9SalesMemory, input: V9WhatsAppSalesBrainInput) {
  const text = normalize(input.inboundMessageText);
  if (/bomb shelter|household shelter|防空|避难所/.test(text)) return findCarpentryDemoQaItem("CDQ06_HOUSEHOLD_SHELTER").templateEn;
  if (/condo|mcst|management|saturday|weekend/.test(text) && /hack|hacking|wall|敲墙|打墙|拆墙/.test(text)) return composeCondoWeekendHackingReply();
  if (/hack|hacking|wall|敲墙|打墙|拆墙/.test(text) && /disposal|debris|haulage|rubbish|垃圾|清走/.test(text) && /start|next week|tomorrow|timeline/.test(text)) {
    return composeCarpentryDemoMultiIntentReply(memory, input);
  }
  if (/disposal|debris|haulage|rubbish|垃圾|清走/.test(text)) return findCarpentryDemoQaItem("CDQ07_DISPOSAL").templateEn;
  if (hasCarpentryDemoPriceQuestion(input.inboundMessageText)) return composeCarpentryDemoPriceReply(memory, input);
  if (/dust|noisy|noise|protection|lift protection|corridor protection|灰尘|噪音|保护/.test(text)) return findCarpentryDemoQaItem("CDQ08_DUST_PROTECTION").templateEn;
  if (/approval|permit|mcst|management|批准|管理处/.test(text)) return findCarpentryDemoQaItem("CDQ05_APPROVAL").templateEn;
  if (/hack|hacking|remove wall|wall removal|wall|敲墙|打墙|拆墙/.test(text)) return findCarpentryDemoQaItem("CDQ04_WALL_HACKING").templateEn;
  if (/modify|cabinet|fridge|shelf|replace door|修改柜|加层板/.test(text)) {
    const sizeLabel = /fridge/i.test(input.inboundMessageText) ? "fridge size" : "item size";
    const ask = hasMeasurements(input) ? "" : ` Could you send photos, rough dimensions and the ${sizeLabel}?`;
    return `${findCarpentryDemoQaItem("CDQ10_CABINET_MODIFICATION").templateEn}${ask}`;
  }
  if (/match|same colour|laminate colour/.test(text)) return findCarpentryDemoQaItem("CDQ11_LAMINATE_MATCH").templateEn;
  if (/material|plywood|mdf|hinge|drawer track|soft closing|laminate/.test(text)) return findCarpentryDemoQaItem("CDQ12_MATERIALS").templateEn;
  if (/hidden pipe|hidden wire|wires inside|damage pipes|conduit/.test(text)) return findCarpentryDemoQaItem("CDQ13_HIDDEN_SERVICES").templateEn;
  if (/how long|start tomorrow|can start|timeline/.test(text)) return findCarpentryDemoQaItem("CDQ09_TIMELINE").templateEn;
  if (match.item.id === "CDQ02_SMALL_JOBS" || /small job|small hacking|only remove/.test(text)) return findCarpentryDemoQaItem("CDQ02_SMALL_JOBS").templateEn;
  if (match.item.id === "CDQ03_SITE_VISIT") return match.item.templateEn;

  const acknowledgement = receivedCarpentryDemoAcknowledgement(memory);
  if (acknowledgement) {
    return `${acknowledgement}We can help review this. ${askMissingCarpentryDemoDetails(memory, input)}`;
  }
  return findCarpentryDemoQaItem("CDQ02_SMALL_JOBS").templateEn;
}

function firstTouchGreetingKind(text: string) {
  if (has(text, /^你好$/)) return "chinese_greeting";
  if (has(text, /^(hi|hello|hi there|hey)$/)) return "english_greeting";
  if (has(text, /\bare you there\b|\banyone there\b|\bcan reply\b/)) return "are_you_there";
  return "";
}

function composePriceReply(memory: V9SalesMemory, input: V9WhatsAppSalesBrainInput) {
  const text = normalize(input.inboundMessageText);
  const seriousAa = memory.property_type === "landed" || /a&a|landed/i.test(memory.project_type);
  const floorReceived = memory.floor_plan_status === "received" || memory.floor_plan_status === "client_claimed_sent";
  const carpentryMatch = carpentryDemoMatch(input, memory);

  if (carpentryMatch) {
    return composeCarpentryDemoKnowledgeReply(carpentryMatch, memory, input);
  }

  if (has(text, /\bpackage\b/)) {
    return "We usually review based on the actual scope rather than fixed packages, so the proposal can match the property and works needed. May I know what type of property this is and which areas you're planning to renovate?";
  }

  if (has(text, /\bkitchen\b/)) {
    return "We can help review the kitchen works. The cost depends on whether it includes carpentry only, or also hacking, tiling, plumbing, electrical and countertop works. May I know what you're planning for the kitchen?";
  }

  if (has(text, /\btoilet\b|\bbathroom\b/)) {
    return "We can help review the toilet works. The cost depends on whether it includes hacking, waterproofing, tiling, plumbing, sanitary fittings and electrical works. May I know what works you're planning to include?";
  }

  if (has(text, /\bwhole house\b|\bwhole-house\b|\bfull house\b|\bfull renovation\b/)) {
    return "We can help review a whole-house renovation. The cost depends on the property type, size, existing condition and scope. May I know if this is for a HDB, condo, landed property or commercial unit?";
  }

  if (seriousAa && floorReceived) {
    const next = nextUsefulInfoSentence(memory);
    return `I understand you'd like a rough idea. For landed A&A works, the team should review the floor plan, site photos, site condition and material direction first before advising. ${next}`;
  }

  if (!hasSpecificScope(memory)) {
    return "We can help review this, but the cost depends on the property type, size, and actual scope. May I know what renovation works you're planning?";
  }

  if (hasSpecificScope(memory) || memory.floor_plan_status === "received" || memory.floor_plan_status === "client_claimed_sent") {
    const known = floorReceived ? " We've received the floor plan." : "";
    const next = nextUsefulInfoSentence(memory);
    return `We can help review this, but the cost depends on the property type, size, and actual scope.${known} ${next}`;
  }

  return "We can help review this, but the cost depends on the property type, size, and actual scope. May I know what renovation works you're planning?";
}

function composeAppointmentReply(memory: V9SalesMemory, input: V9WhatsAppSalesBrainInput) {
  const timing = memory.appointment_preference || extractAppointmentPreference(input.inboundMessageText);
  const timingPrefix = timing ? `${timing} noted. ` : "";
  const hasProperty = Boolean(memory.property_type);
  const hasScope = hasSpecificScope(memory);
  const hasLocation = Boolean(memory.address || memory.postal_code);

  if (!hasProperty || !hasScope) {
    return `${timingPrefix}We can check a suitable time for a project review. May I know the property type, rough location, and main scope first?`;
  }

  if (!hasLocation) {
    return `${timingPrefix}Sure, we can check a suitable timing. May I have the property address or postal code so we can review the location first?`;
  }

  return `${timingPrefix}Sure, we can check a suitable timing. The appointment is not confirmed yet, and the team will review availability before confirming.`;
}

function composeFirstTouchReply(intent: string, memory: V9SalesMemory, input: V9WhatsAppSalesBrainInput) {
  if (!isFirstTouch(input)) return "";
  if (["carpentry_demo_qa", "hacking_wall", "approval_submission"].includes(intent)) return "";
  const text = normalize(input.inboundMessageText);
  const type = input.inboundMessageType.toLowerCase();
  const greetingKind = firstTouchGreetingKind(text);

  if (greetingKind === "chinese_greeting") return CHINESE_FIRST_TOUCH_REPLY;
  if (greetingKind === "english_greeting") return FIRST_TOUCH_GREETING_REPLY;
  if (greetingKind === "are_you_there") {
    return "Hi, yes we're here. Thanks for contacting LIMM Works. May I know what renovation works you're planning?";
  }

  if (intent === "price_question") return composePriceReply(memory, input);
  if (intent === "appointment_request" || intent === "office_visit_request") return composeAppointmentReply(memory, input);

  if (["image", "document"].includes(type)) {
    if (memory.floor_plan_status === "received" || memory.floor_plan_status === "client_claimed_sent") {
      return "Hi, thanks for sending the floor plan. May I know the main areas you're planning to renovate?";
    }
    return "Hi, thanks for sending the photos. May I know what works you're planning for this area?";
  }

  if (has(text, /\bcan do renovation\b|\bdo renovation\b|\bhelp.*renovation\b/)) {
    return `Hi, yes we can help review renovation works. ${DREAM_HOME_PHRASE} May I know what type of property this is and what works you're planning?`;
  }

  if ((memory.property_type === "landed" || /a&a|landed/i.test(memory.project_type)) && !hasAreaScope(memory)) {
    return "Thanks for contacting LIMM Works. We'd love to help create your dream home and review the landed/A&A works properly. May I know which areas you're planning to change?";
  }

  if (memory.property_type && hasSpecificScope(memory)) {
    if (memory.property_type === "commercial") {
      return "Yes, we can help review office renovation works. May I know what areas of the office you're planning to renovate or fit out?";
    }
    if (
      ["received", "client_claimed_sent"].includes(memory.floor_plan_status) ||
      ["received", "client_claimed_sent"].includes(memory.site_photo_status) ||
      ["provided", "received", "client_claimed_sent"].includes(memory.design_reference_status)
    ) {
      return `Thanks for sharing. ${DREAM_HOME_PHRASE} ${nextUsefulInfoSentence(memory)}`;
    }
    return `Thanks for sharing. ${DREAM_HOME_PHRASE} You may send us the floor plan, site photos, and any reference images here first, and we'll review the scope from there.`;
  }

  if (memory.property_type && !hasSpecificScope(memory)) {
    if (memory.property_type === "commercial") {
      return "Yes, we can help review office renovation works. May I know what areas of the office you're planning to renovate or fit out?";
    }
    return `Hi, thanks for contacting LIMM Works. ${DREAM_HOME_PHRASE} May I know which areas of the ${memory.property_type} you're planning to renovate?`;
  }

  if (!memory.property_type && hasSpecificScope(memory)) {
    return `Hi, thanks for contacting LIMM Works. We'd love to help create your dream home, starting with the ${scopePhrase(memory)}. May I know if this is for a HDB, condo, landed property, or commercial unit?`;
  }

  return "";
}

function joinList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function shouldUseRepeatHandoffSentence(memory: V9SalesMemory, intent = "") {
  if (!memory.handoff_lock) return false;
  if (intent === "frustration_or_correction") return true;
  if (memory.client_patience === "annoyed") return true;
  if (memory.repeated_question_count > 1) return true;
  return memory.correction_history.some((entry) => /frustration|repeat|asked again|stuck/i.test(entry));
}

function handoffAppend(reply: string, memory: V9SalesMemory, intent = "") {
  if (!shouldUseRepeatHandoffSentence(memory, intent)) return reply;
  if (normalize(reply).includes(normalize(TEAM_FOLLOW_UP))) return reply;
  return `${reply} ${TEAM_FOLLOW_UP}`;
}

function composeDesignQuestionReply(memory: V9SalesMemory) {
  if (memory.property_type || hasSpecificScope(memory)) {
    return "Yes, we can help review the design direction. You may send us your floor plan, site photos, and any reference images here first, and we'll review from there.";
  }
  return `Yes, we can help review the design direction. ${DREAM_HOME_PHRASE} May I know what type of property this is and which areas you're planning to renovate?`;
}

function composeReply(intent: string, memory: V9SalesMemory, input: V9WhatsAppSalesBrainInput) {
  const timing = memory.appointment_preference || extractAppointmentPreference(input.inboundMessageText);
  const seriousAa = memory.property_type === "landed" || /a&a|landed/i.test(memory.project_type);
  const floorReceived = memory.floor_plan_status === "received" || memory.floor_plan_status === "client_claimed_sent";

  if (memory.handoff_lock && ["frustration_or_correction", "general_enquiry", "follow_up_ping"].includes(intent)) {
    return HANDOFF_HOLDING_REPLY;
  }

  if (intent === "voice_message") {
    return "Sorry, we're not able to listen to voice messages here. Could you type the key details instead, such as your property type, renovation scope, and preferred appointment timing?";
  }
  const firstTouchReply = composeFirstTouchReply(intent, memory, input);
  if (firstTouchReply) return firstTouchReply;

  if (intent === "carpentry_demo_qa") {
    const match = carpentryDemoMatch(input, memory);
    if (match) return handoffAppend(composeCarpentryDemoKnowledgeReply(match, memory, input), memory, intent);
  }
  if (intent === "price_question") {
    return handoffAppend(composePriceReply(memory, input), memory, intent);
  }
  if (intent === "timeline_question") {
    return handoffAppend("We can check the timeline, but it depends on the scope, site condition, and team availability. May I know what works you need done?", memory, intent);
  }
  if (intent === "timeline_followup") {
    return handoffAppend("We can't say it cannot finish without reviewing the confirmed project details, but we also shouldn't promise 3 months before checking the site details and work sequence.", memory, intent);
  }
  if (intent === "hypothetical_timeline") {
    return handoffAppend("For many condo renovations, 6 months is usually a more comfortable planning window, but the team still needs to check the project details, condo management requirements, materials and site condition before confirming.", memory, intent);
  }
  if (intent === "office_visit_request") {
    const timeText = timing || "your preferred office visit timing";
    return handoffAppend(`${timeText} noted as your preferred office visit timing. The team will check availability before confirming.`, memory, intent);
  }
  if (intent === "appointment_request") {
    return handoffAppend(composeAppointmentReply(memory, input), memory, intent);
  }
  if (intent === "design_direction_statement") {
    const direction = memory.design_direction || "your preferred design direction";
    return handoffAppend(`${capitalize(direction)} noted. If you have reference images later, you can send them, but the team can already use this as the starting design direction.`, memory, intent);
  }
  if (intent === "design_question") {
    return composeDesignQuestionReply(memory);
  }
  if (intent === "file_correction") {
    const items = [
      floorReceived ? "floor plan" : "",
      memory.site_photo_status === "received" || memory.site_photo_status === "client_claimed_sent" ? "site photos" : ""
    ].filter(Boolean);
    const itemText = items.length ? joinList(items) : "files";
    if (floorReceived) {
      return "Sorry about that. Yes, we've received the floor plan. May I know which areas you want to prioritise?";
    }
    return `Sorry about that. Yes, we've noted the ${itemText}. May I know which areas you want to prioritise?`;
  }
  if (intent === "hacking_wall") {
    if (memory.property_type === "condo") {
      return handoffAppend("Possible, but it depends on the wall type, structure, services and condo management renovation guidelines. May I know which wall or area you're looking at?", memory, intent);
    }
    if (memory.property_type === "HDB") {
      return handoffAppend("Possible, but hacking and wet works will depend on HDB rules and approval where applicable. May I know which wall or area you're looking at?", memory, intent);
    }
    if (seriousAa) {
      return handoffAppend("Possible, but for landed/A&A works, it's better for us to review the existing layout and site photos first before advising on wall work.", memory, intent);
    }
    if (!memory.property_type) {
      return handoffAppend("Possible, but it depends on whether the wall is structural and the approval requirements. May I know if this is HDB, condo, or landed?", memory, intent);
    }
    return handoffAppend("We'll need to check the drawings and site condition first. Whether wall work is possible depends on the wall type, structure, services, property rules and approval or submission requirements if applicable.", memory, intent);
  }
  if (intent === "approval_submission") {
    return handoffAppend("We can help review the scope and approval requirements first. Approval depends on the property type, authorities or management rules, and the actual works involved.", memory, intent);
  }
  if (intent === "portfolio_request") {
    return handoffAppend("Yes, you can view some of our renovation works, design references and project-related content on Instagram here: https://www.instagram.com/limmworks/ If you're looking for a specific reference type, let us know whether it is landed A&A, full house renovation, kitchen, bathroom, carpentry, hacking works, design works or commercial renovation.", memory, intent);
  }
  if (intent === "promotion_question") {
    return handoffAppend("We don't confirm discounts or promo offers in this chat. The team can review the project details properly and advise the suitable next step.", memory, intent);
  }
  if (intent === "free_work_request") {
    return handoffAppend("We don't do renovation works for free, but the team can review the project details properly and advise the next step.", memory, intent);
  }
  if (intent === "identity_question") {
    return "This WhatsApp chat is assisted by LIMM's enquiry assistant. Important project details are routed to the team for review.";
  }
  if (intent === "media_received") {
    if (floorReceived) return handoffAppend("Hi, thanks for sending the floor plan. May I know the main areas you're planning to renovate?", memory, intent);
    return handoffAppend("Hi, thanks for sending the photos. May I know what works you're planning for this area?", memory, intent);
  }
  if (intent === "serious_project_enquiry") {
    const project = seriousAa ? "landed A&A or landed renovation" : "renovation";
    const next = nextUsefulInfoSentence(memory);
    return handoffAppend(`Thanks for sharing. We can help review the ${project} properly. ${next}`, memory, intent);
  }
  if (intent === "follow_up_ping") {
    return handoffAppend("Hi, yes we're here. Thanks for contacting LIMM Works. May I know what renovation works you're planning?", memory, intent);
  }
  return handoffAppend(FIRST_TOUCH_GREETING_REPLY, memory, intent);
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function salesMoveFor(intent: string): V9SalesMove {
  if (intent === "price_question") return "safe_price_review";
  if (intent === "carpentry_demo_qa") return "carpentry_demo_review";
  if (intent === "timeline_question" || intent === "timeline_followup") return "timeline_reality_check";
  if (intent === "hypothetical_timeline") return "hypothetical_answer_without_context_overwrite";
  if (intent === "appointment_request") return "appointment_preference_pending_confirmation";
  if (intent === "office_visit_request") return "office_visit_pending_confirmation";
  if (intent === "design_direction_statement") return "design_direction_noted";
  if (intent === "file_correction") return "file_correction_acknowledgement";
  if (intent === "portfolio_request") return "portfolio_route";
  if (intent === "promotion_question") return "promo_deflection";
  if (intent === "free_work_request") return "free_work_deflection";
  if (intent === "identity_question") return "human_identity_answer";
  if (intent === "voice_message" || intent === "unsupported") return "voice_or_unsupported_fallback";
  if (intent === "frustration_or_correction") return "handoff_to_team";
  if (intent === "follow_up_ping" || intent === "media_received") return "acknowledge_and_continue";
  return "answer_direct_question";
}

function stageFor(intent: string, memory: V9SalesMemory) {
  if (intent === "design_question") return memory.lead_seriousness === "high" ? "design_discussion" : "discovery";
  if (memory.handoff_lock || intent === "frustration_or_correction") return "handoff_required";
  if (intent === "price_question") return "price_question";
  if (intent === "carpentry_demo_qa") return "technical_or_authority_risk";
  if (intent === "appointment_request" || intent === "office_visit_request") return "appointment_pending";
  if (intent === "timeline_question" || intent === "timeline_followup" || intent === "hypothetical_timeline") return "timeline_discussion";
  if (intent === "hacking_wall" || intent === "approval_submission") return "technical_or_authority_risk";
  if (memory.lead_seriousness === "high") return "serious_lead_review";
  return "discovery";
}

function appointmentStatus(intent: string) {
  return intent === "appointment_request" || intent === "office_visit_request"
    ? "requested_pending_review"
    : "none";
}

function legacyTemplateBlocked(reply: string) {
  return LEGACY_REPLY_TEMPLATE_PATTERNS.some((pattern) => pattern.test(reply));
}

function v9QualityProblems(reply: string, intent: string, memory: V9SalesMemory) {
  const normalizedReply = normalize(reply);
  const problems: string[] = [];
  if (!reply.trim()) problems.push("empty_reply");
  if (legacyTemplateBlocked(reply)) problems.push("legacy_template_phrase");
  if (BANNED_TONE_PATTERNS.some((pattern) => pattern.test(reply))) problems.push("banned_tone_phrase");
  if (
    (memory.floor_plan_status === "received" || memory.floor_plan_status === "client_claimed_sent") &&
    has(normalizedReply, /\b(?:send|share|provide).{0,25}floor\s*plan\b|\bfloor\s*plan.{0,20}(?:needed|required)\b/) &&
    !has(normalizedReply, /\bthanks for sending (?:the )?floor\s*plan\b|\bwe(?:'| )?ve received.{0,20}floor\s*plan\b/)
  ) {
    problems.push("asked_received_floor_plan");
  }
  if (
    (memory.site_photo_status === "received" || memory.site_photo_status === "client_claimed_sent") &&
    has(normalizedReply, /\b(?:send|share|provide).{0,25}(?:site )?photos?\b/) &&
    !has(normalizedReply, /\bthanks for sending (?:the )?photos?\b|\bwe(?:'| )?ve received.{0,20}(?:site )?photos?\b/)
  ) {
    problems.push("asked_received_site_photos");
  }
  if (intent !== "design_question" && shouldUseRepeatHandoffSentence(memory, intent) && has(normalizedReply, /\bproperty type\b|\bfloor\s*plan\b|\bsite photos?\b|\bscope\b|\bdesign references?\b|\bpreferred timing\b/) && !normalizedReply.includes(normalize(TEAM_FOLLOW_UP))) {
    problems.push("generic_intake_after_handoff_lock");
  }
  const prior = memory.last_bot_replies.map(normalize);
  if (prior.includes(normalizedReply)) problems.push("exact_repeat");
  if (intent === "price_question") {
    const allowedPriceOpenings = [
      "I understand you'd like a rough idea",
      "We can help review this",
      "We can help review the kitchen works",
      "We can help review the toilet works",
      "We can help review a whole-house renovation",
      "We usually review based on the actual scope"
    ].map(normalize);
    if (!allowedPriceOpenings.some((opening) => normalizedReply.startsWith(opening))) {
      problems.push("price_reply_missing_approved_opening");
    }
  }
  return problems;
}

function finalV9Reply(input: V9WhatsAppSalesBrainInput, intent: string, memory: V9SalesMemory) {
  let reply = composeReply(intent, memory, input);
  let safetyResult: V9WhatsAppSalesBrainDecision["safetyResult"] = "pass";
  let qualityResult: V9WhatsAppSalesBrainDecision["qualityResult"] = "pass";
  let repetitionResult: V9WhatsAppSalesBrainDecision["repetitionResult"] = "pass";
  let noSilenceGuardResult: V9WhatsAppSalesBrainDecision["noSilenceGuardResult"] = "not_needed";

  let qualityProblems = v9QualityProblems(reply, intent, memory);
  if (qualityProblems.length) {
    reply = shouldUseRepeatHandoffSentence(memory, intent) ? HANDOFF_HOLDING_REPLY : ULTRA_SAFE_V9_FALLBACK;
    qualityResult = "rewritten";
    if (qualityProblems.includes("exact_repeat")) repetitionResult = "rewritten";
  }

  let safety = validateWhatsAppAutoReply(reply, { calendarEventId: input.calendarEventId ?? "" });
  if (!safety.ok) {
    reply = shouldUseRepeatHandoffSentence(memory, intent) ? HANDOFF_HOLDING_REPLY : ULTRA_SAFE_V9_FALLBACK;
    safetyResult = "rewritten";
    safety = validateWhatsAppAutoReply(reply, { calendarEventId: input.calendarEventId ?? "" });
  }

  if (!reply.trim()) {
    reply = ULTRA_SAFE_V9_FALLBACK;
    noSilenceGuardResult = "used";
    safetyResult = "fallback_used";
    safety = validateWhatsAppAutoReply(reply, { calendarEventId: input.calendarEventId ?? "" });
  }

  return {
    reply,
    safety,
    safetyResult,
    qualityResult,
    repetitionResult,
    noSilenceGuardResult,
    qualityProblems
  };
}

function memoryPatch(before: V9SalesMemory, after: V9SalesMemory) {
  const patch: Partial<V9SalesMemory> & Record<string, unknown> = {};
  for (const key of Object.keys(after) as Array<keyof V9SalesMemory>) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      patch[key] = after[key] as never;
    }
  }
  return patch;
}

export function buildV9WhatsAppSalesBrainDecision(input: V9WhatsAppSalesBrainInput): V9WhatsAppSalesBrainDecision {
  const before = initialMemory(input);
  const memory = deriveMemory(input);
  const intent = detectIntent(input, memory);
  const carpentryDemoKnowledge = carpentryDemoMatch(input, memory);
  const salesMove = salesMoveFor(intent);
  const stage = stageFor(intent, memory);
  const moveRisks = riskFlags(intent, memory);
  const missing = missingInfo(memory);
  const final = finalV9Reply(input, intent, memory);
  const shouldReply = input.autoReplyEnabled && intent !== "unsupported" && Boolean(final.reply.trim());
  const handoffRequired =
    (intent !== "design_question" && memory.handoff_lock) ||
    ["frustration_or_correction", "file_correction", "price_question", "appointment_request", "office_visit_request", "hacking_wall", "approval_submission", "carpentry_demo_qa", "free_work_request", "promotion_question"].includes(intent);
  const confidence = memory.handoff_lock && intent !== "design_question" ? 95 : ["general_enquiry", "media_received"].includes(intent) ? 82 : 96;
  const patch = memoryPatch(before, memory);
  const correctionApplied = memory.correction_history.length > 0 || memory.handoff_lock;
  const blockedLegacyTemplate = legacyTemplateBlocked(final.reply);
  const trace = {
    version: V9_CLEAN_WHATSAPP_SALES_BRAIN_VERSION,
    salesBrainVersion: V9_SALES_BRAIN_VERSION,
    providerMessageId: input.providerMessageId ?? "",
    inbound_text: input.inboundMessageText,
    normalized_text: normalize(input.inboundMessageText),
    inboundMessageType: input.inboundMessageType.toLowerCase(),
    valid_client_text: intent !== "unsupported",
    auto_reply_enabled: input.autoReplyEnabled,
    replyEngine: "v9_clean_core",
    plannerVersion: V9_SALES_BRAIN_VERSION,
    singleReplyCoreOnly: true,
    legacyReplyLogicQuarantined: true,
    primaryIntent: intent,
    detected_intent: intent,
    detectedIntents: [intent],
    stage,
    conversation_stage: stage,
    primarySalesMove: salesMove,
    primaryMove: salesMove,
    selected_sales_move: salesMove,
    templateId: `v9:${salesMove}`,
    knowledgeModule: carpentryDemoKnowledge ? "limm_carpentry_demo_common_questions_sg" : "",
    knowledgeModuleName: carpentryDemoKnowledge ? "Carpentry & Demo Works - Common Client Questions Singapore" : "",
    carpentryDemoQaItem: carpentryDemoKnowledge?.item.id ?? "",
    carpentryDemoMatchedKeywords: carpentryDemoKnowledge?.matchedKeywords ?? [],
    carpentryDemoMatchedPatterns: carpentryDemoKnowledge?.matchedPatterns ?? [],
    reply_source: "v9_clean_core",
    final_reply_text: final.reply,
    finalReplyHash: hashReply(final.reply),
    memoryUsed: true,
    knownFactsUsed: Boolean(conciseKnownFacts(memory)),
    knownFactsSummary: conciseKnownFacts(memory),
    missingFactsSelected: missing,
    handoffRequired,
    handoff_required: handoffRequired,
    handoffLockActive: memory.handoff_lock,
    currentIntentBypassesRecoveryHandoff: intent === "design_question" && memory.handoff_lock,
    durableCorrectionMemoryAvailable: true,
    correctionApplied,
    correctionHistory: memory.correction_history,
    v9Memory: memory,
    memoryPatch: patch,
    memoryAfter: memory,
    clientPatience: memory.client_patience,
    leadSeriousness: memory.lead_seriousness,
    doNotAskAgain: memory.do_not_ask_again,
    repeatedQuestionCount: memory.repeated_question_count,
    safetyValidatorPassed: final.safety.ok,
    safety_result: final.safetyResult,
    safety_errors: final.safety.errors,
    safety_error_codes: final.safety.errorCodes,
    quality_result: final.qualityResult,
    qualityProblems: final.qualityProblems,
    repetition_result: final.repetitionResult,
    no_silence_guard_result: final.noSilenceGuardResult,
    blockedLegacyTemplate,
    priceGuideOnHold: true,
    calendarAutoBookingEnabled: false,
    voiceTranscriptionEnabled: false,
    appointment_status: appointmentStatus(intent),
    calendarEventId: input.calendarEventId ?? null,
    final_send_result: "pending_send",
    error: ""
  };

  return {
    shouldSendAutoReply: shouldReply,
    replyText: final.reply,
    memoryPatch: patch,
    trace,
    handoffRequired,
    safetyPassed: final.safety.ok && !blockedLegacyTemplate,
    intent,
    stage,
    confidence,
    replySource: memory.handoff_lock && intent !== "design_question" ? "handoff_holding" : "v9_clean_core",
    salesMove,
    answeredClientQuestion: true,
    askedNextBestQuestion: /\?/.test(final.reply),
    riskFlags: moveRisks,
    missingInfo: missing,
    nextAction: handoffRequired ? "Team follow-up required." : "Continue with v9 clean-core reply flow.",
    appointmentStatus: appointmentStatus(intent),
    safetyResult: final.safetyResult,
    repetitionResult: final.repetitionResult,
    qualityResult: final.qualityResult,
    noSilenceGuardResult: final.noSilenceGuardResult
  };
}
