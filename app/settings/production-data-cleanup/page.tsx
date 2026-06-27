import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";
import { softArchiveProductionNoiseRecordsAction } from "@/lib/actions";
import { can } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import { listLeads } from "@/lib/data/leads-repository";
import { formatLeadDisplayName, formatFullPhoneForProtectedApp } from "@/lib/lead-display";
import { getProductionLeadVisibilityReasons, productionVisibilityNoiseTerms } from "@/lib/production-visibility";
import { isProtectedLead } from "@/lib/test-lead-cleanup";

export default async function ProductionDataCleanupPage({ searchParams }: { searchParams?: { archived?: string } }) {
  const auth = await getCurrentProfile();
  const canCleanup = Boolean(auth.profile && can(auth.profile.role, "soft_delete_leads"));

  if (!auth.authenticated || !auth.profile) {
    return (
      <>
        <PageHeader title="Production Data Cleanup" eyebrow="Admin only" />
        <section className="mission-panel rounded-2xl p-6 text-command-muted">
          Login required before production cleanup preview can load.
        </section>
      </>
    );
  }

  if (!canCleanup) {
    return (
      <>
        <PageHeader title="Production Data Cleanup" eyebrow="Admin only" />
        <section className="mission-panel rounded-2xl p-6 text-command-muted">
          Boss or admin access is required. This page previews hidden test/demo records and never hard deletes data.
        </section>
      </>
    );
  }

  const leads = await listLeads({ includeInactive: true, includeTest: true });
  const previewRows = leads
    .map((lead) => {
      const reasons = getProductionLeadVisibilityReasons(lead);
      const protectedRecord = isProtectedLead(lead);
      const alreadyHidden = Boolean(lead.archivedAt || lead.deletedAt);
      return { lead, reasons, protectedRecord, alreadyHidden, selectable: reasons.length > 0 && !protectedRecord && !alreadyHidden };
    })
    .filter((item) => item.reasons.length > 0)
    .sort((a, b) => Number(b.selectable) - Number(a.selectable) || (b.lead.updatedAt ?? b.lead.createdAt).localeCompare(a.lead.updatedAt ?? a.lead.createdAt));
  const selectableRows = previewRows.filter((item) => item.selectable);

  return (
    <>
      <PageHeader title="Production Data Cleanup" eyebrow="Soft archive only">
        <a href="/settings#data-visibility" className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-text transition hover:border-command-cyan/60">
          Back to Settings
        </a>
      </PageHeader>

      <section className="mission-panel mb-6 rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Preview test/demo records</p>
        <p className="mt-2 text-sm leading-6 text-command-muted">
          This page finds records hidden by the production visibility filter: {productionVisibilityNoiseTerms.join(", ")}. Select lead records to soft archive. It does not hard delete production data.
        </p>
        {searchParams?.archived ? (
          <p className="mt-3 rounded-xl border border-command-green/40 bg-command-green/10 p-3 text-sm font-semibold text-command-green">
            Soft archive completed for {searchParams.archived} selected record{searchParams.archived === "1" ? "" : "s"}.
          </p>
        ) : null}
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
          <p className="text-sm text-command-muted">Detected records</p>
          <p className="mt-1 text-3xl font-semibold text-command-text">{previewRows.length}</p>
        </div>
        <div className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
          <p className="text-sm text-command-muted">Selectable</p>
          <p className="mt-1 text-3xl font-semibold text-command-text">{selectableRows.length}</p>
        </div>
        <div className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
          <p className="text-sm text-command-muted">Already hidden</p>
          <p className="mt-1 text-3xl font-semibold text-command-text">{previewRows.filter((item) => item.alreadyHidden).length}</p>
        </div>
        <div className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
          <p className="text-sm text-command-muted">Protected skipped</p>
          <p className="mt-1 text-3xl font-semibold text-command-text">{previewRows.filter((item) => item.protectedRecord).length}</p>
        </div>
      </section>

      <form action={softArchiveProductionNoiseRecordsAction} className="mission-panel rounded-2xl p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Soft archive selected records</p>
            <p className="mt-2 text-sm text-command-muted">Only selectable lead records are submitted. Archived, soft-deleted, and protected records are preview-only.</p>
          </div>
          <ActionButton type="submit" disabled={selectableRows.length === 0}>
            Soft Archive Selected
          </ActionButton>
        </div>

        <div className="mt-5 space-y-3">
          {previewRows.length ? previewRows.slice(0, 120).map(({ lead, reasons, protectedRecord, alreadyHidden, selectable }) => (
            <article key={lead.id} className="rounded-xl border border-command-line bg-command-bg/55 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <label className="flex min-w-0 gap-3">
                  <input
                    type="checkbox"
                    name="lead_id"
                    value={lead.id}
                    disabled={!selectable}
                    className="mt-1 h-5 w-5 accent-command-gold disabled:opacity-30"
                  />
                  <span className="min-w-0">
                    <span className="block text-lg font-semibold text-command-text">{formatLeadDisplayName(lead)}</span>
                    <span className="block text-sm text-command-cyan">{formatFullPhoneForProtectedApp(lead.phone)}</span>
                    <span className="mt-1 block text-sm text-command-muted">{lead.scopeSummary || lead.lastClientMessage || "No scope/message preview"}</span>
                  </span>
                </label>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                  protectedRecord
                    ? "border-command-amber/60 bg-command-amber/10 text-command-amber"
                    : alreadyHidden
                      ? "border-command-line bg-command-card text-command-muted"
                      : "border-command-gold/60 bg-command-gold/10 text-command-gold"
                }`}>
                  {protectedRecord ? "Protected" : alreadyHidden ? "Already hidden" : "Can soft archive"}
                </span>
              </div>
              <p className="mt-3 text-sm text-command-subtle">{reasons.join(" | ")}</p>
            </article>
          )) : (
            <p className="rounded-xl border border-command-line bg-command-bg/55 p-4 text-command-muted">
              No test/demo records detected by the production visibility filter.
            </p>
          )}
        </div>
      </form>
    </>
  );
}
