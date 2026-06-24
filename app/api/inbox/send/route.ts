import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  getWhatsAppSendPayloadSummary,
  WhatsAppCloudApiAdapter,
  WhatsAppCloudApiSendError
} from "@/lib/adapters/whatsapp-adapter";
import { requirePermission } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/data/audit-repository";
import { saveLeadMessage } from "@/lib/data/lead-messages-repository";
import { getLeadById, pauseBotForLead, takeOverLead } from "@/lib/data/leads-repository";

function safeWhatsAppError(error: unknown) {
  if (error instanceof WhatsAppCloudApiSendError) {
    return [
      `Meta status ${error.status}`,
      error.metaCode ? `code ${error.metaCode}` : "",
      error.metaMessage ? error.metaMessage : ""
    ].filter(Boolean).join(" - ");
  }
  return error instanceof Error ? error.message : "Unknown WhatsApp send failure.";
}

function safeInput(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function revalidateInboxLeadPaths(leadId: string) {
  revalidatePath("/inbox");
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/audit-log");
}

export async function POST(request: Request) {
  const permission = await requirePermission("control_bot");
  if (!permission.ok) {
    return NextResponse.json({ ok: false, errorCode: "permission_denied", errorMessage: permission.error || "Permission denied." }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errorCode: "invalid_json", errorMessage: "Request body must be valid JSON." }, { status: 400 });
  }

  const leadId = safeInput(payload.leadId);
  const body = safeInput(payload.body);
  const clientTempId = safeInput(payload.clientTempId);
  if (!leadId) return NextResponse.json({ ok: false, errorCode: "missing_lead_id", errorMessage: "Lead id is required." }, { status: 400 });
  if (!body) return NextResponse.json({ ok: false, errorCode: "empty_message", errorMessage: "Reply message is empty." }, { status: 400 });

  const lead = await getLeadById(leadId);
  if (!lead) return NextResponse.json({ ok: false, errorCode: "lead_not_found", errorMessage: "Lead was not found." }, { status: 404 });

  const actor = permission.auth.profile?.fullName ?? "Marcus";
  const actorEmail = permission.auth.profile?.email ?? "";
  const actorId = permission.auth.profile?.id ?? null;
  const adapter = new WhatsAppCloudApiAdapter();
  const payloadSummary = getWhatsAppSendPayloadSummary(lead.phone, body);

  console.info("inbox_whatsapp_manual_reply_payload_summary", {
    leadId,
    phoneNumberIdPresent: payloadSummary.phoneNumberIdPresent,
    toDigitsLength: payloadSummary.toDigitsLength,
    bodyLength: payloadSummary.bodyLength,
    hasMessagingProduct: payloadSummary.hasMessagingProduct,
    hasRecipientType: payloadSummary.hasRecipientType,
    hasTextBody: payloadSummary.hasTextBody,
    graphVersion: payloadSummary.graphVersion,
    clientTempIdPresent: Boolean(clientTempId)
  });

  let sent;
  try {
    sent = await adapter.sendReply(lead.phone, body);
  } catch (error) {
    const reason = safeWhatsAppError(error);
    console.error("inbox_whatsapp_manual_reply_send_failed", {
      leadId,
      reason,
      toDigitsLength: payloadSummary.toDigitsLength,
      bodyLength: payloadSummary.bodyLength,
      clientTempIdPresent: Boolean(clientTempId)
    });

    let failedMessageId = "";
    let failedCreatedAt = new Date().toISOString();
    await saveLeadMessage({
      leadId,
      direction: "outbound",
      body,
      safeToSend: false,
      whatsappStatus: "failed",
      metadata: {
        manualReply: true,
        manualTakeover: true,
        failedBy: actor,
        error: reason,
        clientTempId,
        inboxJsonApiSend: true,
        noTokenLogged: true,
        noAutoPricing: true,
        noCalendarBooking: true,
        noVoiceTranscription: true
      }
    }).then((message) => {
      failedMessageId = message.id;
      failedCreatedAt = message.createdAt;
    }).catch(() => null);
    await pauseBotForLead(leadId, "Manual WhatsApp reply attempted; bot paused for human takeover.", actor).catch(() => null);
    await createAuditLog({
      actorName: actor,
      actorEmail,
      actorId,
      action: "whatsapp_manual_reply_failed",
      entityType: "lead",
      entityId: leadId,
      summary: "Manual WhatsApp reply failed from the fast inbox send API. Error was shown without exposing secrets.",
      metadata: {
        error: reason,
        toDigitsLength: payloadSummary.toDigitsLength,
        bodyLength: payloadSummary.bodyLength,
        manualTakeover: true,
        inboxJsonApiSend: true,
        clientTempIdPresent: Boolean(clientTempId),
        noTokenLogged: true
      }
    }).catch(() => null);
    revalidateInboxLeadPaths(leadId);
    return NextResponse.json({
      ok: false,
      errorCode: "whatsapp_send_failed",
      errorMessage: reason.slice(0, 220),
      leadId,
      messageId: failedMessageId,
      whatsappStatus: "failed",
      createdAt: failedCreatedAt,
      clientTempId
    }, { status: 502 });
  }

  try {
    const saved = await saveLeadMessage({
      leadId,
      direction: "outbound",
      body,
      safeToSend: true,
      providerMessageId: sent.providerMessageId || undefined,
      whatsappStatus: "sent",
      metadata: {
        manualReply: true,
        manualTakeover: true,
        sentBy: actor,
        mode: sent.mode,
        metaMessageId: sent.providerMessageId || "",
        clientTempId,
        inboxJsonApiSend: true,
        replaySafeJsonPost: true,
        noAutoPricing: true,
        noCalendarBooking: true,
        noVoiceTranscription: true
      }
    });
    await takeOverLead(leadId, actor);
    await createAuditLog({
      actorName: actor,
      actorEmail,
      actorId,
      action: "whatsapp_manual_reply_sent",
      entityType: "lead",
      entityId: leadId,
      summary: "Manual WhatsApp reply sent by Marcus/admin from the fast inbox send API and bot paused for human takeover.",
      metadata: {
        providerMessageIdPresent: Boolean(sent.providerMessageId),
        metaMessageId: sent.providerMessageId || "",
        toDigitsLength: payloadSummary.toDigitsLength,
        bodyLength: payloadSummary.bodyLength,
        manualTakeover: true,
        inboxJsonApiSend: true,
        clientTempIdPresent: Boolean(clientTempId),
        noTokenLogged: true
      }
    });
    revalidateInboxLeadPaths(leadId);
    return NextResponse.json({
      ok: true,
      leadId,
      messageId: saved.id,
      providerMessageId: sent.providerMessageId || "",
      whatsappStatus: "sent",
      createdAt: saved.createdAt,
      body: saved.body,
      clientTempId
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Manual reply sent, but the CRM record could not be saved.";
    console.error("inbox_whatsapp_manual_reply_persist_failed", {
      leadId,
      reason,
      providerMessageIdPresent: Boolean(sent.providerMessageId),
      clientTempIdPresent: Boolean(clientTempId)
    });
    return NextResponse.json({
      ok: false,
      errorCode: "outbound_persist_failed",
      errorMessage: reason.slice(0, 220),
      leadId,
      providerMessageId: sent.providerMessageId || "",
      whatsappStatus: "failed",
      clientTempId
    }, { status: 500 });
  }
}
