import { PageHeader } from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth/session";
import { getCalendarRuntime } from "@/lib/calendar-config";
import { getSettingsSummary } from "@/lib/data/settings-repository";
import { getOpenAiBrainRuntime } from "@/lib/openai-brain-config";
import { getOpenAiWhatsAppReplyRuntime } from "@/lib/openai-whatsapp-config";
import { getWhatsAppRuntime } from "@/lib/whatsapp-config";

export default async function SettingsPage() {
  const { health } = await getSettingsSummary();
  const auth = await getCurrentProfile();
  const openAi = getOpenAiBrainRuntime();
  const openAiWhatsApp = getOpenAiWhatsAppReplyRuntime();
  const whatsapp = getWhatsAppRuntime();
  const calendar = getCalendarRuntime();
  const settings = [
    ["Current mode", health.mode],
    ["Supabase URL detected", health.supabaseUrlDetected ? "Yes" : "No"],
    ["Supabase anon key detected", health.supabaseAnonKeyDetected ? "Yes" : "No"],
    ["Auth status", health.authEnabled ? "Enabled in Supabase Mode" : "Disabled in Mock Mode"],
    ["Current user", auth.profile ? auth.profile.fullName : "Not logged in"],
    ["Current user email", auth.profile ? auth.profile.email : "Not logged in"],
    ["Current role", auth.profile ? auth.profile.role : "None"],
    ["Supabase connected", health.supabaseUrlDetected && health.supabaseAnonKeyDetected ? "Yes" : "No"],
    ["Audit log writable", health.mode === "Supabase Mode" ? "Unknown until action test" : "Yes in Mock Mode"],
    ["Appointment settings writable", auth.profile?.role === "boss" ? "Yes for boss role" : "Boss role required"],
    ["RLS expected", health.rlsExpected ? "Yes" : "No"],
    ["RLS enforced status", health.rlsExpected ? "Expected from Supabase policies" : "Not active in Mock Mode"],
    ["RLS notes", health.rlsNotes],
    ["Environment", process.env.NEXT_PUBLIC_APP_ENV ?? "local"],
    ["Live verification", process.env.LIVE_SUPABASE_VERIFIED_AT ? `Last marked: ${process.env.LIVE_SUPABASE_VERIFIED_AT}` : "Run npm run verify:live-supabase manually"],
    ["OpenAI", openAi.label],
    ["OpenAI dry-run", openAi.dryRunEnabled ? "Enabled for draft recommendations only" : "Off by default"],
    ["OpenAI WhatsApp reply brain", openAiWhatsApp.enabled ? `${openAiWhatsApp.status} (${openAiWhatsApp.model})` : "Off by default"],
    ["OpenAI WhatsApp key", openAiWhatsApp.keyConfigured ? "Configured" : "Not required for fallback replies"],
    ["WhatsApp reply brain debug", openAiWhatsApp.debug ? "Enabled" : "Disabled"],
    ["OpenAI live actions", "Disabled"],
    ["WhatsApp", health.whatsappStatus],
    ["WhatsApp live inbound", whatsapp.liveInboundEnabled ? "Enabled" : "Disabled by default"],
    ["WhatsApp test auto-reply", whatsapp.testAutoReplyEnabled ? "Enabled" : "Disabled by default"],
    ["WhatsApp public auto-reply", whatsapp.publicAutoReplyEnabled ? "Enabled - Marcus-approved live mode" : "Disabled"],
    ["WhatsApp test mode", whatsapp.testMode ? "Enabled" : "Disabled"],
    ["WhatsApp credentials", whatsapp.credentialsReady ? "Configured" : "Missing or incomplete"],
    ["WhatsApp auto-reply posture", whatsapp.statusLabel],
    ["WhatsApp safety", "No pricing / no Calendar booking / safety validator required"],
    ["Calendar", health.calendarStatus],
    ["Calendar booking enabled", calendar.bookingEnabled ? "Enabled" : "Disabled by default"],
    ["Calendar boss approval required", calendar.bossApprovalRequired ? "Yes" : "No"],
    ["Calendar auto booking", calendar.autoBookingEnabled ? "Enabled" : "Disabled"],
    ["Google Calendar connected", calendar.googleCalendarConnected ? "Connected" : "Not connected"],
    ["Google Calendar ID", calendar.calendarIdConfigured ? "Configured" : "Not configured"],
    ["Calendar timezone", calendar.timezone],
    ["Live auto-send", "Off"],
    ["WhatsApp mode", whatsapp.liveAutoReplyApproved ? "Marcus-approved live auto-reply" : "Closed-test reply-only unless Marcus enables live mode"],
    ["Target monthly volume", "Around 60 leads"],
    ["Cost posture", "Around S$100/month target when live"]
  ];

  return (
    <>
      <PageHeader title="Settings" eyebrow="System controls" />
      <div className="rounded border border-command-line bg-command-panel shadow-command">
        {settings.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-command-line p-4 last:border-b-0">
            <span className="text-command-muted">{label}</span>
            <span className="font-semibold">{value}</span>
          </div>
        ))}
      </div>
    </>
  );
}
