import "server-only";

import { getClientFileRecoverySnapshot } from "./client-file-recovery-repository";
import { getDatabaseRecoverySnapshot } from "./database-recovery-repository";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getWhatsAppQueueHealth } from "./whatsapp-inbound-jobs-repository";
import {
  getReliabilityAlertRuntime,
  sendReliabilityIncidentAlert,
  type ReliabilityAlertResult
} from "@/lib/reliability-alert-email";

export type ReliabilityIncidentSeverity = "warning" | "critical";
export type ReliabilityIncidentStatus = "open" | "acknowledged" | "resolved";

type IncidentCondition = {
  fingerprint: string;
  incidentType: string;
  component: string;
  severity: ReliabilityIncidentSeverity;
  title: string;
  safeSummary: string;
  metadata: Record<string, string | number | boolean | null>;
};

type IncidentRow = {
  id: string;
  fingerprint: string;
  incident_type: string;
  component: string;
  severity: ReliabilityIncidentSeverity;
  status: ReliabilityIncidentStatus;
  title: string;
  safe_summary: string;
  first_detected_at: string;
  last_detected_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  occurrence_count: number | string;
  notification_count: number | string;
  last_notified_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type ReliabilityIncidentSummary = {
  id: string;
  fingerprint: string;
  incidentType: string;
  component: string;
  severity: ReliabilityIncidentSeverity;
  status: ReliabilityIncidentStatus;
  title: string;
  safeSummary: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  occurrenceCount: number;
  notificationCount: number;
  lastNotifiedAt: string | null;
};

export type ReliabilityIncidentSnapshot = {
  available: boolean;
  openCriticalCount: number;
  openWarningCount: number;
  acknowledgedCount: number;
  resolvedLast24hCount: number;
  watchdogLastSucceededAt: string | null;
  watchdogStatus: string;
  alertEnabled: boolean;
  alertProviderConfigured: boolean;
  alertRecipientsConfigured: boolean;
  incidents: ReliabilityIncidentSummary[];
};

export type ReliabilityWatchdogResult = {
  ready: boolean;
  evaluatedAt: string;
  activeCount: number;
  criticalCount: number;
  warningCount: number;
  openedCount: number;
  resolvedCount: number;
  alert: ReliabilityAlertResult;
};

function adminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin credentials are required for reliability incidents.");
  return client;
}

function count(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function mapIncident(row: IncidentRow): ReliabilityIncidentSummary {
  return {
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    incidentType: String(row.incident_type),
    component: String(row.component),
    severity: row.severity,
    status: row.status,
    title: String(row.title),
    safeSummary: String(row.safe_summary ?? ""),
    firstDetectedAt: String(row.first_detected_at),
    lastDetectedAt: String(row.last_detected_at),
    acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    occurrenceCount: count(row.occurrence_count),
    notificationCount: count(row.notification_count),
    lastNotifiedAt: row.last_notified_at ? String(row.last_notified_at) : null
  };
}

function ageMs(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Date.now() - timestamp);
}

function statusCondition(input: Omit<IncidentCondition, "metadata"> & { metadata?: IncidentCondition["metadata"] }): IncidentCondition {
  return { ...input, metadata: input.metadata ?? {} };
}

