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
  markInboxConversationsSpamAction,
  markInboxConversationSpamAction,
  markBossApprovalNeededAction,
  markLeadNotSuitableAction,
  moveLeadToQuotationReadinessAction,
  pauseBotForLeadAction,
  reclassifyWhatsAppConversationAction,
  restoreInboxConversationsAction,
  resumeBotForLeadAction,
  updateLeadStatusAction
} from "@/lib/actions";
import { InboxSpamDialog } from "@/components/inbox/InboxSpamDialog";
import { InboxOperatorBrief } from "@/components/inbox/InboxOperatorBrief";
import { sortInboxLatestFirst } from "@/lib/inbox-conversation-order";
import { getInboxQueueState, type InboxPrimaryStatus } from "@/lib/inbox-queue";
import { collapseHistoricalDuplicateAiMessages } from "@/lib/inbox-message-display";
import type { Lead, LeadMessage } from "@/lib/types";
import { isSilentCaptureMessage, latestSilentCapture, silentCaptureSummary } from "@/lib/whatsapp-silent-capture";
import {
  buildConversationBrief,
  getOperatorSlaState,
  INBOX_VIEW_FILTERS,
  parseSavedInboxViews,
  saveInboxView,
  type InboxViewFilter,
  type SavedInboxView
} from "@/lib/operator-advantage";
import { OPERATOR_COMMAND_EVENT, type OperatorCommand } from "@/lib/operator-commands";

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
  canManageSpam: boolean;
  selectedLeadId?: string;
  initialFilter?: InboxViewFilter;
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

const filters = INBOX_VIEW_FILTERS;

const INBOX_FILTER_STORAGE_KEY = "limm-inbox-filter-v10.4";
const INBOX_SAVED_VIEWS_STORAGE_KEY = "limm-inbox-saved-views-v10.6";

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

function sortQueue(chats: MultiChatSummary[]) {
  return sortInboxLatestFirst(chats);
}

function withoutRecordKeys<T>(record: Record<string, T>, keys: Set<string>) {
  if (!keys.size) return record;
  const next = { ...record };
  for (const key of keys) delete next[key];
  return next;
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
  if (message.metadata?.manualReply) return "rounded-br-md border-command-green/35 bg-command-green/10 text-command-text";
  return "rounded-br-md border-command-cyan/35 bg-command-cyan/10 text-command-text";
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

function chatStatusDotTone(chat: MultiChatSummary) {
  const label = chatStatusLabel(chat);
  if (label === "Failed send") return "bg-command-red";
  if (label === "Waiting for Marcus") return "bg-command-gold";
  if (label === "Waiting for client") return "bg-command-amber";
  if (label === "Closed / Done") return "bg-command-subtle";
  return "bg-command-green";
}

function slaTextTone(status: ReturnType<typeof getOperatorSlaState>["status"]) {
  if (status === "breached") return "text-command-red";
  if (status === "due") return "text-command-amber";
  if (status === "on-track") return "text-command-green";
  return "text-command-subtle";
}

function chatInitials(chat: MultiChatSummary) {
  const source = (chat.displayName || chat.phone || "Client").trim();
  const words = source.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "C";
}

function formatQueueTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-SG", {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "2-digit"
  });
}

function formatQueueSyncLabel(lastSyncAt: number | null, clock: number | null, status: "live" | "recovering") {
  if (status === "recovering") return "Reconnecting · queue remains usable";
  if (!lastSyncAt || !clock) return "Server snapshot · newest activity first";
  const seconds = Math.max(0, Math.floor((clock - lastSyncAt) / 1000));
  if (seconds < 10) return "Live · synced just now";
  if (seconds < 60) return `Live · synced ${seconds}s ago`;
  return `Live · synced ${Math.floor(seconds / 60)}m ago`;
}

