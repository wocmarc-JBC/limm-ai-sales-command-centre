import "server-only";

import { getDataMode } from "./data-source";
import { findLeadMessageByProviderId, saveLeadMessage, upsertWhatsAppLead } from "./lead-messages-repository";
import { getSupabaseAdminClient } from "./supabase-admin";
import { hashProviderMessageId } from "@/lib/operations/observability";
import type { ParsedWhatsAppMessage } from "@/lib/whatsapp-parser";

export const WHATSAPP_RECOVERY_RELEASE = "11.1.2";
export const WHATSAPP_OUTBOUND_PROOF_RELEASE = "11.1.3";

export type WhatsAppWebhookFailureSummary = {
  id: string;
  providerMessageIdHash: string;
  senderPhoneMasked: string;
  messageBody: string;
  messageType: string;
  providerTimestamp: string | null;
  failureStage: string;
  errorCode: string;
  safeReason: string;
  attemptCount: number;
  firstFailedAt: string;
  lastFailedAt: string;
  expiresAt: string;
};

export type WhatsAppProductionProofSnapshot = {
  schemaReady: boolean;
  pendingFailureCount: number;
  recoveredLast24hCount: number;
  lastFailureAt: string | null;
  lastRecoveryAt: string | null;
  lastV1112InboundAt: string | null;
  lastReleaseInboundAt: string | null;
  lastReleaseOutboundAt: string | null;
};

function maskPhone(phone: string) {
  const compact = phone.replace(/\s+/g, "");
  if (compact.length <= 4) return compact ? `••${compact.slice(-2)}` : "Unknown sender";
  return `${compact.slice(0, 3)}••••${compact.slice(-3)}`;
}

function recoveryProviderMessageId(providerMessageIdHash: string) {
  return `limm-recovery:${providerMessageIdHash}`;
}

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
      contactName: input.message.contactName.slice(0, 255),
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

export async function listPendingWhatsAppWebhookFailures(limit = 30): Promise<{
  available: boolean;
  items: WhatsAppWebhookFailureSummary[];
}> {
  if (getDataMode() === "Mock Mode") return { available: true, items: [] };
  const admin = getSupabaseAdminClient();
  if (!admin) return { available: false, items: [] };

  const { data, error } = await admin
    .from("whatsapp_webhook_failures")
    .select("id,provider_message_id_hash,sender_phone,message_body,message_type,provider_timestamp,failure_stage,error_code,safe_reason,attempt_count,first_failed_at,last_failed_at,expires_at")
    .is("recovered_at", null)
    .order("last_failed_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) {
    console.warn("whatsapp_failure_queue_degraded", { code: error.code || "read_failed" });
    return { available: false, items: [] };
  }

  return {
    available: true,
    items: (data ?? []).map((row) => ({
      id: String(row.id),
      providerMessageIdHash: String(row.provider_message_id_hash),
      senderPhoneMasked: maskPhone(String(row.sender_phone || "")),
      messageBody: String(row.message_body || ""),
      messageType: String(row.message_type || ""),
      providerTimestamp: row.provider_timestamp ? String(row.provider_timestamp) : null,
      failureStage: String(row.failure_stage || "message_processing"),
      errorCode: String(row.error_code || "message_processing_failed"),
      safeReason: String(row.safe_reason || ""),
      attemptCount: Number(row.attempt_count || 1),
      firstFailedAt: String(row.first_failed_at),
      lastFailedAt: String(row.last_failed_at),
      expiresAt: String(row.expires_at)
    }))
  };
}

