import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth/session";
import { getShowTestDemoRecordsPreference } from "@/lib/data-visibility-preference";
import { listLeadMessagesForRevenueIntelligence } from "@/lib/data/lead-messages-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { buildRevenueIntelligence, formatRevenue } from "@/lib/revenue-intelligence";

export default async function RevenueIntelligencePage() {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) return null;
  const showTest = await getShowTestDemoRecordsPreference();
  const leads = await listLeads({ includeTest: showTest, includeNonSales: false });
  const messages = await listLeadMessagesForRevenueIntelligence(leads.map((lead) => lead.id));
  const intelligence = buildRevenueIntelligence(leads, messages);
  const funnelSteps = [
    ["Leads", intelligence.funnel.leads],
    ["Responded", intelligence.funnel.responded],
    ["Appointments", intelligence.funnel.appointments],
    ["Quoted", intelligence.funnel.quoted],
    ["Won", intelligence.funnel.won]
  ] as const;
  return (
    <>
      <PageHeader title="Revenue Intelligence" eyebrow="Source → response → appointment → quote → won">
        <Link href="/sales-pipeline" className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-sm font-semibold text-command-muted">Sales pipeline</Link>
        <Link href="/inbox?view=mine" className="inline-flex min-h-11 items-center rounded-xl border border-command-gold/45 bg-command-gold/10 px-4 py-2 text-sm font-semibold text-command-gold">Work my queue</Link>
      </PageHeader>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Potential pipeline", formatRevenue(intelligence.potentialValue)],
          ["Weighted forecast", formatRevenue(intelligence.weightedForecast)],
          ["Confirmed revenue", formatRevenue(intelligence.confirmedRevenue)],
          ["Median first response", intelligence.medianFirstResponseMinutes === null ? "No sample" : `${intelligence.medianFirstResponseMinutes} min`]
        ].map(([label, value]) => <article key={label} className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium"><p className="text-sm text-command-muted">{label}</p><p className="mt-2 text-2xl font-semibold text-command-text">{value}</p></article>)}
      </section>

      <section className="mt-5 rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-gold">Conversion funnel</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {funnelSteps.map(([label, value], index) => {
            const prior = index === 0 ? value : funnelSteps[index - 1][1];
            const rate = index === 0 || !prior ? 100 : Math.round(value / prior * 100);
            return <div key={label} className="relative rounded-xl border border-command-line bg-command-bg/55 p-4"><p className="text-sm text-command-muted">{label}</p><p className="mt-1 text-2xl font-semibold text-command-text">{value}</p>{index > 0 ? <p className="mt-1 text-xs text-command-cyan">{rate}% from prior step</p> : null}</div>;
          })}
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
        <article className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-cyan">Next-best revenue work</p>
          <h2 className="mt-1 text-xl font-semibold text-command-text">Priority opportunities</h2>
          <div className="mt-4 divide-y divide-command-line">
            {intelligence.priorities.map((item) => (
              <Link key={item.leadId} href={`/inbox?lead=${encodeURIComponent(item.leadId)}`} className="grid gap-2 py-4 transition hover:bg-command-bg/40 sm:grid-cols-[3rem_minmax(0,1fr)_8rem] sm:px-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-command-gold/10 font-semibold text-command-gold">{item.score}</span>
                <span className="min-w-0"><span className="block truncate font-semibold text-command-text">{item.clientName}</span><span className="mt-1 block text-sm text-command-muted">{item.nextAction}</span><span className="mt-1 block text-xs text-command-subtle">{item.reason}</span></span>
                <span className="text-left sm:text-right"><span className="block text-sm font-semibold text-command-text">{formatRevenue(item.weightedValue)}</span><span className="text-xs text-command-subtle">weighted</span></span>
              </Link>
            ))}
            {!intelligence.priorities.length ? <p className="py-5 text-command-muted">No active revenue opportunities in the current production view.</p> : null}
          </div>
        </article>
        <article className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-cyan">Response-time impact</p>
          <h2 className="mt-1 text-xl font-semibold text-command-text">Conversation advancement</h2>
          <p className="mt-2 text-sm leading-6 text-command-muted">Observed association from actual first inbound-to-outbound timestamps. This is directional, not proof of causation.</p>
          <div className="mt-4 space-y-3">
            {intelligence.responseImpact.map((bucket) => <div key={bucket.label} className="rounded-xl border border-command-line bg-command-bg/55 p-3"><div className="flex justify-between gap-3 text-sm"><span className="text-command-muted">{bucket.label}</span><span className="font-semibold text-command-text">{bucket.advanceRatePercent}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-command-line"><div className="h-full rounded-full bg-command-cyan" style={{ width: `${bucket.advanceRatePercent}%` }} /></div><p className="mt-1 text-xs text-command-subtle">{bucket.advanced} advanced / {bucket.conversations} conversations</p></div>)}
          </div>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-gold">Source economics</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm"><thead className="text-command-subtle"><tr>{["Source", "Leads", "Responded", "Advanced", "Won", "Weighted value"].map((label) => <th key={label} className="border-b border-command-line px-3 py-2 font-semibold">{label}</th>)}</tr></thead><tbody>{intelligence.sources.map((source) => <tr key={source.source} className="border-b border-command-line/60"><td className="px-3 py-3 font-semibold text-command-text">{source.source}</td><td className="px-3 py-3 text-command-muted">{source.leads}</td><td className="px-3 py-3 text-command-muted">{source.responded}</td><td className="px-3 py-3 text-command-muted">{source.advanced}</td><td className="px-3 py-3 text-command-muted">{source.won}</td><td className="px-3 py-3 font-semibold text-command-text">{formatRevenue(source.weightedValue)}</td></tr>)}</tbody></table>
        </div>
      </section>
    </>
  );
}
