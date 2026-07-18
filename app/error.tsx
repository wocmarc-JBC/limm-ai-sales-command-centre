"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-command-red/35 bg-command-panel p-7 text-center shadow-premium" role="alert">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-command-red/10 text-2xl text-command-red" aria-hidden="true">!</div>
      <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-command-red">Unable to load this view</p>
      <h1 className="mt-2 text-2xl font-semibold text-command-text">The Command Centre hit a temporary problem.</h1>
      <p className="mt-3 text-sm leading-6 text-command-muted">No action was completed. Try loading the view again; if it persists, check System Health.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-sm font-semibold text-black hover:bg-command-goldHover">
          Try again
        </button>
        <a href="/system-health" className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-sm font-semibold text-command-text hover:border-command-gold/50">
          System Health
        </a>
      </div>
    </section>
  );
}