export async function recoverWhatsAppWebhookFailureToCrm(failureId: string) {
  if (getDataMode() === "Mock Mode") return { ok: false as const, status: "not_found" as const };
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false as const, status: "unavailable" as const };

  const { data: failure, error } = await admin
    .from("whatsapp_webhook_failures")
    .select("id,provider_message_id_hash,sender_phone,message_body,message_type,provider_timestamp,message_metadata,recovered_at,recovered_lead_id")
    .eq("id", failureId)
    .maybeSingle();
  if (error) throw new Error(`failure_queue_read_failed:${error.code || "unknown"}`);
  if (!failure) return { ok: false as const, status: "not_found" as const };
  if (failure.recovered_at) {
    return {
      ok: true as const,
      status: "already_recovered" as const,
      leadId: failure.recovered_lead_id ? String(failure.recovered_lead_id) : null
    };
  }

  const providerMessageId = recoveryProviderMessageId(String(failure.provider_message_id_hash));
  const existingMessage = await findLeadMessageByProviderId(providerMessageId);
  let leadId = existingMessage?.leadId || "";
  if (!leadId) {
    const metadata = failure.message_metadata && typeof failure.message_metadata === "object"
      ? failure.message_metadata as Record<string, unknown>
      : {};
    const lead = await upsertWhatsAppLead({
      phone: String(failure.sender_phone || ""),
      contactName: typeof metadata.contactName === "string" ? metadata.contactName : "Recovered WhatsApp Contact",
      latestMessage: String(failure.message_body || ""),
      preserveExistingActivity: true
    });
    leadId = lead.id;
    try {
      await saveLeadMessage({
        leadId,
        direction: "inbound",
        body: String(failure.message_body || ""),
        safeToSend: false,
        providerMessageId,
        providerTimestamp: failure.provider_timestamp ? String(failure.provider_timestamp) : null,
        whatsappStatus: "received",
        metadata: {
          ...metadata,
          recoveredFromFailureQueue: true,
          recoveryRelease: WHATSAPP_RECOVERY_RELEASE,
          originalMessageType: String(failure.message_type || "")
        },
        createdAt: failure.provider_timestamp ? String(failure.provider_timestamp) : undefined
      });
    } catch (caught) {
      const concurrentMessage = await findLeadMessageByProviderId(providerMessageId);
      if (!concurrentMessage) throw caught;
      leadId = concurrentMessage.leadId;
    }
  }

  const { error: markerError } = await admin
    .from("whatsapp_webhook_failures")
    .update({ recovered_at: new Date().toISOString(), recovered_lead_id: leadId })
    .eq("id", failureId)
    .is("recovered_at", null);
  if (markerError) throw new Error(`failure_recovery_marker_failed:${markerError.code || "unknown"}`);
  return { ok: true as const, status: "recovered" as const, leadId };
}

export async function getWhatsAppProductionProofSnapshot(): Promise<WhatsAppProductionProofSnapshot> {
  const empty: WhatsAppProductionProofSnapshot = {
    schemaReady: false,
    pendingFailureCount: 0,
    recoveredLast24hCount: 0,
    lastFailureAt: null,
    lastRecoveryAt: null,
    lastV1112InboundAt: null,
    lastReleaseInboundAt: null,
    lastReleaseOutboundAt: null
  };
  const admin = getSupabaseAdminClient();
  if (!admin) return empty;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [pending, recovered, latestFailure, latestRecovery, latestV1112Inbound, latestReleaseInbound, latestReleaseOutbound] = await Promise.all([
    admin.from("whatsapp_webhook_failures").select("id", { count: "exact", head: true }).is("recovered_at", null),
    admin.from("whatsapp_webhook_failures").select("id", { count: "exact", head: true }).gte("recovered_at", since),
    admin.from("whatsapp_webhook_failures").select("last_failed_at").order("last_failed_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("whatsapp_webhook_failures").select("recovered_at").not("recovered_at", "is", null).order("recovered_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("operational_trace_events")
      .select("created_at")
      .eq("event_name", "whatsapp_webhook")
      .eq("stage", "completed")
      .in("status", ["ok", "degraded"])
      .contains("metadata", { releaseVersion: WHATSAPP_RECOVERY_RELEASE })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("operational_trace_events")
      .select("created_at")
      .eq("event_name", "whatsapp_webhook")
      .eq("stage", "completed")
      .in("status", ["ok", "degraded"])
      .contains("metadata", { releaseVersion: WHATSAPP_OUTBOUND_PROOF_RELEASE })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("operational_trace_events")
      .select("created_at")
      .eq("event_name", "whatsapp_webhook")
      .eq("stage", "completed")
      .eq("status", "ok")
      .contains("metadata", { releaseVersion: WHATSAPP_OUTBOUND_PROOF_RELEASE, outboundTerminalProof: true })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);
  if (
    pending.error || recovered.error || latestFailure.error || latestRecovery.error ||
    latestV1112Inbound.error || latestReleaseInbound.error || latestReleaseOutbound.error
  ) return empty;
  return {
    schemaReady: true,
    pendingFailureCount: pending.count ?? 0,
    recoveredLast24hCount: recovered.count ?? 0,
    lastFailureAt: latestFailure.data?.last_failed_at ? String(latestFailure.data.last_failed_at) : null,
    lastRecoveryAt: latestRecovery.data?.recovered_at ? String(latestRecovery.data.recovered_at) : null,
    lastV1112InboundAt: latestV1112Inbound.data?.created_at ? String(latestV1112Inbound.data.created_at) : null,
    lastReleaseInboundAt: latestReleaseInbound.data?.created_at ? String(latestReleaseInbound.data.created_at) : null,
    lastReleaseOutboundAt: latestReleaseOutbound.data?.created_at ? String(latestReleaseOutbound.data.created_at) : null
  };
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
