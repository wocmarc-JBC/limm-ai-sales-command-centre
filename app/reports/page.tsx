import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { listApprovalRequests } from "@/lib/data/approvals-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { listQuotationReadinessRows } from "@/lib/data/quotation-repository";

export default async function ReportsPage() {
  const [leads, approvals, quotationRows] = await Promise.all([listLeads(), listApprovalRequests(), listQuotationReadinessRows()]);
  const hotRatio = leads.length ? Math.round((leads.filter((lead) => lead.leadCategory === "Hot").length / leads.length) * 100) : 0;
  return (
    <>
      <PageHeader title="Reports" eyebrow="Boss snapshot" />
      <section className="command-grid">
        <MetricCard label="Leads This Month" value={leads.length} />
        <MetricCard label="Hot Lead Ratio" value={`${hotRatio}%`} tone="warn" />
        <MetricCard label="Approval Queue" value={approvals.filter((item) => item.status === "pending").length} />
        <MetricCard label="Quotation Ready" value={quotationRows.filter((row) => row.readiness.bossReviewRequired).length} />
      </section>
      <div className="mt-6 rounded border border-command-line bg-command-panel p-5 shadow-command">
        <h3 className="text-lg font-semibold">Pipeline Notes</h3>
        <p className="mt-3 text-command-muted">Report layer now reads through the v3.1 repository layer, with mock fallback until Supabase is configured.</p>
      </div>
    </>
  );
}
