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

export interface NormalizedWhatsAppLeadContext {
  property_type: string;
  storeys: string;
  property_area: string;
  postal_code: string;
  property_address: string;
  renovation_type: string;
  scope_summary: string;
  areas_involved: string[];
  floor_plan_received: boolean;
  site_photos_received: boolean;
  reference_images_received: boolean;
  budget_expectation: string;
  timeline: string;
  key_collection_date: string;
  move_in_date: string;
  design_direction: string;
  occupants_summary: string;
  children_present: boolean;
  elderly_present: boolean;
  helper_present: boolean;
  pets_present: boolean;
  lifestyle_needs: string[];
  safety_accessibility_needs: string[];
  preferred_meeting_time: string;
  appointment_requested: boolean;
  known_facts_summary: string;
  missing_fields: string[];
  last_bot_asked_fields: string[];
  repeated_question_risk: boolean;
  memory: WhatsAppLeadContextMemory;
}

export const OFFICIAL_LIMM_INSTAGRAM_URL = "https://www.instagram.com/limmworks/";
const INTERNAL_PLACEHOLDER_PATTERNS = [
  /\bwhatsapp renovation enquiry pending review\b/i,
  /\brenovation enquiry pending review\b/i,
  /\bpending review\b/i,
  /\bnew whatsapp enquiry\b/i,
  /\bunknown\b/i,
  /\bnot provided\b/i
];

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function isInternalClientFacingPlaceholder(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return true;
  return INTERNAL_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function cleanClientFacingText(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  if (isInternalClientFacingPlaceholder(trimmed)) return "";
  return trimmed;
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
  const leadProperty = cleanClientFacingText(lead.propertyType);
  if (/\blanded|terrace|semi d|semi detached|semi-detached|detached|bungalow|corner terrace|inter terrace\b/i.test(text)) return "landed";
  if (/\bcondo|apartment|mcst|condominium\b/i.test(text)) return "condo";
  if (/\bhdb\b/i.test(text)) return "HDB";
  if (/\bcommercial|office|shop|clinic|restaurant|retail\b/i.test(text)) return "commercial";
  return leadProperty;
}

function scopeFromText(text: string, lead: Lead) {
  const scopeMatch = text.match(/\b(?:kitchen extension|full renovation|landed renovation|bathroom renovation|toilet renovation|carpentry|wardrobe|hacking works|commercial renovation|clinic renovation|a&a works?|a a works?|aa works?|addition and alteration|renovation|reno)\b/i);
  if (scopeMatch && /\ba\s*a works?|aa works?|a&a works?|addition and alteration/i.test(scopeMatch[0])) return "A&A works";
  if (scopeMatch) return scopeMatch[0];
  return cleanClientFacingText(lead.scopeSummary);
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
    cleanClientFacingText(input.lead.scopeSummary),
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

function postalCodeFromText(text: string, lead: Lead) {
  if (lead.postalCode) return lead.postalCode;
  const match = text.match(/\bS?(\d{6})\b/i);
  return match?.[1] ?? "";
}

function areasInvolvedFromText(text: string) {
  const areas = [
    /\bkitchen\b/i.test(text) ? "kitchen" : "",
    /\bbathroom|toilet|wc\b/i.test(text) ? "bathroom" : "",
    /\bcarpentry|wardrobe|cabinet\b/i.test(text) ? "carpentry" : "",
    /\bhacking|wall\b/i.test(text) ? "hacking/wall review" : "",
    /\bwhole house|full house|full renovation\b/i.test(text) ? "full house" : "",
    /\broof|waterproofing|drainage\b/i.test(text) ? "roof/waterproofing/drainage" : "",
    /\bextension|extend\b/i.test(text) ? "extension" : ""
  ].filter(Boolean);
  return [...new Set(areas)];
}

function designDirectionFromText(text: string) {
  const matches = [
    /\bmodern luxury\b/i.test(text) ? "modern luxury" : "",
    /\bjapandi\b/i.test(text) ? "Japandi" : "",
    /\bminimalist\b/i.test(text) ? "minimalist" : "",
    /\bcontemporary\b/i.test(text) ? "contemporary" : "",
    /\bdesign theme|design concept|design direction\b/i.test(text) ? "design direction requested" : ""
  ].filter(Boolean);
  return matches[0] ?? "";
}

function occupantsSummaryFromText(text: string) {
  const items = [
    /\bcouple\b/i.test(text) ? "couple" : "",
    /\bfamily\b/i.test(text) ? "family" : "",
    /\bchildren|kids?\b/i.test(text) ? "children" : "",
    /\belderly|parents?\b/i.test(text) ? "elderly family members" : "",
    /\bhelper|maid\b/i.test(text) ? "helper" : "",
    /\bpets?|dog|cat\b/i.test(text) ? "pets" : ""
  ].filter(Boolean);
  return readableList([...new Set(items)]);
}

function lifestyleNeedsFromText(text: string) {
  return [
    /\bcook(?:ing)? often|heavy cooking\b/i.test(text) ? "cooking often" : "",
    /\bhosting|entertain(?:ing)? guests\b/i.test(text) ? "hosting" : "",
    /\bwork from home|wfh\b/i.test(text) ? "work from home" : "",
    /\bstorage\b/i.test(text) ? "storage" : "",
    /\bhobby room|hobby\b/i.test(text) ? "hobby room" : "",
    /\beasy maintenance|low maintenance\b/i.test(text) ? "easy maintenance" : ""
  ].filter(Boolean);
}

function safetyNeedsFromText(text: string) {
  return [
    /\bchild friendly|child[-\s]?safe|children safety\b/i.test(text) ? "child friendly" : "",
    /\belderly friendly|elderly[-\s]?safe\b/i.test(text) ? "elderly friendly" : "",
    /\bwheelchair|accessibility\b/i.test(text) ? "accessibility" : "",
    /\bgrab bar|slip\b/i.test(text) ? "fall-prevention/safety" : ""
  ].filter(Boolean);
}

function preferredMeetingTimeFromText(text: string) {
  const lower = text.toLowerCase();
  const day = lower.match(/\b(mon|monday|tue|tuesday|wed|wednesday|thu|thursday|fri|friday|sat|saturday|sun|sunday)\b/i)?.[0];
  const time = lower.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i)?.[0];
  if (day && time) return `${day.replace(/^\w/, (char) => char.toUpperCase())} ${time.toUpperCase().replace(/\s+/g, "")}`;
  if (day) return day.replace(/^\w/, (char) => char.toUpperCase());
  if (/\btomorrow\b/i.test(text)) return time ? `tomorrow ${time.toUpperCase().replace(/\s+/g, "")}` : "tomorrow";
  return time ? time.toUpperCase().replace(/\s+/g, "") : "";
}

function lastBotAskedFields(messages: LeadMessage[]) {
  const recent = messages
    .filter((message) => message.direction === "outbound" && message.channel === "whatsapp")
    .slice(0, 3)
    .map((message) => normalise(message.body))
    .join(" ");
  return [
    /\bfloor plan|drawings?|layout\b/i.test(recent) ? "floor_plan" : "",
    /\bsite photos?|photos?|images?\b/i.test(recent) ? "site_photos" : "",
    /\bscope|areas involved|main areas\b/i.test(recent) ? "scope" : "",
    /\bproperty type|landed|condo|commercial|hdb\b/i.test(recent) ? "property_type" : "",
    /\baddress|area|postal\b/i.test(recent) ? "address_or_area" : "",
    /\btimeline|move in|key collection|start date\b/i.test(recent) ? "timeline" : "",
    /\bdesign references?|design direction|style\b/i.test(recent) ? "design_references" : "",
    /\bbudget expectation|budget\b/i.test(recent) ? "budget_expectation" : ""
  ].filter(Boolean);
}

export function isShortPingText(text: string) {
  return /^\s*(ok\??|okay\??|hello\??|hi\??|yes\??|noted\??|\?)\s*$/i.test(text) ||
    /\b(are you there|you there|can reply|any update)\b/i.test(text.trim()) && text.trim().length <= 40;
}

export function isConfusionPingText(text: string) {
  return /^\s*(\?{1,4}|huh\??|what do you mean\??|unclear\??)\s*$/i.test(text);
}

function normalizeMissingFields(memory: WhatsAppLeadContextMemory) {
  return [
    !memory.hasPropertyType ? "property_type" : "",
    !memory.hasScopeOfWork ? "scope" : "",
    !memory.hasFloorPlan ? "floor_plan" : "",
    !memory.hasSitePhotos ? "site_photos" : "",
    !memory.hasAddressOrArea ? "address_or_area" : "",
    !memory.hasDesignReferences ? "design_references" : "",
    !memory.hasTimeline ? "timeline" : ""
  ].filter(Boolean);
}

function knownFactsSummary(context: Omit<NormalizedWhatsAppLeadContext, "known_facts_summary" | "memory">) {
  const property = context.property_type
    ? `${context.storeys ? `${context.storeys} ` : ""}${context.property_type} property`
    : "";
  const location = context.property_address || context.property_area || context.postal_code;
  const leadLine = property && location ? `${property} at ${location}` : property ? property : location;
  const facts = [
    cleanClientFacingText(context.scope_summary) ? `with ${cleanClientFacingText(context.scope_summary)}` : "",
    context.timeline || context.key_collection_date || context.move_in_date,
    context.budget_expectation ? `budget expectation ${context.budget_expectation}` : "",
    context.design_direction ? `design direction: ${context.design_direction}` : "",
    context.occupants_summary ? `household: ${context.occupants_summary}` : ""
  ].filter(Boolean);
  if (!leadLine) return readableList(facts);
  if (!facts.length) return leadLine;
  return `${leadLine}, ${readableList(facts)}`;
}

export function buildNormalizedWhatsAppLeadContext(input: {
  lead: Lead;
  previousMessages: LeadMessage[];
  inboundText: string;
}): NormalizedWhatsAppLeadContext {
  const memory = inferWhatsAppLeadContext(input);
  const previousText = inboundTexts(input.previousMessages).join(" ");
  const allText = [
    input.lead.propertyType,
    cleanClientFacingText(input.lead.scopeSummary),
    input.lead.projectAddress,
    input.lead.propertyArea,
    input.lead.postalCode,
    input.lead.intakeProfile?.lifestyleNotes,
    input.lead.intakeProfile?.occupants,
    input.lead.intakeProfile?.helper,
    input.lead.intakeProfile?.pets,
    input.lead.intakeProfile?.safetyNeeds,
    input.lead.intakeProfile?.budgetExpectation,
    input.lead.intakeProfile?.timeline,
    input.lead.intakeProfile?.keyCollectionDate,
    input.lead.intakeProfile?.moveInDate,
    input.lead.intakeProfile?.preferredMeetingTiming,
    input.inboundText,
    previousText
  ].filter(Boolean).join(" ");
  const normalized = normalise(allText);
  const propertyAddress = input.lead.projectAddress || (memory.knownAddressOrArea && /\b(?:road|street|avenue|drive|lane|terrace|crescent|close|way|place|walk)\b/i.test(memory.knownAddressOrArea) ? memory.knownAddressOrArea : "");
  const propertyArea = input.lead.propertyArea || (!propertyAddress ? memory.knownAddressOrArea : "");
  const postalCode = postalCodeFromText(allText, input.lead);
  const preferredMeetingTime = input.lead.intakeProfile?.preferredMeetingTiming || preferredMeetingTimeFromText(allText);
  const appointmentRequested = Boolean(preferredMeetingTime) || /\b(appt|appointment|meeting|meet|site visit|slot|come down|available)\b/i.test(normalized);
  const timeline = input.lead.intakeProfile?.timeline || memory.knownTimeline;
  const keyCollectionDate = input.lead.intakeProfile?.keyCollectionDate || (/\bkey collection|take key\b/i.test(timeline) ? timeline : "");
  const moveInDate = input.lead.intakeProfile?.moveInDate || (/\bmove[\s-]?in\b/i.test(timeline) ? timeline : "");
  const contextWithoutSummary = {
    property_type: memory.knownPropertyType || input.lead.intakeProfile?.propertyType || "",
    storeys: memory.knownStoreys,
    property_area: propertyArea,
    postal_code: postalCode,
    property_address: propertyAddress,
    renovation_type: cleanClientFacingText(memory.knownScopeSummary) || cleanClientFacingText(input.lead.intakeProfile?.scopeOfWork) || "",
    scope_summary: cleanClientFacingText(memory.knownScopeSummary) || cleanClientFacingText(input.lead.intakeProfile?.scopeOfWork) || "",
    areas_involved: areasInvolvedFromText(allText),
    floor_plan_received: memory.hasFloorPlan || /\bfloor plan status received\b/i.test(normalized),
    site_photos_received: memory.hasSitePhotos || /\bsite photos status received\b/i.test(normalized),
    reference_images_received: memory.hasDesignReferences,
    budget_expectation: input.lead.intakeProfile?.budgetExpectation || memory.knownBudgetExpectation,
    timeline,
    key_collection_date: keyCollectionDate,
    move_in_date: moveInDate,
    design_direction: designDirectionFromText(allText),
    occupants_summary: input.lead.intakeProfile?.occupants || occupantsSummaryFromText(allText),
    children_present: /\bchildren|kids?\b/i.test(normalized),
    elderly_present: /\belderly|parents?\b/i.test(normalized),
    helper_present: /\bhelper|maid\b/i.test(normalized),
    pets_present: /\bpets?|dog|cat\b/i.test(normalized),
    lifestyle_needs: lifestyleNeedsFromText(allText),
    safety_accessibility_needs: safetyNeedsFromText(allText),
    preferred_meeting_time: preferredMeetingTime,
    appointment_requested: appointmentRequested,
    missing_fields: normalizeMissingFields(memory),
    last_bot_asked_fields: lastBotAskedFields(input.previousMessages),
    repeated_question_risk: false
  };
  const repeatedQuestionRisk = isShortPingText(input.inboundText) && contextWithoutSummary.last_bot_asked_fields.length > 0;
  const context = {
    ...contextWithoutSummary,
    repeated_question_risk: repeatedQuestionRisk,
    known_facts_summary: "",
    memory
  };
  return {
    ...context,
    known_facts_summary: knownFactsSummary(context)
  };
}

export function buildClientFacingKnownSummary(context: NormalizedWhatsAppLeadContext) {
  return knownFactsSummary({
    ...context,
    renovation_type: cleanClientFacingText(context.renovation_type),
    scope_summary: cleanClientFacingText(context.scope_summary)
  });
}
