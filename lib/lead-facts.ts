import type { Lead, LeadFile, LeadIntakeProfile, LeadMessage } from "@/lib/types";

export type LeadFactConfidence = "none" | "low" | "medium" | "high" | "verified";
export type LeadFactsLocationStatus = "full_address_captured" | "postal_only" | "area_only" | "missing_location" | "conflict";

export type LeadFactValue<T> = {
  value: T;
  confidence: LeadFactConfidence;
  sourceMessageId?: string;
  sourceMessageAt?: string;
  verifiedByMarcus?: boolean;
};

export type LeadFacts = {
  leadId: string;
  clientName: string;
  phone: string;
  propertyType: LeadFactValue<string>;
  addressRaw: LeadFactValue<string>;
  postalCode: LeadFactValue<string>;
  area: LeadFactValue<string>;
  scopeSummary: LeadFactValue<string>;
  floorPlanReceived: LeadFactValue<boolean>;
  sitePhotosReceived: LeadFactValue<boolean>;
  referenceImagesReceived: LeadFactValue<boolean>;
  appointmentPreference: LeadFactValue<string>;
  budgetExpectation: LeadFactValue<string>;
  nextAction: string;
  nextActionReason: string;
  locationStatus: LeadFactsLocationStatus;
  infoCompletenessScore: number;
  missingFields: string[];
  conflictFields: string[];
  updatedAt: string;
};

type LeadFactPatch = {
  propertyType?: string;
  projectAddress?: string;
  postalCode?: string;
  propertyArea?: string;
  scopeSummary?: string;
  preferredContactTime?: string;
  missingInfo?: string[];
  quotationReadiness?: number;
  aiRecommendedNextAction?: string;
  intakeProfile?: LeadIntakeProfile;
};

type ExtractSource = {
  sourceMessageId?: string;
  sourceMessageAt?: string;
  messageType?: string;
  filename?: string;
  mimeType?: string;
};

const confidenceRank: Record<LeadFactConfidence, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  verified: 4
};

const GENERIC_PENDING_PHRASES = [
  "whatsapp renovation enquiry pending review",
  "ask for scope, floor plan",
  "pending review"
];

const AREA_NAMES = [
  "Orchard",
  "Dhoby Ghaut",
  "River Valley",
  "Bukit Timah",
  "Serangoon",
  "Serangoon Gardens",
  "Tampines",
  "East Coast",
  "Jurong",
  "Woodlands",
  "CBD",
  "Marina Bay",
  "Queenstown",
  "Toa Payoh",
  "Novena",
  "Katong",
  "Siglap",
  "Bedok",
  "Hougang",
  "Yishun",
  "Clementi",
  "Punggol",
  "Sengkang",
  "Bishan",
  "Ang Mo Kio",
  "Kovan",
  "Ubi",
  "Geylang",
  "Marine Parade",
  "Sentosa",
  "Holland",
  "Dover",
  "Pasir Ris",
  "Changi"
];

function emptyFact<T>(value: T): LeadFactValue<T> {
  return { value, confidence: "none" };
}

function fact<T>(value: T, confidence: LeadFactConfidence, source?: ExtractSource): LeadFactValue<T> {
  return {
    value,
    confidence,
    sourceMessageId: source?.sourceMessageId,
    sourceMessageAt: source?.sourceMessageAt
  };
}

function textHasValue(value?: string | null) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 && !GENERIC_PENDING_PHRASES.some((phrase) => normalized.toLowerCase().includes(phrase));
}

function normalizeText(text: string) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function normalizePostal(value: string) {
  const match = value.match(/\b(\d{6})\b/);
  return match?.[1] ?? "";
}

function normalizeMessageText(message: LeadMessage) {
  const parts = [message.body];
  const metadata = message.metadata ?? {};
  for (const key of ["caption", "filename", "mimeType", "messageType"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) parts.push(value);
  }
  return normalizeText(parts.join(" "));
}

function isDifferent(a: unknown, b: unknown) {
  return String(a ?? "").trim().toLowerCase() !== String(b ?? "").trim().toLowerCase();
}

