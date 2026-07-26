import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth/session";
import { getReplyPerformanceSummary, type ReplyPerformanceRange } from "@/lib/data/reply-performance-repository";
import { buildReplyStrategyRecommendations, type ReplyStrategyRecommendationStatus } from "@/lib/reply-strategy-recommendations";

function humanize(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusLabel(status: ReplyStrategyRecommendationStatus) {
  if (status === "risk_warning") return "Review risk";
  if (status === "review_candidate") return "Review candidate";
  if (status === "monitor") return "Monitor";
  return "Insufficient evidence";
}

function statusClass(status: ReplyStrategyRecommendationStatus) {
  if (status === "risk_warning") return "border-command-red/45 bg-command-red/10 text-command-red";
  if (status === "review_candidate") return "border-command-green/45 bg-command-green/10 text-command-green";
  if (status === "monitor") return "border-command-cyan/45 bg-command-cyan/10 text-command-cyan";
  return "border-command-line bg-command-bg/60 text-command-muted";
}

export default async function ReplyStrategyRecommendationsPage({
  searchParams: searchParamsPromise
}: {
  searchParams?: Promise<{ range?: string; includeQa?: string }>;
}) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) {
    return (
      <>
        <PageHeader title="Reply Strategy Recommendations" eyebrow="Protected sales learning" />
        <section className="mission-panel rounded-2xl p-6 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Login required</p>
          <h2 className="mt-1 text-2xl font-semibold text-command-text">Protected strategy evidence</h2>
          <p className="mt-2 text-sm text-command-muted">Sign in before viewing reply-strategy recommendations.</p>
        </section>
      </>
    );
  }
  if (auth.profile.role !== "boss") {
    return (
      <>
        <PageHeader title="Reply Strategy Recommendations" eyebrow="Boss-only review" />
        <section className="mission-panel rounded-2xl p-6 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-red">Restricted</p>
          <h2 className="mt-1 text-2xl font-semibold text-command-text">Marcus approval is required</h2>
          <p className="mt-2 text-sm text-command-muted">This page is limited to the boss role because it reviews changes that may affect future client replies.</p>
        </section>
      </>
    );
  }

  const searchParams = await searchParamsPromise;
  const range: ReplyPerformanceRange = ["7d", "30d", "90d", "all"].includes(searchParams?.range || "")
    ? searchParams?.range as ReplyPerformanceRange
    : "90d";
  const includeQa = searchParams?.includeQa === "true";
  const performance = await getReplyPerformanceSummary({ range, move: "all", includeQa });
  const strategy = buildReplyStrategyRecommendations(performance.byMove);
  const cards = [
    ["Reply moves measured", strategy.totalMoves, "Distinct sales moves in the selected evidence window"],
    ["Evidence eligible", strategy.eligibleMoves, `At least ${strategy.minimumReplies} replies and ${strategy.minimumResponses} observed responses`],
    ["Review candidates", strategy.reviewCandidateCount, "Candidates for Marcus review—not automatic promotion"],
    ["Risk warnings", strategy.riskWarningCount, "Moves with enough repeated frustration or correction evidence"]
  ] as const;

  return (
    <>
      <PageHeader title="Reply Strategy Recommendations" eyebrow="Evidence review · no automatic promotion">
        <Link href="/reply-performance" className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-sm font-semibold text-command-muted">Reply performance</Link>
        <Link href="/qa-centre" className="inline-flex min-h-11 items-center rounded-xl border border-command-gold/45 bg-command-gold/10 px-4 py-2 text-sm font-semibold text-command-gold">QA Centre</Link>
      </PageHeader>

      <section className="mb-5 rounded-2xl border border-command-amber/40 bg-command-amber/10 p-5 shadow-premium">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-amber">Controlled learning boundary</p>
        <h2 className="mt-1 text-xl font-semibold text-command-text">Recommendations are review prompts, not live strategy changes.</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-command-muted">A move needs at least {strategy.minimumReplies} genuine replies and {strategy.minimumResponses} observed client responses before it can become a review candidate. Marcus must inspect representative conversations and approve any controlled replay test. Automatic promotion is disabled.</p>
      </section>

      <form className="mb-5 grid gap-3 rounded-2xl border border-command-line bg-command-card p-4 shadow-premium sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <label className="grid gap-2 text-sm font-semibold text-command-text">
          Evidence window
          <select name="range" defaultValue={range} className="min-h-11 rounded-xl border border-command-line bg-command-panel2 px-3 text-command-text">
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All retained production data</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-command-line bg-command-panel2 px-3 text-sm font-semibold text-command-text">
          <input type="checkbox" name="includeQa" value="true" defaultChecked={includeQa} className="h-5 w-5 accent-command-gold" />
          Include QA evidence
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-sm font-semibold text-black">Apply filters</button>
      </form>

      {includeQa ? (
        <p className="mb-5 rounded-xl border border-command-red/40 bg-command-red/10 px-4 py-3 text-sm text-command-red">QA evidence is included. Do not use this view for production strategy decisions.</p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, detail]) => (
          <article key={label} className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
            <p className="text-sm text-command-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-command-text">{value}</p>
            <p className="mt-2 text-xs leading-5 text-command-subtle">{detail}</p>
          </article>
        ))}
      </section>

      <section className="mt-5 rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-gold">Strategy review queue</p>
            <h2 className="mt-1 text-xl font-semibold text-command-text">What deserves review—and what does not yet have enough evidence?</h2>
          </div>
          <p className="text-xs text-command-subtle">Eligible-move progression baseline: {strategy.baselineProgressionPerReplyPercent}% per reply</p>
        </div>
        <div className="mt-4 space-y-3">
          {strategy.recommendations.map((item) => (
            <article key={item.move} className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-command-text">{humanize(item.move)}</h3>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.13em] ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
                    <span className="rounded-full border border-command-line bg-command-panel2 px-2.5 py-1 text-[10px] font-semibold text-command-muted">{item.evidenceLabel} evidence</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-command-muted">{item.rationale}</p>
                  <p className="mt-2 text-sm leading-6 text-command-text"><span className="font-semibold text-command-gold">Next review action:</span> {item.nextReviewAction}</p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-3 lg:min-w-[28rem]">
                  <span className="text-command-subtle">Replies <strong className="block text-base text-command-text">{item.replies}</strong></span>
                  <span className="text-command-subtle">Responses <strong className="block text-base text-command-text">{item.responded}</strong></span>
                  <span className="text-command-subtle">Response <strong className="block text-base text-command-cyan">{item.responseRatePercent}%</strong></span>
                  <span className="text-command-subtle">Progression <strong className="block text-base text-command-green">{item.progressionPerReplyPercent}%</strong></span>
                  <span className="text-command-subtle">Frustration <strong className="block text-base text-command-text">{item.frustrationRatePercent}%</strong></span>
                  <span className="text-command-subtle">Correction <strong className="block text-base text-command-text">{item.correctionRatePercent}%</strong></span>
                </div>
              </div>
            </article>
          ))}
          {!strategy.recommendations.length ? <p className="py-6 text-center text-command-muted">No production reply moves have recorded outcomes in this evidence window.</p> : null}
        </div>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-cyan">Evidence rules</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-command-muted">
            <li>Production leads only by default; QA requires an explicit boss-only toggle.</li>
            <li>Small samples are marked insufficient rather than ranked as winners.</li>
            <li>Repeated frustration or operator correction can create a review warning before promotion eligibility.</li>
            <li>Observed associations are not treated as proof of causation.</li>
          </ul>
        </article>
        <article className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-gold">Approval boundary</p>
          <p className="mt-3 text-sm leading-6 text-command-muted">No recommendation changes the live reply brain, sends a client message, enables pricing, or books an appointment. A future strategy change requires Marcus approval, a controlled replay pack, all safety gates, and a separate production release.</p>
        </article>
      </section>
    </>
  );
}
