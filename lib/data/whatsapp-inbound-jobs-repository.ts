import "server-only";

import { getSupabaseAdminClient } from "./supabase-admin";
import type { ParsedWhatsAppMessage, ParsedWhatsAppStatus } from "@/lib/whatsapp-parser";
import {
  getWhatsAppJobRetryDelaySeconds,
  isWhatsAppJobTerminal
} from "@/lib/whatsapp-job-reliability";

type JobRow = {
  id: string;
  message: ParsedWhatsAppMessage;
  attempt_count: number;
  max_attempts: number;
  manual_requeue_count: number;
};

type QueueHealthRow = {
  queued_count: number | string | null;
  processing_count: number | string | null;
  dead_letter_count: number | string | null;
  stale_processing_count: number | string | null;
  completed_last_24h_count: number | string | null;
  retry_scheduled_last_24h_count: number | string | null;
  oldest_queued_at: string | null;
  oldest_queued_age_seconds: number | string | null;
  last_dead_letter_at: string | null;
  worker_last_started_at: string | null;
  worker_last_succeeded_at: string | null;
  worker_last_failed_at: string | null;
  worker_status: string | null;
};

export type WhatsAppQueueHealth = {
  available: boolean;
  queuedCount: number;
  processingCount: number;
  deadLetterCount: number;
  staleProcessingCount: number;
  completedLast24hCount: number;
  retryScheduledLast24hCount: number;
  oldestQueuedAt: string | null;
  oldestQueuedAgeSeconds: number;
  lastDeadLetterAt: string | null;
  workerLastStartedAt: string | null;
  workerLastSucceededAt: string | null;
  workerLastFailedAt: string | null;
  workerStatus: string;
};