function mergeFact<T>(current: LeadFactValue<T>, incoming: LeadFactValue<T>, field: string, conflicts: Set<string>): LeadFactValue<T> {
  if (incoming.confidence === "none") return current;
  if (current.verifiedByMarcus || current.confidence === "verified") {
    if (isDifferent(current.value, incoming.value)) conflicts.add(field);
    return current;
  }
  if (current.confidence === "none") return incoming;
  if (confidenceRank[incoming.confidence] > confidenceRank[current.confidence]) return incoming;
  if (confidenceRank[incoming.confidence] === confidenceRank[current.confidence] && !isDifferent(current.value, incoming.value)) {
    return current;
  }
  if (isDifferent(current.value, incoming.value)) conflicts.add(field);
  return current;
}

function mergeBooleanFact(current: LeadFactValue<boolean>, incoming: LeadFactValue<boolean>, field: string, conflicts: Set<string>) {
  if (!incoming.value) return current;
  return mergeFact(current, incoming, field, conflicts);
}

function detectPropertyType(text: string, source?: ExtractSource): LeadFactValue<string> {
  const lower = text.toLowerCase();
  if (/\b(landed|terrace|inter[-\s]?terrace|semi[-\s]?d|detached|bungalow|a&a|addition|alteration)\b/.test(lower)) return fact("landed", "high", source);
  if (/\b(condo|condominium|apartment)\b/.test(lower)) return fact("condo", "high", source);
  if (/\b(hdb|bto|resale flat)\b/.test(lower)) return fact("hdb", "high", source);
  if (/\b(commercial|office|shop|retail|restaurant|cafe|warehouse)\b/.test(lower)) return fact("commercial", "high", source);
  return emptyFact("");
}

function detectArea(text: string, source?: ExtractSource): LeadFactValue<string> {
  for (const area of AREA_NAMES) {
    const escaped = area.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) return fact(area, "medium", source);
  }
  return emptyFact("");
}

function detectAddress(text: string, source?: ExtractSource): LeadFactValue<string> {
  const cleaned = normalizeText(text);
  const patterns = [
    /\b(?:address|place|site|unit|house)\s*(?:is|at|:)?\s*([^.!?\n]*(?:road|rd|street|st|avenue|ave|drive|dr|lane|ln|terrace|crescent|close|walk|way|lorong|jalan|place|pl|view|rise|heights|gardens|cres)[^.!?\n]*)/i,
    /\b(?:at|near)\s+([^.!?\n]*(?:road|rd|street|st|avenue|ave|drive|dr|lane|ln|terrace|crescent|close|walk|way|lorong|jalan|place|pl|view|rise|heights|gardens|cres)[^.!?\n]*)/i,
    /\b(\d{1,4}[A-Za-z]?\s+[^.!?\n]*(?:road|rd|street|st|avenue|ave|drive|dr|lane|ln|terrace|crescent|close|walk|way|lorong|jalan|place|pl|view|rise|heights|gardens|cres)[^.!?\n]*)/i
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    const value = normalizeText(match?.[1] ?? "");
    if (value.length >= 6) return fact(value, "high", source);
  }
  return emptyFact("");
}

function detectPostal(text: string, source?: ExtractSource): LeadFactValue<string> {
  const postal = normalizePostal(text);
  return postal ? fact(postal, "high", source) : emptyFact("");
}

function detectScope(text: string, source?: ExtractSource): LeadFactValue<string> {
  const lower = text.toLowerCase();
  const scopes: string[] = [];
  const pairs: Array<[RegExp, string]> = [
    [/\ba&a|addition|alteration|extension|extend\b/i, "landed A&A / extension"],
    [/\bfull (?:house|home|landed|condo)?\s*renovation|renovate (?:my )?(?:landed|house|condo|home)\b/i, "renovation"],
    [/\bkitchen|wet kitchen|dry kitchen\b/i, "kitchen"],
    [/\bbathroom|toilet\b/i, "bathroom"],
    [/\bcarpentry|wardrobe|cabinet|cabinetry\b/i, "carpentry"],
    [/\bhack|hacking|demolish|wall\b/i, "hacking / wall works"],
    [/\broof|roofline|waterproof|leak|drainage\b/i, "roof / waterproofing / drainage"],
    [/\bflooring|tiles|tiling|vinyl|marble\b/i, "flooring"],
    [/\belectrical|lighting|rewiring\b/i, "electrical / lighting"],
    [/\bdesign|theme|concept|layout\b/i, "design direction"]
  ];
  for (const [pattern, label] of pairs) {
    if (pattern.test(lower) && !scopes.includes(label)) scopes.push(label);
  }
  if (!scopes.length) return emptyFact("");
  return fact(scopes.slice(0, 5).join(", "), scopes.length >= 2 ? "high" : "medium", source);
}

