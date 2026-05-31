import { NextResponse } from "next/server";
import { getCalendarRuntime } from "@/lib/calendar-config";
import { getOpenAiWhatsAppReplyRuntime } from "@/lib/openai-whatsapp-config";
import { getLimmInstagramUrl } from "@/lib/whatsapp-lead-context";
import { questionBankStats } from "@/lib/whatsapp-question-bank";

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
    const questionBank = questionBankStats();
    const instagramUrlConfigured = Boolean(getLimmInstagramUrl());
    return NextResponse.json({
      ok: true,
      version: "v5_3_1_multi_intent_lead_context_portfolio",
      salesBrainVersion: "v5.3.1",
      runtime: "vercel",
      multiIntentDetectorAvailable: true,
      combinedReplyComposerAvailable: true,
      leadContextMemoryCheckerAvailable: true,
      avoidRepeatedInfoRequestAvailable: true,
      priceScopeFirstRuleAvailable: true,
      portfolioInstagramRoutingAvailable: true,
      instagramUrlConfigured,
      portfolioHumanFollowUpTaskAvailable: false,
      replyCoachAvailable: true,
      replyDecisionEngineAvailable: true,
      replyQualityGateAvailable: true,
      validTextNeverEmptyReplyGuard: true,
      noSilenceFallbackAvailable: true,
      safetyRewriteInsteadOfSilence: true,
      repetitionRewriteInsteadOfSilence: true,
      answerActualQuestionFirstRule: true,
      blackBoxReplyRecorderAvailable: true,
      humanTakeoverLockPlanned: true,
      questionBankAvailable: true,
      questionBankCategories: questionBank.categories,
      questionBankExamples: questionBank.exampleQuestions,
      fallbackBrainAvailable: true,
      safetyValidatorAvailable: true,
      repetitionCheckerAvailable: true,
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
      version: "v5_3_1_multi_intent_lead_context_portfolio",
      salesBrainVersion: "v5.3.1",
      runtime: "vercel",
      multiIntentDetectorAvailable: false,
      combinedReplyComposerAvailable: false,
      leadContextMemoryCheckerAvailable: false,
      avoidRepeatedInfoRequestAvailable: false,
      priceScopeFirstRuleAvailable: false,
      portfolioInstagramRoutingAvailable: false,
      instagramUrlConfigured: false,
      portfolioHumanFollowUpTaskAvailable: false,
      replyCoachAvailable: false,
      replyDecisionEngineAvailable: false,
      replyQualityGateAvailable: false,
      validTextNeverEmptyReplyGuard: false,
      noSilenceFallbackAvailable: false,
      safetyRewriteInsteadOfSilence: false,
      repetitionRewriteInsteadOfSilence: false,
      answerActualQuestionFirstRule: false,
      blackBoxReplyRecorderAvailable: false,
      humanTakeoverLockPlanned: true,
      questionBankAvailable: false,
      questionBankCategories: 0,
      questionBankExamples: 0,
      fallbackBrainAvailable: false,
      safetyValidatorAvailable: false,
      repetitionCheckerAvailable: false,
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
