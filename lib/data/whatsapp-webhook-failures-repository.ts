import "server-only";

import { getSupabaseAdminClient } from "./supabase-admin";
import { hashProviderMessageId } from "@/lib/operations/observability";
import type { ParsedWhatsAppMessage } from "@/lib/whatsapp-parser";

function inboundBody(message: ParsedWhatsAppMessage) {
  return message.text || message.caption || `[Unsupported WhatsApp ${message.type || "message"} received]`;
}

export function classifyWhatsAppProcessingFailure(error: unknown) {
  const reason = error instanceof Error ? error.message : String(error ?? "");
  if (/lead insert failed[\s\S]*(column|schema cache|PGRST204|42703)/i.test(reason)) {
    return "lead_persistence_schema_mismatch";
  }
  if (/lead (insert|update) failed/i.test(reason)) return "lead_persistence_failed";
  if (/message.*save/i.test(reason)) return "message_persistence_failed";
  return "message_processing_failed";
}

export async function captureWhatsAppWebhookFailure(input: {
  message: ParsedWhatsAppMessage;
  failureStage: string;
  errorCode: string;
  safeReason: string;
}) {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;

  const providerMessageIdHash = hashProviderMessageId(input.message.providerMessageId);
  const { data, error } = await admin.rpc("capture_whatsapp_webhook_failure", {
    p_provider_message_id_hash: providerMessageIdHash,
    p_sender_phone: input.message.senderPhone.slice(0, 64),
    p_message_body: inboundBody(input.message).slice(0, 8192),
    p_message_type: input.message.type.slice(0, 50),
    p_provider_timestamp: input.message.timestamp,
    p_failure_stage: input.failureStage.slice(0, 100),
    p_error_code: input.errorCode.slice(0, 100),
    p_safe_reason: input.safeReason.slice(0, 500),
    p_message_metadata: {
      caption: input.message.caption.slice(0, 4096),
      filename: input.message.filename.slice(0, 255),
      mimeType: input.message.mimeType.slice(0, 120),
      mediaId: input.message.mediaId.slice(0, 255),
      isVoiceMessage: input.message.isVoiceMessage,
      businessPhoneNumberId: input.message.businessPhoneNumberId.slice(0, 64)
    }
  });
  if (error || data !== true) {
    console.warn("whatsapp_failure_capture_degraded", {
      providerMessageIdHash,
      code: error?.code || "capture_not_confirmed"
    });
    return false;
  }
  return true;
}

export async function markWhatsAppWebhookFailureRecovered(input: {
  providerMessageId: string;
  leadId?: string | null;
}) {
  if (!input.providerMessageId || !input.leadId) return false;
  const admin = getSupabaseAdminClient();
  if (!admin) return false;

  const providerMessageIdHash = hashProviderMessageId(input.providerMessageId);
  const { error } = await admin
    .from("whatsapp_webhook_failures")
    .update({
      recovered_at: new Date().toISOString(),
      recovered_lead_id: input.leadId
    })
    .eq("provider_message_id_hash", providerMessageIdHash)
    .is("recovered_at", null);
  if (error) {
    console.warn("whatsapp_failure_recovery_marker_degraded", {
      providerMessageIdHash,
      code: error.code || "update_failed"
    });
    return false;
  }
  return true;
}

export async function purgeExpiredWhatsAppWebhookFailures(now = new Date()) {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, deletedCount: 0 };

  const { count, error } = await admin
    .from("whatsapp_webhook_failures")
    .delete({ count: "exact" })
    .lt("expires_at", now.toISOString());
  if (error) {
    console.warn("whatsapp_failure_retention_degraded", {
      code: error.code || "delete_failed"
    });
    return { ok: false, deletedCount: 0 };
  }
  return { ok: true, deletedCount: count ?? 0 };
}
