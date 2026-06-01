import { LeadCard } from "@/components/LeadCard";
import { PageHeader } from "@/components/PageHeader";
import { listLeads } from "@/lib/data/leads-repository";

export default async function LeadInboxPage({ searchParams }: { searchParams?: { show_test?: string } }) {
  const showTestLeads = searchParams?.show_test === "true";
  const leads = await listLeads({ includeTest: showTestLeads });
  return (
    <>
      <PageHeader title="AI Lead Inbox" eyebrow="Reply queue">
        <a
          href={showTestLeads ? "/leads" : "/leads?show_test=true"}
          className="inline-flex min-h-11 items-center rounded-md border border-command-line bg-command-elevated px-4 py-2 text-base font-semibold text-command-text transition hover:border-command-gold/60"
        >
          {showTestLeads ? "Hide Test Leads" : "Show Test Leads"}
        </a>
      </PageHeader>
      <div className="mb-5 rounded-lg border border-command-line bg-command-card p-4 text-base text-command-muted shadow-premium">
        {showTestLeads
          ? "Showing active test leads for review. Soft-deleted, archived and spam leads remain hidden from the active inbox."
          : "Test leads are hidden from the live inbox by default. Use the filter only when reviewing cleanup."}
      </div>
      <div className="space-y-5">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </>
  );
}
