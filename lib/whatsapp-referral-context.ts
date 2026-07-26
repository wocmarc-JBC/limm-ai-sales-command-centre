import type { Lead, LeadMessage } from "@/lib/types";

export const WHATSAPP_REFERRAL_CONTEXT_VERSION = "v11.4.9_meta_referral_context";

export type WhatsAppReferralServiceKey =
  | "landed_aa"
  | "commercial_renovation"
  | "carpentry"
  | "hacking_demolition"
  | "kitchen_renovation"
  | "bathroom_renovation"
  | "full_home_renovation"
  | "general_renovation";

export type WhatsAppReferralContext = {
  confirmed: true;
  sourceType: string;
  sourceId: string;
  sourceUrl: string;
  headline: string;
  body: string;
  mediaType: string;
  imageUrl: string;
  videoUrl: string;
  thumbnailUrl: string;
  ctwaClid: string;
  welcomeMessage: string;
  serviceKey: WhatsAppReferralServiceKey;
  serviceLabel: string;
  serviceInference: "inferred_from_confirmed_ad_copy" | "general_from_confirmed_referral";
  capturedAt?: string;
  version: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clean(value: unknown, max = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function pick(record: Record<string, unknown>, keys: string[], max = 500) {
  for (const key of keys) {
    const value = clean(record[key], max);
    if (value) return value;
  }
  return "";
}

function classifyService(text: string): { key: WhatsAppReferralServiceKey; label: string; inferred: boolean } {
  const normalized = text.toLowerCase().replace(/[’]/g, "'");
  if (/\ba\s*&\s*a\b|\ba\s+and\s+a\b|addition(?:s)?\s+(?:and|&)\s+alteration|\blanded\b|\bextension\b/.test(normalized)) {
    return { key: "landed_aa", label: "landed A&A and renovation works", inferred: true };
  }
  if (/\bcommercial\b|\boffice\b|\bshop\b|\bretail\b|\bfit[- ]?out\b/.test(normalized)) {
    return { key: "commercial_renovation", label: "commercial renovation and fit-out works", inferred: true };
  }
  if (/\bcarpentry\b|\bcabinet\b|\bwardrobe\b|\bkitchen cabinet\b|\btv console\b|\bshoe cabinet\b/.test(normalized)) {
    return { key: "carpentry", label: "carpentry works", inferred: true };
  }
  if (/\bhacking\b|\bdemolition\b|\bdismantl(?:e|ing)\b|\bwall removal\b|\btile removal\b/.test(normalized)) {
    return { key: "hacking_demolition", label: "hacking and demolition works", inferred: true };
  }
  if (/\bkitchen\b|\bwet kitchen\b|\bdry kitchen\b/.test(normalized)) {
    return { key: "kitchen_renovation", label: "kitchen renovation", inferred: true };
  }
  if (/\bbathroom\b|\btoilet\b|\bwaterproofing\b/.test(normalized)) {
    return { key: "bathroom_renovation", label: "bathroom renovation", inferred: true };
  }
  if (/\bwhole[- ]?home\b|\bwhole[- ]?house\b|\bfull[- ]?home\b|\bfull renovation\b/.test(normalized)) {
    return { key: "full_home_renovation", label: "full-home renovation", inferred: true };
  }
  return { key: "general_renovation", label: "renovation planning and works", inferred: false };
}

export function parseWhatsAppReferralContext(value: unknown): WhatsAppReferralContext | null {
  const record = asRecord(value);
  const sourceType = pick(record, ["source_type", "sourceType"]);
  const sourceId = pick(record, ["source_id", "sourceId"]);
  const sourceUrl = pick(record, ["source_url", "sourceUrl"], 1000);
  const headline = pick(record, ["headline"], 300);
  const body = pick(record, ["body"], 1000);
  const mediaType = pick(record, ["media_type", "mediaType"]);
  const imageUrl = pick(record, ["image_url", "imageUrl"], 1000);
  const videoUrl = pick(record, ["video_url", "videoUrl"], 1000);
  const thumbnailUrl = pick(record, ["thumbnail_url", "thumbnailUrl"], 1000);
  const ctwaClid = pick(record, ["ctwa_clid", "ctwaClid"], 500);
  const welcomeMessage = pick(record, ["welcome_message", "welcomeMessage"], 500);
  if (!(sourceType || sourceId || sourceUrl || headline || body || ctwaClid)) return null;
  const service = classifyService(`${headline} ${body} ${sourceUrl}`);
  return {
    confirmed: true,
    sourceType,
    sourceId,
    sourceUrl,
    headline,
    body,
    mediaType,
    imageUrl,
    videoUrl,
    thumbnailUrl,
    ctwaClid,
    welcomeMessage,
    serviceKey: service.key,
    serviceLabel: service.label,
    serviceInference: service.inferred ? "inferred_from_confirmed_ad_copy" : "general_from_confirmed_referral",
    version: WHATSAPP_REFERRAL_CONTEXT_VERSION
  };
}

export function referralContextForStorage(context: WhatsAppReferralContext | null) {
  return context ? { ...context, capturedAt: context.capturedAt || new Date().toISOString() } : null;
}

function contextFromUnknown(value: unknown): WhatsAppReferralContext | null {
  const record = asRecord(value);
  if (record.confirmed !== true) return null;
  const reparsed = parseWhatsAppReferralContext(record);
  if (reparsed) {
    return { ...reparsed, capturedAt: clean(record.capturedAt) || reparsed.capturedAt };
  }
  const service = classifyService(`${clean(record.headline)} ${clean(record.body)} ${clean(record.sourceUrl, 1000)}`);
  return {
    confirmed: true,
    sourceType: clean(record.sourceType),
    sourceId: clean(record.sourceId),
    sourceUrl: clean(record.sourceUrl, 1000),
    headline: clean(record.headline, 300),
    body: clean(record.body, 1000),
    mediaType: clean(record.mediaType),
    imageUrl: clean(record.imageUrl, 1000),
    videoUrl: clean(record.videoUrl, 1000),
    thumbnailUrl: clean(record.thumbnailUrl, 1000),
    ctwaClid: clean(record.ctwaClid, 500),
    welcomeMessage: clean(record.welcomeMessage, 500),
    serviceKey: service.key,
    serviceLabel: service.label,
    serviceInference: service.inferred ? "inferred_from_confirmed_ad_copy" : "general_from_confirmed_referral",
    capturedAt: clean(record.capturedAt),
    version: clean(record.version) || WHATSAPP_REFERRAL_CONTEXT_VERSION
  };
}

export function getWhatsAppReferralContext(lead: Lead, messages: LeadMessage[]) {
  const leadTrace = asRecord(lead.intakeProfile?.trace);
  const persisted = contextFromUnknown(leadTrace.whatsappReferralContext);
  if (persisted) return persisted;
  for (const message of messages) {
    const context = contextFromUnknown(message.metadata?.whatsappReferral);
    if (context) return context;
  }
  return null;
}

export function isVagueReferralEnquiry(text: string) {
  const normalized = clean(text, 1000).toLowerCase();
  if (!normalized) return true;
  return /^(?:hi|hello|hey|你好|interested|i'?m interested|more info|more details|tell me more|can i (?:get|have|know) (?:more )?(?:info|information|details)|may i (?:get|have|know) (?:more )?(?:info|information|details)|can you (?:share|send|tell me) (?:more )?(?:info|information|details)|what is this about|enquiry|inquiry)[?.! ]*$/.test(normalized);
}

export function composeReferralAwareFirstTouchReply(context: WhatsAppReferralContext, inboundText: string) {
  if (!isVagueReferralEnquiry(inboundText)) return "";
  const intro = `Hi, thanks for enquiring about our ${context.serviceLabel}.`;
  if (context.serviceKey === "landed_aa") return `${intro} We'd love to help create your dream home. Are you considering an extension, internal reconfiguration, or a full renovation?`;
  if (context.serviceKey === "commercial_renovation") return `${intro} What type of commercial unit are you planning to renovate?`;
  if (context.serviceKey === "carpentry") return `${intro} Which carpentry item are you looking at?`;
  if (context.serviceKey === "hacking_demolition") return `${intro} What needs to be removed or dismantled?`;
  if (context.serviceKey === "kitchen_renovation") return `${intro} Is this carpentry only or full kitchen works including the related trades?`;
  if (context.serviceKey === "bathroom_renovation") return `${intro} Is this a full bathroom renovation or selected works only?`;
  if (context.serviceKey === "full_home_renovation") return `${intro} What type of property is this?`;
  return `${intro} May I know what type of property this is and what renovation works you're planning?`;
}

export function referralTrace(context: WhatsAppReferralContext | null) {
  return {
    metaReferralContextAvailable: Boolean(context),
    metaReferralContextConfirmed: Boolean(context?.confirmed),
    metaReferralServiceKey: context?.serviceKey ?? "",
    metaReferralServiceLabel: context?.serviceLabel ?? "",
    metaReferralServiceInference: context?.serviceInference ?? "",
    metaReferralSourceType: context?.sourceType ?? "",
    metaReferralSourceIdPresent: Boolean(context?.sourceId),
    metaReferralSourceUrlPresent: Boolean(context?.sourceUrl),
    metaReferralCtwaClidPresent: Boolean(context?.ctwaClid),
    metaReferralRawIdentifiersClientFacing: false,
    metaReferralVersion: context?.version ?? WHATSAPP_REFERRAL_CONTEXT_VERSION
  };
}
