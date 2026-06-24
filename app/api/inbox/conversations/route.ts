import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listAllLeadFiles } from "@/lib/data/lead-files-repository";
import { listLatestLeadMessagesForInbox } from "@/lib/data/lead-messages-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { formatLeadDisplayName } from "@/lib/lead-display";
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

function buildSummary(lead: Lead, messages: LeadMessage[], files: LeadFile[]) {
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

export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [leads, allFiles] = await Promise.all([
    listLeads(),
    listAllLeadFiles()
  ]);
  const activeLeads = leads.slice(0, 30);
  const leadIds = activeLeads.map((lead) => lead.id);
  const summaryMessagesByLead = await listLatestLeadMessagesForInbox(leadIds, 3);
  const conversations = activeLeads
    .map((lead) => buildSummary(
      lead,
      summaryMessagesByLead.get(lead.id) ?? [],
      allFiles.filter((file) => file.leadId === lead.id)
    ))
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

  return NextResponse.json({
    ok: true,
    conversations
  });
}
