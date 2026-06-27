import { ActionButton } from "@/components/ActionButton";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { dataHygieneCleanupAction } from "@/lib/actions";
import { can } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import { buildDataHygienePreview, type DataHygieneRecordType } from "@/lib/data-hygiene";

const groups: Array<{ type: DataHygieneRecordType; label: string }> = [
  { type: "lead", label: "Leads" },
  { type: "approval", label: "Approval requests" },
  { type: "project", label: "Project accounts" },
  { type: "payment", label: "Payment records" },
  { type: "client_file", label: "Client files" }
];

export default async function DataHygienePage({ searchParams }: { searchParams?: { changed?: string } }) {
  const auth = await getCurrentProfile();
  const canCleanup = Boolean(auth.profile && can(auth.profile.role, "soft_delete_leads"));

  if (!auth.authenticated || !auth.profile || !canCleanup) {
    return (
      <>
        <PageHeader title="Data Hygiene" eyebrow="Admin only" />
        <section className="mission-panel rounded-2xl p-6 text-command-muted">
          Boss or admin access is required. Cleanup actions are soft archive only and never hard delete production data.
        </section>
      </>
    );
  }

  const preview = await buildDataHygienePreview();

  return (
    <>
      <PageHeader title="Data Hygiene" eyebrow="Production visibility cleanup">
        <a href="/settings#data-visibility" className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-text">
          Settings
        </a>
      </PageHeader>

      <section className="mission-panel mb-6 rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Preview test/demo/QA records</p>
        <p className="mt-2 text-sm leading-6 text-command-muted">
          Records here are suspected by strict production filters, orphan checks, voided/disputed state, or not-won/not-accepted collection rules. Cleanup never hard deletes by default.
        </p>
        {searchParams?.changed ? (
          <p className="mt-3 rounded-xl border border-command-green/40 bg-command-green/10 p-3 text-sm font-semibold text-command-green">
            Data hygiene action recorded for {searchParams.changed} selected record{searchParams.changed === "1" ? "" : "s"}.
          </p>
        ) : null}
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-5">
        <MetricCard label="Suspected total" value={preview.records.length} tone={preview.records.length ? "warn" : "good"} />
        {groups.slice(0, 4).map((group) => (
          <MetricCard key={group.type} label={group.label} value={preview.byType[group.type].length} />
        ))}
      </section>

      <form action={dataHygieneCleanupAction} className="space-y-6">
        <section className="mission-panel rounded-2xl p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Cleanup actions</p>
              <p className="mt-2 text-sm text-command-muted">
                Lead records are marked test/demo and soft archived. Payments/files are voided. Other records are audit-confirmed as dashboard-hidden by strict filters.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton type="submit" name="cleanup_action" value="soft_archive" data-testid="data-hygiene-soft-archive">
                Soft Archive Selected
              </ActionButton>
              <ActionButton type="submit" name="cleanup_action" value="mark_test" tone="muted" data-testid="data-hygiene-mark-test">
                Mark As Test/Demo
              </ActionButton>
              <ActionButton type="submit" name="cleanup_action" value="hide" tone="muted" data-testid="data-hygiene-hide">
                Hide From Dashboards
              </ActionButton>
              <ActionButton type="submit" name="cleanup_action" value="restore" tone="muted" data-testid="data-hygiene-restore">
                Restore Selected
              </ActionButton>
            </div>
          </div>
        </section>

        {groups.map((group) => {
          const records = preview.byType[group.type];
          return (
            <section key={group.type} className="mission-panel rounded-2xl p-5" data-testid={`data-hygiene-${group.type}`}>
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">{group.label}</p>
                  <h2 className="mt-1 text-2xl font-semibold text-command-text">{records.length} suspected record{records.length === 1 ? "" : "s"}</h2>
                </div>
                <p className="text-sm text-command-muted">Preview only until selected.</p>
              </div>

              <div className="mt-5 space-y-3">
                {records.length ? records.map((item) => (
                  <article key={item.recordRef} className="rounded-xl border border-command-line bg-command-bg/55 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <label className="flex min-w-0 gap-3">
                        <input
                          type="checkbox"
                          name="record_ref"
                          value={item.recordRef}
                          className="mt-1 h-5 w-5 accent-command-gold"
                          data-testid={`data-hygiene-select-${item.type}-${item.id}`}
                        />
                        <span className="min-w-0">
                          <span className="block text-lg font-semibold text-command-text">{item.title}</span>
                          <span className="mt-1 block text-sm text-command-muted">{item.subtitle}</span>
                        </span>
                      </label>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                        item.alreadyHidden
                          ? "border-command-line bg-command-card text-command-muted"
                          : "border-command-gold/60 bg-command-gold/10 text-command-gold"
                      }`}>
                        {item.alreadyHidden ? "Already hidden" : "Needs review"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-command-subtle">{item.reasons.join(" | ")}</p>
                  </article>
                )) : (
                  <p className="rounded-xl border border-command-line bg-command-bg/55 p-4 text-command-muted">
                    No suspected {group.label.toLowerCase()} right now.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </form>
    </>
  );
}
