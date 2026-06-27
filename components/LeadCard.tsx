import Link from "next/link";
import { evaluateBookingReadiness } from "@/lib/calendar-booking";
import type { Lead, LeadMessage } from "@/lib/types";
import { parseSafeDate, SINGAPORE_TIME_ZONE } from "@/lib/date-safety";
import { humanizeLabel } from "@/lib/labels";
import { formatFullPhoneForProtectedApp, formatLeadDisplayName } from "@/lib/lead-display";
import { buildLeadFacts } from "@/lib/lead-facts";
import { getLeadRiskBadges, riskBadgeClass } from "@/lib/risk-badges";
import { calculateLeadLevel } from "@/lib/sales-control";
import { matchQuestionBankIntent } from "@/lib/whatsapp-question-bank";
import { StatusBadge } from "./StatusBadge";

function snippet(text: string) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "No recent message preview.";
  return clean.length > 150 ? `${clean.slice(0, 147)}...` : clean;
}

function compactTimestamp(value: string) {
  const date = parseSafeDate(value);
  if (!date) return "";
  return date.toLocaleString("en-SG", {
    timeZone: SINGAPORE_TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function senderLabel(message: LeadMessage) {
  if (message.direction === "inbound") return "Client";
  if (message.metadata?.manualReply === true || message.metadata?.manualTakeover === true) return "Marcus";
  return "AI";
}

function latestWhatsAppPreview(message?: LeadMessage | null) {
  if (!message?.body?.trim()) return "No WhatsApp message yet";
  const time = compactTimestamp(message.createdAt);
  return `${senderLabel(message)}: ${snippet(message.body)}${time ? ` · ${time}` : ""}`;
}

function chips(items: string[], fallback: string) {
  const visible = items.slice(0, 3);
  if (!visible.length) return <span className="text-command-muted">{fallback}</span>;
  return visible.map((item) => (
    <span key={item} className="rounded-full border border-command-line bg-command-bg/55 px-2.5 py-1 text-xs font-semibold text-command-muted">
      {humanizeLabel(item)}
    </span>
  ));
}

function leadHeatTone(lead: Lead) {
  const score = Number.isFinite(lead.leadScore) ? lead.leadScore : null;
  const risk = lead.riskFlags.length > 0 || lead.leadLevel === "Risk Lead";
  if (risk) return { label: "Risk", color: "bg-command-red", text: "text-command-red" };
  if (score !== null && score >= 70) return { label: "Hot", color: "bg-command-gold", text: "text-command-yellow" };
  if (score !== null && score >= 40) return { label: "Warm", color: "bg-command-amber", text: "text-command-amber" };
  return { label: "Cold", color: "bg-command-subtle", text: "text-command-muted" };
}

function compactPriorityBadges(lead: Lead, stage: string, leadLevel: string, isWhatsapp: boolean, questionCategory?: string) {
  const badges = [
    lead.needsMarcus || lead.bossApprovalNeeded ? "Needs Marcus" : "",
    lead.bossApprovalNeeded ? "Boss Review Required" : "",
    lead.botPaused ? "Bot Paused" : "",
    leadLevel,
    stage,
    isWhatsapp ? "WhatsApp" : "",
    lead.missingInfo.some((item) => /floor_plan|site_photos/i.test(item)) ? "Needs Floor Plan / Photos" : "",
    questionCategory ?? "",
    lead.isTest ? "Test Lead" : "",
    lead.deletedAt ? "Soft Deleted" : ""
  ].filter(Boolean);
  return {
    visibleBadges: badges.slice(0, 3),
    hiddenBadgeCount: Math.max(0, badges.length - 3)
  };
}

function LeadHeatMeter({ lead }: { lead: Lead }) {
  if (!Number.isFinite(lead.leadScore)) return null;
  const score = Math.max(0, Math.min(100, lead.leadScore));
  const filled = Math.max(1, Math.ceil(score / 10));
  const tone = leadHeatTone(lead);
  return (
    <div className="mt-4 rounded-2xl border border-command-line bg-command-bg/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-command-muted">Lead Heat</p>
        <p className={`text-sm font-semibold ${tone.text}`}>{tone.label} {score}%</p>
      </div>
      <div className="mt-3 grid grid-cols-10 gap-1" aria-label={`Lead Heat ${score}%`}>
        {Array.from({ length: 10 }, (_, index) => (
          <span
            key={index}
            className={`h-2.5 rounded-full ${index < filled ? tone.color : "bg-command-line/45"}`}
          />
        ))}
      </div>
    </div>
  );
}

export function LeadCard({ lead, latestWhatsAppMessage }: { lead: Lead; latestWhatsAppMessage?: LeadMessage | null }) {
  const facts = buildLeadFacts(lead, latestWhatsAppMessage ? [latestWhatsAppMessage] : []);
  const booking = evaluateBookingReadiness({ lead, latestText: lead.lastClientMessage });
  const isWhatsapp = /whatsapp/i.test(lead.source);
  const questionMatch = isWhatsapp ? matchQuestionBankIntent(lead.lastClientMessage) : null;
  const leadLevel = lead.leadLevel ?? calculateLeadLevel(lead);
  const displayName = formatLeadDisplayName(lead);
  const fullPhone = formatFullPhoneForProtectedApp(lead.phone) || "Phone pending";
  const scope = facts.scopeSummary.value || lead.serviceType || "Renovation scope pending";
  const stage = booking.appointmentIntent ? "Appointment Requested" : lead.status;
  const whatsAppPreview = latestWhatsAppPreview(latestWhatsAppMessage);
  const questionCategory = questionMatch && questionMatch.score > 0 && questionMatch.entry.intent_key !== "unsupported"
    ? questionMatch.entry.category
    : undefined;
  const { visibleBadges, hiddenBadgeCount } = compactPriorityBadges(lead, stage, leadLevel, isWhatsapp, questionCategory);
  const riskBadges = getLeadRiskBadges(lead);
  const topSignals = [...visibleBadges, ...riskBadges.map((badge) => badge.label)].slice(0, 3);
  const hiddenSignalCount = Math.max(0, visibleBadges.length + hiddenBadgeCount + riskBadges.length - topSignals.length);

  return (
    <article className="mission-panel command-hover-lift rounded-2xl p-5 transition hover:border-command-cyan/70 hover:shadow-glow">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {topSignals.map((badge) => <StatusBadge key={badge} label={badge} />)}
            {hiddenSignalCount > 0 ? (
              <span className="rounded-full border border-command-line bg-command-bg/55 px-2.5 py-1 text-xs font-semibold text-command-subtle">
                +{hiddenSignalCount} more signals
              </span>
            ) : null}
          </div>
          <Link href={`/leads/${lead.id}`} className="mt-3 block text-2xl font-semibold leading-8 text-command-text hover:text-command-gold">
            {displayName}
          </Link>
          <p className="mt-1 text-base font-semibold text-command-cyan">{fullPhone}</p>
          <p className="mt-2 text-lg font-semibold text-command-text">{scope}</p>
          {displayName !== lead.clientName ? (
            <p className="mt-1 text-sm text-command-subtle">Generated CRM title cleaned for display.</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/inbox?lead=${encodeURIComponent(lead.id)}`} className="command-press inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black transition hover:bg-command-goldHover">
            Open WhatsApp Chat
          </Link>
          <Link href={`/leads/${lead.id}`} className="command-press inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-bg/55 px-4 py-2 text-sm font-semibold text-command-text transition hover:border-command-gold/60">
            View Details
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-gold">Next Action</p>
          <p className="mt-2 text-lg font-semibold text-command-text">{facts.nextAction}</p>
          <p className="mt-1 text-base leading-7 text-command-muted">{facts.nextActionReason}</p>
        </div>
        <div className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-cyan">Last WhatsApp message</p>
          <p className="mt-2 text-base leading-7 text-command-text">{whatsAppPreview}</p>
        </div>
      </div>

      <details className="mt-5 rounded-2xl border border-command-line bg-command-bg/45 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-command-muted">More lead details</summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1fr]">
          <LeadHeatMeter lead={lead} />
          <div className="rounded-2xl border border-command-line bg-command-bg/55 p-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-command-muted">Question category</dt>
                <dd className="mt-1 font-semibold text-command-text">{questionCategory ?? "No matched category"}</dd>
              </div>
              <div>
                <dt className="text-command-muted">Booking readiness</dt>
                <dd className="mt-1 font-semibold text-command-text">{humanizeLabel(booking.status)}</dd>
              </div>
              <div>
                <dt className="text-command-muted">Stage</dt>
                <dd className="mt-1 font-semibold text-command-text">{humanizeLabel(stage)}</dd>
              </div>
              <div>
                <dt className="text-command-muted">Lead facts completeness</dt>
                <dd className="mt-1 font-semibold text-command-text">{facts.infoCompletenessScore}%</dd>
              </div>
            </dl>
            {questionMatch && questionMatch.score > 0 && questionMatch.entry.intent_key !== "unsupported" ? (
              <p className="mt-4 text-command-subtle">Reply strategy: {questionMatch.entry.safe_answer_strategy}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-command-muted">Full risk list</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {riskBadges.length ? riskBadges.map((badge) => (
                <span key={badge.key} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskBadgeClass(badge)}`}>
                  {badge.label}
                </span>
              )) : chips(lead.riskFlags, "No major risk flagged")}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-command-muted">Full missing info</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {facts.missingFields.length ? facts.missingFields.map((item) => (
                <span key={item} className="rounded-full border border-command-line bg-command-bg/55 px-2.5 py-1 text-xs font-semibold text-command-muted">
                  {humanizeLabel(item)}
                </span>
              )) : <span className="text-command-muted">No key missing info</span>}
            </div>
          </div>
        </div>
      </details>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={`/leads/${lead.id}#bot-controls`} className="command-press inline-flex min-h-10 items-center rounded-xl border border-command-line bg-command-bg/55 px-3 py-2 text-sm font-semibold text-command-text transition hover:border-command-gold/60">
          Take Over
        </Link>
        {lead.botPaused ? (
          <span className="inline-flex min-h-10 items-center rounded-xl border border-command-cyan/50 bg-command-cyan/10 px-3 py-2 text-sm font-semibold text-command-cyan">
            Bot Paused
          </span>
        ) : (
          <Link href={`/leads/${lead.id}#bot-controls`} className="command-press inline-flex min-h-10 items-center rounded-xl border border-command-line bg-command-bg/55 px-3 py-2 text-sm font-semibold text-command-text transition hover:border-command-gold/60">
            Pause Bot
          </Link>
        )}
      </div>
    </article>
  );
}
