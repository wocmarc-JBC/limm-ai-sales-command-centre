import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const target = path.join(ROOT, request.slice(2));
    if (fs.existsSync(target)) return target;
    if (fs.existsSync(`${target}.ts`)) return `${target}.ts`;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename
  }).outputText;
  module._compile(output, filename);
};

const {
  computeWhatsAppServiceWindow,
  getWhatsAppServiceWindowFromMessages,
  WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS,
  WHATSAPP_SEND_SAFETY_BUFFER_MS
} = require(path.join(ROOT, "lib/whatsapp-service-window.ts"));

const now = Date.parse("2026-07-21T12:00:00.000Z");
const isoBefore = (milliseconds) => new Date(now - milliseconds).toISOString();

assert.equal(computeWhatsAppServiceWindow(isoBefore(23 * 60 * 60 * 1000), now).status, "open");
assert.equal(computeWhatsAppServiceWindow(isoBefore(WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS + 1), now).status, "closed");
assert.equal(
  computeWhatsAppServiceWindow(isoBefore(WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS - WHATSAPP_SEND_SAFETY_BUFFER_MS / 2), now).reason,
  "expiry_safety_buffer"
);
assert.equal(computeWhatsAppServiceWindow(null, now).status, "unknown");
assert.equal(computeWhatsAppServiceWindow("not-a-date", now).canSendFreeform, false);

const replayedOldWebhook = getWhatsAppServiceWindowFromMessages([{
  direction: "inbound",
  providerTimestamp: isoBefore(33 * 60 * 60 * 1000),
  createdAt: new Date(now).toISOString()
}], now);
assert.equal(replayedOldWebhook.status, "closed", "Fresh database ingestion must never override an old Meta provider timestamp.");

const latestProviderTimestampWins = getWhatsAppServiceWindowFromMessages([
  { direction: "inbound", providerTimestamp: isoBefore(33 * 60 * 60 * 1000), createdAt: new Date(now).toISOString() },
  { direction: "inbound", providerTimestamp: isoBefore(2 * 60 * 60 * 1000), createdAt: isoBefore(60 * 60 * 1000) }
], now);
assert.equal(latestProviderTimestampWins.status, "open", "Out-of-order webhook ingestion must use Meta chronology.");

const manualRoute = read("app/api/inbox/send/route.ts");
const autoReply = read("lib/whatsapp-auto-reply.ts");
const inbox = read("components/inbox/MultiChatInbox.tsx");
const teamWorkspace = read("components/inbox/InboxTeamWorkspace.tsx");
const teamRoute = read("app/api/inbox/team/[leadId]/route.ts");
const teamRepository = read("lib/data/team-inbox-repository.ts");
const health = read("app/api/whatsapp/health/route.ts");
const packageJson = JSON.parse(read("package.json"));

assert.ok(manualRoute.indexOf("getWhatsAppServiceWindowForLead") < manualRoute.indexOf("new WhatsAppCloudApiAdapter"));
assert.ok(manualRoute.indexOf("whatsapp_service_window_closed") < manualRoute.indexOf("adapter.sendReply"));
assert.match(manualRoute, /externalSendAttempted: false/);
const autoWindowGuardIndex = autoReply.indexOf("getWhatsAppServiceWindowFromMessages(finalReplyMessages)");
assert.ok(autoWindowGuardIndex >= 0 && autoWindowGuardIndex < autoReply.indexOf("reserveWhatsAppConversationReply", autoWindowGuardIndex));
assert.ok(autoReply.indexOf("whatsapp_auto_reply_service_window_blocked", autoWindowGuardIndex) < autoReply.indexOf("adapter.sendReply", autoWindowGuardIndex));
assert.match(autoReply, /aiQualityEventId: liveQualityEventId/);
assert.match(autoReply, /linkAiQualityObservationsToMessage/);

assert.match(inbox, /WhatsApp 24-hour reply window is closed/);
assert.match(inbox, /data-testid="whatsapp-service-window-status"/);
assert.match(inbox, /disabled=\{!serviceWindowOpen\}/);
assert.match(inbox, /reply_blocked_service_window/);
assert.match(teamWorkspace, />Good<\/button>/);
assert.match(teamWorkspace, />Wrong<\/button>/);
assert.match(teamWorkspace, />Edited<\/button>/);
assert.match(teamWorkspace, /never messages the client/);
assert.match(teamRoute, /quality_review_requires_boss/);
assert.match(teamRoute, /reviewAiQualityObservation/);
assert.doesNotMatch(teamRoute, /recordAiQualityObservation\(\{/);
assert.match(teamRepository, /decision: input\.decision/);
assert.match(teamRepository, /reviewed_at: new Date\(\)\.toISOString\(\)/);
assert.match(teamRepository, /edit_distance: editDistance/);

assert.equal(packageJson.version, "11.4.1");
assert.match(packageJson.scripts["test:v11.4.1"], /test_v11_4_1_conversation_intelligence\.mjs/);
assert.match(health, /whatsappProviderTimestampServiceWindowGuardAvailable: true/);
assert.match(health, /marcusAiReplyLearningLoopAvailable: true/);

console.log("PASS v11.4.1 Meta-timestamp service-window guard, honest Inbox blocking, and Marcus-controlled AI reply learning loop");
