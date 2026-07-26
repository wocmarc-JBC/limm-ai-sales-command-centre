"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type PriorityConversation = {
  id: string;
  displayName: string;
  phone: string;
  lastMessagePreview: string;
  lastActivityAt: string;
  bossTriageCategory: string;
  bossPriorityScore: number;
  bossTriageReason: string;
  requiresReply: boolean;
  needsMarcus: boolean;
  failedSend: boolean;
};

type PriorityPayload = {
  ok: boolean;
  conversations: PriorityConversation[];
  triage?: {
    requiresReplyCount: number;
    criticalCount: number;
    qualifiedLeadCount: number;
    nonSalesCount: number;
  };
  error?: string;
};

function humanize(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-SG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function MarcusPriorityPanel() {
  const [payload, setPayload] = useState<PriorityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/inbox/conversations?priority=true&limit=100", {
        credentials: "same-origin",
        cache: "no-store"
      });
      const next = await response.json() as PriorityPayload;
      if (!response.ok || !next.ok) throw new Error(next.error || `Priority queue failed with HTTP ${response.status}.`);
      setPayload(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Priority queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const conversations = payload?.conversations ?? [];
  const triage = payload?.triage;

  return (
    <div className="grid gap-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Priority queue summary">
        {[
          ["Needs reply", triage?.requiresReplyCount ?? 0],
          ["Critical", triage?.criticalCount ?? 0],
          ["Qualified leads", triage?.qualifiedLeadCount ?? 0],
          ["Non-sales", triage?.nonSalesCount ?? 0]
        ].map(([label, value]) => (
          <div key={String(label)} className="mission-panel rounded-2xl p-4 shadow-premium">
            <p className="text-xs uppercase tracking-[0.2em] text-command-muted">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-command-text">{value}</p>
          </div>
        ))}
      </section>

      <section className="mission-panel overflow-hidden rounded-2xl shadow-premium">
        <div className="flex flex-col gap-3 border-b border-command-line p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Marcus queue</p>
            <h2 className="mt-1 text-2xl font-semibold text-command-text">What needs attention now</h2>
            <p className="mt-2 text-sm text-command-muted">Critical clients and qualified renovation leads appear before vendors, job seekers, and spam.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-command-line bg-command-panel2 px-4 py-2 text-sm font-semibold text-command-text disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh queue"}
          </button>
        </div>

        {error ? <p className="m-5 rounded-xl border border-command-red/40 bg-command-red/10 p-4 text-sm font-semibold text-command-red" role="alert">{error}</p> : null}
        {!loading && !error && conversations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-lg font-semibold text-command-text">No priority conversations</p>
            <p className="mt-2 text-sm text-command-muted">Nothing currently requires Marcus or operator attention.</p>
          </div>
        ) : null}

        <div className="divide-y divide-command-line/70">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/inbox?lead=${encodeURIComponent(conversation.id)}`}
              className="grid gap-3 p-4 transition hover:bg-white/[0.04] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-base font-semibold text-command-text">{conversation.displayName || conversation.phone}</span>
                  <span className="rounded-full border border-command-gold/35 bg-command-gold/10 px-2 py-0.5 text-[11px] font-semibold text-command-gold">
                    {humanize(conversation.bossTriageCategory)}
                  </span>
                  {conversation.failedSend ? <span className="rounded-full border border-command-red/40 bg-command-red/10 px-2 py-0.5 text-[11px] font-semibold text-command-red">Failed send</span> : null}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-command-text/90">{conversation.lastMessagePreview || "No message preview"}</p>
                <p className="mt-2 text-xs text-command-muted">{conversation.bossTriageReason}</p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                <span className="text-2xl font-semibold text-command-gold">{conversation.bossPriorityScore}</span>
                <span className="text-xs text-command-muted">{formatTime(conversation.lastActivityAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
