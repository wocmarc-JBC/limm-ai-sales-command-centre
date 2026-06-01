import { buildVerifiedContext, runContextTruthGate } from "@/lib/whatsapp-v6/context-truth-gate";
import { understandWhatsAppMessage } from "@/lib/whatsapp-v6/message-understanding";
import { composeNaturalV6Reply } from "@/lib/whatsapp-v6/natural-reply-composer";
import { planV6Reply } from "@/lib/whatsapp-v6/reply-planner";
import { judgeV6ReplyQuality, v6QualityFallback } from "@/lib/whatsapp-v6/reply-quality-judge";
import { governV6Safety } from "@/lib/whatsapp-v6/safety-governor";
import {
  V6_SALES_BRAIN_VERSION,
  type V6ClientMessageType,
  type V6SalesBrainDecision,
  type V6SalesBrainInput
} from "@/lib/whatsapp-v6/types";

export function getOptionalAiSalesBrainRuntime() {
  const aiEnabled = process.env.WHATSAPP_AI_SALES_BRAIN_ENABLED === "true";
  const draftEnabled = process.env.WHATSAPP_AI_DRAFT_REPLY_ENABLED === "true";
  return {
    available: true,
    enabled: aiEnabled,
    draftReplyEnabled: draftEnabled,
    provider: process.env.WHATSAPP_AI_PROVIDER || "openai",
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    jsonSchemaValidationAvailable: true
  };
}

function normalizeMessageType(type: string): V6ClientMessageType {
  const normalized = type.toLowerCase();
  if (["text", "image", "document", "audio", "voice"].includes(normalized)) return normalized as V6ClientMessageType;
  return "unsupported";
}

function requestedReceivedClaimsFromReply(reply: string) {
  return [
    /\breceived the floor plan\b/i.test(reply) ? "floor plan" : "",
    /\breceived (?:the )?(?:.*\band\b\s*)?scope\b/i.test(reply) ? "scope" : "",
    /\breceived (?:the )?(?:.*\band\b\s*)?site photos\b/i.test(reply) ? "site photos" : "",
    /\breceived (?:the )?(?:.*\band\b\s*)?address\/area\b/i.test(reply) ? "address/area" : "",
    /\breceived (?:the )?(?:.*\band\b\s*)?design references\b/i.test(reply) ? "design references" : ""
  ].filter(Boolean);
}

export function buildV6WhatsAppSalesBrainDecision(input: V6SalesBrainInput): V6SalesBrainDecision {
  const clientMessageType = normalizeMessageType(input.inboundMessageType);
  const understanding = understandWhatsAppMessage(input.inboundMessageText, clientMessageType);
  const verifiedContext = buildVerifiedContext({
    lead: input.lead,
    previousMessages: input.previousMessages,
    inboundText: input.inboundMessageText,
    inboundMessageType: clientMessageType,
    understanding
  });
  const replyPlan = planV6Reply({
    understanding,
    context: verifiedContext,
    calendarEventId: input.calendarEventId
  });
  const draftReply = composeNaturalV6Reply({
    inboundText: input.inboundMessageText,
    inboundMessageType: clientMessageType,
    understanding,
    context: verifiedContext,
    plan: replyPlan,
    calendarEventId: input.calendarEventId
  });
  const contextTruthGate = runContextTruthGate(verifiedContext, requestedReceivedClaimsFromReply(draftReply));
  let governed = governV6Safety(draftReply, understanding, input.calendarEventId);
  let quality = judgeV6ReplyQuality({
    reply: governed.replyText,
    understanding,
    context: verifiedContext
  });

  if (!quality.ok) {
    governed = governV6Safety(v6QualityFallback(understanding), understanding, input.calendarEventId);
    quality = judgeV6ReplyQuality({
      reply: governed.replyText,
      understanding,
      context: verifiedContext
    });
  }

  const finalReply = governed.replyText.trim() || "Thanks for reaching out. We can help review your renovation enquiry. Could you share your property type, basic scope, and any floor plan or photos if available for an initial project review?";

  return {
    version: V6_SALES_BRAIN_VERSION,
    shouldReply: input.autoReplyEnabled && Boolean(finalReply),
    replyText: finalReply,
    replyLanguage: "english",
    clientMessageType,
    understanding,
    verifiedContext,
    contextTruthGate,
    replyPlan,
    safety: governed.safety,
    quality,
    handoff: {
      emailTriggered: replyPlan.handoffNeeded,
      emailSent: false,
      emailSkippedReason: ""
    },
    traceId: `${input.providerMessageId || "local"}:${Date.now()}`
  };
}
