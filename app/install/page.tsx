import { PageHeader } from "@/components/PageHeader";
import { PwaInstallPanel } from "@/components/PwaInstallPanel";

export default function InstallPage() {
  return (
    <>
      <PageHeader title="Install App" eyebrow="PWA phone support" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <PwaInstallPanel />
        <section className="mission-panel rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Mobile setup</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-command-line bg-command-bg/55 p-4">
              <h2 className="text-lg font-semibold text-command-text">iPhone</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-command-muted">
                <li>Open the Command Centre in Safari.</li>
                <li>Tap Share.</li>
                <li>Tap Add to Home Screen.</li>
                <li>Open it from the Home Screen for standalone mode.</li>
              </ol>
            </div>
            <div className="rounded-xl border border-command-line bg-command-bg/55 p-4">
              <h2 className="text-lg font-semibold text-command-text">Android</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-command-muted">
                <li>Open the Command Centre in Chrome.</li>
                <li>Tap the browser menu.</li>
                <li>Tap Install app or Add to Home screen.</li>
                <li>Open it from the launcher.</li>
              </ol>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-command-line bg-command-bg/55 p-4 text-sm leading-6 text-command-muted">
            Camera/photo upload is available through secure client upload links. Native iOS and Android apps are intentionally not built yet.
          </div>
          <div className="mt-4 rounded-xl border border-command-gold/50 bg-command-gold/10 p-4 text-sm font-semibold leading-6 text-command-gold">
            Install this on your phone only after opening the Vercel production URL, not localhost.
          </div>
        </section>
      </div>
    </>
  );
}
