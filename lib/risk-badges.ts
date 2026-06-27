import type { Lead } from "@/lib/types";

export type RiskBadgeKey =
  | "landed"
  | "a_and_a"
  | "structural"
  | "wall_hacking"
  | "waterproofing"
  | "roof_drainage"
  | "condo_mcst"
  | "tight_timeline"
  | "price_sensitive"
  | "scope_unclear"
  | "high_value_job"
  | "low_margin_risk";

export type RiskBadge = {
  key: RiskBadgeKey;
  label: string;
  severity: "watch" | "high" | "critical";
};

export const HIGH_VALUE_JOB_THRESHOLD = 50000;

const catalog: Record<RiskBadgeKey, RiskBadge> = {
  landed: { key: "landed", label: "Landed", severity: "high" },
  a_and_a: { key: "a_and_a", label: "A&A", severity: "critical" },
  structural: { key: "structural", label: "Structural", severity: "critical" },
  wall_hacking: { key: "wall_hacking", label: "Wall hacking", severity: "critical" },
  waterproofing: { key: "waterproofing", label: "Waterproofing", severity: "high" },
  roof_drainage: { key: "roof_drainage", label: "Roof/drainage", severity: "high" },
  condo_mcst: { key: "condo_mcst", label: "Condo MCST", severity: "high" },
  tight_timeline: { key: "tight_timeline", label: "Tight timeline", severity: "high" },
  price_sensitive: { key: "price_sensitive", label: "Client price-sensitive", severity: "watch" },
  scope_unclear: { key: "scope_unclear", label: "Scope unclear", severity: "watch" },
  high_value_job: { key: "high_value_job", label: "High-value job", severity: "critical" },
  low_margin_risk: { key: "low_margin_risk", label: "Low-margin risk", severity: "high" }
};

function leadText(lead: Lead) {
  return [
    lead.propertyType,
    lead.serviceType,
    lead.scopeSummary,
    lead.lastClientMessage,
    lead.stageNotes,
    lead.quoteNotes,
    lead.riskFlags.join(" "),
    lead.missingInfo.join(" ")
  ].filter(Boolean).join(" ").toLowerCase();
}

function addBadge(badges: Map<RiskBadgeKey, RiskBadge>, key: RiskBadgeKey) {
  badges.set(key, catalog[key]);
}

export function getLeadRiskBadges(lead: Lead) {
  const text = leadText(lead);
  const badges = new Map<RiskBadgeKey, RiskBadge>();
  const jobValue = Math.max(lead.potentialValue ?? 0, lead.quotedAmount ?? 0, lead.confirmedValue ?? 0);

  if (/landed|terrace|semi[-\s]?d|bungalow/.test(text)) addBadge(badges, "landed");
  if (/a&a|addition|alteration|extension|rebuild|landed_a_and_a/.test(text)) addBadge(badges, "a_and_a");
  if (/structural|beam|column|load[-\s]?bearing|pe\b|qps|submission/.test(text)) addBadge(badges, "structural");
  if (/hack|hacking|wall|demolish|dismantle|partition/.test(text)) addBadge(badges, "wall_hacking");
  if (/waterproof|toilet leak|bathroom leak|seepage/.test(text)) addBadge(badges, "waterproofing");
  if (/roof|drainage|gutter|downpipe|rainwater/.test(text)) addBadge(badges, "roof_drainage");
  if (/condo|mcst|management|building rules|renovation permit/.test(text)) addBadge(badges, "condo_mcst");
  if (/urgent|rush|asap|tight|move in|handover|start tomorrow|next week|before cny|christmas/.test(text)) addBadge(badges, "tight_timeline");
  if (/price_sensitive|cheap|cheaper|budget tight|too expensive|discount|best price|how much/.test(text)) addBadge(badges, "price_sensitive");
  if (lead.missingInfo.length > 2 || lead.quotationReadiness < 55 || /unclear|not sure|maybe|roughly/.test(text)) addBadge(badges, "scope_unclear");
  if (jobValue >= HIGH_VALUE_JOB_THRESHOLD) addBadge(badges, "high_value_job");
  if (/low margin|thin margin|discount|price_sensitive|cheap|cheaper|too expensive/.test(text)) addBadge(badges, "low_margin_risk");

  return [...badges.values()];
}

export function riskBadgeClass(badge: RiskBadge) {
  if (badge.severity === "critical") return "border-command-red/60 bg-command-red/10 text-command-red";
  if (badge.severity === "high") return "border-command-gold/60 bg-command-gold/10 text-command-yellow";
  return "border-command-line bg-command-bg/55 text-command-muted";
}
