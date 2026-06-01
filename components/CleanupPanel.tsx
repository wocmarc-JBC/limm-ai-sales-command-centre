"use client";

import type { FormEvent } from "react";
import { ActionButton } from "@/components/ActionButton";

type CleanupSample = {
  id: string;
  name: string;
  reason: string;
  status: string;
};

export function CleanupPanel({
  action,
  scanned,
  targets,
  protectedCount,
  uncertain,
  alreadySoftDeleted,
  samples
}: {
  action: (formData: FormData) => void | Promise<void>;
  scanned: number;
  targets: number;
  protectedCount: number;
  uncertain: number;
  alreadySoftDeleted: number;
  samples: CleanupSample[];
}) {
  const confirmSoftDelete = (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm("Soft-delete clearly identified test leads? Marcus, Fio, and Fion are protected.")) event.preventDefault();
  };
  const confirmHardDelete = (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm("Permanently delete only already-soft-deleted test leads? Audit must pass first.")) event.preventDefault();
  };

  return (
    <section id="test-lead-cleanup" className="mission-panel mt-6 rounded-2xl p-6 shadow-premium">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Delete / Cleanup</p>
          <h2 className="mt-1 text-2xl font-semibold text-command-text">Live Test Lead Cleanup</h2>
          <p className="mt-2 max-w-3xl text-base text-command-muted">
            This dry run scans live CRM data from the server. Default cleanup only soft-deletes clear QA/test leads and hides them from the active dashboard.
            Marcus, Fio, and Fion are excluded completely if their names appear anywhere in the lead or messages.
          </p>
        </div>
        <a href="/settings#test-lead-cleanup" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-command-line bg-command-card px-4 py-2 font-semibold text-command-text hover:border-command-cyan/70">
          Scan Test Leads
        </a>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-5">
        {[
          ["Leads scanned", scanned],
          ["Test leads found", targets],
          ["Marcus/Fio/Fion protected", protectedCount],
          ["Uncertain skipped", uncertain],
          ["Soft-deleted test leads", alreadySoftDeleted]
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
            <p className="text-sm text-command-muted">{label}</p>
            <p className="mt-1 text-3xl font-semibold text-command-text">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-command-line bg-command-bg/55 p-4">
        <p className="font-semibold text-command-text">Dry-run sample</p>
        <div className="mt-3 space-y-2">
          {samples.length ? samples.map((sample) => (
            <div key={sample.id} className="grid gap-2 rounded-xl border border-command-line bg-command-card p-3 text-sm md:grid-cols-[1.2fr_0.7fr_2fr]">
              <span className="font-semibold text-command-text">{sample.name}</span>
              <span className="text-command-cyan">{sample.status}</span>
              <span className="text-command-muted">{sample.reason}</span>
            </div>
          )) : (
            <p className="text-command-muted">No clear test leads found in the current dry run.</p>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <form action={action} onSubmit={confirmSoftDelete} className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
          <input type="hidden" name="cleanup_mode" value="soft_delete" />
          <p className="font-semibold text-command-text">Default cleanup</p>
          <p className="mt-2 text-sm leading-6 text-command-muted">
            Soft delete clear test leads and mark them as test data. Real-looking uncertain leads are skipped.
          </p>
          <div className="mt-4">
            <ActionButton type="submit" tone="primary" disabled={targets === 0}>
              Soft Delete Test Leads
            </ActionButton>
          </div>
        </form>

        <form action={action} onSubmit={confirmHardDelete} className="rounded-2xl border border-command-red/50 bg-command-red/10 p-4">
          <input type="hidden" name="cleanup_mode" value="hard_delete_soft_deleted" />
          <p className="font-semibold text-command-text">Danger Zone</p>
          <p className="mt-2 text-sm leading-6 text-command-muted">
            Permanently delete only already-soft-deleted test leads. This is never the default and Marcus/Fio/Fion remain protected.
          </p>
          <div className="mt-4">
            <ActionButton type="submit" tone="danger" disabled={alreadySoftDeleted === 0}>
              Permanently Delete Soft-Deleted Test Leads
            </ActionButton>
          </div>
        </form>
      </div>
    </section>
  );
}
