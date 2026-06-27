import type { SystemHealth } from "@/lib/types";
import { getCalendarRuntime } from "@/lib/calendar-config";
import { getOpenAiBrainRuntime } from "@/lib/openai-brain-config";
import { isQaE2EMode } from "@/lib/qa-e2e-mode";
import { getWhatsAppRuntime } from "@/lib/whatsapp-config";

export function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getDataMode(): SystemHealth["mode"] {
  if (isQaE2EMode()) return "Mock Mode";
  return hasSupabaseEnv() ? "Supabase Mode" : "Mock Mode";
}

export function getSystemHealth(): SystemHealth {
  const supabaseConfigured = hasSupabaseEnv();
  const openAi = getOpenAiBrainRuntime();
  const whatsapp = getWhatsAppRuntime();
  const calendar = getCalendarRuntime();
  const whatsappStatus: SystemHealth["whatsappStatus"] = whatsapp.closedTestAutoReplyAllowed
    ? "closed_test_ready"
    : whatsapp.liveAutoReplyApproved
      ? "live_auto_reply_ready"
    : whatsapp.liveInboundEnabled || whatsapp.testAutoReplyEnabled
      ? whatsapp.credentialsReady
        ? "inbound_only"
        : "closed_test_credentials_missing"
      : "disabled";
  return {
    mode: getDataMode(),
    supabaseUrlDetected: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKeyDetected: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    authEnabled: supabaseConfigured,
    rlsExpected: supabaseConfigured,
    rlsNotes: supabaseConfigured
      ? "Supabase Auth/RLS expected. Anonymous access should be blocked by policies."
      : "Mock Mode. Auth/RLS disabled until Supabase env vars are configured.",
    openAiStatus: openAi.status,
    whatsappStatus,
    calendarStatus: calendar.status
  };
}
