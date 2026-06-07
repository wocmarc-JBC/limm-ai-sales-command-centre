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
  hasTimeline: boolean;
  hasBudgetExpectation: boolean;
  hasHouseholdInfo: boolean;
  hasSafetyAccessibilityNeeds: boolean;
  hasMustHaveNiceToHave: boolean;
  hasPortfolioRequest: boolean;
  contextFromCurrentMessage: boolean;
  contextFromPreviousMessages: boolean;
  knownScopeSummary: string;
  knownPropertyType: string;
  knownStoreys: string;
  knownAddressOrArea: string;
  knownTimeline: string;
  knownBudgetExpectation: string;
  alreadyToldYouDetected: boolean;
  budgetStatementDetected: boolean;
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
  if (/\blanded|terrace|semi d|semi detached|semi-detached|detached|bungalow|corner terrace|inter terrace\b/i.test(text)) return "landed";
  if (/\bcondo|apartment|mcst|condominium\b/i.test(text)) return "condo";
  if (/\bcommercial|office|shop|clinic|restaurant|retail\b/i.test(text)) return "commercial";
  return leadProperty;
}

function scopeFromText(text: string, lead: Lead) {
  if (lead.scopeSummary && lead.scopeSummary !== "New WhatsApp enquiry") return lead.scopeSummary;
  const scopeMatch = text.match(/\b(?:kitchen extension|full renovation|landed renovation|bathroom renovation|toilet renovation|carpentry|wardrobe|hacking works|commercial renovation|clinic renovation|a&a works?|a a works?|aa works?|addition and alteration|renovation|reno)\b/i);
  if (scopeMatch && /\ba\s*a works?|aa works?|a&a works?|addition and alteration/i.test(scopeMatch[0])) return "A&A works";
  return scopeMatch?.[0] ?? "";
}

function storeysFromText(text: string) {
  const match = text.match(/\b([1-9])\s*[- ]?\s*storey\b/i);
  if (!match) return "";
  return `${match[1]}-storey`;
}

function addressFromText(text: string, lead: Lead) {
  if (lead.projectAddress) return lead.projectAddress;
  if (lead.propertyArea) return lead.propertyArea;
  const roadMatch = text.match(/\b\d{1,4}[a-z]?\s+(?:[a-z]+\s+){0,4}(?:road|rd|street|st|avenue|ave|drive|dr|lane|ln|terrace|crescent|close|way|place|walk)\b/i);
  if (roadMatch) {
    return roadMatch[0]
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .replace(/\bRd\b/g, "Road")
      .replace(/\bSt\b/g, "Street")
      .replace(/\bAve\b/g, "Avenue")
      .replace(/\bDr\b/g, "Drive");
  }
  const postalMatch = text.match(/\b(?:singapore\s*)?\d{6}\b/i);
  return postalMatch?.[0]?.trim() ?? "";
}

function timelineFromText(text: string) {
  if (/\b(?:take|collect|key collection|getting).{0,24}\bkey\b.{0,24}\bnext month\b/i.test(text) || /\btake key next month\b/i.test(text)) {
    return "key collection next month";
  }
  if (/\bkey collection next month\b/i.test(text)) return "key collection next month";
  if (/\bmove[\s-]?in next month\b/i.test(text)) return "move-in next month";
  if (/\bstart next month\b/i.test(text)) return "start next month";
  const deadline = text.match(/\b(?:move[\s-]?in|start|key collection|take key|need to move in by)\s+(?:by\s+)?(?:next month|this month|[a-z]{3,9}\s+\d{1,2}|\d{1,2}\s+[a-z]{3,9})\b/i);
  return deadline?.[0]?.trim().replace(/\s+/g, " ") ?? "";
}

export function isBudgetStatementText(text: string) {
  return /\b(?:my\s+)?budget(?:\s+expectation)?(?:\s+is)?(?:\s+around|\s+about)?\s*(?:s\$|\$)?\s*\d+(?:\.\d+)?\s*(?:k|thousand|m|million)?\b/i.test(text) ||
    /\b(?:around|about)\s*(?:s\$|\$)?\s*\d+(?:\.\d+)?\s*(?:k|thousand|m|million)?\s+budget\b/i.test(text) ||
    /\bi have (?:around|about)?\s*(?:s\$|\$)?\s*\d+(?:\.\d+)?\s*(?:k|thousand|m|million)\b/i.test(text);
}

function budgetExpectationFromText(text: string) {
  const match =
    text.match(/\b(?:my\s+)?budget(?:\s+expectation)?(?:\s+is)?(?:\s+around|\s+about)?\s*(s\$|\$)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|m|million)?\b/i) ??
    text.match(/\b(?:around|about)\s*(s\$|\$)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|m|million)?\s+budget\b/i) ??
    text.match(/\bi have (?:around|about)?\s*(s\$|\$)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|m|million)\b/i);
  if (!match) return "";
  const amount = match[2];
  const suffix = (match[3] ?? "").toLowerCase();
  if (suffix === "m" || suffix === "million") return `around $${amount}m`;
  if (suffix === "k" || suffix === "thousand") return `around $${amount}k`;
  return `around $${amount}`;
}

