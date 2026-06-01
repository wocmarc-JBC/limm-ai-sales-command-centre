import { FollowUpActionButton } from "@/components/FollowUpActionButton";
import { PageHeader } from "@/components/PageHeader";
import { updateFollowUpStatusAction } from "@/lib/actions";
import { listFollowUpsPage } from "@/lib/data/followups-repository";
import { humanizeLabel } from "@/lib/labels";

const pageSize = 20;

async function submitFollowUpStatusAction(formData: FormData) {
  "use server";
  await updateFollowUpStatusAction(formData);
}

const filters = [
  { key: "active", label: "Active" },
  { key: "due_today", label: "Due Today" },
  { key: "overdue", label: "Overdue" },
  { key: "snoozed", label: "Snoozed" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "Show All" }
];

function buildHref(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === false) continue;
    query.set(key, String(value));
  }
  const suffix = query.toString();
  return suffix ? `/followups?${suffix}` : "/followups";
}

export default async function FollowUpQueuePage({
  searchParams
}: {
  searchParams?: { status?: string; q?: string; show_test?: string; page?: string };
}) {
  const status = filters.some((item) => item.key === searchParams?.status) ? searchParams?.status ?? "active" : "active";
  const showTest = searchParams?.show_test === "true";
  const search = searchParams?.q?.trim() ?? "";
  const page = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const result = await listFollowUpsPage({
    status: status as "active" | "due_today" | "overdue" | "snoozed" | "completed" | "all",
    includeTest: showTest,
    includeCompleted: status === "completed" || status === "all",
    search,
    page,
    pageSize
  });

  return (
    <>
      <PageHeader title="Follow-Up Queue" eyebrow="Reply-only discipline">
        <a
          href="/settings?cleanup=scan#test-lead-cleanup"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-text hover:border-command-cyan/70"
        >
          Cleanup Test Data
        </a>
      </PageHeader>

      <section className="mission-panel mb-5 rounded-2xl p-4 shadow-premium">
        <form action="/followups" className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <input type="hidden" name="status" value={status} />
          {showTest ? <input type="hidden" name="show_test" value="true" /> : null}
          <input
            name="q"
            defaultValue={search}
            aria-label="Search follow-ups"
            placeholder="Search client / phone / scope"
            className="min-h-12 rounded-2xl border border-command-line bg-command-bg/70 px-4 text-base text-command-text outline-none placeholder:text-command-subtle focus:border-command-cyan"
          />
          <button className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-command-cyan/60 bg-command-cyan/10 px-4 font-semibold text-command-cyan hover:bg-command-cyan/15">
            Search
          </button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map((item) => (
            <a
              key={item.key}
              href={buildHref({ status: item.key === "active" ? undefined : item.key, q: search, show_test: showTest ? "true" : undefined })}
              className={`inline-flex min-h-10 items-center rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                status === item.key ? "border-command-cyan bg-command-cyan/10 text-command-text" : "border-command-line bg-command-card text-command-muted hover:border-command-gold/60"
              }`}
            >
              {item.label}
            </a>
          ))}
          <a
            href={buildHref({ status: status === "active" ? undefined : status, q: search, show_test: showTest ? undefined : "true" })}
            className={`inline-flex min-h-10 items-center rounded-xl border px-3 py-2 text-sm font-semibold transition ${
              showTest ? "border-command-red/60 bg-command-red/10 text-command-red" : "border-command-line bg-command-card text-command-muted hover:border-command-gold/60"
            }`}
          >
            Show Test Follow-Ups
          </a>
        </div>
        <p className="mt-3 text-sm text-command-muted">
          Operational default shows active real follow-ups only. Test-only, generated QA, browser-test, and completed rows are hidden unless selected.
        </p>
      </section>

      <section className="mission-panel rounded-2xl shadow-command">
        <div className="flex flex-col gap-2 border-b border-command-line p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Active real queue</p>
            <h2 className="mt-1 text-2xl font-semibold text-command-text">{result.total} follow-up{result.total === 1 ? "" : "s"}</h2>
          </div>
          <p className="text-sm text-command-muted">Page {result.page} | Max {pageSize} visible rows</p>
        </div>

        {result.items.length ? (
          <div className="divide-y divide-command-line">
            {result.items.map((item) => (
              <article key={item.id} data-testid={`followup-${item.id}`} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_11rem_9rem_21rem] lg:items-center">
                <div className="min-w-0">
                  <p className="text-xl font-semibold text-command-text">{item.clientName}</p>
                  <p className="mt-1 text-sm text-command-muted">{humanizeLabel(item.templateType || item.followupType || "follow up")}</p>
                  <p className="mt-2 break-words text-base leading-7 text-command-muted">{item.suggestedMessage || "No suggested message saved."}</p>
                  {item.notes ? <p className="mt-2 text-sm text-command-subtle">Note: {item.notes}</p> : null}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-command-subtle">Due</p>
                  <p className="mt-1 text-sm text-command-text">{item.dueAt}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-command-subtle">Status</p>
                  <p className="mt-1 text-base font-semibold text-command-text">{item.status}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={submitFollowUpStatusAction}>
                    <input type="hidden" name="followup_id" value={item.id} />
                    <input type="hidden" name="status" value="Completed" />
                    <FollowUpActionButton pendingLabel="Completing..." tone="muted">Complete</FollowUpActionButton>
                  </form>
                  <form action={submitFollowUpStatusAction}>
                    <input type="hidden" name="followup_id" value={item.id} />
                    <input type="hidden" name="status" value="Snoozed" />
                    <FollowUpActionButton pendingLabel="Snoozing..." tone="muted">Snooze</FollowUpActionButton>
                  </form>
                  <form action={submitFollowUpStatusAction}>
                    <input type="hidden" name="followup_id" value={item.id} />
                    <input type="hidden" name="status" value="No Reply" />
                    <FollowUpActionButton pendingLabel="Saving..." tone="danger">No Reply</FollowUpActionButton>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-2xl font-semibold text-command-text">No active follow-ups now.</p>
            <p className="mt-2 text-base text-command-muted">
              Test and completed follow-ups stay hidden by default. Use the filters above only when reviewing cleanup or history.
            </p>
          </div>
        )}
      </section>

      {result.hasMore ? (
        <div className="mt-5 flex justify-center">
          <a
            href={buildHref({ status: status === "active" ? undefined : status, q: search, show_test: showTest ? "true" : undefined, page: page + 1 })}
            className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-text hover:border-command-cyan/70"
          >
            Load More
          </a>
        </div>
      ) : null}
    </>
  );
}
