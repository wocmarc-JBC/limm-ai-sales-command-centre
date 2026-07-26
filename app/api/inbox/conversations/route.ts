import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getShowTestDemoRecordsPreference } from "@/lib/data-visibility-preference";
import { listLeadFilesForLeads } from "@/lib/data/lead-files-repository";
import { listLatestLeadMessagesForInbox } from "@/lib/data/lead-messages-repository";
import { listInboxLeadCandidates } from "@/lib/data/leads-repository";
import { listInboxAssignments } from "@/lib/data/team-inbox-repository";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { compareInboxLatestActivity, inboxLeadFallbackActivityAt } from "@/lib/inbox-conversation-order";
import { inboxMessagePreview } from "@/lib/inbox-message-display";
import { inboxLaneFromParam, leadMatchesInboxLane } from "@/lib/inbox-lanes";
import { getInboxQueueState, latestMeaningfulWhatsAppMessage } from "@/lib/inbox-queue";
import { classifyBossTriage } from "@/lib/inbox-boss-triage";
import { buildLeadFacts } from "@/lib/lead-facts";
import { isActiveProductionLeadForDailyScreens } from "@/lib/production-lead-lifecycle";
import type { Lead, LeadFile, LeadMessage } from "@/lib/types";
import type { InboxAssignment } from "@/lib/operations/contracts";

function latestWhatsAppMessage(messages: LeadMessage[]) {
  return latestMeaningfulWhatsAppMessage(messages);
}

function hasWhatsAppContactOrMessages(lead: Lead, messages: LeadMessage[]) {
  return Boolean(lead.phone?.trim()) || messages.length > 0;
}

function leadLastActivityAt(lead: Lead, messages: LeadMessage[]) {
  return latestWhatsAppMessage(messages)?.createdAt ?? inboxLeadFallbackActivityAt(lead);
}

function requestedView(request: Request, url: URL) {
  const direct = url.searchParams.get("view");
  if (direct) return direct;
  const referer = request.headers.get("referer");
  if (!referer) return "";
  try {
    return new URL(referer).searchParams.get("view") ?? "";
  } catch {
    return "";
  }
}

function buildSummary(lead: Lead, messages: LeadMessage[], files: LeadFile[], assignment?: InboxAssignment) {
  const latestMessage = latestWhatsAppMessage(messages);
  const queue = getInboxQueueState(lead, messages);
  const facts = buildLeadFacts(lead, messages, files);
  const triage = classifyBossTriage(lead, messages);
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
    lastMessagePreview: latestMessage ? inboxMessagePreview(latestMessage) : lead.lastClientMessage || lead.scopeSummary,
    lastActivityAt: latestMessage?.createdAt ?? inboxLeadFallbackActivityAt(lead),
    primaryStatus: queue.primaryStatus,
    unreadCount: queue.unreadCount,
    failedSend: queue.failedSend,
    waitingForClient: queue.waitingForClient,
    waitingForMarcus: queue.waitingForMarcus,
    closedOrDone: queue.closedOrDone,
    floorPlanReceived: facts.floorPlanReceived.value,
    sitePhotosReceived: facts.sitePhotosReceived.value,
    assignedProfileId: assignment?.assignedProfileId ?? null,
    assignedName: assignment?.assignedName ?? lead.assignedTo ?? "",
    assignmentLeaseExpiresAt: assignment?.leaseExpiresAt ?? null,
    bossTriageCategory: triage.category,
    bossPriorityScore: triage.priorityScore,
    bossTriageReason: triage.reason,
    requiresReply: triage.requiresReply
  };
}

export async function GET(request: Request) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const showTestDemoRecords = await getShowTestDemoRecordsPreference();
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 30), 100));
  const offset = Math.max(0, Number(url.searchParams.get("cursor") || 0));
  const priorityOnly = url.searchParams.get("priority") === "true";
  const lane = inboxLaneFromParam(requestedView(request, url));
  // A bounded cross-route pool supports sales and non-sales lanes without allowing
  // nuisance conversations to repopulate the default queue during realtime refreshes.
  const leads = await listInboxLeadCandidates({ limit: 200, offset, includeTest: showTestDemoRecords });
  const leadIds = leads.map((lead) => lead.id);
  const [summaryMessagesByLead, assignmentsByLead, allFiles] = await Promise.all([
    listLatestLeadMessagesForInbox(leadIds, 6),
    listInboxAssignments(leadIds),
    listLeadFilesForLeads(leadIds)
  ]);
  const activeLeads = leads
    .filter((lead) => {
      const messages = summaryMessagesByLead.get(lead.id) ?? [];
      const active = hasWhatsAppContactOrMessages(lead, messages) &&
        (lead.leadEligible === false || isActiveProductionLeadForDailyScreens(lead, messages));
      return active && leadMatchesInboxLane(lead, lane);
    })
    .sort((a, b) => compareInboxLatestActivity(
      { id: a.id, lastActivityAt: leadLastActivityAt(a, summaryMessagesByLead.get(a.id) ?? []) },
      { id: b.id, lastActivityAt: leadLastActivityAt(b, summaryMessagesByLead.get(b.id) ?? []) }
    ));

  const pagedActiveLeads = activeLeads.slice(0, limit);
  const latestActivityConversations = pagedActiveLeads
    .map((lead) => buildSummary(
      lead,
      summaryMessagesByLead.get(lead.id) ?? [],
      allFiles.filter((file) => file.leadId === lead.id),
      assignmentsByLead.get(lead.id)
    ))
    .sort(compareInboxLatestActivity);

  const allSummaries = activeLeads.map((lead) => buildSummary(
    lead,
    summaryMessagesByLead.get(lead.id) ?? [],
    allFiles.filter((file) => file.leadId === lead.id),
    assignmentsByLead.get(lead.id)
  ));
  const priorityConversations = allSummaries
    .filter((conversation) => conversation.requiresReply || conversation.needsMarcus || conversation.failedSend)
    .sort((a, b) => b.bossPriorityScore - a.bossPriorityScore || compareInboxLatestActivity(a, b))
    .slice(0, limit);
  const conversations = priorityOnly ? priorityConversations : latestActivityConversations;
  const triagePool = priorityOnly ? priorityConversations : allSummaries;

  return NextResponse.json({
    ok: true,
    lane,
    conversations,
    triage: {
      requiresReplyCount: triagePool.filter((conversation) => conversation.requiresReply).length,
      criticalCount: triagePool.filter((conversation) => conversation.bossTriageCategory === "critical_client_issue").length,
      qualifiedLeadCount: triagePool.filter((conversation) => conversation.bossTriageCategory === "qualified_sales_lead").length,
      nonSalesCount: triagePool.filter((conversation) => ["vendor_or_business", "job_or_subcontractor", "spam_or_irrelevant"].includes(conversation.bossTriageCategory)).length
    },
    hasMore: activeLeads.length > pagedActiveLeads.length || leads.length >= 200,
    nextCursor: activeLeads.length > pagedActiveLeads.length || leads.length >= 200 ? String(offset + leads.length) : null
  });
}
