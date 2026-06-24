import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const actions = read("lib/actions.ts");
const leadPage = read("app/leads/[id]/page.tsx");
const adapter = read("lib/adapters/whatsapp-adapter.ts");
const health = read("app/api/whatsapp/health/route.ts");

for (const phrase of [
  "sendManualWhatsAppReplyAction",
  "WhatsAppCloudApiAdapter",
  "getWhatsAppSendPayloadSummary",
  "adapter.sendReply(lead.phone, body)",
  "saveLeadMessage({",
  'direction: "outbound"',
  'whatsappStatus: "sent"',
  'whatsappStatus: "failed"',
  "metaMessageId",
  "takeOverLead(leadId, actor)",
  "pauseBotForLead(leadId",
  "whatsapp_manual_reply_send_payload_summary",
  "whatsapp_manual_reply_sent",
  "whatsapp_manual_reply_failed",
  "replaySafePostRedirect"
]) {
  assert(actions.includes(phrase), `manual outbound action missing ${phrase}`);
}

for (const phrase of [
  "sendManualWhatsAppTestAction",
  "adapter.sendReply(to, body)",
  "whatsapp_manual_test_send_payload_summary",
  "whatsapp_manual_test_sent",
  "whatsapp_manual_test_failed"
]) {
  assert(actions.includes(phrase), `manual test send action missing ${phrase}`);
}

for (const phrase of [
  "conversationMessages",
  ".sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())",
  'name="manual_reply_body"',
  "Send WhatsApp",
  "Manual WhatsApp reply sent",
  "Manual WhatsApp reply failed",
  "Test send to Marcus first",
  "Send Test",
  "Bot takeover is now active",
  "No pricing / no Calendar booking / no voice transcription"
]) {
  assert(leadPage.includes(phrase), `lead page missing manual conversation UI phrase ${phrase}`);
}

assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(leadPage), "lead page must not reference WhatsApp server credentials.");

for (const phrase of [
  'messaging_product: "whatsapp"',
  'recipient_type: "individual"',
  'type: "text"',
  "preview_url: false",
  "normalizeWhatsAppPhone(process.env.WHATSAPP_PHONE_NUMBER_ID",
  "Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`"
]) {
  assert(adapter.includes(phrase), `known-good WhatsApp adapter contract missing ${phrase}`);
}

for (const phrase of [
  "manualWhatsappOutboundReplyAvailable: true",
  "leadConversationTimelineAvailable: true",
  "manualTakeoverOnReplyAvailable: true",
  "whatsappManualTestSendAvailable: true",
  "replaySafeManualReplyPostRedirect: true",
  "priceGuideOnHold: true",
  "calendarAutoBookingEnabled: calendar.autoBookingEnabled",
  "voiceTranscriptionEnabled: false"
]) {
  assert(health.includes(phrase), `health proof missing ${phrase}`);
}

assert(!actions.includes("autoPricingEnabled: true"), "manual WhatsApp reply must not enable auto-pricing.");
assert(!actions.includes("calendarAutoBookingEnabled: true"), "manual WhatsApp reply must not enable calendar auto-booking.");
assert(!actions.includes("voiceTranscriptionEnabled: true"), "manual WhatsApp reply must not enable voice transcription.");

console.log("PASS: v9 manual WhatsApp outbound reply static test passed.");