export type WhatsAppDeadLetterSummary = {
  id: string;
  providerMessageId: string;
  senderPhoneMasked: string;
  messageType: string;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string;
  deadLetteredAt: string | null;
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

export async function completeWhatsAppInboundJob(
  jobId: string,
  attemptCount: number,
  result: Record<string, unknown>,
  durationMs: number
) {
  const { data, error } = await adminClient().rpc("complete_whatsapp_inbound_job", {
    p_job_id: jobId,
    p_attempt_number: attemptCount,
    p_result: result,
    p_duration_ms: Math.max(0, Math.round(durationMs))
  });
  if (error) throw new Error(`WhatsApp job completion failed: ${error.message}`);
  if (!data) throw new Error("WhatsApp job completion rejected because the active attempt no longer owns the lease.");
}

export async function retryWhatsAppInboundJob(input: {
  jobId: string;
  attemptCount: number;
  maxAttempts: number;
  manualRequeueCount: number;
  errorCode: string;
  durationMs: number;
}) {
  const terminal = isWhatsAppJobTerminal(input.attemptCount, input.maxAttempts);
  const delaySeconds = getWhatsAppJobRetryDelaySeconds(input.attemptCount, input.manualRequeueCount);
  const { data, error } = await adminClient().rpc("retry_whatsapp_inbound_job", {
    p_job_id: input.jobId,
    p_attempt_number: input.attemptCount,
    p_error_code: input.errorCode.slice(0, 100),
    p_delay_seconds: delaySeconds,
    p_terminal: terminal,
    p_duration_ms: Math.max(0, Math.round(input.durationMs))
  });
  if (error) throw new Error(`WhatsApp job retry update failed: ${error.message}`);
  if (!data) throw new Error("WhatsApp job retry rejected because the active attempt no longer owns the lease.");
  return { terminal, delaySeconds };
}

function count(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return digits ? `••${digits}` : "Unknown sender";
  return `••••${digits.slice(-4)}`;
}

export async function getWhatsAppQueueHealth(): Promise<WhatsAppQueueHealth> {
  try {
    const { data, error } = await adminClient().rpc("get_whatsapp_queue_health");
    if (error) throw error;
    const row = ((data ?? [])[0] as QueueHealthRow | undefined) ?? null;
    return {
      available: Boolean(row),
      queuedCount: count(row?.queued_count),
      processingCount: count(row?.processing_count),
      deadLetterCount: count(row?.dead_letter_count),
      staleProcessingCount: count(row?.stale_processing_count),
      completedLast24hCount: count(row?.completed_last_24h_count),
      retryScheduledLast24hCount: count(row?.retry_scheduled_last_24h_count),
      oldestQueuedAt: row?.oldest_queued_at ?? null,
      oldestQueuedAgeSeconds: count(row?.oldest_queued_age_seconds),
      lastDeadLetterAt: row?.last_dead_letter_at ?? null,
      workerLastStartedAt: row?.worker_last_started_at ?? null,
      workerLastSucceededAt: row?.worker_last_succeeded_at ?? null,
      workerLastFailedAt: row?.worker_last_failed_at ?? null,
      workerStatus: row?.worker_status || "unknown"
    };
  } catch {
    return {
      available: false,
      queuedCount: 0,
      processingCount: 0,
      deadLetterCount: 0,
      staleProcessingCount: 0,
      completedLast24hCount: 0,
      retryScheduledLast24hCount: 0,
      oldestQueuedAt: null,
      oldestQueuedAgeSeconds: 0,
      lastDeadLetterAt: null,
      workerLastStartedAt: null,
      workerLastSucceededAt: null,
      workerLastFailedAt: null,
      workerStatus: "unavailable"
    };
  }
}

export async function listWhatsAppDeadLetters(limit = 20): Promise<WhatsAppDeadLetterSummary[]> {
  try {
    const { data, error } = await adminClient()
      .from("whatsapp_inbound_jobs")
      .select("id,provider_message_id,message,attempt_count,max_attempts,last_error_code,dead_lettered_at")
      .eq("status", "failed")
      .order("dead_lettered_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 50)));
    if (error) throw error;
    return (data ?? []).map((row) => {
      const message = (row.message ?? {}) as Partial<ParsedWhatsAppMessage>;
      return {
        id: String(row.id),
        providerMessageId: String(row.provider_message_id ?? ""),
        senderPhoneMasked: maskPhone(String(message.senderPhone ?? "")),
        messageType: String(message.type ?? "message"),
        attemptCount: count(row.attempt_count),
        maxAttempts: count(row.max_attempts),
        lastErrorCode: String(row.last_error_code ?? "unknown_processing_error"),
        deadLetteredAt: row.dead_lettered_at ? String(row.dead_lettered_at) : null
      };
    });
  } catch {
    return [];
  }
}

export async function requeueWhatsAppDeadLetter(jobId: string) {
  const { data, error } = await adminClient().rpc("requeue_whatsapp_inbound_job", { p_job_id: jobId });
  if (error) throw new Error(`WhatsApp dead-letter requeue failed: ${error.message}`);
  return Boolean(data);
}

export async function verifyWhatsAppSchedulerToken(token: string) {
  if (token.length < 32) return false;
  const { data, error } = await adminClient().rpc("verify_limm_scheduler_token", { p_token: token });
  return !error && data === true;
}

export async function recordWhatsAppWorkerHeartbeat(input: {
  status: "running" | "healthy" | "degraded" | "failed";
  startedAt: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const row = {
    service_name: "whatsapp_queue_worker",
    status: input.status,
    last_started_at: input.startedAt,
    last_succeeded_at: input.status === "healthy" || input.status === "degraded" ? now : undefined,
    last_failed_at: input.status === "failed" ? now : undefined,
    duration_ms: input.durationMs === undefined ? undefined : Math.max(0, Math.round(input.durationMs)),
    metadata: input.metadata ?? {},
    updated_at: now
  };
  const clean = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
  const { error } = await adminClient().from("reliability_heartbeats").upsert(clean, { onConflict: "service_name" });
  if (error) throw new Error(`WhatsApp worker heartbeat failed: ${error.message}`);
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
