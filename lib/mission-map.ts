import { formatLeadDisplayName } from "@/lib/lead-display";
import { inferLeadLocation, inferProjectLocation } from "@/lib/singapore-location";
import { amountCollected, overdueAmountForProject, outstandingForProject, salesStageForLead } from "@/lib/sales-collection";
import { scoreTestLead } from "@/lib/test-lead-cleanup";
import type { FollowUp, Lead, LocationConfidence, PaymentRecord, ProjectAccount } from "@/lib/types";

export type MissionMapFilter = "all" | "leads" | "hot" | "won" | "site_visits" | "followups" | "collections" | "overdue";
export type MissionMapPinType = "lead" | "won_project" | "site_visit" | "follow_up" | "collection" | "overdue" | "risk";
export type MissionMapColorCategory = "hot" | "active" | "follow_up" | "risk" | "won" | "paid" | "unknown";

export type MissionMapPin = {
  id: string;
  type: MissionMapPinType;
  label: string;
  description: string;
  area: string;
  region: string;
  lat: number;
  lng: number;
  colorCategory: MissionMapColorCategory;
  href: string;
  confidence: LocationConfidence;
};

export type MissionMapAreaSummary = {
  area: string;
  region: string;
  leadCount: number;
  hotLeadCount: number;
  wonJobCount: number;
  followUpDueCount: number;
  appointmentCount: number;
  collectionDueCount: number;
  overdueCount: number;
  riskCount: number;
  lat: number;
  lng: number;
  intensity: number;
};

export type MissionMapData = {
  areaSummaries: MissionMapAreaSummary[];
  pins: MissionMapPin[];
  unknownLocationCount: number;
  filters: Array<{ key: MissionMapFilter; label: string; count: number; href: string; disabled?: boolean }>;
  salesCollectionMapLayerAvailable: boolean;
};

function isActiveRealLead(lead: Lead) {
  if (lead.deletedAt || lead.archivedAt || lead.isSpam || lead.isTest) return false;
  if (scoreTestLead(lead).clearlyTest) return false;
  return true;
}

function addArea(areas: Map<string, MissionMapAreaSummary>, pin: MissionMapPin, update: Partial<MissionMapAreaSummary>) {
  const existing = areas.get(pin.area) ?? {
    area: pin.area,
    region: pin.region,
    leadCount: 0,
    hotLeadCount: 0,
    wonJobCount: 0,
    followUpDueCount: 0,
    appointmentCount: 0,
    collectionDueCount: 0,
    overdueCount: 0,
    riskCount: 0,
    lat: pin.lat,
    lng: pin.lng,
    intensity: 0
  };
  areas.set(pin.area, {
    ...existing,
    ...Object.fromEntries(
      Object.entries(update).map(([key, value]) => [key, (existing as any)[key] + Number(value ?? 0)])
    )
  });
}

function pinMatchesFilter(pin: MissionMapPin, filter: MissionMapFilter) {
  if (filter === "all") return true;
  if (filter === "leads") return pin.type === "lead" || pin.type === "risk";
  if (filter === "hot") return pin.colorCategory === "hot";
  if (filter === "won") return pin.type === "won_project";
  if (filter === "site_visits") return pin.type === "site_visit";
  if (filter === "followups") return pin.type === "follow_up";
  if (filter === "collections") return pin.type === "collection";
  if (filter === "overdue") return pin.type === "overdue" || pin.type === "risk";
  return true;
}

function leadPinType(lead: Lead): MissionMapPinType {
  if (lead.riskFlags.length || /hack|approval|submission|permit|wall|refund|lawyer|complaint/i.test(lead.lastClientMessage)) return "risk";
  if (lead.status === "Ready To Book" || lead.status === "Appointment Pending") return "site_visit";
  return "lead";
}

function leadColor(lead: Lead): MissionMapColorCategory {
  if (leadPinType(lead) === "risk") return "risk";
  if (lead.leadCategory === "Hot" || lead.leadScore >= 70) return "hot";
  return "active";
}

