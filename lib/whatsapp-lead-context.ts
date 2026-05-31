import type { Lead, LeadMessage } from "@/lib/types";

export interface WhatsAppLeadContextMemory {
  hasFloorPlan: boolean;
  hasSitePhotos: boolean;
  hasScopeOfWork: boolean;
  hasPropertyType: boolean;
  hasAddressOrArea: boolean;
  hasPreferredAppointmentTime: boolean;
  hasDesignReferences: boolean;
  hasPortfolioRequest: boolean;
  knownScopeSummary: string;
  knownPropertyType: string;
  missingFields: string[];
  receivedFields: string[];
  knownContextSummary: string;
}

export const OFFICIAL_LIMM_INSTAGRAM_URL = "https://www.instagram.com/limmworks/";

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function inboundTexts(messages: LeadMessage[]) {
  return messages
    .filter((message) => message.direction === "inbound")
    .map((message) => `${message.body} ${Object.values(message.metadata ?? {}).join(" ")}`);
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function readableList(items: string[]) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function propertyTypeFromText(text: string, lead: Lead) {
  const leadProperty = lead.propertyType && lead.propertyType !== "Unknown" ? lead.propertyType : "";
  if (/\blanded|terrace|semi d|bungalow|corner terrace|inter terrace\b/i.test(text)) return "landed";
  if (/\bcondo|apartment|mcst|condominium\b/i.test(text)) return "condo";
  if (/\bcommercial|office|shop|clinic|restaurant|retail\b/i.test(text)) return "commercial";
  return leadProperty;
}

function scopeFromText(text: string, lead: Lead) {
  if (lead.scopeSummary && lead.scopeSummary !== "New WhatsApp enquiry") return lead.scopeSummary;
  const scopeMatch = text.match(/\b(?:kitchen extension|full renovation|landed renovation|bathroom renovation|toilet renovation|carpentry|wardrobe|hacking works|commercial renovation|clinic renovation|a&a|aa works)\b/i);
  return scopeMatch?.[0] ?? "";
}

export function inferWhatsAppLeadContext(input: {
  lead: Lead;
  previousMessages: LeadMessage[];
  inboundText: string;
}): WhatsAppLeadContextMemory {
  const relevantText = [
    input.lead.propertyType,
    input.lead.scopeSummary,
    input.lead.lastClientMessage,
    input.inboundText,
    ...inboundTexts(input.previousMessages)
  ].join(" ");
  const normalized = normalise(relevantText);

  const hasFloorPlan = hasAny(normalized, [
    /\bfloor plan\b/i,
    /\bfloorplan\b/i,
    /\blayout\b/i,
    /\bdrawing\b/i,
    /\bi (?:sent|have|attached).*plan\b/i,
    /\battached.*(?:plan|layout|drawing)\b/i
  ]);
  const hasSitePhotos = hasAny(normalized, [
    /\bsite photos?\b/i,
    /\bphotos?\b/i,
    /\bpictures?\b/i,
    /\bimages?\b/i,
    /\bvideo\b/i,
    /\battached.*(?:photo|image|picture|video)\b/i,
    /\bmessageType image\b/i,
    /\bmessageType video\b/i
  ]);
  const knownScopeSummary = scopeFromText(normalized, input.lead);
  const hasScopeOfWork = Boolean(knownScopeSummary) || hasAny(normalized, [
    /\bscope\b/i,
    /\brenovat(?:e|ion)\b/i,
    /\bextension\b/i,
    /\ba&a\b/i,
    /\baa works\b/i,
    /\bhacking\b/i,
    /\bcarpentry\b/i,
    /\bkitchen\b/i,
    /\bbathroom\b/i
  ]);
  const knownPropertyType = propertyTypeFromText(normalized, input.lead);
  const hasPropertyType = Boolean(knownPropertyType);
  const hasAddressOrArea = hasAny(normalized, [
    /\baddress\b/i,
    /\barea\b/i,
    /\bstreet\b/i,
    /\broad\b/i,
    /\bavenue\b/i,
    /\bave\b/i,
    /\bdrive\b/i,
    /\bblk\b/i,
    /\bunit\b/i,
    /\bpostal\b/i,
    /\btosca\b/i,
    /\bsingapore\s*\d{6}\b/i,
    /\b\d{6}\b/i
  ]);
  const hasPreferredAppointmentTime = hasAny(normalized, [
    /\b(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?\b/i,
    /\b\d{1,2}\s*(?:am|pm)\b/i,
    /\btomorrow\b/i,
    /\bnext week\b/i,
    /\bappointment\b/i,
    /\bmeeting\b/i,
    /\bslot\b/i
  ]);
  const hasDesignReferences = hasAny(normalized, [
    /\breference images?\b/i,
    /\bdesign refs?\b/i,
    /\bstyle reference\b/i,
    /\bmoodboard\b/i,
    /\bpinterest\b/i,
    /\bjapandi\b/i,
    /\bmodern luxury\b/i,
    /\bminimalist\b/i
  ]);
  const hasPortfolioRequest = hasAny(normalized, [
    /\bpast works?\b/i,
    /\bpast projects?\b/i,
    /\bproject photos?\b/i,
    /\bportfolio\b/i,
    /\bbefore after\b/i,
    /\bbefore and after\b/i,
    /\bshow me your work\b/i,
    /\bcompleted project\b/i
  ]);

  const missingFields = [
    !hasPropertyType ? "property_type" : "",
    !hasScopeOfWork ? "scope" : "",
    !hasFloorPlan ? "floor_plan" : "",
    !hasSitePhotos ? "site_photos" : "",
    !hasAddressOrArea ? "address_or_area" : ""
  ].filter(Boolean);
  const receivedFields = [
    hasPropertyType ? "property type" : "",
    hasScopeOfWork ? "scope" : "",
    hasFloorPlan ? "floor plan" : "",
    hasSitePhotos ? "site photos" : "",
    hasAddressOrArea ? "address/area" : "",
    hasPreferredAppointmentTime ? "preferred appointment time" : "",
    hasDesignReferences ? "design references" : ""
  ].filter(Boolean);

  const knownContextSummary = receivedFields.length
    ? `Received: ${readableList(receivedFields)}.`
    : "No key project details received yet.";

  return {
    hasFloorPlan,
    hasSitePhotos,
    hasScopeOfWork,
    hasPropertyType,
    hasAddressOrArea,
    hasPreferredAppointmentTime,
    hasDesignReferences,
    hasPortfolioRequest,
    knownScopeSummary,
    knownPropertyType,
    missingFields,
    receivedFields,
    knownContextSummary
  };
}

export function describeReceivedInfo(context: WhatsAppLeadContextMemory) {
  if (!context.receivedFields.length) return "";
  return `Thanks, we've received the ${readableList(context.receivedFields)}.`;
}

export function buildMissingInfoAsk(context: WhatsAppLeadContextMemory, focus: "appointment" | "price" | "general" = "general") {
  const missing = context.missingFields;
  if (!missing.length) return "";
  const labels = missing.map((field) => {
    if (field === "property_type") return "property type";
    if (field === "floor_plan") return "floor plan";
    if (field === "site_photos") return "site photos";
    if (field === "address_or_area") return "property area/address";
    return "scope of work";
  });
  if (focus === "price" && missing.includes("scope")) {
    return "Could you share the scope of work first?";
  }
  if (focus === "appointment") {
    return `Could you share your ${readableList(labels)} first so the team can review before confirming for an initial project review?`;
  }
  return `Could you send the ${readableList(labels)} if available for an initial project review?`;
}

export function getLimmInstagramUrl() {
  const value = process.env.LIMM_INSTAGRAM_URL || process.env.NEXT_PUBLIC_LIMM_INSTAGRAM_URL || OFFICIAL_LIMM_INSTAGRAM_URL;
  const trimmed = value.trim();
  if (!/^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.-]+\/?$/i.test(trimmed)) return "";
  return trimmed;
}
