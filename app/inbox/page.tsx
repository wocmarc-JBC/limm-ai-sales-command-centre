import { MultiChatInbox, type MultiChatConversation, type MultiChatSummary } from "@/components/inbox/MultiChatInbox";
import { can } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import { getShowTestDemoRecordsPreference } from "@/lib/data-visibility-preference";
import { listAllLeadFiles } from "@/lib/data/lead-files-repository";
import { listLatestLeadMessagesForInbox, listLeadMessagesPage } from "@/lib/data/lead-messages-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { compareInboxLatestActivity, inboxLeadFallbackActivityAt } from "@/lib/inbox-conversation-order";
import { getInboxQueueState, latestMeaningfulWhatsAppMessage } from "@/lib/inbox-queue";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { buildLeadFacts, leadFactsLocationLabel } from "@/lib/lead-facts";
import { inboxViewFilterFromParam } from "@/lib/operator-advantage";
import { isActiveProductionLeadForDailyScreens } from "@/lib/production-lead-lifecycle";
import type { Lead, LeadFile, LeadMessage } from "@/lib/types";
import Link from "next/link";

function latestWhatsAppMessage(messages: LeadMessage[]) {
  return latestMeaningfulWhatsAppMessage(messages);
}

function hasWhatsAppContactOrMessages(lead: Lead, messages: LeadMessage[]) {
  return Boolean(lead.phone?.trim()) || messages.length > 0;
}

