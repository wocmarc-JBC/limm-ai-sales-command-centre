import type { Lead, LeadMessage } from "@/lib/types";

export type RevenuePriority = {
  leadId: string;
  clientName: string;
  source: string;
  stage: string;
  score: number;
  weightedValue: number;
  nextAction: string;
  reason: string;
};

export type ResponseImpactBucket = {
  label: string;
  conversations: number;
  advanced: number;
  advanceRatePercent: number;
};

export type SourcePerformance = {
  source: string;
  leads: number;
  responded: number;
  advanced: number;
  won: number;
  weightedValue: number;
};

function validTime(value?: string | null) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
}

function isWon(lead: Lead) {
  return lead.salesStage === "Won" || Boolean(lead.wonDate) || Number(lead.confirmedValue || 0) > 0;
}

function isQuoted(lead: Lead) {
  return Boolean(lead.quoteSentDate)
    || Number(lead.quotedAmount || 0) > 0
    || ["Quotation Sent", "Negotiation", "Won"].includes(lead.salesStage || "")
    || ["Sent", "Client Reviewing", "Accepted"].includes(lead.quotationStatus || "");
}

function hasAppointment(lead: Lead) {
  return ["Ready To Book", "Appointment Pending"].includes(lead.status)
    || ["Site Visit Booked", "Quotation Needed", "Quotation Sent", "Negotiation", "Won"].includes(lead.salesStage || "");
}

function advanced(lead: Lead) {
  return hasAppointment(lead) || isQuoted(lead) || isWon(lead);
}

function messagesByLead(messages: LeadMessage[]) {
  const grouped = new Map<string, LeadMessage[]>();
  for (const message of messages) grouped.set(message.leadId, [...(grouped.get(message.leadId) ?? []), message]);
  return grouped;
}

function firstResponseMinutes(messages: LeadMessage[]) {
  const firstInbound = messages.find((message) => message.direction === "inbound");
  if (!firstInbound) return null;
  const inboundAt = validTime(firstInbound.createdAt);
  const firstOutbound = messages.find((message) => message.direction === "outbound" && validTime(message.createdAt) >= inboundAt && message.whatsappStatus !== "failed");
  if (!firstOutbound) return null;
  return Math.max(0, (validTime(firstOutbound.createdAt) - inboundAt) / 60000);
}

function responseBucket(minutes: number | null) {
  if (minutes === null) return "No response recorded";
  if (minutes < 5) return "Under 5 min";
  if (minutes < 30) return "5–30 min";
  if (minutes < 60) return "30–60 min";
  return "Over 60 min";
}

function weightedValue(lead: Lead) {
  const potential = Number(lead.potentialValue || lead.quotedAmount || lead.confirmedValue || 0);
  const probability = isWon(lead) ? 100 : Math.max(0, Math.min(100, Number(lead.probabilityPercent || 0)));
  return potential * probability / 100;
}

function priorityScore(lead: Lead, responseMinutes: number | null, now: number) {
  let score = Math.max(0, Math.min(30, Number(lead.probabilityPercent || 0) * 0.3));
  score += Math.max(0, Math.min(25, Number(lead.leadScore || 0) * 0.25));
  if (lead.leadCategory === "Hot") score += 15;
  if (hasAppointment(lead)) score += 8;
  if (isQuoted(lead)) score += 12;
  if (lead.needsMarcus || lead.bossApprovalNeeded) score += 8;
  if (responseMinutes !== null && responseMinutes < 30) score += 5;
  const ageDays = Math.max(0, (now - validTime(lead.updatedAt || lead.createdAt)) / 86400000);
  score += Math.max(0, 10 - ageDays);
  return Math.round(Math.min(100, score));
}

