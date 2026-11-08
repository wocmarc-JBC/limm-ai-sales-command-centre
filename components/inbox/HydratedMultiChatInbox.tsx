"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { MultiChatInbox } from "@/components/inbox/MultiChatInbox";

type HydratedMultiChatInboxProps = ComponentProps<typeof MultiChatInbox>;

// The inbox combines live queue state, service-window safety state and realtime
// collaboration. Render a stable shell on the server and first client pass, then
// mount that live tree after hydration instead of reconciling volatile text.
export function HydratedMultiChatInbox(props: HydratedMultiChatInboxProps) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <section
        data-testid="inbox-hydration-shell"
        aria-busy="true"
        aria-live="polite"
        role="status"
        className="mission-panel flex min-h-[28rem] items-center justify-center rounded-2xl p-6 text-sm text-command-muted shadow-command"
      >
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-command-gold" aria-hidden="true" />
          Loading WhatsApp inbox…
        </span>
      </section>
    );
  }

  return <MultiChatInbox {...props} />;
}
