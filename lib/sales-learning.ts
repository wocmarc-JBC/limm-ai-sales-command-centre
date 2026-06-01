import { buildMissionQueue, calculateLeadLevel, missionForLead } from "@/lib/sales-control";
import type { FollowUp, Lead } from "@/lib/types";

export const leadOutcomeLabels = [
  "Won",
  "Lost",
  "No reply",
  "Price shopper",
  "Appointment booked",
  "Site visit done",
  "Quote sent",
  "Quote accepted",
  "Quote rejected",
  "Bad fit",
  "Commercial lead",
  "Landed lead",
  "Urgent lead"
] as const;

export const lostReasonLabels = [
  "Too expensive",
  "Client disappeared",
  "Wrong scope",
  "Too small job",
  "Price shopper",
  "Competitor chosen",
  "No floor plan",
  "No appointment",
  "Bad fit"
] as const;

export function buildWeeklyBossReportDraft(leads: Lead[], followUps: FollowUp[] = []) {
  const missions = buildMissionQueue(leads, followUps);
  const goldLeads = leads.filter((lead) => calculateLeadLevel(lead) === "Gold Lead");
  const needsMarcus = missions["Needs Marcus"];
  const appointmentRequests = missions["Appointment Requests"];
  const floorPlans = missions["Floor Plan Received"];
  const priceQuestions = missions["Price/Budget Questions"];
  const pastWorks = missions["Past Works Requested"];
  const lostOrBadFit = leads.filter((lead) => lead.status === "Not Suitable" || calculateLeadLevel(lead) === "Spam/Test");

  return {
    title: "Weekly Boss Report Draft",
    autoSend: false,
    summary: {
      newLeads: leads.length,
      hotLeads: goldLeads.length,
      appointmentsRequested: appointmentRequests.length,
      floorPlansReceived: floorPlans.length,
      priceOnlyLeads: priceQuestions.length,
      pastWorksRequests: pastWorks.length,
      leadsNeedingMarcus: needsMarcus.length,
      lostLeads: lostOrBadFit.length,
      bestEnquiryType: goldLeads[0] ? missionForLead(goldLeads[0]) : "Not enough data",
      mostCommonMissingInfo: mostCommon(leads.flatMap((lead) => lead.missingInfo)) || "Not enough data",
      suggestedImprovement: "Keep asking only for missing information, review high-risk wall/approval questions, and follow up quickly on floor plans and appointment requests."
    }
  };
}

function mostCommon(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}
