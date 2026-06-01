import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { listApprovalRequests } from "@/lib/data/approvals-repository";
import { listFollowUps } from "@/lib/data/followups-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { listQuotationReadinessRows } from "@/lib/data/quotation-repository";
import { getSalesCollectionData } from "@/lib/data/sales-collection-repository";
import { buildBossMonthlyReport, money, nonGstNote } from "@/lib/sales-collection";
import { buildWeeklyBossReportDraft } from "@/lib/sales-learning";

export default async function ReportsPage() {
  const [leads, approvals, quotationRows, followUps, salesCollection] = await Promise.all([
    listLeads(),
    listApprovalRequests(),
    listQuotationReadinessRows(),
    listFollowUps(),
    getSalesCollectionData()
  ]);
  const hotRatio = leads.length ? Math.round((leads.filter((lead) => lead.leadCategory === "Hot").length / leads.length) * 100) : 0;
  const weeklyDraft = buildWeeklyBossReportDraft(leads, followUps);
  const bossMonthlyReport = buildBossMonthlyReport(salesCollection.leads, salesCollection.projects, salesCollection.payments, salesCollection.target);
  return (
    <>
      <PageHeader title="Reports" eyebrow="Boss snapshot" />
      <section className="command-grid">
        <MetricCard label="Leads This Month" value={leads.length} />
        <MetricCard label="Hot Lead Ratio" value={`${hotRatio}%`} tone="warn" />
        <MetricCard label="Approval Queue" value={approvals.filter((item) => item.status === "pending").length} />
        <MetricCard label="Quotation Ready" value={quotationRows.filter((row) => row.readiness.bossReviewRequired).length} />
      </section>
      <div className="mt-6 rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
        <h3 className="text-2xl font-semibold">Pipeline Notes</h3>
        <p className="mt-3 text-base text-command-muted">Report layer reads through the repository layer, with mock fallback until Supabase is configured.</p>
      </div>
      <section className="mt-6 rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
        <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Boss Monthly Report</p>
        <h3 className="mt-1 text-2xl font-semibold">Sales, collection, and follow-up focus</h3>
        <p className="mt-2 text-base text-command-muted">{nonGstNote} Money values here are manual tracking values only.</p>
        <dl className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["New leads", bossMonthlyReport.newLeads],
            ["Qualified leads", bossMonthlyReport.qualifiedLeads],
            ["Site visits booked", bossMonthlyReport.siteVisitsBooked],
            ["Quotations sent", bossMonthlyReport.quotationsSent],
            ["Won jobs", bossMonthlyReport.wonJobs],
            ["Lost jobs", bossMonthlyReport.lostJobs],
            ["Confirmed sales", money(bossMonthlyReport.confirmedSales)],
            ["Pipeline value", money(bossMonthlyReport.pipelineValue)],
            ["Weighted forecast", money(bossMonthlyReport.weightedForecast)],
            ["Collections received", money(bossMonthlyReport.collectionsReceived)],
            ["Outstanding receivables", money(bossMonthlyReport.outstandingReceivables)],
            ["Overdue payments", money(bossMonthlyReport.overduePayments)]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-command-line bg-command-elevated p-4">
              <dt className="text-sm text-command-muted">{label}</dt>
              <dd className="mt-1 text-xl font-semibold text-command-text">{String(value)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {[
            ["Best lead source", bossMonthlyReport.bestLeadSource],
            ["Best project type", bossMonthlyReport.bestProjectType],
            ["Common lost reason", bossMonthlyReport.commonLostReason]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-command-line bg-command-elevated p-4">
              <p className="text-sm text-command-muted">{label}</p>
              <p className="mt-1 text-lg font-semibold text-command-text">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-lg border border-command-line bg-command-elevated p-4">
          <p className="font-semibold text-command-text">Top follow-up items</p>
          <div className="mt-3 space-y-2">
            {bossMonthlyReport.topFollowUpItems.length ? bossMonthlyReport.topFollowUpItems.map((item) => (
              <p key={`${item.title}-${item.reason}`} className="text-sm text-command-muted">
                <span className="font-semibold text-command-text">{item.title}:</span> {item.reason}
              </p>
            )) : (
              <p className="text-sm text-command-muted">No sales collection follow-up items due right now.</p>
            )}
          </div>
        </div>
      </section>
      <section className="mt-6 rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
        <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Weekly Boss Report Draft</p>
        <h3 className="mt-1 text-2xl font-semibold">{weeklyDraft.title}</h3>
        <p className="mt-2 text-base text-command-muted">Draft only. It is not auto-sent unless a future email provider and explicit send setting are enabled.</p>
        <dl className="mt-5 grid gap-4 md:grid-cols-2">
          {Object.entries(weeklyDraft.summary).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-command-line bg-command-elevated p-4">
              <dt className="text-sm text-command-muted">{label.replace(/([A-Z])/g, " $1")}</dt>
              <dd className="mt-1 text-xl font-semibold text-command-text">{String(value)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["Latest QA", "Review generated QA reports before launch."],
            ["Deep QA Cases", "v6 Ultimate and v6.1 cleanup checks are local-proofed."],
            ["Build Status", "Run build before every deploy; local PASS is not production proof."]
          ].map(([title, detail]) => (
            <div key={title} className="rounded-lg border border-command-line bg-command-elevated p-4">
              <p className="font-semibold text-command-text">{title}</p>
              <p className="mt-2 text-sm text-command-muted">{detail}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
