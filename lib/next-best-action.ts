import { humanizeList } from "./labels";
import type { Lead } from "./types";

export type NextBestAction = {
  action: string;
  reason: string;
  urgency: "High" | "Medium" | "Low";
  blockers: string[];
};

export function getNextBestAction(lead: Lead): NextBestAction {
  const missing = lead.missingInfo ?? [];

  if (lead.bossApprovalNeeded || lead.status === "Waiting Boss Approval") {
    return {
      action: "Needs Marcus approval",
      reason: "Risk flags or value-sensitive scope need boss review before the next client-facing step.",
      urgency: "High",
      blockers: lead.riskFlags.length ? lead.riskFlags : missing
    };
  }

  if (lead.status === "Follow Up Due") {
    return {
      action: "Follow up today",
      reason: "The lead is due for a reply-only follow-up.",
      urgency: "High",
      blockers: missing
    };
  }

  if (lead.status === "Awaiting Client" && lead.lastReplyAt) {
    return {
      action: "Mark no reply",
      reason: "The lead is waiting on client details after the last reply.",
      urgency: "Medium",
      blockers: missing
    };
  }

  if (missing.includes("floor_plan") || missing.includes("site_photos")) {
    return {
      action: "Ask for floor plan/photos",
      reason: "The project cannot be reviewed properly without visual/site information.",
      urgency: lead.leadCategory === "Hot" ? "High" : "Medium",
      blockers: missing.filter((item) => item === "floor_plan" || item === "site_photos")
    };
  }

  if (lead.appointmentSuitable && lead.appointmentReadiness >= 75) {
    return {
      action: "Offer initial project review",
      reason: "The lead has enough context to propose a review slot under the appointment rules.",
      urgency: lead.leadCategory === "Hot" ? "High" : "Medium",
      blockers: missing
    };
  }

  if (lead.status === "Quotation Readiness" || lead.quotationReadiness >= 60) {
    return {
      action: "Move to quotation review",
      reason: "The lead has enough captured information to prepare a boss review pack without amounts.",
      urgency: "Medium",
      blockers: missing
    };
  }

  if (lead.leadCategory === "Low Fit" || lead.status === "Not Suitable") {
    return {
      action: "Mark not suitable",
      reason: "The lead does not currently fit the project profile or is already marked unsuitable.",
      urgency: "Low",
      blockers: missing
    };
  }

  return {
    action: "Prepare site visit checklist",
    reason: "The lead needs a clearer site review path before booking or quotation review.",
    urgency: lead.leadCategory === "Hot" ? "High" : "Medium",
    blockers: missing
  };
}

export function nextBestActionSummary(lead: Lead) {
  const next = getNextBestAction(lead);
  const blockers = humanizeList(next.blockers);
  return `${next.action}. ${next.reason} Blockers: ${blockers}.`;
}
