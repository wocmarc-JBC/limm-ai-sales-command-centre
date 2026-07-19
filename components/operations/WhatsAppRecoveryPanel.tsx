"use client";

import Link from "next/link";
import { useState } from "react";
import type { WhatsAppWebhookFailureSummary } from "@/lib/data/whatsapp-webhook-failures-repository";

function formatSingaporeTime(value: string | null) {
  if (!value) return "Unknown time";
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function WhatsAppRecoveryPanel({
  initialItems,
  initialAvailable
}: {
  initialItems: WhatsAppWebhookFailureSummary[];
  initialAvailable: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [available, setAvailable] = useState(initialAvailable);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string; leadId?: string } | null>(null);

  async function refresh() {
    setBusyId("refresh");
    setNotice(null);
    try {
      const response = await fetch("/api/operations/whatsapp-recovery", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.available) throw new Error("queue_unavailable");
      setItems(Array.isArray(result.items) ? result.items : []);
      setAvailable(true);
    } catch {
      setAvailable(false);
      setNotice({ tone: "error", text: "The recovery queue could not be refreshed. No client message was sent." });
    } finally {
      setBusyId("");
    }
  }

  async function recover(failureId: string) {
    setBusyId(failureId);
    setNotice(null);
    try {
      const response = await fetch("/api/operations/whatsapp-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recover", failureId })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "recovery_failed");
      setItems((current) => current.filter((item) => item.id !== failureId));
      setNotice({
        tone: "ok",
        text: result.status === "already_recovered"
          ? "This inbound message was already recovered. No client reply was sent."
          : "Inbound message recovered into the CRM. No client reply was sent.",
        leadId: typeof result.leadId === "string" ? result.leadId : undefined
      });
    } catch {
      setNotice({ tone: "error", text: "Recovery did not complete. The preserved message remains in the queue and no client reply was sent." });
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-command-line bg-command-card p-5 shadow-premium" aria-labelledby="whatsapp-recovery-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-amber">Boss-only recovery</p>
          <h2 id="whatsapp-recovery-title" className="mt-1 text-xl font-semibold text-command-text">Preserved WhatsApp messages</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-command-muted">Messages appear here only when CRM persistence fails. Recovering writes the original inbound into the lead timeline and never calls the reply planner or Meta send API.</p>
        </div>
        <button type="button" onClick={refresh} disabled={Boolean(busyId)} className="min-h-11 rounded-xl border border-command-line bg-command-bg/55 px-4 py-2 text-sm font-semibold text-command-text disabled:cursor-wait disabled:opacity-60">
          {busyId === "refresh" ? "Refreshing…" : "Refresh queue"}
        </button>
      </div>

      {notice ? (
        <div role="status" className={`mt-4 rounded-xl border p-3 text-sm ${notice.tone === "ok" ? "border-command-green/35 bg-command-green/10 text-command-green" : "border-command-red/35 bg-command-red/10 text-command-red"}`}>
          {notice.text}{notice.leadId ? <> <Link href={`/inbox?lead=${notice.leadId}`} className="font-semibold underline underline-offset-2">Open recovered chat</Link></> : null}
        </div>
      ) : null}

      {!available ? (
        <p className="mt-4 rounded-xl border border-command-amber/35 bg-command-amber/10 p-4 text-sm text-command-amber">Recovery storage is currently unavailable. The live webhook still returns a safe error instead of pretending the message was saved.</p>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-command-green/30 bg-command-green/10 p-4">
          <p className="font-semibold text-command-green">Queue clear</p>
          <p className="mt-1 text-sm text-command-muted">There are no unresolved inbound persistence failures.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-command-amber/30 bg-command-bg/55 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-command-text">{item.senderPhoneMasked} · {item.messageType || "message"}</p>
                  <p className="mt-1 text-xs text-command-muted">Failed {formatSingaporeTime(item.lastFailedAt)} · attempt {item.attemptCount} · {item.errorCode}</p>
                </div>
                <button type="button" onClick={() => recover(item.id)} disabled={Boolean(busyId)} className="min-h-11 rounded-xl border border-command-cyan/45 bg-command-cyan/10 px-4 py-2 text-sm font-semibold text-command-cyan disabled:cursor-wait disabled:opacity-60">
                  {busyId === item.id ? "Recovering…" : "Recover to CRM — no send"}
                </button>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-command-line bg-command-panel p-3 text-sm leading-6 text-command-text">{item.messageBody || "[Inbound message had no text body]"}</p>
              {item.safeReason ? <p className="mt-2 text-xs leading-5 text-command-muted">Safe diagnostic: {item.safeReason}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
