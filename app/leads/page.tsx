import { LeadCard } from "@/components/LeadCard";
import { PageHeader } from "@/components/PageHeader";
import { listLatestMeaningfulWhatsAppMessagesForLeads } from "@/lib/data/lead-messages-repository";
import { listLeads } from "@/lib/data/leads-repository";
import Link from "next/link";

const views = [
  { key: "active", label: "Active Leads", href: "/leads" },
  { key: "test", label: "Show Test Leads", href: "/leads?view=test" },
  { key: "inactive", label: "Archived / Deleted", href: "/leads?view=inactive" },
  { key: "spam", label: "Show Spam", href: "/leads?view=spam" },
  { key: "non-sales", label: "Non-Sales Conversations", href: "/leads?view=non-sales" },
  { key: "all", label: "Show All", href: "/leads?view=all" }
] as const;

export default async function LeadInboxPage({
  searchParams: searchParamsPromise
}: {
  searchParams?: Promise<{ view?: string; show_test?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const view = searchParams?.show_test === "true" ? "test" : searchParams?.view ?? "active";
  const rawLeads = await listLeads({
    includeTest: view === "test" || view === "all" || view === "spam",
    includeInactive: view === "inactive" || view === "all" || view === "spam",
    includeNonSales: view === "non-sales" || view === "all"
  });
  const leads = view === "inactive"
    ? rawLeads.filter((lead) => lead.deletedAt || lead.archivedAt)
    : view === "spam"
      ? rawLeads.filter((lead) => lead.isSpam)
      : view === "non-sales"
        ? rawLeads.filter((lead) => lead.leadEligible === false)
        : rawLeads;
  const latestWhatsAppMessages = await listLatestMeaningfulWhatsAppMessagesForLeads(leads.map((lead) => lead.id));
  return (
    <>
      <PageHeader title="AI Lead Inbox" eyebrow="Reply queue">
        <Link
          href="/leads/new"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black transition hover:bg-command-goldHover"
        >
          Create Manual Lead
        </Link>
        {views.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-base font-semibold transition hover:border-command-gold/60 ${
              view === item.key ? "border-command-cyan bg-command-cyan/10 text-command-text" : "border-command-line bg-command-card text-command-muted"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </PageHeader>
      <div className="mission-panel mb-5 rounded-2xl p-4 text-base text-command-muted shadow-premium">
        {view === "active"
          ? "Active view hides soft-deleted, archived, spam, and QA/test-generated leads by default."
          : "Review mode only. Use cleanup from Settings when you are ready to soft-delete old test data."}
      </div>
      {leads.length ? (
        <div className="space-y-5">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} latestWhatsAppMessage={latestWhatsAppMessages.get(lead.id) ?? null} />
          ))}
        </div>
      ) : (
        <section className="mission-panel rounded-2xl p-6 shadow-premium">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-gold">Inbox Clear</p>
          <h2 className="mt-2 text-2xl font-semibold text-command-text">No leads in this view.</h2>
          <p className="mt-2 max-w-2xl text-command-muted">
            Active leads stay clean by hiding test, spam, archived, and soft-deleted records. Use the filter chips above when Marcus wants to review hidden data.
          </p>
        </section>
      )}
    </>
  );
}