function detectFileFacts(text: string, source?: ExtractSource) {
  const lower = text.toLowerCase();
  const filename = String(source?.filename ?? "").toLowerCase();
  const messageType = String(source?.messageType ?? "").toLowerCase();
  const mimeType = String(source?.mimeType ?? "").toLowerCase();
  const evidenceText = [lower, filename, mimeType].join(" ");
  const documentOrImage = messageType === "image" || messageType === "document" || mimeType.startsWith("image/") || /pdf|document/.test(mimeType);
  const floorPlan = /\bfloor\s*plan|floorplan|layout|drawing|plan\b/.test(evidenceText) || (documentOrImage && /\bdesign|layout|drawing|renovat|a&a|landed|plan\b/.test(evidenceText));
  const photo = /\bsite photo|photo|photos|image|picture|pic\b/.test(evidenceText) || (messageType === "image" && !floorPlan);
  const reference = /\breference|design ideas|design theme|moodboard|inspiration|concept\b/.test(evidenceText);
  return {
    floorPlanReceived: fact(Boolean(floorPlan), floorPlan ? "high" : "none", source),
    sitePhotosReceived: fact(Boolean(photo), photo ? "medium" : "none", source),
    referenceImagesReceived: fact(Boolean(reference), reference ? "medium" : "none", source)
  };
}