export function buildRevenueIntelligence(leads: Lead[], messages: LeadMessage[], now = Date.now()) {
  const activeSales = leads.filter((lead) => !lead.deletedAt && !lead.archivedAt && !lead.isSpam && !lead.isTest && lead.leadEligible !== false);
  const grouped = messagesByLead(messages);
  const records = activeSales.map((lead) => {
    const leadMessages = grouped.get(lead.id) ?? [];
    const responseMinutes = firstResponseMinutes(leadMessages);
    const responded = responseMinutes !== null;
    return { lead, responseMinutes, responded, advanced: advanced(lead), won: isWon(lead), quoted: isQuoted(lead), appointment: hasAppointment(lead), weightedValue: weightedValue(lead) };
  });

  const responseBucketOrder = ["Under 5 min", "5–30 min", "30–60 min", "Over 60 min", "No response recorded"];
  const responseImpact: ResponseImpactBucket[] = responseBucketOrder.map((label) => {
    const bucket = records.filter((record) => responseBucket(record.responseMinutes) === label);
    const progressed = bucket.filter((record) => record.advanced).length;
    return {
      label,
      conversations: bucket.length,
      advanced: progressed,
      advanceRatePercent: bucket.length ? Math.round(progressed / bucket.length * 100) : 0
    };
  });

  const sourceMap = new Map<string, SourcePerformance>();
  for (const record of records) {
    const source = record.lead.leadSource || record.lead.source || "Unknown";
    const current = sourceMap.get(source) ?? { source, leads: 0, responded: 0, advanced: 0, won: 0, weightedValue: 0 };
    current.leads += 1;
    current.responded += record.responded ? 1 : 0;
    current.advanced += record.advanced ? 1 : 0;
    current.won += record.won ? 1 : 0;
    current.weightedValue += record.weightedValue;
    sourceMap.set(source, current);
  }

  const priorities: RevenuePriority[] = records
    .filter((record) => !record.won && record.lead.status !== "Not Suitable" && record.lead.salesStage !== "Lost")
    .map((record) => {
      const score = priorityScore(record.lead, record.responseMinutes, now);
      const reasons = [
        record.lead.leadCategory === "Hot" ? "hot lead" : "",
        record.quoted ? "quotation momentum" : "",
        record.appointment ? "appointment momentum" : "",
        record.lead.needsMarcus || record.lead.bossApprovalNeeded ? "decision needed" : "",
        record.responseMinutes === null ? "response not recorded" : record.responseMinutes < 30 ? "fast response momentum" : "response recovery opportunity"
      ].filter(Boolean);
      return {
        leadId: record.lead.id,
        clientName: record.lead.clientName || record.lead.phone || "Unnamed lead",
        source: record.lead.leadSource || record.lead.source || "Unknown",
        stage: record.lead.salesStage || record.lead.status,
        score,
        weightedValue: record.weightedValue,
        nextAction: record.lead.salesNextAction || record.lead.aiRecommendedNextAction || "Review next sales move",
        reason: reasons.join(" · ")
      };
    })
    .sort((a, b) => b.score - a.score || b.weightedValue - a.weightedValue)
    .slice(0, 12);

  return {
    generatedAt: new Date(now).toISOString(),
    funnel: {
      leads: records.length,
      responded: records.filter((record) => record.responded).length,
      appointments: records.filter((record) => record.appointment).length,
      quoted: records.filter((record) => record.quoted).length,
      won: records.filter((record) => record.won).length
    },
    potentialValue: records.reduce((sum, record) => sum + Number(record.lead.potentialValue || record.lead.quotedAmount || 0), 0),
    weightedForecast: records.reduce((sum, record) => sum + record.weightedValue, 0),
    confirmedRevenue: records.reduce((sum, record) => sum + Number(record.lead.confirmedValue || 0), 0),
    medianFirstResponseMinutes: (() => {
      const values = records.flatMap((record) => record.responseMinutes === null ? [] : [record.responseMinutes]).sort((a, b) => a - b);
      return values.length ? Math.round(values[Math.floor(values.length / 2)]) : null;
    })(),
    responseImpact,
    sources: [...sourceMap.values()].sort((a, b) => b.weightedValue - a.weightedValue || b.leads - a.leads),
    priorities
  };
}

export function formatRevenue(value: number) {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(value || 0);
}