async function buildConditions(): Promise<IncidentCondition[]> {
  const [queue, files, database] = await Promise.all([
    getWhatsAppQueueHealth(),
    getClientFileRecoverySnapshot(),
    getDatabaseRecoverySnapshot()
  ]);
  const conditions: IncidentCondition[] = [];

  if (!queue.available) {
    conditions.push(statusCondition({
      fingerprint: "whatsapp_queue_unavailable",
      incidentType: "telemetry_unavailable",
      component: "whatsapp_queue",
      severity: "critical",
      title: "Durable inbound queue telemetry is unavailable",
      safeSummary: "The watchdog could not verify the accepted-message queue or worker state."
    }));
  } else {
    const workerAgeSeconds = Math.round(ageMs(queue.workerLastSucceededAt) / 1000);
    if (!Number.isFinite(workerAgeSeconds) || workerAgeSeconds > 180) {
      conditions.push(statusCondition({
        fingerprint: "whatsapp_worker_heartbeat_stale",
        incidentType: "heartbeat_stale",
        component: "whatsapp_worker",
        severity: "critical",
        title: "WhatsApp recovery worker heartbeat is stale",
        safeSummary: "No successful durable queue worker run was observed within the three-minute objective.",
        metadata: { workerAgeSeconds: Number.isFinite(workerAgeSeconds) ? workerAgeSeconds : null, workerStatus: queue.workerStatus }
      }));
    }
    if (queue.oldestQueuedAgeSeconds > 120) {
      conditions.push(statusCondition({
        fingerprint: "whatsapp_queue_delay_over_objective",
        incidentType: "queue_delay",
        component: "whatsapp_queue",
        severity: "critical",
        title: "Accepted WhatsApp message is waiting too long",
        safeSummary: "The oldest durable inbound job is older than the two-minute recovery objective.",
        metadata: { oldestQueuedAgeSeconds: queue.oldestQueuedAgeSeconds, queuedCount: queue.queuedCount }
      }));
    }
    if (queue.staleProcessingCount > 0) {
      conditions.push(statusCondition({
        fingerprint: "whatsapp_processing_lease_stale",
        incidentType: "stale_lease",
        component: "whatsapp_queue",
        severity: "critical",
        title: "WhatsApp processing lease is stale",
        safeSummary: "At least one inbound job exceeded its processing lease and requires automatic recovery.",
        metadata: { staleProcessingCount: queue.staleProcessingCount }
      }));
    }
    if (queue.deadLetterCount > 0) {
      conditions.push(statusCondition({
        fingerprint: "whatsapp_dead_letters_present",
        incidentType: "dead_letter",
        component: "whatsapp_queue",
        severity: "critical",
        title: "WhatsApp inbound job reached the dead-letter queue",
        safeSummary: "A terminal inbound job needs boss review and safe replay.",
        metadata: { deadLetterCount: queue.deadLetterCount }
      }));
    }
  }

  if (!files.available) {
    conditions.push(statusCondition({
      fingerprint: "client_file_recovery_unavailable",
      incidentType: "telemetry_unavailable",
      component: "client_files",
      severity: "critical",
      title: "Client-file recovery evidence is unavailable",
      safeSummary: "The watchdog could not read checksum, backup, or restore evidence."
    }));
  } else {
    const integrityAgeHours = Math.round(ageMs(files.latestIntegrityAt) / 3_600_000);
    if (files.latestIntegrityStatus !== "succeeded" || integrityAgeHours > 26) {
      conditions.push(statusCondition({
        fingerprint: "client_file_integrity_not_current",
        incidentType: "integrity_evidence",
        component: "client_files",
        severity: files.latestIntegrityStatus === "failed" || files.latestIntegrityStatus === "partial" ? "critical" : "warning",
        title: "Client-file integrity evidence is not current",
        safeSummary: "The latest source checksum audit is missing, stale, or did not fully succeed.",
        metadata: { latestStatus: files.latestIntegrityStatus, integrityAgeHours: Number.isFinite(integrityAgeHours) ? integrityAgeHours : null }
      }));
    }
    if (!files.offsiteConfigured) {
      conditions.push(statusCondition({
        fingerprint: "client_file_offsite_recovery_not_configured",
        incidentType: "disaster_recovery_gap",
        component: "client_files",
        severity: "critical",
        title: "Client files have no independent offsite recovery target",
        safeSummary: "Source checksums are available, but same-project Storage is not an independent backup."
      }));
    } else {
      const backupAgeHours = Math.round(ageMs(files.latestBackupAt) / 3_600_000);
      if (files.latestBackupStatus !== "succeeded" || backupAgeHours > 26) {
        conditions.push(statusCondition({
          fingerprint: "client_file_backup_not_current",
          incidentType: "backup_evidence",
          component: "client_files",
          severity: "critical",
          title: "Client-file offsite backup is not current",
          safeSummary: "The latest independent client-file backup is missing, stale, or unsuccessful.",
          metadata: { latestStatus: files.latestBackupStatus, backupAgeHours: Number.isFinite(backupAgeHours) ? backupAgeHours : null }
        }));
      }
      const restoreAgeDays = Math.round(ageMs(files.latestRestoreDrillAt) / 86_400_000);
      if (!files.restoreBucketIsolated || files.latestRestoreDrillStatus !== "succeeded" || restoreAgeDays > 35) {
        conditions.push(statusCondition({
          fingerprint: "client_file_restore_drill_not_current",
          incidentType: "restore_evidence",
          component: "client_files",
          severity: "critical",
          title: "Client-file isolated restore drill is not current",
          safeSummary: "Recovery is not proven until an isolated restore passes within the 35-day evidence window.",
          metadata: { latestStatus: files.latestRestoreDrillStatus, restoreAgeDays: Number.isFinite(restoreAgeDays) ? restoreAgeDays : null, isolated: files.restoreBucketIsolated }
        }));
      }
    }
  }

  if (!database.available) {
    conditions.push(statusCondition({
      fingerprint: "database_recovery_evidence_unavailable",
      incidentType: "telemetry_unavailable",
      component: "database",
      severity: "critical",
      title: "Database recovery evidence is unavailable",
      safeSummary: "The watchdog could not verify independent database backup and restore records."
    }));
  } else if (!database.ready) {
    conditions.push(statusCondition({
      fingerprint: "database_recovery_not_ready",
      incidentType: "disaster_recovery_gap",
      component: "database",
      severity: "critical",
      title: "Database disaster recovery is not proven",
      safeSummary: "A fresh encrypted backup and a recent isolated restore drill are both required for RPO/RTO readiness.",
      metadata: {
        evidenceReporterConfigured: database.evidenceReporterConfigured,
        backupConfigured: database.backupConfigured,
        latestBackupStatus: database.latestBackupStatus,
        backupFresh: database.backupFresh,
        latestRestoreStatus: database.latestRestoreDrillStatus,
        restoreFresh: database.restoreDrillFresh,
        restoreIsolated: database.latestRestoreIsolated
      }
    }));
  }

  const alerts = getReliabilityAlertRuntime();
  if (!alerts.enabled || !alerts.providerConfigured || !alerts.recipientsConfigured) {
    conditions.push(statusCondition({
      fingerprint: "reliability_alert_delivery_not_ready",
      incidentType: "alerting_gap",
      component: "incident_alerting",
      severity: "warning",
      title: "Reliability alert delivery is not ready",
      safeSummary: "Incidents remain visible in Operations, but proactive email delivery is disabled or incomplete.",
      metadata: { enabled: alerts.enabled, providerConfigured: alerts.providerConfigured, recipientsConfigured: alerts.recipientsConfigured }
    }));
  }
  return conditions;
}

