import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import { getDataMode } from "@/lib/data/data-source";
import type { OperationsSloSnapshot } from "./contracts";

type OperationalStatus = "started" | "ok" | "degraded" | "failed";

type OperationalEvent = {
  traceId: string;
  leadId?: string | null;
  eventName: string;
  stage?: string;
  status: OperationalStatus;
  durationMs?: number | null;
  providerMessageId?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
};

const FORBIDDEN_METADATA_KEY = /(body|message|reply|token|secret|password|phone|email|address|name|content|payload)/i;

function safeMetadata(metadata: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(metadata).flatMap(([key, value]) => {
    if (FORBIDDEN_METADATA_KEY.test(key)) return [];
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      const safeValue = typeof value === "string" ? value.slice(0, 160) : value;
      return [[key, safeValue]];
    }
    if (Array.isArray(value)) return [[key, value.slice(0, 12).map((item) => String(item).slice(0, 80))]];
    return [];
  }));
}

export function createTraceId(request?: Request) {
  const supplied = request?.headers.get("x-limm-trace-id") || request?.headers.get("x-request-id") || "";
  return /^[a-zA-Z0-9._:-]{8,128}$/.test(supplied) ? supplied : randomUUID();
}

export function hashProviderMessageId(value?: string) {
  if (!value) return "";
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export async function recordOperationalEvent(event: OperationalEvent) {
  const row = {
    trace_id: event.traceId,
    lead_id: event.leadId || null,
    event_name: event.eventName,
    stage: event.stage || "",
    status: event.status,
    duration_ms: typeof event.durationMs === "number" ? Math.max(0, Math.round(event.durationMs)) : null,
    provider_message_id_hash: hashProviderMessageId(event.providerMessageId),
    error_code: (event.errorCode || "").slice(0, 100),
    metadata: safeMetadata(event.metadata)
  };

  const log = { type: "limm_operation", ...row };
  if (event.status === "failed") console.error(JSON.stringify(log));
  else if (event.status === "degraded") console.warn(JSON.stringify(log));
  else console.info(JSON.stringify(log));

  if (getDataMode() === "Mock Mode") return false;
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("operational_trace_events").insert(row);
  if (error) {
    console.warn(JSON.stringify({ type: "limm_telemetry_degraded", traceId: event.traceId, code: error.code || "insert_failed" }));
    return false;
  }
  return true;
}

export async function withOperationalTrace<T>(
  input: Omit<OperationalEvent, "status" | "durationMs">,
  work: () => Promise<T>
) {
  const startedAt = performance.now();
  await recordOperationalEvent({ ...input, status: "started" }).catch(() => false);
  try {
    const result = await work();
    await recordOperationalEvent({ ...input, status: "ok", durationMs: performance.now() - startedAt }).catch(() => false);
    return result;
  } catch (error) {
    await recordOperationalEvent({
      ...input,
      status: "failed",
      durationMs: performance.now() - startedAt,
      errorCode: error instanceof Error ? error.name : "unknown_error"
    }).catch(() => false);
    throw error;
  }
}

function percentile95(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] || 0;
}

export async function getOperationsSloSnapshot(): Promise<OperationsSloSnapshot> {
  const empty: OperationsSloSnapshot = {
    schemaReady: false,
    sampleSize: 0,
    successRatePercent: 100,
    failureRatePercent: 0,
    p95DurationMs: 0,
    lastCanaryAt: null,
    lastCanaryStatus: "not_run"
  };
  if (getDataMode() === "Mock Mode") return empty;
  const admin = getSupabaseAdminClient();
  if (!admin) return empty;

  const [{ data: readyData, error: readyError }, { data: events, error: eventsError }] = await Promise.all([
    admin.rpc("world_class_operations_schema_ready"),
    admin
      .from("operational_trace_events")
      .select("event_name,status,duration_ms,created_at")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(2000)
  ]);
  if (readyError || eventsError) return empty;

  const rows = events ?? [];
  const completed = rows.filter((row) => row.status !== "started");
  const failed = completed.filter((row) => row.status === "failed");
  const canary = rows.find((row) => row.event_name === "synthetic_pipeline_canary" && row.status !== "started");
  const durations = completed.flatMap((row) => typeof row.duration_ms === "number" ? [row.duration_ms] : []);
  const failureRate = completed.length ? (failed.length / completed.length) * 100 : 0;
  return {
    schemaReady: readyData === true,
    sampleSize: completed.length,
    successRatePercent: Number((100 - failureRate).toFixed(2)),
    failureRatePercent: Number(failureRate.toFixed(2)),
    p95DurationMs: percentile95(durations),
    lastCanaryAt: canary?.created_at ?? null,
    lastCanaryStatus: canary?.status ?? "not_run"
  };
}
