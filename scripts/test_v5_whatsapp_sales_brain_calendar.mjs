import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const file of [
  "lib/whatsapp-sales-brain.ts",
  "lib/openai-whatsapp-config.ts",
  "lib/calendar-config.ts",
  "lib/calendar-booking.ts",
  "lib/adapters/calendar-adapter.ts",
  "scripts/test_v5_whatsapp_sales_brain_calendar.mjs",
  "CALENDAR_BOOKING_SETUP_GUIDE.md",
  "CALENDAR_BOOKING_SAFETY_RULES.md",
  "V5_0_WHATSAPP_SALES_BRAIN_AND_CALENDAR_FOUNDATION_REPORT.md"
]) {
  assert(exists(file), `Missing v5 file: ${file}`);
}

const envExample = read(".env.example");
for (const line of [
  "OPENAI_WHATSAPP_REPLY_ENABLED=false",
  "OPENAI_WHATSAPP_MODEL=gpt-4.1-mini",
  "WHATSAPP_REPLY_BRAIN_DEBUG=false",
  "CALENDAR_BOOKING_ENABLED=false",
  "CALENDAR_BOSS_APPROVAL_REQUIRED=true",
  "CALENDAR_AUTO_BOOKING_ENABLED=false",
  "GOOGLE_CALENDAR_CONNECTED=false",
  "GOOGLE_CALENDAR_TIMEZONE=Asia/Singapore"
]) {
  assert(envExample.includes(line), `.env.example missing v5 safe default: ${line}`);
}

const openAiConfig = read("lib/openai-whatsapp-config.ts");
assert(openAiConfig.includes("OPENAI_WHATSAPP_REPLY_ENABLED"), "OpenAI WhatsApp config flag missing.");
assert(openAiConfig.includes("enabled && keyConfigured"), "OpenAI WhatsApp must require both flag and key.");
assert(openAiConfig.includes("gpt-4.1-mini"), "OpenAI WhatsApp default model missing.");

const brain = read("lib/whatsapp-sales-brain.ts");
for (const intent of [
  "landed_renovation",
  "aa_works",
  "condo_renovation",
  "commercial_renovation",
  "hacking_demo",
  "carpentry",
  "price_question",
  "site_visit_request",
  "appointment_request",
  "floorplan_or_photos_sent",
  "vague_enquiry",
  "unsupported_media",
  "repeated_enquiry",
  "complaint_or_risk",
  "unsupported"
]) {
  assert(brain.includes(intent), `WhatsApp sales brain missing intent/template category: ${intent}`);
}
for (const field of [
  "intent",
  "property_type",
  "scope_summary",
  "missing_info",
  "risk_flags",
  "appointment_intent",
  "appointment_type",
  "next_best_action",
  "reply",
  "internal_note",
  "confidence",
  "should_auto_send",
  "should_request_boss_review",
  "safety_notes"
]) {
  assert(brain.includes(field), `Structured WhatsApp schema missing ${field}`);
}
for (const phrase of [
  "response_format: { type: \"json_object\" }",
  "validateWhatsAppAutoReply",
  "pickTemplate",
  "similarity(reply, candidate) > 0.82",
  "toneCheck",
  "friendly",
  "No worries",
  "To avoid giving you the wrong idea",
  "initial project review",
  "WHATSAPP_SAFE_FALLBACK_REPLY",
  "reply_source",
  "repetition_checked",
  "tone_result",
  "booking_readiness",
  "calendar_event_id"
]) {
  assert(brain.includes(phrase), `WhatsApp sales brain missing safety/repetition/tone/audit phrase: ${phrase}`);
}
assert(!/should_auto_send:\s*true[\s\S]{0,80}appointment confirmed/i.test(brain), "Brain must not allow booking confirmation by default.");