async function persistConditions(conditions: IncidentCondition[], evaluatedAt: string) {
  const client = adminClient();
  const { data: activeData, error: activeError } = await client
    .from("reliability_incidents")
    .select("*")
    .in("status", ["open", "acknowledged"])
    .limit(100);
  if (activeError) throw new Error(`Active reliability incident read failed: ${activeError.message}`);
  const active = (activeData ?? []) as IncidentRow[];
  const fingerprints = conditions.map((condition) => condition.fingerprint);
  let matching: IncidentRow[] = [];
  if (fingerprints.length) {
    const { data, error } = await client.from("reliability_incidents").select("*").in("fingerprint", fingerprints);
    if (error) throw new Error(`Reliability incident deduplication read failed: ${error.message}`);
    matching = (data ?? []) as IncidentRow[];
  }

  let openedCount = 0;
  for (const condition of conditions) {
    const existing = matching.find((row) => row.fingerprint === condition.fingerprint);
    const { error } = await client.rpc("upsert_reliability_incident", {
      p_fingerprint: condition.fingerprint,
      p_incident_type: condition.incidentType,
      p_component: condition.component,
      p_severity: condition.severity,
      p_title: condition.title,
      p_safe_summary: condition.safeSummary,
      p_metadata: condition.metadata,
      p_detected_at: evaluatedAt
    });
    if (error) throw new Error(`Reliability incident upsert failed: ${error.message}`);
    if (!existing || existing.status === "resolved") openedCount += 1;
  }

  const activeFingerprints = new Set(fingerprints);
  const resolvedIds = active.filter((row) => !activeFingerprints.has(row.fingerprint)).map((row) => row.id);
  if (resolvedIds.length) {
    const { error } = await client.from("reliability_incidents").update({
      status: "resolved",
      resolved_at: evaluatedAt,
      updated_at: evaluatedAt
    }).in("id", resolvedIds).lt("last_detected_at", evaluatedAt);
    if (error) throw new Error(`Reliability incident resolution failed: ${error.message}`);
  }
  return { openedCount, resolvedCount: resolvedIds.length };
}

