import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { listApprovalRequests } from "@/lib/data/approvals-repository";
import { listFollowUps } from "@/lib/data/followups-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { listQuotationReadinessRows } from "@/lib/data/quotation-repository";
import { buildWeeklyBossReportDraft } from "@/lib/sales-learning";

export default async function ReportsPage() {
  const [leads, approvals, quotationRows, followUps] = await Promise.all([listLeads(), listApprovalRequests(), listQuotationReadinessRows(), listFollowUps()]);
  const hotRatio = leads.length ? Math.round((leads.filter((lead) => lead.leadCategory === "Hot").length / leads.length) * 100) : 0;
  const weeklyDraft = buildWeeklyBossReportDraft(leads, followUps);
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