function detectAppointment(text: string, source?: ExtractSource): LeadFactValue<string> {
  const lower = text.toLowerCase();
  if (!/\b(appt|appointment|meet|meeting|site visit|come down|come over|available|slot|wed|wednesday|tomorrow|weekend|saturday|sunday|monday|tuesday|thursday|friday|\d{1,2}\s*(?:am|pm))\b/.test(lower)) {
    return emptyFact("");
  }
  const time = text.match(/\b(?:mon|monday|tue|tuesday|wed|wednesday|thu|thursday|fri|friday|sat|saturday|sun|sunday|tomorrow|this weekend|next week)[^.!?\n]{0,30}(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i)?.[0];
  return fact(normalizeText(time || "Client asked about appointment / availability"), "medium", source);
}

function detectBudget(text: string, source?: ExtractSource): LeadFactValue<string> {
  if (!/\b(how much|rough|roughly|budget|price|cost|quote|quotation|estimate)\b/i.test(text)) return emptyFact("");
  return fact("Client asked for budget / quotation guidance. No price should be generated before review.", "medium", source);
}

export function extractLeadFactsFromText(text: string, source?: ExtractSource): Partial<LeadFacts> {
  const normalized = normalizeText(text);
  const files = detectFileFacts(normalized, source);
  return {
    propertyType: detectPropertyType(normalized, source),
    addressRaw: detectAddress(normalized, source),
    postalCode: detectPostal(normalized, source),
    area: detectArea(normalized, source),
    scopeSummary: detectScope(normalized, source),
    floorPlanReceived: files.floorPlanReceived,
    sitePhotosReceived: files.sitePhotosReceived,
    referenceImagesReceived: files.referenceImagesReceived,
    appointmentPreference: detectAppointment(normalized, source),
    budgetExpectation: detectBudget(normalized, source)
  };
}

function intakeTraceFacts(lead: Lead): Partial<LeadFacts> | null {
  const trace = lead.intakeProfile?.trace;
  const existing = trace?.leadFacts;
  return existing && typeof existing === "object" ? existing as Partial<LeadFacts> : null;
}

function seedFactsFromLead(lead: Lead): LeadFacts {
  const existing = intakeTraceFacts(lead);
  const floorPlanStatus = lead.intakeProfile?.floorPlanStatus || "";
  const sitePhotosStatus = lead.intakeProfile?.sitePhotosStatus || "";
  const referenceStatus = String((lead.intakeProfile?.trace?.referenceImagesStatus ?? "") as string);
  const now = new Date().toISOString();
  return {
    leadId: lead.id,
    clientName: lead.clientName,
    phone: lead.phone,
    propertyType: textHasValue(lead.propertyType) ? fact(lead.propertyType, "medium") : emptyFact(""),
    addressRaw: textHasValue(lead.projectAddress) ? fact(lead.projectAddress ?? "", "high") : emptyFact(""),
    postalCode: textHasValue(lead.postalCode) ? fact(lead.postalCode ?? "", "high") : emptyFact(""),
    area: textHasValue(lead.propertyArea) ? fact(lead.propertyArea ?? "", "medium") : emptyFact(""),
    scopeSummary: textHasValue(lead.scopeSummary) ? fact(lead.scopeSummary, "medium") : emptyFact(""),
    floorPlanReceived: fact(/received|available|yes/i.test(floorPlanStatus), /received|available|yes/i.test(floorPlanStatus) ? "medium" : "none"),
    sitePhotosReceived: fact(/received|available|yes/i.test(sitePhotosStatus), /received|available|yes/i.test(sitePhotosStatus) ? "medium" : "none"),
    referenceImagesReceived: fact(/received|available|yes/i.test(referenceStatus), /received|available|yes/i.test(referenceStatus) ? "medium" : "none"),
    appointmentPreference: textHasValue(lead.preferredContactTime || lead.intakeProfile?.preferredMeetingTiming)
      ? fact(lead.preferredContactTime || lead.intakeProfile?.preferredMeetingTiming || "", "medium")
      : emptyFact(""),
    budgetExpectation: textHasValue(lead.intakeProfile?.budgetExpectation)
      ? fact(lead.intakeProfile?.budgetExpectation ?? "", "medium")
      : emptyFact(""),
    nextAction: lead.aiRecommendedNextAction || "Collect missing renovation details for review.",
    nextActionReason: "Using existing lead fields until stronger message evidence is captured.",
    locationStatus: "missing_location",
    infoCompletenessScore: lead.quotationReadiness ?? 0,
    missingFields: lead.missingInfo ?? [],
    conflictFields: Array.isArray(existing?.conflictFields) ? existing?.conflictFields as string[] : [],
    updatedAt: String(existing?.updatedAt || lead.updatedAt || now)
  };
}

function applyExtractedFacts(base: LeadFacts, extracted: Partial<LeadFacts>) {
  const conflicts = new Set(base.conflictFields);
  base.propertyType = mergeFact(base.propertyType, extracted.propertyType ?? emptyFact(""), "property_type", conflicts);
  base.addressRaw = mergeFact(base.addressRaw, extracted.addressRaw ?? emptyFact(""), "address", conflicts);
  base.postalCode = mergeFact(base.postalCode, extracted.postalCode ?? emptyFact(""), "postal_code", conflicts);
  base.area = mergeFact(base.area, extracted.area ?? emptyFact(""), "area", conflicts);
  base.scopeSummary = mergeFact(base.scopeSummary, extracted.scopeSummary ?? emptyFact(""), "scope", conflicts);
  base.appointmentPreference = mergeFact(base.appointmentPreference, extracted.appointmentPreference ?? emptyFact(""), "appointment_preference", conflicts);
  base.budgetExpectation = mergeFact(base.budgetExpectation, extracted.budgetExpectation ?? emptyFact(""), "budget_expectation", conflicts);
  base.floorPlanReceived = mergeBooleanFact(base.floorPlanReceived, extracted.floorPlanReceived ?? emptyFact(false), "floor_plan", conflicts);
  base.sitePhotosReceived = mergeBooleanFact(base.sitePhotosReceived, extracted.sitePhotosReceived ?? emptyFact(false), "site_photos", conflicts);
  base.referenceImagesReceived = mergeBooleanFact(base.referenceImagesReceived, extracted.referenceImagesReceived ?? emptyFact(false), "reference_images", conflicts);
  base.conflictFields = [...conflicts];
}

function fileFacts(files: LeadFile[]) {
  const floorPlan = files.some((file) => file.fileStatus !== "voided" && file.fileCategory === "floor_plan");
  const sitePhotos = files.some((file) => file.fileStatus !== "voided" && file.fileCategory === "site_photos");
  const referenceImages = files.some((file) => file.fileStatus !== "voided" && file.fileCategory === "reference_images");
  return {
    floorPlanReceived: fact(floorPlan, floorPlan ? "high" : "none"),
    sitePhotosReceived: fact(sitePhotos, sitePhotos ? "high" : "none"),
    referenceImagesReceived: fact(referenceImages, referenceImages ? "high" : "none")
  };
}

export function buildLeadFacts(lead: Lead, messages: LeadMessage[] = [], files: LeadFile[] = []): LeadFacts {
  const facts = seedFactsFromLead(lead);
  const sortedMessages = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const message of sortedMessages) {
    if (message.channel !== "whatsapp" || message.direction === "internal") continue;
    const metadata = message.metadata ?? {};
    applyExtractedFacts(facts, extractLeadFactsFromText(normalizeMessageText(message), {
      sourceMessageId: message.id,
      sourceMessageAt: message.createdAt,
      messageType: typeof metadata.messageType === "string" ? metadata.messageType : undefined,
      filename: typeof metadata.filename === "string" ? metadata.filename : undefined,
      mimeType: typeof metadata.mimeType === "string" ? metadata.mimeType : undefined
    }));
  }
  applyExtractedFacts(facts, fileFacts(files));
  const completed = {
    property: textHasValue(facts.propertyType.value),
    scope: textHasValue(facts.scopeSummary.value),
    location: textHasValue(facts.addressRaw.value) || textHasValue(facts.postalCode.value) || textHasValue(facts.area.value),
    address: textHasValue(facts.addressRaw.value) || textHasValue(facts.postalCode.value),
    files: facts.floorPlanReceived.value || facts.sitePhotosReceived.value,
    appointment: textHasValue(facts.appointmentPreference.value)
  };
  const missing: string[] = [];
  if (!completed.property) missing.push("property_type");
  if (!completed.scope) missing.push("scope");
  if (!completed.location) missing.push("address_or_area");
  if (!facts.floorPlanReceived.value) missing.push("floor_plan");
  if (!facts.sitePhotosReceived.value) missing.push("site_photos");
  if (!textHasValue(facts.appointmentPreference.value)) missing.push("preferred_timing");
  facts.missingFields = missing;
  facts.infoCompletenessScore = Math.min(
    100,
    (completed.property ? 20 : 0) +
      (completed.scope ? 25 : 0) +
      (completed.location ? 15 : 0) +
      (completed.address ? 20 : 0) +
      (completed.files ? 15 : 0) +
      (completed.appointment ? 5 : 0)
  );
  facts.locationStatus = facts.conflictFields.some((field) => ["address", "postal_code", "area"].includes(field))
    ? "conflict"
    : textHasValue(facts.addressRaw.value) && textHasValue(facts.postalCode.value)
      ? "full_address_captured"
      : textHasValue(facts.postalCode.value)
        ? "postal_only"
        : textHasValue(facts.area.value)
          ? "area_only"
          : "missing_location";
  const next = getLeadFactsNextAction(facts);
  facts.nextAction = next.action;
  facts.nextActionReason = next.reason;
  facts.updatedAt = new Date().toISOString();
  return facts;
}

