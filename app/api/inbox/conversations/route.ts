import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getShowTestDemoRecordsPreference } from "@/lib/data-visibility-preference";
import { listAllLeadFiles } from "@/lib/data/lead-files-repository";
import { listLatestLeadMessagesForInbox } from "@/lib/data/lead-messages-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { compareInboxLatestActivity, inboxLeadFallbackActivityAt } from "@/lib/inbox-conversation-order";
import { getInboxQueueState, latestMeaningfulWhatsAppMessage } from "@/lib/inbox-queue";
import { buildLeadFacts } from "@/lib/lead-facts";
import { isActiveProductionLeadForDailyScreens } from "@/lib/production-lead-lifecycle";
import type { Lead, LeadFile, LeadMessage } from "@/lib/types";

function latestWhatsAppMessage(messages: LeadMessage[]) {
  return latestMeaningfulWhatsAppMessage(messages);
}

function hasWhatsAppContactOrMessages(lead: Lead, messages: LeadMessage[]) {
  return Boolean(lead.phone?.trim()) || messages.length > 0;
}

function leadLastActivityAt(lead: Lead, messages: LeadMessage[]) {
  return latestWhatsAppMessage(messages)?.createdAt ?? inboxLeadFallbackActivityAt(lead);
}

function buildSummary(lead: Lead, messages: LeadMessage[], files: LeadFile[]) {
  const latestMessage = latestWhatsAppMessage(messages);
  const queue = getInboxQueueState(lead, messages);
  const facts = buildLeadFacts(lead, messages, files);
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
    propertyType: facts.propertyType.value || lead.propertyType,
    scopeSummary: facts.scopeSummary.value || lead.scopeSummary,
    lastMessagePreview: latestMessage?.body || lead.lastClientMessage || lead.scopeSummary,
    lastActivityAt: latestMessage?.createdAt ?? inboxLeadFallbackActivityAt(lead),
    primaryStatus: queue.primaryStatus,
    unreadCount: queue.unreadCount,
    failedSend: queue.failedSend,
    waitingForClient: queue.waitingForClient,
    waitingForMarcus: queue.waitingForMarcus,
    closedOrDone: queue.closedOrDone,
    floorPlanReceived: facts.floorPlanReceived.value,
    sitePhotosReceived: facts.sitePhotosReceived.value
  };
}

export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const showTestDemoRecords = await getShowTestDemoRecordsPreference();
  const [leads, allFiles] = await Promise.all([
    listLeads({ includeTest: showTestDemoRecords, includeNonSales: true }),
    listAllLeadFiles()
  ]);
  const leadIds = leads.map((lead) => lead.id);
  const summaryMessagesByLead = await listLatestLeadMessagesForInbox(leadIds, 3);
  const activeLeads = leads
    .filter((lead) => hasWhatsAppContactOrMessages(
      lead,
      summaryMessagesByLead.get(lead.id) ?? []
    ) && (lead.leadEligible === false || isActiveProductionLeadForDailyScreens(lead, summaryMessagesByLead.get(lead.id) ?? [])))
    .sort((a, b) => compareInboxLatestActivity(
      { id: a.id, lastActivityAt: leadLastActivityAt(a, summaryMessagesByLead.get(a.id) ?? []) },
      { id: b.id, lastActivityAt: leadLastActivityAt(b, summaryMessagesByLead.get(b.id) ?? []) }
    ))
    .slice(0, 30);
  const conversations = activeLeads
    .map((lead) => buildSummary(
      lead,
      summaryMessagesByLead.get(lead.id) ?? [],
      allFiles.filter((file) => file.leadId === lead.id)
    ))
    .sort(compareInboxLatestActivity);

  return NextResponse.json({
    ok: true,
    conversations
  });
}
