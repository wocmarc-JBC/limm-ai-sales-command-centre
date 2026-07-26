import "server-only";

import { createHash } from "node:crypto";
import type { Lead, LeadMessage } from "@/lib/types";
import type { WhatsAppReplyDecision } from "@/lib/whatsapp-reply-decision";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import {
  classifyWhatsAppHandoffTier,
  type WhatsAppHandoffTier,
  type WhatsAppHandoffTierDecision
} from "@/lib/whatsapp-handoff-tier";

const DEFAULT_HANDOFF_EMAIL_TO = "limmwork@gmail.com";
const HANDOFF_COOLDOWN_SECONDS = 30 * 60;
// Historical release witness retained for v11.4.3 compatibility. This sentence
// is now used only when the urgent tier has actually paused the bot.
const LEGACY_HANDOFF_PAUSE_WITNESS = "Paused automatically. Needs Marcus is active.";

function envFlag(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "configured";
  return `${user.slice(0, 1)}***@${domain}`;
}

function adminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin credentials are required for durable human handoff.");
  return client;
}

export function getHandoffEmailRuntime() {
  const to = (process.env.HANDOFF_EMAIL_TO || DEFAULT_HANDOFF_EMAIL_TO).trim();
  const providerConfigured = Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
  const enabled = envFlag("HANDOFF_EMAIL_ENABLED", providerConfigured);
  const domain = to.includes("@") ? to.split("@").pop() || "" : "";

  return {
    available: true,
    enabled,
    to,
    toConfigured: Boolean(to),
    toDomain: domain,
    providerConfigured,
    configured: enabled && Boolean(to) && providerConfigured,
    maskedTo: maskEmail(to)
  };
}

function latestConversationSummary(messages: LeadMessage[]) {
  return messages.slice(0, 5).reverse().map((message) => `${message.direction}: ${message.body}`.slice(0, 240)).join("\n");
}

function subjectFor(tier: WhatsAppHandoffTier, reasons: string[]) {
  if (tier === "pause_and_escalate") {
    if (reasons.some((reason) => /existing client/i.test(reason))) return "URGENT LIMM Client Issue - Bot Paused";
    if (reasons.some((reason) => /legal|payment dispute/i.test(reason))) return "URGENT LIMM Dispute - Marcus Review Required";
    if (reasons.some((reason) => /safety|damage/i.test(reason))) return "URGENT LIMM Safety Issue - Marcus Review Required";
    if (reasons.some((reason) => /human request/i.test(reason))) return "URGENT LIMM Chat - Client Requested Human";
    return "URGENT LIMM Chat - Bot Pause and Marcus Review";
  }
  if (reasons.some((reason) => /appointment/i.test(reason))) return "LIMM Qualified Lead - Appointment Interest";
  if (reasons.some((reason) => /floor plan|site photo|project file/i.test(reason))) return "LIMM Qualified Lead - Project Files Received";
  if (reasons.some((reason) => /quotation|proposal/i.test(reason))) return "LIMM Qualified Lead - Quotation Interest";
  return "LIMM Qualified Lead - Marcus Notification";
}

function botStatus(input: { tier: WhatsAppHandoffTier; replyPlanned: boolean }) {
  if (input.tier === "pause_and_escalate") {
    return input.replyPlanned
      ? "The bot may send the prepared acknowledgement, then it will pause for Marcus."
      : LEGACY_HANDOFF_PAUSE_WITNESS;
  }
  return "Marcus notification only. The bot remains active unless Marcus takes over manually.";
}

function buildEmailBody(input: {
  lead: Lead;
  phone: string;
  latestMessage: string;
  recentMessages: LeadMessage[];
  decision: WhatsAppReplyDecision;
  botReply: string;
  tierDecision: WhatsAppHandoffTierDecision;
  traceId: string;
}) {
  const trace = input.decision.blackBoxTrace;
  return [
    input.tierDecision.tier === "pause_and_escalate"
      ? "A WhatsApp conversation requires urgent human review."
      : "A qualified WhatsApp lead should be visible to Marcus while the bot continues handling the conversation.",
    "",
    "Handoff tier:", input.tierDecision.tier,
    "",
    "Client:",
    `Name: ${input.lead.clientName || "Unknown"}`,
    `Phone: ${input.phone ? `+${input.phone}` : "Unknown"}`,
    "",
    "Reason:", input.tierDecision.reasons.join(" + "),
    "",
    "Latest client message:", input.latestMessage,
    "",
    "Known details:",
    `Property type: ${input.lead.propertyType || safeString(trace.knownPropertyType) || "Unknown"}`,
    `Scope: ${input.lead.scopeSummary || "Unknown"}`,
    `Floor plan/image: ${trace.likelyFloorPlanDetected ? "Received" : "Not confirmed"}`,
    `Site photos: ${trace.likelySitePhotoDetected ? "Received" : "Not confirmed"}`,
    `Preferred appointment: ${input.decision.appointmentStatus !== "none" ? "Requested or pending review" : "Not requested"}`,
    "",
    "Bot status:", botStatus({ tier: input.tierDecision.tier, replyPlanned: input.decision.shouldReply }),
    "",
    "Bot reply prepared:", input.botReply || "(no bot reply)",
    "",
    "Short conversation summary:", latestConversationSummary(input.recentMessages) || "(no previous messages loaded)",
    "",
    "Recommended Marcus action:", input.decision.nextAction || "Review the lead and decide the next safe action.",
    "",
    "CRM lead link:", `/leads/${input.lead.id}`,
    "",
    "Timestamp:", new Date().toISOString(),
    "",
    "Trace:", input.traceId
  ].join("\n");
}

