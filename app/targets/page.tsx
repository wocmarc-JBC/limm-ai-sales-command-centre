import { ActionButton } from "@/components/ActionButton";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { saveMonthlySalesTargetAction } from "@/lib/actions";
import { getShowTestDemoRecordsPreference } from "@/lib/data-visibility-preference";
import { getSalesCollectionData } from "@/lib/data/sales-collection-repository";
import { currentMonthKey, money, nonGstNote } from "@/lib/sales-collection";

const inputClass = "rounded border border-command-line bg-command-bg px-3 py-2 text-command-text";

export default async function TargetsPage({
  searchParams: searchParamsPromise
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const selectedMonth = searchParams?.month || currentMonthKey();
  const showTestDemoRecords = await getShowTestDemoRecordsPreference();
  const { summary, target } = await getSalesCollectionData(selectedMonth, { includeTestDemo: showTestDemoRecords });

  return (
    <>
      <PageHeader title="Targets" eyebrow="Manual monthly goals" />

      <section className="mission-panel mb-6 rounded-2xl p-5">
        <p className="text-lg font-semibold text-command-text">{nonGstNote}</p>
        <p className="mt-2 text-command-muted">
          Targets are for boss tracking only. They do not create prices, quotation amounts, GST calculations, or accounting documents.
        </p>
      </section>

      <section className="command-grid">
        <MetricCard label="Sales Target" value={money(target.monthlySalesTarget)} tone="warn" detail={`${money(summary.remainingToTarget)} remaining this month`} />
        <MetricCard label="Confirmed Sales" value={money(summary.confirmedSales)} tone="good" detail={`${summary.daysLeft} day(s) left`} />
        <MetricCard label="Collection Target" value={money(target.monthlyCollectionTarget)} tone="warn" detail={`${money(summary.remainingCollectionTarget)} remaining`} />
        <MetricCard label="Collected" value={money(summary.currentMonthCollected)} tone="good" />
      </section>

      <form action={saveMonthlySalesTargetAction} className="mt-6 mission-panel rounded-2xl p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-gold">Set Monthly Target</p>
            <h2 className="mt-1 text-2xl font-semibold text-command-text">{target.targetMonth}</h2>
            <p className="mt-2 text-sm text-command-muted">All amounts are manual internal tracking values for Marcus.</p>
          </div>
          <ActionButton type="submit">Save Targets</ActionButton>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Target month</span>
            <input name="target_month" defaultValue={selectedMonth} pattern="\d{4}-\d{2}" className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Monthly sales target</span>
            <input name="monthly_sales_target" type="number" min="0" step="1" defaultValue={target.monthlySalesTarget} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Monthly collection target</span>
            <input name="monthly_collection_target" type="number" min="0" step="1" defaultValue={target.monthlyCollectionTarget} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Confirmed jobs target</span>
            <input name="monthly_confirmed_jobs_target" type="number" min="0" step="1" defaultValue={target.monthlyConfirmedJobsTarget} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Site visit target</span>
            <input name="monthly_site_visit_target" type="number" min="0" step="1" defaultValue={target.monthlySiteVisitTarget} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Quotation target</span>
            <input name="monthly_quotation_target" type="number" min="0" step="1" defaultValue={target.monthlyQuotationTarget} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Landed lead target</span>
            <input name="monthly_landed_lead_target" type="number" min="0" step="1" defaultValue={target.monthlyLandedLeadTarget} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Commercial lead target</span>
            <input name="monthly_commercial_lead_target" type="number" min="0" step="1" defaultValue={target.monthlyCommercialLeadTarget} className={inputClass} />
          </label>
        </div>

        <label className="mt-4 grid gap-1 text-sm text-command-muted">
          <span>Boss notes</span>
          <textarea name="notes" defaultValue={target.notes} rows={4} className={`${inputClass} min-h-28`} />
        </label>
      </form>
    </>
  );
}