const whatsappService = read("lib/whatsapp-auto-reply.ts");
for (const phrase of [
  "buildWhatsAppReplyDecision",
  "listRecentLeadMessagesForWebhook",
  "whatsapp_context_load_failed",
  "whatsapp_auto_reply_requested",
  "whatsapp_handoff_required",
  "brainMetadata",
  "validateWhatsAppAutoReply(reply, { calendarEventId })",
  "adapter.sendReply(senderPhone, reply)"
]) {
  assert(whatsappService.includes(phrase), `WhatsApp service missing v5 brain integration: ${phrase}`);
}

const leadMessagesRepo = read("lib/data/lead-messages-repository.ts");
assert(leadMessagesRepo.includes("listRecentLeadMessagesForWebhook"), "Webhook context loader missing.");
assert(leadMessagesRepo.includes("getSupabaseWriteClient"), "Webhook context loader must use server-only write/admin client in Supabase mode.");

const safety = read("lib/whatsapp-safety.ts");
for (const phrase of [
  "calendarEventId",
  "final appointment confirmation without calendar event",
  "appointment confirmed",
  "we have booked",
  "your appointment has been arranged",
  "confirmed no permit",
  "guaranteed",
  "we can definitely"
]) {
  assert(safety.includes(phrase), `Safety validator missing v5 booking/safety block: ${phrase}`);
}

const calendarConfig = read("lib/calendar-config.ts");
for (const phrase of [
  "CALENDAR_BOOKING_ENABLED",
  "CALENDAR_BOSS_APPROVAL_REQUIRED",
  "CALENDAR_AUTO_BOOKING_ENABLED",
  "GOOGLE_CALENDAR_CONNECTED",
  "GOOGLE_CALENDAR_ID",
  "GOOGLE_CALENDAR_TIMEZONE",
  "bookingEnabled",
  "bossApprovalRequired",
  "autoBookingEnabled",
  "liveBookingAvailable"
]) {
  assert(calendarConfig.includes(phrase), `Calendar config missing ${phrase}`);
}

const calendarBooking = read("lib/calendar-booking.ts");
for (const phrase of [
  "detectAppointmentIntent",
  "evaluateBookingReadiness",
  "needs_info",
  "ready_for_boss_review",
  "approved_for_booking",
  "booked",
  "Do not confirm booking until event is created.",
  "address_or_area",
  "floor_plan_or_site_photos",
  "preferred_date_time"
]) {
  assert(calendarBooking.includes(phrase), `Calendar booking foundation missing ${phrase}`);
}
assert(!/getDay\(\)\s*===\s*0[\s\S]{0,80}(blocked|return false|continue)/i.test(calendarBooking), "Calendar booking must not hardcode Sunday blocked.");

