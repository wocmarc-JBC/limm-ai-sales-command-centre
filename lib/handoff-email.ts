import "server-only";

import type { Lead, LeadMessage } from "@/lib/types";
import type { WhatsAppReplyDecision } from "@/lib/whatsapp-reply-decision";

const DEFAULT_HANDOFF_EMAIL_TO = "limmwork@gmail.com";
const HANDOFF_COOLDOWN_MS = 30 * 60 * 1000;
const handoffCooldown = new Map<string, number>();

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

export function getHandoffEmailRuntime() {
  const to = (process.env.HANDOFF_EMAIL_TO || DEFAULT_HANDOFF_EMAIL_TO).trim();
  const providerConfigured = Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
  const enabled = envFlag("HANDOFF_EMAIL_ENABLED", false);
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
  return messages
    .slice(0, 5)
    .reverse()
    .map((message) => `${message.direction}: ${message.body}`.slice(0, 240))
    .join("\n");
}

function handoffReasons(decision: WhatsAppReplyDecision) {
  const trace = decision.blackBoxTrace;
  const intents = Array.isArray(trace.detectedIntents) ? trace.detectedIntents.map(String) : [];
  const reasons = [
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

function buildEmailBody(input: {
  lead: Lead;
  phone: string;
  latestMessage: string;
  recentMessages: LeadMessage[];
  decision: WhatsAppReplyDecision;
  botReply: string;
  reasons: string[];
  traceId: string;
}) {
  const trace = input.decision.blackBoxTrace;
  return [
    "New WhatsApp lead needs human follow-up.",
    "",
    "Client:",
    `Name: ${input.lead.clientName || "Unknown"}`,
    `Phone: ${input.phone ? `+${input.phone}` : "Unknown"}`,
    "",
    "Reason:",
    input.reasons.join(" + "),
    "",
    "Latest client message:",
    input.latestMessage,
    "",
    "Known details:",
    `Property type: ${input.lead.propertyType || safeString(trace.knownPropertyType) || "Unknown"}`,
    `Scope: ${input.lead.scopeSummary || "Unknown"}`,
    `Floor plan/image: ${trace.likelyFloorPlanDetected ? "Received" : "Not confirmed"}`,
    `Site photos: ${trace.likelySitePhotoDetected ? "Received" : "Not confirmed"}`,
    `Address/area: ${safeString(trace.knownContextSummary).includes("address") ? "Received" : "Not confirmed"}`,
    `Preferred appointment: ${input.decision.appointmentStatus !== "none" ? "Requested or pending review" : "Not requested"}`,
    "",
    "Detected intent(s):",
    Array.isArray(trace.detectedIntents) ? trace.detectedIntents.join(", ") : input.decision.intent,
    "",
    "Bot reply sent:",
    input.botReply || "(no bot reply)",
    "",
    "Short conversation summary:",
    latestConversationSummary(input.recentMessages) || "(no previous messages loaded)",
    "",
    "Recommended Marcus action:",
    input.decision.nextAction || "Review the lead and decide the next safe reply.",
    "",
    "CRM lead link:",
    `/leads/${input.lead.id}`,
    "",
    "Timestamp:",
    new Date().toISOString(),
    "",
    "Trace:",
    input.traceId
  ].join("\n");
}

async function sendViaResend(input: { to: string; subject: string; body: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, skippedReason: "provider_not_configured" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.HANDOFF_EMAIL_FROM || "LIMM CRM <onboarding@resend.dev>",
      to: input.to,
      subject: input.subject,
      text: input.body
    })
  });

  if (!response.ok) {
    return { sent: false, skippedReason: `provider_error_${response.status}` };
  }
  return { sent: true, skippedReason: "" };
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
  const reasons = handoffReasons(input.decision);
  const trigger = reasons.length > 0;
  const cooldownKey = `${input.lead.id}:${reasons.join("|")}`;
  const now = Date.now();
  const previous = handoffCooldown.get(cooldownKey) ?? 0;
  const cooldownApplied = trigger && previous > 0 && now - previous < HANDOFF_COOLDOWN_MS;

  if (!trigger) {
    return {
      triggered: false,
      sent: false,
      skippedReason: "not_required",
      cooldownApplied: false,
      reasons,
      trace: {
        handoffEmailTriggered: false,
        handoffEmailSent: false,
        handoffEmailSkippedReason: "not_required",
        handoffEmailCooldownApplied: false,
        handoffEmailToMasked: runtime.maskedTo
      }
    };
  }

  if (cooldownApplied) {
    return {
      triggered: true,
      sent: false,
      skippedReason: "cooldown_active",
      cooldownApplied: true,
      reasons,
      trace: {
        handoffEmailTriggered: true,
        handoffEmailSent: false,
        handoffEmailSkippedReason: "cooldown_active",
        handoffEmailCooldownApplied: true,
        handoffEmailToMasked: runtime.maskedTo
      }
    };
  }

  if (!runtime.enabled) {
    handoffCooldown.set(cooldownKey, now);
    return {
      triggered: true,
      sent: false,
      skippedReason: "handoff_email_disabled",
      cooldownApplied: false,
      reasons,
      trace: {
        handoffEmailTriggered: true,
        handoffEmailSent: false,
        handoffEmailSkippedReason: "handoff_email_disabled",
        handoffEmailCooldownApplied: false,
        handoffEmailToMasked: runtime.maskedTo
      }
    };
  }

  if (!runtime.providerConfigured) {
    handoffCooldown.set(cooldownKey, now);
    return {
      triggered: true,
      sent: false,
      skippedReason: "provider_not_configured",
      cooldownApplied: false,
      reasons,
      trace: {
        handoffEmailTriggered: true,
        handoffEmailSent: false,
        handoffEmailSkippedReason: "provider_not_configured",
        handoffEmailCooldownApplied: false,
        handoffEmailToMasked: runtime.maskedTo
      }
    };
  }

  const subject = subjectFor(reasons);
  const body = buildEmailBody({ ...input, reasons });
  const sendResult = await sendViaResend({ to: runtime.to, subject, body });
  handoffCooldown.set(cooldownKey, now);

  return {
    triggered: true,
    sent: sendResult.sent,
    skippedReason: sendResult.skippedReason,
    cooldownApplied: false,
    reasons,
    trace: {
      handoffEmailTriggered: true,
      handoffEmailSent: sendResult.sent,
      handoffEmailSkippedReason: sendResult.skippedReason,
      handoffEmailCooldownApplied: false,
      handoffEmailToMasked: runtime.maskedTo
    }
  };
}
