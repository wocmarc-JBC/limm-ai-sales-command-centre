import type { LeadMessage } from "@/lib/types";

export type WhatsAppReplyOutcome =
  | "client_engaged"
  | "project_details_provided"
  | "files_received"
  | "appointment_interest"
  | "quotation_interest"
  | "portfolio_interest"
  | "human_requested"
  | "frustration_or_correction"
  | "non_sales_response";

export type WhatsAppReplyOutcomeResult = {
  outcome: WhatsAppReplyOutcome;
  priorOutboundMessageId: string;
  priorQualityEventId: string;
  responseLatencySeconds: number | null;
  clientResponded: true;
  positiveProgression: boolean;
  reason: string;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9\u4e00-\u9fff$\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metadataString(message: LeadMessage, key: string) {
  const value = message.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function priorAiReply(messages: LeadMessage[], currentInbound: LeadMessage) {
  const currentAt = Date.parse(currentInbound.createdAt);
  return [...messages]
    .filter((message) => {
      if (message.direction !== "outbound") return false;
      if (message.metadata?.aiGeneratedReply !== true) return false;
      const createdAt = Date.parse(message.createdAt);
      return !Number.isNaN(createdAt) && (Number.isNaN(currentAt) || createdAt < currentAt);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

function classifyOutcome(currentInbound: LeadMessage) {
  const text = normalize(`${currentInbound.body} ${metadataString(currentInbound, "caption")} ${metadataString(currentInbound, "filename")} ${metadataString(currentInbound, "mimeType")} ${metadataString(currentInbound, "messageType")}`);
  if (/already told|why.*repeat|ask again|stupid|nonsense|wtf|frustrat|complaint|wrong again/.test(text)) {
    return { outcome: "frustration_or_correction" as const, positiveProgression: false, reason: "Client expressed frustration or corrected the assistant." };
  }
  if (/speak.*marcus|talk.*marcus|human|real person|call me|manager|boss/.test(text)) {
    return { outcome: "human_requested" as const, positiveProgression: false, reason: "Client requested a human or Marcus." };
  }
  if (/image\/(jpeg|png)|application\/pdf|message type (image|document)|floor\s*plan|floorplan|drawing|site photo|attached|uploaded/.test(text)) {
    return { outcome: "files_received" as const, positiveProgression: true, reason: "Client supplied project media or documents." };
  }
  if (/appointment|meeting|meet|site visit|office visit|available|slot|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday/.test(text)) {
    return { outcome: "appointment_interest" as const, positiveProgression: true, reason: "Client indicated meeting or appointment interest." };
  }
  if (/quotation|quote|cost|price|how much|budget|estimate/.test(text)) {
    return { outcome: "quotation_interest" as const, positiveProgression: true, reason: "Client continued toward cost or quotation discussion." };
  }
  if (/portfolio|past work|project photo|instagram|show me.*work/.test(text)) {
    return { outcome: "portfolio_interest" as const, positiveProgression: true, reason: "Client requested or engaged with portfolio material." };
  }
  if (/hdb|condo|landed|commercial|terrace|semi d|bungalow|address|postal|renovat|kitchen|bathroom|carpentry|hacking|electrical|plumbing|tiling|a&a|extension|move in|key collection/.test(text)) {
    return { outcome: "project_details_provided" as const, positiveProgression: true, reason: "Client provided useful project qualification details." };
  }
  if (/job|looking for work|subcon|subcontract|supplier|vendor|marketing service|commission|rental/.test(text)) {
    return { outcome: "non_sales_response" as const, positiveProgression: false, reason: "The response belongs to a non-sales conversation." };
  }
  return { outcome: "client_engaged" as const, positiveProgression: true, reason: "Client replied after the AI message." };
}

export function evaluateReplyOutcomeFromInbound(input: {
  messages: LeadMessage[];
  currentInbound: LeadMessage;
}): WhatsAppReplyOutcomeResult | null {
  const prior = priorAiReply(input.messages, input.currentInbound);
  if (!prior) return null;
  const qualityEventId = metadataString(prior, "aiQualityEventId");
  if (!qualityEventId) return null;
  const classification = classifyOutcome(input.currentInbound);
  const priorAt = Date.parse(prior.createdAt);
  const currentAt = Date.parse(input.currentInbound.createdAt);
  const responseLatencySeconds = Number.isNaN(priorAt) || Number.isNaN(currentAt)
    ? null
    : Math.max(0, Math.round((currentAt - priorAt) / 1000));
  return {
    ...classification,
    priorOutboundMessageId: prior.id,
    priorQualityEventId: qualityEventId,
    responseLatencySeconds,
    clientResponded: true
  };
}