function matchesFilter(chat: MultiChatSummary, filter: InboxViewFilter, clock: number | null) {
  if (filter === "All") return true;
  if (filter === "Unread") return chat.unreadCount > 0;
  if (filter === "Response overdue") return clock !== null && getOperatorSlaState(chat, clock).status === "breached";
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
  canManageSpam,
  selected,
  selectionMode,
  spamPending,
  clock,
  onSelect,
  onToggleSelected,
  onMarkSpam
}: {
  chat: MultiChatSummary;
  active: boolean;
  canManageSpam: boolean;
  selected: boolean;
  selectionMode: boolean;
  spamPending: boolean;
  clock: number | null;
  onSelect: (leadId: string) => void;
  onToggleSelected: (leadId: string) => void;
  onMarkSpam: (chat: MultiChatSummary) => void;
}) {
  const sla = getOperatorSlaState(chat, clock ?? 0);
  return (
    <div
      data-testid="inbox-chat-row"
      data-last-activity-at={chat.lastActivityAt}
      data-active={active ? "true" : "false"}
      className={`group relative border-b border-command-line/60 transition ${
        selected
          ? "bg-command-red/10"
          : active
            ? "bg-command-gold/10 shadow-[inset_3px_0_0_#DDB35D]"
            : "bg-transparent hover:bg-white/[0.04]"
      }`}
    >
      <button
        type="button"
        onClick={() => selectionMode ? onToggleSelected(chat.id) : onSelect(chat.id)}
        aria-label={selectionMode ? `Select ${chat.displayName || chat.phone}` : `Open conversation with ${chat.displayName || chat.phone}`}
        aria-pressed={selectionMode ? selected : undefined}
        className={`flex min-h-[5.25rem] w-full items-start gap-3 px-3 py-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-command-gold ${canManageSpam && !selectionMode ? "pr-[3.75rem]" : ""}`}
      >
        {selectionMode ? (
          <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? "border-command-red bg-command-red text-white" : "border-command-line bg-command-bg text-transparent"}`} aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2.2">
              <path d="m4 10 4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-command-gold ring-1 ${active ? "bg-command-gold/10 ring-command-gold/35" : "bg-command-panel ring-command-line"}`} aria-hidden="true">
            {chatInitials(chat)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className="truncate text-[15px] font-semibold leading-5 tracking-[-0.01em] text-command-text">{chat.displayName || chat.phone}</span>
            <time className="shrink-0 text-[11px] text-command-subtle" dateTime={chat.lastActivityAt}>{formatQueueTimestamp(chat.lastActivityAt)}</time>
          </span>
          <span className="mt-0.5 block truncate text-[13px] leading-5 text-command-muted">{cleanPreview(chat.lastMessagePreview, 72)}</span>
          <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[10px] font-medium text-command-subtle">
            <span className={`h-2 w-2 shrink-0 rounded-full ${chatStatusDotTone(chat)}`} aria-hidden="true" />
            <span className="truncate">{chatStatusLabel(chat)}</span>
            {sla.status !== "inactive" ? <span className={`shrink-0 ${slaTextTone(sla.status)}`}>· {sla.label}</span> : null}
            {!chat.intentClassified ? <span className="truncate text-command-amber">· Unclassified</span> : null}
            {chat.floorPlanReceived || chat.sitePhotosReceived ? <span className="shrink-0 text-command-green">· Files</span> : null}
          </span>
        </span>
        {chat.unreadCount > 0 ? (
          <span className="mt-6 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-command-gold px-1.5 text-[10px] font-bold text-black">{chat.unreadCount}</span>
        ) : null}
      </button>
      {canManageSpam && !selectionMode ? (
        <button
          type="button"
          onClick={() => onMarkSpam(chat)}
          disabled={spamPending}
          data-testid="inbox-mark-spam"
          className="absolute bottom-2.5 right-2 inline-flex min-h-7 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-command-subtle opacity-80 transition hover:bg-command-red/10 hover:text-command-red group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-wait disabled:opacity-40"
          aria-label={`Remove ${chat.displayName || chat.phone} as spam`}
          title="Remove from inbox as spam"
        >
          {spamPending ? "Removing…" : (
            <>
              <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M3.5 5.5h13M8 3.5h4M6 5.5l.7 11h6.6l.7-11M8.5 8.5v5M11.5 8.5v5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Spam
            </>
          )}
        </button>
      ) : null}
    </div>
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
    <article data-message-direction={message.direction} className={`flex ${internal ? "justify-center" : outbound ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[90%] rounded-2xl border px-3.5 py-2.5 text-sm leading-6 shadow-[0_8px_24px_rgba(0,0,0,0.14)] sm:max-w-[82%] md:max-w-[72%] ${internal ? "text-center text-sm" : ""} ${bubbleTone(message)}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 text-[10px]">
          <span className="font-semibold uppercase tracking-[0.14em] text-command-muted">{senderLabel(message)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${statusTone(message)}`}>
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
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [draftToolsOpen, setDraftToolsOpen] = useState(false);
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
    <div data-testid="inbox-sticky-composer" className="shrink-0 border-t border-command-line bg-command-panel2/95 px-3 py-2.5 shadow-[0_-12px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl sm:px-4 sm:py-3">
      {salesDraftingEnabled ? (
        <>
          <div className="thin-scrollbar mb-2 flex items-center gap-1 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setQuickRepliesOpen((open) => !open)}
              aria-expanded={quickRepliesOpen}
              className={`inline-flex min-h-8 shrink-0 items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${quickRepliesOpen ? "bg-command-gold/15 text-command-gold" : "text-command-muted hover:bg-command-bg hover:text-command-text"}`}
            >
              Quick replies
            </button>
            <button
              type="button"
              onClick={() => setDraftToolsOpen((open) => !open)}
              aria-expanded={draftToolsOpen}
              className={`inline-flex min-h-8 shrink-0 items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${draftToolsOpen ? "bg-command-cyan/10 text-command-cyan" : "text-command-muted hover:bg-command-bg hover:text-command-text"}`}
            >
              AI draft
            </button>
            <span className="ml-auto hidden shrink-0 items-center gap-1.5 text-[10px] text-command-subtle md:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-command-green" aria-hidden="true" />
              Manual review required
            </span>
          </div>
          {quickRepliesOpen ? (
            <div className="thin-scrollbar mb-2 flex max-h-24 gap-2 overflow-x-auto overflow-y-hidden rounded-xl border border-command-line/60 bg-command-bg/55 p-2" data-testid="inbox-quick-replies">
              {quickReplies.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => insertQuickReply(item.text)}
                  className="shrink-0 rounded-full border border-command-line bg-command-panel2 px-3 py-1.5 text-xs font-semibold text-command-muted transition hover:border-command-gold/60 hover:text-command-text"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
          {draftToolsOpen ? (
            <div className="mb-2 rounded-xl border border-command-cyan/20 bg-command-cyan/5 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-command-muted">Draft only. Marcus reviews and sends manually.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAiDraft(buildAiDraft(conversation))}
                    className="rounded-lg border border-command-cyan/35 bg-command-cyan/10 px-3 py-1.5 text-xs font-semibold text-command-cyan transition hover:bg-command-cyan/15"
                  >
                    Generate AI Draft
                  </button>
                  {aiDraft ? (
                    <button
                      type="button"
                      onClick={() => setReply(aiDraft)}
                      className="rounded-lg border border-command-gold/45 bg-command-gold/10 px-3 py-1.5 text-xs font-semibold text-command-gold transition hover:bg-command-gold/15"
                    >
                      Use draft
                    </button>
                  ) : null}
                </div>
              </div>
              {aiDraft ? <p className="mt-2 max-h-24 overflow-y-auto rounded-lg bg-command-bg/60 p-2.5 text-sm leading-5 text-command-muted">{aiDraft}</p> : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-command-cyan/20 bg-command-cyan/5 px-3 py-2 text-[11px] leading-5 text-command-muted">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-command-cyan" aria-hidden="true" />
          {conversation.context.intentClassified
            ? "Non-sales route. Sales quick replies and AI drafting are disabled; operators can still write a manual reply when needed."
            : "Legacy conversation awaiting intent classification. Sales quick replies and AI drafting are disabled; operators can still write a manual reply."}
        </div>
      )}
      <form ref={formRef} onSubmit={handleSubmit}>
        <label htmlFor="manual_reply_body" className="sr-only">Type WhatsApp reply</label>
        <div className="flex items-end gap-2">
          <textarea
            id="manual_reply_body"
            name="manual_reply_body"
            rows={2}
            required
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            placeholder="Type a WhatsApp reply…"
            className="max-h-40 min-h-[54px] flex-1 resize-y rounded-2xl border border-command-line bg-command-bg/90 px-4 py-3 text-[15px] leading-6 text-command-text outline-none transition placeholder:text-command-subtle focus:border-command-gold/70 focus:ring-2 focus:ring-command-gold/10"
          />
          <button
            type="submit"
            disabled={!canSend}
            title={!reply.trim() ? "Type a WhatsApp reply before sending." : isSending ? "Sending WhatsApp reply now." : "Send WhatsApp reply"}
            className="inline-flex min-h-[54px] min-w-[82px] items-center justify-center gap-1.5 rounded-2xl border border-command-gold bg-command-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-command-goldHover disabled:cursor-not-allowed disabled:border-command-line disabled:bg-command-panel disabled:text-command-subtle"
          >
            {isSending ? "Sending…" : (
              <>
                Send
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="m4 10 11-6-3.2 12-2.2-4.2L4 10Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-[10px] text-command-subtle">
          <span className="hidden sm:inline">⌘/Ctrl + Enter to send · Esc to leave composer</span>
          <span className="sm:hidden">Review before sending</span>
          <span className="ml-auto tabular-nums">{reply.length}</span>
          {sendError ? <span className="text-right text-command-red" role="alert">{sendError}</span> : null}
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
    <aside className="flex h-full min-h-0 flex-col bg-command-panel2/95" data-testid="inbox-context-panel">
      <div className="flex shrink-0 items-center justify-between border-b border-command-line px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-gold">Conversation Context</p>
          <p className="mt-1 text-base font-semibold text-command-text">{!context.intentClassified ? "Classification pending" : context.leadEligible ? "Sales details" : "Non-sales routing"}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-command-muted transition hover:bg-command-bg hover:text-command-text"
          aria-label="Close conversation details"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
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
              <button className="w-full rounded-md border border-command-gold/60 bg-command-gold/10 px-3 py-2 font-semibold text-command-gold transition hover:bg-command-gold/20" type="submit">
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
                <button data-testid="inbox-automation-control" className="w-full rounded-md border border-command-green/45 bg-command-green/10 px-3 py-2 font-semibold text-command-green transition hover:bg-command-green/15" type="submit">
                  Resume bot
                </button>
              </form>
            ) : (
              <form action={pauseBotForLeadAction}>
                <input type="hidden" name="lead_id" value={conversation.lead.id} />
                <input type="hidden" name="reason" value="Paused from WhatsApp Sales Inbox." />
                <button data-testid="inbox-automation-control" className="w-full rounded-md border border-command-cyan/45 bg-command-cyan/10 px-3 py-2 font-semibold text-command-cyan transition hover:bg-command-cyan/15" type="submit">
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

export function MultiChatInbox({ conversations, canManageSpam, selectedLeadId, initialFilter, manualReplyStatus, manualReplyError }: MultiChatInboxProps) {
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
  const [filter, setFilter] = useState<InboxViewFilter>(initialFilter ?? "All");
  const [savedViews, setSavedViews] = useState<SavedInboxView[]>([]);
  const [clock, setClock] = useState<number | null>(null);
  const [queueSyncStatus, setQueueSyncStatus] = useState<"live" | "recovering">("live");
  const [lastQueueSyncAt, setLastQueueSyncAt] = useState<number | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"queue" | "chat">(selectedLeadId ? "chat" : "queue");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSpamLeadIds, setSelectedSpamLeadIds] = useState<string[]>([]);
  const [spamConfirmation, setSpamConfirmation] = useState<MultiChatSummary[]>([]);
  const [optimisticReplies, setOptimisticReplies] = useState<Record<string, LeadMessage[]>>({});
  const [sendingByLeadId, setSendingByLeadId] = useState<Record<string, SendState>>({});
  const [errorByLeadId, setErrorByLeadId] = useState<Record<string, string>>({});
  const [spamPendingLeadIds, setSpamPendingLeadIds] = useState<string[]>([]);
  const [spamNotice, setSpamNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [recentSpamRemoval, setRecentSpamRemoval] = useState<{
    summaries: MultiChatSummary[];
    conversations: MultiChatConversation[];
  } | null>(null);
  const [undoSpamPending, setUndoSpamPending] = useState(false);
  const [draftSeeds, setDraftSeeds] = useState<Record<string, { id: string; text: string }>>({});
  const [olderMessages, setOlderMessages] = useState<Record<string, LeadMessage[]>>({});
  const [olderState, setOlderState] = useState<Record<string, { hasOlder: boolean; cursor: string | null }>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingConversationId, setLoadingConversationId] = useState("");
  const messagePaneRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const detailsDrawerRef = useRef<HTMLDivElement>(null);
  const previousDrawerFocusRef = useRef<HTMLElement | null>(null);
  const filterPreferenceReadyRef = useRef(false);
  const savedViewsReadyRef = useRef(false);
  const stickToLatestRef = useRef(true);
  const conversationCacheRef = useRef(conversationCache);

  useEffect(() => {
    conversationCacheRef.current = conversationCache;
  }, [conversationCache]);

  useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter);
    } else {
      const savedFilter = window.localStorage.getItem(INBOX_FILTER_STORAGE_KEY);
      if (savedFilter && filters.includes(savedFilter as InboxViewFilter)) {
        setFilter(savedFilter as InboxViewFilter);
      }
    }
    setSavedViews(parseSavedInboxViews(window.localStorage.getItem(INBOX_SAVED_VIEWS_STORAGE_KEY)));
    const timer = window.setTimeout(() => {
      filterPreferenceReadyRef.current = true;
      savedViewsReadyRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialFilter]);

  useEffect(() => {
    if (!filterPreferenceReadyRef.current) return;
    window.localStorage.setItem(INBOX_FILTER_STORAGE_KEY, filter);
  }, [filter]);

  useEffect(() => {
    if (!savedViewsReadyRef.current) return;
    window.localStorage.setItem(INBOX_SAVED_VIEWS_STORAGE_KEY, JSON.stringify(savedViews));
  }, [savedViews]);

  useEffect(() => {
    const updateClock = () => setClock(Date.now());
    updateClock();
    const timer = window.setInterval(updateClock, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!contextOpen) return;
    previousDrawerFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = detailsDrawerRef.current;
    const detailsTrigger = detailsButtonRef.current;
    const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary";
    const focusables = () => Array.from(drawer?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    window.requestAnimationFrame(() => focusables()[0]?.focus());
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setContextOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const returnFocus = previousDrawerFocusRef.current?.isConnected
        ? previousDrawerFocusRef.current
        : detailsTrigger;
      window.requestAnimationFrame(() => returnFocus?.focus());
    };
  }, [contextOpen]);

  const patchSummary = useCallback((leadId: string, patch: Partial<MultiChatSummary>) => {
    setChatSummaries((current) => sortQueue(
      current.map((summary) => summary.id === leadId ? { ...summary, ...patch } : summary)
    ));
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
    let active = true;
    let inFlight = false;
    let controller: AbortController | null = null;
    const pollQueue = async () => {
      if (inFlight) return;
      inFlight = true;
      controller = new AbortController();
      try {
        const response = await fetch("/api/inbox/conversations", { cache: "no-store", signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (!data?.ok || !Array.isArray(data.conversations)) {
          setQueueSyncStatus("recovering");
          return;
        }
        const nextSummaries = data.conversations as MultiChatSummary[];
        setChatSummaries(nextSummaries);
        setConversationMap((current) => {
          const next = { ...current };
          for (const summary of nextSummaries) {
            if (next[summary.id]) next[summary.id] = { ...next[summary.id], summary };
          }
          return next;
        });
        setQueueSyncStatus("live");
        setLastQueueSyncAt(Date.now());
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) setQueueSyncStatus("recovering");
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(() => void pollQueue(), 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller?.abort();
    };
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
    responseOverdue: clock === null ? 0 : visibleChatSummaries.filter((chat) => getOperatorSlaState(chat, clock).status === "breached").length,
    newLeads: visibleChatSummaries.filter((chat) => chat.primaryStatus === "New lead").length,
    failedSends: visibleChatSummaries.filter((chat) => chat.primaryStatus === "Failed send").length
  }), [clock, visibleChatSummaries]);

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
      return matchesFilter(chat, filter, clock) && (!needle || haystack.includes(needle));
    }));
  }, [clock, deferredSearch, filter, visibleChatSummaries]);

  const saveCurrentView = useCallback(() => {
    setSavedViews((current) => saveInboxView(current, filter, search));
  }, [filter, search]);

  const applySavedView = useCallback((view: SavedInboxView) => {
    setFilter(view.filter);
    setSearch(view.search);
    setMobilePane("queue");
  }, []);

  const removeSavedView = useCallback((viewId: string) => {
    setSavedViews((current) => current.filter((view) => view.id !== viewId));
  }, []);

  const selectedVisibleCount = filteredConversations.filter((chat) => selectedSpamLeadIds.includes(chat.id)).length;
  const allVisibleSelected = filteredConversations.length > 0 && selectedVisibleCount === filteredConversations.length;
  const toggleSelectAllVisible = useCallback(() => {
    const visibleIds = filteredConversations.map((chat) => chat.id);
    setSelectedSpamLeadIds((current) => {
      if (visibleIds.length && visibleIds.every((leadId) => current.includes(leadId))) {
        return current.filter((leadId) => !visibleIds.includes(leadId));
      }
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }, [filteredConversations]);

  const waitingChats = useMemo(
    () => visibleChatSummaries.filter((summary) => summary.primaryStatus === "Failed send" || summary.primaryStatus === "Waiting for Marcus"),
    [visibleChatSummaries]
  );

  const selectConversation = useCallback((leadId: string) => {
    setActiveLeadId(leadId);
    setMobilePane("chat");
    stickToLatestRef.current = true;
    if (typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href);
      nextUrl.pathname = "/inbox";
      nextUrl.searchParams.set("lead", leadId);
      window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}`);
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

  const markConversationSpam = useCallback((chatToRemove: MultiChatSummary) => {
    if (!canManageSpam || spamPendingLeadIds.length) return;
    setSpamConfirmation([chatToRemove]);
  }, [canManageSpam, spamPendingLeadIds.length]);

  const toggleSpamSelection = useCallback((leadId: string) => {
    setSelectedSpamLeadIds((current) => current.includes(leadId)
      ? current.filter((id) => id !== leadId)
      : [...current, leadId]
    );
  }, []);

  const cancelSpamSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedSpamLeadIds([]);
  }, []);

  const requestBulkSpamRemoval = useCallback(() => {
    if (!canManageSpam || !selectedSpamLeadIds.length || spamPendingLeadIds.length) return;
    const selected = visibleChatSummaries.filter((chat) => selectedSpamLeadIds.includes(chat.id));
    if (selected.length) setSpamConfirmation(selected);
  }, [canManageSpam, selectedSpamLeadIds, spamPendingLeadIds.length, visibleChatSummaries]);

  const cancelSpamConfirmation = useCallback(() => {
    if (!spamPendingLeadIds.length) setSpamConfirmation([]);
  }, [spamPendingLeadIds.length]);

  const removeConversationsLocally = useCallback((removedLeadIds: string[]) => {
    const removed = new Set(removedLeadIds);
    if (!removed.size) return;
    const ordered = sortQueue(chatSummaries);
    const removedIndex = ordered.findIndex((summary) => removed.has(summary.id));
    const remaining = ordered.filter((summary) => !removed.has(summary.id));
    setChatSummaries(remaining);
    setConversationMap((current) => withoutRecordKeys(current, removed));
    setConversationCache((current) => withoutRecordKeys(current, removed));
    setOptimisticReplies((current) => withoutRecordKeys(current, removed));
    setSendingByLeadId((current) => withoutRecordKeys(current, removed));
    setErrorByLeadId((current) => withoutRecordKeys(current, removed));
    setDraftSeeds((current) => withoutRecordKeys(current, removed));
    setOlderMessages((current) => withoutRecordKeys(current, removed));
    setOlderState((current) => withoutRecordKeys(current, removed));
    setSelectedSpamLeadIds((current) => current.filter((leadId) => !removed.has(leadId)));

    if (removed.has(activeLeadId)) {
      const nextIndex = Math.max(0, Math.min(removedIndex, remaining.length - 1));
      const nextLeadId = remaining[nextIndex]?.id ?? "";
      setActiveLeadId(nextLeadId);
      setMobilePane(nextLeadId ? "chat" : "queue");
      stickToLatestRef.current = true;
      const nextUrl = new URL(window.location.href);
      nextUrl.pathname = "/inbox";
      if (nextLeadId) nextUrl.searchParams.set("lead", nextLeadId);
      else nextUrl.searchParams.delete("lead");
      window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}`);
      if (nextLeadId && !conversationCacheRef.current[nextLeadId]) void loadConversation(nextLeadId);
    }
  }, [activeLeadId, chatSummaries, loadConversation]);

  const restoreConversationsLocally = useCallback((
    summaries: MultiChatSummary[],
    restoredConversations: MultiChatConversation[]
  ) => {
    if (!summaries.length) return;
    const restoredIds = new Set(summaries.map((summary) => summary.id));
    setChatSummaries((current) => sortQueue([
      ...summaries,
      ...current.filter((summary) => !restoredIds.has(summary.id))
    ]));
    if (restoredConversations.length) {
      setConversationMap((current) => ({
        ...current,
        ...Object.fromEntries(restoredConversations.map((conversation) => [conversation.lead.id, conversation]))
      }));
      const fetchedAt = new Date().toISOString();
      setConversationCache((current) => ({
        ...current,
        ...Object.fromEntries(restoredConversations.map((conversation) => [conversation.lead.id, { fetchedAt }]))
      }));
    }
  }, []);

  const confirmSpamRemoval = useCallback(async () => {
    const targets = spamConfirmation;
    if (!canManageSpam || !targets.length || spamPendingLeadIds.length) return;
    const leadIds = targets.map((chatToRemove) => chatToRemove.id);
    const targetConversations = targets.flatMap((target) => conversationMap[target.id] ? [conversationMap[target.id]] : []);
    setSpamPendingLeadIds(leadIds);
    setSpamNotice(null);
    setRecentSpamRemoval(null);
    try {
      let removedLeadIds: string[] = [];
      let failedLeadIds: string[] = [];
      if (leadIds.length === 1) {
        const result = await markInboxConversationSpamAction(leadIds[0]);
        if (result.ok) removedLeadIds = [result.leadId];
        else failedLeadIds = leadIds;
        if (!result.ok && result.code === "permission_denied") {
          throw new Error("Boss or admin permission is required.");
        }
      } else {
        const result = await markInboxConversationsSpamAction(leadIds);
        removedLeadIds = [...result.removedLeadIds];
        failedLeadIds = [...result.failedLeadIds];
        if (result.code === "permission_denied") {
          throw new Error("Boss or admin permission is required.");
        }
      }

      removeConversationsLocally(removedLeadIds);
      if (!removedLeadIds.length) throw new Error("The spam action could not be completed.");
      const removedSet = new Set(removedLeadIds);
      setRecentSpamRemoval({
        summaries: targets.filter((target) => removedSet.has(target.id)),
        conversations: targetConversations.filter((conversation) => removedSet.has(conversation.lead.id))
      });
      if (failedLeadIds.length) {
        setSpamNotice({
          tone: "error",
          message: `${removedLeadIds.length} removed as spam; ${failedLeadIds.length} could not be removed. Undo here, or recover later from Leads → Show Spam.`
        });
      } else {
        const label = targets[0]?.displayName || targets[0]?.phone || "Conversation";
        setSpamNotice({
          tone: "success",
          message: leadIds.length === 1
            ? `${label} was removed from the inbox as spam. Undo here; it remains recoverable from Leads → Show Spam.`
            : `${leadIds.length} conversations were removed from the inbox as spam. Undo here; they remain recoverable from Leads → Show Spam.`
        });
        cancelSpamSelection();
      }
    } catch (error) {
      setSpamNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "The spam action could not be completed."
      });
    } finally {
      setSpamPendingLeadIds([]);
      setSpamConfirmation([]);
    }
  }, [cancelSpamSelection, canManageSpam, conversationMap, removeConversationsLocally, spamConfirmation, spamPendingLeadIds.length]);

  const undoSpamRemoval = useCallback(async () => {
    const snapshot = recentSpamRemoval;
    if (!canManageSpam || !snapshot?.summaries.length || undoSpamPending) return;
    const leadIds = snapshot.summaries.map((summary) => summary.id);
    setUndoSpamPending(true);
    try {
      const result = await restoreInboxConversationsAction(leadIds);
      if (result.code === "permission_denied") throw new Error("Boss or admin permission is required.");
      const restoredSet = new Set(result.restoredLeadIds);
      const restoredSummaries = snapshot.summaries.filter((summary) => restoredSet.has(summary.id));
      const restoredConversations = snapshot.conversations.filter((conversation) => restoredSet.has(conversation.lead.id));
      restoreConversationsLocally(restoredSummaries, restoredConversations);
      if (!restoredSummaries.length) throw new Error("The spam removal could not be undone.");
      const remainingSummaries = snapshot.summaries.filter((summary) => !restoredSet.has(summary.id));
      const remainingIds = new Set(remainingSummaries.map((summary) => summary.id));
      setRecentSpamRemoval(remainingSummaries.length ? {
        summaries: remainingSummaries,
        conversations: snapshot.conversations.filter((conversation) => remainingIds.has(conversation.lead.id))
      } : null);
      setSpamNotice({
        tone: result.failedLeadIds.length ? "error" : "success",
        message: result.failedLeadIds.length
          ? `${restoredSummaries.length} restored; ${result.failedLeadIds.length} still need attention.`
          : `${restoredSummaries.length === 1 ? "Conversation" : `${restoredSummaries.length} conversations`} restored to the inbox.`
      });
    } catch (error) {
      setSpamNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "The spam removal could not be undone."
      });
    } finally {
      setUndoSpamPending(false);
    }
  }, [canManageSpam, recentSpamRemoval, restoreConversationsLocally, undoSpamPending]);

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

  const nextWaitingChat = useCallback(() => {
    if (!waitingChats.length) return;
    const activeIndex = waitingChats.findIndex((item) => item.id === activeLeadId);
    const next = waitingChats[(activeIndex + 1 + waitingChats.length) % waitingChats.length];
    selectConversation(next.id);
  }, [activeLeadId, selectConversation, waitingChats]);

  useEffect(() => {
    const handleOperatorCommand = (event: Event) => {
      const command = (event as CustomEvent<{ command?: OperatorCommand }>).detail?.command;
      if (!command) return;
      if (command === "focus_inbox_reply") {
        setMobilePane("chat");
        window.requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("#manual_reply_body")?.focus());
        return;
      }
      if (command === "open_inbox_details") {
        setContextOpen(true);
        return;
      }
      if (command === "next_waiting_chat") {
        nextWaitingChat();
        return;
      }
      if (command === "review_inbox_automation") {
        setContextOpen(true);
        window.setTimeout(() => document.querySelector<HTMLElement>('[data-testid="inbox-automation-control"]')?.focus(), 120);
        return;
      }
      if (command === "remove_inbox_spam" && canManageSpam && activeConversation) {
        markConversationSpam(activeConversation.summary);
        return;
      }
      if (command === "open_active_lead" && activeLeadId) {
        window.location.assign(`/leads/${encodeURIComponent(activeLeadId)}`);
      }
    };
    window.addEventListener(OPERATOR_COMMAND_EVENT, handleOperatorCommand);
    return () => window.removeEventListener(OPERATOR_COMMAND_EVENT, handleOperatorCommand);
  }, [activeConversation, activeLeadId, canManageSpam, markConversationSpam, nextWaitingChat]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (contextOpen || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      const typing = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable);
      const key = event.key.toLowerCase();

      if (typing) return;
      if (key === "escape") {
        if (selectionMode) cancelSpamSelection();
        else if (mobilePane === "chat") setMobilePane("queue");
        return;
      }
      if (key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (key === "r") {
        event.preventDefault();
        document.querySelector<HTMLTextAreaElement>("#manual_reply_body")?.focus();
        return;
      }
      if (key === "d") {
        event.preventDefault();
        setContextOpen(true);
        return;
      }
      if (key === "n") {
        event.preventDefault();
        nextWaitingChat();
        return;
      }
      if ((key === "j" || key === "k") && filteredConversations.length) {
        event.preventDefault();
        const currentIndex = filteredConversations.findIndex((item) => item.id === activeLeadId);
        const delta = key === "j" ? 1 : -1;
        const baseIndex = currentIndex < 0 ? 0 : currentIndex;
        const nextIndex = (baseIndex + delta + filteredConversations.length) % filteredConversations.length;
        selectConversation(filteredConversations[nextIndex].id);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [activeLeadId, cancelSpamSelection, contextOpen, filteredConversations, mobilePane, nextWaitingChat, selectConversation, selectionMode]);

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

  const operatorBrief = useMemo(() => activeConversation ? buildConversationBrief({
    lead: activeConversation.lead,
    context: activeConversation.context,
    messages: activeMessages
  }) : null, [activeConversation, activeMessages]);
  const activeSla = useMemo(
    () => activeConversation ? getOperatorSlaState(activeConversation.summary, clock ?? 0) : null,
    [activeConversation, clock]
  );

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
      <section className="mission-panel rounded-3xl shadow-premium">
        {spamNotice ? (
          <div role="status" className={`flex items-center justify-between gap-3 border-b px-5 py-3 text-sm ${spamNotice.tone === "success" ? "border-command-green/30 bg-command-green/10 text-command-green" : "border-command-red/30 bg-command-red/10 text-command-red"}`}>
            <span>{spamNotice.message}</span>
            <div className="flex shrink-0 items-center gap-3">
              {recentSpamRemoval?.summaries.length ? (
                <button type="button" onClick={() => void undoSpamRemoval()} disabled={undoSpamPending} data-testid="inbox-spam-undo" className="font-semibold underline underline-offset-2 disabled:cursor-wait disabled:opacity-60">
                  {undoSpamPending ? "Restoring…" : "Undo"}
                </button>
              ) : null}
              <button type="button" onClick={() => { setSpamNotice(null); setRecentSpamRemoval(null); }} className="font-semibold underline underline-offset-2">
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
        <div className="p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-gold">WhatsApp Sales Inbox</p>
          <h1 className="mt-2 text-3xl font-semibold text-command-text">
          {activeLeadId ? "Conversation unavailable." : "No active conversations yet."}
          </h1>
          <p className="mt-3 text-command-muted">
            {activeLeadId
              ? "The selected conversation is no longer in the active inbox. Refresh the queue or open another lead when ready."
              : "New WhatsApp leads will appear here once inbound messages are saved."}
          </p>
          <Link href="/leads" className="mt-5 inline-flex rounded-xl border border-command-line bg-command-bg/60 px-4 py-2 text-sm font-semibold text-command-muted transition hover:border-command-gold/60 hover:text-command-text">
            Open lead list
          </Link>
        </div>
      </section>
    );
  }

  const chat = activeConversation.summary;
  const conversationLoading = loadingConversationId === activeConversation.lead.id;
  const priorityCounters: Array<{
    label: string;
    shortLabel: string;
    value: number;
    tone: string;
    targetFilter: InboxViewFilter;
  }> = [
    { label: "Waiting", shortLabel: "Wait", value: queueCounters.waitingForMarcus, tone: "text-command-gold", targetFilter: "Waiting for Marcus" },
    { label: "Overdue", shortLabel: "Late", value: queueCounters.responseOverdue, tone: "text-command-red", targetFilter: "Response overdue" },
    { label: "New", shortLabel: "New", value: queueCounters.newLeads, tone: "text-command-cyan", targetFilter: "New leads" },
    { label: "Failed", shortLabel: "Fail", value: queueCounters.failedSends, tone: "text-command-red", targetFilter: "Failed send" }
  ];
  const currentViewId = `${filter.toLowerCase()}::${search.trim().replace(/\s+/g, " ").toLowerCase()}`;
  const canSaveCurrentView = (filter !== "All" || Boolean(search.trim())) && !savedViews.some((view) => view.id === currentViewId);
  const spamDialogLabel = spamConfirmation[0]?.displayName || spamConfirmation[0]?.phone || "this conversation";
  const automationStatusLabel = activeConversation.lead.botPaused ? "Bot paused" : "Bot active";
  const chatHeaderStatus = [
    chat.phone,
    chatStatusLabel(chat),
    automationStatusLabel === chatStatusLabel(chat) ? "" : automationStatusLabel
  ].filter(Boolean).join(" · ");

  return (
    <>
      <section className="inbox-product-frame flex flex-col overflow-hidden rounded-2xl border border-command-line bg-command-panel shadow-command">
        <div className={`${mobilePane === "chat" ? "hidden lg:flex" : "flex"} min-h-11 items-center justify-between gap-3 border-b border-command-line bg-command-panel2/90 px-3 py-1.5 sm:px-4`}>
          <div className="flex min-w-0 items-center gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-command-gold">Queue health</p>
              <p className={`hidden text-[10px] sm:block ${queueSyncStatus === "recovering" ? "text-command-amber" : "text-command-subtle"}`} data-testid="inbox-queue-sync-health">
                {formatQueueSyncLabel(lastQueueSyncAt, clock, queueSyncStatus)}
              </p>
              <span className="sr-only">Newest client activity stays at the top.</span>
            </div>
            <div className="hidden items-center gap-2 border-l border-command-line pl-3 text-[9px] text-command-subtle xl:flex" aria-label="Inbox keyboard shortcuts">
              <span><kbd className="text-command-muted">J/K</kbd> navigate</span>
              <span><kbd className="text-command-muted">N</kbd> next</span>
              <span><kbd className="text-command-muted">R</kbd> reply</span>
              <span><kbd className="text-command-muted">D</kbd> details</span>
              <span><kbd className="text-command-muted">/</kbd> search</span>
              <span><kbd className="text-command-muted">⌘K</kbd> actions</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {priorityCounters.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setFilter(item.targetFilter);
                  setMobilePane("queue");
                }}
                className={`inline-flex min-h-8 items-center rounded-lg px-2 py-1 text-[11px] font-semibold transition hover:bg-command-bg ${filter === item.targetFilter ? "bg-command-bg ring-1 ring-command-line" : ""}`}
                title={`Show ${item.label.toLowerCase()} conversations`}
              >
                <span className={item.tone}>{item.value}</span>
                <span className="ml-1 text-command-muted sm:hidden">{item.shortLabel}</span>
                <span className="ml-1 hidden text-command-muted sm:inline">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
        {spamNotice ? (
          <div
            role="status"
            className={`flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm ${
              spamNotice.tone === "success"
                ? "border-command-green/30 bg-command-green/10 text-command-green"
                : "border-command-red/30 bg-command-red/10 text-command-red"
            }`}
          >
            <span>{spamNotice.message}</span>
            <div className="flex shrink-0 items-center gap-3">
              {recentSpamRemoval?.summaries.length ? (
                <button type="button" onClick={() => void undoSpamRemoval()} disabled={undoSpamPending} data-testid="inbox-spam-undo" className="font-semibold underline underline-offset-2 disabled:cursor-wait disabled:opacity-60">
                  {undoSpamPending ? "Restoring…" : "Undo"}
                </button>
              ) : null}
              <button type="button" onClick={() => { setSpamNotice(null); setRecentSpamRemoval(null); }} className="font-semibold underline underline-offset-2">
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
        <div data-testid="inbox-layout" data-mobile-pane={mobilePane} className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className={`${mobilePane === "queue" ? "flex" : "hidden"} min-h-0 flex-col bg-command-panel2/95 lg:flex lg:border-r lg:border-command-line`} data-testid="inbox-queue-pane">
            <div className="shrink-0 border-b border-command-line/70 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-base font-semibold text-command-text">Conversations</h2>
                    <span className="rounded-full bg-command-card px-2 py-0.5 text-[10px] tabular-nums text-command-subtle">{visibleChatSummaries.length}</span>
                  </div>
                  <p className="text-[10px] text-command-subtle">Latest chat first · view remembered</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={nextWaitingChat}
                    className="inline-flex min-h-9 items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold text-command-gold transition hover:bg-command-gold/10"
                    title="Open the next conversation waiting for Marcus"
                    aria-label="Next waiting chat"
                  >
                    Next
                  </button>
                  {canManageSpam ? (
                    <button
                      type="button"
                      onClick={() => selectionMode ? cancelSpamSelection() : setSelectionMode(true)}
                      className={`inline-flex min-h-9 items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${selectionMode ? "bg-command-red/10 text-command-red" : "text-command-muted hover:bg-command-bg hover:text-command-text"}`}
                    >
                      {selectionMode ? "Cancel" : "Select"}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Search conversations</span>
                  <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-command-subtle" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" strokeLinecap="round" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search"
                    aria-keyshortcuts="/"
                    className="w-full rounded-xl border border-command-line bg-command-bg/80 py-2 pl-9 pr-3 text-sm text-command-text outline-none transition placeholder:text-command-subtle focus:border-command-gold/60 focus:ring-2 focus:ring-command-gold/10"
                  />
                </label>
                <label>
                  <span className="sr-only">Filter conversations</span>
                  <select
                    value={filter}
                    onChange={(event) => setFilter(event.target.value as InboxViewFilter)}
                    className="w-[6.75rem] rounded-xl border border-command-line bg-command-bg/80 px-2 py-2 text-xs font-semibold text-command-muted outline-none focus:border-command-gold/60"
                  >
                    {filters.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-2 flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5" data-testid="inbox-saved-views">
                <button
                  type="button"
                  onClick={saveCurrentView}
                  disabled={!canSaveCurrentView}
                  className="inline-flex min-h-7 shrink-0 items-center rounded-lg border border-command-line bg-command-bg/70 px-2 py-1 text-[10px] font-semibold text-command-muted transition hover:border-command-gold/45 hover:text-command-text disabled:cursor-not-allowed disabled:opacity-40"
                  title="Save the current inbox filter and search"
                >
                  + Save view
                </button>
                {savedViews.map((view) => (
                  <span key={view.id} className="inline-flex shrink-0 overflow-hidden rounded-lg border border-command-line bg-command-card">
                    <button type="button" onClick={() => applySavedView(view)} className="min-h-7 max-w-40 truncate px-2 py-1 text-[10px] font-semibold text-command-muted transition hover:text-command-text" title={`Apply ${view.label}`}>
                      {view.label}
                    </button>
                    <button type="button" onClick={() => removeSavedView(view.id)} className="min-h-7 border-l border-command-line px-1.5 text-[11px] text-command-subtle transition hover:bg-command-red/10 hover:text-command-red" aria-label={`Delete saved view ${view.label}`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {selectionMode ? (
              <div className="flex shrink-0 items-center gap-2 border-b border-command-red/25 bg-command-red/5 px-3 py-2" data-testid="inbox-bulk-spam-toolbar">
                <button type="button" onClick={toggleSelectAllVisible} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-command-muted hover:bg-command-bg hover:text-command-text">
                  {allVisibleSelected ? "Clear all" : "Select all"}
                </button>
                <span className="min-w-0 flex-1 text-xs text-command-subtle">{selectedSpamLeadIds.length} selected</span>
                <button
                  type="button"
                  onClick={requestBulkSpamRemoval}
                  disabled={!selectedSpamLeadIds.length || Boolean(spamPendingLeadIds.length)}
                  className="rounded-lg bg-command-red px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-command-red/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove spam
                </button>
              </div>
            ) : null}

            <div data-testid="inbox-conversation-list" className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {filteredConversations.map((item) => (
                <ChatRow
                  key={item.id}
                  chat={item}
                  active={item.id === activeLeadId}
                  canManageSpam={canManageSpam}
                  selected={selectedSpamLeadIds.includes(item.id)}
                  selectionMode={selectionMode}
                  spamPending={spamPendingLeadIds.includes(item.id)}
                  clock={clock}
                  onSelect={selectConversation}
                  onToggleSelected={toggleSpamSelection}
                  onMarkSpam={markConversationSpam}
                />
              ))}
              {filteredConversations.length === 0 ? (
                <div className="m-4 rounded-2xl bg-command-bg/55 p-4 text-sm text-command-muted">
                  No chats match this search or filter.
                </div>
              ) : null}
            </div>
          </aside>

          <main data-testid="inbox-active-chat" className={`${mobilePane === "chat" ? "flex" : "hidden"} min-h-0 flex-col bg-[radial-gradient(circle_at_top_left,rgba(221,179,93,0.045),transparent_34%),linear-gradient(180deg,rgba(9,14,20,0.99),rgba(5,7,10,0.99))] lg:flex`}>
            <header className="flex min-h-[4.25rem] shrink-0 items-center justify-between gap-3 border-b border-command-line bg-command-panel/95 px-3 py-2 sm:px-4">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobilePane("queue")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-command-muted transition hover:bg-command-bg hover:text-command-text lg:hidden"
                  aria-label="Back to conversations"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-command-gold/10 text-sm font-semibold text-command-gold ring-1 ring-command-gold/30" aria-hidden="true">
                  {chatInitials(chat)}
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <h2 className="truncate text-lg font-semibold text-command-text">{chat.displayName}</h2>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${chatStatusDotTone(chat)}`} aria-hidden="true" />
                  </div>
                  <p className="truncate text-xs text-command-muted">{chatHeaderStatus}</p>
                  <span className="sr-only">Active WhatsApp Chat</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-xs font-semibold">
                <Link
                  href={`/leads/${activeConversation.lead.id}`}
                  className="hidden rounded-lg px-3 py-2 text-command-muted transition hover:bg-command-bg hover:text-command-text sm:inline-flex"
                >
                  Full lead
                </Link>
                {canManageSpam ? (
                  <button
                    type="button"
                    onClick={() => markConversationSpam(chat)}
                    disabled={Boolean(spamPendingLeadIds.length)}
                    className="hidden rounded-lg px-3 py-2 text-command-subtle transition hover:bg-command-red/10 hover:text-command-red disabled:cursor-wait disabled:opacity-50 sm:inline-flex"
                  >
                    Remove spam
                  </button>
                ) : null}
                <button
                  ref={detailsButtonRef}
                  type="button"
                  onClick={() => setContextOpen(true)}
                  className="inline-flex min-h-10 items-center rounded-xl border border-command-line bg-command-bg/60 px-3 py-2 text-command-muted transition hover:border-command-gold/50 hover:text-command-text"
                  aria-haspopup="dialog"
                  aria-keyshortcuts="D"
                >
                  Details
                </button>
              </div>
            </header>

            {manualReplyStatus === "sent" ? (
              <div className="shrink-0 border-b border-command-green/25 bg-command-green/10 px-4 py-2 text-sm text-command-green">
                WhatsApp reply sent. Chat is now waiting for client and bot takeover is active.
              </div>
            ) : null}
            {manualReplyStatus === "failed" && !/NEXT_REDIRECT/i.test(manualReplyError || "") ? (
              <div className="shrink-0 border-b border-command-red/25 bg-command-red/10 px-4 py-2 text-sm text-command-red">
                WhatsApp send failed: {manualReplyError || "Unknown send error."}
              </div>
            ) : null}
            {conversationLoading ? (
              <div className="shrink-0 border-b border-command-cyan/25 bg-command-cyan/10 px-4 py-2 text-sm text-command-cyan">
                Loading selected conversation…
              </div>
            ) : null}

            {operatorBrief && activeSla ? (
              <InboxOperatorBrief brief={operatorBrief} sla={activeSla} onOpenDetails={() => setContextOpen(true)} />
            ) : null}

            <div ref={messagePaneRef} onScroll={handleMessagePaneScroll} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
              {activeMessagesNewestFirst.length ? (
                <div className="mx-auto max-w-4xl space-y-3.5">
                  <div className="flex items-center justify-between gap-3 pb-1">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-command-gold">Latest messages</p>
                      <p className="text-[10px] text-command-subtle">Newest first · older messages continue below</p>
                    </div>
                    <span className="text-xs text-command-subtle">{activeMessagesNewestFirst.length} shown</span>
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
                <div className="flex h-full min-h-48 items-center justify-center">
                  <div className="max-w-sm text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-command-line bg-command-panel2 text-command-gold" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.6">
                        <path d="M5 5h14v11H9l-4 3V5Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M9 9h6M9 12h4" strokeLinecap="round" />
                      </svg>
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-command-text">No saved messages yet</h3>
                    <p className="mt-1 text-sm leading-6 text-command-muted">New WhatsApp messages for this lead will appear here automatically.</p>
                  </div>
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
        </div>
      </section>

      {contextOpen ? (
        <div className="fixed inset-0 z-[60]" data-testid="inbox-details-drawer">
          <button type="button" onClick={() => setContextOpen(false)} className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm" aria-label="Dismiss conversation details" />
          <div ref={detailsDrawerRef} className="absolute inset-y-0 right-0 w-full border-l border-command-line bg-command-panel2 shadow-premium sm:w-[26rem] lg:w-[28rem]" role="dialog" aria-modal="true" aria-label="Conversation details">
            <LeadContextPanel
              conversation={activeConversation}
              activeMessages={activeMessages}
              onClose={() => setContextOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <InboxSpamDialog
        count={spamConfirmation.length}
        label={spamDialogLabel}
        open={spamConfirmation.length > 0}
        pending={spamPendingLeadIds.length > 0}
        onCancel={cancelSpamConfirmation}
        onConfirm={() => void confirmSpamRemoval()}
      />
    </>
  );
}
