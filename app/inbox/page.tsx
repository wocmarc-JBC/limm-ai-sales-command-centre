import { MultiChatInbox, type MultiChatConversation, type MultiChatSummary } from "@/components/inbox/MultiChatInbox";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/data/audit-repository";
import { listAllLeadFiles } from "@/lib/data/lead-files-repository";
import { listLeadMessages } from "@/lib/data/lead-messages-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { buildLeadIntakePlan } from "@/lib/lead-intake";
import { getNextBestAction } from "@/lib/next-best-action";
import { inferLeadLocation } from "@/lib/singapore-location";
import type { Lead, LeadFile, LeadMessage } from "@/lib/types";

function latestWhatsAppMessage(messages: LeadMessage[]) {
  return [...messages]
    .filter((message) => message.channel === "whatsapp")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

function hasRealFailedSend(messages: LeadMessage[]) {
  return messages.some((message) => (
    message.channel === "whatsapp" &&
    message.direction === "outbound" &&
    message.whatsappStatus === "failed" &&
    !message.providerMessageId &&
    !/NEXT_REDIRECT/i.test(typeof message.metadata?.error === "string" ? message.metadata.error : "")
  ));
}

function countUnread(lead: Lead, messages: LeadMessage[]) {
  const lastReplyAt = lead.lastReplyAt ? new Date(lead.lastReplyAt).getTime() : 0;
  return messages.filter((message) => (
    message.channel === "whatsapp" &&
    message.direction === "inbound" &&
    new Date(message.createdAt).getTime() > lastReplyAt
  )).length;
}

function buildSummary(lead: Lead, messages: LeadMessage[], files: LeadFile[]): MultiChatSummary {
  const latestMessage = latestWhatsAppMessage(messages);
  const unreadCount = countUnread(lead, messages);
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
    unreadCount,
    failedSend: hasRealFailedSend(messages),
    waitingForClient: lead.status === "Awaiting Client",
    waitingForMarcus: Boolean(lead.needsMarcus || lead.bossApprovalNeeded || unreadCount > 0),
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
    listLeads(),
    listAllLeadFiles()
  ]);
  const activeLeads = leads.slice(0, 30);
  const conversations: MultiChatConversation[] = (await Promise.all(activeLeads.map(async (lead) => {
    const [messages, auditLogs] = await Promise.all([
      listLeadMessages(lead.id),
      listAuditLogs({ entityType: "lead", entityId: lead.id })
    ]);
    const orderedMessages = [...messages]
      .filter((message) => message.channel === "whatsapp")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const leadFiles = allFiles.filter((file) => file.leadId === lead.id);
    const summary = buildSummary(lead, orderedMessages, leadFiles);
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
      auditTrail: auditLogs
        .filter((entry) => entry.action.startsWith("whatsapp_"))
        .slice(0, 8)
        .map((entry) => ({
          id: entry.id,
          action: entry.action,
          summary: entry.summary,
          createdAt: entry.createdAt
        }))
    };
  }))).sort((a, b) => new Date(b.summary.lastActivityAt).getTime() - new Date(a.summary.lastActivityAt).getTime());

  return (
    <>
      <PageHeader title="WhatsApp Sales Inbox" eyebrow="Operator console">
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
