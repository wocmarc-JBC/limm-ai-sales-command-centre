import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listLeadFiles } from "@/lib/data/lead-files-repository";
import { listLeadMessagesPage } from "@/lib/data/lead-messages-repository";
import { getLeadById } from "@/lib/data/leads-repository";
import { listInboxAssignments } from "@/lib/data/team-inbox-repository";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { inboxLeadFallbackActivityAt } from "@/lib/inbox-conversation-order";
import { buildLeadFacts, leadFactsLocationLabel } from "@/lib/lead-facts";
import { getInboxQueueState, latestMeaningfulWhatsAppMessage } from "@/lib/inbox-queue";
import type { Lead, LeadFile, LeadMessage } from "@/lib/types";
import type { InboxAssignment } from "@/lib/operations/contracts";

function latestWhatsAppMessage(messages: LeadMessage[]) {
  return latestMeaningfulWhatsAppMessage(messages);
}

function buildSummary(lead: Lead, messages: LeadMessage[], files: LeadFile[], assignment?: InboxAssignment) {
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
    sitePhotosReceived,
    assignedProfileId: assignment?.assignedProfileId ?? null,
    assignedName: assignment?.assignedName ?? lead.assignedTo ?? "",
    assignmentLeaseExpiresAt: assignment?.leaseExpiresAt ?? null
  };
}

export async function GET(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ leadId: string }> }
) {
  const params = await paramsPromise;
  const auth = await getCurrentProfile();
  if (!auth.authenticated) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const lead = await getLeadById(params.leadId);
  if (!lead) return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });

  const [messagePage, leadFiles, assignmentsByLead] = await Promise.all([
    listLeadMessagesPage(lead.id, 30),
    listLeadFiles(lead.id),
    listInboxAssignments([lead.id])
  ]);
  const facts = buildLeadFacts(lead, messagePage.messages, leadFiles);
  const summary = {
    ...buildSummary(lead, messagePage.messages, leadFiles, assignmentsByLead.get(lead.id)),
    propertyType: facts.propertyType.value || lead.propertyType,
    scopeSummary: facts.scopeSummary.value || lead.scopeSummary,
    floorPlanReceived: facts.floorPlanReceived.value,
    sitePhotosReceived: facts.sitePhotosReceived.value
  };

  return NextResponse.json({
    ok: true,
    conversation: {
      lead,
      summary,
      messages: messagePage.messages,
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
      hasOlderMessages: messagePage.hasOlder,
      oldestMessageCursor: messagePage.oldestCursor,
      auditTrail: []
    }
  });
}
