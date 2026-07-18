import Link from "next/link";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { can } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import { getShowTestDemoRecordsPreference } from "@/lib/data-visibility-preference";
import { listLeads } from "@/lib/data/leads-repository";
import { listQuotationPackages } from "@/lib/data/quotation-repository";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { money } from "@/lib/sales-collection";
import type { QuotationPackageStatus } from "@/lib/types";

const statuses: Array<QuotationPackageStatus | "All"> = [
  "All",
  "Draft",
  "Submitted for Boss Review",
  "Boss Approved",
  "Revision Requested",
  "Rejected / Hold",
  "Sent to Client",
  "Client Reviewing",
  "Accepted",
  "Client Rejected",
  "Expired",
  "Voided"
];

function statusTone(status: QuotationPackageStatus) {
  if (status === "Accepted") return "border-command-green/60 bg-command-green/10 text-command-green";
  if (status === "Submitted for Boss Review" || status === "Boss Approved") return "border-command-gold/60 bg-command-gold/10 text-command-gold";
  if (status === "Revision Requested" || status === "Rejected / Hold") return "border-command-amber/60 bg-command-amber/10 text-command-amber";
  if (status === "Voided" || status === "Client Rejected" || status === "Expired") return "border-command-red/60 bg-command-red/10 text-command-red";
  return "border-command-line bg-command-card text-command-muted";
}

export default async function QuotationsPage({
  searchParams: searchParamsPromise
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const auth = await getCurrentProfile();
  const showTestDemoRecords = await getShowTestDemoRecordsPreference();
  const leads = await listLeads({ includeTest: showTestDemoRecords });
  const visibleLeadIds = new Set(leads.map((lead) => lead.id));
  const quotations = await listQuotationPackages({ includeTestDemo: showTestDemoRecords, visibleLeadIds });
  const status = (searchParams?.status || "All") as QuotationPackageStatus | "All";
  const filtered = status === "All" ? quotations : quotations.filter((quotation) => quotation.status === status);
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const canViewCost = Boolean(auth.profile && can(auth.profile.role, "approve_requests"));

  return (
    <>
      <PageHeader title="Quotations" eyebrow="Package workflow">
        <Link href="/quotation-readiness" className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-text">
          Readiness Gate
        </Link>
        <Link href="/approvals" className="inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black">
          Boss Review Gate
        </Link>
      </PageHeader>

      <section className="mission-panel mb-6 rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Manual quotation package control</p>
        <p className="mt-2 text-sm leading-6 text-command-muted">
          Upload real quotation files, submit for boss review, approve/revise, then manually mark sent and accepted. No automated pricing, no auto WhatsApp sends, and no calendar auto-booking.
        </p>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <MetricCard label="Packages" value={quotations.length} />
        <MetricCard label="Awaiting Boss" value={quotations.filter((item) => item.status === "Submitted for Boss Review").length} tone="warn" />
        <MetricCard label="Approved Not Sent" value={quotations.filter((item) => item.status === "Boss Approved").length} tone="good" />
        <MetricCard label="Accepted" value={quotations.filter((item) => item.status === "Accepted").length} tone="good" />
      </section>

      <section className="mission-panel mb-6 rounded-2xl p-5">
        <div className="flex flex-wrap gap-2">
          {statuses.map((item) => (
            <Link
              key={item}
              href={item === "All" ? "/quotations" : `/quotations?status=${encodeURIComponent(item)}`}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                status === item
                  ? "border-command-cyan/70 bg-command-cyan/10 text-command-text"
                  : "border-command-line bg-command-bg/60 text-command-muted hover:text-command-text"
              }`}
            >
              {item}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {filtered.length ? filtered.map((quotation) => {
          const lead = leadById.get(quotation.leadId);
          return (
            <article key={quotation.id} data-testid={`quotation-card-${quotation.id}`} className="mission-panel rounded-2xl p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusTone(quotation.status)}`}>
                    {quotation.status}
                  </span>
                  <h2 className="mt-3 text-2xl font-semibold text-command-text">{quotation.clientName || (lead ? formatLeadDisplayName(lead) : "Unknown client")}</h2>
                  <p className="mt-1 text-sm text-command-cyan">{quotation.quotationNumber} / v{quotation.versionNumber}</p>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-command-muted">{quotation.scopeSummary}</p>
                </div>
                <div className="rounded-xl border border-command-line bg-command-bg/55 px-4 py-3 text-sm text-command-muted lg:text-right">
                  <p>Amount</p>
                  <p className="text-xl font-semibold text-command-text">{money(quotation.quotationAmount)}</p>
                  {canViewCost ? (
                    <p className="mt-1">Margin: {quotation.marginEstimate ? money(quotation.marginEstimate) : "Not set"}</p>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                <div className="rounded-xl border border-command-line bg-command-bg/55 p-3">
                  <p className="text-command-muted">Prepared by</p>
                  <p className="mt-1 font-semibold text-command-text">{quotation.preparedBy || "Not set"}</p>
                </div>
                <div className="rounded-xl border border-command-line bg-command-bg/55 p-3">
                  <p className="text-command-muted">Submitted</p>
                  <p className="mt-1 font-semibold text-command-text">{quotation.submittedForBossReviewAt || "Not submitted"}</p>
                </div>
                <div className="rounded-xl border border-command-line bg-command-bg/55 p-3">
                  <p className="text-command-muted">Sent</p>
                  <p className="mt-1 font-semibold text-command-text">{quotation.sentAt || "Not sent"}</p>
                </div>
                <div className="rounded-xl border border-command-line bg-command-bg/55 p-3">
                  <p className="text-command-muted">Accepted</p>
                  <p className="mt-1 font-semibold text-command-text">{quotation.acceptedAt || "Not accepted"}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={`/quotations/${quotation.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black" data-testid={`view-quotation-${quotation.id}`}>
                  View Quotation
                </Link>
                <Link href={`/leads/${quotation.leadId}`} className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-bg/55 px-4 py-2 text-base font-semibold text-command-text">
                  Lead Detail
                </Link>
              </div>
            </article>
          );
        }) : (
          <section className="mission-panel rounded-2xl p-6 text-command-muted">
            No quotation packages match this filter yet. Open a lead detail page to create or upload a package.
          </section>
        )}
      </section>
    </>
  );
}
