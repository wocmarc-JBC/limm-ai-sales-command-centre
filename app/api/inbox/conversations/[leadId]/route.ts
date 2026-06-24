import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listLeadFiles } from "@/lib/data/lead-files-repository";
import { listLeadMessagesPage } from "@/lib/data/lead-messages-repository";
import { getLeadById } from "@/lib/data/leads-repository";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { buildLeadIntakePlan } from "@/lib/lead-intake";
import { getInboxQueueState, latestMeaningfulWhatsAppMessage } from "@/lib/inbox-queue";
import { getNextBestAction } from "@/lib/next-best-action";
import { inferLeadLocation } from "@/lib/singapore-location";
import type { Lead, LeadFile, LeadMessage } from "@/lib/types";

function latestWhatsAppMessage(messages: LeadMessage[]) {
  return latestMeaningfulWhatsAppMessage(messages);
}

function buildSummary(lead: Lead, messages: LeadMessage[], files: LeadFile[]) {
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

export async function GET(
  _request: Request,
  { params }: { params: { leadId: string } }
) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const lead = await getLeadById(params.leadId);
  if (!lead) return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });

  const [messagePage, leadFiles] = await Promise.all([
    listLeadMessagesPage(lead.id, 30),
    listLeadFiles(lead.id)
  ]);
  const summary = buildSummary(lead, messagePage.messages, leadFiles);
  const intakePlan = buildLeadIntakePlan(lead, messagePage.messages);
  const intakeProfile = intakePlan.profile;
  const location = inferLeadLocation(lead);
  const next = getNextBestAction(lead);

  return NextResponse.json({
    ok: true,
    conversation: {
      lead,
      summary,
      messages: messagePage.messages,
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
      hasOlderMessages: messagePage.hasOlder,
      oldestMessageCursor: messagePage.oldestCursor,
      auditTrail: []
    }
  });
}
