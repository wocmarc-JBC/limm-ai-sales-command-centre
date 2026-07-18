import { FollowUpSummaryActions } from "@/components/FollowUpSummaryActions";
import { PageHeader } from "@/components/PageHeader";
import { listFollowUpProtectionSummaries } from "@/lib/data/phase3-summaries-repository";
import type { FollowUpProtectionStatus } from "@/lib/phase3-read-models";

const statusFilters: Array<{ key: string; label: string; status?: FollowUpProtectionStatus }> = [
  { key: "all", label: "All" },
  { key: "needs_marcus", label: "Needs Marcus reply", status: "Needs Marcus reply" },
  { key: "due", label: "Follow-up due", status: "Follow-up due" },
  { key: "overdue", label: "Overdue", status: "Overdue follow-up" },
  { key: "waiting", label: "Waiting for client", status: "Waiting for client" },
  { key: "idle", label: "High-intent idle", status: "High-intent idle" },
  { key: "failed", label: "Failed send", status: "Failed send unresolved" }
];

function buildHref(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return suffix ? `/followups?${suffix}` : "/followups";
}

function tone(status: FollowUpProtectionStatus) {
  if (status === "Failed send unresolved" || status === "Overdue follow-up") return "border-command-red/55 bg-command-red/10 text-command-red";
  if (status === "Needs Marcus reply" || status === "Follow-up due" || status === "High-intent idle") return "border-command-amber/55 bg-command-amber/10 text-command-amber";
  return "border-command-line bg-command-card text-command-muted";
}

export default async function FollowUpQueuePage({
  searchParams: searchParamsPromise
}: {
  searchParams?: Promise<{ status?: string; q?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const selected = statusFilters.find((item) => item.key === searchParams?.status) ?? statusFilters[0];
  const search = searchParams?.q?.trim().toLowerCase() ?? "";
  const summaries = (await listFollowUpProtectionSummaries(80))
    .filter((item) => !selected.status || item.status === selected.status)
    .filter((item) => {
      if (!search) return true;
      return [item.clientName, item.phone, item.lastMessagePreview, item.status, item.leadSeriousness]
        .join("\n")
        .toLowerCase()
        .includes(search);
    });
  const grouped = statusFilters
    .filter((item) => item.status)
    .map((group) => ({
      ...group,
      items: summaries.filter((summary) => summary.status === group.status)
    }))
    .filter((group) => group.items.length);

  return (
    <>
      <PageHeader title="Follow-Up Queue" eyebrow="Missed-lead protection">
        <a
          href="/inbox"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-cyan/50 bg-command-cyan/10 px-4 py-2 text-base font-semibold text-command-cyan hover:bg-command-cyan/15"
        >
          Open WhatsApp Inbox
        </a>
      </PageHeader>

      <section className="mission-panel mb-5 rounded-2xl p-4 shadow-premium">
        <form action="/followups" className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <input type="hidden" name="status" value={selected.key === "all" ? "" : selected.key} />
          <input
            name="q"
            defaultValue={search}
            aria-label="Search follow-ups"
            placeholder="Search client / phone / message"
            className="min-h-12 rounded-2xl border border-command-line bg-command-bg/70 px-4 text-base text-command-text outline-none placeholder:text-command-subtle focus:border-command-cyan"
          />
          <button className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-command-cyan/60 bg-command-cyan/10 px-4 font-semibold text-command-cyan hover:bg-command-cyan/15">
            Search
          </button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {statusFilters.map((item) => (
            <a
              key={item.key}
              href={buildHref({ status: item.key === "all" ? undefined : item.key, q: search || undefined })}
              className={`inline-flex min-h-10 items-center rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                selected.key === item.key ? "border-command-cyan bg-command-cyan/10 text-command-text" : "border-command-line bg-command-card text-command-muted hover:border-command-gold/60"
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
        <p className="mt-3 text-sm text-command-muted">
          Lightweight queue built from latest WhatsApp summaries. No auto follow-up messages are sent.
        </p>
      </section>

      <section className="mission-panel rounded-2xl shadow-command">
        <div className="flex flex-col gap-2 border-b border-command-line p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Active sales protection</p>
            <h2 className="mt-1 text-2xl font-semibold text-command-text">{summaries.length} follow-up signal{summaries.length === 1 ? "" : "s"}</h2>
          </div>
          <p className="text-sm text-command-muted">Latest-message read model only</p>
        </div>

        {summaries.length ? (
          <div className="space-y-6 p-4">
            {(selected.status ? [{ ...selected, items: summaries }] : grouped).map((group) => (
              <div key={group.key}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-command-muted">{group.label}</h3>
                <div className="grid gap-3">
                  {group.items.map((item) => (
                    <article key={item.id} data-testid={`followup-summary-${item.leadId}`} className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_18rem] lg:items-start">
                        <div className="min-w-0">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone(item.status)}`}>{item.status}</span>
                          <h4 className="mt-3 text-xl font-semibold text-command-text">{item.clientName}</h4>
                          <p className="mt-1 text-sm text-command-muted">{item.phone || "Phone pending"}</p>
                          <p className="mt-3 break-words text-base leading-7 text-command-text">{item.lastMessagePreview}</p>
                          <p className="mt-2 text-sm text-command-muted">Next: {item.nextAction}</p>
                        </div>
                        <div className="rounded-xl border border-command-line bg-command-card p-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-command-subtle">Waiting</p>
                          <p className="mt-1 text-base font-semibold text-command-text">{item.whoIsWaiting}</p>
                          <p className="mt-1 text-sm text-command-muted">{item.waitingDuration}</p>
                          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-command-subtle">Seriousness</p>
                          <p className="mt-1 text-sm font-semibold text-command-cyan">{item.leadSeriousness}</p>
                        </div>
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <a href={`/inbox?lead=${encodeURIComponent(item.leadId)}`} className="inline-flex min-h-10 items-center rounded-xl border border-command-gold bg-command-gold px-3 py-2 text-sm font-semibold text-black">
                              Open WhatsApp Chat
                            </a>
                            <a href={`/leads/${encodeURIComponent(item.leadId)}`} className="inline-flex min-h-10 items-center rounded-xl border border-command-line bg-command-card px-3 py-2 text-sm font-semibold text-command-text">
                              View Lead Details
                            </a>
                          </div>
                          <FollowUpSummaryActions
                            leadId={item.leadId}
                            followUpId={item.followUpId}
                            canMarkDone={item.canMarkDone}
                            canSnooze={item.canSnooze}
                            disabledReason={item.disabledReason}
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-2xl font-semibold text-command-text">No active follow-up signals now.</p>
            <p className="mt-2 text-base text-command-muted">Active WhatsApp conversations will appear here when Marcus needs to reply or follow up.</p>
          </div>
        )}
      </section>
    </>
  );
}
