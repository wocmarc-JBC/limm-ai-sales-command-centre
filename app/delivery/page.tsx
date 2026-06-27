import { ActionButton } from "@/components/ActionButton";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { buildDoNotStartGate, jobStartChecklistActions } from "@/lib/boss-ops";
import { recordJobStartChecklistAction } from "@/lib/actions";
import { getShowTestDemoRecordsPreference } from "@/lib/data-visibility-preference";
import { listAuditLogs } from "@/lib/data/audit-repository";
import { getSalesCollectionData } from "@/lib/data/sales-collection-repository";
import { money } from "@/lib/sales-collection";

export default async function DeliveryPage() {
  const showTestDemoRecords = await getShowTestDemoRecordsPreference();
  const [{ leads, projects, payments }, auditLogs] = await Promise.all([
    getSalesCollectionData(undefined, { includeTestDemo: showTestDemoRecords }),
    listAuditLogs()
  ]);
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const logsByLead = new Map<string, typeof auditLogs>();
  for (const log of auditLogs) {
    if (log.entityType !== "lead") continue;
    const current = logsByLead.get(log.entityId) ?? [];
    current.push(log);
    logsByLead.set(log.entityId, current);
  }
  const gateRows = projects
    .map((project) => {
      const lead = leadById.get(project.leadId) ?? null;
      return {
        project,
        lead,
        gate: buildDoNotStartGate(project, lead, payments, logsByLead.get(project.leadId) ?? [])
      };
    })
    .sort((a, b) => {
      if (a.gate.canStart !== b.gate.canStart) return a.gate.canStart ? 1 : -1;
      return b.project.confirmedValue - a.project.confirmedValue;
    });
  const cannotStartRows = gateRows.filter((row) => !row.gate.canStart);
  const valueBlocked = cannotStartRows.reduce((sum, row) => sum + row.project.confirmedValue, 0);

  return (
    <>
      <PageHeader title="Do Not Start Gate" eyebrow="Delivery" />
      <section className="mission-panel mb-6 rounded-2xl p-5">
        <p className="text-base leading-7 text-command-muted">
          Won jobs can start only when deposit, boss start approval, scope, drawings, materials, workers, site access, required MCST approval, and protection are cleared.
        </p>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <MetricCard label="Cannot Start" value={cannotStartRows.length} tone={cannotStartRows.length ? "danger" : "good"} detail="Jobs with at least one start blocker." />
        <MetricCard label="Can Start" value={gateRows.length - cannotStartRows.length} tone="good" detail="Won jobs with every start gate cleared." />
        <MetricCard label="Value Blocked" value={money(valueBlocked)} tone={valueBlocked ? "warn" : "good"} detail="Confirmed value held by start blockers." />
      </section>

      <div className="space-y-5">
        {gateRows.length ? gateRows.map(({ project, gate }) => {
          return (
            <article key={project.id} className={`mission-panel rounded-2xl p-5 ${gate.canStart ? "border-command-green/25 bg-command-panel/70" : "border-command-red/45"}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                    gate.canStart ? "border-command-green/60 bg-command-green/10 text-command-green" : "border-command-red/60 bg-command-red/10 text-command-red"
                  }`}>
                    {gate.statusLabel}
                  </span>
                  <h2 className="mt-3 text-2xl font-semibold text-command-text">{project.clientName}</h2>
                  <p className="mt-1 text-sm text-command-muted">{project.scopeSummary || project.propertyType}</p>
                </div>
                <div className="rounded-xl border border-command-line bg-command-bg/55 px-4 py-3 text-sm text-command-muted lg:text-right">
                  <p>Confirmed value</p>
                  <p className="text-xl font-semibold text-command-text">{money(project.confirmedValue)}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="rounded-xl border border-command-line bg-command-bg/55 p-4">
                  <p className="font-semibold text-command-text">Missing before start</p>
                  {gate.missingItems.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-command-muted">
                      {gate.missingItems.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-command-green">All start requirements are clear.</p>
                  )}
                </div>
                <div className="rounded-xl border border-command-line bg-command-bg/55 p-4">
                  <p className="font-semibold text-command-text">Record start checks</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {jobStartChecklistActions.map((item) => (
                      <form key={item.key} action={recordJobStartChecklistAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="lead_id" value={project.leadId} />
                        <input type="hidden" name="project_id" value={project.id} />
                        <input type="hidden" name="checklist_key" value={item.key} />
                        <input type="hidden" name="note" value={`Confirmed from Delivery page: ${item.label}`} />
                        <ActionButton type="submit" tone="muted">{item.label}</ActionButton>
                      </form>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          );
        }) : (
          <section className="mission-panel rounded-2xl p-6 text-command-muted">
            No won project/account records yet.
          </section>
        )}
      </div>
    </>
  );
}
