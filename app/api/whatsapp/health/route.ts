import { NextResponse } from "next/server";

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
    return NextResponse.json({
      ok: true,
      version: "v4_8_live_whatsapp_diagnostics",
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
      hasWhatsappBusinessNumber: envPresent("WHATSAPP_BUSINESS_NUMBER")
    });
  } catch {
    return NextResponse.json({
      ok: true,
      version: "v4_8_live_whatsapp_diagnostics",
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
      hasWhatsappBusinessNumber: false
    });
  }
}
