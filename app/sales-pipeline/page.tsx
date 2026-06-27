import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { markQuotationSentAction, recordBossReviewAction } from "@/lib/actions";
import { buildQuoteApprovalGate } from "@/lib/boss-ops";
import { listAuditLogs } from "@/lib/data/audit-repository";
import { listLatestMeaningfulWhatsAppMessagesForLeads } from "@/lib/data/lead-messages-repository";
import { getSalesCollectionData } from "@/lib/data/sales-collection-repository";
import { formatLeadDisplayName, formatFullPhoneForProtectedApp } from "@/lib/lead-display";
import { humanizeLabel } from "@/lib/labels";
import { getLeadRiskBadges, riskBadgeClass } from "@/lib/risk-badges";
import { money, salesStageForLead, salesStages, weightedForecastForLead } from "@/lib/sales-collection";

export default async function SalesPipelinePage() {
  const { leads, summary } = await getSalesCollectionData();
  const [auditLogs, latestWhatsAppMessages] = await Promise.all([
    listAuditLogs(),
    listLatestMeaningfulWhatsAppMessagesForLeads(leads.map((lead) => lead.id))
  ]);
  const logsByLead = new Map<string, typeof auditLogs>();
  for (const log of auditLogs) {
    if (log.entityType !== "lead") continue;
    const current = logsByLead.get(log.entityId) ?? [];
    current.push(log);
    logsByLead.set(log.entityId, current);
  }
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
              {group.leads.map((lead) => {
                const riskBadges = getLeadRiskBadges(lead);
                const prioritySignalSource = [
                  lead.leadCategory,
                  lead.needsMarcus ? "Needs Marcus" : "",
                  lead.botPaused ? "Bot Paused" : "",
                  ...riskBadges.map((badge) => badge.label)
                ].filter(Boolean);
                const prioritySignals = prioritySignalSource.slice(0, 3);
                const hiddenSignalCount = Math.max(0, prioritySignalSource.length - prioritySignals.length);
                const latestMessage = latestWhatsAppMessages.get(lead.id);
                const latestPreview = latestMessage?.body || lead.lastClientMessage || "No WhatsApp preview captured yet.";
                const nextAction = lead.salesNextAction || lead.aiRecommendedNextAction || "Set next action";
                const gate = buildQuoteApprovalGate(lead, logsByLead.get(lead.id) ?? []);

                return (
                  <article key={lead.id} className="rounded-xl border border-command-line bg-command-bg/55 p-4 transition hover:border-command-cyan/60">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2">
                          {prioritySignals.map((signal) => (
                            <span key={signal} className="rounded-full border border-command-cyan/45 bg-command-cyan/10 px-2.5 py-1 text-xs font-semibold text-command-cyan">
                              {signal}
                            </span>
                          ))}
                          {hiddenSignalCount > 0 ? (
                            <span className="rounded-full border border-command-line bg-command-bg/55 px-2.5 py-1 text-xs font-semibold text-command-subtle">
                              +{hiddenSignalCount} more signals
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 text-lg font-semibold text-command-text">{formatLeadDisplayName(lead)}</p>
                        <p className="text-sm text-command-cyan">{formatFullPhoneForProtectedApp(lead.phone)}</p>
                        <p className="mt-1 text-sm text-command-muted">{lead.scopeSummary || "Scope pending"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/inbox?lead=${encodeURIComponent(lead.id)}`} className="command-press inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black transition hover:bg-command-goldHover">
                          Open WhatsApp Chat
                        </Link>
                        <Link href={`/leads/${lead.id}`} className="command-press inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-bg/55 px-4 py-2 text-sm font-semibold text-command-text transition hover:border-command-gold/60">
                          View Details
                        </Link>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-command-line bg-command-card p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-command-gold">Next action:</p>
                        <p className="mt-2 text-sm font-semibold leading-6 text-command-text">{nextAction}</p>
                      </div>
                      <div className="rounded-xl border border-command-line bg-command-card p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-command-cyan">Latest WhatsApp preview</p>
                        <p className="mt-2 text-sm leading-6 text-command-muted">{latestPreview}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={`/leads/${lead.id}#bot-controls`} className="command-press inline-flex min-h-10 items-center rounded-xl border border-command-line bg-command-bg/55 px-3 py-2 text-sm font-semibold text-command-text transition hover:border-command-gold/60">
                        Take Over
                      </Link>
                      {lead.botPaused ? (
                        <span className="inline-flex min-h-10 items-center rounded-xl border border-command-cyan/50 bg-command-cyan/10 px-3 py-2 text-sm font-semibold text-command-cyan">
                          Bot Paused
                        </span>
                      ) : (
                        <Link href={`/leads/${lead.id}#bot-controls`} className="command-press inline-flex min-h-10 items-center rounded-xl border border-command-line bg-command-bg/55 px-3 py-2 text-sm font-semibold text-command-text transition hover:border-command-gold/60">
                          Pause Bot
                        </Link>
                      )}
                      {gate.requiresApproval && !gate.approved ? (
                        <span className="inline-flex min-h-10 items-center rounded-xl border border-command-amber/50 bg-command-amber/10 px-3 py-2 text-sm font-semibold text-command-amber">
                          Boss review required
                        </span>
                      ) : null}
                    </div>

                    <details className="mt-4 rounded-xl border border-command-line bg-command-card p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-command-muted">More pipeline details</summary>
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <dl className="grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-command-muted">Lead heat</dt>
                            <dd className="mt-1 font-semibold text-command-text">{lead.leadScore}</dd>
                          </div>
                          <div>
                            <dt className="text-command-muted">Probability:</dt>
                            <dd className="mt-1 font-semibold text-command-text">{lead.probabilityPercent ?? 0}%</dd>
                          </div>
                          <div>
                            <dt className="text-command-muted">Booking readiness</dt>
                            <dd className="mt-1 font-semibold text-command-text">{lead.appointmentReadiness}%</dd>
                          </div>
                          <div>
                            <dt className="text-command-muted">Potential value</dt>
                            <dd className="mt-1 font-semibold text-command-text">{money(lead.potentialValue ?? 0)}</dd>
                          </div>
                          <div>
                            <dt className="text-command-muted">Follow-up</dt>
                            <dd className="mt-1 font-semibold text-command-text">{lead.followUpDate || "Not set"}</dd>
                          </div>
                          <div>
                            <dt className="text-command-muted">Owner</dt>
                            <dd className="mt-1 font-semibold text-command-text">{lead.leadOwner || "Marcus / unassigned"}</dd>
                          </div>
                        </dl>
                        <div>
                          <p className="text-sm font-semibold text-command-muted">Full risk list</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {riskBadges.length ? riskBadges.map((badge) => (
                              <span key={badge.key} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskBadgeClass(badge)}`}>
                                {badge.label}
                              </span>
                            )) : <span className="text-sm text-command-muted">No major risk flagged</span>}
                          </div>
                          <p className="mt-4 text-sm font-semibold text-command-muted">Full missing info</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {lead.missingInfo.length ? lead.missingInfo.map((item) => (
                              <span key={item} className="rounded-full border border-command-line bg-command-bg/55 px-2.5 py-1 text-xs font-semibold text-command-muted">
                                {humanizeLabel(item)}
                              </span>
                            )) : <span className="text-sm text-command-muted">No key missing info</span>}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border border-command-line bg-command-bg/55 p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-command-text">Boss Review Gate</p>
                            <p className="mt-1 text-sm text-command-muted">
                              {gate.requiresApproval
                                ? gate.approved
                                  ? "Boss approval recorded. Quotation Sent can be marked manually."
                                  : gate.blockedReason
                                : "No boss quote gate required for this lead."}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <form action={recordBossReviewAction}>
                              <input type="hidden" name="lead_id" value={lead.id} />
                              <input type="hidden" name="action_key" value="approve_quote" />
                              <input type="hidden" name="note" value="Approved from Sales Pipeline." />
                              <ActionButton type="submit" tone="muted">Approve Quote</ActionButton>
                            </form>
                            <form action={markQuotationSentAction}>
                              <input type="hidden" name="lead_id" value={lead.id} />
                              <ActionButton type="submit" disabled={!gate.canMoveToQuoted}>Mark Quotation Sent</ActionButton>
                            </form>
                          </div>
                        </div>
                      </div>
                    </details>
                  </article>
                );
              })}
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