async function listActiveIncidentRows() {
  const { data, error } = await adminClient()
    .from("reliability_incidents")
    .select("*")
    .in("status", ["open", "acknowledged"])
    .order("severity", { ascending: true })
    .order("last_detected_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Reliability incident alert read failed: ${error.message}`);
  return (data ?? []) as IncidentRow[];
}

async function notifyDueIncidents(rows: IncidentRow[], evaluatedAt: string) {
  const due = rows.filter((row) => {
    if (row.status !== "open") return false;
    const cooldownMs = row.severity === "critical" ? 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
    return !row.last_notified_at || ageMs(row.last_notified_at) >= cooldownMs;
  });
  if (!due.length) return { sent: false, status: "disabled", providerMessageId: "" } as ReliabilityAlertResult;
  const result = await sendReliabilityIncidentAlert(due.map((row) => ({
    severity: row.severity,
    component: row.component,
    title: row.title,
    safeSummary: row.safe_summary,
    firstDetectedAt: row.first_detected_at
  })));
  if (result.sent) {
    for (const row of due) {
      const { error } = await adminClient().from("reliability_incidents").update({
        last_notified_at: evaluatedAt,
        notification_count: count(row.notification_count) + 1,
        updated_at: evaluatedAt
      }).eq("id", row.id);
      if (error) throw new Error(`Reliability notification evidence update failed: ${error.message}`);
    }
  }
  return result;
}

async function recordWatchdogHeartbeat(status: "healthy" | "degraded" | "failed", startedAt: string, durationMs: number, metadata: Record<string, unknown>) {
  const now = new Date().toISOString();
  const { error } = await adminClient().from("reliability_heartbeats").upsert({
    service_name: "reliability_watchdog",
    status,
    last_started_at: startedAt,
    last_succeeded_at: status === "healthy" || status === "degraded" ? now : undefined,
    last_failed_at: status === "failed" ? now : undefined,
    duration_ms: Math.max(0, Math.round(durationMs)),
    metadata,
    updated_at: now
  }, { onConflict: "service_name" });
  if (error) throw new Error(`Reliability watchdog heartbeat failed: ${error.message}`);
}

export async function runReliabilityWatchdog(): Promise<ReliabilityWatchdogResult> {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  try {
    const conditions = await buildConditions();
    const evaluatedAt = new Date().toISOString();
    const persistence = await persistConditions(conditions, evaluatedAt);
    const active = await listActiveIncidentRows();
    const alert = await notifyDueIncidents(active, evaluatedAt);
    const criticalCount = active.filter((row) => row.severity === "critical").length;
    const warningCount = active.filter((row) => row.severity === "warning").length;
    await recordWatchdogHeartbeat(conditions.length ? "degraded" : "healthy", startedAt, performance.now() - started, {
      activeCount: active.length,
      criticalCount,
      warningCount,
      openedCount: persistence.openedCount,
      resolvedCount: persistence.resolvedCount,
      alertStatus: alert.status,
      releaseVersion: "11.4.0"
    });
    return {
      ready: active.length === 0,
      evaluatedAt,
      activeCount: active.length,
      criticalCount,
      warningCount,
      openedCount: persistence.openedCount,
      resolvedCount: persistence.resolvedCount,
      alert
    };
  } catch (error) {
    await recordWatchdogHeartbeat("failed", startedAt, performance.now() - started, {
      errorCode: error instanceof Error ? error.name : "watchdog_failed",
      releaseVersion: "11.4.0"
    }).catch(() => undefined);
    throw error;
  }
}

export async function getReliabilityIncidentSnapshot(): Promise<ReliabilityIncidentSnapshot> {
  const alert = getReliabilityAlertRuntime();
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [activeResult, resolvedResult, heartbeatResult] = await Promise.all([
      adminClient().from("reliability_incidents").select("*").in("status", ["open", "acknowledged"]).order("last_detected_at", { ascending: false }).limit(50),
      adminClient().from("reliability_incidents").select("id", { count: "exact", head: true }).eq("status", "resolved").gte("resolved_at", since),
      adminClient().from("reliability_heartbeats").select("status,last_succeeded_at").eq("service_name", "reliability_watchdog").maybeSingle()
    ]);
    if (activeResult.error || resolvedResult.error || heartbeatResult.error) throw activeResult.error || resolvedResult.error || heartbeatResult.error;
    const rows = (activeResult.data ?? []) as IncidentRow[];
    return {
      available: true,
      openCriticalCount: rows.filter((row) => row.severity === "critical" && row.status === "open").length,
      openWarningCount: rows.filter((row) => row.severity === "warning" && row.status === "open").length,
      acknowledgedCount: rows.filter((row) => row.status === "acknowledged").length,
      resolvedLast24hCount: resolvedResult.count ?? 0,
      watchdogLastSucceededAt: heartbeatResult.data?.last_succeeded_at ? String(heartbeatResult.data.last_succeeded_at) : null,
      watchdogStatus: String(heartbeatResult.data?.status || "not_run"),
      alertEnabled: alert.enabled,
      alertProviderConfigured: alert.providerConfigured,
      alertRecipientsConfigured: alert.recipientsConfigured,
      incidents: rows.map(mapIncident)
    };
  } catch {
    return {
      available: false,
      openCriticalCount: 0,
      openWarningCount: 0,
      acknowledgedCount: 0,
      resolvedLast24hCount: 0,
      watchdogLastSucceededAt: null,
      watchdogStatus: "unavailable",
      alertEnabled: alert.enabled,
      alertProviderConfigured: alert.providerConfigured,
      alertRecipientsConfigured: alert.recipientsConfigured,
      incidents: []
    };
  }
}

export async function acknowledgeReliabilityIncident(incidentId: string, actorId: string) {
  const now = new Date().toISOString();
  const { data, error } = await adminClient().from("reliability_incidents").update({
    status: "acknowledged",
    acknowledged_at: now,
    acknowledged_by: actorId,
    updated_at: now
  }).eq("id", incidentId).eq("status", "open").select("id").maybeSingle();
  if (error) throw new Error(`Reliability incident acknowledgement failed: ${error.message}`);
  return Boolean(data?.id);
}
