import type { FollowUp, Lead, LeadMessage } from "@/lib/types";

export const OPERATOR_RESPONSE_TARGET_MINUTES = 60;

export const INBOX_VIEW_FILTERS = [
  "All",
  "Mine",
  "Unassigned",
  "Unread",
  "Response overdue",
  "Waiting for Marcus",
  "Waiting for client",
  "New leads",
  "Bot active",
  "Human takeover",
  "Failed send"
] as const;

export type InboxViewFilter = (typeof INBOX_VIEW_FILTERS)[number];

export type SavedInboxView = {
  id: string;
  label: string;
  filter: InboxViewFilter;
  search: string;
};

export type OperatorSlaState = {
  status: "inactive" | "on-track" | "due" | "breached";
  label: string;
  detail: string;
  ageMinutes: number;
  targetMinutes: number;
};

export type OperatorPriorityItem = {
  leadId: string;
  clientName: string;
  action: string;
  reason: string;
  score: number;
  urgency: "Critical" | "High" | "Normal";
  href: string;
  ageLabel: string;
};

export type ConversationBrief = {
  clientNeed: string;
  openQuestion: string;
  lastCommitment: string;
  riskSummary: string;
  fileSummary: string;
  nextAction: string;
  nextReason: string;
};

const inboxViewParamMap: Record<string, InboxViewFilter> = {
  mine: "Mine",
  unassigned: "Unassigned",
  unread: "Unread",
  overdue: "Response overdue",
  waiting: "Waiting for Marcus",
  client: "Waiting for client",
  new: "New leads",
  active: "Bot active",
  human: "Human takeover",
  failed: "Failed send"
};

function parsedTime(value: string | Date | number) {
  const parsed = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (safeMinutes < 60) return `${safeMinutes}m`;
  if (safeMinutes >= 1440) {
    const days = Math.floor(safeMinutes / 1440);
    const remainingHours = Math.floor((safeMinutes % 1440) / 60);
    return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function cleanText(value: string | undefined | null, fallback: string, max = 160) {
  const cleaned = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

export function inboxViewFilterFromParam(value?: string | null): InboxViewFilter | undefined {
  if (!value) return undefined;
  return inboxViewParamMap[value.trim().toLowerCase()];
}

export function getOperatorSlaState(
  input: { primaryStatus: string; lastActivityAt: string; failedSend?: boolean },
  now: string | Date | number = Date.now(),
  targetMinutes = OPERATOR_RESPONSE_TARGET_MINUTES
): OperatorSlaState {
  const safeTarget = Math.max(1, Math.round(targetMinutes));
  const actionable = input.failedSend || ["Waiting for Marcus", "New lead", "Failed send"].includes(input.primaryStatus);
  if (!actionable) {
    return {
      status: "inactive",
      label: "No reply due",
      detail: "This conversation is not currently waiting on the operator.",
      ageMinutes: 0,
      targetMinutes: safeTarget
    };
  }

  if (input.failedSend || input.primaryStatus === "Failed send") {
    return {
      status: "breached",
      label: "Send failed",
      detail: "Delivery recovery needs operator attention now.",
      ageMinutes: 0,
      targetMinutes: safeTarget
    };
  }

  const activityAt = parsedTime(input.lastActivityAt);
  const nowAt = parsedTime(now);
  if (!activityAt || !nowAt) {
    return {
      status: "on-track",
      label: "Target active",
      detail: `${safeTarget}-minute operator response target is active.`,
      ageMinutes: 0,
      targetMinutes: safeTarget
    };
  }

  const ageMinutes = Math.max(0, Math.floor((nowAt - activityAt) / 60000));
  const remainingMinutes = safeTarget - ageMinutes;
  if (remainingMinutes <= 0) {
    return {
      status: "breached",
      label: `${compactDuration(Math.abs(remainingMinutes))} over`,
      detail: `Waiting ${compactDuration(ageMinutes)} against the ${safeTarget}-minute operator target.`,
      ageMinutes,
      targetMinutes: safeTarget
    };
  }
  if (remainingMinutes <= Math.min(15, Math.ceil(safeTarget / 4))) {
    return {
      status: "due",
      label: `${compactDuration(remainingMinutes)} left`,
      detail: `Waiting ${compactDuration(ageMinutes)}; response target is approaching.`,
      ageMinutes,
      targetMinutes: safeTarget
    };
  }
  return {
    status: "on-track",
    label: `${compactDuration(remainingMinutes)} left`,
    detail: `Waiting ${compactDuration(ageMinutes)} against the ${safeTarget}-minute operator target.`,
    ageMinutes,
    targetMinutes: safeTarget
  };
}

export function parseSavedInboxViews(raw: string | null | undefined): SavedInboxView[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): SavedInboxView[] => {
      if (!item || typeof item !== "object") return [];
      const filter = typeof item.filter === "string" && INBOX_VIEW_FILTERS.includes(item.filter as InboxViewFilter)
        ? item.filter as InboxViewFilter
        : null;
      const search = typeof item.search === "string" ? item.search.trim().slice(0, 80) : "";
      const label = typeof item.label === "string" ? item.label.trim().slice(0, 40) : "";
      const id = typeof item.id === "string" ? item.id.trim().slice(0, 120) : "";
      return filter && label && id ? [{ id, label, filter, search }] : [];
    }).slice(0, 5);
  } catch {
    return [];
  }
}

