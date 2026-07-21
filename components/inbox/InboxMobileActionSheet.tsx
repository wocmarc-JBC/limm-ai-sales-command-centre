"use client";

import Link from "next/link";
import { useEffect, useRef, type RefObject } from "react";
import { pauseBotForLeadAction, resumeBotForLeadAction } from "@/lib/actions";

type InboxMobileActionSheetProps = {
  leadId: string;
  leadName: string;
  botPaused: boolean;
  canManageSpam: boolean;
  spamPending: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onOpenDetails: () => void;
  onMarkSpam: () => void;
};

const focusableSelector = "button:not([disabled]), a[href]";

export function InboxMobileActionSheet({
  leadId,
  leadName,
  botPaused,
  canManageSpam,
  spamPending,
  triggerRef,
  onClose,
  onOpenDetails,
  onMarkSpam
}: InboxMobileActionSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sheet = sheetRef.current;
    const returnFocusTarget = triggerRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () => Array.from(sheet?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    window.requestAnimationFrame(() => focusables()[0]?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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
      document.body.style.overflow = previousBodyOverflow;
      window.requestAnimationFrame(() => returnFocusTarget?.focus());
    };
  }, [onClose, triggerRef]);

  const openDetails = () => {
    onClose();
    onOpenDetails();
  };

  const markSpam = () => {
    onClose();
    onMarkSpam();
  };

  return (
    <div className="fixed inset-0 z-[55] sm:hidden" data-testid="inbox-mobile-actions">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        aria-label="Dismiss conversation actions"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-mobile-actions-title"
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-command-gold/25 bg-[linear-gradient(180deg,rgba(24,29,36,0.99),rgba(12,16,22,0.99))] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_70px_rgba(0,0,0,0.48)]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-command-line" aria-hidden="true" />
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-command-gold">Quick control</p>
            <p id="inbox-mobile-actions-title" className="mt-1 text-lg font-semibold text-command-text">{leadName}</p>
            <p className="truncate text-xs text-command-muted">Conversation actions</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-command-line bg-command-bg/50 text-command-muted transition hover:text-command-text active:scale-[0.97]"
            aria-label="Close conversation actions"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="grid gap-2">
          <button type="button" onClick={openDetails} className="group flex min-h-14 w-full items-center justify-between rounded-2xl border border-command-gold/25 bg-command-gold/[0.07] px-4 py-3 text-left transition hover:border-command-gold/45 active:scale-[0.99]">
            <span><span className="block text-sm font-semibold text-command-text">Conversation details</span><span className="mt-0.5 block text-xs text-command-muted">Scope, readiness, delivery and automation</span></span>
            <span className="text-lg text-command-gold transition group-hover:translate-x-0.5" aria-hidden="true">›</span>
          </button>

          <Link href={`/leads/${leadId}`} className="group flex min-h-14 w-full items-center justify-between rounded-2xl border border-command-line bg-command-bg/60 px-4 py-3 text-left transition hover:border-command-gold/40 active:scale-[0.99]">
            <span><span className="block text-sm font-semibold text-command-text">Open full lead</span><span className="mt-0.5 block text-xs text-command-muted">Profile, pipeline and complete history</span></span>
            <span className="text-lg text-command-subtle transition group-hover:translate-x-0.5" aria-hidden="true">›</span>
          </Link>

          <form action={botPaused ? resumeBotForLeadAction : pauseBotForLeadAction}>
            <input type="hidden" name="lead_id" value={leadId} />
            {!botPaused ? <input type="hidden" name="reason" value="Paused from WhatsApp Sales Inbox mobile actions." /> : null}
            <button type="submit" data-testid="inbox-mobile-automation-control" className={`group flex min-h-14 w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99] ${botPaused ? "border-command-green/40 bg-command-green/10" : "border-command-cyan/40 bg-command-cyan/10"}`}>
              <span><span className={`block text-sm font-semibold ${botPaused ? "text-command-green" : "text-command-cyan"}`}>{botPaused ? "Resume bot" : "Pause bot"}</span><span className="mt-0.5 block text-xs text-command-muted">{botPaused ? "Allow automatic replies again" : "Stop automatic replies for this chat"}</span></span>
              <span className="text-lg text-command-subtle transition group-hover:translate-x-0.5" aria-hidden="true">›</span>
            </button>
          </form>

          {canManageSpam ? (
            <button type="button" onClick={markSpam} disabled={spamPending} className="group flex min-h-14 w-full items-center justify-between rounded-2xl border border-command-red/35 bg-command-red/5 px-4 py-3 text-left transition hover:bg-command-red/10 active:scale-[0.99] disabled:cursor-wait disabled:opacity-50">
              <span><span className="block text-sm font-semibold text-command-red">Remove as spam</span><span className="mt-0.5 block text-xs text-command-muted">Confirmation is required before removal</span></span>
              <span className="text-lg text-command-red/70 transition group-hover:translate-x-0.5" aria-hidden="true">›</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
