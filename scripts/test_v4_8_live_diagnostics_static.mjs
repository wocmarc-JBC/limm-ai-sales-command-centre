import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

for (const file of [
  "app/api/whatsapp/health/route.ts",
  "app/api/whatsapp/debug-parse/route.ts",
  "app/api/whatsapp/webhook/route.ts",
  "scripts/test_v4_8_whatsapp_live_payload.mjs",
  "scripts/check_v4_8_vercel_whatsapp_health.mjs",
  "V4_8_WHATSAPP_LIVE_DIAGNOSTIC_FIX_REPORT.md"
]) {
  assert(exists(file), `Missing live diagnostic file: ${file}`);
}

const health = read("app/api/whatsapp/health/route.ts");
for (const key of [
  "v6_3_sales_collection_command_centre",
  "hasSupabaseUrl",
  "hasSupabaseAnonKey",
  "hasServiceRoleKey",
  "liveInboundEnabled",
  "testAutoReplyEnabled",
  "publicAutoReplyEnabled",
  "testMode",
  "hasWhatsappVerifyToken",
  "hasWhatsappAppSecret",
  "hasWhatsappPhoneNumberId",
  "hasWhatsappAccessToken",
  "hasWhatsappBusinessNumber"
]) {
  assert(health.includes(key), `Health endpoint missing ${key}`);
}
assert(!/process\.env\[[^\]]+\]\s*[,}]/.test(health), "Health endpoint must not return raw env values.");

const debugParse = read("app/api/whatsapp/debug-parse/route.ts");
for (const phrase of [
  "WHATSAPP_TEST_MODE",
  "WHATSAPP_DEBUG_ENDPOINT_ENABLED",
  "parseWhatsAppInbound",
  "debug_endpoint_disabled",
  "payload_parse_failed",
  "textFound",
  "senderFound",
  "providerMessageIdFound",
  "messageType"
]) {
  assert(debugParse.includes(phrase), `Debug parse endpoint missing ${phrase}`);
}
assert(!/saveLeadMessage|upsertWhatsAppLead|createAuditLog|sendReply/.test(debugParse), "Debug parse endpoint must not write or send.");

const webhook = read("app/api/whatsapp/webhook/route.ts");
const requiredMarkers = [
  "whatsapp_webhook_received_start",
  "whatsapp_body_read_started",
  "whatsapp_body_read_ok",
  "whatsapp_signature_check_started",
  "whatsapp_signature_verified",
  "whatsapp_payload_parse_started",
  "whatsapp_payload_parsed",
  "whatsapp_unsupported_payload",
  "whatsapp_config_checked",
  "whatsapp_auto_reply_enabled_state",
  "config_error",
  "duplicate_message",
  "blocked_unsafe",
  "send_failed_logged",
  "top_level_webhook_failure"
];
for (const marker of requiredMarkers) {
  assert(webhook.includes(marker), `Webhook route missing diagnostic marker or safe response: ${marker}`);
}
assert(/console\.info\("whatsapp_webhook_received_start"\)/.test(webhook), "Webhook POST must log the first start marker.");
assert(webhook.includes("await request.arrayBuffer()"), "Webhook must read exact raw bytes before signature verification and parsing.");
assert(webhook.includes("JSON.parse(rawBody)"), "Webhook must parse JSON inside the guarded handler.");
assert(webhook.includes("missing") && webhook.includes("SUPABASE_SERVICE_ROLE_KEY"), "Webhook must return missing config names safely.");
assert(webhook.includes("WHATSAPP_APP_SECRET") && webhook.includes("x-hub-signature-256"), "Webhook POST must verify Meta's HMAC signature.");
assert(webhook.includes("WHATSAPP_AUTO_REPLY_MODE_VALID"), "Webhook must validate the public/test mode pairing safely.");
assert(!webhook.includes("WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false"), "Webhook must not force closed-test public=false after Marcus live approval.");
assert(!webhook.includes("WHATSAPP_TEST_MODE=true"), "Webhook must not force closed-test mode after Marcus live approval.");
assert(webhook.includes("handleWhatsAppInboundMessage"), "Webhook must still use the closed-test handler.");
assert(!/return NextResponse\.json\(\{\s*ok:\s*true\s*\}\s*\)/.test(webhook), "Webhook must not return a fake success without processing reason.");

const service = read("lib/whatsapp-auto-reply.ts");
for (const marker of [
  "whatsapp_dedupe_checked",
  "whatsapp_lead_upsert_started",
  "whatsapp_lead_upserted",
  "whatsapp_inbound_message_save_started",
  "whatsapp_inbound_message_saved",
  "whatsapp_inbound_audit_started",
  "whatsapp_audit_written",
  "whatsapp_auto_reply_generate_started",
  "whatsapp_auto_reply_generated",
  "whatsapp_auto_reply_validation_started",
  "whatsapp_auto_reply_validation_passed",
  "whatsapp_auto_reply_send_started",
  "whatsapp_auto_reply_sent",
  "whatsapp_auto_reply_failed"
]) {
  assert(service.includes(marker), `WhatsApp service missing staged marker: ${marker}`);
}
assert(service.includes("autoReplyModeAllowed"), "WhatsApp service must accept closed test mode and Marcus-approved live mode.");
assert(!service.includes("Closed-test guard requires public auto-reply false and test mode true"), "WhatsApp service must not reject Marcus-approved live mode.");

const config = read("lib/whatsapp-config.ts");
for (const phrase of ["closedTestAutoReplyAllowed", "liveAutoReplyApproved", "autoReplyModeAllowed", "publicAutoReplyEnabled && !testMode"]) {
  assert(config.includes(phrase), `WhatsApp config missing live mode support: ${phrase}`);
}

const parser = read("lib/whatsapp-parser.ts");
assert(parser.includes("parseProviderTimestamp"), "WhatsApp parser must safely normalize provider timestamps.");
assert(!parser.includes("new Date(Number(message.timestamp) * 1000).toISOString()"), "WhatsApp parser must not throw on invalid timestamp.");

const payloadScript = read("scripts/test_v4_8_whatsapp_live_payload.mjs");
assert(payloadScript.includes("Hi, I want to renovate my landed house."), "Live payload script must send the requested realistic test text.");
assert(!/WHATSAPP_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY/.test(payloadScript), "Live payload script must not use secrets.");

const healthScript = read("scripts/check_v4_8_vercel_whatsapp_health.mjs");
for (const key of ["hasSupabaseUrl", "hasServiceRoleKey", "testAutoReplyEnabled", "hasWhatsappAccessToken"]) {
  assert(healthScript.includes(key), `Health check script missing ${key}`);
}
assert(!healthScript.includes("WHATSAPP_ACCESS_TOKEN"), "Health check script must inspect booleans only, not env secrets.");

console.log("PASS: v4.8 live WhatsApp diagnostics static tests passed.");
