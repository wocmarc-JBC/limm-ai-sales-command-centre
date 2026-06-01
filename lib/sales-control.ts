import type { FollowUp, Lead } from "@/lib/types";

export type MissionKey =
  | "Hot Leads"
  | "Needs Marcus"
  | "Appointment Requests"
  | "Floor Plan Received"
  | "Price/Budget Questions"
  | "Hacking / Approval Risk"
  | "Past Works Requested"
  | "Voice Message Received"
  | "Low Confidence / Bot Needs Help"
  | "Follow-Up Due"
  | "Test/Spam Cleanup";

const riskyWords = /hack|hacking|wall|approval|submission|permit|structural|PE|refund|lawyer|complaint/i;
const priceWords = /how much|price|budget|quote|quotation|estimate/i;
const appointmentWords = /appointment|appt|meet|site visit|slot|wed|tomorrow|saturday/i;
const portfolioWords = /past work|portfolio|project photo|before after|instagram|show me your work/i;
const floorPlanWords = /floor ?plan|layout|drawing|plan attached/i;
const photoWords = /photo|image|site photo|picture/i;
const voiceWords = /voice|audio/i;

function textFor(lead: Lead) {
  return `${lead.propertyType} ${lead.serviceType} ${lead.scopeSummary} ${lead.lastClientMessage} ${lead.riskFlags.join(" ")} ${lead.missingInfo.join(" ")}`;
}

export function calculateLeadLevel(lead: Lead): NonNullable<Lead["leadLevel"]> {
  if (lead.isSpam || lead.isTest) return "Spam/Test";
  if (lead.needsMarcus || lead.bossApprovalNeeded || riskyWords.test(textFor(lead))) return "Needs Marcus";
  if (/landed|commercial/i.test(textFor(lead)) && (floorPlanWords.test(textFor(lead)) || appointmentWords.test(textFor(lead)))) return "Gold Lead";
  if (lead.leadScore >= 75 || lead.leadCategory === "Hot") return "Gold Lead";
  if (lead.leadScore >= 45 || lead.leadCategory === "Warm") return "Warm Lead";
  if (priceWords.test(textFor(lead)) && !floorPlanWords.test(textFor(lead))) return "Cold Lead";
  return "Cold Lead";
}

export function buildConversationSummary(lead: Lead) {
  const known: string[] = [];
  if (lead.propertyType && !/unknown/i.test(lead.propertyType)) known.push(`property: ${lead.propertyType}`);
  if (lead.scopeSummary) known.push(`scope: ${lead.scopeSummary}`);
  if (floorPlanWords.test(textFor(lead))) known.push("floor plan/layout mentioned");
  if (photoWords.test(textFor(lead))) known.push("photos/images mentioned");
  if (appointmentWords.test(textFor(lead))) known.push("appointment interest");
  if (priceWords.test(textFor(lead))) known.push("price/budget question");
  const risk = lead.riskFlags.length ? ` Risks: ${lead.riskFlags.join(", ")}.` : "";
  const missing = lead.missingInfo.length ? ` Missing: ${lead.missingInfo.join(", ")}.` : "";
  return `${lead.clientName || "Client"} enquiry. ${known.join("; ") || "Basic renovation details still needed."}.${risk}${missing}`.replace(/\s+/g, " ").trim();
}

export function missionForLead(lead: Lead): MissionKey {
  const text = textFor(lead);
  if (lead.isSpam || lead.isTest || lead.deletedAt || lead.archivedAt) return "Test/Spam Cleanup";
  if (lead.needsMarcus || lead.bossApprovalNeeded) return "Needs Marcus";
  if (appointmentWords.test(text)) return "Appointment Requests";
  if (floorPlanWords.test(text)) return "Floor Plan Received";
  if (priceWords.test(text)) return "Price/Budget Questions";
  if (riskyWords.test(text)) return "Hacking / Approval Risk";
  if (portfolioWords.test(text)) return "Past Works Requested";
  if (voiceWords.test(text)) return "Voice Message Received";
  if (lead.leadCategory === "Hot" || lead.leadScore >= 70) return "Hot Leads";
  return "Follow-Up Due";
}

export function buildMissionQueue(leads: Lead[], followUps: FollowUp[] = []) {
  const missions: Record<MissionKey, Lead[]> = {
    "Hot Leads": [],
    "Needs Marcus": [],
    "Appointment Requests": [],
    "Floor Plan Received": [],
    "Price/Budget Questions": [],
    "Hacking / Approval Risk": [],
    "Past Works Requested": [],
    "Voice Message Received": [],
    "Low Confidence / Bot Needs Help": [],
    "Follow-Up Due": [],
    "Test/Spam Cleanup": []
  };
  for (const lead of leads) {
    missions[missionForLead(lead)].push(lead);
    if (lead.leadScore < 35 && !lead.isSpam && !lead.isTest) missions["Low Confidence / Bot Needs Help"].push(lead);
  }
  const followUpLeadIds = new Set(followUps.filter((item) => item.status === "Due" || item.status === "Overdue").map((item) => item.leadId));
  for (const lead of leads) {
    if (followUpLeadIds.has(lead.id) && !missions["Follow-Up Due"].some((item) => item.id === lead.id)) {
      missions["Follow-Up Due"].push(lead);
    }
  }
  return missions;
}

export function buildFollowUpReminder(lead: Lead) {
  const mission = missionForLead(lead);
  if (mission === "Appointment Requests") return "Appointment requested. Marcus should check availability within 2 hours.";
  if (mission === "Floor Plan Received") return "Floor plan/layout received. Review within 1 working day.";
  if (mission === "Price/Budget Questions") return "Price/budget question. Collect scope before any quotation review.";
  if (mission === "Past Works Requested") return "Past works requested. Share Instagram/reference direction if needed.";
  if (mission === "Voice Message Received") return "Voice/audio received. Client has been asked to type key details.";
  if (mission === "Hacking / Approval Risk") return "Risk question. Marcus should review before any firm advice.";
  return "Follow up based on next best action.";
}

export function readinessStatus(lead: Lead) {
  const missing = new Set(lead.missingInfo);
  if (missing.has("property_type") || missing.has("scope")) return "Needs More Info";
  if (missing.has("floor_plan") || missing.has("site_photos")) return "Ready for Initial Project Review";
  if (appointmentWords.test(textFor(lead))) return "Ready for Site Visit";
  if (lead.quotationReadiness >= 70) return "Ready for Quotation Review";
  return "Not Ready";
}
