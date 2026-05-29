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

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    output.push(full);
    if (entry.isDirectory()) walk(full, output);
  }
  return output;
}

for (const file of [
  "app/api/whatsapp/webhook/route.ts",
  "lib/whatsapp-config.ts",
  "lib/whatsapp-parser.ts",
  "lib/whatsapp-safety.ts",
  "lib/whatsapp-auto-reply.ts",
  "lib/adapters/whatsapp-adapter.ts",
  "lib/data/lead-messages-repository.ts",
  "lib/data/supabase-admin.ts",
  "supabase/migrations/018_v4_8_whatsapp_closed_test.sql",
  "V4_8_WHATSAPP_LIVE_CLOSED_TEST_REPORT.md",
  "WHATSAPP_LIVE_TEST_SETUP_GUIDE.md",
  "WHATSAPP_EMERGENCY_OFF_GUIDE.md",
  "WHATSAPP_AUTO_REPLY_SAFETY_RULES.md"
]) {
  assert(exists(file), `Missing v4.8 WhatsApp closed-test file: ${file}`);
}

const envExample = read(".env.example");
for (const line of [
  "WHATSAPP_LIVE_INBOUND_ENABLED=false",
  "WHATSAPP_TEST_AUTO_REPLY_ENABLED=false",
  "WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false",
  "WHATSAPP_TEST_MODE=true",
  "WHATSAPP_VERIFY_TOKEN=",
  "WHATSAPP_PHONE_NUMBER_ID=",
  "WHATSAPP_ACCESS_TOKEN=",
  "WHATSAPP_BUSINESS_NUMBER="
]) {
  assert(envExample.includes(line), `.env.example missing safe default: ${line}`);
}

const route = read("app/api/whatsapp/webhook/route.ts");
assert(route.includes("WHATSAPP_VERIFY_TOKEN"), "Webhook GET must use WHATSAPP_VERIFY_TOKEN.");
assert(route.includes("hub.challenge") && route.includes("hub.verify_token"), "Webhook GET must support Meta challenge verification.");
assert(route.includes("status: 403"), "Webhook GET must reject bad verify token.");
assert(route.includes("parseWhatsAppInbound"), "Webhook POST must parse WhatsApp payloads.");
assert(route.includes("handleWhatsAppInboundMessage"), "Webhook POST must delegate to closed-test handler.");

const parser = read("lib/whatsapp-parser.ts");
for (const phrase of ["senderPhone", "providerMessageId", "timestamp", "text", "businessPhoneNumberId"]) {
  assert(parser.includes(phrase), `Parser missing ${phrase}`);
}

const config = read("lib/whatsapp-config.ts");
for (const phrase of [
  "liveInboundEnabled",
  "testAutoReplyEnabled",
  "publicAutoReplyEnabled",
  "testMode",
  "closedTestAutoReplyAllowed",
  "!publicAutoReplyEnabled",
  "credentialsReady",
  "WhatsApp disabled by default"
]) {
  assert(config.includes(phrase), `WhatsApp config missing ${phrase}`);
}

const adapter = read("lib/adapters/whatsapp-adapter.ts");
assert(adapter.includes("server-only"), "WhatsApp Cloud API adapter must be server-only.");
assert(adapter.includes("WHATSAPP_ACCESS_TOKEN") && adapter.includes("WHATSAPP_PHONE_NUMBER_ID"), "WhatsApp adapter must use server-side Cloud API credentials.");
assert(adapter.includes("https://graph.facebook.com/"), "WhatsApp adapter must call Meta Graph API.");
assert(!/console\.log|console\.error/.test(adapter), "WhatsApp adapter must not print tokens or responses.");

const safety = read("lib/whatsapp-safety.ts");
for (const phrase of [
  "WHATSAPP_SAFE_FALLBACK_REPLY",
  "initial project review",
  "validateWhatsAppAutoReply",
  "free consultation",
  "quote range",
  "rough estimate",
  "package price",
  "appointment confirmed",
  "we have booked",
  "confirmed can hack",
  "confirmed no permit"
]) {
  assert(safety.includes(phrase), `WhatsApp safety validator missing ${phrase}`);
}