export function getLeadFactsNextAction(facts: LeadFacts) {
  if (facts.conflictFields.length) {
    return {
      action: "Marcus to review conflicting lead facts.",
      reason: `Conflicting fields detected: ${facts.conflictFields.join(", ")}.`
    };
  }
  if (!facts.propertyType.value) {
    return { action: "Ask client for property type.", reason: "Property type is still missing." };
  }
  if (!facts.scopeSummary.value) {
    return { action: "Ask for the renovation scope.", reason: "Scope is needed before advising the next step." };
  }
  if (!facts.floorPlanReceived.value && !facts.sitePhotosReceived.value) {
    return { action: "Request floor plan or site photos.", reason: "Drawings/photos are needed for a useful initial project review." };
  }
  if (!facts.sitePhotosReceived.value) {
    return { action: "Ask for site photos if available.", reason: "Site condition is still missing from the lead facts." };
  }
  if (facts.locationStatus === "missing_location") {
    return { action: "Ask for property area or postal code.", reason: "Mission Map and visit planning need at least area-level location." };
  }
  if (!facts.appointmentPreference.value) {
    return { action: "Ask for preferred review timing.", reason: "Core details are mostly ready; timing can help Marcus plan follow-up." };
  }
  return {
    action: "Marcus to review lead facts for initial project review.",
    reason: `Lead facts are ${facts.infoCompletenessScore}% complete.`
  };
}

