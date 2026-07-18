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
  reclassifyWhatsAppConversationAction,
  resumeBotForLeadAction,
  updateLeadStatusAction
} from "@/lib/actions";
import { getInboxQueueState, inboxQueuePriority, type InboxPrimaryStatus } from "@/lib/inbox-queue";
import { collapseHistoricalDuplicateAiMessages } from "@/lib/inbox-message-display";
import type { Lead, LeadMessage } from "@/lib/types";
import { isSilentCaptureMessage, latestSilentCapture, silentCaptureSummary } from "@/lib/whatsapp-silent-capture";

export type MultiChatSummary = {
  id: string;
  displayName: string;
  phone: string;
  status: string;
  conversationIntent: NonNullable<Lead["conversationIntent"]>;
  conversationRoute: NonNullable<Lead["conversationRoute"]>;
  intentClassified: boolean;
  leadEligible: boolean;
  intentConfidence: number;
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
  conversationIntent: NonNullable<Lead["conversationIntent"]>;
  conversationRoute: NonNullable<Lead["conversationRoute"]>;
  intentClassified: boolean;
  leadEligible: boolean;
  intentConfidence: number;
  propertyType: string;
  scopeSummary: string;
  budgetExpectation: string;
  floorPlanStatus: string;
  sitePhotosStatus: string;
  referenceImagesStatus: string;
  appointmentPreference: string;
  addressOrArea: string;
  postalCode: string;
  locationStatus: string;
  infoCompletenessScore: number;
  missingFields: string[];
  conflictFields: string[];
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
    label: "Ask property type",
    text: "Thanks for reaching out. May I know what type of property this is?"
  },
  {
    label: "Ask floor plan/photos",
    text: "You may send us your floor plan, site photos, and any reference images here. We will review from there."
  },
  {
    label: "Ask scope",
    text: "Could you share the main areas you are planning to renovate and what you would like to change?"
  },
  {
    label: "Ask appointment",
    text: "We can help check a suitable time for an initial discussion. Could you share your preferred day and timing?"
  },
  {
    label: "Instagram portfolio",
    text: "You can view some of our past works here: https://www.instagram.com/limmworks/"
  },
  {
    label: "Acknowledge & review",
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

function statusTone(message: LeadMessage) {
  const status = messageStatus(message);
  if (status === "Failed") return "border-command-red/45 bg-command-red/10 text-command-red";
  if (status === "Sending") return "border-command-amber/45 bg-command-amber/10 text-command-amber";
  if (message.direction === "internal") return "border-command-line bg-command-bg/60 text-command-muted";
  if (message.direction === "inbound") return "border-command-cyan/35 bg-command-cyan/10 text-command-cyan";
  return "border-command-green/45 bg-command-green/10 text-command-green";
}

function senderLabel(message: LeadMessage) {
  if (message.direction === "inbound") return "Client";
  if (isSilentCaptureMessage(message)) return "AI note";
  if (message.direction === "internal") return "Internal";
  if (message.metadata?.manualReply) return "Marcus";
  return "AI";
}

function bubbleTone(message: LeadMessage) {
  if (message.direction === "inbound") return "rounded-bl-md border-command-line bg-command-panel2/95 text-command-text";
  if (message.direction === "internal") return "border-command-line bg-command-bg/70 text-command-muted";
  if (message.metadata?.manualReply) return "rounded-br-md border-command-green/35 bg-command-green/12 text-command-text";
  return "rounded-br-md border-command-cyan/35 bg-command-cyan/10 text-command-text";
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

function chatAccentTone(chat: MultiChatSummary) {
  const label = chatStatusLabel(chat);
  if (label === "Failed send") return "border-l-command-red";
  if (label === "Waiting for Marcus") return "border-l-command-gold";
  if (label === "Waiting for client") return "border-l-command-muted";
  if (label === "Human takeover") return "border-l-command-bronze";
  return "border-l-command-cyan";
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

function sortMessagesNewestFirst(messages: LeadMessage[]) {
  return [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
      className={`block w-full rounded-xl border border-l-4 p-3.5 text-left transition hover:border-command-cyan/50 ${chatAccentTone(chat)} ${
        active
          ? "border-command-gold/70 bg-command-gold/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-command-line bg-command-bg/50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-command-text">{chat.displayName || chat.phone}</p>
          <p className="mt-1 text-xs text-command-muted">{chat.phone || "Phone pending"}</p>
        </div>
        {chat.unreadCount > 0 ? (
          <span className="rounded-full bg-command-gold px-2 py-0.5 text-xs font-bold text-black">{chat.unreadCount}</span>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-5 text-command-muted">{cleanPreview(chat.lastMessagePreview)}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${chatStatusTone(chat)}`}>
            {chatStatusLabel(chat)}
          </span>
          {!chat.intentClassified ? (
            <span className="rounded-full border border-command-amber/40 bg-command-amber/10 px-2 py-0.5 text-[10px] font-semibold text-command-amber">
              Legacy · unclassified
            </span>
          ) : !chat.leadEligible ? (
            <span className="rounded-full border border-command-cyan/40 bg-command-cyan/10 px-2 py-0.5 text-[10px] font-semibold text-command-cyan">
              {humanize(chat.conversationIntent)}
            </span>
          ) : null}
        </div>
        {chat.floorPlanReceived || chat.sitePhotosReceived ? (
          <span className="rounded-full border border-command-green/35 bg-command-green/10 px-2 py-0.5 text-[10px] text-command-green">
            Files
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
  const silentCapture = isSilentCaptureMessage(message) ? silentCaptureSummary(message) : null;
  const error = metadataString(message, "error");
  const showFailure = messageStatus(message) === "Failed" && !isNextRedirectOnly(error);
  const collapsedDuplicateCount = typeof message.metadata?.uiCollapsedDuplicateCount === "number"
    ? message.metadata.uiCollapsedDuplicateCount
    : 1;
  return (
    <article className={`flex ${internal ? "justify-center" : outbound ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[86%] rounded-2xl border px-3.5 py-2.5 text-sm leading-6 shadow-sm md:max-w-[68%] ${internal ? "text-center text-sm" : ""} ${bubbleTone(message)}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 text-[10px]">
          <span className="font-semibold uppercase tracking-[0.14em] text-command-muted">{senderLabel(message)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(message)}`}>
            {messageStatus(message)}
          </span>
        </div>
        {silentCapture ? (
          <div className="mt-2 rounded-xl border border-command-line bg-command-panel2/70 p-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-command-cyan">{silentCapture.title}</p>
            <p className="mt-2 text-sm leading-6 text-command-text">{silentCapture.fieldSummary}</p>
            <p className="mt-1 text-xs leading-5 text-command-muted">Next action: {silentCapture.nextAction}</p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-command-subtle">Internal only - not sent to client</p>
          </div>
        ) : (
          <p className="mt-1.5 whitespace-pre-wrap break-words">{message.body || "Message body not available."}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[11px] text-command-muted">
          <time dateTime={message.createdAt}>{formatTimestamp(message.createdAt)}</time>
          {message.metadata?.manualReply ? <span>Manual reply</span> : outbound ? <span>AI/system reply</span> : null}
        </div>
        {collapsedDuplicateCount > 1 ? (
          <div className="mt-2 rounded-lg border border-command-amber/35 bg-command-amber/10 px-2.5 py-1.5 text-xs leading-5 text-command-amber">
            Historical duplicate ×{collapsedDuplicateCount}. Identical AI sends are collapsed here; raw Meta IDs remain in Delivery Details.
          </div>
        ) : null}
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
  const salesDraftingEnabled = conversation.context.intentClassified && conversation.context.leadEligible;

  useEffect(() => {
    setAiDraft("");
  }, [leadId, salesDraftingEnabled]);

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
    <div className="border-b border-command-line bg-command-panel/95 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.18)] backdrop-blur">
      {salesDraftingEnabled ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {quickReplies.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => insertQuickReply(item.text)}
                className="rounded-full border border-command-line bg-command-bg/70 px-3 py-1.5 text-xs font-semibold text-command-muted transition hover:border-command-gold/60 hover:bg-command-gold/10 hover:text-command-text"
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-command-cyan/20 bg-command-bg/55 px-3 py-2">
            <p className="text-xs leading-5 text-command-muted">Draft only. Marcus must review, edit, and send manually.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAiDraft(buildAiDraft(conversation))}
                className="rounded-full border border-command-cyan/40 bg-command-cyan/10 px-3 py-1.5 text-xs font-semibold text-command-cyan transition hover:bg-command-cyan/15"
              >
                Generate AI Draft
              </button>
              {aiDraft ? (
                <button
                  type="button"
                  onClick={() => setReply(aiDraft)}
                  className="rounded-full border border-command-gold/60 bg-command-gold/12 px-3 py-1.5 text-xs font-semibold text-command-gold transition hover:bg-command-gold/18"
                >
                  Use draft
                </button>
              ) : null}
            </div>
          </div>
          {aiDraft ? <p className="mb-3 max-h-24 overflow-y-auto rounded-xl border border-command-line bg-command-bg/55 p-3 text-sm leading-6 text-command-muted">{aiDraft}</p> : null}
        </>
      ) : (
        <div className="mb-3 rounded-xl border border-command-cyan/25 bg-command-cyan/5 px-3 py-2 text-xs leading-5 text-command-muted">
          {conversation.context.intentClassified
            ? "Non-sales route. Sales quick replies and AI drafting are disabled; operators can still write a manual reply when needed."
            : "Legacy conversation awaiting intent classification. Sales quick replies and AI drafting are disabled; operators can still write a manual reply."}
        </div>
      )}
      <form ref={formRef} onSubmit={handleSubmit}>
        <label htmlFor="manual_reply_body" className="sr-only">Type WhatsApp reply</label>
        <div className="flex gap-3">
          <textarea
            id="manual_reply_body"
            name="manual_reply_body"
            rows={4}
            required
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type WhatsApp reply..."
            className="max-h-52 min-h-[88px] flex-1 resize-y rounded-2xl border border-command-line bg-command-bg/90 px-4 py-3 text-base leading-7 text-command-text outline-none transition placeholder:text-command-muted focus:border-command-gold/70"
          />
          <div className="flex min-w-28 flex-col justify-between gap-3">
            <button
              type="submit"
              disabled={!canSend}
              title={!reply.trim() ? "Type a WhatsApp reply before sending." : isSending ? "Sending WhatsApp reply now." : "Send WhatsApp reply"}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black transition hover:bg-command-goldHover disabled:cursor-not-allowed disabled:border-command-line disabled:bg-command-panel2 disabled:text-command-muted"
            >
              {isSending ? "Sending..." : "Send"}
            </button>
            <p className="text-[11px] leading-5 text-command-muted">
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
  const salesContextAvailable = context.intentClassified && context.leadEligible;
  const recentSilentCapture = latestSilentCapture(activeMessages);
  const recentSilentCaptureSummary = recentSilentCapture ? silentCaptureSummary(recentSilentCapture) : null;

  useEffect(() => {
    setShowDeliveryDetails(false);
    setShowTechnicalAudit(false);
  }, [conversation.lead.id]);

  return (
    <aside className="border-t border-command-line bg-command-panel2/95 xl:border-l xl:border-t-0">
      <div className="flex items-center justify-between border-b border-command-line px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-gold">Conversation Context</p>
          <p className="mt-1 text-base font-semibold text-command-text">{!context.intentClassified ? "Classification pending" : context.leadEligible ? "Sales details" : "Non-sales routing"}</p>
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
        <div className="rounded-2xl border border-command-line bg-command-bg/65 p-4">
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
          {!context.intentClassified ? (
            <form action={reclassifyWhatsAppConversationAction} className="mt-4 border-t border-command-line pt-3">
              <input type="hidden" name="lead_id" value={conversation.lead.id} />
              <button type="submit" className="w-full rounded-lg border border-command-amber/45 bg-command-amber/10 px-3 py-2 text-sm font-semibold text-command-amber transition hover:bg-command-amber/15">
                Classify from conversation history
              </button>
            </form>
          ) : null}
        </div>

        <div className="mt-4 rounded-2xl border border-command-gold/35 bg-command-gold/10 p-4">
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
            </form></> : null}
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
  const firstVisibleConversation = conversations[0];
  const initialLeadId = selectedLeadId && conversations.some((item) => item.lead.id === selectedLeadId)
    ? selectedLeadId
    : firstVisibleConversation?.lead.id ?? "";
  const initialSelectedLeadIdRef = useRef(initialLeadId);
  const [conversationMap, setConversationMap] = useState<Record<string, MultiChatConversation>>(() => Object.fromEntries(
    conversations.map((conversation) => [conversation.lead.id, conversation])
  ));
  const [chatSummaries, setChatSummaries] = useState<MultiChatSummary[]>(() => conversations.map((conversation) => conversation.summary));
  const [conversationCache, setConversationCache] = useState<Record<string, { fetchedAt: string }>>(() => initialLeadId
    ? { [initialLeadId]: { fetchedAt: new Date().toISOString() } }
    : {});
  const [activeLeadId, setActiveLeadId] = useState(() => initialSelectedLeadIdRef.current);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
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
  const stickToLatestRef = useRef(true);
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

  const activeLeadStillListed = activeLeadId ? chatSummaries.some((summary) => summary.id === activeLeadId) : false;
  const activeConversation = activeLeadStillListed ? conversationMap[activeLeadId] : undefined;
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
  const activeMessagesNewestFirst = useMemo(
    () => sortMessagesNewestFirst(collapseHistoricalDuplicateAiMessages(activeMessages)),
    [activeMessages]
  );
  const latestVisibleMessageId = activeMessagesNewestFirst[0]?.id ?? "";
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
    if (stickToLatestRef.current) messagePaneRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeLeadId, latestVisibleMessageId]);

  const handleMessagePaneScroll = () => {
    const pane = messagePaneRef.current;
    if (!pane) return;
    stickToLatestRef.current = pane.scrollTop < 160;
  };

  const visibleChatSummaries = useMemo(
    () => sortQueue(chatSummaries),
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
    stickToLatestRef.current = true;
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
        <h1 className="mt-2 text-3xl font-semibold text-command-text">
          {activeLeadId ? "Conversation unavailable." : "No active conversations yet."}
        </h1>
        <p className="mt-3 text-command-muted">
          {activeLeadId
            ? "The selected conversation is no longer in the active inbox. Choose another chat from the queue when ready."
            : "New WhatsApp leads will appear here once inbound messages are saved."}
        </p>
      </section>
    );
  }

  const chat = activeConversation.summary;
  const conversationLoading = loadingConversationId === activeConversation.lead.id;
  const counterItems = [
    { label: "Waiting", value: queueCounters.waitingForMarcus, tone: "text-command-gold" },
    { label: "New", value: queueCounters.newLeads, tone: "text-command-cyan" },
    { label: "Bot Active", value: queueCounters.botActive, tone: "text-command-green" },
    { label: "Human Takeover", value: queueCounters.humanTakeover, tone: "text-command-amber" },
    { label: "Failed", value: queueCounters.failedSends, tone: "text-command-red" }
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-command-line bg-command-panel shadow-premium">
      <div className="border-b border-command-line bg-command-panel2/90 px-5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-gold">Daily WhatsApp Sales Inbox</p>
            <h1 className="mt-1 text-2xl font-semibold text-command-text">LIMM WhatsApp Inbox</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {counterItems.map((item) => (
              <div key={item.label} className="min-w-20 rounded-xl border border-command-line bg-command-bg/65 px-3 py-2">
                <p className={`text-lg font-semibold leading-none ${item.tone}`}>{item.value}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-command-muted">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={`grid min-h-[calc(100vh-9rem)] grid-cols-1 ${
        contextOpen
          ? "xl:grid-cols-[20rem_minmax(0,1fr)_19rem] 2xl:grid-cols-[20rem_minmax(40rem,1fr)_20rem]"
          : "xl:grid-cols-[20rem_minmax(0,1fr)]"
      }`}>
        <aside className="border-b border-command-line bg-command-panel2/95 xl:border-b-0 xl:border-r">
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-gold">Queue</p>
                <h2 className="mt-1 text-xl font-semibold text-command-text">Conversations</h2>
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
              className="mt-4 w-full rounded-xl border border-command-line bg-command-bg/85 px-3 py-2.5 text-sm text-command-text outline-none transition placeholder:text-command-muted focus:border-command-gold/70"
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

        <main className="flex min-h-[calc(100vh-9rem)] flex-col bg-[radial-gradient(circle_at_top_left,rgba(214,168,79,0.08),transparent_28%),linear-gradient(180deg,rgba(9,13,18,0.98),rgba(5,7,10,0.99))]">
          <header className="border-b border-command-line bg-command-panel/95 px-5 py-3.5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-gold">Active WhatsApp Chat</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold text-command-text">{chat.displayName}</h2>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${chatStatusTone(chat)}`}>{chatStatusLabel(chat)}</span>
                  <span className="rounded-full border border-command-line bg-command-bg/70 px-2.5 py-1 text-[11px] font-semibold text-command-muted">
                    {activeConversation.lead.botPaused ? "Bot paused" : "Bot active"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-command-muted">{chat.phone}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <Link
                  href={`/leads/${activeConversation.lead.id}`}
                  className="rounded-full border border-command-line bg-command-bg/70 px-3 py-1.5 text-command-muted transition hover:border-command-gold/60 hover:text-command-text"
                >
                  View full lead
                </Link>
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

          <div ref={messagePaneRef} onScroll={handleMessagePaneScroll} className="flex-1 overflow-y-auto px-5 py-5">
            {activeMessagesNewestFirst.length ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-gold">Latest messages</p>
                    <p className="mt-1 text-sm text-command-muted">Newest first. Older messages continue below.</p>
                  </div>
                  <span className="rounded-full border border-command-line bg-command-panel2 px-3 py-1 text-xs font-semibold text-command-muted">
                    {activeMessagesNewestFirst.length} shown
                  </span>
                </div>
                {activeMessagesNewestFirst.map((message) => (
                  <MessageBubble
                    key={`${message.id}-${message.providerMessageId || messageClientTempId(message)}`}
                    message={message}
                    onRetry={handleRetryDraft}
                  />
                ))}
                {activeOlderState.hasOlder ? (
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={loadEarlierMessages}
                      disabled={loadingOlder}
                      title={loadingOlder ? "Loading older messages now." : "Load older WhatsApp messages for this lead."}
                      className="rounded-full border border-command-line bg-command-panel2 px-4 py-2 text-sm font-semibold text-command-muted transition hover:border-command-gold/60 disabled:cursor-wait disabled:opacity-60"
                    >
                      {loadingOlder ? "Loading older messages..." : "Load older messages"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-command-line bg-command-panel2/80 p-5 text-sm text-command-muted">
                No WhatsApp messages saved for this lead yet.
              </div>
            )}
          </div>
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
