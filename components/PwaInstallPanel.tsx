"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaInstallPanel() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setPromptEvent(null);
  }

  return (
    <section className="mission-panel rounded-2xl p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Install Command Centre</p>
      <h2 className="mt-1 text-2xl font-semibold text-command-text">Use as a phone app</h2>
      <p className="mt-2 text-sm leading-6 text-command-muted">
        Install this web app for standalone mobile use. This is a PWA, not a native iOS or Android app.
      </p>
      <button
        type="button"
        onClick={install}
        disabled={!promptEvent || installed}
        className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black transition hover:bg-command-goldHover disabled:cursor-not-allowed disabled:opacity-55"
      >
        {installed ? "Installed" : promptEvent ? "Install on this device" : "Use browser install menu"}
      </button>
    </section>
  );
}
