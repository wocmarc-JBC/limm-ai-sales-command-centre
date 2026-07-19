import "server-only";

import { getSupabaseAdminClient } from "./supabase-admin";
import type { ParsedWhatsAppMessage, ParsedWhatsAppStatus } from "@/lib/whatsapp-parser";

type JobRow = {
  id: string;
  message: ParsedWhatsAppMessage;
  attempt_count: number;
};

function adminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin credentials are required for durable WhatsApp ingestion.");
  return client;
}

export async function enqueueWhatsAppInboundMessages(messages: ParsedWhatsAppMessage[]) {
  if (!messages.length) return [] as string[];
  const rows = messages.map((message) => ({
    provider_message_id: message.providerMessageId,
    message,
    status: "queued",
    available_at: new Date().toISOString()
  }));
  const { data, error } = await adminClient()
    .from("whatsapp_inbound_jobs")
    .upsert(rows, { onConflict: "provider_message_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`WhatsApp durable enqueue failed: ${error.message}`);

  if (data?.length) return data.map((row) => String(row.id));
  const { data: existing, error: lookupError } = await adminClient()
    .from("whatsapp_inbound_jobs")
    .select("id")
    .in("provider_message_id", messages.map((message) => message.providerMessageId));
  if (lookupError) throw new Error(`WhatsApp durable enqueue lookup failed: ${lookupError.message}`);
  return (existing ?? []).map((row) => String(row.id));
}

export async function claimWhatsAppInboundJob(jobId?: string) {
  const { data, error } = await adminClient().rpc("claim_whatsapp_inbound_job", { p_job_id: jobId ?? null });
  if (error) throw new Error(`WhatsApp job claim failed: ${error.message}`);
  return ((data ?? [])[0] as JobRow | undefined) ?? null;
}

export async function completeWhatsAppInboundJob(jobId: string, result: Record<string, unknown>) {
  const { error } = await adminClient().from("whatsapp_inbound_jobs").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    locked_at: null,
    last_error_code: "",
    result,
    updated_at: new Date().toISOString()
  }).eq("id", jobId);
  if (error) throw new Error(`WhatsApp job completion failed: ${error.message}`);
}

export async function retryWhatsAppInboundJob(jobId: string, attemptCount: number, errorCode: string) {
  const terminal = attemptCount >= 8;
  const delaySeconds = Math.min(300, 2 ** Math.max(1, attemptCount));
  const { error } = await adminClient().from("whatsapp_inbound_jobs").update({
    status: terminal ? "failed" : "queued",
    available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    locked_at: null,
    last_error_code: errorCode.slice(0, 100),
    updated_at: new Date().toISOString()
  }).eq("id", jobId);
  if (error) throw new Error(`WhatsApp job retry update failed: ${error.message}`);
}

export async function applyWhatsAppDeliveryStatuses(statuses: ParsedWhatsAppStatus[]) {
  for (const status of statuses) {
    const { error } = await adminClient().rpc("apply_whatsapp_delivery_status", {
      p_provider_message_id: status.providerMessageId,
      p_status: status.status,
      p_provider_timestamp: status.timestamp,
      p_recipient_phone: status.recipientPhone,
      p_error_code: status.errorCode,
      p_error_title: status.errorTitle,
      p_raw_metadata: status.metadata
    });
    if (error) throw new Error(`WhatsApp delivery receipt persistence failed: ${error.message}`);
  }
  return statuses.length;
}
