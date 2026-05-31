import { NextResponse } from "next/server";
import { getCalendarRuntime } from "@/lib/calendar-config";
import { getOpenAiWhatsAppReplyRuntime } from "@/lib/openai-whatsapp-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function envPresent(name: string) {
  return Boolean(process.env[name]);
}

function envFlag(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

export async function GET() {
  try {
    const openAiWhatsApp = getOpenAiWhatsAppReplyRuntime();
    const calendar = getCalendarRuntime();
    return NextResponse.json({
      ok: true,
      version: "v5_0_whatsapp_sales_brain_calendar_foundation",
      runtime: "vercel",
      hasSupabaseUrl: envPresent("NEXT_PUBLIC_SUPABASE_URL"),
      hasSupabaseAnonKey: envPresent("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      hasServiceRoleKey: envPresent("SUPABASE_SERVICE_ROLE_KEY"),
      liveInboundEnabled: envFlag("WHATSAPP_LIVE_INBOUND_ENABLED"),
      testAutoReplyEnabled: envFlag("WHATSAPP_TEST_AUTO_REPLY_ENABLED"),
      publicAutoReplyEnabled: envFlag("WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED"),
      testMode: envFlag("WHATSAPP_TEST_MODE", true),
      hasWhatsappVerifyToken: envPresent("WHATSAPP_VERIFY_TOKEN"),
      hasWhatsappPhoneNumberId: envPresent("WHATSAPP_PHONE_NUMBER_ID"),
      hasWhatsappAccessToken: envPresent("WHATSAPP_ACCESS_TOKEN"),
      hasWhatsappBusinessNumber: envPresent("WHATSAPP_BUSINESS_NUMBER"),
      openaiWhatsappReplyEnabled: openAiWhatsApp.enabled,
      hasOpenaiApiKey: openAiWhatsApp.keyConfigured,
      whatsappReplyBrainDebug: openAiWhatsApp.debug,
      calendarBookingEnabled: calendar.bookingEnabled,
      calendarBossApprovalRequired: calendar.bossApprovalRequired,
      calendarAutoBookingEnabled: calendar.autoBookingEnabled,
      googleCalendarConnected: calendar.googleCalendarConnected,
      hasGoogleCalendarId: calendar.calendarIdConfigured,
      hasCalendarTimezone: calendar.hasCalendarTimezone
    });
  } catch {
    return NextResponse.json({
      ok: true,
      version: "v5_0_whatsapp_sales_brain_calendar_foundation",
      runtime: "vercel",
      hasSupabaseUrl: false,
      hasSupabaseAnonKey: false,
      hasServiceRoleKey: false,
      liveInboundEnabled: false,
      testAutoReplyEnabled: false,
      publicAutoReplyEnabled: false,
      testMode: false,
      hasWhatsappVerifyToken: false,
      hasWhatsappPhoneNumberId: false,
      hasWhatsappAccessToken: false,
      hasWhatsappBusinessNumber: false,
      openaiWhatsappReplyEnabled: false,
      hasOpenaiApiKey: false,
      whatsappReplyBrainDebug: false,
      calendarBookingEnabled: false,
      calendarBossApprovalRequired: true,
      calendarAutoBookingEnabled: false,
      googleCalendarConnected: false,
      hasGoogleCalendarId: false,
      hasCalendarTimezone: true
    });
  }
}