export function saveInboxView(current: SavedInboxView[], filter: InboxViewFilter, search: string): SavedInboxView[] {
  const cleanSearch = search.trim().replace(/\s+/g, " ").slice(0, 80);
  if (filter === "All" && !cleanSearch) return current;
  const signature = `${filter.toLowerCase()}::${cleanSearch.toLowerCase()}`;
  const label = cleanSearch
    ? `${filter === "All" ? "Search" : filter} · ${cleanText(cleanSearch, "", 20)}`
    : filter;
  const view: SavedInboxView = { id: signature, label, filter, search: cleanSearch };
  return [view, ...current.filter((item) => item.id !== signature)].slice(0, 5);
}

function activeFollowUpForLead(followUps: FollowUp[], leadId: string, nowAt: number) {
  return followUps.find((followUp) => {
    if (followUp.leadId !== leadId || ["Completed", "Snoozed"].includes(followUp.status)) return false;
    return followUp.status === "Overdue" || (parsedTime(followUp.dueAt) > 0 && parsedTime(followUp.dueAt) <= nowAt);
  });
}

function priorityAction(lead: Lead, hasOverdueFollowUp: boolean) {
  if (lead.bossApprovalNeeded || lead.needsMarcus || lead.status === "Waiting Boss Approval") return "Review with Marcus";
  if (hasOverdueFollowUp || lead.status === "Follow Up Due") return "Follow up now";
  if (lead.botPaused) return "Continue human takeover";
  if (lead.latestUnansweredQuestion?.text) return "Answer the open client question";
  if (lead.leadCategory === "Hot") return "Advance this hot lead";
  return cleanText(lead.salesNextAction || lead.aiRecommendedNextAction, "Review the next sales move", 90);
}

export function buildOperatorPriorityQueue(
  leads: Lead[],
  followUps: FollowUp[],
  now: string | Date | number = Date.now(),
  limit = 6
): OperatorPriorityItem[] {
  const nowAt = parsedTime(now) || Date.now();
  return leads
    .filter((lead) => !lead.deletedAt && !lead.archivedAt && !lead.isSpam && lead.leadEligible !== false)
    .map((lead) => {
      const overdueFollowUp = activeFollowUpForLead(followUps, lead.id, nowAt);
      const riskFlags = lead.riskFlags ?? [];
      const reasons: string[] = [];
      let score = 10;
      if (lead.bossApprovalNeeded || lead.needsMarcus || lead.status === "Waiting Boss Approval") {
        score += 45;
        reasons.push("Marcus decision required");
      }
      if (overdueFollowUp || lead.status === "Follow Up Due") {
        score += 35;
        reasons.push("follow-up is overdue");
      }
      if (lead.latestUnansweredQuestion?.text) {
        score += 25;
        reasons.push("client question remains open");
      }
      if (lead.botPaused) {
        score += 20;
        reasons.push("human takeover is active");
      }
      if (riskFlags.length) {
        score += Math.min(18, 6 + riskFlags.length * 3);
        reasons.push(`${riskFlags.length} risk signal${riskFlags.length === 1 ? "" : "s"}`);
      }
      if (lead.leadCategory === "Hot") {
        score += 15;
        reasons.push("hot lead momentum");
      }
      if (!reasons.length) reasons.push("next sales move needs review");

      const lastActivityAt = parsedTime(lead.updatedAt || lead.createdAt);
      const ageMinutes = lastActivityAt ? Math.max(0, Math.floor((nowAt - lastActivityAt) / 60000)) : 0;
      return {
        leadId: lead.id,
        clientName: cleanText(lead.clientName || lead.phone, "Unnamed client", 60),
        action: priorityAction(lead, Boolean(overdueFollowUp)),
        reason: reasons.join(" · "),
        score,
        urgency: score >= 75 ? "Critical" as const : score >= 45 ? "High" as const : "Normal" as const,
        href: `/inbox?lead=${encodeURIComponent(lead.id)}`,
        ageLabel: lastActivityAt ? `${compactDuration(ageMinutes)} since CRM activity` : "Activity time unavailable"
      };
    })
    .sort((a, b) => b.score - a.score || a.clientName.localeCompare(b.clientName))
    .slice(0, Math.max(1, limit));
}

function latestCommitment(messages: LeadMessage[]) {
  const commitmentPattern = /\b(?:get back to you|update you|check with the team|review (?:this|it) with the team|confirm and update|follow up with you)\b/i;
  const message = [...messages]
    .filter((item) => item.direction === "outbound" && commitmentPattern.test(item.body))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return message ? cleanText(message.body, "", 140) : "No explicit follow-up commitment detected.";
}

export function buildConversationBrief(input: {
  lead: Lead;
  context: {
    propertyType: string;
    scopeSummary: string;
    addressOrArea: string;
    floorPlanStatus: string;
    sitePhotosStatus: string;
    conflictFields: string[];
    nextAction: string;
    nextReason: string;
  };
  messages: LeadMessage[];
}): ConversationBrief {
  const needParts = [input.context.propertyType, input.context.scopeSummary, input.context.addressOrArea]
    .map((item) => item.trim())
    .filter((item, index, all) => item && !/not provided|pending/i.test(item) && all.indexOf(item) === index);
  const riskSignals = [...new Set([...(input.lead.riskFlags ?? []), ...input.context.conflictFields])];
  return {
    clientNeed: cleanText(needParts.join(" · "), "Project scope is still being clarified."),
    openQuestion: cleanText(input.lead.latestUnansweredQuestion?.text, "No open client question recorded."),
    lastCommitment: latestCommitment(input.messages),
    riskSummary: riskSignals.length ? riskSignals.slice(0, 3).join(" · ") : "No active risk or fact conflict recorded.",
    fileSummary: `Floor plan: ${input.context.floorPlanStatus}. Photos: ${input.context.sitePhotosStatus}.`,
    nextAction: cleanText(input.context.nextAction, "Review the conversation before acting."),
    nextReason: cleanText(input.context.nextReason, "Use the verified lead facts and latest client message.")
  };
}
