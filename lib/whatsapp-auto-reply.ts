import "server-only";

import { WhatsAppCloudApiAdapter, type WhatsAppAdapter } from "@/lib/adapters/whatsapp-adapter";
import { openAiBrainDryRunAdapter } from "@/lib/adapters/openai-adapter";
import { createAuditLog } from "@/lib/data/audit-repository";
import {
  countRecentWhatsAppAutoReplies,
  findLeadMessageByProviderId,
  saveLeadMessage,
  upsertWhatsAppLead
} from "@/lib/data/lead-messages-repository";
import { getOpenAiBrainRuntime } from "@/lib/openai-brain-config";
import { getWhatsAppRuntime, normalizeWhatsAppPhone } from "@/lib/whatsapp-config";
import type { ParsedWhatsAppMessage } from "@/lib/whatsapp-parser";
import { validateWhatsAppAutoReply, WHATSAPP_SAFE_FALLBACK_REPLY } from "@/lib/whatsapp-safety";

export type WhatsAppInboundHandleResult = {
  providerMessageId: string;
  leadId?: string;
  status:
    | "ignored_duplicate"
    | "ignored_disabled"
    | "ignored_own_number"
    | "saved_inbound"
    | "auto_reply_sent"
    | "auto_reply_blocked"
    | "auto_reply_disabled"
    | "auto_reply_failed";
  reason: string;
  reply?: string;
};

function tenMinutesAgoIso() {
  return new Date(Date.now() - 10 * 60 * 1000).toISOString();
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown WhatsApp webhook failure";
}

function logWhatsApp(stage: string, metadata: Record<string, unknown> = {}) {
  console.info(stage, metadata);
}

function logWhatsAppError(stage: string, metadata: Record<string, unknown> = {}) {
  console.error("whatsapp_webhook_error", { stage, ...metadata });
}

async function auditWhatsApp(input: {
  action: string;
  leadId: string;
  summary: string;
  metadata?: Record<string, unknown>;
  afterData?: Record<string, unknown> | null;
}) {
  const runtime = getWhatsAppRuntime();
  try {
    await createAuditLog({
      actorType: "system",
      actorName: "WhatsApp Closed Test",
      action: input.action,
      entityType: "lead",
      entityId: input.leadId,
      summary: input.summary,
      beforeData: null,
      afterData: input.afterData ?? null,
      metadata: {
        channel: "whatsapp",
        closedTest: runtime.closedTestAutoReplyAllowed,
        marcusApprovedLiveMode: runtime.liveAutoReplyApproved,
        publicAutoReplyEnabled: runtime.publicAutoReplyEnabled,
        testMode: runtime.testMode,
        autoReplyModeAllowed: runtime.autoReplyModeAllowed,
        noCalendarBooking: true,
        noPricing: true,
        ...(input.metadata ?? {})
      }
    });
  } catch (error) {
    logWhatsAppError("audit_insert", { action: input.action, leadId: input.leadId, reason: safeError(error) });
    throw error;
  }
  logWhatsApp("whatsapp_audit_written", { action: input.action, leadId: input.leadId });
}

async function buildDraftReply(lead: Awaited<ReturnType<typeof upsertWhatsAppLead>>) {
  const openAi = getOpenAiBrainRuntime();
  if (!openAi.canCallOpenAi) return WHATSAPP_SAFE_FALLBACK_REPLY;

  const recommendation = await openAiBrainDryRunAdapter.draftRecommendation({ lead });
  const draft = recommendation.decision.client_reply || WHATSAPP_SAFE_FALLBACK_REPLY;
  const check = validateWhatsAppAutoReply(draft);
  return check.ok ? draft : WHATSAPP_SAFE_FALLBACK_REPLY;
}

