import { PageHeader } from "@/components/PageHeader";
import { QuotationReadinessGateActions } from "@/components/QuotationReadinessGateActions";
import { getShowTestDemoRecordsPreference } from "@/lib/data-visibility-preference";
import { listQuotationReadinessSummaries } from "@/lib/data/phase3-summaries-repository";
import { groupQuotationSummaries, type QuotationGateStatus } from "@/lib/phase3-read-models";

const groupOrder: QuotationGateStatus[] = [
  "Ready for Quotation Review",
  "Boss Review Required",
  "Files Needed",
  "Location Needed",
  "Site Review Needed",
  "Basic Info Missing",
  "Not Ready"
];

function tone(status: QuotationGateStatus) {
  if (status === "Ready for Quotation Review") return "border-command-green/55 bg-command-green/10 text-command-green";
  if (status === "Boss Review Required" || status === "Site Review Needed") return "border-command-gold/55 bg-command-gold/10 text-command-gold";
  if (status === "Files Needed" || status === "Location Needed") return "border-command-amber/55 bg-command-amber/10 text-command-amber";
  return "border-command-line bg-command-card text-command-muted";
}

export default async function QuotationReadinessPage() {
  const showTestDemoRecords = await getShowTestDemoRecordsPreference();
  const quotationRows = await listQuotationReadinessSummaries(80, { includeTestDemo: showTestDemoRecords });
  const groups = groupQuotationSummaries(quotationRows);

  return (
    <>
      <PageHeader title="Quotation Readiness" eyebrow="Readiness gate only" />
      <section className="mb-5 rounded-lg border border-command-line bg-command-card p-5 shadow-premium">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-gold">No price generation</p>
        <p className="mt-2 text-sm text-command-muted">
          This screen checks whether a lead is ready for Marcus to review. It never generates quotation amounts or costing guidance.
        </p>
      </section>

      <div className="space-y-6">
        {groupOrder.map((status) => {
          const rows = groups[status];
          if (!rows.length) return null;
          return (
            <section key={status} className="mission-panel rounded-2xl shadow-command">
              <div className="flex flex-col gap-2 border-b border-command-line p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone(status)}`}>{status}</span>
                  <h2 className="mt-2 text-2xl font-semibold text-command-text">{rows.length} lead{rows.length === 1 ? "" : "s"}</h2>
                </div>
                <p className="text-sm text-command-muted">Lead Facts + latest WhatsApp summary</p>
              </div>
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                {rows.map((row) => (
                  <article key={row.id} data-testid={`quotation-readiness-${row.leadId}`} className="rounded-2xl border border-command-line bg-command-bg/55 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-xl font-semibold text-command-text">{row.clientName}</h3>
                        <p className="mt-1 text-sm text-command-muted">{row.phone || "Phone pending"}</p>
                        <p className="mt-3 text-base leading-7 text-command-text">{row.scopeSummary}</p>
                      </div>
                      <div className="rounded-xl border border-command-line bg-command-card px-4 py-3 text-right">
                        <p className="text-xs text-command-muted">Readiness</p>
                        <p className="text-2xl font-semibold text-command-text">{row.readinessScore}%</p>
                      </div>
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-xl border border-command-line bg-command-card p-3">
                        <dt className="text-command-muted">Property</dt>
                        <dd className="mt-1 font-semibold text-command-text">{row.propertyType}</dd>
                      </div>
                      <div className="rounded-xl border border-command-line bg-command-card p-3">
                        <dt className="text-command-muted">Location</dt>
                        <dd className="mt-1 font-semibold text-command-text">{row.locationStatus}</dd>
                      </div>
                      <div className="rounded-xl border border-command-line bg-command-card p-3">
                        <dt className="text-command-muted">Floor plan</dt>
                        <dd className="mt-1 font-semibold text-command-text">{row.floorPlanStatus}</dd>
                      </div>
                      <div className="rounded-xl border border-command-line bg-command-card p-3">
                        <dt className="text-command-muted">Photos</dt>
                        <dd className="mt-1 font-semibold text-command-text">{row.sitePhotosStatus}</dd>
                      </div>
                    </dl>
                    {row.missingItems.length ? (
                      <p className="mt-4 text-sm text-command-muted">Missing: {row.missingItems.join(", ")}</p>
                    ) : null}
                    <p className="mt-3 text-sm leading-6 text-command-muted">{row.nextAction}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <a href={`/inbox?lead=${encodeURIComponent(row.leadId)}`} className="inline-flex min-h-10 items-center rounded-xl border border-command-gold bg-command-gold px-3 py-2 text-sm font-semibold text-black">
                        Open WhatsApp Chat
                      </a>
                      <a href={`/leads/${encodeURIComponent(row.leadId)}`} className="inline-flex min-h-10 items-center rounded-xl border border-command-line bg-command-card px-3 py-2 text-sm font-semibold text-command-text">
                        View Lead Details
                      </a>
                      <QuotationReadinessGateActions
                        leadId={row.leadId}
                        canMove={row.canMoveToQuotationReview}
                        disabledReason={row.disabledReason}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
