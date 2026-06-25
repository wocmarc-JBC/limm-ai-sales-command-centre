import { MultiChatInbox, type MultiChatConversation, type MultiChatSummary } from "@/components/inbox/MultiChatInbox";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth/session";
import { listAllLeadFiles } from "@/lib/data/lead-files-repository";
import { listLatestLeadMessagesForInbox, listLeadMessagesPage } from "@/lib/data/lead-messages-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { getInboxQueueState, inboxQueuePriority, latestMeaningfulWhatsAppMessage } from "@/lib/inbox-queue";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { buildLeadIntakePlan } from "@/lib/lead-intake";
import { getNextBestAction } from "@/lib/next-best-action";
import { inferLeadLocation } from "@/lib/singapore-location";
import type { Lead, LeadFile, LeadMessage } from "@/lib/types";

function latestWhatsAppMessage(messages: LeadMessage[]) {
  return latestMeaningfulWhatsAppMessage(messages);
}

function hasWhatsAppContactOrMessages(lead: Lead, messages: LeadMessage[]) {
  return Boolean(lead.phone?.trim()) || messages.length > 0;
}

function buildSummary(lead: Lead, messages: LeadMessage[], files: LeadFile[]): MultiChatSummary {
  const latestMessage = latestWhatsAppMessage(messages);
  const queue = getInboxQueueState(lead, messages);
  const floorPlanReceived = files.some((file) => file.fileStatus !== "voided" && file.fileCategory === "floor_plan");
  const sitePhotosReceived = files.some((file) => file.fileStatus !== "voided" && file.fileCategory === "site_photos");
  return {
    id: lead.id,
    displayName: formatLeadDisplayName(lead),
    phone: lead.phone,
    status: lead.status,
    botPaused: Boolean(lead.botPaused),
    needsMarcus: Boolean(lead.needsMarcus || lead.bossApprovalNeeded),
    propertyType: lead.propertyType,
    scopeSummary: lead.scopeSummary,
    lastMessagePreview: latestMessage?.body || lead.lastClientMessage || lead.scopeSummary,
    lastActivityAt: latestMessage?.createdAt ?? lead.updatedAt ?? lead.createdAt,
    primaryStatus: queue.primaryStatus,
    unreadCount: queue.unreadCount,
    failedSend: queue.failedSend,
    waitingForClient: queue.waitingForClient,
    waitingForMarcus: queue.waitingForMarcus,
    closedOrDone: queue.closedOrDone,
    floorPlanReceived,
    sitePhotosReceived
  };
}

export default async function WhatsAppInboxPage({
  searchParams
}: {
  searchParams?: {
    lead?: string;
    manualReplyStatus?: string;
    manualReplyError?: string;
  };
}) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) return null;

  const [leads, allFiles] = await Promise.all([
    listLeads({ includeTest: true }),
    listAllLeadFiles()
  ]);
  const leadIds = leads.map((lead) => lead.id);
  const summaryMessagesByLead = await listLatestLeadMessagesForInbox(leadIds, 3);
  const activeLeadPool = leads.filter((lead) => hasWhatsAppContactOrMessages(
    lead,
    summaryMessagesByLead.get(lead.id) ?? []
  ));
  const selectedLeadFromQuery = searchParams?.lead
    ? activeLeadPool.find((lead) => lead.id === searchParams.lead)
    : undefined;
  const firstThirtyActiveLeads = activeLeadPool.slice(0, 30);
  const activeLeads = selectedLeadFromQuery && !firstThirtyActiveLeads.some((lead) => lead.id === selectedLeadFromQuery.id)
    ? [selectedLeadFromQuery, ...firstThirtyActiveLeads.slice(0, 29)]
    : firstThirtyActiveLeads;
  const defaultSelectedLeadId = searchParams?.lead && activeLeads.some((lead) => lead.id === searchParams.lead)
    ? searchParams.lead
    : activeLeads[0]?.id;
  const selectedLead = activeLeads.find((lead) => lead.id === defaultSelectedLeadId);
  const selectedPage = selectedLead
    ? await listLeadMessagesPage(selectedLead.id, 30)
    : { messages: [], hasOlder: false, oldestCursor: null };

  const conversations: MultiChatConversation[] = activeLeads.map((lead) => {
    const summaryMessages = summaryMessagesByLead.get(lead.id) ?? [];
    const selected = lead.id === selectedLead?.id;
    const orderedMessages = selected
      ? selectedPage.messages
      : [...summaryMessages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const leadFiles = allFiles.filter((file) => file.leadId === lead.id);
    const summary = buildSummary(lead, summaryMessages, leadFiles);
    const intakePlan = buildLeadIntakePlan(lead, orderedMessages);
    const intakeProfile = intakePlan.profile;
    const location = inferLeadLocation(lead);
    const next = getNextBestAction(lead);

    return {
      lead,
      summary,
      messages: orderedMessages,
      context: {
        budgetExpectation: intakeProfile.budgetExpectation || "Not collected yet",
        floorPlanStatus: summary.floorPlanReceived || intakeProfile.floorPlanStatus ? "Received / available" : "Not received yet",
        sitePhotosStatus: summary.sitePhotosReceived || intakeProfile.sitePhotosStatus ? "Received / available" : "Not received yet",
        appointmentPreference: intakeProfile.preferredMeetingTiming || lead.preferredContactTime || "Not provided yet",
        addressOrArea: intakeProfile.propertyAreaOrAddress || lead.projectAddress || lead.propertyArea || location.area || "Not provided yet",
        notes: lead.stageNotes || lead.conversationSummary || lead.scopeSummary || "No extra notes yet.",
        nextAction: next.action,
        nextReason: next.reason
      },
      hasOlderMessages: selected ? selectedPage.hasOlder : false,
      oldestMessageCursor: selected ? selectedPage.oldestCursor : null,
      auditTrail: []
    };
  }).sort((a, b) => {
    const priority = inboxQueuePriority(a.summary) - inboxQueuePriority(b.summary);
    if (priority !== 0) return priority;
    return new Date(b.summary.lastActivityAt).getTime() - new Date(a.summary.lastActivityAt).getTime();
  });

  return (
    <>
      <PageHeader title="LIMM WhatsApp Inbox" eyebrow="Operator console">
        <a
          href="/leads"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-muted transition hover:border-command-gold/60"
        >
          Lead list
        </a>
        <a
          href="/settings"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-muted transition hover:border-command-gold/60"
        >
          Settings
        </a>
      </PageHeader>
      <MultiChatInbox
        conversations={conversations}
        selectedLeadId={searchParams?.lead}
        manualReplyStatus={searchParams?.manualReplyStatus}
        manualReplyError={searchParams?.manualReplyError}
      />
    </>
  );
}
