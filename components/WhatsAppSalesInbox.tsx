"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ActionButton } from "@/components/ActionButton";
import { sendManualWhatsAppReplyAction, sendManualWhatsAppTestAction } from "@/lib/actions";
import type { Lead, LeadMessage } from "@/lib/types";

export type InboxChatSummary = {
  id: string;
  displayName: string;
  phone: string;
  status: string;
  botPaused: boolean;
  needsMarcus: boolean;
  propertyType: string;
  scopeSummary: string;
  lastMessagePreview: string;
  lastActivityAt: string;
  unread: boolean;
  failedSend: boolean;
  waitingForClient: boolean;
  waitingForMarcus: boolean;
  source: string;
};

type WhatsAppAuditEntry = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
};

type LeadContextDetails = {
  budgetExpectation: string;
  floorPlanStatus: string;
  sitePhotosStatus: string;
  appointmentPreference: string;
  addressOrArea: string;
  notes: string;
  nextAction: string;
  nextReason: string;
};

type WhatsAppSalesInboxProps = {
  lead: Lead;
  displayName: string;
  leadLevel: string;
  chatSummaries: InboxChatSummary[];
  messages: LeadMessage[];
  auditTrail: WhatsAppAuditEntry[];
  context: LeadContextDetails;
  whatsappStatusLabel: string;
  liveModeLabel: string;
  publicAutoReplyLabel: string;
  manualReplyStatus?: string;
  manualReplyError?: string;
  manualTestStatus?: string;
  manualTestError?: string;
};

const quickReplies = [
  {
    label: "Ask for floor plan/photos",
    text: "You may send us your floor plan, site photos, and any reference images here. We will review from there."
  },
  {
    label: "Ask property type",
    text: "Thanks for reaching out. May I know your property type and the main scope of works?"
  },
  {
    label: "Ask scope",
    text: "Could you share the main areas you are planning to renovate and what you would like to change? That will help us review the next step properly."
  },
  {
    label: "Ask appointment preference",
    text: "We can help check a suitable time for an initial discussion. Could you share your preferred day and timing?"
  },
  {
    label: "Instagram portfolio",
    text: "You can view some of our past works here: https://www.instagram.com/limmworks/"
  },
  {
    label: "Acknowledge and review",
    text: "Thanks, I will review this with the team and get back to you shortly."
  }
];

const filters = [
  "All",
  "New leads",
  "Waiting for Marcus",
  "Waiting for client",
  "Bot active",
  "Human takeover",
  "Failed send"
] as const;