function leadLastActivityAt(lead: Lead, messages: LeadMessage[]) {
  return latestWhatsAppMessage(messages)?.createdAt ?? inboxLeadFallbackActivityAt(lead);
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
    conversationIntent: lead.conversationIntent ?? "genuine_new_renovation_lead",
    conversationRoute: lead.conversationRoute ?? "sales_lead",
    intentClassified: Boolean(lead.intentClassifiedAt),
    leadEligible: lead.leadEligible !== false,
    intentConfidence: lead.intentConfidence ?? 0,
    botPaused: Boolean(lead.botPaused),
    needsMarcus: Boolean(lead.needsMarcus || lead.bossApprovalNeeded),
    propertyType: lead.propertyType,
    scopeSummary: lead.scopeSummary,
    lastMessagePreview: latestMessage?.body || lead.lastClientMessage || lead.scopeSummary,
    lastActivityAt: latestMessage?.createdAt ?? inboxLeadFallbackActivityAt(lead),
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
  searchParams: searchParamsPromise
}: {
  searchParams?: Promise<{
    lead?: string;
    manualReplyStatus?: string;
    manualReplyError?: string;
    view?: string;
  }>;
}) {
  const searchParams = await searchParamsPromise;
  const auth = await getCurrentProfile();
  if (!auth.authenticated) return null;
  const canManageSpam = Boolean(auth.profile && can(auth.profile.role, "soft_delete_leads"));

  const showTestDemoRecords = await getShowTestDemoRecordsPreference();
  const [leads, allFiles] = await Promise.all([
    listLeads({ includeTest: showTestDemoRecords, includeNonSales: true }),
    listAllLeadFiles()
  ]);
  const leadIds = leads.map((lead) => lead.id);
  const summaryMessagesByLead = await listLatestLeadMessagesForInbox(leadIds, 3);
  const activeLeadPool = leads
    .filter((lead) => hasWhatsAppContactOrMessages(
      lead,
      summaryMessagesByLead.get(lead.id) ?? []
    ) && (lead.leadEligible === false || isActiveProductionLeadForDailyScreens(lead, summaryMessagesByLead.get(lead.id) ?? [])))
    .sort((a, b) => compareInboxLatestActivity(
      { id: a.id, lastActivityAt: leadLastActivityAt(a, summaryMessagesByLead.get(a.id) ?? []) },
      { id: b.id, lastActivityAt: leadLastActivityAt(b, summaryMessagesByLead.get(b.id) ?? []) }
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
    const facts = buildLeadFacts(lead, orderedMessages, leadFiles);
    const summary = {
      ...buildSummary(lead, summaryMessages, leadFiles),
      propertyType: facts.propertyType.value || lead.propertyType,
      scopeSummary: facts.scopeSummary.value || lead.scopeSummary,
      floorPlanReceived: facts.floorPlanReceived.value,
      sitePhotosReceived: facts.sitePhotosReceived.value
    };

    return {
      lead,
      summary,
      messages: orderedMessages,
      context: {
        conversationIntent: lead.conversationIntent ?? "genuine_new_renovation_lead",
        conversationRoute: lead.conversationRoute ?? "sales_lead",
        intentClassified: Boolean(lead.intentClassifiedAt),
        leadEligible: lead.leadEligible !== false,
        intentConfidence: lead.intentConfidence ?? 0,
        propertyType: facts.propertyType.value || "Not provided yet",
        scopeSummary: facts.scopeSummary.value || "Scope pending",
        budgetExpectation: facts.budgetExpectation.value || "Not collected yet",
        floorPlanStatus: facts.floorPlanReceived.value ? "Received / available" : "Not received yet",
        sitePhotosStatus: facts.sitePhotosReceived.value ? "Received / available" : "Not received yet",
        referenceImagesStatus: facts.referenceImagesReceived.value ? "Received / available" : "Not received yet",
        appointmentPreference: facts.appointmentPreference.value || "Not provided yet",
        addressOrArea: facts.addressRaw.value || facts.area.value || "Not provided yet",
        postalCode: facts.postalCode.value,
        locationStatus: leadFactsLocationLabel(facts.locationStatus),
        infoCompletenessScore: facts.infoCompletenessScore,
        missingFields: facts.missingFields,
        conflictFields: facts.conflictFields,
        notes: lead.stageNotes || lead.conversationSummary || facts.scopeSummary.value || "No extra notes yet.",
        nextAction: lead.intentClassifiedAt ? facts.nextAction : "Classify conversation history before sales follow-up.",
        nextReason: lead.intentClassifiedAt
          ? facts.nextActionReason
          : "This legacy row has compatibility defaults, not a completed v10.2 intent decision."
      },
      hasOlderMessages: selected ? selectedPage.hasOlder : false,
      oldestMessageCursor: selected ? selectedPage.oldestCursor : null,
      auditTrail: []
    };
  }).sort((a, b) => compareInboxLatestActivity(a.summary, b.summary));

  return (
    <>
      <header className="mb-3 flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-xl font-semibold tracking-[-0.02em] text-command-text sm:text-2xl">WhatsApp Inbox</h1>
            <span className="hidden items-center gap-1.5 rounded-full border border-command-green/25 bg-command-green/10 px-2 py-0.5 text-[10px] font-semibold text-command-green sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-command-green" aria-hidden="true" />
              Live
            </span>
          </div>
          <p className="hidden text-[11px] text-command-subtle sm:block">Operator console · newest client activity first</p>
        </div>
        <nav className="flex shrink-0 items-center gap-1 text-xs font-semibold sm:text-sm" aria-label="Inbox links">
          <Link
            href="/leads"
            className="inline-flex min-h-10 items-center rounded-xl px-3 py-2 text-command-muted transition hover:bg-command-card hover:text-command-text"
          >
            Leads
          </Link>
          <Link
            href="/settings"
            className="hidden min-h-10 items-center rounded-xl px-3 py-2 text-command-muted transition hover:bg-command-card hover:text-command-text sm:inline-flex"
          >
            Settings
          </Link>
        </nav>
      </header>
      <MultiChatInbox
        conversations={conversations}
        canManageSpam={canManageSpam}
        selectedLeadId={searchParams?.lead}
        initialFilter={inboxViewFilterFromParam(searchParams?.view)}
        manualReplyStatus={searchParams?.manualReplyStatus}
        manualReplyError={searchParams?.manualReplyError}
      />
    </>
  );
}
