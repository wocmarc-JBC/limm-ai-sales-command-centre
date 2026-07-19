import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { WhatsAppRecoveryPanel } from "@/components/operations/WhatsAppRecoveryPanel";
import { getCurrentProfile } from "@/lib/auth/session";
import {
  getWhatsAppProductionProofSnapshot,
  listPendingWhatsAppWebhookFailures
} from "@/lib/data/whatsapp-webhook-failures-repository";
import { getOperationsSloSnapshot } from "@/lib/operations/observability";
import { OPERATIONS_SLOS, WORLD_CLASS_RELEASE } from "@/lib/operations/contracts";

function statusTone(ok: boolean) {
  return ok ? "border-command-green/35 bg-command-green/10 text-command-green" : "border-command-amber/35 bg-command-amber/10 text-command-amber";
}

export default async function OperationsPage() {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile || !["boss", "admin"].includes(auth.profile.role)) {
    return <section className="rounded-2xl border border-command-line bg-command-card p-6 text-command-muted">Boss or admin access is required for operations telemetry.</section>;
  }
  const [snapshot, whatsappProof, recoveryQueue] = await Promise.all([
    getOperationsSloSnapshot(),
    getWhatsAppProductionProofSnapshot(),
    auth.profile.role === "boss"
      ? listPendingWhatsAppWebhookFailures()
      : Promise.resolve({ available: true, items: [] })
  ]);
  const availabilityPassing = snapshot.successRatePercent >= OPERATIONS_SLOS.inboxAvailabilityPercent;
  const latencyPassing = snapshot.p95DurationMs <= OPERATIONS_SLOS.manualSendP95Ms || snapshot.sampleSize === 0;
  return (
    <>
      <PageHeader title="World-Class Operations" eyebrow={`Release v${WORLD_CLASS_RELEASE}`}>
        <a href="/api/operations/canary" className="inline-flex min-h-11 items-center rounded-xl border border-command-cyan/45 bg-command-cyan/10 px-4 py-2 text-sm font-semibold text-command-cyan">Run no-send canary</a>
        <Link href="/system-health" className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-sm font-semibold text-command-muted">System health</Link>
      </PageHeader>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["24h success rate", `${snapshot.successRatePercent}%`, availabilityPassing],
          ["Trace p95", `${snapshot.p95DurationMs} ms`, latencyPassing],
          ["24h completed traces", snapshot.sampleSize, snapshot.sampleSize > 0],
          ["World-class schema", snapshot.schemaReady ? "Ready" : "Migration needed", snapshot.schemaReady]
        ].map(([label, value, ok]) => (
          <article key={String(label)} className={`rounded-2xl border p-5 ${statusTone(Boolean(ok))}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] opacity-80">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-command-text">{String(value)}</p>
          </article>
        ))}
      </section>
      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-command-line bg-command-card p-6 shadow-premium">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-gold">Service objectives</p>
          <h2 className="mt-1 text-xl font-semibold text-command-text">Production guardrails</h2>
          <dl className="mt-4 divide-y divide-command-line">
            {[
              ["Inbox availability", `${OPERATIONS_SLOS.inboxAvailabilityPercent}%`],
              ["Inbox refresh p95", `< ${OPERATIONS_SLOS.inboxRefreshP95Ms} ms`],
              ["Manual send p95", `< ${OPERATIONS_SLOS.manualSendP95Ms} ms`],
              ["Realtime recovery", `< ${OPERATIONS_SLOS.realtimeRecoverySeconds} seconds`],
              ["Trace failure rate", `< ${OPERATIONS_SLOS.traceFailureRatePercent}%`]
            ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3"><dt className="text-command-muted">{label}</dt><dd className="font-semibold text-command-text">{value}</dd></div>)}
          </dl>
        </article>
        <article className="rounded-2xl border border-command-line bg-command-card p-6 shadow-premium">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-cyan">Synthetic proof</p>
          <h2 className="mt-1 text-xl font-semibold text-command-text">Safe planner canary</h2>
          <p className="mt-3 leading-6 text-command-muted">Runs the production intent gate, the single reply planner, reply safety, and quality scoring against a synthetic renovation enquiry. It never calls Meta and never sends a client message.</p>
          <div className="mt-5 rounded-xl border border-command-line bg-command-bg/55 p-4">
            <p className="text-sm text-command-muted">Last canary</p>
            <p className="mt-1 font-semibold text-command-text">{snapshot.lastCanaryAt ? new Date(snapshot.lastCanaryAt).toLocaleString("en-SG") : "Not run since telemetry activation"}</p>
            <p className="mt-1 text-sm capitalize text-command-cyan">{snapshot.lastCanaryStatus.replace(/_/g, " ")}</p>
          </div>
        </article>
      </section>
      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="WhatsApp production proof">
        {[
          ["Persistence contract", whatsappProof.schemaReady ? "Ready" : "Unavailable", whatsappProof.schemaReady],
          ["Unresolved preserved", whatsappProof.pendingFailureCount, whatsappProof.pendingFailureCount === 0],
          ["Recovered in 24h", whatsappProof.recoveredLast24hCount, true],
          ["Fresh v11.1.3 inbound", whatsappProof.lastReleaseInboundAt ? "Observed" : "Awaiting inbound", Boolean(whatsappProof.lastReleaseInboundAt)],
          ["Fresh v11.1.3 outbound", whatsappProof.lastReleaseOutboundAt ? "Sent" : "Awaiting reply", Boolean(whatsappProof.lastReleaseOutboundAt)]
        ].map(([label, value, ok]) => (
          <article key={String(label)} className={`rounded-2xl border p-5 ${statusTone(Boolean(ok))}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] opacity-80">{label}</p>
            <p className="mt-2 text-xl font-semibold text-command-text">{String(value)}</p>
          </article>
        ))}
      </section>
      {auth.profile.role === "boss" ? (
        <WhatsAppRecoveryPanel initialItems={recoveryQueue.items} initialAvailable={recoveryQueue.available} />
      ) : null}
    </>
  );
}
