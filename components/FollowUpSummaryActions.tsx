"use client";

import { useState } from "react";

type Props = {
  leadId: string;
  followUpId?: string;
  canSnooze: boolean;
  canMarkDone: boolean;
  disabledReason?: string;
};

export function FollowUpSummaryActions({ leadId, followUpId, canSnooze, canMarkDone, disabledReason }: Props) {
  const [pending, setPending] = useState<"done" | "snooze" | null>(null);
  const [message, setMessage] = useState("");

  async function run(action: "done" | "snooze") {
    setPending(action);
    setMessage("");
    try {
      const response = await fetch("/api/followups/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, leadId, followUpId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        setMessage(data.error || data.reason || "Action failed. Please refresh and try again.");
        return;
      }
      setMessage(action === "done" ? "Marked done." : "Snoozed for one day.");
    } catch {
      setMessage("Action failed. Please check connection and try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={!canMarkDone || pending !== null}
        onClick={() => run("done")}
        className="inline-flex min-h-10 items-center rounded-xl border border-command-line bg-command-card px-3 py-2 text-sm font-semibold text-command-text disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending === "done" ? "Saving..." : "Mark Follow-Up Done"}
      </button>
      <button
        type="button"
        disabled={!canSnooze || pending !== null}
        onClick={() => run("snooze")}
        className="inline-flex min-h-10 items-center rounded-xl border border-command-line bg-command-card px-3 py-2 text-sm font-semibold text-command-text disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending === "snooze" ? "Snoozing..." : "Snooze Follow-Up"}
      </button>
      {message ? <p className="w-full text-sm text-command-cyan">{message}</p> : null}
      {disabledReason ? <p className="w-full text-sm text-command-muted">{disabledReason}</p> : null}
    </div>
  );
}
