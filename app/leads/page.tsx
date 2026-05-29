import { LeadCard } from "@/components/LeadCard";
import { PageHeader } from "@/components/PageHeader";
import { listLeads } from "@/lib/data/leads-repository";

export default async function LeadInboxPage() {
  const leads = await listLeads();
  return (
    <>
      <PageHeader title="AI Lead Inbox" eyebrow="Reply queue" />
      <div className="space-y-4">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </>
  );
}
