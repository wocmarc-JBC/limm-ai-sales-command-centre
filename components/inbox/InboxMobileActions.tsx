"use client";

import dynamic from "next/dynamic";
import { useCallback, useState, type RefObject } from "react";

type InboxMobileActionsProps = {
  leadId: string;
  leadName: string;
  botPaused: boolean;
  canManageSpam: boolean;
  spamPending: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onOpenDetails: () => void;
  onMarkSpam: () => void;
};

const loadMobileActionSheet = () => import("@/components/inbox/InboxMobileActionSheet");
const InboxMobileActionSheet = dynamic(
  () => loadMobileActionSheet().then((module) => module.InboxMobileActionSheet),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[55] sm:hidden" role="status" aria-label="Loading conversation actions">
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
        <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-command-line bg-command-panel2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-premium">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-command-line" />
          <div className="grid gap-2 motion-safe:animate-pulse">
            <div className="h-14 rounded-2xl border border-command-line bg-command-bg/55" />
            <div className="h-14 rounded-2xl border border-command-line bg-command-bg/55" />
          </div>
        </div>
      </div>
    )
  }
);

export function InboxMobileActions({
  leadId,
  leadName,
  botPaused,
  canManageSpam,
  spamPending,
  triggerRef,
  onOpenDetails,
  onMarkSpam
}: InboxMobileActionsProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const preload = () => {
    void loadMobileActionSheet();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onPointerEnter={preload}
        onFocus={preload}
        onClick={() => {
          preload();
          setOpen(true);
        }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-command-line bg-command-bg/70 text-command-muted shadow-[0_8px_20px_rgba(0,0,0,0.16)] transition hover:border-command-gold/50 hover:bg-command-card hover:text-command-text active:scale-[0.97] sm:hidden"
        aria-label="Conversation actions"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      {open ? (
        <InboxMobileActionSheet
          leadId={leadId}
          leadName={leadName}
          botPaused={botPaused}
          canManageSpam={canManageSpam}
          spamPending={spamPending}
          triggerRef={triggerRef}
          onClose={close}
          onOpenDetails={onOpenDetails}
          onMarkSpam={onMarkSpam}
        />
      ) : null}
    </>
  );
}
