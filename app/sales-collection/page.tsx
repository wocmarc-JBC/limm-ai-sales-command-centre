import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { getSalesCollectionData } from "@/lib/data/sales-collection-repository";
import {
  activePayments,
  buildQuotationPaymentFollowUps,
  money,
  nonGstNote,
  outstandingForProject,
  overdueAmountForProject
} from "@/lib/sales-collection";

export default async function SalesCollectionPage() {
  const { leads, projects, payments, summary, target } = await getSalesCollectionData();
  const reminders = buildQuotationPaymentFollowUps(leads, projects, payments);
  const activePaymentRows = activePayments(payments);

  return (
    <>
      <PageHeader title="Sales & Collection" eyebrow="Manual non-GST tracking" />
      <section className="mission-panel mb-6 rounded-2xl p-5">
        <p className="text-lg font-semibold text-command-text">{nonGstNote}</p>
        <p className="mt-2 text-command-muted">
          Manual tracking only. This is not accounting software, not GST accounting, and not automated quotation pricing.
        </p>
      </section>

      <section className="command-grid">
        <MetricCard label="Monthly Sales Target" value={money(target.monthlySalesTarget)} tone="warn" />
        <MetricCard label="Confirmed Sales" value={money(summary.confirmedSales)} tone="good" />
        <MetricCard label="Collection Target" value={money(target.monthlyCollectionTarget)} tone="warn" />
        <MetricCard label="Collected" value={money(summary.currentMonthCollected)} tone="good" />
        <MetricCard label="Outstanding Receivables" value={money(summary.outstandingAmount)} />
        <MetricCard label="Overdue Payments" value={money(summary.overdueAmount)} tone={summary.overdueAmount > 0 ? "danger" : "good"} />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        <article className="mission-panel rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-gold">Won Projects</p>
          <div className="mt-4 space-y-3">
            {projects.length ? projects.map((project) => (
              <div key={project.id} className="rounded-xl border border-command-line bg-command-bg/55 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-command-text">{project.clientName}</p>
                    <p className="text-sm text-command-muted">{project.scopeSummary || "Scope carried from lead"}</p>
                  </div>
                  <div className="text-sm text-command-muted md:text-right">
                    <p>Confirmed: <strong className="text-command-text">{money(project.confirmedValue)}</strong></p>
                    <p>Outstanding: <strong className="text-command-text">{money(outstandingForProject(project, payments))}</strong></p>
                    <p>Overdue: <strong className="text-command-red">{money(overdueAmountForProject(project, payments))}</strong></p>
                  </div>
                </div>
              </div>
            )) : (
              <p className="rounded-xl border border-command-line bg-command-bg/55 p-4 text-command-muted">
                No won projects tracked yet. Mark a lead Won with a manual confirmed value to create a project/account record.
              </p>
            )}
          </div>
        </article>

        <article className="mission-panel rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-cyan">Recent Payments</p>
          <div className="mt-4 space-y-3">
            {activePaymentRows.length ? activePaymentRows.slice(0, 6).map((payment) => (
              <div key={payment.id} className="rounded-xl border border-command-line bg-command-bg/55 p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold text-command-text">{payment.paymentType}</p>
                  <p className="text-command-text">{money(payment.amount)}</p>
                </div>
                <p className="mt-1 text-command-muted">Status: {payment.status} | Due: {payment.dueDate || "Not set"} | Received: {payment.receivedDate || "Not received"}</p>
                <p className="mt-1 text-command-subtle">Void instead of delete if this entry is wrong.</p>
              </div>
            )) : (
              <p className="rounded-xl border border-command-line bg-command-bg/55 p-4 text-command-muted">
                No payment records yet. Add records manually after a project is won.
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="mt-6 mission-panel rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-amber">Follow-Up Due</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {reminders.length ? reminders.map((item) => (
            <div key={`${item.title}-${item.reason}`} className="rounded-xl border border-command-line bg-command-bg/55 p-4">
              <p className="font-semibold text-command-text">{item.title}</p>
              <p className="mt-1 text-sm text-command-muted">{item.reason}</p>
            </div>
          )) : (
            <p className="rounded-xl border border-command-line bg-command-bg/55 p-4 text-command-muted">
              No quotation or payment reminders due right now.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