export function buildSingaporeMissionMapData({
  leads,
  followUps = [],
  projects = [],
  payments = [],
  activeFilter = "all"
}: {
  leads: Lead[];
  followUps?: FollowUp[];
  projects?: ProjectAccount[];
  payments?: PaymentRecord[];
  activeFilter?: MissionMapFilter;
}): MissionMapData {
  const activeLeads = leads.filter(isActiveRealLead);
  const leadById = new Map(activeLeads.map((lead) => [lead.id, lead]));
  const areas = new Map<string, MissionMapAreaSummary>();
  const allPins: MissionMapPin[] = [];
  let unknownLocationCount = 0;

  for (const lead of activeLeads) {
    const location = inferLeadLocation(lead);
    if (!location.lat || !location.lng || location.area === "Unknown area") {
      unknownLocationCount += 1;
      continue;
    }
    const type = leadPinType(lead);
    const pin: MissionMapPin = {
      id: `lead-${lead.id}`,
      type,
      label: formatLeadDisplayName(lead),
      description: lead.scopeSummary || lead.lastClientMessage || "Active lead",
      area: location.area,
      region: location.region,
      lat: location.lat,
      lng: location.lng,
      colorCategory: leadColor(lead),
      href: `/leads/${lead.id}`,
      confidence: location.confidence
    };
    allPins.push(pin);
    addArea(areas, pin, {
      leadCount: 1,
      hotLeadCount: pin.colorCategory === "hot" ? 1 : 0,
      appointmentCount: pin.type === "site_visit" ? 1 : 0,
      riskCount: pin.type === "risk" ? 1 : 0
    });
  }

  for (const followUp of followUps.filter((item) => item.status === "Due" || item.status === "Overdue")) {
    const lead = leadById.get(followUp.leadId) || followUp.lead || null;
    if (!lead || !isActiveRealLead(lead)) continue;
    const location = inferLeadLocation(lead);
    if (!location.lat || !location.lng || location.area === "Unknown area") continue;
    const pin: MissionMapPin = {
      id: `followup-${followUp.id}`,
      type: "follow_up",
      label: formatLeadDisplayName(lead),
      description: followUp.followupType || "Follow-up due",
      area: location.area,
      region: location.region,
      lat: location.lat,
      lng: location.lng,
      colorCategory: "follow_up",
      href: "/followups",
      confidence: location.confidence
    };
    allPins.push(pin);
    addArea(areas, pin, { followUpDueCount: 1 });
  }

  for (const project of projects) {
    const fallbackLead = leadById.get(project.sourceLeadId) || leadById.get(project.leadId);
    const location = inferProjectLocation(project, fallbackLead);
    if (!location.lat || !location.lng || location.area === "Unknown area") {
      unknownLocationCount += 1;
      continue;
    }
    const projectPayments = payments.filter((payment) => payment.projectId === project.id && !payment.voidedAt);
    const overdueAmount = overdueAmountForProject(project, projectPayments);
    const outstanding = outstandingForProject(project, projectPayments);
    const collected = amountCollected(projectPayments);
    const type: MissionMapPinType = overdueAmount > 0 ? "overdue" : outstanding > 0 ? "collection" : "won_project";
    const pin: MissionMapPin = {
      id: `project-${project.id}`,
      type,
      label: fallbackLead ? formatLeadDisplayName(fallbackLead) : project.clientName || "Won project",
      description: project.scopeSummary || "Won project",
      area: location.area,
      region: location.region,
      lat: location.lat,
      lng: location.lng,
      colorCategory: overdueAmount > 0 ? "risk" : outstanding > 0 ? "follow_up" : collected > 0 ? "paid" : "won",
      href: fallbackLead ? `/leads/${fallbackLead.id}` : "/sales-collection",
      confidence: location.confidence
    };
    allPins.push(pin);
    addArea(areas, pin, {
      wonJobCount: fallbackLead ? (salesStageForLead(fallbackLead) === "Won" ? 1 : 0) : 1,
      collectionDueCount: outstanding > 0 ? 1 : 0,
      overdueCount: overdueAmount > 0 ? 1 : 0,
      riskCount: overdueAmount > 0 ? 1 : 0
    });
  }

  const areaSummaries = [...areas.values()]
    .map((area) => {
      const urgency = area.hotLeadCount * 1.2 + area.wonJobCount + area.followUpDueCount + area.appointmentCount + area.collectionDueCount + area.overdueCount * 2 + area.riskCount * 2;
      return { ...area, intensity: Math.min(1, urgency / 8) };
    })
    .sort((a, b) => b.intensity - a.intensity || b.leadCount - a.leadCount)
    .slice(0, 12);

  const count = (filter: MissionMapFilter) => allPins.filter((pin) => pinMatchesFilter(pin, filter)).length;
  const filters: MissionMapData["filters"] = [
    { key: "all", label: "All", count: allPins.length, href: "/?map=all" },
    { key: "leads", label: "Leads", count: count("leads"), href: "/?map=leads" },
    { key: "hot", label: "Hot Leads", count: count("hot"), href: "/?map=hot" },
    { key: "won", label: "Won Jobs", count: count("won"), href: "/?map=won" },
    { key: "site_visits", label: "Site Visits", count: count("site_visits"), href: "/?map=site_visits" },
    { key: "followups", label: "Follow-Ups", count: count("followups"), href: "/?map=followups" },
    { key: "collections", label: "Collections", count: count("collections"), href: "/?map=collections", disabled: projects.length === 0 },
    { key: "overdue", label: "Overdue / Risk", count: count("overdue"), href: "/?map=overdue" }
  ];

  return {
    areaSummaries,
    pins: allPins.filter((pin) => pinMatchesFilter(pin, activeFilter)).slice(0, 50),
    unknownLocationCount,
    filters,
    salesCollectionMapLayerAvailable: projects.length > 0 || payments.length > 0
  };
}

export function missionMapColorClass(category: MissionMapColorCategory) {
  return {
    hot: "bg-command-gold text-black border-command-gold",
    active: "bg-command-cyan text-black border-command-cyan",
    follow_up: "bg-command-amber text-black border-command-amber",
    risk: "bg-command-red text-white border-command-red",
    won: "bg-command-gold text-black border-command-gold",
    paid: "bg-command-green text-black border-command-green",
    unknown: "bg-command-subtle text-command-text border-command-line"
  }[category];
}
