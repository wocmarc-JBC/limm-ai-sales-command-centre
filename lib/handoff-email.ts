import "server-only";

import { createHash } from "node:crypto";
import type { Lead, LeadMessage } from "@/lib/types";
import type { WhatsAppReplyDecision } from "@/lib/whatsapp-reply-decision";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";

const DEFAULT_HANDOFF_EMAIL_TO = "limmwork@gmail.com";
const HANDOFF_COOLDOWN_SECONDS = 30 * 60;

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

function handoffReasons(decision: WhatsAppReplyDecision) {
  const trace = decision.blackBoxTrace;
  const intents = Array.isArray(trace.detectedIntents) ? trace.detectedIntents.map(String) : [];
  const reasons = [
    decision.conversationIntent === "existing_client_project_message" ? "Existing client project message" : "",
    intents.includes("appointment_request") || intents.includes("meeting_availability") ? "Appointment requested" : "",
    intents.includes("price_question") ? "Price/Budget question" : "",
    intents.includes("portfolio_request") ? "Past works / portfolio requested" : "",
    intents.includes("hacking_wall") || intents.includes("approval_submission") ? "Hacking/approval question" : "",
    Boolean(trace.imageDetected || trace.documentDetected || trace.likelyFloorPlanDetected) ? "Floor plan/photo/document received" : "",
    Boolean(trace.voiceMessageDetected) ? "Voice message received" : "",
    Boolean(trace.needsHuman) ? safeString(trace.escalationReason) || "Human follow-up needed" : "",
    decision.confidence < 75 ? "Bot confidence low" : ""
  ].filter(Boolean);
  return [...new Set(reasons)];
}

function subjectFor(reasons: string[]) {
  if (reasons.some((reason) => /appointment/i.test(reason))) return "LIMM Lead Needs Attention - Appointment Requested";
  if (reasons.some((reason) => /floor plan|photo|document/i.test(reason))) return "LIMM Lead Needs Attention - Floor Plan Received";
  if (reasons.some((reason) => /price|budget/i.test(reason))) return "LIMM Lead Needs Attention - Price/Budget Question";
  if (reasons.some((reason) => /hacking|approval/i.test(reason))) return "LIMM Lead Needs Attention - Hacking/Approval Question";
  if (reasons.some((reason) => /voice/i.test(reason))) return "LIMM Lead Needs Attention - Voice Message Received";
  return "LIMM Lead Needs Attention - Human Follow-Up";
}

function buildEmailBody(input: { lead: Lead; phone: string; latestMessage: string; recentMessages: LeadMessage[]; decision: WhatsAppReplyDecision; botReply: string; reasons: string[]; traceId: string; }) {
  const trace = input.decision.blackBoxTrace;
  return [
    "New WhatsApp lead needs human follow-up.", "",
    "Client:", `Name: ${input.lead.clientName || "Unknown"}`, `Phone: ${input.phone ? `+${input.phone}` : "Unknown"}`, "",
    "Reason:", input.reasons.join(" + "), "",
    "Latest client message:", input.latestMessage, "",
    "Known details:",
    `Property type: ${input.lead.propertyType || safeString(trace.knownPropertyType) || "Unknown"}`,
    `Scope: ${input.lead.scopeSummary || "Unknown"}`,
    `Floor plan/image: ${trace.likelyFloorPlanDetected ? "Received" : "Not confirmed"}`,
    `Site photos: ${trace.likelySitePhotoDetected ? "Received" : "Not confirmed"}`,
    `Preferred appointment: ${input.decision.appointmentStatus !== "none" ? "Requested or pending review" : "Not requested"}`, "",
    "Bot status:", "Paused automatically. Needs Marcus is active.", "",
    "Bot reply sent:", input.botReply || "(no bot reply)", "",
    "Short conversation summary:", latestConversationSummary(input.recentMessages) || "(no previous messages loaded)", "",
    "Recommended Marcus action:", input.decision.nextAction || "Review the lead and decide the next safe reply.", "",
    "CRM lead link:", `/leads/${input.lead.id}`, "",
    "Timestamp:", new Date().toISOString(), "", "Trace:", input.traceId
  ].join("\n");
}

