"use client";

import { useState } from "react";

type ExportFormat = "csv" | "json";

export function ConversationExportPanel() {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [includeQa, setIncludeQa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function downloadExport() {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ format });
      if (includeQa) params.set("includeQa", "true");
      const response = await fetch(`/api/operations/conversation-export?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || `Export failed with HTTP ${response.status}.`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
      const filename = filenameMatch?.[1] || `limm-conversations.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Conversation export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="conversation-export" className="mission-panel rounded-2xl p-5 shadow-premium">
      <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Data & privacy</p>
      <h2 className="mt-1 text-2xl font-semibold text-command-text">Export conversations</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-command-muted">
        Download the protected WhatsApp conversation archive. QA and synthetic records are excluded unless explicitly included. Every export is recorded in the audit log.
      </p>
      <div className="mt-5 grid gap-4 rounded-xl border border-command-line bg-command-bg/55 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-command-text">
            File format
            <select
              value={format}
              onChange={(event) => setFormat(event.target.value as ExportFormat)}
              className="min-h-11 rounded-xl border border-command-line bg-command-panel2 px-3 text-command-text"
            >
              <option value="csv">CSV — spreadsheet analysis</option>
              <option value="json">JSON — complete metadata archive</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-command-line bg-command-panel2 px-3 text-sm font-semibold text-command-text">
            <input
              type="checkbox"
              checked={includeQa}
              onChange={(event) => setIncludeQa(event.target.checked)}
              className="h-5 w-5 accent-command-gold"
            />
            Include QA/test records
          </label>
        </div>
        <button
          type="button"
          onClick={downloadExport}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Preparing export…" : `Download ${format.toUpperCase()}`}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-command-red" role="alert">{error}</p> : null}
      <p className="mt-3 text-xs text-command-muted">Boss access is required. The export is read-only and never sends a WhatsApp message.</p>
    </section>
  );
}