export function leadFactsToIntakeProfile(lead: Lead, facts: LeadFacts): LeadIntakeProfile {
  return {
    ...(lead.intakeProfile ?? {}),
    propertyType: facts.propertyType.value || lead.intakeProfile?.propertyType,
    propertyAreaOrAddress: facts.addressRaw.value || facts.postalCode.value || facts.area.value || lead.intakeProfile?.propertyAreaOrAddress,
    scopeOfWork: facts.scopeSummary.value || lead.intakeProfile?.scopeOfWork,
    floorPlanStatus: facts.floorPlanReceived.value ? "Received" : lead.intakeProfile?.floorPlanStatus,
    sitePhotosStatus: facts.sitePhotosReceived.value ? "Received" : lead.intakeProfile?.sitePhotosStatus,
    preferredMeetingTiming: facts.appointmentPreference.value || lead.intakeProfile?.preferredMeetingTiming,
    budgetExpectation: facts.budgetExpectation.value || lead.intakeProfile?.budgetExpectation,
    meetingReadinessScore: facts.infoCompletenessScore,
    proposalReadinessScore: facts.infoCompletenessScore,
    missingInfo: facts.missingFields,
    updatedAt: facts.updatedAt,
    updatedBy: "lead_facts_extractor",
    trace: {
      ...(lead.intakeProfile?.trace ?? {}),
      leadFacts: facts,
      leadFactsVersion: "phase_2_truth_layer",
      leadFactsLastUpdatedAt: facts.updatedAt
    }
  };
}

export function leadFactsToLeadPatch(lead: Lead, facts: LeadFacts): LeadFactPatch {
  const patch: LeadFactPatch = {
    missingInfo: facts.missingFields,
    quotationReadiness: facts.infoCompletenessScore,
    aiRecommendedNextAction: facts.nextAction,
    intakeProfile: leadFactsToIntakeProfile(lead, facts)
  };
  if (facts.propertyType.value && isDifferent(lead.propertyType, facts.propertyType.value)) patch.propertyType = facts.propertyType.value;
  if (facts.addressRaw.value && isDifferent(lead.projectAddress, facts.addressRaw.value)) patch.projectAddress = facts.addressRaw.value;
  if (facts.postalCode.value && isDifferent(lead.postalCode, facts.postalCode.value)) patch.postalCode = facts.postalCode.value;
  if (facts.area.value && isDifferent(lead.propertyArea, facts.area.value)) patch.propertyArea = facts.area.value;
  if (facts.scopeSummary.value && isDifferent(lead.scopeSummary, facts.scopeSummary.value)) patch.scopeSummary = facts.scopeSummary.value;
  if (facts.appointmentPreference.value && isDifferent(lead.preferredContactTime, facts.appointmentPreference.value)) {
    patch.preferredContactTime = facts.appointmentPreference.value;
  }
  return patch;
}

export function leadFactsLocationLabel(status: LeadFactsLocationStatus) {
  return {
    full_address_captured: "Full address captured",
    postal_only: "Postal code captured",
    area_only: "Area captured",
    missing_location: "Location missing",
    conflict: "Location conflict"
  }[status];
}
