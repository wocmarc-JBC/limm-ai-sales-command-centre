"use client";

import Link from "next/link";
import { memo, useEffect, useState } from "react";
import {
  markBossApprovalNeededAction,
  markLeadNotSuitableAction,
  moveLeadToQuotationReadinessAction,
  pauseBotForLeadAction,
  reclassifyWhatsAppConversationAction,
  resumeBotForLeadAction,
  updateLeadStatusAction
} from "@/lib/actions";
import type { MultiChatConversation, MultiChatSummary } from "@/components/inbox/MultiChatInbox";
import type { LeadMessage } from "@/lib/types";
import { isSilentCaptureMessage, latestSilentCapture, silentCaptureSummary } from "@/lib/whatsapp-silent-capture";

function humanize(value?: string | null) {
  if (!value) return "Recorded";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-SG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function metadataString(message: LeadMessage, key: string) {
  const value = message.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function metadataBoolean(message: LeadMessage, key: string) {
  return message.metadata?.[key] === true;
}

function isNextRedirectOnly(error: unknown) {
  return typeof error === "string" && /NEXT_REDIRECT/i.test(error);
}

function messageStatus(message: LeadMessage) {
  if (message.direction === "internal") return "Internal";
  if (message.direction === "inbound") return "Received";
  const metadataMetaMessageId = metadataString(message, "metaMessageId") || metadataString(message, "providerMessageId");
  if (metadataBoolean(message, "sending")) return "Sending";
  if (metadataBoolean(message, "clientSendFailed")) return "Failed";
  if (message.providerMessageId && message.whatsappStatus === "failed" && isNextRedirectOnly(message.metadata?.error)) return "Sent";
  if (message.providerMessageId || metadataMetaMessageId || message.whatsappStatus === "sent") return "Sent";
  if (message.whatsappStatus === "failed" && !message.providerMessageId) return "Failed";
  if (message.direction === "outbound") return "Sent";
  return humanize(message.whatsappStatus || "Received");
}

function senderLabel(message: LeadMessage) {
  if (message.direction === "inbound") return "Client";
  if (isSilentCaptureMessage(message)) return "AI note";
  if (message.direction === "internal") return "Internal";
  if (message.metadata?.manualReply) return "Marcus";
  return "AI";
}

function chatStatusLabel(chat: MultiChatSummary) {
  return chat.primaryStatus || "Bot active";
}

function chatStatusTone(chat: MultiChatSummary) {
  const label = chatStatusLabel(chat);
  if (label === "Failed send") return "border-command-red/50 bg-command-red/10 text-command-red";
  if (label === "Waiting for Marcus") return "border-command-gold/60 bg-command-gold/10 text-command-gold";
  if (label === "Waiting for client") return "border-command-amber/50 bg-command-amber/10 text-command-amber";
  if (label === "Human takeover") return "border-command-cyan/45 bg-command-cyan/10 text-command-cyan";
  if (label === "Closed / Done") return "border-command-line bg-command-bg/60 text-command-muted";
  return "border-command-green/45 bg-command-green/10 text-command-green";
}

export const InboxLeadContextPanel = memo(function InboxLeadContextPanel({
  conversation,
  activeMessages,
  onClose
}: {
  conversation: MultiChatConversation;
  activeMessages: LeadMessage[];
  onClose: () => void;
}) {
  const [showDeliveryDetails, setShowDeliveryDetails] = useState(false);
  const [showTechnicalAudit, setShowTechnicalAudit] = useState(false);
  const chat = conversation.summary;
  const context = conversation.context;
  const salesContextAvailable = context.intentClassified && context.leadEligible;
  const recentSilentCapture = latestSilentCapture(activeMessages);
  const recentSilentCaptureSummary = recentSilentCapture ? silentCaptureSummary(recentSilentCapture) : null;

  useEffect(() => {
    setShowDeliveryDetails(false);
    setShowTechnicalAudit(false);
  }, [conversation.lead.id]);

  return (
    <aside className="flex h-full min-h-0 flex-col bg-command-panel2/95" data-testid="inbox-context-panel">
      <div className="flex shrink-0 items-center justify-between border-b border-command-gold/20 bg-[linear-gradient(110deg,rgba(221,179,93,0.12),rgba(18,23,30,0.96)_42%)] px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-gold">Conversation Context</p>
          <p className="mt-1 text-base font-semibold text-command-text">{!context.intentClassified ? "Classification pending" : context.leadEligible ? "Sales details" : "Non-sales routing"}</p>
        </div>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-command-line/70 bg-command-bg/35 text-command-muted transition hover:border-command-gold/40 hover:bg-command-bg hover:text-command-text active:scale-[0.97]"
          aria-label="Close conversation details"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
        <div className="rounded-2xl border border-command-gold/20 bg-[linear-gradient(145deg,rgba(221,179,93,0.08),rgba(8,12,17,0.78)_42%)] p-4 shadow-[0_14px_38px_rgba(0,0,0,0.14)]">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${chatStatusTone(chat)}`}>{chatStatusLabel(chat)}</span>
            <span className="rounded-full border border-command-line bg-command-panel2 px-3 py-1 text-xs font-semibold text-command-muted">
              {conversation.lead.botPaused ? "Manual takeover" : "Bot active"}
            </span>
          </div>
          <p className="mt-3 text-lg font-semibold text-command-text">{chat.displayName}</p>
          <p className="mt-1 text-sm text-command-muted">{chat.phone || "Phone pending"}</p>
          <dl className="mt-4 space-y-2 border-t border-command-line pt-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-command-muted">Intent</dt><dd className="text-right text-command-text">{context.intentClassified ? humanize(context.conversationIntent) : "Legacy — not yet classified"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-command-muted">Route</dt><dd className="text-right text-command-text">{context.intentClassified ? humanize(context.conversationRoute) : "Pending classification"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-command-muted">Sales eligible</dt><dd className="text-right text-command-text">{context.intentClassified ? context.leadEligible ? "Yes" : "No" : "Not yet decided"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-command-muted">Confidence</dt><dd className="text-right text-command-text">{context.intentClassified ? `${Math.round(context.intentConfidence * 100)}%` : "Pending"}</dd></div>
          </dl>
          {salesContextAvailable ? (
            <div className="mt-3" aria-label={`Lead information ${context.infoCompletenessScore}% complete`}>
              <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-command-subtle">
                <span>Information readiness</span>
                <span className="text-command-gold">{context.infoCompletenessScore}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-command-line/70">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#38B6DB,#DDB35D)] transition-[width]" style={{ width: `${Math.max(0, Math.min(100, context.infoCompletenessScore))}%` }} />
              </div>
            </div>
          ) : null}
          {!context.intentClassified ? (
            <form action={reclassifyWhatsAppConversationAction} className="mt-4 border-t border-command-line pt-3">
              <input type="hidden" name="lead_id" value={conversation.lead.id} />
              <button type="submit" className="w-full rounded-lg border border-command-amber/45 bg-command-amber/10 px-3 py-2 text-sm font-semibold text-command-amber transition hover:bg-command-amber/15">
                Classify from conversation history
              </button>
            </form>
          ) : null}
        </div>

        <div className="mt-4 rounded-2xl border border-command-gold/40 bg-[linear-gradient(135deg,rgba(221,179,93,0.15),rgba(221,179,93,0.055))] p-4 shadow-[0_12px_30px_rgba(221,179,93,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-command-gold">Next action</p>
          <p className="mt-2 text-base font-semibold text-command-text">{context.nextAction}</p>
          <p className="mt-2 text-sm leading-6 text-command-muted">{context.nextReason}</p>
        </div>

        {recentSilentCaptureSummary ? (
          <div className="mt-4 rounded-2xl border border-command-cyan/35 bg-command-cyan/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-command-cyan">Recent AI capture</p>
            <p className="mt-2 text-sm leading-6 text-command-text">{recentSilentCaptureSummary.fieldSummary}</p>
            <p className="mt-2 text-sm leading-6 text-command-muted">Next action: {recentSilentCaptureSummary.nextAction}</p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-command-subtle">Internal only</p>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3">
          {salesContextAvailable ? <section className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-command-muted">Project basics</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-command-muted">Status</dt><dd className="text-right text-command-text">{conversation.lead.status}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-command-muted">Property</dt><dd className="text-right text-command-text">{context.propertyType || "Not provided"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-command-muted">Area</dt><dd className="text-right text-command-text">{context.addressOrArea}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-command-muted">Postal</dt><dd className="text-right text-command-text">{context.postalCode || "Not captured"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-command-muted">Location truth</dt><dd className="text-right text-command-text">{context.locationStatus}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-command-muted">Completeness</dt><dd className="text-right text-command-text">{context.infoCompletenessScore}%</dd></div>
            </dl>
            <p className="mt-3 text-sm leading-6 text-command-text">{context.scopeSummary || "Scope pending"}</p>
          </section> : null}

          {salesContextAvailable ? <section className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-command-muted">Files / photos</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-command-muted">Floor plan</dt><dd className="text-right text-command-text">{context.floorPlanStatus}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-command-muted">Photos</dt><dd className="text-right text-command-text">{context.sitePhotosStatus}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-command-muted">References</dt><dd className="text-right text-command-text">{context.referenceImagesStatus}</dd></div>
            </dl>
          </section> : null}

          {salesContextAvailable && (context.missingFields.length || context.conflictFields.length) ? (
            <section className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-command-muted">Lead Facts</p>
              {context.missingFields.length ? (
                <p className="mt-2 text-sm leading-6 text-command-muted">Missing: {context.missingFields.join(", ")}</p>
              ) : null}
              {context.conflictFields.length ? (
                <p className="mt-2 text-sm leading-6 text-command-amber">Conflicts: {context.conflictFields.join(", ")}</p>
              ) : null}
            </section>
          ) : null}

          {salesContextAvailable ? <section className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-command-muted">Appointment</p>
            <p className="mt-2 text-sm leading-6 text-command-text">{context.appointmentPreference}</p>
          </section> : null}

          <section className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-command-muted">Notes</p>
            <p className="mt-2 text-sm leading-6 text-command-text">{context.notes}</p>
          </section>
        </div>

        <details className="mt-4 rounded-xl border border-command-line bg-command-bg/55 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-command-text">Lead Actions</summary>
          <div className="mt-4 grid gap-2 text-sm">
            {salesContextAvailable ? <><form action={markBossApprovalNeededAction}>
              <input type="hidden" name="lead_id" value={conversation.lead.id} />
              <button className="min-h-11 w-full rounded-xl border border-command-gold/60 bg-command-gold/10 px-3 py-2 font-semibold text-command-gold transition hover:bg-command-gold/20" type="submit">
                Approve Reply
              </button>
            </form>
            <form action={updateLeadStatusAction}>
              <input type="hidden" name="lead_id" value={conversation.lead.id} />
              <input type="hidden" name="status" value="Appointment Pending" />
              <button className="min-h-11 w-full rounded-xl border border-command-cyan/45 bg-command-cyan/10 px-3 py-2 font-semibold text-command-cyan transition hover:bg-command-cyan/15" type="submit">
                Book Appointment
              </button>
            </form>
            <form action={moveLeadToQuotationReadinessAction}>
              <input type="hidden" name="lead_id" value={conversation.lead.id} />
              <button className="min-h-11 w-full rounded-xl border border-command-line bg-command-panel2 px-3 py-2 font-semibold text-command-muted transition hover:border-command-gold/60" type="submit">
                Move to Quotation Review
              </button>
            </form>
            <form action={updateLeadStatusAction}>
              <input type="hidden" name="lead_id" value={conversation.lead.id} />
              <input type="hidden" name="status" value="Awaiting Client" />
              <button className="min-h-11 w-full rounded-xl border border-command-amber/50 bg-command-amber/10 px-3 py-2 font-semibold text-command-amber transition hover:bg-command-amber/15" type="submit">
                Mark waiting for client
              </button>
            </form></> : null}
            {conversation.lead.botPaused ? (
              <form action={resumeBotForLeadAction}>
                <input type="hidden" name="lead_id" value={conversation.lead.id} />
                <button data-testid="inbox-automation-control" className="min-h-11 w-full rounded-xl border border-command-green/45 bg-command-green/10 px-3 py-2 font-semibold text-command-green transition hover:bg-command-green/15" type="submit">
                  Resume bot
                </button>
              </form>
            ) : (
              <form action={pauseBotForLeadAction}>
                <input type="hidden" name="lead_id" value={conversation.lead.id} />
                <input type="hidden" name="reason" value="Paused from WhatsApp Sales Inbox." />
                <button data-testid="inbox-automation-control" className="min-h-11 w-full rounded-xl border border-command-cyan/45 bg-command-cyan/10 px-3 py-2 font-semibold text-command-cyan transition hover:bg-command-cyan/15" type="submit">
                  Pause bot
                </button>
              </form>
            )}
            <form action={markLeadNotSuitableAction}>
              <input type="hidden" name="lead_id" value={conversation.lead.id} />
              <button className="min-h-11 w-full rounded-xl border border-command-line bg-command-panel2 px-3 py-2 font-semibold text-command-muted transition hover:border-command-red/50 hover:text-command-red" type="submit">
                Mark closed/lost/done
              </button>
            </form>
            <Link href={`/leads/${conversation.lead.id}`} className="flex min-h-11 w-full items-center justify-center rounded-xl border border-command-line bg-command-panel2 px-3 py-2 text-center font-semibold text-command-muted transition hover:border-command-gold/60">
              View full lead detail
            </Link>
          </div>
        </details>

        <details
          className="mt-4 rounded-xl border border-command-line bg-command-bg/55 p-4"
          onToggle={(event) => setShowDeliveryDetails(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-semibold text-command-text">WhatsApp Delivery Details</summary>
          {showDeliveryDetails ? (
            <div className="mt-4 space-y-2 text-xs text-command-muted">
              {activeMessages.filter((message) => message.providerMessageId).map((message) => (
                <div key={message.id} className="rounded-lg border border-command-line bg-command-panel2 p-3">
                  <p>{senderLabel(message)} | {messageStatus(message)} | {formatTimestamp(message.createdAt)}</p>
                  <p className="mt-1 break-all">Meta message id: {message.providerMessageId}</p>
                </div>
              ))}
              {activeMessages.every((message) => !message.providerMessageId) ? <p>No Meta delivery IDs recorded yet.</p> : null}
            </div>
          ) : null}
        </details>

        <details
          className="mt-3 rounded-xl border border-command-line bg-command-bg/55 p-4"
          onToggle={(event) => setShowTechnicalAudit(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-semibold text-command-text">Technical Audit</summary>
          {showTechnicalAudit ? (
            <div className="mt-4 space-y-3">
              {conversation.auditTrail.length ? conversation.auditTrail.map((entry) => (
                <div key={entry.id} className="border-b border-command-line pb-3 text-sm last:border-b-0">
                  <p className="font-semibold text-command-text">{humanize(entry.action)}</p>
                  <p className="text-command-muted">{entry.summary}</p>
                  <p className="mt-1 text-xs text-command-muted">{formatTimestamp(entry.createdAt)}</p>
                </div>
              )) : (
                <p className="text-sm text-command-muted">No WhatsApp audit events for this lead yet.</p>
              )}
            </div>
          ) : null}
        </details>
      </div>
    </aside>
  );
});
