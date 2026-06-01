import Link from "next/link";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { getSalesCollectionData } from "@/lib/data/sales-collection-repository";
import { formatLeadDisplayName, formatFullPhoneForProtectedApp } from "@/lib/lead-display";
import { humanizeLabel } from "@/lib/labels";
import { money, salesStageForLead, salesStages, weightedForecastForLead } from "@/lib/sales-collection";

export default async function SalesPipelinePage() {
  const { leads, summary } = await getSalesCollectionData();
  const grouped = salesStages.map((stage) => {
    const stageLeads = leads.filter((lead) => salesStageForLead(lead) === stage);
    return {
      stage,
      leads: stageLeads,
      potentialValue: stageLeads.reduce((sum, lead) => sum + (lead.potentialValue ?? 0), 0),
      weightedForecast: stageLeads.reduce((sum, lead) => sum + weightedForecastForLead(lead), 0)
    };
  }).filter((group) => group.leads.length > 0);

  return (
    <>
      <PageHeader title="Sales Pipeline" eyebrow="Manual sales stages" />
      <section className="mission-panel mb-6 rounded-2xl p-5 text-command-muted">
        Track stages, owners, next actions, probability, potential value, and close dates manually. No price guide automation and no quotation amount generation.
      </section>

      <section className="command-grid">
        <MetricCard label="Pipeline Value" value={money(summary.pipelineValue)} tone="warn" />
        <MetricCard label="Weighted Forecast" value={money(summary.weightedForecast)} />
        <MetricCard label="Active Leads" value={leads.length} />
        <MetricCard label="Won Jobs" value={leads.filter((lead) => salesStageForLead(lead) === "Won").length} tone="good" />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        {grouped.length ? grouped.map((group) => (
          <article key={group.stage} className="mission-panel rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-gold">{group.stage}</p>
                <h2 className="mt-1 text-2xl font-semibold text-command-text">{group.leads.length} lead{group.leads.length === 1 ? "" : "s"}</h2>
              </div>
              <div className="text-right text-sm text-command-muted">
                <p>Potential: <strong className="text-command-text">{money(group.potentialValue)}</strong></p>
                <p>Weighted: <strong className="text-command-text">{money(group.weightedForecast)}</strong></p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {group.leads.map((lead) => (
                <Link key={lead.id} href={`/leads/${lead.id}`} className="block rounded-xl border border-command-line bg-command-bg/55 p-4 transition hover:border-command-cyan/60">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-command-text">{formatLeadDisplayName(lead)}</p>
                      <p className="text-sm text-command-cyan">{formatFullPhoneForProtectedApp(lead.phone)}</p>
                      <p className="mt-1 text-sm text-command-muted">{lead.scopeSummary || "Scope pending"}</p>
                    </div>
                    <div className="text-sm text-command-muted md:text-right">
                      <p>Probability: {lead.probabilityPercent ?? 0}%</p>
                      <p>Potential: {money(lead.potentialValue ?? 0)}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-command-muted">Next action: {lead.salesNextAction || lead.aiRecommendedNextAction || "Set next action"}</p>
                  <p className="mt-1 text-xs text-command-subtle">Follow-up: {lead.followUpDate || "Not set"} | Owner: {lead.leadOwner || "Marcus / unassigned"}</p>
                </Link>
              ))}
            </div>
          </article>
        )) : (
          <div className="mission-panel rounded-2xl p-5 text-command-muted">
            No active pipeline leads yet. WhatsApp leads will appear here once sales stage tracking is applied.
          </div>
        )}
      </section>
      <section className="mt-6 mission-panel rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-cyan">Stage List</p>
        <p className="mt-2 text-command-muted">{salesStages.map(humanizeLabel).join(" | ")}</p>
      </section>
    </>
  );
}
