"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AppIcon, type AppIconName } from "@/components/AppIcon";

export type CommandPaletteItem = {
  href: Route;
  label: string;
  group: string;
  icon: AppIconName;
  keywords?: string;
};

export function CommandPalette({
  open,
  items,
  onClose,
  triggerRef
}: {
  open: boolean;
  items: CommandPaletteItem[];
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const openedAtPathRef = useRef(pathname);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) => `${item.label} ${item.group} ${item.keywords ?? ""}`.toLowerCase().includes(normalizedQuery));
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setQuery("");
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (open && pathname !== openedAtPathRef.current) onClose();
    if (!open) openedAtPathRef.current = pathname;
  }, [onClose, open, pathname]);

  if (!open) return null;

  function closeAndReturnFocus() {
    onClose();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function openItem(item: CommandPaletteItem) {
    onClose();
    router.push(item.href);
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndReturnFocus();
      return;
    }

    if (event.key === "Tab") {
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      ) ?? [])].filter((element) => element.tabIndex >= 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if (document.activeElement !== searchInputRef.current || filteredItems.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((activeIndex + direction + filteredItems.length) % filteredItems.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      openItem(filteredItems[activeIndex] ?? filteredItems[0]);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[12vh] sm:px-6" data-testid="command-palette">
      <button type="button" tabIndex={-1} className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Close command palette" onClick={closeAndReturnFocus} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        aria-describedby="command-palette-description"
        className="relative flex max-h-[72vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-command-line bg-command-panel2 shadow-premium"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-command-line px-4 py-3 sm:px-5">
          <AppIcon name="search" className="h-5 w-5 shrink-0 text-command-gold" />
          <div className="min-w-0 flex-1">
            <label id="command-palette-title" htmlFor="command-palette-search" className="sr-only">Jump anywhere</label>
            <input
              ref={searchInputRef}
              id="command-palette-search"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-options"
              aria-autocomplete="list"
              aria-activedescendant={filteredItems.length ? `command-palette-option-${activeIndex}` : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              placeholder="Jump to a page or action…"
              className="w-full bg-transparent text-base font-semibold text-command-text outline-none placeholder:font-normal placeholder:text-command-subtle sm:text-lg"
            />
            <p id="command-palette-description" className="mt-0.5 hidden text-[10px] text-command-subtle sm:block">Search every Command Centre destination.</p>
          </div>
          <button type="button" onClick={closeAndReturnFocus} className="inline-flex min-h-10 items-center rounded-xl border border-command-line px-3 py-2 text-xs font-semibold text-command-muted transition hover:border-command-gold/45 hover:text-command-text">
            Esc
          </button>
        </div>

        <div id="command-palette-options" role="listbox" aria-label="Command Centre destinations" className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
          {filteredItems.length ? filteredItems.map((item, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={`${item.group}-${item.href}`}
                id={`command-palette-option-${index}`}
                type="button"
                role="option"
                aria-selected={active}
                data-command-option="true"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => openItem(item)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${active ? "border-command-gold/45 bg-command-gold/10" : "border-transparent hover:border-command-line hover:bg-command-card"}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${active ? "border-command-gold/35 bg-command-gold/10 text-command-gold" : "border-command-line bg-command-bg text-command-subtle"}`}>
                  <AppIcon name={item.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-command-text">{item.label}</span>
                  <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-command-subtle">{item.group}</span>
                </span>
                <span className="text-sm text-command-subtle" aria-hidden="true">↵</span>
              </button>
            );
          }) : (
            <div className="px-4 py-10 text-center" role="status">
              <p className="text-sm font-semibold text-command-text">No matching destination</p>
              <p className="mt-1 text-xs text-command-muted">Try inbox, quotation, delivery, money, or settings.</p>
            </div>
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-command-line px-5 py-2.5 text-[10px] text-command-subtle sm:flex" aria-hidden="true">
          <span>↑↓ choose</span>
          <span>↵ open</span>
          <span>Esc close</span>
          <span className="ml-auto">⌘/Ctrl K from anywhere</span>
        </div>
      </div>
    </div>
  );
}