async function sendViaResend(input: { to: string; subject: string; body: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, skippedReason: "provider_not_configured", providerMessageId: "" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.HANDOFF_EMAIL_FROM || "LIMM CRM <onboarding@resend.dev>", to: input.to, subject: input.subject, text: input.body }),
      signal: AbortSignal.timeout(8_000)
    });
    const payload = await response.json().catch(() => ({})) as { id?: string };
    if (!response.ok) return { sent: false, skippedReason: `provider_error_${response.status}`, providerMessageId: "" };
    return { sent: true, skippedReason: "", providerMessageId: String(payload.id || "") };
  } catch (error) {
    return { sent: false, skippedReason: error instanceof Error && error.name === "TimeoutError" ? "provider_timeout" : "provider_request_failed", providerMessageId: "" };
  }
}

async function reserveDurableHandoff(input: { leadId: string; reasons: string[]; latestMessage: string; traceId: string }) {
  const dedupeKey = createHash("sha256").update(`${input.leadId}:${input.reasons.slice().sort().join("|")}`).digest("hex");
  const { data, error } = await adminClient().rpc("reserve_human_handoff", {
    p_lead_id: input.leadId,
    p_dedupe_key: dedupeKey,
    p_reasons: input.reasons,
    p_latest_message_preview: input.latestMessage.slice(0, 500),
    p_trace_id: input.traceId,
    p_cooldown_seconds: HANDOFF_COOLDOWN_SECONDS
  });
  if (error) throw new Error(`Human handoff reservation failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { reserved: Boolean(row?.reserved), eventId: String(row?.event_id || "") };
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

export async function processWhatsAppHandoffEmail(input: { lead: Lead; phone: string; latestMessage: string; recentMessages: LeadMessage[]; decision: WhatsAppReplyDecision; botReply: string; traceId: string; }) {
  const runtime = getHandoffEmailRuntime();
  const reasons = handoffReasons(input.decision);
  if (!reasons.length) return { triggered: false, sent: false, skippedReason: "not_required", cooldownApplied: false, reasons, trace: { handoffEmailTriggered: false, handoffEmailSent: false, handoffEmailSkippedReason: "not_required", handoffEmailCooldownApplied: false, handoffEmailToMasked: runtime.maskedTo } };

  const reservation = await reserveDurableHandoff({ leadId: input.lead.id, reasons, latestMessage: input.latestMessage, traceId: input.traceId });
  if (!reservation.reserved) return { triggered: true, sent: false, skippedReason: "cooldown_active", cooldownApplied: true, reasons, trace: { handoffEmailTriggered: true, handoffEmailSent: false, handoffEmailSkippedReason: "cooldown_active", handoffEmailCooldownApplied: true, handoffEmailToMasked: runtime.maskedTo } };

  if (!runtime.enabled) {
    await completeDurableHandoff(reservation.eventId, "disabled", "", "handoff_email_disabled");
    return { triggered: true, sent: false, skippedReason: "handoff_email_disabled", cooldownApplied: false, reasons, trace: { handoffEmailTriggered: true, handoffEmailSent: false, handoffEmailSkippedReason: "handoff_email_disabled", handoffEmailCooldownApplied: false, handoffEmailToMasked: runtime.maskedTo } };
  }
  if (!runtime.providerConfigured) {
    await completeDurableHandoff(reservation.eventId, "provider_not_configured", "", "provider_not_configured");
    return { triggered: true, sent: false, skippedReason: "provider_not_configured", cooldownApplied: false, reasons, trace: { handoffEmailTriggered: true, handoffEmailSent: false, handoffEmailSkippedReason: "provider_not_configured", handoffEmailCooldownApplied: false, handoffEmailToMasked: runtime.maskedTo } };
  }

  const sendResult = await sendViaResend({ to: runtime.to, subject: subjectFor(reasons), body: buildEmailBody({ ...input, reasons }) });
  await completeDurableHandoff(reservation.eventId, sendResult.sent ? "sent" : "delivery_failed", sendResult.providerMessageId, sendResult.skippedReason);
  return { triggered: true, sent: sendResult.sent, skippedReason: sendResult.skippedReason, cooldownApplied: false, reasons, trace: { handoffEmailTriggered: true, handoffEmailSent: sendResult.sent, handoffEmailSkippedReason: sendResult.skippedReason, handoffEmailCooldownApplied: false, handoffEmailToMasked: runtime.maskedTo } };
}
