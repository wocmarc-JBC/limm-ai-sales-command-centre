"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  markLeadNotSuitableAction,
  pauseBotForLeadAction,
  resumeBotForLeadAction,
  sendManualWhatsAppReplyAction,
  updateLeadStatusAction
} from "@/lib/actions";
import type { Lead, LeadMessage } from "@/lib/types";

export type MultiChatSummary = {
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
  unreadCount: number;
  failedSend: boolean;
  waitingForClient: boolean;
  waitingForMarcus: boolean;
  floorPlanReceived: boolean;
  sitePhotosReceived: boolean;
};

export type MultiChatContext = {
  budgetExpectation: string;
  floorPlanStatus: string;
  sitePhotosStatus: string;
  appointmentPreference: string;
  addressOrArea: string;
  notes: string;
  nextAction: string;
  nextReason: string;
};

export type MultiChatConversation = {
  lead: Lead;
  summary: MultiChatSummary;
  messages: LeadMessage[];
  context: MultiChatContext;
  auditTrail: Array<{
    id: string;
    action: string;
    summary: string;
    createdAt: string;
  }>;
};

type MultiChatInboxProps = {
  conversations: MultiChatConversation[];
  selectedLeadId?: string;
  manualReplyStatus?: string;
  manualReplyError?: string;
};

const filters = [
  "All",
  "Unread",
  "Waiting for Marcus",
  "Waiting for client",
  "New leads",
  "Bot active",
  "Human takeover",
  "Failed send"
] as const;

const quickReplies = [
  {
    label: "Ask property type/scope",
    text: "Thanks for reaching out. May I know your property type and the main scope of works?"
  },
  {
    label: "Ask floor plan/photos",
    text: "You may send us your floor plan, site photos, and any reference images here. We will review from there."
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
  },
  {
    label: "Ask design/reference images",
    text: "If you have any design or reference images, you can send them here too. It will help us understand the direction you prefer."
  },
  {
    label: "Team review handoff",
    text: "Thanks, I will review this with the team first and update you on the next step shortly."
  },
  {
    label: "Ask condo/HDB/landed",
    text: "May I know if this is for a condo, HDB, landed property, or commercial unit?"
  }
];

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

function cleanPreview(text: string, max = 86) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "No recent message yet.";
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