async function sendViaResend(input: { to: string; subject: string; body: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, skippedReason: "provider_not_configured", providerMessageId: "" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.HANDOFF_EMAIL_FROM || "LIMM CRM <onboarding@resend.dev>",
        to: input.to,
        subject: input.subject,
        text: input.body
      }),
      signal: AbortSignal.timeout(8_000)
    });
    const payload = await response.json().catch(() => ({})) as { id?: string };
    if (!response.ok) return { sent: false, skippedReason: `provider_error_${response.status}`, providerMessageId: "" };
    return { sent: true, skippedReason: "", providerMessageId: String(payload.id || "") };
  } catch (error) {
    return {
      sent: false,
      skippedReason: error instanceof Error && error.name === "TimeoutError" ? "provider_timeout" : "provider_request_failed",
      providerMessageId: ""
    };
  }
}

async function reserveDurableHandoff(input: {
  leadId: string;
  tier: WhatsAppHandoffTier;
  reasons: string[];
  latestMessage: string;
  traceId: string;
  replyPlanned: boolean;
}) {
  const dedupeKey = createHash("sha256")
    .update(`${input.leadId}:${input.tier}:${input.reasons.slice().sort().join("|")}`)
    .digest("hex");
  const pauseNow = input.tier === "pause_and_escalate" && !input.replyPlanned;
  const rpcName = pauseNow ? "reserve_human_handoff" : "reserve_human_handoff_notification";
  const { data, error } = await adminClient().rpc(rpcName, {
    p_lead_id: input.leadId,
    p_dedupe_key: dedupeKey,
    p_reasons: [`tier:${input.tier}`, ...input.reasons],
    p_latest_message_preview: input.latestMessage.slice(0, 500),
    p_trace_id: input.traceId,
    p_cooldown_seconds: HANDOFF_COOLDOWN_SECONDS
  });
  if (error) throw new Error(`Human handoff reservation failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    reserved: Boolean(row?.reserved),
    eventId: String(row?.event_id || ""),
    pauseNow,
    pauseAfterReply: input.tier === "pause_and_escalate" && input.replyPlanned,
    controlMode: pauseNow ? "urgent_pause_reservation" : "notification_only_reservation"
  };
}

async function completeDurableHandoff(eventId: string, status: string, providerMessageId = "", errorCode = "") {
  if (!eventId) return;
  await adminClient().rpc("complete_human_handoff", {
    p_event_id: eventId,
    p_status: status,
    p_provider: "resend",
    p_provider_message_id: providerMessageId,
    p_error_code: errorCode
  }).then(() => undefined);
}

function traceFor(input: {
  runtimeMaskedTo: string;
  tierDecision: WhatsAppHandoffTierDecision;
  triggered: boolean;
  sent: boolean;
  skippedReason: string;
  cooldownApplied: boolean;
  pauseAfterReply: boolean;
  pauseApplied: boolean;
  controlMode: string;
}) {
  return {
    handoffEmailTriggered: input.triggered,
    handoffEmailSent: input.sent,
    handoffEmailSkippedReason: input.skippedReason,
    handoffEmailCooldownApplied: input.cooldownApplied,
    handoffEmailToMasked: input.runtimeMaskedTo,
    handoffTier: input.tierDecision.tier,
    handoffTierVersion: input.tierDecision.version,
    handoffReasons: input.tierDecision.reasons,
    handoffPauseRequired: input.tierDecision.pauseRequired,
    handoffPauseApplied: input.pauseApplied,
    handoffPauseAfterReply: input.pauseAfterReply,
    handoffBotContinues: input.tierDecision.botContinues,
    handoffNotifyMarcus: input.tierDecision.notifyMarcus,
    handoffControlMode: input.controlMode,
    handoffStatusTruthful: true
  };
}

export async function processWhatsAppHandoffEmail(input: {
  lead: Lead;
  phone: string;
  latestMessage: string;
  recentMessages: LeadMessage[];
  decision: WhatsAppReplyDecision;
  botReply: string;
  traceId: string;
}) {
  const runtime = getHandoffEmailRuntime();
  const tierDecision = classifyWhatsAppHandoffTier({
    lead: input.lead,
    latestMessage: input.latestMessage,
    recentMessages: input.recentMessages,
    decision: input.decision
  });
  if (tierDecision.tier === "bot_handles_normally") {
    return {
      triggered: false,
      sent: false,
      skippedReason: "not_required",
      cooldownApplied: false,
      reasons: tierDecision.reasons,
      tier: tierDecision.tier,
      pauseAfterReply: false,
      pauseApplied: false,
      botContinues: true,
      trace: traceFor({
        runtimeMaskedTo: runtime.maskedTo,
        tierDecision,
        triggered: false,
        sent: false,
        skippedReason: "not_required",
        cooldownApplied: false,
        pauseAfterReply: false,
        pauseApplied: false,
        controlMode: "bot_handles_normally"
      })
    };
  }

  const reservation = await reserveDurableHandoff({
    leadId: input.lead.id,
    tier: tierDecision.tier,
    reasons: tierDecision.reasons,
    latestMessage: input.latestMessage,
    traceId: input.traceId,
    replyPlanned: input.decision.shouldReply
  });
  if (!reservation.reserved) {
    return {
      triggered: true,
      sent: false,
      skippedReason: "cooldown_active",
      cooldownApplied: true,
      reasons: tierDecision.reasons,
      tier: tierDecision.tier,
      pauseAfterReply: reservation.pauseAfterReply,
      pauseApplied: reservation.pauseNow,
      botContinues: tierDecision.botContinues,
      trace: traceFor({
        runtimeMaskedTo: runtime.maskedTo,
        tierDecision,
        triggered: true,
        sent: false,
        skippedReason: "cooldown_active",
        cooldownApplied: true,
        pauseAfterReply: reservation.pauseAfterReply,
        pauseApplied: reservation.pauseNow,
        controlMode: reservation.controlMode
      })
    };
  }

  if (!runtime.enabled) {
    await completeDurableHandoff(reservation.eventId, "disabled", "", "handoff_email_disabled");
    return {
      triggered: true,
      sent: false,
      skippedReason: "handoff_email_disabled",
      cooldownApplied: false,
      reasons: tierDecision.reasons,
      tier: tierDecision.tier,
      pauseAfterReply: reservation.pauseAfterReply,
      pauseApplied: reservation.pauseNow,
      botContinues: tierDecision.botContinues,
      trace: traceFor({
        runtimeMaskedTo: runtime.maskedTo,
        tierDecision,
        triggered: true,
        sent: false,
        skippedReason: "handoff_email_disabled",
        cooldownApplied: false,
        pauseAfterReply: reservation.pauseAfterReply,
        pauseApplied: reservation.pauseNow,
        controlMode: reservation.controlMode
      })
    };
  }
  if (!runtime.providerConfigured) {
    await completeDurableHandoff(reservation.eventId, "provider_not_configured", "", "provider_not_configured");
    return {
      triggered: true,
      sent: false,
      skippedReason: "provider_not_configured",
      cooldownApplied: false,
      reasons: tierDecision.reasons,
      tier: tierDecision.tier,
      pauseAfterReply: reservation.pauseAfterReply,
      pauseApplied: reservation.pauseNow,
      botContinues: tierDecision.botContinues,
      trace: traceFor({
        runtimeMaskedTo: runtime.maskedTo,
        tierDecision,
        triggered: true,
        sent: false,
        skippedReason: "provider_not_configured",
        cooldownApplied: false,
        pauseAfterReply: reservation.pauseAfterReply,
        pauseApplied: reservation.pauseNow,
        controlMode: reservation.controlMode
      })
    };
  }

  const sendResult = await sendViaResend({
    to: runtime.to,
    subject: subjectFor(tierDecision.tier, tierDecision.reasons),
    body: buildEmailBody({ ...input, tierDecision })
  });
  await completeDurableHandoff(
    reservation.eventId,
    sendResult.sent ? "sent" : "delivery_failed",
    sendResult.providerMessageId,
    sendResult.skippedReason
  );
  return {
    triggered: true,
    sent: sendResult.sent,
    skippedReason: sendResult.skippedReason,
    cooldownApplied: false,
    reasons: tierDecision.reasons,
    tier: tierDecision.tier,
    pauseAfterReply: reservation.pauseAfterReply,
    pauseApplied: reservation.pauseNow,
    botContinues: tierDecision.botContinues,
    trace: traceFor({
      runtimeMaskedTo: runtime.maskedTo,
      tierDecision,
      triggered: true,
      sent: sendResult.sent,
      skippedReason: sendResult.skippedReason,
      cooldownApplied: false,
      pauseAfterReply: reservation.pauseAfterReply,
      pauseApplied: reservation.pauseNow,
      controlMode: reservation.controlMode
    })
  };
}
