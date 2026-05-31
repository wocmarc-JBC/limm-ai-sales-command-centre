import type { Lead, LeadMessage } from "@/lib/types";

export interface WhatsAppLeadContextMemory {
  hasMedia: boolean;
  hasImageOrDocument: boolean;
  hasAudio: boolean;
  hasFloorPlan: boolean;
  likelyFloorPlan: boolean;
  hasSitePhotos: boolean;
  likelySitePhoto: boolean;
  hasScopeOfWork: boolean;
  hasPropertyType: boolean;
  hasAddressOrArea: boolean;
  hasPreferredAppointmentTime: boolean;
  hasDesignReferences: boolean;
  likelyDesignReference: boolean;
  hasPortfolioRequest: boolean;
  contextFromCurrentMessage: boolean;
  contextFromPreviousMessages: boolean;
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
    .map((message) => `${message.body} ${metadataText(message.metadata ?? {})}`);
}

function metadataText(metadata: Record<string, unknown>) {
  return Object.entries(metadata)
    .map(([key, value]) => {
      if (value === null || value === undefined) return key;
      if (typeof value === "object") return `${key} ${JSON.stringify(value)}`;
      return `${key} ${String(value)}`;
    })
    .join(" ");
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
  const currentText = [
    input.lead.propertyType,
    input.lead.scopeSummary,
    input.lead.lastClientMessage,
    input.inboundText
  ].join(" ");
  const previousText = inboundTexts(input.previousMessages).join(" ");
  const relevantText = [
    currentText,
    previousText
  ].join(" ");
  const normalized = normalise(relevantText);
  const normalizedCurrent = normalise(currentText);
  const normalizedPrevious = normalise(previousText);

  const hasImageOrDocument = hasAny(normalized, [
    /\bmessagetype\s+(?:image|document)\b/i,
    /\bmimetype\s+(?:image|application pdf|application\/pdf)\b/i,
    /\bfilename\s+[\w\s-]*(?:floorplan|floor plan|plan|drawing|layout)[\w\s-]*(?:pdf|jpg|jpeg|png|webp)\b/i,
    /\bfloorplan\s+(?:pdf|jpg|jpeg|png|webp)\b/i
  ]);
  const hasAudio = hasAny(normalized, [
    /\bmessagetype\s+(?:audio|voice)\b/i,
    /\bmimetype\s+audio\b/i,
    /\bisvoicemessage\s+true\b/i
  ]);
  const hasMedia = hasImageOrDocument || hasAudio || hasAny(normalized, [/\bmediaid\b/i, /\bcaption\b/i]);

  const explicitFloorPlan = hasAny(normalized, [
    /\bfloor plan\b/i,
    /\bfloorplan\b/i,
    /\blayout\b/i,
    /\bdrawing\b/i,
    /\bi (?:sent|have|attached).*plan\b/i,
    /\battached.*(?:plan|layout|drawing)\b/i
  ]);
  const likelyFloorPlan = explicitFloorPlan || (hasImageOrDocument && hasAny(normalized, [
    /\bplan\b/i,
    /\bdrawing\b/i,
    /\blayout\b/i,
    /\bdesign ideas?\b/i,
    /\bdesign theme\b/i,
    /\ba&a\b/i,
    /\baa works\b/i,
    /\blanded\b/i
  ]));
  const hasFloorPlan = explicitFloorPlan || likelyFloorPlan;
  const explicitSitePhotos = hasAny(normalized, [
    /\bsite photos?\b/i,
    /\bphotos?\b/i,
    /\bpictures?\b/i,
    /\bimages?\b/i,
    /\bvideo\b/i,
    /\battached.*(?:photo|image|picture|video)\b/i,
    /\bmessagetype\s+video\b/i
  ]);
  const likelySitePhoto = explicitSitePhotos || (hasImageOrDocument && !likelyFloorPlan && hasAny(normalized, [
    /\bphoto\b/i,
    /\bpicture\b/i,
    /\bsite\b/i,
    /\bcondition\b/i,
    /\bleak\b/i,
    /\broof\b/i,
    /\bwall\b/i
  ]));
  const hasSitePhotos = explicitSitePhotos || likelySitePhoto;
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
  const explicitDesignReferences = hasAny(normalized, [
    /\breference images?\b/i,
    /\bdesign refs?\b/i,
    /\bstyle reference\b/i,
    /\bmoodboard\b/i,
    /\bpinterest\b/i,
    /\bjapandi\b/i,
    /\bmodern luxury\b/i,
    /\bminimalist\b/i
  ]);
  const likelyDesignReference = explicitDesignReferences || (hasImageOrDocument && hasAny(normalized, [
    /\bdesign ideas?\b/i,
    /\bdesign theme\b/i,
    /\bdesign concept\b/i,
    /\breference\b/i,
    /\bstyle\b/i
  ]));
  const hasDesignReferences = explicitDesignReferences || likelyDesignReference;
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
    hasFloorPlan ? (hasImageOrDocument && likelyFloorPlan ? "floor plan/image" : "floor plan") : "",
    hasSitePhotos ? "site photos" : "",
    hasAddressOrArea ? "address/area" : "",
    hasPreferredAppointmentTime ? "preferred appointment time" : "",
    hasDesignReferences ? "design references" : ""
  ].filter(Boolean);

  const knownContextSummary = receivedFields.length
    ? `Received: ${readableList(receivedFields)}.`
    : "No key project details received yet.";

  return {
    hasMedia,
    hasImageOrDocument,
    hasAudio,
    hasFloorPlan,
    likelyFloorPlan,
    hasSitePhotos,
    likelySitePhoto,
    hasScopeOfWork,
    hasPropertyType,
    hasAddressOrArea,
    hasPreferredAppointmentTime,
    hasDesignReferences,
    likelyDesignReference,
    hasPortfolioRequest,
    contextFromCurrentMessage: hasAny(normalizedCurrent, [
      /\bfloor plan\b/i,
      /\bfloorplan\b/i,
      /\blayout\b/i,
      /\bdrawing\b/i,
      /\bscope\b/i,
      /\blanded\b/i,
      /\bsite photos?\b/i,
      /\baddress\b/i,
      /\barea\b/i
    ]),
    contextFromPreviousMessages: hasAny(normalizedPrevious, [
      /\bfloor plan\b/i,
      /\bfloorplan\b/i,
      /\blayout\b/i,
      /\bdrawing\b/i,
      /\bcaption\b/i,
      /\bfilename\b/i,
      /\bmessagetype\s+(?:image|document)\b/i,
      /\bscope\b/i,
      /\blanded\b/i,
      /\bsite photos?\b/i,
      /\baddress\b/i,
      /\barea\b/i
    ]),
    knownScopeSummary,
    knownPropertyType,
    missingFields,
    receivedFields,
    knownContextSummary
  };
}

export function describeReceivedInfo(context: WhatsAppLeadContextMemory) {
  if (!context.receivedFields.length) return "";
  if (context.receivedFields.includes("floor plan/image")) {
    const remaining = context.receivedFields.filter((field) => field !== "floor plan/image");
    if (!remaining.length) return "Thanks, we've received the floor plan/image.";
    return `Thanks, we've received the floor plan/image and ${readableList(remaining)}.`;
  }
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
