"use client";

import { useState } from "react";

export function QuotationReadinessGateActions({
  leadId,
  canMove,
  disabledReason
}: {
  leadId: string;
  canMove: boolean;
  disabledReason: string;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function move() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/quotation-readiness/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        setMessage(data.reason || data.error || "Lead is not ready for quotation review.");
        return;
      }
      setMessage("Moved to Quotation Readiness.");
    } catch {
      setMessage("Action failed. Please check connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={!canMove || pending}
        onClick={move}
        className="inline-flex min-h-10 items-center rounded-xl border border-command-gold/60 bg-command-gold/12 px-3 py-2 text-sm font-semibold text-command-gold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Moving..." : "Move to Quotation Review"}
      </button>
      {!canMove ? <p className="w-full text-sm text-command-muted">{disabledReason}</p> : null}
      {message ? <p className="w-full text-sm text-command-cyan">{message}</p> : null}
    </div>
  );
}
