import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getShowTestDemoRecordsPreference } from "@/lib/data-visibility-preference";
import { listAllLeadFiles } from "@/lib/data/lead-files-repository";
import { listLatestLeadMessagesForInbox } from "@/lib/data/lead-messages-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { getInboxQueueState, inboxQueuePriority, latestMeaningfulWhatsAppMessage } from "@/lib/inbox-queue";
import { buildLeadFacts } from "@/lib/lead-facts";
import { isActiveProductionLeadForDailyScreens } from "@/lib/production-lead-lifecycle";
import type { Lead, LeadFile, LeadMessage } from "@/lib/types";

function latestWhatsAppMessage(messages: LeadMessage[]) {
  return latestMeaningfulWhatsAppMessage(messages);
}

function hasWhatsAppContactOrMessages(lead: Lead, messages: LeadMessage[]) {
  return Boolean(lead.phone?.trim()) || messages.length > 0;
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
    botPaused: Boolean(lead.botPaused),
    needsMarcus: Boolean(lead.needsMarcus || lead.bossApprovalNeeded),
    propertyType: facts.propertyType.value || lead.propertyType,
    scopeSummary: facts.scopeSummary.value || lead.scopeSummary,
    lastMessagePreview: latestMessage?.body || lead.lastClientMessage || lead.scopeSummary,
    lastActivityAt: latestMessage?.createdAt ?? lead.updatedAt ?? lead.createdAt,
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
    listLeads({ includeTest: showTestDemoRecords }),
    listAllLeadFiles()
  ]);
  const leadIds = leads.map((lead) => lead.id);
  const summaryMessagesByLead = await listLatestLeadMessagesForInbox(leadIds, 3);
  const activeLeads = leads
    .filter((lead) => hasWhatsAppContactOrMessages(
      lead,
      summaryMessagesByLead.get(lead.id) ?? []
    ) && isActiveProductionLeadForDailyScreens(lead, summaryMessagesByLead.get(lead.id) ?? []))
    .slice(0, 30);
  const conversations = activeLeads
    .map((lead) => buildSummary(
      lead,
      summaryMessagesByLead.get(lead.id) ?? [],
      allFiles.filter((file) => file.leadId === lead.id)
    ))
    .sort((a, b) => {
      const priority = inboxQueuePriority(a) - inboxQueuePriority(b);
      if (priority !== 0) return priority;
      return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    });

  return NextResponse.json({
    ok: true,
    conversations
  });
}