function alreadyToldYou(text: string) {
  return /\b(i already told you|i said already|i already sent|i told you already|i already mentioned|already told you|already mentioned)\b/i.test(text);
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
  const knownStoreys = storeysFromText(relevantText);
  const knownAddressOrArea = addressFromText(relevantText, input.lead);
  const knownTimeline = timelineFromText(relevantText);
  const knownBudgetExpectation = budgetExpectationFromText(relevantText);
  const budgetStatementDetected = isBudgetStatementText(input.inboundText);
  const alreadyToldYouDetected = alreadyToldYou(input.inboundText);

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
  ]) || Boolean(knownAddressOrArea);
  const hasPreferredAppointmentTime = hasAny(normalized, [
    /\b(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?\b/i,
    /\b\d{1,2}\s*(?:am|pm)\b/i,
    /\btomorrow\b/i,
    /\bnext week\b/i,
    /\bappointment\b/i,
    /\bmeeting\b/i,
    /\bslot\b/i
  ]);
  const hasTimeline = Boolean(knownTimeline) || hasAny(normalized, [
    /\btimeline\b/i,
    /\bstart\b/i,
    /\bmove-in\b/i,
    /\bmove[\s-]?in\b/i,
    /\btake key\b/i,
    /\bkey collection\b/i,
    /\bdeadline\b/i,
    /\bbefore cny\b/i,
    /\bby (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i
  ]);
  const hasBudgetExpectation = Boolean(knownBudgetExpectation) || hasAny(normalized, [
    /\bbudget\b/i,
    /\bcomfort level\b/i,
    /\bspend\b/i,
    /\bplanning amount\b/i,
    /\bexpectation\b/i
  ]);
  const hasHouseholdInfo = hasAny(normalized, [
    /\bfamily\b/i,
    /\bcouple\b/i,
    /\bchildren\b/i,
    /\bkids?\b/i,
    /\belderly\b/i,
    /\bparents?\b/i,
    /\bhelper\b/i,
    /\bmaid\b/i,
    /\bpets?\b/i,
    /\bdog\b/i,
    /\bcat\b/i,
    /\boccupants?\b/i,
    /\bstaying\b/i
  ]);
  const hasSafetyAccessibilityNeeds = hasAny(normalized, [
    /\bsafety\b/i,
    /\baccessibility\b/i,
    /\belderly[-\s]?friendly\b/i,
    /\bchild safety\b/i,
    /\bwheelchair\b/i,
    /\bgrab bar\b/i,
    /\bslip\b/i,
    /\bstorage\b/i,
    /\bwork from home\b/i,
    /\bwfh\b/i,
    /\bhobby\b/i
  ]);
  const hasMustHaveNiceToHave = hasAny(normalized, [
    /\bmust[-\s]?have\b/i,
    /\bnice[-\s]?to[-\s]?have\b/i,
    /\bkeep existing\b/i,
    /\bretain\b/i,
    /\bpriority\b/i
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
    hasDesignReferences ? "design references" : "",
    hasTimeline ? "timeline" : "",
    hasBudgetExpectation ? "budget expectation" : "",
    hasHouseholdInfo ? "household/lifestyle" : "",
    hasSafetyAccessibilityNeeds ? "safety/accessibility needs" : ""
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
    hasTimeline,
    hasBudgetExpectation,
    hasHouseholdInfo,
    hasSafetyAccessibilityNeeds,
    hasMustHaveNiceToHave,
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
      /\barea\b/i,
      /\broad\b/i,
      /\btake key\b/i,
      /\bbudget\b/i
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
      /\barea\b/i,
      /\broad\b/i,
      /\btake key\b/i,
      /\bbudget\b/i
    ]),
    knownScopeSummary,
    knownPropertyType,
    knownStoreys,
    knownAddressOrArea,
    knownTimeline,
    knownBudgetExpectation,
    alreadyToldYouDetected,
    budgetStatementDetected,
    missingFields,
    receivedFields,
    knownContextSummary
  };
}

type KnownProjectInfoContext = Pick<
  WhatsAppLeadContextMemory,
  "knownPropertyType" | "knownStoreys" | "knownAddressOrArea" | "knownScopeSummary" | "knownTimeline" | "knownBudgetExpectation"
>;

export function describeKnownProjectInfo(context: KnownProjectInfoContext, prefix = "Thanks, noted.") {
  const property = context.knownPropertyType
    ? `${context.knownStoreys ? `${context.knownStoreys} ` : ""}${context.knownPropertyType} property`
    : "";
  const location = context.knownAddressOrArea ? `at ${context.knownAddressOrArea}` : "";
  const leadLine = [property, location].filter(Boolean).join(" ");
  const details = [
    context.knownScopeSummary ? `with ${context.knownScopeSummary}` : "",
    context.knownTimeline || "",
    context.knownBudgetExpectation ? `budget expectation ${context.knownBudgetExpectation}` : ""
  ].filter(Boolean);

  if (!leadLine && !details.length) return "";
  if (prefix.trim().endsWith(":")) {
    const noted = [leadLine, ...details].filter(Boolean);
    return `${prefix} ${readableList(noted)}.`;
  }
  const suffix = details.length ? `${leadLine ? ", " : ""}${readableList(details)}` : "";
  return `${prefix} ${leadLine ? `This is a ${leadLine}` : "We have noted"}${suffix}.`;
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