const service = read("lib/whatsapp-auto-reply.ts");
for (const action of [
  "whatsapp_inbound_received",
  "whatsapp_auto_reply_requested",
  "whatsapp_auto_reply_sent",
  "whatsapp_auto_reply_failed",
  "whatsapp_auto_reply_blocked_unsafe",
  "whatsapp_auto_reply_disabled"
]) {
  assert(service.includes(action), `WhatsApp service missing audit action: ${action}`);
}
for (const guard of [
  "!runtime.liveInboundEnabled",
  "!runtime.testAutoReplyEnabled",
  "runtime.publicAutoReplyEnabled",
  "!runtime.testMode",
  "!runtime.credentialsReady",
  "recentReplyCount >= 3",
  "findLeadMessageByProviderId",
  "runtime.businessNumber && senderPhone === runtime.businessNumber",
  "validateWhatsAppAutoReply",
  "WHATSAPP_SAFE_FALLBACK_REPLY"
]) {
  assert(service.includes(guard), `WhatsApp service missing closed-test guard: ${guard}`);
}
assert(!/setInterval|setTimeout\s*\(/.test(service), "WhatsApp service must not create retry loops.");

const messageRepo = read("lib/data/lead-messages-repository.ts");
for (const phrase of [
  "upsertWhatsAppLead",
  "saveLeadMessage",
  "findLeadMessageByProviderId",
  "countRecentWhatsAppAutoReplies",
  "provider_message_id",
  "whatsapp_status",
  "metadata"
]) {
  assert(messageRepo.includes(phrase), `Lead message repository missing ${phrase}`);
}

const migration = read("supabase/migrations/018_v4_8_whatsapp_closed_test.sql");
for (const phrase of ["provider_message_id", "provider_timestamp", "whatsapp_status", "metadata", "lead_messages_provider_message_id_unique"]) {
  assert(migration.includes(phrase), `WhatsApp migration missing ${phrase}`);
}
assert(read("supabase/MIGRATION_ORDER.md").includes("018_v4_8_whatsapp_closed_test.sql"), "Migration order missing v4.8 WhatsApp migration.");

const leadDetail = read("app/leads/[id]/page.tsx");
for (const phrase of [
  "WhatsApp Closed Test",
  "WhatsApp live closed test mode",
  "Public auto-reply disabled",
  "No pricing / no Calendar booking",
  "Auto-reply audit trail",
  "listLeadMessages"
]) {
  assert(leadDetail.includes(phrase), `Lead detail missing WhatsApp closed-test UI phrase: ${phrase}`);
}

const settings = read("app/settings/page.tsx");
for (const phrase of [
  "WhatsApp live inbound",
  "WhatsApp test auto-reply",
  "WhatsApp public auto-reply",
  "WhatsApp credentials",
  "WhatsApp closed-test posture"
]) {
  assert(settings.includes(phrase), `Settings/System Health missing WhatsApp status: ${phrase}`);
}

const frontendFiles = [
  ...walk(path.join(root, "app")),
  ...walk(path.join(root, "components"))
].filter((file) => /\.(ts|tsx)$/.test(file));
for (const file of frontendFiles) {
  const relative = path.relative(root, file);
  const content = fs.readFileSync(file, "utf8");
  assert(!/WHATSAPP_ACCESS_TOKEN/.test(content), `WhatsApp access token referenced in frontend route/component: ${relative}`);
  assert(!/WHATSAPP_PHONE_NUMBER_ID/.test(content), `WhatsApp phone number id referenced in frontend route/component: ${relative}`);
}

const docs = [
  "V4_8_WHATSAPP_LIVE_CLOSED_TEST_REPORT.md",
  "WHATSAPP_LIVE_TEST_SETUP_GUIDE.md",
  "WHATSAPP_EMERGENCY_OFF_GUIDE.md",
  "WHATSAPP_AUTO_REPLY_SAFETY_RULES.md"
].map(read).join("\n");
for (const phrase of [
  "WHATSAPP_TEST_AUTO_REPLY_ENABLED=false",
  "WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false",
  "closed test",
  "No Calendar booking",
  "No pricing",
  "Marcus-only"
]) {
  assert(docs.includes(phrase), `WhatsApp docs missing ${phrase}`);
}

console.log("PASS: v4.8 WhatsApp closed-test static tests passed.");
