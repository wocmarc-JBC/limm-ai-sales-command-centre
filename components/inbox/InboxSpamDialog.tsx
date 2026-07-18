"use client";

import { useEffect, useRef } from "react";

type InboxSpamDialogProps = {
  count: number;
  label: string;
  open: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function InboxSpamDialog({ count, label, open, pending, onCancel, onConfirm }: InboxSpamDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onCancel();
      if (event.key !== "Tab") return;
      const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons.at(-1)!;
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
      previouslyFocused?.focus();
    };
  }, [onCancel, open, pending]);

  if (!open) return null;

  const plural = count > 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" data-testid="inbox-spam-dialog-backdrop">
      <section
        ref={dialogRef}
        aria-describedby="inbox-spam-description"
        aria-labelledby="inbox-spam-title"
        aria-modal="true"
        className="w-full max-w-md rounded-3xl border border-command-line bg-command-panel p-6 shadow-premium"
        role="alertdialog"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-command-red/12 text-command-red" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 4l16 16M9.5 4h5l1 2H20M6 6l1 14h10l.7-7M10 10v6M14 13v3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 id="inbox-spam-title" className="mt-4 text-xl font-semibold text-command-text">
          Remove {plural ? `${count} conversations` : label} as spam?
        </h2>
        <p id="inbox-spam-description" className="mt-2 text-sm leading-6 text-command-muted">
          {plural ? "These conversations" : "This conversation"} will disappear from the active inbox. Nothing is permanently deleted, and {plural ? "they are" : "it is"} recoverable from Leads → Show Spam.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="min-h-11 rounded-xl border border-command-line bg-command-bg/70 px-4 py-2 text-sm font-semibold text-command-muted transition hover:border-command-gold/50 hover:text-command-text disabled:cursor-wait disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={pending}
            data-testid="inbox-confirm-spam"
            className="min-h-11 rounded-xl border border-command-red/50 bg-command-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-command-red/90 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? "Removing…" : `Remove ${plural ? count : "spam"}`}
          </button>
        </div>
      </section>
    </div>
  );
}
