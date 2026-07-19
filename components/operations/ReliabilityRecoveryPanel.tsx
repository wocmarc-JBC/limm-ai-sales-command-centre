"use client";

import { useEffect, useState } from "react";
import type { ClientFileRecoverySnapshot } from "@/lib/data/client-file-recovery-repository";
import type { WhatsAppDeadLetterSummary, WhatsAppQueueHealth } from "@/lib/data/whatsapp-inbound-jobs-repository";

function formatTime(value: string | null) {
  if (!value) return "Not yet observed";
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function tone(ok: boolean) {
  return ok
    ? "border-command-green/35 bg-command-green/10 text-command-green"
    : "border-command-amber/35 bg-command-amber/10 text-command-amber";
}

export function ReliabilityRecoveryPanel({
  initialQueue,
  initialFiles,
  initialDeadLetters,
  boss
}: {
  initialQueue: WhatsAppQueueHealth;
  initialFiles: ClientFileRecoverySnapshot;
  initialDeadLetters: WhatsAppDeadLetterSummary[];
  boss: boolean;
}) {
  const [queue, setQueue] = useState(initialQueue);
  const [files, setFiles] = useState(initialFiles);
  const [deadLetters, setDeadLetters] = useState(initialDeadLetters);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh() {
    const response = await fetch("/api/operations/reliability", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "refresh_failed");
    setQueue(result.queue);
    setFiles(result.files);
    setDeadLetters(Array.isArray(result.deadLetters) ? result.deadLetters : []);
  }

  async function run(action: string, jobId = "") {
    setBusy(jobId || action);
    setNotice(null);
    try {
      const response = await fetch("/api/operations/reliability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, jobId })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (result.result?.status === "not_configured") {
          throw new Error("Offsite target is not configured yet. Integrity checks remain available.");
        }
        throw new Error(result.error || result.result?.errorCode || "operation_failed");
      }
      await refresh();
      setNotice({
        ok: true,
        text: action === "requeue_job"
          ? "Dead letter requeued through the idempotent live handler. The original provider message ID still prevents duplicate processing."
          : action === "run_integrity"
            ? "Client-file checksum audit completed and evidence was recorded."
            : action === "run_backup"
              ? "Offsite backup and immutable manifest completed."
              : "Restore drill completed and temporary restored objects were removed."
      });
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message.replace(/_/g, " ") : "Reliability operation failed." });
    } finally {
      setBusy("");
    }
  }

  const workerFresh = Boolean(now && queue.workerLastSucceededAt) && now - new Date(queue.workerLastSucceededAt!).getTime() < 3 * 60 * 1000;
  const queueHealthy = queue.available && queue.deadLetterCount === 0 && queue.staleProcessingCount === 0 && workerFresh;
  const integrityHealthy = files.latestIntegrityStatus === "succeeded";
  const backupHealthy = files.offsiteConfigured && files.latestBackupStatus === "succeeded";
  const restoreHealthy = files.restoreBucketIsolated && files.latestRestoreDrillStatus === "succeeded";

  return (
    <section className="mt-5 rounded-2xl border border-command-line bg-command-card p-5 shadow-premium" aria-labelledby="reliability-recovery-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-cyan">Reliability & disaster recovery</p>
          <h2 id="reliability-recovery-title" className="mt-1 text-xl font-semibold text-command-text">Recovery control plane</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-command-muted">Minute-level durable retries, expired-lease recovery, dead-letter replay, file checksums, offsite manifests and restore-drill evidence.</p>
        </div>
        <button type="button" onClick={() => { setBusy("refresh"); refresh().catch(() => setNotice({ ok: false, text: "Reliability status could not be refreshed." })).finally(() => setBusy("")); }} disabled={Boolean(busy)} className="min-h-11 rounded-xl border border-command-line bg-command-bg/55 px-4 py-2 text-sm font-semibold text-command-text disabled:opacity-60">
          {busy === "refresh" ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {notice ? <p role="status" className={`mt-4 rounded-xl border p-3 text-sm ${tone(notice.ok)}`}>{notice.text}</p> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Queue recovery", queueHealthy ? "Healthy" : "Attention", queueHealthy, `Last worker ${formatTime(queue.workerLastSucceededAt)}`],
          ["Dead letters", queue.deadLetterCount, queue.deadLetterCount === 0, `${queue.retryScheduledLast24hCount} retries in 24h`],
          ["File integrity", integrityHealthy ? "Verified" : files.latestIntegrityStatus.replace(/_/g, " "), integrityHealthy, formatTime(files.latestIntegrityAt)],
          ["Offsite restore", restoreHealthy ? "Drill passed" : backupHealthy ? "Drill due" : "Not ready", restoreHealthy, files.offsiteConfigured ? formatTime(files.latestRestoreDrillAt) : "Independent target required"]
        ].map(([label, value, ok, helper]) => (
          <article key={String(label)} className={`rounded-xl border p-4 ${tone(Boolean(ok))}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.13em] opacity-80">{String(label)}</p>
            <p className="mt-2 text-xl font-semibold text-command-text capitalize">{String(value)}</p>
            <p className="mt-1 text-xs text-command-muted">{String(helper)}</p>
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <article className="rounded-xl border border-command-line bg-command-bg/45 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-command-text">Durable inbound queue</h3>
              <p className="mt-1 text-sm text-command-muted">Queued {queue.queuedCount} · Processing {queue.processingCount} · Stale leases {queue.staleProcessingCount}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone(workerFresh)}`}>{workerFresh ? "≤ 3 min heartbeat" : "Heartbeat stale"}</span>
          </div>
          <dl className="mt-4 divide-y divide-command-line text-sm">
            <div className="flex justify-between gap-4 py-2"><dt className="text-command-muted">Completed in 24h</dt><dd className="font-semibold text-command-text">{queue.completedLast24hCount}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-command-muted">Oldest queued age</dt><dd className="font-semibold text-command-text">{queue.oldestQueuedAgeSeconds}s</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-command-muted">Last dead letter</dt><dd className="font-semibold text-command-text">{formatTime(queue.lastDeadLetterAt)}</dd></div>
          </dl>
        </article>

        <article className="rounded-xl border border-command-line bg-command-bg/45 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-command-text">Client-file recovery</h3>
              <p className="mt-1 text-sm text-command-muted">35 daily manifests · 12 monthly manifests · content-addressed objects</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone(files.offsiteConfigured)}`}>{files.offsiteConfigured ? "Offsite configured" : "Offsite target missing"}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => run("run_integrity")} disabled={Boolean(busy)} className="min-h-11 rounded-xl border border-command-cyan/45 bg-command-cyan/10 px-4 py-2 text-sm font-semibold text-command-cyan disabled:opacity-60">{busy === "run_integrity" ? "Checking…" : "Verify checksums"}</button>
            {boss ? <button type="button" onClick={() => run("run_backup")} disabled={Boolean(busy) || !files.offsiteConfigured} className="min-h-11 rounded-xl border border-command-gold/45 bg-command-gold/10 px-4 py-2 text-sm font-semibold text-command-gold disabled:opacity-50">{busy === "run_backup" ? "Backing up…" : "Run offsite backup"}</button> : null}
            {boss ? <button type="button" onClick={() => run("run_restore_drill")} disabled={Boolean(busy) || !files.offsiteConfigured} className="min-h-11 rounded-xl border border-command-line bg-command-panel px-4 py-2 text-sm font-semibold text-command-text disabled:opacity-50">{busy === "run_restore_drill" ? "Restoring…" : "Run restore drill"}</button> : null}
          </div>
          {!files.offsiteConfigured ? <p className="mt-3 text-xs leading-5 text-command-amber">Source integrity is protected now. True disaster recovery remains fail-closed until a private S3-compatible destination is configured; same-project Storage is not counted as a backup.</p> : null}
        </article>
      </div>

      {boss ? (
        <div className="mt-5 rounded-xl border border-command-line bg-command-bg/45 p-4">
          <h3 className="font-semibold text-command-text">Dead-letter queue</h3>
          <p className="mt-1 text-sm text-command-muted">Only terminal jobs appear here. Requeue preserves attempt history and passes through the existing provider-ID duplicate guard.</p>
          {deadLetters.length ? <div className="mt-3 grid gap-2">{deadLetters.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-command-amber/30 bg-command-amber/5 p-3">
              <div><p className="text-sm font-semibold text-command-text">{item.senderPhoneMasked} · {item.messageType}</p><p className="mt-1 text-xs text-command-muted">Attempt {item.attemptCount}/{item.maxAttempts} · {item.lastErrorCode} · {formatTime(item.deadLetteredAt)}</p></div>
              <button type="button" onClick={() => run("requeue_job", item.id)} disabled={Boolean(busy)} className="min-h-11 rounded-xl border border-command-amber/45 bg-command-amber/10 px-4 py-2 text-sm font-semibold text-command-amber disabled:opacity-60">{busy === item.id ? "Requeueing…" : "Requeue safely"}</button>
            </div>
          ))}</div> : <p className="mt-3 rounded-lg border border-command-green/30 bg-command-green/10 p-3 text-sm text-command-green">No terminal inbound jobs.</p>}
        </div>
      ) : null}
    </section>
  );
}
