import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { buildBossDailyBrief, type BossBriefItem } from "@/lib/boss-ops";
import { getShowTestDemoRecordsPreference } from "@/lib/data-visibility-preference";
import { listApprovalRequests } from "@/lib/data/approvals-repository";
import { listAuditLogs } from "@/lib/data/audit-repository";
import { listFollowUps } from "@/lib/data/followups-repository";
import { listQuotationPackages } from "@/lib/data/quotation-repository";
import { getSalesCollectionData } from "@/lib/data/sales-collection-repository";
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

const mustHandleNowKeys = [
  "human_reply_needed",
  "angry_confused_clients",
  "followups_overdue",
  "quotations_awaiting_boss",
  "bot_paused_takeover"
];

const salesToPushKeys = [
  "hot_leads_not_followed",
  "high_risk_leads",
  "todays_appointments"
];

const monitoringKeys = [
  "jobs_blocked_from_starting",
  "deposits_unpaid",
  "overdue_collections"
];

const tonePriority = {
  red: 0,
  amber: 1,
  gold: 2,
  cyan: 3,
  green: 4,
  slate: 5
} as const;

function sortAttentionItems(items: BossBriefItem[]) {
  return [...items].sort((a, b) => {
    if (a.count === 0 && b.count > 0) return 1;
    if (a.count > 0 && b.count === 0) return -1;
    if (tonePriority[a.tone] !== tonePriority[b.tone]) return tonePriority[a.tone] - tonePriority[b.tone];
    return b.count - a.count;
  });
}

function groupCount(items: BossBriefItem[]) {
  return items.reduce((sum, item) => sum + item.count, 0);
}

export default async function BossDailyBriefPage() {
  const showTestDemoRecords = await getShowTestDemoRecordsPreference();
  const [{ leads, projects, payments }, followUps, auditLogs] = await Promise.all([
    getSalesCollectionData(undefined, { includeTestDemo: showTestDemoRecords }),
    listFollowUps({ status: "active", pageSize: 80, includeTest: showTestDemoRecords }),
    listAuditLogs()
  ]);
  const visibleLeadIds = new Set(leads.map((lead) => lead.id));
  const [approvalRequests, quotationPackages] = await Promise.all([
    listApprovalRequests({ includeTestDemo: showTestDemoRecords, visibleLeadIds }),
    listQuotationPackages({ includeTestDemo: showTestDemoRecords, visibleLeadIds })
  ]);
  const briefItems = buildBossDailyBrief({ leads, followUps, approvalRequests, quotationPackages, projects, payments, auditLogs });
  const itemByKey = new Map(briefItems.map((item) => [item.key, item]));
  const mustHandleNow = sortAttentionItems(mustHandleNowKeys.map((key) => itemByKey.get(key)).filter(Boolean) as typeof briefItems);
  const salesToPush = sortAttentionItems(salesToPushKeys.map((key) => itemByKey.get(key)).filter(Boolean) as typeof briefItems);
  const monitoring = sortAttentionItems(monitoringKeys.map((key) => itemByKey.get(key)).filter(Boolean) as typeof briefItems);
  const activeGroups = [
    { title: "Must Handle Now", href: "/inbox", items: mustHandleNow, detail: "Human takeover, complaints, overdue follow-ups, and boss quote decisions." },
    { title: "Sales To Push", href: "/sales-pipeline", items: salesToPush, detail: "Hot leads, high-risk opportunities, and appointment pressure." },
    { title: "Monitoring", href: "/delivery", items: monitoring, detail: "Start blockers, deposits, and collections that can affect delivery or cash." }
  ];
  const clearItems = briefItems.filter((item) => item.count === 0);
  const deliveryMoneyRiskCount = groupCount(monitoring);

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

      <section className="grid gap-4 lg:grid-cols-3">
        <MetricCard
          label="Must Handle Now"
          value={groupCount(mustHandleNow)}
          tone={groupCount(mustHandleNow) ? "danger" : "good"}
          detail="Reply, complaint, takeover, overdue follow-up, and quote approval pressure."
        />
        <MetricCard
          label="Sales To Push"
          value={groupCount(salesToPush)}
          tone={groupCount(salesToPush) ? "warn" : "good"}
          detail="Hot leads, risky deals, and appointment momentum to move today."
        />
        <MetricCard
          label="Delivery / Money Risk"
          value={deliveryMoneyRiskCount}
          tone={deliveryMoneyRiskCount ? "danger" : "good"}
          detail="Start blockers, unpaid deposits, and overdue collection pressure."
        />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-3">
        {activeGroups.map((group) => {
          const visibleItems = group.items.filter((item) => item.count > 0);
          return (
            <section key={group.title} className="mission-panel rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-cyan">{group.title}</p>
                  <p className="mt-2 text-sm leading-6 text-command-muted">{group.detail}</p>
                </div>
                <p className="text-3xl font-semibold tabular-nums text-command-text">{groupCount(group.items)}</p>
              </div>
              <div className="mt-4 space-y-3">
                {visibleItems.length ? visibleItems.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    className="block rounded-xl border border-command-line bg-command-bg/55 p-4 transition hover:border-command-cyan/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${briefTone(item.tone)}`}>
                          {item.count ? "Attention" : "Clear"}
                        </span>
                        <h2 className="mt-2 text-lg font-semibold text-command-text">{item.title}</h2>
                        <p className="mt-1 text-sm leading-6 text-command-muted">{item.detail}</p>
                      </div>
                      <p className="text-2xl font-semibold tabular-nums text-command-text">{item.count}</p>
                    </div>
                    {item.examples.length ? (
                      <p className="mt-3 text-sm text-command-subtle">{item.examples.join(" | ")}</p>
                    ) : null}
                  </a>
                )) : (
                  <a href={group.href} className="block rounded-xl border border-command-green/35 bg-command-green/10 p-4 text-sm text-command-green">
                    All clear: no active pressure in this group.
                  </a>
                )}
              </div>
            </section>
          );
        })}
      </section>

      <section className="mt-6 mission-panel rounded-2xl p-5">
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-command-green">
            {clearItems.length
              ? `${clearItems.length} clear module${clearItems.length === 1 ? "" : "s"} hidden`
              : "No clear modules hidden"}
          </summary>
          <p className="mt-3 text-sm text-command-subtle">
            {clearItems.length ? clearItems.map((item) => item.title).join(" | ") : "Action queue is fully visible."}
          </p>
        </details>
      </section>

      <section className="mt-6 mission-panel rounded-2xl p-5">
        <details>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Operating posture</summary>
          <p className="mt-3 text-sm leading-6 text-command-muted">
            This brief is repository-driven. It records boss decisions through audit logs, keeps WhatsApp reply review manual, keeps Calendar auto-booking off, and does not generate quotation prices.
          </p>
        </details>
      </section>
    </>
  );
}