function humanize(value?: string | null) {
  if (!value) return "Recorded";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isNextRedirectOnly(error: unknown) {
  return typeof error === "string" && /NEXT_REDIRECT/i.test(error);
}

function messageStatus(message: LeadMessage) {
  if (message.direction === "inbound") return "Received";
  if (message.providerMessageId && message.whatsappStatus === "failed" && isNextRedirectOnly(message.metadata?.error)) {
    return message.metadata?.manualReply ? "Marcus sent" : "AI sent";
  }
  if (message.whatsappStatus === "failed" && !message.providerMessageId) return "Failed";
  if (message.direction === "outbound" && message.metadata?.manualReply) return "Marcus sent";
  if (message.direction === "outbound") return "AI sent";
  return humanize(message.whatsappStatus || "Received");
}

function statusTone(message: LeadMessage) {
  if (messageStatus(message) === "Failed") return "border-command-red/45 bg-command-red/10 text-command-red";
  if (message.direction === "inbound") return "border-command-cyan/35 bg-command-cyan/10 text-command-cyan";
  return "border-command-green/45 bg-command-green/10 text-command-green";
}

function senderLabel(message: LeadMessage) {
  if (message.direction === "inbound") return "Client";
  if (message.direction === "internal") return "Internal";
  if (message.metadata?.manualReply) return "Marcus";
  return "AI";
}

function bubbleTone(message: LeadMessage) {
  if (message.direction === "inbound") return "rounded-bl-md border-command-line bg-command-panel2 text-command-text";
  if (message.direction === "internal") return "border-command-line bg-command-bg/70 text-command-muted";
  if (message.metadata?.manualReply) return "rounded-br-md border-command-green/40 bg-command-green/12 text-command-text";
  return "rounded-br-md border-command-cyan/40 bg-command-cyan/12 text-command-text";
}

function chatStatusLabel(chat: MultiChatSummary) {
  if (chat.failedSend) return "Failed send";
  if (chat.unreadCount > 0 || chat.waitingForMarcus) return "Waiting for Marcus";
  if (chat.waitingForClient) return "Waiting for client";
  if (chat.botPaused) return "Human takeover";
  if (chat.status === "New Enquiry") return "New";
  return "Bot active";
}

function chatStatusTone(chat: MultiChatSummary) {
  const label = chatStatusLabel(chat);
  if (label === "Failed send") return "border-command-red/50 bg-command-red/10 text-command-red";
  if (label === "Waiting for Marcus") return "border-command-gold/60 bg-command-gold/12 text-command-gold";
  if (label === "Waiting for client") return "border-command-amber/50 bg-command-amber/10 text-command-amber";
  if (label === "Human takeover") return "border-command-cyan/45 bg-command-cyan/10 text-command-cyan";
  return "border-command-green/45 bg-command-green/10 text-command-green";
}

function matchesFilter(chat: MultiChatSummary, filter: (typeof filters)[number]) {
  if (filter === "All") return true;
  if (filter === "Unread") return chat.unreadCount > 0;
  if (filter === "Waiting for Marcus") return chat.waitingForMarcus || chat.unreadCount > 0;
  if (filter === "Waiting for client") return chat.waitingForClient;
  if (filter === "New leads") return chat.status === "New Enquiry";
  if (filter === "Bot active") return !chat.botPaused;
  if (filter === "Human takeover") return chat.botPaused;
  if (filter === "Failed send") return chat.failedSend;
  return true;
}

function buildAiDraft(conversation: MultiChatConversation) {
  const latestInbound = [...conversation.messages].reverse().find((message) => message.direction === "inbound");
  const latestText = latestInbound?.body?.trim() || "";
  if (/price|how much|budget|quote|quotation|rough/i.test(latestText)) {
    return "I understand you would like a rough idea. We should review the scope, site condition, and material direction first before advising, so we do not give you the wrong expectation. You can send any site photos or reference images here and we will review the next step properly.";
  }
  if (/appointment|appt|meet|site visit|available|wed|tomorrow|slot/i.test(latestText)) {
    return "Thanks, we can help check availability for an initial discussion. Before confirming any timing, the team should review the property type, address or area, and renovation scope first.";
  }
  return "Thanks for sharing. I will review this with the team and get back to you shortly. If you have a floor plan, site photos, or reference images, you can send them here too.";
}

export function MultiChatInbox({ conversations, selectedLeadId, manualReplyStatus, manualReplyError }: MultiChatInboxProps) {
  const router = useRouter();
  const initialLeadId = selectedLeadId && conversations.some((item) => item.lead.id === selectedLeadId)
    ? selectedLeadId
    : conversations[0]?.lead.id ?? "";
  const [activeLeadId, setActiveLeadId] = useState(initialLeadId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [reply, setReply] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);
  const [optimisticReplies, setOptimisticReplies] = useState<Record<string, LeadMessage[]>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 12000);
    return () => window.clearInterval(timer);
  }, [router]);

  useEffect(() => {
    if (selectedLeadId && conversations.some((item) => item.lead.id === selectedLeadId)) {
      setActiveLeadId(selectedLeadId);
    }
  }, [conversations, selectedLeadId]);

  const activeConversation = conversations.find((item) => item.lead.id === activeLeadId) ?? conversations[0];
  const activeMessages = [
    ...(activeConversation?.messages ?? []),
    ...(activeConversation ? optimisticReplies[activeConversation.lead.id] ?? [] : [])
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [activeLeadId, activeMessages.length]);

  const filteredConversations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const chat = conversation.summary;
      const haystack = [
        chat.displayName,
        chat.phone,
        chat.lastMessagePreview,
        chat.propertyType,
        chat.scopeSummary,
        chat.status
      ].join(" ").toLowerCase();
      return matchesFilter(chat, filter) && (!needle || haystack.includes(needle));
    });
  }, [conversations, filter, search]);

  const waitingChats = conversations.filter((conversation) => conversation.summary.waitingForMarcus || conversation.summary.unreadCount > 0);
  const canSend = reply.trim().length > 0 && !isSending && Boolean(activeConversation);

  const selectConversation = (leadId: string) => {
    setActiveLeadId(leadId);
    setReply("");
    setAiDraft("");
    window.history.replaceState(null, "", `/inbox?lead=${encodeURIComponent(leadId)}`);
  };

  const nextWaitingChat = () => {
    if (!waitingChats.length) return;
    const activeIndex = waitingChats.findIndex((item) => item.lead.id === activeLeadId);
    const next = waitingChats[(activeIndex + 1 + waitingChats.length) % waitingChats.length];
    selectConversation(next.lead.id);
  };

  const insertQuickReply = (text: string) => {
    setReply((current) => (current.trim() ? `${current.trim()}\n\n${text}` : text));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!activeConversation || !reply.trim()) {
      event.preventDefault();
      return;
    }
    const optimistic: LeadMessage = {
      id: `optimistic-${Date.now()}`,
      leadId: activeConversation.lead.id,
      direction: "outbound",
      channel: "whatsapp",
      body: reply.trim(),
      safeToSend: true,
      whatsappStatus: "sent",
      metadata: { manualReply: true, optimistic: true },
      createdAt: new Date().toISOString()
    };
    setOptimisticReplies((current) => ({
      ...current,
      [activeConversation.lead.id]: [...(current[activeConversation.lead.id] ?? []), optimistic]
    }));
    setIsSending(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (canSend) formRef.current?.requestSubmit();
      return;
    }
    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  };

  if (!activeConversation) {
    return (
      <section className="mission-panel rounded-3xl p-8 shadow-premium">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-gold">WhatsApp Sales Inbox</p>
        <h1 className="mt-2 text-3xl font-semibold text-command-text">No active conversations yet.</h1>
        <p className="mt-3 text-command-muted">New WhatsApp leads will appear here once inbound messages are saved.</p>
      </section>
    );
  }

  const chat = activeConversation.summary;
  const context = activeConversation.context;

  return (
    <section className="overflow-hidden rounded-3xl border border-command-cyan/20 bg-command-card shadow-premium">
      <div className={`grid min-h-[calc(100vh-9rem)] grid-cols-1 ${
        contextOpen
          ? "xl:grid-cols-[21rem_minmax(34rem,1fr)_minmax(18rem,0.38fr)]"
          : "xl:grid-cols-[21rem_minmax(44rem,1fr)]"
      }`}>
        <aside className="border-b border-command-line bg-command-panel2/90 xl:border-b-0 xl:border-r">
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-command-gold">WhatsApp Sales Inbox</p>
                <h1 className="mt-1 text-2xl font-semibold text-command-text">Conversations</h1>
              </div>
              <button
                type="button"
                onClick={nextWaitingChat}
                className="rounded-xl border border-command-gold/60 bg-command-gold/12 px-3 py-2 text-xs font-semibold text-command-gold transition hover:bg-command-gold/18"
              >
                Next waiting chat
              </button>
            </div>
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
          <div className="max-h-[calc(100vh-18rem)] space-y-2 overflow-y-auto px-3 pb-4">
            {filteredConversations.map((conversation) => {
              const item = conversation.summary;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectConversation(item.id)}
                  className={`block w-full rounded-2xl border p-4 text-left transition hover:border-command-cyan/60 ${
                    item.id === activeLeadId
                      ? "border-command-gold/70 bg-command-gold/10"
                      : "border-command-line bg-command-bg/55"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-command-text">{item.displayName || item.phone}</p>
                      <p className="mt-1 text-xs text-command-muted">{item.phone || "Phone pending"}</p>
                    </div>
                    {item.unreadCount > 0 ? (
                      <span className="rounded-full bg-command-gold px-2 py-0.5 text-xs font-bold text-black">{item.unreadCount}</span>
                    ) : null}
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-5 text-command-muted">{cleanPreview(item.lastMessagePreview)}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${chatStatusTone(item)}`}>
                      {chatStatusLabel(item)}
                    </span>
                    <span className="rounded-full border border-command-line bg-command-panel2 px-2.5 py-1 text-[11px] text-command-muted">
                      {item.propertyType || "Property pending"}
                    </span>
                    {item.floorPlanReceived || item.sitePhotosReceived ? (
                      <span className="rounded-full border border-command-green/40 bg-command-green/10 px-2.5 py-1 text-[11px] text-command-green">
                        Files received
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-xs text-command-subtle">{formatTimestamp(item.lastActivityAt)}</p>
                </button>
              );
            })}
            {filteredConversations.length === 0 ? (
              <p className="rounded-2xl border border-command-line bg-command-bg/55 p-4 text-sm text-command-muted">
                No chats match this search or filter.
              </p>
            ) : null}
          </div>
        </aside>

        <main className="flex min-h-[calc(100vh-9rem)] flex-col bg-[radial-gradient(circle_at_top_left,rgba(78,195,255,0.08),transparent_30%),linear-gradient(180deg,rgba(10,18,32,0.96),rgba(6,10,20,0.98))]">
          <header className="border-b border-command-line bg-command-panel2/85 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-command-gold">Active WhatsApp Chat</p>
                <h2 className="mt-1 text-2xl font-semibold text-command-text">{chat.displayName}</h2>
                <p className="mt-1 text-sm text-command-muted">{chat.phone} | {chatStatusLabel(chat)}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <form action={updateLeadStatusAction}>
                  <input type="hidden" name="lead_id" value={activeConversation.lead.id} />
                  <input type="hidden" name="status" value="Awaiting Client" />
                  <button className="rounded-full border border-command-amber/50 bg-command-amber/10 px-3 py-1.5 text-command-amber" type="submit">
                    Mark waiting for client
                  </button>
                </form>
                <form action={markLeadNotSuitableAction}>
                  <input type="hidden" name="lead_id" value={activeConversation.lead.id} />
                  <button className="rounded-full border border-command-line bg-command-bg/70 px-3 py-1.5 text-command-muted" type="submit">
                    Mark closed/lost/done
                  </button>
                </form>
                {activeConversation.lead.botPaused ? (
                  <form action={resumeBotForLeadAction}>
                    <input type="hidden" name="lead_id" value={activeConversation.lead.id} />
                    <button className="rounded-full border border-command-green/45 bg-command-green/10 px-3 py-1.5 text-command-green" type="submit">
                      Resume bot
                    </button>
                  </form>
                ) : (
                  <form action={pauseBotForLeadAction}>
                    <input type="hidden" name="lead_id" value={activeConversation.lead.id} />
                    <input type="hidden" name="reason" value="Paused from WhatsApp Sales Inbox." />
                    <button className="rounded-full border border-command-cyan/45 bg-command-cyan/10 px-3 py-1.5 text-command-cyan" type="submit">
                      Pause bot
                    </button>
                  </form>
                )}
                {!contextOpen ? (
                  <button
                    type="button"
                    onClick={() => setContextOpen(true)}
                    className="rounded-full border border-command-gold/60 bg-command-gold/10 px-3 py-1.5 text-command-gold"
                  >
                    Open context
                  </button>
                ) : null}
                <Link href={`/leads/${activeConversation.lead.id}`} className="rounded-full border border-command-line bg-command-bg/70 px-3 py-1.5 text-command-muted">
                  Lead detail
                </Link>
              </div>
            </div>
          </header>

          {manualReplyStatus === "sent" ? (
            <div className="border-b border-command-line bg-command-green/10 px-5 py-3 text-sm text-command-green">
              WhatsApp reply sent. Chat is now waiting for client and bot takeover is active.
            </div>
          ) : null}
          {manualReplyStatus === "failed" && !/NEXT_REDIRECT/i.test(manualReplyError || "") ? (
            <div className="border-b border-command-line bg-command-red/10 px-5 py-3 text-sm text-command-red">
              WhatsApp send failed: {manualReplyError || "Unknown send error."}
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto px-5 py-6">
            {activeMessages.length ? (
              <div className="space-y-4">
                {activeMessages.map((message) => {
                  const outbound = message.direction === "outbound";
                  const internal = message.direction === "internal";
                  const error = typeof message.metadata?.error === "string" ? message.metadata.error : "";
                  const showFailure = messageStatus(message) === "Failed" && !isNextRedirectOnly(error);
                  return (
                    <article key={message.id} className={`flex ${internal ? "justify-center" : outbound ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[88%] rounded-2xl border px-4 py-3 text-base leading-7 shadow-sm md:max-w-[74%] ${internal ? "text-center text-sm" : ""} ${bubbleTone(message)}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <span className="font-semibold uppercase tracking-[0.16em] text-command-muted">{senderLabel(message)}</span>
                          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(message)}`}>
                            {messageStatus(message)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words">{message.body || "Message body not available."}</p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-command-muted">
                          <time dateTime={message.createdAt}>{formatTimestamp(message.createdAt)}</time>
                          {message.metadata?.manualReply ? <span>Manual reply</span> : outbound ? <span>AI/system reply</span> : null}
                        </div>
                        {showFailure ? (
                          <p className="mt-3 rounded-lg border border-command-red/40 bg-command-red/10 p-2 text-xs leading-5 text-command-red">
                            WhatsApp send failed: {error || "Check Technical Audit for details."}
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
                    onClick={() => setAiDraft(buildAiDraft(activeConversation))}
                    className="rounded-md border border-command-cyan/40 bg-command-cyan/10 px-3 py-2 text-sm font-semibold text-command-cyan transition hover:bg-command-cyan/15"
                  >
                    Generate AI Draft
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
              <input type="hidden" name="lead_id" value={activeConversation.lead.id} />
              <input type="hidden" name="return_to" value="inbox" />
              <label htmlFor="manual_reply_body" className="sr-only">Type WhatsApp reply</label>
              <div className="flex gap-3">
                <textarea
                  id="manual_reply_body"
                  name="manual_reply_body"
                  rows={5}
                  required
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type WhatsApp reply..."
                  className="min-h-32 flex-1 resize-y rounded-2xl border border-command-line bg-command-bg px-4 py-3 text-base leading-7 text-command-text outline-none transition placeholder:text-command-muted focus:border-command-cyan"
                />
                <div className="flex min-w-32 flex-col justify-between gap-3">
                  <button
                    type="submit"
                    disabled={!canSend}
                    className="inline-flex min-h-11 items-center justify-center rounded-md border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black transition hover:bg-command-goldHover disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {isSending ? "Sending..." : "Send"}
                  </button>
                  <p className="text-xs leading-5 text-command-muted">
                    Ctrl+Enter or Cmd+Enter sends. Esc clears focus.
                  </p>
                </div>
              </div>
            </form>
          </div>
        </main>

        <aside className={`${contextOpen ? "block" : "hidden"} border-t border-command-line bg-command-panel2/90 xl:border-l xl:border-t-0`}>
          <div className="flex items-center justify-between border-b border-command-line p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-gold">Lead Context</p>
              <p className="mt-1 text-base font-semibold text-command-text">Sales details</p>
            </div>
            <button
              type="button"
              onClick={() => setContextOpen(false)}
              className="rounded-full border border-command-line bg-command-bg px-3 py-1 text-xs font-semibold text-command-muted transition hover:border-command-gold/60"
            >
              Collapse
            </button>
          </div>
          <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-4">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${chatStatusTone(chat)}`}>{chatStatusLabel(chat)}</span>
              <span className="rounded-full border border-command-line bg-command-bg/70 px-3 py-1 text-xs font-semibold text-command-muted">
                {activeConversation.lead.botPaused ? "Manual takeover" : "Bot active"}
              </span>
            </div>
            <dl className="mt-5 space-y-4 text-sm">
              <div><dt className="text-command-muted">Client</dt><dd className="mt-1 text-command-text">{chat.displayName}</dd></div>
              <div><dt className="text-command-muted">Phone</dt><dd className="mt-1 text-command-text">{chat.phone || "Not provided"}</dd></div>
              <div><dt className="text-command-muted">Lead status</dt><dd className="mt-1 text-command-text">{activeConversation.lead.status}</dd></div>
              <div><dt className="text-command-muted">Property type</dt><dd className="mt-1 text-command-text">{activeConversation.lead.propertyType || "Not provided"}</dd></div>
              <div><dt className="text-command-muted">Address / area</dt><dd className="mt-1 text-command-text">{context.addressOrArea}</dd></div>
              <div><dt className="text-command-muted">Scope</dt><dd className="mt-1 leading-6 text-command-text">{activeConversation.lead.scopeSummary || "Scope pending"}</dd></div>
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
                {activeMessages.filter((message) => message.providerMessageId).map((message) => (
                  <div key={message.id} className="rounded-lg border border-command-line bg-command-panel2 p-3">
                    <p>{senderLabel(message)} | {messageStatus(message)} | {formatTimestamp(message.createdAt)}</p>
                    <p className="mt-1 break-all">Meta message id: {message.providerMessageId}</p>
                  </div>
                ))}
                {activeMessages.every((message) => !message.providerMessageId) ? <p>No Meta delivery IDs recorded yet.</p> : null}
              </div>
            </details>

            <details className="mt-3 rounded-xl border border-command-line bg-command-bg/55 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-command-text">Technical Audit</summary>
              <div className="mt-4 space-y-3">
                {activeConversation.auditTrail.length ? activeConversation.auditTrail.map((entry) => (
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
          </div>
        </aside>
      </div>
    </section>
  );
}
