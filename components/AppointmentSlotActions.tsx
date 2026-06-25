"use client";

import { useState } from "react";

export function AppointmentSlotActions({
  leadId,
  message
}: {
  leadId?: string;
  message: string;
}) {
  const [notice, setNotice] = useState("");

  async function copyMessage() {
    setNotice("");
    try {
      await navigator.clipboard.writeText(message);
      setNotice("Appointment message copied.");
    } catch {
      setNotice("Copy failed. Highlight and copy the slot message manually.");
    }
  }

  const disabledReason = "Select a lead first to offer this appointment slot.";

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-xl border border-command-line bg-command-bg/55 p-3 text-sm leading-6 text-command-muted">
        {message}
      </div>
      {notice ? (
        <div className="rounded-xl border border-command-green/50 bg-command-green/10 px-3 py-2 text-sm font-semibold text-command-green">
          {notice}
        </div>
      ) : null}
      <div className="grid gap-2">
        {leadId ? (
          <a
            href={`/inbox?lead=${encodeURIComponent(leadId)}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 font-semibold text-black transition hover:bg-command-goldHover"
          >
            Offer to Lead
          </a>
        ) : (
          <button
            type="button"
            disabled
            title={disabledReason}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-command-line bg-command-card px-4 py-2 font-semibold text-command-subtle disabled:cursor-not-allowed disabled:opacity-60"
          >
            Offer to Lead
          </button>
        )}
        {!leadId ? <p className="text-xs text-command-muted">{disabledReason}</p> : null}
        <button
          type="button"
          onClick={copyMessage}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-command-cyan/60 bg-command-cyan/10 px-4 py-2 font-semibold text-command-cyan transition hover:bg-command-cyan/15"
        >
          Copy Slot Message
        </button>
        <button
          type="button"
          disabled
          title="Reservation storage not enabled yet."
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-command-line bg-command-card px-4 py-2 font-semibold text-command-subtle disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reserve Slot
        </button>
        <p className="text-xs text-command-muted">Reservation storage not enabled yet.</p>
        <button
          type="button"
          disabled
          title="Blocking slots is not enabled yet."
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-command-line bg-command-card px-4 py-2 font-semibold text-command-subtle disabled:cursor-not-allowed disabled:opacity-60"
        >
          Block Slot
        </button>
        <p className="text-xs text-command-muted">Blocking slots is not enabled yet.</p>
        <a
          href="/settings#appointment-settings"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-command-line bg-command-card px-4 py-2 font-semibold text-command-text transition hover:border-command-gold/60"
        >
          Open Appointment Settings
        </a>
      </div>
    </div>
  );
}