const calendarAdapter = read("lib/adapters/calendar-adapter.ts");
assert(calendarAdapter.includes("createEvent"), "Calendar adapter interface must support createEvent.");
assert(calendarAdapter.includes("status: \"disabled\""), "Calendar adapter must use disabled implementation by default.");
assert(!/return\s*\{[\s\S]{0,120}status:\s*"created"/.test(calendarAdapter), "Disabled calendar adapter must not fake successful bookings.");

const appointmentEngine = read("lib/appointment-engine.ts");
for (const type of [
  "site_visit",
  "phone_review",
  "zoom_review",
  "landed_aa_review",
  "condo_renovation_review",
  "commercial_renovation_review"
]) {
  assert(appointmentEngine.includes(type), `Appointment engine missing appointment type: ${type}`);
}
assert(appointmentEngine.includes("sunday"), "Sunday must remain settings-controlled in appointment engine.");

const health = read("app/api/whatsapp/health/route.ts");
for (const field of [
  "openaiWhatsappReplyEnabled",
  "hasOpenaiApiKey",
  "whatsappReplyBrainDebug",
  "calendarBookingEnabled",
  "calendarBossApprovalRequired",
  "calendarAutoBookingEnabled",
  "googleCalendarConnected",
  "hasGoogleCalendarId",
  "hasCalendarTimezone"
]) {
  assert(health.includes(field), `WhatsApp health endpoint missing v5 boolean: ${field}`);
}
assert(!/return\s+process\.env/.test(health), "Health endpoint must not return raw env values.");

const adapter = read("lib/adapters/whatsapp-adapter.ts");
for (const phrase of [
  "messaging_product: \"whatsapp\"",
  "recipient_type: \"individual\"",
  "to: toDigits",
  "type: \"text\"",
  "preview_url: false",
  "body: safeBody",
  "https://graph.facebook.com/${runtime.graphVersion}/${phoneNumberId}/messages",
  "Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`",
  "\"Content-Type\": \"application/json\""
]) {
  assert(adapter.includes(phrase), `Known-good WhatsApp adapter payload contract changed/missing: ${phrase}`);
}

const leadDetail = read("app/leads/[id]/page.tsx");
for (const phrase of [
  "WhatsApp Sales Brain",
  "Reply intelligence and safety metadata",
  "Reply source",
  "Tone result",
  "Repetition result",
  "Booking readiness",
  "Calendar Foundation",
  "Boss-approved booking only",
  "Mark Ready for Appointment Review",
  "Approve Booking",
  "Reject / Need More Info",
  "Calendar Connection Not Enabled"
]) {
  assert(leadDetail.includes(phrase), `Lead detail missing v5 UI phrase: ${phrase}`);
}

const leadCard = read("components/LeadCard.tsx");
for (const phrase of [
  "WhatsApp",
  "Appointment Requested",
  "Needs Floor Plan / Photos",
  "Last WhatsApp message",
  "Booking readiness"
]) {
  assert(leadCard.includes(phrase), `Lead card missing v5 WhatsApp/booking display: ${phrase}`);
}

const actions = read("lib/actions.ts");
const leadsRepo = read("lib/data/leads-repository.ts");
for (const action of [
  "appointment_review_requested",
  "appointment_missing_info_requested",
  "appointment_booking_approved",
  "calendar_event_create_requested",
  "calendar_event_create_failed"
]) {
  assert(actions.includes(action) || leadsRepo.includes(action), `Booking workflow audit action missing: ${action}`);
}

const settings = read("app/settings/page.tsx");
for (const phrase of [
  "OpenAI WhatsApp reply brain",
  "Calendar booking enabled",
  "Calendar boss approval required",
  "Calendar auto booking",
  "Google Calendar connected",
  "Calendar timezone"
]) {
  assert(settings.includes(phrase), `Settings page missing v5 system health phrase: ${phrase}`);
}

for (const file of [
  "app/leads/[id]/page.tsx",
  "components/LeadCard.tsx"
]) {
  const content = read(file).toLowerCase();
  for (const forbidden of [
    "free consultation",
    "quote range",
    "rough estimate",
    "estimated price",
    "package price",
    "we can definitely",
    "guaranteed approval"
  ]) {
    assert(!content.includes(forbidden), `${file} contains forbidden wording: ${forbidden}`);
  }
}

const docs = [
  "V5_0_WHATSAPP_SALES_BRAIN_AND_CALENDAR_FOUNDATION_REPORT.md",
  "CALENDAR_BOOKING_SETUP_GUIDE.md",
  "CALENDAR_BOOKING_SAFETY_RULES.md",
  "WHATSAPP_AUTO_REPLY_SAFETY_RULES.md",
  "WHATSAPP_LIVE_TEST_SETUP_GUIDE.md",
  "LIVE_INTEGRATION_PRODUCTION_PROOF_PLAYBOOK.md"
].map(read).join("\n");
for (const phrase of [
  "OpenAI WhatsApp reply is off by default",
  "Calendar booking disabled by default",
  "Boss approval required",
  "Do not confirm booking until event is created",
  "known-good WhatsApp payload",
  "initial project review"
]) {
  assert(docs.includes(phrase), `v5 docs missing phrase: ${phrase}`);
}

console.log("PASS: v5 WhatsApp sales brain and Calendar foundation static tests passed.");
