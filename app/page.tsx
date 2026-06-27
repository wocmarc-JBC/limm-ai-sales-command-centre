import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { buildBossDailyBrief } from "@/lib/boss-ops";
import { listApprovalRequests } from "@/lib/data/approvals-repository";
import { listAuditLogs } from "@/lib/data/audit-repository";
import { listFollowUps } from "@/lib/data/followups-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { listPaymentRecords, listProjectAccounts } from "@/lib/data/sales-collection-repository";
import { safeSingaporeDateLabel, singaporeNow } from "@/lib/date-safety";

const toneClasses = {
  red: "border-command-red/60 bg-command-red/10 text-command-red",
  amber: "border-command-amber/60 bg-command-amber/10 text-command-amber",
  gold: "border-command-gold/60 bg-command-gold/10 text-command-yellow",
  cyan: "border-command-cyan/60 bg-command-cyan/10 text-command-cyan",
  green: "border-command-green/60 bg-command-green/10 text-command-green",
  slate: "border-command-line bg-command-card text-command-muted"
};

function briefTone(tone: keyof typeof toneClasses) {
  return toneClasses[tone];
}

export default async function BossDailyBriefPage() {
  const [leads, followUps, approvalRequests, projects, payments, auditLogs] = await Promise.all([
    listLeads(),
    listFollowUps({ status: "active", pageSize: 80 }),
    listApprovalRequests(),
    listProjectAccounts(),
    listPaymentRecords(),
    listAuditLogs()
  ]);
  const briefItems = buildBossDailyBrief({ leads, followUps, approvalRequests, projects, payments, auditLogs });
  const urgentCount = briefItems
    .filter((item) => item.tone === "red" || item.tone === "amber" || item.tone === "gold")
    .reduce((sum, item) => sum + item.count, 0);
  const clearCount = briefItems.filter((item) => item.count === 0).length;

  return (
    <>
      <PageHeader title="Boss Daily Brief" eyebrow={`Today / ${safeSingaporeDateLabel(singaporeNow())}`}>
        <a href="/inbox" className="inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black transition hover:bg-command-goldHover">
          Open WhatsApp Inbox
        </a>
        <a href="/command-core" className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-text transition hover:border-command-cyan/60">
          Command Core
        </a>
      </PageHeader>

      <section className="command-grid">
        <MetricCard label="Needs Attention" value={urgentCount} tone={urgentCount ? "danger" : "good"} detail="Combined boss, sales, delivery, and collection pressure." />
        <MetricCard label="Live Leads" value={leads.length} detail="Active non-test leads from the repository." />
        <MetricCard label="Won Jobs" value={projects.length} tone="good" detail="Project/account records being tracked." />
        <MetricCard label="Queues Clear" value={clearCount} tone={clearCount > 5 ? "good" : "neutral"} detail="Brief modules with no current pressure." />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        {briefItems.map((item) => (
          <a
            key={item.key}
            href={item.href}
            className="mission-panel command-hover-lift block rounded-2xl p-5 transition hover:border-command-cyan/70 hover:shadow-glow"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${briefTone(item.tone)}`}>
                  {item.count ? "Attention" : "Clear"}
                </span>
                <h2 className="mt-3 text-xl font-semibold text-command-text">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-command-muted">{item.detail}</p>
              </div>
              <p className="text-4xl font-semibold tabular-nums text-command-text">{item.count}</p>
            </div>
            <div className="mt-4 min-h-[3.5rem] rounded-xl border border-command-line bg-command-bg/55 p-3 text-sm text-command-muted">
              {item.examples.length ? item.examples.join(" | ") : "No cases right now."}
            </div>
          </a>
        ))}
      </section>

      <section className="mt-6 mission-panel rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Operating posture</p>
        <p className="mt-2 text-sm leading-6 text-command-muted">
          This brief is repository-driven. It records boss decisions through audit logs, keeps WhatsApp reply review manual, keeps Calendar auto-booking off, and does not generate quotation prices.
        </p>
      </section>
    </>
  );
}
