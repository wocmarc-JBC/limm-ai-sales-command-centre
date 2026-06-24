"use client";

import Link from "next/link";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent
} from "react";
import {
  markBossApprovalNeededAction,
  markLeadNotSuitableAction,
  moveLeadToQuotationReadinessAction,
  pauseBotForLeadAction,
  resumeBotForLeadAction,
  updateLeadStatusAction
} from "@/lib/actions";
import { getInboxQueueState, inboxQueuePriority, type InboxPrimaryStatus } from "@/lib/inbox-queue";
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
  primaryStatus: InboxPrimaryStatus;
  unreadCount: number;
  failedSend: boolean;
  waitingForClient: boolean;
  waitingForMarcus: boolean;
  closedOrDone: boolean;
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
  hasOlderMessages: boolean;
  oldestMessageCursor: string | null;
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

type SendResult = {
  ok: boolean;
  leadId: string;
  clientTempId: string;
  messageId?: string;
  providerMessageId?: string;
  whatsappStatus?: LeadMessage["whatsappStatus"];
  createdAt?: string;
  body?: string;
  errorCode?: string;
  errorMessage?: string;
};

type SendState = {
  clientTempId: string;
  startedAt: number;
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

const SEND_TIMEOUT_MS = 15000;

const internalTestSignals = [
  "marcus",
  "fio",
  "test lead",
  "qa lead",
  "demo lead",
  "sample lead",
  "sandbox",
  "hello...can help me do my kitchen",
  "do kitchen and demo 2 wall",
  "how much ah",
  "can make appt wed 2pm",
  "can see your past works",
  "got landed project photo",
  "voice test",
  "floor plan test",
  "laminated wall cladding test"
];

function isInternalTestChat(chat: MultiChatSummary) {
  const haystack = [
    chat.displayName,
    chat.phone,
    chat.lastMessagePreview,
    chat.propertyType,
    chat.scopeSummary,
    chat.status
  ].join(" ").toLowerCase();
  return internalTestSignals.some((signal) => haystack.includes(signal));
}

function chatPriority(chat: MultiChatSummary) {
  return inboxQueuePriority(chat);
}

function sortQueue(chats: MultiChatSummary[]) {
  return [...chats].sort((a, b) => {
    const priority = chatPriority(a) - chatPriority(b);
    if (priority !== 0) return priority;
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
  });
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

function metadataString(message: LeadMessage, key: string) {
  const value = message.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function metadataBoolean(message: LeadMessage, key: string) {
  return message.metadata?.[key] === true;
}

function messageClientTempId(message: LeadMessage) {
  return metadataString(message, "clientTempId");
}

function isNextRedirectOnly(error: unknown) {
  return typeof error === "string" && /NEXT_REDIRECT/i.test(error);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function debugInboxSendState(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.info("inbox_send_state_machine", { event, ...details });
  }
}

function isLegacyRedirectFailure(message: LeadMessage) {
  return (
    message.direction === "outbound" &&
    message.whatsappStatus === "failed" &&
    !message.providerMessageId &&
    isNextRedirectOnly(metadataString(message, "error"))
  );
}

function messageStatus(message: LeadMessage) {
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

function statusTone(message: LeadMessage) {
  const status = messageStatus(message);
  if (status === "Failed") return "border-command-red/45 bg-command-red/10 text-command-red";
  if (status === "Sending") return "border-command-amber/45 bg-command-amber/10 text-command-amber";
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
  return chat.primaryStatus || "Bot active";
}

function chatStatusTone(chat: MultiChatSummary) {
  const label = chatStatusLabel(chat);
  if (label === "Failed send") return "border-command-red/50 bg-command-red/10 text-command-red";
  if (label === "Waiting for Marcus") return "border-command-gold/60 bg-command-gold/12 text-command-gold";
  if (label === "Waiting for client") return "border-command-amber/50 bg-command-amber/10 text-command-amber";
  if (label === "Human takeover") return "border-command-cyan/45 bg-command-cyan/10 text-command-cyan";
  if (label === "Closed / Done") return "border-command-line bg-command-bg/60 text-command-muted";
  return "border-command-green/45 bg-command-green/10 text-command-green";
}

function matchesFilter(chat: MultiChatSummary, filter: (typeof filters)[number]) {
  if (filter === "All") return true;
  if (filter === "Unread") return chat.unreadCount > 0;
  if (filter === "Waiting for Marcus") return chat.primaryStatus === "Waiting for Marcus";
  if (filter === "Waiting for client") return chat.primaryStatus === "Waiting for client";
  if (filter === "New leads") return chat.primaryStatus === "New lead";
  if (filter === "Bot active") return chat.primaryStatus === "Bot active";
  if (filter === "Human takeover") return chat.botPaused;
  if (filter === "Failed send") return chat.primaryStatus === "Failed send";
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

function newestMessage(messages: LeadMessage[]) {
  return [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

function sortMessages(messages: LeadMessage[]) {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function normalizedOutboundBody(message: LeadMessage) {
  return message.body.trim().replace(/\s+/g, " ").toLowerCase();
}

function looksLikeSameOutboundAttempt(a: LeadMessage, b: LeadMessage) {
  if (a.direction !== "outbound" || b.direction !== "outbound") return false;
  const body = normalizedOutboundBody(a);
  if (!body || body !== normalizedOutboundBody(b)) return false;
  const aTime = new Date(a.createdAt).getTime();
  const bTime = new Date(b.createdAt).getTime();
  return !Number.isNaN(aTime) && !Number.isNaN(bTime) && Math.abs(aTime - bTime) <= 120000;
}

function mergeTimelineMessages(messages: LeadMessage[]) {
  const seen = new Set<string>();
  const merged: LeadMessage[] = [];
  for (const message of sortMessages(messages)) {
    if (isLegacyRedirectFailure(message)) continue;
    if (messageStatus(message) === "Failed" && merged.some((item) => messageStatus(item) === "Sent" && looksLikeSameOutboundAttempt(item, message))) {
      continue;
    }
    if (messageStatus(message) === "Sent") {
      for (let index = merged.length - 1; index >= 0; index -= 1) {
        if (messageStatus(merged[index]) === "Failed" && looksLikeSameOutboundAttempt(merged[index], message)) {
          merged.splice(index, 1);
        }
      }
    }
    const keys = [
      `id:${message.id}`,
      message.providerMessageId ? `provider:${message.providerMessageId}` : "",
      messageClientTempId(message) ? `client:${messageClientTempId(message)}` : ""
    ].filter(Boolean);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    merged.push(message);
  }
  return merged;
}

function randomClientTempId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const ChatRow = memo(function ChatRow({
  chat,
  active,
  onSelect
}: {
  chat: MultiChatSummary;
  active: boolean;
  onSelect: (leadId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(chat.id)}
      className={`block w-full rounded-2xl border p-4 text-left transition hover:border-command-cyan/60 ${
        active
          ? "border-command-gold/70 bg-command-gold/10"
          : "border-command-line bg-command-bg/55"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-command-text">{chat.displayName || chat.phone}</p>
          <p className="mt-1 text-xs text-command-muted">{chat.phone || "Phone pending"}</p>
        </div>
        {chat.unreadCount > 0 ? (
          <span className="rounded-full bg-command-gold px-2 py-0.5 text-xs font-bold text-black">{chat.unreadCount}</span>
        ) : null}
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-5 text-command-muted">{cleanPreview(chat.lastMessagePreview)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${chatStatusTone(chat)}`}>
          {chatStatusLabel(chat)}
        </span>
        {chat.floorPlanReceived || chat.sitePhotosReceived ? (
          <span className="rounded-full border border-command-green/40 bg-command-green/10 px-2.5 py-1 text-[11px] text-command-green">
            Files received
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-command-subtle">{formatTimestamp(chat.lastActivityAt)}</p>
    </button>
  );
});

const MessageBubble = memo(function MessageBubble({
  message,
  onRetry
}: {
  message: LeadMessage;
  onRetry?: (leadId: string, body: string) => void;
}) {
  const outbound = message.direction === "outbound";
  const internal = message.direction === "internal";
  const error = metadataString(message, "error");
  const showFailure = messageStatus(message) === "Failed" && !isNextRedirectOnly(error);
  return (
    <article className={`flex ${internal ? "justify-center" : outbound ? "justify-end" : "justify-start"}`}>
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
          <div className="mt-3 rounded-lg border border-command-red/40 bg-command-red/10 p-2 text-xs leading-5 text-command-red">
            <p>WhatsApp send failed: {error || "Check Technical Audit for details."}</p>
            {onRetry && message.body.trim() ? (
              <button
                type="button"
                onClick={() => onRetry(message.leadId, message.body)}
                className="mt-2 rounded-md border border-command-red/40 bg-command-bg/60 px-2.5 py-1 font-semibold text-command-red transition hover:bg-command-red/10"
              >
                Retry in composer
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
});

function ReplyComposer({
  conversation,
  draftSeed,
  sendingState,
  sendError,
  onDraftSeedConsumed,
  onSendStarted,
  onSendFinished,
  onOptimisticReply,
  onSendSettled
}: {
  conversation: MultiChatConversation;
  draftSeed?: { id: string; text: string };
  sendingState?: SendState;
  sendError?: string;
  onDraftSeedConsumed?: (leadId: string, seedId: string) => void;
  onSendStarted: (leadId: string, clientTempId: string) => void;
  onSendFinished: (leadId: string, clientTempId: string) => void;
  onOptimisticReply: (leadId: string, message: LeadMessage) => void;
  onSendSettled: (leadId: string, clientTempId: string, result: SendResult) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [aiDraft, setAiDraft] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const leadId = conversation.lead.id;
  const reply = drafts[leadId] ?? "";
  const isSending = Boolean(sendingState);
  const canSend = reply.trim().length > 0 && !isSending;

  useEffect(() => {
    setAiDraft("");
  }, [leadId]);

  useEffect(() => {
    if (!draftSeed?.text) return;
    setDrafts((current) => ({ ...current, [leadId]: draftSeed.text }));
    onDraftSeedConsumed?.(leadId, draftSeed.id);
  }, [draftSeed, leadId, onDraftSeedConsumed]);

  const setReply = useCallback((value: string) => {
    setDrafts((current) => ({ ...current, [leadId]: value }));
  }, [leadId]);

  const insertQuickReply = (text: string) => {
    setReply(reply.trim() ? `${reply.trim()}\n\n${text}` : text);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = reply.trim();
    if (!body || isSending) return;

    const clientTempId = randomClientTempId();
    const optimistic: LeadMessage = {
      id: `optimistic-${clientTempId}`,
      leadId,
      direction: "outbound",
      channel: "whatsapp",
      body,
      safeToSend: true,
      whatsappStatus: "",
      metadata: {
        manualReply: true,
        optimistic: true,
        sending: true,
        clientTempId,
        inboxJsonApiSend: true
      },
      createdAt: new Date().toISOString()
    };
    onOptimisticReply(leadId, optimistic);
    setReply("");
    onSendStarted(leadId, clientTempId);
    debugInboxSendState("send started", { leadId, clientTempId });

    const controller = new AbortController();
    let settled = false;
    let finished = false;
    let timeoutId: number | undefined;
    const finishOnce = () => {
      if (finished) return;
      finished = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      onSendFinished(leadId, clientTempId);
      debugInboxSendState("finally executed", { leadId, clientTempId });
    };
    const settleOnce = (result: SendResult, restoreDraft: boolean) => {
      if (settled) return;
      settled = true;
      onSendSettled(leadId, clientTempId, result);
      if (restoreDraft) setReply(body);
    };
    timeoutId = window.setTimeout(() => {
      controller.abort();
      settleOnce({
        ok: false,
        leadId,
        clientTempId,
        body,
        errorCode: "send_timeout",
        errorMessage: "WhatsApp send timed out after 15 seconds. Please check the conversation before retrying."
      }, true);
      finishOnce();
    }, SEND_TIMEOUT_MS);

    try {
      const response = await fetch("/api/inbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, body, clientTempId }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      debugInboxSendState("api response received", {
        leadId,
        clientTempId,
        ok: Boolean(data?.ok)
      });
      const result: SendResult = {
        ok: Boolean(data?.ok),
        leadId,
        clientTempId,
        messageId: typeof data?.messageId === "string" ? data.messageId : undefined,
        providerMessageId: typeof data?.providerMessageId === "string" ? data.providerMessageId : undefined,
        whatsappStatus: data?.whatsappStatus === "sent" || data?.whatsappStatus === "failed" ? data.whatsappStatus : undefined,
        createdAt: typeof data?.createdAt === "string" ? data.createdAt : undefined,
        body: typeof data?.body === "string" ? data.body : body,
        errorCode: typeof data?.errorCode === "string" ? data.errorCode : undefined,
        errorMessage: typeof data?.errorMessage === "string" ? data.errorMessage : undefined
      };
      settleOnce(result, !result.ok);
    } catch (error) {
      const timedOut = isAbortError(error);
      settleOnce({
        ok: false,
        leadId,
        clientTempId,
        body,
        errorCode: timedOut ? "send_timeout" : "network_error",
        errorMessage: timedOut
          ? "WhatsApp send timed out after 15 seconds. Please check the conversation before retrying."
          : error instanceof Error ? error.message : "Network error while sending WhatsApp reply."
      }, true);
    } finally {
      finishOnce();
    }
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

  return (
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
              onClick={() => setAiDraft(buildAiDraft(conversation))}
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
      <form ref={formRef} onSubmit={handleSubmit}>
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
            {sendError ? (
              <p className="text-xs leading-5 text-command-red">{sendError}</p>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}

const LeadContextPanel = memo(function LeadContextPanel({
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

  useEffect(() => {
    setShowDeliveryDetails(false);
    setShowTechnicalAudit(false);
  }, [conversation.lead.id]);

  return (
    <aside className="border-t border-command-line bg-command-panel2/90 xl:border-l xl:border-t-0">
      <div className="flex items-center justify-between border-b border-command-line p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-gold">Lead Context</p>
          <p className="mt-1 text-base font-semibold text-command-text">Sales details</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-command-line bg-command-bg px-3 py-1 text-xs font-semibold text-command-muted transition hover:border-command-gold/60"
        >
          Collapse
        </button>
      </div>
      <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-4">
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${chatStatusTone(chat)}`}>{chatStatusLabel(chat)}</span>
          <span className="rounded-full border border-command-line bg-command-bg/70 px-3 py-1 text-xs font-semibold text-command-muted">
            {conversation.lead.botPaused ? "Manual takeover" : "Bot active"}
          </span>
        </div>
        <dl className="mt-5 space-y-4 text-sm">
          <div><dt className="text-command-muted">Client</dt><dd className="mt-1 text-command-text">{chat.displayName}</dd></div>
          <div><dt className="text-command-muted">Phone</dt><dd className="mt-1 text-command-text">{chat.phone || "Not provided"}</dd></div>
          <div><dt className="text-command-muted">Lead status</dt><dd className="mt-1 text-command-text">{conversation.lead.status}</dd></div>
          <div><dt className="text-command-muted">Property type</dt><dd className="mt-1 text-command-text">{conversation.lead.propertyType || "Not provided"}</dd></div>
          <div><dt className="text-command-muted">Address / area</dt><dd className="mt-1 text-command-text">{context.addressOrArea}</dd></div>
          <div><dt className="text-command-muted">Scope</dt><dd className="mt-1 leading-6 text-command-text">{conversation.lead.scopeSummary || "Scope pending"}</dd></div>
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
          <summary className="cursor-pointer text-sm font-semibold text-command-text">Lead Actions</summary>
          <div className="mt-4 grid gap-2 text-sm">
            <form action={markBossApprovalNeededAction}>
              <input type="hidden" name="lead_id" value={conversation.lead.id} />
              <button className="w-full rounded-md border border-command-gold/60 bg-command-gold/12 px-3 py-2 font-semibold text-command-gold transition hover:bg-command-gold/18" type="submit">
                Approve Reply
              </button>
            </form>
            <form action={updateLeadStatusAction}>
              <input type="hidden" name="lead_id" value={conversation.lead.id} />
              <input type="hidden" name="status" value="Appointment Pending" />
              <button className="w-full rounded-md border border-command-cyan/45 bg-command-cyan/10 px-3 py-2 font-semibold text-command-cyan transition hover:bg-command-cyan/15" type="submit">
                Book Appointment
              </button>
            </form>
            <form action={moveLeadToQuotationReadinessAction}>
              <input type="hidden" name="lead_id" value={conversation.lead.id} />
              <button className="w-full rounded-md border border-command-line bg-command-panel2 px-3 py-2 font-semibold text-command-muted transition hover:border-command-gold/60" type="submit">
                Move to Quotation Review
              </button>
            </form>
            <form action={updateLeadStatusAction}>
              <input type="hidden" name="lead_id" value={conversation.lead.id} />
              <input type="hidden" name="status" value="Awaiting Client" />
              <button className="w-full rounded-md border border-command-amber/50 bg-command-amber/10 px-3 py-2 font-semibold text-command-amber transition hover:bg-command-amber/15" type="submit">
                Mark waiting for client
              </button>
            </form>
            {conversation.lead.botPaused ? (
              <form action={resumeBotForLeadAction}>
                <input type="hidden" name="lead_id" value={conversation.lead.id} />
                <button className="w-full rounded-md border border-command-green/45 bg-command-green/10 px-3 py-2 font-semibold text-command-green transition hover:bg-command-green/15" type="submit">
                  Resume bot
                </button>
              </form>
            ) : (
              <form action={pauseBotForLeadAction}>
                <input type="hidden" name="lead_id" value={conversation.lead.id} />
                <input type="hidden" name="reason" value="Paused from WhatsApp Sales Inbox." />
                <button className="w-full rounded-md border border-command-cyan/45 bg-command-cyan/10 px-3 py-2 font-semibold text-command-cyan transition hover:bg-command-cyan/15" type="submit">
                  Pause bot
                </button>
              </form>
            )}
            <form action={markLeadNotSuitableAction}>
              <input type="hidden" name="lead_id" value={conversation.lead.id} />
              <button className="w-full rounded-md border border-command-line bg-command-panel2 px-3 py-2 font-semibold text-command-muted transition hover:border-command-red/50 hover:text-command-red" type="submit">
                Mark closed/lost/done
              </button>
            </form>
            <Link href={`/leads/${conversation.lead.id}`} className="w-full rounded-md border border-command-line bg-command-panel2 px-3 py-2 text-center font-semibold text-command-muted transition hover:border-command-gold/60">
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

export function MultiChatInbox({ conversations, selectedLeadId, manualReplyStatus, manualReplyError }: MultiChatInboxProps) {
  const firstVisibleConversation = conversations.find((item) => !isInternalTestChat(item.summary)) ?? conversations[0];
  const initialLeadId = selectedLeadId && conversations.some((item) => item.lead.id === selectedLeadId)
    ? selectedLeadId
    : firstVisibleConversation?.lead.id ?? "";
  const [conversationMap, setConversationMap] = useState<Record<string, MultiChatConversation>>(() => Object.fromEntries(
    conversations.map((conversation) => [conversation.lead.id, conversation])
  ));
  const [chatSummaries, setChatSummaries] = useState<MultiChatSummary[]>(() => conversations.map((conversation) => conversation.summary));
  const [conversationCache, setConversationCache] = useState<Record<string, { fetchedAt: string }>>(() => initialLeadId
    ? { [initialLeadId]: { fetchedAt: new Date().toISOString() } }
    : {});
  const [activeLeadId, setActiveLeadId] = useState(initialLeadId);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [showInternalTestLeads, setShowInternalTestLeads] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);
  const [optimisticReplies, setOptimisticReplies] = useState<Record<string, LeadMessage[]>>({});
  const [sendingByLeadId, setSendingByLeadId] = useState<Record<string, SendState>>({});
  const [errorByLeadId, setErrorByLeadId] = useState<Record<string, string>>({});
  const [draftSeeds, setDraftSeeds] = useState<Record<string, { id: string; text: string }>>({});
  const [olderMessages, setOlderMessages] = useState<Record<string, LeadMessage[]>>({});
  const [olderState, setOlderState] = useState<Record<string, { hasOlder: boolean; cursor: string | null }>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingConversationId, setLoadingConversationId] = useState("");
  const messagePaneRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const conversationCacheRef = useRef(conversationCache);

  useEffect(() => {
    conversationCacheRef.current = conversationCache;
  }, [conversationCache]);

  const patchSummary = useCallback((leadId: string, patch: Partial<MultiChatSummary>) => {
    setChatSummaries((current) => current
      .map((summary) => summary.id === leadId ? { ...summary, ...patch } : summary)
      .sort((a, b) => {
        const priority = chatPriority(a) - chatPriority(b);
        if (priority !== 0) return priority;
        return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
      }));
    setConversationMap((current) => {
      const conversation = current[leadId];
      if (!conversation) return current;
      return {
        ...current,
        [leadId]: {
          ...conversation,
          summary: { ...conversation.summary, ...patch }
        }
      };
    });
  }, []);

  const loadConversation = useCallback(async (leadId: string, options: { background?: boolean } = {}) => {
    if (!leadId) return;
    if (!options.background) setLoadingConversationId(leadId);
    try {
      const response = await fetch(`/api/inbox/conversations/${encodeURIComponent(leadId)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (data?.ok && data.conversation) {
        const conversation = data.conversation as MultiChatConversation;
        setConversationMap((current) => ({ ...current, [leadId]: conversation }));
        setChatSummaries((current) => {
          const others = current.filter((summary) => summary.id !== leadId);
          return sortQueue([conversation.summary, ...others]);
        });
        setOlderState((current) => ({
          ...current,
          [leadId]: {
            hasOlder: conversation.hasOlderMessages,
            cursor: conversation.oldestMessageCursor
          }
        }));
        setConversationCache((current) => ({
          ...current,
          [leadId]: { fetchedAt: new Date().toISOString() }
        }));
      }
    } finally {
      if (!options.background) {
        setLoadingConversationId((current) => current === leadId ? "" : current);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/inbox/conversations", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!data?.ok || !Array.isArray(data.conversations)) return;
        const nextSummaries = data.conversations as MultiChatSummary[];
        setChatSummaries(nextSummaries);
        setConversationMap((current) => {
          const next = { ...current };
          for (const summary of nextSummaries) {
            if (next[summary.id]) next[summary.id] = { ...next[summary.id], summary };
          }
          return next;
        });
      } catch {
        // Keep the inbox responsive; the next lightweight poll can recover.
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedLeadId && chatSummaries.some((item) => item.id === selectedLeadId)) {
      setActiveLeadId(selectedLeadId);
      if (!conversationCacheRef.current[selectedLeadId]) void loadConversation(selectedLeadId);
    }
  }, [chatSummaries, loadConversation, selectedLeadId]);

  const activeConversation = conversationMap[activeLeadId] ?? conversations[0];
  const activeOlderState = activeConversation
    ? olderState[activeConversation.lead.id] ?? {
      hasOlder: activeConversation.hasOlderMessages,
      cursor: activeConversation.oldestMessageCursor
    }
    : { hasOlder: false, cursor: null };
  const activeMessages = useMemo(() => mergeTimelineMessages([
    ...(activeConversation ? olderMessages[activeConversation.lead.id] ?? [] : []),
    ...(activeConversation?.messages ?? []),
    ...(activeConversation ? optimisticReplies[activeConversation.lead.id] ?? [] : [])
  ]), [activeConversation, olderMessages, optimisticReplies]);
  const latestPersistedCursor = useMemo(() => {
    const persisted = activeConversation?.messages.filter((message) => !message.id.startsWith("optimistic-")) ?? [];
    return newestMessage(persisted)?.createdAt ?? "";
  }, [activeConversation]);

  useEffect(() => {
    if (!activeLeadId) return;
    const timer = window.setInterval(async () => {
      if (!latestPersistedCursor) {
        await loadConversation(activeLeadId);
        return;
      }
      try {
        const response = await fetch(`/api/inbox/messages?leadId=${encodeURIComponent(activeLeadId)}&after=${encodeURIComponent(latestPersistedCursor)}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!data?.ok || !Array.isArray(data.messages) || data.messages.length === 0) return;
        const incoming = data.messages as LeadMessage[];
        setConversationMap((current) => {
          const conversation = current[activeLeadId];
          if (!conversation) return current;
          const messages = mergeTimelineMessages([...conversation.messages, ...incoming]);
          const latest = newestMessage(messages);
          const queue = getInboxQueueState(conversation.lead, messages);
          return {
            ...current,
            [activeLeadId]: {
              ...conversation,
              messages,
              summary: latest ? {
                ...conversation.summary,
                lastMessagePreview: latest.body,
                lastActivityAt: latest.createdAt,
                primaryStatus: queue.primaryStatus,
                unreadCount: queue.unreadCount,
                failedSend: queue.failedSend,
                waitingForClient: queue.waitingForClient,
                waitingForMarcus: queue.waitingForMarcus,
                closedOrDone: queue.closedOrDone
              } : conversation.summary
            }
          };
        });
        const latest = newestMessage(incoming);
        if (latest) {
          const currentConversation = conversationMap[activeLeadId];
          const mergedMessages = currentConversation ? mergeTimelineMessages([...currentConversation.messages, ...incoming]) : incoming;
          const queue = currentConversation
            ? getInboxQueueState(currentConversation.lead, mergedMessages)
            : {
              primaryStatus: (latest.direction === "inbound" ? "Waiting for Marcus" : "Waiting for client") as InboxPrimaryStatus,
              unreadCount: latest.direction === "inbound" ? 1 : 0,
              failedSend: messageStatus(latest) === "Failed",
              waitingForClient: latest.direction === "outbound",
              waitingForMarcus: latest.direction === "inbound",
              closedOrDone: false
            };
          patchSummary(activeLeadId, {
            lastMessagePreview: latest.body,
            lastActivityAt: latest.createdAt,
            primaryStatus: queue.primaryStatus,
            unreadCount: queue.unreadCount,
            failedSend: queue.failedSend,
            waitingForMarcus: queue.waitingForMarcus,
            waitingForClient: queue.waitingForClient,
            closedOrDone: queue.closedOrDone
          });
        }
      } catch {
        // Selected-chat polling is intentionally lightweight and self-healing.
      }
    }, 9000);
    return () => window.clearInterval(timer);
  }, [activeLeadId, conversationMap, latestPersistedCursor, loadConversation, patchSummary]);

  useEffect(() => {
    if (stickToBottomRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [activeLeadId, activeMessages.length]);

  const handleMessagePaneScroll = () => {
    const pane = messagePaneRef.current;
    if (!pane) return;
    stickToBottomRef.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 160;
  };

  const visibleChatSummaries = useMemo(() => sortQueue(
    showInternalTestLeads
      ? chatSummaries
      : chatSummaries.filter((chat) => !isInternalTestChat(chat))
  ), [chatSummaries, showInternalTestLeads]);
  const hiddenInternalCount = useMemo(
    () => chatSummaries.filter((chat) => isInternalTestChat(chat)).length,
    [chatSummaries]
  );
  const queueCounters = useMemo(() => ({
    waitingForMarcus: visibleChatSummaries.filter((chat) => chat.primaryStatus === "Waiting for Marcus").length,
    newLeads: visibleChatSummaries.filter((chat) => chat.primaryStatus === "New lead").length,
    botActive: visibleChatSummaries.filter((chat) => chat.primaryStatus === "Bot active").length,
    humanTakeover: visibleChatSummaries.filter((chat) => chat.botPaused).length,
    failedSends: visibleChatSummaries.filter((chat) => chat.primaryStatus === "Failed send").length
  }), [visibleChatSummaries]);

  const filteredConversations = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    return sortQueue(visibleChatSummaries.filter((chat) => {
      const haystack = [
        chat.displayName,
        chat.phone,
        chat.lastMessagePreview,
        chat.propertyType,
        chat.scopeSummary,
        chat.status
      ].join(" ").toLowerCase();
      return matchesFilter(chat, filter) && (!needle || haystack.includes(needle));
    }));
  }, [deferredSearch, filter, visibleChatSummaries]);

  const waitingChats = useMemo(
    () => visibleChatSummaries.filter((summary) => summary.primaryStatus === "Failed send" || summary.primaryStatus === "Waiting for Marcus"),
    [visibleChatSummaries]
  );

  const selectConversation = useCallback((leadId: string) => {
    setActiveLeadId(leadId);
    stickToBottomRef.current = true;
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/inbox?lead=${encodeURIComponent(leadId)}`);
    }
    const cached = conversationCacheRef.current[leadId];
    if (!cached) {
      void loadConversation(leadId);
      return;
    }
    const fetchedAt = Date.parse(cached.fetchedAt);
    if (!Number.isNaN(fetchedAt) && Date.now() - fetchedAt > 60000) {
      void loadConversation(leadId, { background: true });
    }
  }, [loadConversation]);

  useEffect(() => {
    const candidates = waitingChats
      .filter((summary) => summary.id !== activeLeadId && !conversationCacheRef.current[summary.id])
      .slice(0, 3);
    if (!candidates.length) return;
    const timer = window.setTimeout(() => {
      for (const candidate of candidates) {
        if (!conversationCacheRef.current[candidate.id]) {
          void loadConversation(candidate.id, { background: true });
        }
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [activeLeadId, loadConversation, waitingChats]);

  const nextWaitingChat = () => {
    if (!waitingChats.length) return;
    const activeIndex = waitingChats.findIndex((item) => item.id === activeLeadId);
    const next = waitingChats[(activeIndex + 1 + waitingChats.length) % waitingChats.length];
    selectConversation(next.id);
  };

  const handleOptimisticReply = useCallback((leadId: string, message: LeadMessage) => {
    setOptimisticReplies((current) => ({
      ...current,
      [leadId]: mergeTimelineMessages([...(current[leadId] ?? []), message])
    }));
    patchSummary(leadId, {
      lastMessagePreview: message.body,
      lastActivityAt: message.createdAt,
      primaryStatus: "Waiting for client",
      unreadCount: 0,
      failedSend: false,
      waitingForClient: true,
      waitingForMarcus: false,
      closedOrDone: false,
      botPaused: true
    });
  }, [patchSummary]);

  const handleSendStarted = useCallback((leadId: string, clientTempId: string) => {
    setSendingByLeadId((current) => ({
      ...current,
      [leadId]: { clientTempId, startedAt: Date.now() }
    }));
    setErrorByLeadId((current) => {
      if (!current[leadId]) return current;
      const next = { ...current };
      delete next[leadId];
      return next;
    });
  }, []);

  const handleSendFinished = useCallback((leadId: string, clientTempId: string) => {
    setSendingByLeadId((current) => {
      if (current[leadId]?.clientTempId !== clientTempId) return current;
      const next = { ...current };
      delete next[leadId];
      return next;
    });
  }, []);

  const handleSendSettled = useCallback((leadId: string, clientTempId: string, result: SendResult) => {
    setOptimisticReplies((current) => {
      const updated = (current[leadId] ?? []).map((message) => {
        if (messageClientTempId(message) !== clientTempId) return message;
        return {
          ...message,
          id: result.messageId || message.id,
          providerMessageId: result.providerMessageId || message.providerMessageId,
          whatsappStatus: result.ok ? "sent" as const : "failed" as const,
          safeToSend: result.ok,
          createdAt: result.createdAt || message.createdAt,
          metadata: {
            ...message.metadata,
            sending: false,
            optimistic: false,
            clientSendFailed: !result.ok,
            error: result.ok ? "" : result.errorMessage || "WhatsApp send failed.",
            serverMessageId: result.messageId || "",
            providerMessageId: result.providerMessageId || ""
          }
        };
      });
      return { ...current, [leadId]: updated };
    });
    if (result.ok) {
      setConversationMap((current) => {
        const conversation = current[leadId];
        if (!conversation) return current;
        return {
          ...current,
          [leadId]: {
            ...conversation,
            lead: {
              ...conversation.lead,
              status: "Awaiting Client",
              botPaused: true,
              botPauseReason: "Human takeover",
              needsMarcus: false,
              bossApprovalNeeded: false
            },
            summary: {
              ...conversation.summary,
              primaryStatus: "Waiting for client",
              unreadCount: 0,
              failedSend: false,
              waitingForClient: true,
              waitingForMarcus: false,
              botPaused: true
            }
          }
        };
      });
    }
    setErrorByLeadId((current) => {
      if (result.ok) {
        if (!current[leadId]) return current;
        const next = { ...current };
        delete next[leadId];
        return next;
      }
      return {
        ...current,
        [leadId]: result.errorMessage || "WhatsApp send failed."
      };
    });
    patchSummary(leadId, {
      lastMessagePreview: result.body || "",
      lastActivityAt: result.createdAt || new Date().toISOString(),
      primaryStatus: result.ok ? "Waiting for client" : "Failed send",
      unreadCount: 0,
      failedSend: !result.ok,
      waitingForClient: result.ok,
      waitingForMarcus: !result.ok,
      closedOrDone: false,
      botPaused: true
    });
  }, [patchSummary]);

  const handleRetryDraft = useCallback((leadId: string, body: string) => {
    const text = body.trim();
    if (!text) return;
    setDraftSeeds((current) => ({
      ...current,
      [leadId]: { id: `retry-${Date.now()}`, text }
    }));
  }, []);

  const consumeDraftSeed = useCallback((leadId: string, seedId: string) => {
    setDraftSeeds((current) => {
      if (current[leadId]?.id !== seedId) return current;
      const next = { ...current };
      delete next[leadId];
      return next;
    });
  }, []);

  const loadEarlierMessages = async () => {
    if (!activeConversation || !activeOlderState.hasOlder || !activeOlderState.cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const response = await fetch(`/api/inbox/messages?leadId=${encodeURIComponent(activeConversation.lead.id)}&before=${encodeURIComponent(activeOlderState.cursor)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (data?.ok) {
        setOlderMessages((current) => ({
          ...current,
          [activeConversation.lead.id]: mergeTimelineMessages([
            ...(data.messages ?? []),
            ...(current[activeConversation.lead.id] ?? [])
          ])
        }));
        setOlderState((current) => ({
          ...current,
          [activeConversation.lead.id]: {
            hasOlder: Boolean(data.hasOlder),
            cursor: data.oldestCursor ?? null
          }
        }));
      }
    } finally {
      setLoadingOlder(false);
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
  const conversationLoading = loadingConversationId === activeConversation.lead.id;
  const counterItems = [
    { label: "Waiting for Marcus", value: queueCounters.waitingForMarcus, tone: "text-command-gold" },
    { label: "New leads", value: queueCounters.newLeads, tone: "text-command-cyan" },
    { label: "Bot active", value: queueCounters.botActive, tone: "text-command-green" },
    { label: "Human takeover", value: queueCounters.humanTakeover, tone: "text-command-amber" },
    { label: "Failed sends", value: queueCounters.failedSends, tone: "text-command-red" }
  ];

  return (
    <section className="overflow-hidden rounded-3xl border border-command-cyan/20 bg-command-card shadow-premium">
      <div className="border-b border-command-cyan/20 bg-command-panel2/90 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-command-gold">Daily WhatsApp command screen</p>
            <h1 className="mt-1 text-2xl font-semibold text-command-text">LIMM WhatsApp Inbox</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {counterItems.map((item) => (
              <div key={item.label} className="rounded-2xl border border-command-line bg-command-bg/65 px-3 py-2">
                <p className={`text-lg font-semibold ${item.tone}`}>{item.value}</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-command-muted">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
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
                <h2 className="mt-1 text-2xl font-semibold text-command-text">Queue</h2>
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
            <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-command-line bg-command-bg/55 px-3 py-2 text-xs font-semibold text-command-muted">
              <span>Show internal/test leads{hiddenInternalCount ? ` (${hiddenInternalCount} hidden)` : ""}</span>
              <input
                type="checkbox"
                checked={showInternalTestLeads}
                onChange={(event) => setShowInternalTestLeads(event.target.checked)}
                className="h-4 w-4 accent-command-gold"
              />
            </label>
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
            {filteredConversations.map((item) => (
              <ChatRow
                key={item.id}
                chat={item}
                active={item.id === activeLeadId}
                onSelect={selectConversation}
              />
            ))}
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
                {!contextOpen ? (
                  <button
                    type="button"
                    onClick={() => setContextOpen(true)}
                    className="rounded-full border border-command-gold/60 bg-command-gold/10 px-3 py-1.5 text-command-gold"
                  >
                    Open context
                  </button>
                ) : null}
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
          {conversationLoading ? (
            <div className="border-b border-command-line bg-command-cyan/10 px-5 py-3 text-sm text-command-cyan">
              Loading selected conversation...
            </div>
          ) : null}

          <div ref={messagePaneRef} onScroll={handleMessagePaneScroll} className="flex-1 overflow-y-auto px-5 py-6">
            {activeMessages.length ? (
              <div className="space-y-4">
                {activeOlderState.hasOlder ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={loadEarlierMessages}
                      disabled={loadingOlder}
                      className="rounded-full border border-command-line bg-command-panel2 px-4 py-2 text-sm font-semibold text-command-muted transition hover:border-command-gold/60 disabled:cursor-wait disabled:opacity-60"
                    >
                      {loadingOlder ? "Loading earlier messages..." : "Load earlier messages"}
                    </button>
                  </div>
                ) : null}
                {activeMessages.map((message) => (
                  <MessageBubble
                    key={`${message.id}-${message.providerMessageId || messageClientTempId(message)}`}
                    message={message}
                    onRetry={handleRetryDraft}
                  />
                ))}
                <div ref={bottomRef} />
              </div>
            ) : (
              <div className="rounded-2xl border border-command-line bg-command-panel2/80 p-5 text-sm text-command-muted">
                No WhatsApp messages saved for this lead yet.
              </div>
            )}
          </div>

          <ReplyComposer
            conversation={activeConversation}
            draftSeed={draftSeeds[activeConversation.lead.id]}
            sendingState={sendingByLeadId[activeConversation.lead.id]}
            sendError={errorByLeadId[activeConversation.lead.id]}
            onDraftSeedConsumed={consumeDraftSeed}
            onSendStarted={handleSendStarted}
            onSendFinished={handleSendFinished}
            onOptimisticReply={handleOptimisticReply}
            onSendSettled={handleSendSettled}
          />
        </main>

        {contextOpen ? (
          <LeadContextPanel
            conversation={activeConversation}
            activeMessages={activeMessages}
            onClose={() => setContextOpen(false)}
          />
        ) : null}
      </div>
    </section>
  );
}
