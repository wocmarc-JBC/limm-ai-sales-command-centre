import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth/session";
import { getReplyPerformanceSummary, type ReplyPerformanceRange } from "@/lib/data/reply-performance-repository";

function humanize(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMinutes(value: number | null) {
  if (value === null) return "No sample";
  if (value < 1) return `${Math.round(value * 60)} sec`;
  if (value < 60) return `${Math.round(value * 10) / 10} min`;
  return `${Math.round((value / 60) * 10) / 10} hr`;
}

export default async function ReplyPerformancePage({
  searchParams: searchParamsPromise
}: {
  searchParams?: Promise<{ range?: string; move?: string; includeQa?: string }>;
}) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) {
    return (
      <>
        <PageHeader title="Reply Performance" eyebrow="Protected sales learning" />
        <section className="mission-panel rounded-2xl p-6 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Login required</p>
          <h2 className="mt-1 text-2xl font-semibold text-command-text">Protected conversation outcomes</h2>
          <p className="mt-2 text-sm text-command-muted">Sign in before viewing client-response and AI-reply performance.</p>
        </section>
      </>
    );
  }

  const searchParams = await searchParamsPromise;
  const range: ReplyPerformanceRange = ["7d", "30d", "90d", "all"].includes(searchParams?.range || "")
    ? searchParams?.range as ReplyPerformanceRange
    : "30d";
  const move = searchParams?.move || "all";
  const includeQa = auth.profile.role === "boss" && searchParams?.includeQa === "true";
  const summary = await getReplyPerformanceSummary({ range, move, includeQa });
  const moves = summary.byMove.map((item) => item.move);
  const cards = [
    ["Replies measured", summary.sampleSize, "Live AI replies in the selected view"],
    ["Client response rate", `${summary.responseRatePercent}%`, `${summary.responded} clients responded`],
    ["Positive progression", `${summary.progressionRatePercent}%`, `${summary.positiveProgression} conversations advanced`],
    ["Median client response", formatMinutes(summary.medianResponseMinutes), "Time from AI reply to next client message"],
    ["Files received", summary.filesReceived, "Plans, photos or documents after a reply"],
    ["Appointment interest", summary.appointmentInterest, "Meeting or site-discussion signals"],
    ["Quotation interest", summary.quotationInterest, "Price or quotation progression"],
    ["Frustration rate", `${summary.frustrationRatePercent}%`, `${summary.frustration} negative or corrective responses`]
  ] as const;

  return (
    <>
      <PageHeader title="Reply Performance" eyebrow="Actual client outcomes after AI replies">
        <Link href="/revenue-intelligence" className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-sm font-semibold text-command-muted">Revenue intelligence</Link>
        {auth.profile.role === "boss" ? <Link href="/reply-strategy-recommendations" className="inline-flex min-h-11 items-center rounded-xl border border-command-cyan/45 bg-command-cyan/10 px-4 py-2 text-sm font-semibold text-command-cyan">Strategy recommendations</Link> : null}
        <Link href="/inbox/priority" className="inline-flex min-h-11 items-center rounded-xl border border-command-gold/45 bg-command-gold/10 px-4 py-2 text-sm font-semibold text-command-gold">Marcus priority queue</Link>
      </PageHeader>

      <form className="mb-5 grid gap-3 rounded-2xl border border-command-line bg-command-card p-4 shadow-premium sm:grid-cols-[repeat(2,minmax(0,1fr))_auto_auto] sm:items-end">
        <label className="grid gap-2 text-sm font-semibold text-command-text">
          Date range
          <select name="range" defaultValue={range} className="min-h-11 rounded-xl border border-command-line bg-command-panel2 px-3 text-command-text">
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All retained production data</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-command-text">
          Reply move
          <select name="move" defaultValue={move} className="min-h-11 rounded-xl border border-command-line bg-command-panel2 px-3 text-command-text">
            <option value="all">All reply moves</option>
            {moves.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </select>
        </label>
        {auth.profile.role === "boss" ? (
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-command-line bg-command-panel2 px-3 text-sm font-semibold text-command-text">
            <input type="checkbox" name="includeQa" value="true" defaultChecked={includeQa} className="h-5 w-5 accent-command-gold" />
            Include QA
          </label>
        ) : <span />}
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-sm font-semibold text-black">Apply filters</button>
      </form>

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
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-gold">Sales move comparison</p>
            <h2 className="mt-1 text-xl font-semibold text-command-text">Which replies move clients forward?</h2>
          </div>
          <p className="max-w-xl text-xs leading-5 text-command-subtle">Rates are observational. Small samples are shown rather than hidden, but should not be used for automatic promotion until enough genuine conversations accumulate.</p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[72rem] text-left text-sm">
            <thead className="text-command-subtle"><tr>{["Reply move", "Replies", "Responded", "Response rate", "Progressed", "Progression rate", "Files", "Appointments", "Quotation", "Frustration", "Corrections"].map((label) => <th key={label} className="border-b border-command-line px-3 py-2 font-semibold">{label}</th>)}</tr></thead>
            <tbody>
              {summary.byMove.map((item) => (
                <tr key={item.move} className="border-b border-command-line/60">
                  <td className="px-3 py-3 font-semibold text-command-text">{humanize(item.move)}</td>
                  <td className="px-3 py-3 text-command-muted">{item.replies}</td>
                  <td className="px-3 py-3 text-command-muted">{item.responded}</td>
                  <td className="px-3 py-3 font-semibold text-command-cyan">{item.responseRatePercent}%</td>
                  <td className="px-3 py-3 text-command-muted">{item.progressed}</td>
                  <td className="px-3 py-3 font-semibold text-command-green">{item.progressionRatePercent}%</td>
                  <td className="px-3 py-3 text-command-muted">{item.files}</td>
                  <td className="px-3 py-3 text-command-muted">{item.appointments}</td>
                  <td className="px-3 py-3 text-command-muted">{item.quotations}</td>
                  <td className="px-3 py-3 text-command-muted">{item.frustration}</td>
                  <td className="px-3 py-3 text-command-muted">{item.corrections}</td>
                </tr>
              ))}
              {!summary.byMove.length ? <tr><td colSpan={11} className="px-3 py-8 text-center text-command-muted">No measured client outcomes in this view yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
        <article className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-cyan">Outcome distribution</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {summary.outcomes.map((item) => (
              <div key={item.outcome} className="rounded-xl border border-command-line bg-command-bg/55 p-4">
                <div className="flex items-center justify-between gap-3"><span className="font-semibold text-command-text">{humanize(item.outcome)}</span><span className="text-lg font-semibold text-command-cyan">{item.count}</span></div>
              </div>
            ))}
            {!summary.outcomes.length ? <p className="text-sm text-command-muted">The learning worker has not recorded client outcomes for this view yet.</p> : null}
          </div>
        </article>
        <article className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-command-gold">Human correction</p>
          <p className="mt-2 text-3xl font-semibold text-command-text">{summary.correctionRatePercent}%</p>
          <p className="mt-2 text-sm leading-6 text-command-muted">{summary.humanCorrection} replies were edited or rejected by an operator in the selected sample. These corrections should guide the next controlled reply-strategy revision.</p>
        </article>
      </section>
    </>
  );
}