function humanize(value?: string | null) {
  if (!value) return "Recorded";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanPreview(text: string, max = 82) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "No recent message yet.";
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
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

function statusTone(status?: LeadMessage["whatsappStatus"]) {
  if (status === "sent") return "border-command-green/45 bg-command-green/10 text-command-green";
  if (status === "failed" || status === "blocked") return "border-command-red/45 bg-command-red/10 text-command-red";
  if (status === "disabled") return "border-command-amber/45 bg-command-amber/10 text-command-amber";
  return "border-command-cyan/35 bg-command-cyan/10 text-command-cyan";
}

function isNextRedirectOnly(error: unknown) {
  return typeof error === "string" && /NEXT_REDIRECT/i.test(error);
}

function displayMessageStatus(message: LeadMessage) {
  if (message.direction === "inbound") return "Received";
  if (message.providerMessageId && (message.whatsappStatus === "failed" && isNextRedirectOnly(message.metadata?.error))) {
    return message.metadata?.manualReply ? "Marcus sent" : "AI sent";
  }
  if (message.providerMessageId && !message.whatsappStatus) return message.metadata?.manualReply ? "Marcus sent" : "AI sent";
  if (message.providerMessageId && message.whatsappStatus === "sent") return message.metadata?.manualReply ? "Marcus sent" : "AI sent";
  if (message.whatsappStatus === "failed") return "Failed";
  if (message.whatsappStatus === "sent") return message.metadata?.manualReply ? "Marcus sent" : "AI sent";
  return humanize(message.whatsappStatus || (message.direction === "outbound" ? "sent" : "received"));
}

function displayStatusTone(message: LeadMessage) {
  if (message.providerMessageId && message.whatsappStatus === "failed" && isNextRedirectOnly(message.metadata?.error)) {
    return statusTone("sent");
  }
  return statusTone(message.whatsappStatus);
}

function senderLabel(message: LeadMessage) {
  if (message.direction === "inbound") return "Client";
  if (message.direction === "internal") return "Internal";
  if (message.metadata?.manualReply) return "Marcus";
  return "AI";
}

function messageBubbleTone(message: LeadMessage) {
  if (message.direction === "inbound") return "rounded-bl-md border-command-line bg-command-panel2 text-command-text";
  if (message.direction === "internal") return "border-command-line bg-command-bg/70 text-command-muted";
  if (message.metadata?.manualReply) return "rounded-br-md border-command-green/40 bg-command-green/12 text-command-text";
  return "rounded-br-md border-command-cyan/40 bg-command-cyan/12 text-command-text";
}

function chatMatchesFilter(chat: InboxChatSummary, filter: (typeof filters)[number]) {
  if (filter === "All") return true;
  if (filter === "New leads") return chat.status === "New Enquiry";
  if (filter === "Waiting for Marcus") return chat.waitingForMarcus || chat.needsMarcus;
  if (filter === "Waiting for client") return chat.waitingForClient;
  if (filter === "Bot active") return !chat.botPaused;
  if (filter === "Human takeover") return chat.botPaused;
  if (filter === "Failed send") return chat.failedSend;
  return true;
}

function buildAiDraft(latestInbound?: LeadMessage) {
  const latestText = latestInbound?.body?.trim() || "";
  if (/price|how much|budget|quote|quotation|rough/i.test(latestText)) {
    return "I understand you would like a rough idea. We should review the scope, site condition, and material direction first before advising, so we do not give you the wrong expectation. You can send any floor plan, site photos, or reference images here and we will review the next step properly.";
  }
  if (/appointment|appt|meet|site visit|available|wed|tomorrow|slot/i.test(latestText)) {
    return "Thanks, we can help check availability for an initial discussion. Before confirming any timing, the team should review the property type, address or area, and renovation scope first.";
  }
  return "Thanks for sharing. I will review this with the team and get back to you shortly. If you have a floor plan, site photos, or reference images, you can send them here too.";
}

export function WhatsAppSalesInbox({
  lead,
  displayName,
  leadLevel,
  chatSummaries,
  messages,
  auditTrail,
  context,
  whatsappStatusLabel,
  liveModeLabel,
  publicAutoReplyLabel,
  manualReplyStatus,
  manualReplyError,
  manualTestStatus,
  manualTestError
}: WhatsAppSalesInboxProps) {
  const [reply, setReply] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [contextOpen, setContextOpen] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const latestInbound = [...messages].reverse().find((message) => message.direction === "inbound");
  const filteredChats = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return chatSummaries.filter((chat) => {
      const haystack = [
        chat.displayName,
        chat.phone,
        chat.lastMessagePreview,
        chat.propertyType,
        chat.scopeSummary,
        chat.status
      ].join(" ").toLowerCase();
      return chatMatchesFilter(chat, filter) && (!needle || haystack.includes(needle));
    });
  }, [chatSummaries, filter, search]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const canSend = reply.trim().length > 0 && !isSending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!reply.trim()) {
      event.preventDefault();
      return;
    }
    setIsSending(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (canSend) formRef.current?.requestSubmit();
    }
  };

  const insertQuickReply = (text: string) => {
    setReply((current) => (current.trim() ? `${current.trim()}\n\n${text}` : text));
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-command-cyan/20 bg-command-card shadow-premium">
      <div className={`grid min-h-[820px] grid-cols-1 ${
        contextOpen
          ? "xl:grid-cols-[20rem_minmax(34rem,1fr)_minmax(18rem,0.36fr)]"
          : "xl:grid-cols-[20rem_minmax(44rem,1fr)]"
      }`}>
        <aside className="border-b border-command-line bg-command-panel2/85 xl:border-b-0 xl:border-r">
          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-command-gold">Sales Inbox</p>
            <h2 className="mt-1 text-2xl font-semibold text-command-text">WhatsApp Leads</h2>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, message, property..."
              className="mt-4 w-full rounded-xl border border-command-line bg-command-bg px-3 py-2.5 text-sm text-command-text outline-none transition placeholder:text-command-muted focus:border-command-cyan"
            />
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 xl:flex-wrap xl:overflow-visible">
              {filters.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    filter === item
                      ? "border-command-gold bg-command-gold text-black"
                      : "border-command-line bg-command-bg/65 text-command-muted hover:border-command-gold/60"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[640px] space-y-2 overflow-y-auto px-3 pb-4 xl:max-h-[720px]">
            {filteredChats.map((chat) => (
              <Link
                key={chat.id}
                href={`/leads/${chat.id}`}
                className={`block rounded-2xl border p-4 transition hover:border-command-cyan/60 ${
                  chat.id === lead.id
                    ? "border-command-gold/70 bg-command-gold/10"
                    : "border-command-line bg-command-bg/55"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-command-text">{chat.displayName || chat.phone}</p>
                    <p className="mt-1 text-xs text-command-muted">{chat.phone || "Phone pending"}</p>
                  </div>
                  {chat.unread ? (
                    <span className="rounded-full bg-command-gold px-2 py-0.5 text-xs font-bold text-black">New</span>
                  ) : null}
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-5 text-command-muted">{cleanPreview(chat.lastMessagePreview)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    chat.failedSend
                      ? "border-command-red/45 bg-command-red/10 text-command-red"
                      : chat.botPaused
                        ? "border-command-amber/45 bg-command-amber/10 text-command-amber"
                        : "border-command-green/45 bg-command-green/10 text-command-green"
                  }`}>
                    {chat.failedSend ? "Failed send" : chat.botPaused ? "Human takeover" : chat.status}
                  </span>
                  <span className="rounded-full border border-command-line bg-command-panel2 px-2.5 py-1 text-[11px] text-command-muted">
                    {chat.propertyType || "Property pending"}
                  </span>
                </div>
                <p className="mt-3 text-xs text-command-subtle">{formatTimestamp(chat.lastActivityAt)}</p>
              </Link>
            ))}
            {filteredChats.length === 0 ? (
              <p className="rounded-2xl border border-command-line bg-command-bg/55 p-4 text-sm text-command-muted">
                No chats match this search or filter.
              </p>
            ) : null}
          </div>
        </aside>

        <main className="flex min-h-[820px] flex-col bg-[radial-gradient(circle_at_top_left,rgba(78,195,255,0.08),transparent_30%),linear-gradient(180deg,rgba(10,18,32,0.96),rgba(6,10,20,0.98))]">
          <header className="border-b border-command-line bg-command-panel2/85 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-command-gold">Conversation</p>
                <h2 className="mt-1 text-2xl font-semibold text-command-text">{displayName}</h2>
                <p className="mt-1 text-sm text-command-muted">{lead.phone} | {whatsappStatusLabel}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className={`rounded-full border px-3 py-1 ${lead.botPaused ? "border-command-amber/45 bg-command-amber/10 text-command-amber" : "border-command-green/45 bg-command-green/10 text-command-green"}`}>
                  {lead.botPaused ? "Manual takeover active" : "Bot active until Marcus replies"}
                </span>
                <span className="rounded-full border border-command-line bg-command-bg/70 px-3 py-1 text-command-muted">{liveModeLabel}</span>
                <span className="rounded-full border border-command-line bg-command-bg/70 px-3 py-1 text-command-muted">{publicAutoReplyLabel}</span>
                {!contextOpen ? (
                  <button
                    type="button"
                    onClick={() => setContextOpen(true)}
                    className="rounded-full border border-command-gold/60 bg-command-gold/10 px-3 py-1 text-command-gold transition hover:bg-command-gold/15"
                  >
                    Open lead context
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <div className="space-y-3 border-b border-command-line bg-command-bg/45 px-5 py-3">
            {manualReplyStatus === "sent" ? (
              <div className="rounded-xl border border-command-green/50 bg-command-green/10 px-4 py-3 text-sm text-command-green">
                Manual WhatsApp reply sent. Bot takeover is now active for this lead.
              </div>
            ) : null}
            {manualReplyStatus === "failed" && !/NEXT_REDIRECT/i.test(manualReplyError || "") ? (
              <div className="rounded-xl border border-command-red/50 bg-command-red/10 px-4 py-3 text-sm text-command-red">
                Manual WhatsApp reply failed: {manualReplyError || "Unknown send error."}
              </div>
            ) : null}
            {manualTestStatus === "sent" ? (
              <div className="rounded-xl border border-command-green/50 bg-command-green/10 px-4 py-3 text-sm text-command-green">
                Test WhatsApp message sent.
              </div>
            ) : null}
            {manualTestStatus === "failed" && !/NEXT_REDIRECT/i.test(manualTestError || "") ? (
              <div className="rounded-xl border border-command-red/50 bg-command-red/10 px-4 py-3 text-sm text-command-red">
                Test WhatsApp send failed: {manualTestError || "Unknown send error."}
              </div>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-6">
            {messages.length ? (
              <div className="space-y-4">
                {messages.map((message) => {
                  const outbound = message.direction === "outbound";
                  const internal = message.direction === "internal";
                  const error = typeof message.metadata?.error === "string" ? message.metadata.error : "";
                  const showFailure = message.whatsappStatus === "failed" && !message.providerMessageId && !isNextRedirectOnly(error);
                  return (
                    <article key={message.id} className={`flex ${internal ? "justify-center" : outbound ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[88%] rounded-2xl border px-4 py-3 text-base leading-7 shadow-sm md:max-w-[74%] ${
                          internal ? "text-center text-sm" : ""
                        } ${messageBubbleTone(message)}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <span className="font-semibold uppercase tracking-[0.16em] text-command-muted">{senderLabel(message)}</span>
                          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${displayStatusTone(message)}`}>
                            {displayMessageStatus(message)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words">{message.body || "Message body not available."}</p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-command-muted">
                          <time dateTime={message.createdAt}>{formatTimestamp(message.createdAt)}</time>
                          {message.metadata?.manualReply ? <span>Manual reply</span> : outbound ? <span>AI/system reply</span> : null}
                        </div>
                        {showFailure ? (
                          <p className="mt-3 rounded-lg border border-command-red/40 bg-command-red/10 p-2 text-xs leading-5 text-command-red">
                            WhatsApp send failed: {error || "Check audit log for details."}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            ) : (
              <div className="rounded-2xl border border-command-line bg-command-panel2/80 p-5 text-sm text-command-muted">
                No WhatsApp messages saved for this lead yet.
              </div>
            )}
          </div>

          <div className="sticky bottom-0 border-t border-command-cyan/25 bg-command-card/95 p-5 backdrop-blur">
            <div className="mb-4 flex flex-wrap gap-2">
              {quickReplies.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => insertQuickReply(item.text)}
                  className="rounded-full border border-command-line bg-command-panel2 px-3 py-1.5 text-xs font-semibold text-command-muted transition hover:border-command-gold/60 hover:text-command-text"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mb-4 rounded-2xl border border-command-cyan/25 bg-command-cyan/8 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-command-text">AI Draft Assist</p>
                  <p className="text-xs leading-5 text-command-muted">Draft only. Marcus must review, edit, and send manually.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAiDraft(buildAiDraft(latestInbound))}
                    className="rounded-md border border-command-cyan/40 bg-command-cyan/10 px-3 py-2 text-sm font-semibold text-command-cyan transition hover:bg-command-cyan/15"
                  >
                    Generate suggested reply
                  </button>
                  {aiDraft ? (
                    <button
                      type="button"
                      onClick={() => setReply(aiDraft)}
                      className="rounded-md border border-command-gold/60 bg-command-gold/12 px-3 py-2 text-sm font-semibold text-command-gold transition hover:bg-command-gold/18"
                    >
                      Use draft
                    </button>
                  ) : null}
                </div>
              </div>
              {aiDraft ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-command-muted">{aiDraft}</p> : null}
            </div>

            <form ref={formRef} action={sendManualWhatsAppReplyAction} onSubmit={handleSubmit}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <label htmlFor="manual_reply_body" className="sr-only">Type your WhatsApp reply</label>
              <div className="flex gap-3">
                <textarea
                  id="manual_reply_body"
                  name="manual_reply_body"
                  rows={5}
                  required
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your WhatsApp reply..."
                  className="min-h-32 flex-1 resize-y rounded-2xl border border-command-line bg-command-bg px-4 py-3 text-base leading-7 text-command-text outline-none transition placeholder:text-command-muted focus:border-command-cyan"
                />
                <div className="flex min-w-32 flex-col justify-between gap-3">
                  <ActionButton type="submit" disabled={!canSend}>
                    {isSending ? "Sending..." : "Send"}
                  </ActionButton>
                  <p className="text-xs leading-5 text-command-muted">
                    Ctrl+Enter or Cmd+Enter sends. Refresh-safe after send.
                  </p>
                </div>
              </div>
            </form>
          </div>
        </main>

        <aside className={`${contextOpen ? "block" : "hidden"} border-t border-command-line bg-command-panel2/85 xl:border-l xl:border-t-0`}>
          <div className="flex items-center justify-between border-b border-command-line p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-gold">Lead Context</p>
              <p className="mt-1 text-base font-semibold text-command-text">Sales details</p>
            </div>
            <button
              type="button"
              onClick={() => setContextOpen((value) => !value)}
              className="rounded-full border border-command-line bg-command-bg px-3 py-1 text-xs font-semibold text-command-muted transition hover:border-command-gold/60"
            >
              {contextOpen ? "Collapse" : "Open"}
            </button>
          </div>
          {contextOpen ? (
            <div className="max-h-[760px] overflow-y-auto p-4">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-command-line bg-command-bg/70 px-3 py-1 text-xs font-semibold text-command-muted">{lead.status}</span>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${lead.botPaused ? "border-command-amber/45 bg-command-amber/10 text-command-amber" : "border-command-green/45 bg-command-green/10 text-command-green"}`}>
                  {lead.botPaused ? "Human takeover" : "Bot active"}
                </span>
                <span className="rounded-full border border-command-line bg-command-bg/70 px-3 py-1 text-xs font-semibold text-command-muted">{leadLevel}</span>
              </div>
              <dl className="mt-5 space-y-4 text-sm">
                <div><dt className="text-command-muted">Client</dt><dd className="mt-1 text-command-text">{displayName}</dd></div>
                <div><dt className="text-command-muted">Phone</dt><dd className="mt-1 text-command-text">{lead.phone || "Not provided"}</dd></div>
                <div><dt className="text-command-muted">Property type</dt><dd className="mt-1 text-command-text">{lead.propertyType || "Not provided"}</dd></div>
                <div><dt className="text-command-muted">Address / area</dt><dd className="mt-1 text-command-text">{context.addressOrArea}</dd></div>
                <div><dt className="text-command-muted">Scope</dt><dd className="mt-1 leading-6 text-command-text">{lead.scopeSummary || "Scope pending"}</dd></div>
                <div><dt className="text-command-muted">Budget expectation</dt><dd className="mt-1 text-command-text">{context.budgetExpectation}</dd></div>
                <div><dt className="text-command-muted">Floor plan</dt><dd className="mt-1 text-command-text">{context.floorPlanStatus}</dd></div>
                <div><dt className="text-command-muted">Photos</dt><dd className="mt-1 text-command-text">{context.sitePhotosStatus}</dd></div>
                <div><dt className="text-command-muted">Appointment preference</dt><dd className="mt-1 text-command-text">{context.appointmentPreference}</dd></div>
                <div><dt className="text-command-muted">Notes</dt><dd className="mt-1 leading-6 text-command-text">{context.notes}</dd></div>
              </dl>
              <div className="mt-5 rounded-2xl border border-command-gold/35 bg-command-gold/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-command-gold">Next action</p>
                <p className="mt-2 text-base font-semibold text-command-text">{context.nextAction}</p>
                <p className="mt-2 text-sm leading-6 text-command-muted">{context.nextReason}</p>
              </div>

              <details className="mt-4 rounded-xl border border-command-line bg-command-bg/55 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-command-text">WhatsApp Delivery Details</summary>
                <div className="mt-4 space-y-2 text-xs text-command-muted">
                  {messages.filter((message) => message.providerMessageId).map((message) => (
                    <div key={message.id} className="rounded-lg border border-command-line bg-command-panel2 p-3">
                      <p>{senderLabel(message)} | {displayMessageStatus(message)} | {formatTimestamp(message.createdAt)}</p>
                      <p className="mt-1 break-all">Meta message id: {message.providerMessageId}</p>
                    </div>
                  ))}
                  {messages.every((message) => !message.providerMessageId) ? <p>No Meta delivery IDs recorded yet.</p> : null}
                </div>
              </details>

              <details className="mt-3 rounded-xl border border-command-line bg-command-bg/55 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-command-text">Technical Audit</summary>
                <div className="mt-4 space-y-3">
                  {auditTrail.length ? auditTrail.map((entry) => (
                    <div key={entry.id} className="border-b border-command-line pb-3 text-sm last:border-b-0">
                      <p className="font-semibold text-command-text">{humanize(entry.action)}</p>
                      <p className="text-command-muted">{entry.summary}</p>
                      <p className="mt-1 text-xs text-command-muted">{formatTimestamp(entry.createdAt)}</p>
                    </div>
                  )) : (
                    <p className="text-sm text-command-muted">No WhatsApp audit events for this lead yet.</p>
                  )}
                </div>
              </details>

              <details className="mt-3 rounded-xl border border-command-line bg-command-bg/55 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-command-text">Developer Test Tools</summary>
                <form action={sendManualWhatsAppTestAction} className="mt-4 rounded-lg border border-command-line bg-command-panel2 p-4">
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <p className="text-sm font-semibold text-command-text">Test send to Marcus first</p>
                  <p className="mt-1 text-xs leading-5 text-command-muted">Tokens stay server-side.</p>
                  <input
                    name="test_recipient_phone"
                    placeholder="Marcus test number, digits only"
                    className="mt-3 w-full rounded-md border border-command-line bg-command-bg px-3 py-2 text-sm text-command-text outline-none focus:border-command-cyan"
                  />
                  <textarea
                    name="test_message_body"
                    rows={3}
                    defaultValue="LIMM Works manual WhatsApp test. Please ignore if this was not expected."
                    className="mt-3 w-full rounded-md border border-command-line bg-command-bg px-3 py-2 text-sm text-command-text outline-none focus:border-command-cyan"
                  />
                  <div className="mt-3 flex justify-end">
                    <ActionButton type="submit" tone="muted">Send Test</ActionButton>
                  </div>
                </form>
              </details>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
