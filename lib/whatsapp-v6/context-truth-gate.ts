import type { Lead, LeadMessage } from "@/lib/types";
import { inferWhatsAppLeadContext } from "@/lib/whatsapp-lead-context";
import { normaliseV6Text } from "@/lib/whatsapp-v6/singapore-renovation-language";
import type { V6ContextTruthGate, V6Understanding, V6VerifiedContext } from "@/lib/whatsapp-v6/types";

function metadataText(message: LeadMessage) {
  return Object.entries(message.metadata ?? {})
    .map(([key, value]) => `${key} ${typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}`)
    .join(" ");
}

function inboundText(messages: LeadMessage[]) {
  return messages
    .filter((message) => message.direction === "inbound")
    .map((message) => `${message.body} ${metadataText(message)}`)
    .join(" ");
}

function meaningfulLeadScope(scope: string) {
  return Boolean(scope && !/pending review|new whatsapp enquiry/i.test(scope));
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function addUnique(target: string[], value: string) {
  if (value && !target.includes(value)) target.push(value);
}

function clientSaidAlready(text: string, thing: string) {
  const normalized = normaliseV6Text(text);
  if (thing === "floor_plan") return /\b(already sent|sent|attached|gave|uploaded).*(floor plan|floorplan|plan|layout|drawing)\b/i.test(normalized);
  if (thing === "scope") return /\b(already sent|sent|gave|shared).*(scope|details|works?)\b/i.test(normalized);
  if (thing === "photos") return /\b(already sent|sent|attached|gave|uploaded).*(photos?|pictures?|images?)\b/i.test(normalized);
  if (thing === "address") return /\b(already sent|sent|gave|shared).*(address|area|location|postal)\b/i.test(normalized);
  return false;
}

export function buildVerifiedContext(input: {
  lead: Lead;
  previousMessages: LeadMessage[];
  inboundText: string;
  inboundMessageType: string;
  understanding: V6Understanding;
}): V6VerifiedContext {
  const memory = inferWhatsAppLeadContext({
    lead: input.lead,
    previousMessages: input.previousMessages,
    inboundText: input.inboundText
  });
  const prior = inboundText(input.previousMessages);
  const allText = `${input.lead.propertyType} ${input.lead.scopeSummary} ${input.lead.lastClientMessage} ${input.inboundText} ${prior}`;
  const normalized = normaliseV6Text(allText);
  const confirmedFacts: string[] = [];
  const inferredButNotConfirmed: string[] = [];
  const type = input.inboundMessageType.toLowerCase();
  const hasImageOrFile = ["image", "document"].includes(type) || hasAny(normalized, [/\bmessagetype\s+(image|document)\b/i]);

  const strongFloorPlan = hasAny(normalized, [
    /\bfloor plan\b/i,
    /\bfloorplan\b/i,
    /\blayout\b/i,
    /\bdrawing\b/i,
    /\bfilename\s+[\w\s-]*(floorplan|floor plan|plan|layout|drawing)[\w\s-]*(pdf|jpg|jpeg|png|webp)\b/i
  ]);
  const hasFloorPlan = strongFloorPlan || clientSaidAlready(input.inboundText, "floor_plan") || memory.hasFloorPlan;
  if (hasFloorPlan) addUnique(confirmedFacts, "floor plan");
  else if (hasImageOrFile) addUnique(inferredButNotConfirmed, "image/file received, content not fully verified");

  const hasSitePhotos = memory.hasSitePhotos || clientSaidAlready(input.inboundText, "photos") || hasAny(normalized, [
    /\bsite photos?\b/i,
    /\bphotos? of (?:wall|kitchen|toilet|bathroom|site|area)\b/i,
    /\bcaption\s+[\w\s]*(site|wall|condition|leak|roof)[\w\s]*(photo|image|picture)\b/i
  ]);
  if (hasSitePhotos) addUnique(confirmedFacts, "site photos");

  const hasScopeOfWork =
    clientSaidAlready(input.inboundText, "scope") ||
    memory.hasScopeOfWork ||
    meaningfulLeadScope(input.lead.scopeSummary) ||
    input.understanding.detectedScopes.length > 0 ||
    hasAny(normalized, [/\bscope\b/i, /\bkitchen\b/i, /\bdemo\b/i, /\bdemolition\b/i, /\bhacking\b/i, /\bcarpentry\b/i, /\bbathroom\b/i]);
  if (hasScopeOfWork && (clientSaidAlready(input.inboundText, "scope") || meaningfulLeadScope(input.lead.scopeSummary))) addUnique(confirmedFacts, "scope");
  if (hasScopeOfWork && !confirmedFacts.includes("scope")) addUnique(inferredButNotConfirmed, input.understanding.detectedScopes.join(", ") || "scope mentioned");

  const knownPropertyType =
    input.lead.propertyType && input.lead.propertyType !== "Unknown" ? input.lead.propertyType.toLowerCase() : "";
  const hasPropertyType = memory.hasPropertyType || Boolean(knownPropertyType) || hasAny(normalized, [/\blanded\b/i, /\bcondo\b/i, /\bcommercial\b/i, /\boffice\b/i, /\bshop\b/i, /\bclinic\b/i]);
  if (hasPropertyType) addUnique(confirmedFacts, "property type");

  const hasAddressOrArea = memory.hasAddressOrArea || clientSaidAlready(input.inboundText, "address") || hasAny(normalized, [
    /\baddress\b/i,
    /\barea\b/i,
    /\bpostal\b/i,
    /\bstreet\b/i,
    /\broad\b/i,
    /\bblk\b/i,
    /\bunit\b/i,
    /\b\d{6}\b/i
  ]);
  if (hasAddressOrArea) addUnique(confirmedFacts, "address/area");

  const hasPreferredAppointmentTime = memory.hasPreferredAppointmentTime || hasAny(normaliseV6Text(input.inboundText), [
    /\b(mon|tue|wed|thu|fri|sat|sun)(day)?\b/i,
    /\b\d{1,2}\s*(am|pm)\b/i,
    /\btomorrow\b/i,
    /\bnext week\b/i
  ]);
  if (hasPreferredAppointmentTime) addUnique(inferredButNotConfirmed, "preferred appointment timing mentioned");

  const hasDesignReferences = memory.hasDesignReferences || hasAny(normalized, [
    /\bdesign reference\b/i,
    /\breference image\b/i,
    /\bmoodboard\b/i,
    /\bpinterest\b/i
  ]);
  if (hasDesignReferences) addUnique(confirmedFacts, "design references");

  const missingFields = [
    !hasPropertyType ? "property_type" : "",
    !hasScopeOfWork ? "scope" : "",
    !hasFloorPlan ? "floor_plan" : "",
    !hasSitePhotos ? "site_photos" : "",
    !hasAddressOrArea ? "address_or_area" : ""
  ].filter(Boolean);

  return {
    hasFloorPlan,
    hasSitePhotos,
    hasScopeOfWork,
    hasPropertyType,
    hasAddressOrArea,
    hasPreferredAppointmentTime,
    hasDesignReferences,
    hasImageOrFile,
    knownScopeSummary: memory.knownScopeSummary,
    knownPropertyType: memory.knownPropertyType,
    knownStoreys: memory.knownStoreys,
    knownAddressOrArea: memory.knownAddressOrArea,
    knownTimeline: memory.knownTimeline,
    knownBudgetExpectation: memory.knownBudgetExpectation,
    alreadyToldYouDetected: memory.alreadyToldYouDetected,
    budgetStatementDetected: memory.budgetStatementDetected,
    confirmedFacts,
    inferredButNotConfirmed,
    missingFields
  };
}

export function runContextTruthGate(context: V6VerifiedContext, requestedReceivedClaims: string[]): V6ContextTruthGate {
  const allowedReceivedClaims = requestedReceivedClaims.filter((claim) => context.confirmedFacts.includes(claim));
  const disallowedReceivedClaims = requestedReceivedClaims.filter((claim) => !context.confirmedFacts.includes(claim));
  return {
    overClaimPrevented: disallowedReceivedClaims.length > 0,
    disallowedReceivedClaims,
    allowedReceivedClaims
  };
}

export function receivedAcknowledgement(context: V6VerifiedContext) {
  const allowed = context.confirmedFacts.filter((fact) => ["floor plan", "scope", "site photos", "address/area"].includes(fact));
  if (!allowed.length) return "";
  if (allowed.length === 1) return `Thanks, we've received the ${allowed[0]}.`;
  if (allowed.length === 2) return `Thanks, we've received the ${allowed[0]} and ${allowed[1]}.`;
  return `Thanks, we've received the ${allowed.slice(0, -1).join(", ")} and ${allowed[allowed.length - 1]}.`;
}