export async function handleWhatsAppInboundMessage(
  message: ParsedWhatsAppMessage,
  adapter: WhatsAppAdapter = new WhatsAppCloudApiAdapter()
): Promise<WhatsAppInboundHandleResult> {
  const runtime = getWhatsAppRuntime();
  const providerMessageId = message.providerMessageId || `missing-provider-id-${Date.now()}`;
  const senderPhone = normalizeWhatsAppPhone(message.senderPhone);

  logWhatsApp("whatsapp_auto_reply_enabled_state", {
    providerMessageId,
    liveInboundEnabled: runtime.liveInboundEnabled,
    testAutoReplyEnabled: runtime.testAutoReplyEnabled,
    publicAutoReplyEnabled: runtime.publicAutoReplyEnabled,
    testMode: runtime.testMode,
    credentialsReady: runtime.credentialsReady
  });

  if (!runtime.liveInboundEnabled) {
    logWhatsApp("whatsapp_auto_reply_disabled", { providerMessageId, reason: "WHATSAPP_LIVE_INBOUND_ENABLED=false" });
    return {
      providerMessageId,
      status: "ignored_disabled",
      reason: "WHATSAPP_LIVE_INBOUND_ENABLED is false."
    };
  }

  let duplicate: Awaited<ReturnType<typeof findLeadMessageByProviderId>>;
  try {
    duplicate = await findLeadMessageByProviderId(providerMessageId);
  } catch (error) {
    logWhatsAppError("dedupe_lookup", { providerMessageId, reason: safeError(error) });
    throw error;
  }
  logWhatsApp("whatsapp_dedupe_checked", { providerMessageId, duplicate: Boolean(duplicate) });
  if (duplicate) {
    return {
      providerMessageId,
      leadId: duplicate.leadId,
      status: "ignored_duplicate",
      reason: "Provider message id was already processed."
    };
  }

  if (runtime.businessNumber && senderPhone === runtime.businessNumber) {
    logWhatsApp("whatsapp_auto_reply_disabled", { providerMessageId, reason: "own_business_number" });
    return {
      providerMessageId,
      status: "ignored_own_number",
      reason: "Inbound sender matches configured WhatsApp business number."
    };
  }

  const inboundBody = message.text || `[Unsupported WhatsApp ${message.type || "message"} received]`;
  let lead: Awaited<ReturnType<typeof upsertWhatsAppLead>>;
  try {
    logWhatsApp("whatsapp_lead_upsert_started", { providerMessageId });
    lead = await upsertWhatsAppLead({
      phone: senderPhone,
      contactName: message.contactName,
      latestMessage: inboundBody
    });
    logWhatsApp("whatsapp_lead_upserted", { providerMessageId, leadId: lead.id });
  } catch (error) {
    logWhatsAppError("lead_upsert", { providerMessageId, reason: safeError(error) });
    throw error;
  }

  try {
    logWhatsApp("whatsapp_inbound_message_save_started", { providerMessageId, leadId: lead.id });
    await saveLeadMessage({
      leadId: lead.id,
      direction: "inbound",
      body: inboundBody,
      safeToSend: false,
      providerMessageId,
      providerTimestamp: message.timestamp,
      whatsappStatus: "received",
      metadata: {
        messageType: message.type,
        businessPhoneNumberId: message.businessPhoneNumberId,
        providerMessageId
      }
    });
    logWhatsApp("whatsapp_inbound_message_saved", { providerMessageId, leadId: lead.id });
  } catch (error) {
    logWhatsAppError("inbound_message_save", { providerMessageId, leadId: lead.id, reason: safeError(error) });
    throw error;
  }

  logWhatsApp("whatsapp_inbound_audit_started", { providerMessageId, leadId: lead.id });
  await auditWhatsApp({
    action: "whatsapp_inbound_received",
    leadId: lead.id,
    summary: "WhatsApp inbound message received and saved for review.",
    metadata: { providerMessageId, messageType: message.type }
  });

  if (!message.text || message.type !== "text") {
    logWhatsApp("whatsapp_auto_reply_disabled", { providerMessageId, leadId: lead.id, reason: "unsupported_or_empty_message" });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_disabled",
      leadId: lead.id,
      summary: "WhatsApp auto-reply disabled for unsupported or empty inbound message.",
      metadata: { providerMessageId, reason: "unsupported_or_empty_message" }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "Unsupported or empty inbound message was saved, but no auto-reply was sent."
    };
  }

  await auditWhatsApp({
    action: "whatsapp_auto_reply_requested",
    leadId: lead.id,
    summary: "WhatsApp auto-reply requested and safety-gated.",
    metadata: { providerMessageId }
  });

  if (!runtime.testAutoReplyEnabled) {
    logWhatsApp("whatsapp_auto_reply_disabled", { providerMessageId, leadId: lead.id, reason: "WHATSAPP_TEST_AUTO_REPLY_ENABLED=false" });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_disabled",
      leadId: lead.id,
      summary: "WhatsApp auto-reply disabled by kill switch.",
      metadata: { providerMessageId, reason: "WHATSAPP_TEST_AUTO_REPLY_ENABLED=false" }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "WHATSAPP_TEST_AUTO_REPLY_ENABLED is false."
    };
  }

  if (!runtime.autoReplyModeAllowed) {
    logWhatsApp("whatsapp_auto_reply_disabled", {
      providerMessageId,
      leadId: lead.id,
      reason: "invalid_auto_reply_mode",
      publicAutoReplyEnabled: runtime.publicAutoReplyEnabled,
      testMode: runtime.testMode
    });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_disabled",
      leadId: lead.id,
      summary: "WhatsApp auto-reply disabled because the public/test mode pairing is invalid.",
      metadata: { providerMessageId, publicAutoReplyEnabled: runtime.publicAutoReplyEnabled, testMode: runtime.testMode }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "Auto-reply requires either closed test mode or Marcus-approved live mode."
    };
  }

  if (!runtime.credentialsReady) {
    logWhatsApp("whatsapp_auto_reply_disabled", { providerMessageId, leadId: lead.id, reason: "missing_credentials" });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_disabled",
      leadId: lead.id,
      summary: "WhatsApp auto-reply disabled because Cloud API credentials are missing.",
      metadata: { providerMessageId, reason: "missing_credentials" }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "WhatsApp credentials missing."
    };
  }

  const recentReplyCount = await countRecentWhatsAppAutoReplies(lead.id, tenMinutesAgoIso());
  if (recentReplyCount >= 3) {
    logWhatsApp("whatsapp_auto_reply_disabled", { providerMessageId, leadId: lead.id, reason: "rate_limit", recentReplyCount });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_disabled",
      leadId: lead.id,
      summary: "WhatsApp auto-reply disabled by 10-minute rate limit.",
      metadata: { providerMessageId, recentReplyCount, limit: 3 }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_disabled",
      reason: "Rate limit reached: maximum 3 auto-replies per lead within 10 minutes."
    };
  }

  logWhatsApp("whatsapp_auto_reply_generate_started", { providerMessageId, leadId: lead.id });
  const reply = await buildDraftReply(lead);
  logWhatsApp("whatsapp_auto_reply_generated", { providerMessageId, leadId: lead.id, characterCount: reply.length });
  logWhatsApp("whatsapp_auto_reply_validation_started", { providerMessageId, leadId: lead.id });
  const safety = validateWhatsAppAutoReply(reply);
  if (!safety.ok) {
    logWhatsApp("whatsapp_auto_reply_blocked_unsafe", { providerMessageId, leadId: lead.id, errorCount: safety.errors.length });
    await saveLeadMessage({
      leadId: lead.id,
      direction: "outbound",
      body: reply,
      safeToSend: false,
      whatsappStatus: "blocked",
      metadata: { providerMessageId, safety }
    });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_blocked_unsafe",
      leadId: lead.id,
      summary: "WhatsApp auto-reply blocked by safety validator.",
      metadata: { providerMessageId, safety }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_blocked",
      reason: safety.errors.join("; "),
      reply
    };
  }
  logWhatsApp("whatsapp_auto_reply_validation_passed", { providerMessageId, leadId: lead.id });

  try {
    logWhatsApp("whatsapp_auto_reply_send_started", { providerMessageId, leadId: lead.id });
    const sent = await adapter.sendReply(senderPhone, reply);
    logWhatsApp("whatsapp_auto_reply_sent", { providerMessageId, leadId: lead.id, outboundProviderMessageId: sent.providerMessageId || "" });
    await saveLeadMessage({
      leadId: lead.id,
      direction: "outbound",
      body: reply,
      safeToSend: true,
      providerMessageId: sent.providerMessageId || undefined,
      whatsappStatus: "sent",
      metadata: {
        inboundProviderMessageId: providerMessageId,
        outboundProviderMessageId: sent.providerMessageId,
        mode: sent.mode
      }
    });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_sent",
      leadId: lead.id,
      summary: "WhatsApp auto-reply sent after safety validation.",
      metadata: { providerMessageId, outboundProviderMessageId: sent.providerMessageId }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_sent",
      reason: "WhatsApp auto-reply sent after safety validation.",
      reply
    };
  } catch (error) {
    logWhatsAppError("auto_reply_send", { providerMessageId, leadId: lead.id, reason: safeError(error) });
    await saveLeadMessage({
      leadId: lead.id,
      direction: "outbound",
      body: reply,
      safeToSend: false,
      whatsappStatus: "failed",
      metadata: {
        inboundProviderMessageId: providerMessageId,
        error: error instanceof Error ? error.message : "Unknown WhatsApp send failure"
      }
    });
    await auditWhatsApp({
      action: "whatsapp_auto_reply_failed",
      leadId: lead.id,
      summary: "WhatsApp auto-reply failed. No retry loop was started.",
      metadata: {
        providerMessageId,
        error: error instanceof Error ? error.message : "Unknown WhatsApp send failure"
      }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_failed",
      reason: error instanceof Error ? error.message : "Unknown WhatsApp send failure",
      reply
    };
  }
}
