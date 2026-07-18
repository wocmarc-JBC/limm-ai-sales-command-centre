import { ActionButton } from "@/components/ActionButton";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { recordJobStartChecklistAction, recordPaymentReceivedAction } from "@/lib/actions";
import { buildCollectionQueue, buildDoNotStartGate, buildJbcDefaultPaymentSchedule, jobStartChecklistActions } from "@/lib/boss-ops";
import { getShowTestDemoRecordsPreference } from "@/lib/data-visibility-preference";
import { listAuditLogs } from "@/lib/data/audit-repository";
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
  const showTestDemoRecords = await getShowTestDemoRecordsPreference();
  const { leads, projects, payments, summary, target } = await getSalesCollectionData(undefined, { includeTestDemo: showTestDemoRecords });
  const auditLogs = await listAuditLogs();
  const reminders = buildQuotationPaymentFollowUps(leads, projects, payments);
  const activePaymentRows = activePayments(payments);
  const collectionQueue = buildCollectionQueue(projects, payments);
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const logsByLead = new Map<string, typeof auditLogs>();
  for (const log of auditLogs) {
    if (log.entityType !== "lead") continue;
    const current = logsByLead.get(log.entityId) ?? [];
    current.push(log);
    logsByLead.set(log.entityId, current);
  }

  return (
    <>
      <PageHeader title="Collection Queue" eyebrow="Money / Manual non-GST tracking" />
      <section className="mission-panel mb-6 rounded-2xl p-5">
        <p className="text-lg font-semibold text-command-text">{nonGstNote}</p>
        <p className="mt-2 text-command-muted">
          Manual tracking only. This is not accounting software, not GST accounting, and not automated quotation pricing.
        </p>
      </section>

      <section className="mb-6 grid min-w-0 gap-4 2xl:grid-cols-[20rem_minmax(0,1fr)]">
        <article className="mission-panel min-w-0 rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-gold">JBC default schedule</p>
          <div className="mt-4 space-y-3 text-sm">
            {buildJbcDefaultPaymentSchedule(100).map((milestone) => (
              <div key={milestone.label} className="flex items-center justify-between rounded-xl border border-command-line bg-command-bg/55 px-3 py-2">
                <span className="font-semibold text-command-text">{milestone.label}</span>
                <span className="text-command-muted">{milestone.percent}%</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm leading-6 text-command-muted">
            LIMM Works custom milestone schedules are allowed through manual payment records.
          </p>
        </article>

        <article className="mission-panel min-w-0 rounded-2xl p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-amber">Daily collection page</p>
              <h2 className="mt-1 text-2xl font-semibold text-command-text">{collectionQueue.length} open milestone{collectionQueue.length === 1 ? "" : "s"}</h2>
            </div>
            <a href="#job-start-gate" className="inline-flex min-h-10 items-center rounded-xl border border-command-line bg-command-card px-3 py-2 text-sm font-semibold text-command-text">
              Check start gates
            </a>
          </div>
          <div className="mt-5 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[54rem] border-separate border-spacing-y-2 text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.14em] text-command-muted">
                <tr>
                  <th className="px-3 py-2">Amount due</th>
                  <th className="px-3 py-2">Due date</th>
                  <th className="px-3 py-2">Overdue days</th>
                  <th className="px-3 py-2">Job/client</th>
                  <th className="px-3 py-2">Payment milestone</th>
                  <th className="px-3 py-2">Chase status</th>
                  <th className="px-3 py-2">Next chase</th>
                  <th className="px-3 py-2">Warning</th>
                </tr>
              </thead>
              <tbody>
                {collectionQueue.length ? collectionQueue.map((item) => {
                  const project = projects.find((row) => row.id === item.projectId);
                  return (
                    <tr key={item.id} className="rounded-xl bg-command-bg/55 text-command-muted">
                      <td className="rounded-l-xl border-y border-l border-command-line px-3 py-3 font-semibold text-command-text">{money(item.amountDue)}</td>
                      <td className="border-y border-command-line px-3 py-3">{item.dueDateLabel}</td>
                      <td className={`border-y border-command-line px-3 py-3 font-semibold ${item.overdueDays > 0 ? "text-command-red" : "text-command-muted"}`}>{item.overdueDays}</td>
                      <td className="border-y border-command-line px-3 py-3">
                        {item.jobClient}
                        {project?.isTest ? (
                          <span className="mt-2 inline-flex rounded-full border border-command-cyan/60 bg-command-cyan/10 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-command-cyan">
                            QA TEST RECORD — NOT REAL CLIENT
                          </span>
                        ) : null}
                      </td>
                      <td className="border-y border-command-line px-3 py-3">{item.paymentMilestone}</td>
                      <td className="border-y border-command-line px-3 py-3">{item.chaseStatus}</td>
                      <td className="border-y border-command-line px-3 py-3">{item.nextChaseDate}</td>
                      <td className="rounded-r-xl border-y border-r border-command-line px-3 py-3 text-command-amber">{item.stopWorkWarning || item.scheduleSource}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={8} className="rounded-xl border border-command-line bg-command-bg/55 px-3 py-4 text-command-muted">
                      No open collection milestones right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-5 space-y-3 md:hidden">
            {collectionQueue.length ? collectionQueue.map((item) => {
              const project = projects.find((row) => row.id === item.projectId);
              return (
              <article key={item.id} className="rounded-xl border border-command-line bg-command-bg/55 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-command-cyan">Client</p>
                    <h3 className="mt-1 text-lg font-semibold text-command-text">{item.clientName}</h3>
                    {project?.isTest ? (
                      <span className="mt-2 inline-flex rounded-full border border-command-cyan/60 bg-command-cyan/10 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-command-cyan">
                        QA TEST RECORD — NOT REAL CLIENT
                      </span>
                    ) : null}
                  </div>
                  <p className="text-right text-lg font-semibold text-command-text">{money(item.amountDue)}</p>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-command-muted">Overdue days</dt>
                    <dd className={item.overdueDays > 0 ? "font-semibold text-command-red" : "font-semibold text-command-green"}>{item.overdueDays}</dd>
                  </div>
                  <div>
                    <dt className="text-command-muted">Milestone</dt>
                    <dd className="font-semibold text-command-text">{item.paymentMilestone}</dd>
                  </div>
                  <div>
                    <dt className="text-command-muted">Warning</dt>
                    <dd className="font-semibold text-command-amber">{item.stopWorkWarning || item.scheduleSource}</dd>
                  </div>
                  <div>
                    <dt className="text-command-muted">Next chase</dt>
                    <dd className="font-semibold text-command-text">{item.nextChaseDate}</dd>
                  </div>
                </dl>
              </article>
              );
            }) : (
              <p className="rounded-xl border border-command-line bg-command-bg/55 p-4 text-command-muted">
                No open collection milestones right now.
              </p>
            )}
          </div>
        </article>
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
                    {project.isTest ? (
                      <span className="mt-2 inline-flex rounded-full border border-command-cyan/60 bg-command-cyan/10 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-command-cyan">
                        QA TEST RECORD — NOT REAL CLIENT
                      </span>
                    ) : null}
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
            {activePaymentRows.length ? activePaymentRows.map((payment) => (
              <div key={payment.id} className="rounded-xl border border-command-line bg-command-bg/55 p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold text-command-text">{payment.paymentType}</p>
                  <p className="text-command-text">{money(payment.amount)}</p>
                </div>
                {payment.isTest ? (
                  <span className="mt-2 inline-flex rounded-full border border-command-cyan/60 bg-command-cyan/10 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-command-cyan">
                    QA TEST RECORD — NOT REAL CLIENT
                  </span>
                ) : null}
                <p className="mt-1 text-command-muted">Status: {payment.status} | Due: {payment.dueDate || "Not set"} | Received: {payment.receivedDate || "Not received"}</p>
                <p className="mt-1 text-command-subtle">Void instead of delete if this entry is wrong.</p>
                {!payment.receivedDate ? (
                  <form action={recordPaymentReceivedAction} className="mt-3">
                    <input type="hidden" name="payment_id" value={payment.id} />
                    <ActionButton type="submit" tone="muted" data-testid={`record-${payment.paymentType}-received-${payment.id}`}>
                      Record {payment.paymentType} Received
                    </ActionButton>
                  </form>
                ) : null}
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

      <section id="job-start-gate" className="mt-6 mission-panel rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-cyan">Do Not Start Gate</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {projects.length ? projects.map((project) => {
            const gate = buildDoNotStartGate(project, leadById.get(project.leadId), payments, logsByLead.get(project.leadId) ?? []);
            return (
              <article key={project.id} className="rounded-xl border border-command-line bg-command-bg/55 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                      gate.canStart ? "border-command-green/60 bg-command-green/10 text-command-green" : "border-command-red/60 bg-command-red/10 text-command-red"
                    }`}>
                      {gate.statusLabel}
                    </span>
                    <h3 className="mt-3 text-lg font-semibold text-command-text">{project.clientName}</h3>
                    <p className="mt-1 text-sm text-command-muted">{project.scopeSummary || project.propertyType}</p>
                  </div>
                  <a href="/delivery" className="inline-flex min-h-10 items-center rounded-xl border border-command-line bg-command-card px-3 py-2 text-sm font-semibold text-command-text">
                    Delivery view
                  </a>
                </div>
                <p className="mt-4 text-sm text-command-muted">
                  Missing: <strong className="text-command-text">{gate.missingItems.length ? gate.missingItems.join(", ") : "None"}</strong>
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {jobStartChecklistActions.slice(0, 4).map((item) => (
                    <form key={item.key} action={recordJobStartChecklistAction}>
                      <input type="hidden" name="lead_id" value={project.leadId} />
                      <input type="hidden" name="project_id" value={project.id} />
                      <input type="hidden" name="checklist_key" value={item.key} />
                      <input type="hidden" name="note" value={`Confirmed from Collection Queue: ${item.label}`} />
                      <ActionButton type="submit" tone="muted" data-testid={`confirm-${item.key}-${project.id}`}>{item.label}</ActionButton>
                    </form>
                  ))}
                </div>
              </article>
            );
          }) : (
            <p className="rounded-xl border border-command-line bg-command-bg/55 p-4 text-command-muted">
              No won jobs to gate yet.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
