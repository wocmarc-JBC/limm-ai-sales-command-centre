import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const adapter = read("lib/adapters/whatsapp-adapter.ts");
const service = read("lib/whatsapp-auto-reply.ts");
const config = read("lib/whatsapp-config.ts");

for (const required of [
  "buildWhatsAppTextPayload",
  "messaging_product: \"whatsapp\"",
  "recipient_type: \"individual\"",
  "type: \"text\"",
  "preview_url: false",
  "body: safeBody",
  "JSON.stringify(payload)"
]) {
  assert(adapter.includes(required), `WhatsApp adapter payload shape missing ${required}`);
}

assert(config.includes('process.env.WHATSAPP_GRAPH_VERSION || "v21.0"'), "WhatsApp Graph API default must match the known-good v21.0 send URL.");
assert(adapter.includes("normalizeWhatsAppPhone(to)"), "WhatsApp adapter must normalize recipient to digits only.");
assert(adapter.includes("normalizeWhatsAppPhone(process.env.WHATSAPP_PHONE_NUMBER_ID"), "WhatsApp adapter must normalize phone number id before URL building.");
assert(adapter.includes("payload.to"), "WhatsApp adapter must send normalized recipient from payload.");
assert(!/to,\s*\n\s*type:\s*"text"/.test(adapter), "WhatsApp adapter must not send raw recipient value.");
assert(adapter.includes("Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`"), "WhatsApp adapter must send Bearer token server-side.");
assert(adapter.includes("\"Content-Type\": \"application/json\""), "WhatsApp adapter must set JSON content type.");
assert(adapter.includes("https://graph.facebook.com/${runtime.graphVersion}/${phoneNumberId}/messages"), "WhatsApp adapter must use runtime graph version and normalized phone number id.");

for (const required of [
  "WhatsAppCloudApiSendError",
  "response.text()",
  "metaCode",
  "metaMessage",
  "metaType"
]) {
  assert(adapter.includes(required), `WhatsApp adapter must preserve safe Meta error detail: ${required}`);
}

for (const required of [
  "whatsapp_auto_reply_send_payload_summary",
  "getWhatsAppSendPayloadSummary",
  "toDigitsLength",
  "bodyLength",
  "hasMessagingProduct",
  "hasRecipientType",
  "hasTextBody",
  "graphVersion"
]) {
  assert(service.includes(required) || adapter.includes(required), `WhatsApp send summary missing ${required}`);
}

for (const forbidden of [
  "free consultation",
  "quote range",
  "rough estimate",
  "package price",
  "appointment confirmed"
]) {
  assert(!adapter.toLowerCase().includes(forbidden), `WhatsApp adapter must not include forbidden phrase: ${forbidden}`);
}

console.log("PASS: WhatsApp adapter payload shape matches known-good Meta Graph send requirements.");
