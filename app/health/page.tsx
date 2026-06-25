import { PageHeader } from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth/session";
import { getCalendarRuntime } from "@/lib/calendar-config";
import { getHandoffEmailRuntime } from "@/lib/handoff-email";
import { getOpenAiWhatsAppReplyRuntime } from "@/lib/openai-whatsapp-config";
import { getWhatsAppRuntime } from "@/lib/whatsapp-config";

function boolLabel(value: boolean) {
  return value ? "Yes" : "No";
}

export default async function HealthPage() {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) {
    return (
      <>
        <PageHeader title="Health / Diagnostics" eyebrow="Read-only system proof" />
        <section className="rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Login required</p>
          <h2 className="mt-1 text-2xl font-semibold">Protected health view</h2>
          <p className="mt-2 text-command-muted">Sign in before viewing internal system diagnostics.</p>
        </section>
      </>
    );
  }

  const whatsapp = getWhatsAppRuntime();
  const calendar = getCalendarRuntime();
  const openAiWhatsApp = getOpenAiWhatsAppReplyRuntime();
  const handoffEmail = getHandoffEmailRuntime();
  const rows = [
    ["Current mode", auth.mode],
    ["WhatsApp live inbound", boolLabel(whatsapp.liveInboundEnabled)],
    ["WhatsApp public auto-reply", boolLabel(whatsapp.publicAutoReplyEnabled)],
    ["WhatsApp credentials ready", boolLabel(whatsapp.credentialsReady)],
    ["OpenAI WhatsApp reply", openAiWhatsApp.enabled ? "Enabled" : "Off"],
    ["Calendar booking", calendar.bookingEnabled ? "Enabled" : "Off"],
    ["Calendar auto-booking", calendar.autoBookingEnabled ? "Enabled" : "Off"],
    ["Voice transcription", "Off"],
    ["Handoff email", handoffEmail.enabled ? "Enabled" : "Off / provider pending"]
  ];

  return (
    <>
      <PageHeader title="Health / Diagnostics" eyebrow="Read-only system proof">
        <a
          href="/api/whatsapp/health"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-cyan/60 bg-command-cyan/10 px-4 py-2 text-base font-semibold text-command-cyan transition hover:bg-command-cyan/15"
        >
          View WhatsApp Health JSON
        </a>
        <a
          href="/settings"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-muted transition hover:border-command-gold/60"
        >
          Open Settings
        </a>
      </PageHeader>

      <section className="rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
        <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Live-safe diagnostics</p>
        <h2 className="mt-1 text-2xl font-semibold">Command Centre health summary</h2>
        <p className="mt-2 text-command-muted">
          This page shows safe booleans and labels only. Secrets, tokens, and keys are never displayed here.
        </p>
        <div className="mt-5 divide-y divide-command-line">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-2 py-3 sm:grid-cols-[16rem_1fr]">
              <span className="text-command-muted">{label}</span>
              <span className="font-semibold text-command-text">{value}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
