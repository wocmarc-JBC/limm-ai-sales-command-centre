import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
  InMemoryConversationReplyLeaseCoordinator,
  WHATSAPP_REPLY_COOLDOWN_SECONDS,
  findNewInboundProviderIds,
  latestInboundMessage,
  replyReservationBucket
} = require(path.join(ROOT, "lib/whatsapp-conversation-concurrency.ts"));

const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const now = Date.parse("2026-07-18T04:00:00.000Z");
const coordinator = new InMemoryConversationReplyLeaseCoordinator();
const workerTokens = Array.from({ length: 8 }, (_, index) => `worker-${index + 1}`);
const workerAttempts = await Promise.all(workerTokens.map(async (ownerToken) => coordinator.acquire({
  leadId: "concurrent-lead",
  ownerToken,
  directQuestion: false,
  nowMs: now
})));
const winners = workerAttempts
  .map((result, index) => ({ result, ownerToken: workerTokens[index] }))
  .filter(({ result }) => result.acquired);
check("Eight concurrent workers receive exactly one send lease", winners.length === 1, JSON.stringify(workerAttempts));
check("All losing workers are blocked by active processing", workerAttempts.filter((result) => !result.acquired).every((result) => result.reason === "active_processing"), JSON.stringify(workerAttempts));

const activeDirectQuestion = coordinator.acquire({
  leadId: "concurrent-lead",
  ownerToken: "direct-question-worker",
  directQuestion: true,
  nowMs: now + 1
});
check("A direct question cannot bypass an active worker", !activeDirectQuestion.acquired && activeDirectQuestion.reason === "active_processing", JSON.stringify(activeDirectQuestion));

const winningOwner = winners[0]?.ownerToken ?? "";
const wrongOwnerReservation = coordinator.reserve({
  leadId: "concurrent-lead",
  ownerToken: "wrong-owner",
  replySignature: "reply-a",
  nowMs: now + 2
});
check("Reservation requires current lease ownership", !wrongOwnerReservation.reserved && wrongOwnerReservation.reason === "lease_not_owned", JSON.stringify(wrongOwnerReservation));

const firstReservation = coordinator.reserve({
  leadId: "concurrent-lead",
  ownerToken: winningOwner,
  replySignature: "reply-a",
  nowMs: now + 3
});
const duplicateReservation = coordinator.reserve({
  leadId: "concurrent-lead",
  ownerToken: winningOwner,
  replySignature: "reply-a",
  nowMs: now + 4
});
check("First exact reply reservation succeeds", firstReservation.reserved && Boolean(firstReservation.reservationId), JSON.stringify(firstReservation));
check("Duplicate exact reply reservation in the same bucket is blocked", !duplicateReservation.reserved && duplicateReservation.reason === "duplicate_reply_reservation", JSON.stringify(duplicateReservation));
check("Reservation bucket is stable inside the ten-minute window", replyReservationBucket(now) === replyReservationBucket(now + 9 * 60 * 1000));

const boundaryCoordinator = new InMemoryConversationReplyLeaseCoordinator();
const boundaryStart = Date.parse("2026-07-18T04:09:59.900Z");
boundaryCoordinator.acquire({ leadId: "boundary-lead", ownerToken: "boundary-owner", directQuestion: false, nowMs: boundaryStart });
const beforeBoundary = boundaryCoordinator.reserve({
  leadId: "boundary-lead",
  ownerToken: "boundary-owner",
  replySignature: "boundary-reply",
  nowMs: boundaryStart
});
const afterBoundary = boundaryCoordinator.reserve({
  leadId: "boundary-lead",
  ownerToken: "boundary-owner",
  replySignature: "boundary-reply",
  nowMs: boundaryStart + 200
});
check("Boundary fixture crosses fixed reservation buckets", replyReservationBucket(boundaryStart) !== replyReservationBucket(boundaryStart + 200));
check("Rolling ten-minute reservation window blocks duplicates across a bucket boundary", beforeBoundary.reserved && !afterBoundary.reserved && afterBoundary.reason === "duplicate_reply_reservation", JSON.stringify(afterBoundary));

const renewalCoordinator = new InMemoryConversationReplyLeaseCoordinator();
renewalCoordinator.acquire({ leadId: "renewal-lead", ownerToken: "renewal-owner", directQuestion: false, nowMs: now, leaseSeconds: 15 });
renewalCoordinator.reserve({ leadId: "renewal-lead", ownerToken: "renewal-owner", replySignature: "renewed-reply", nowMs: now + 14_000 });
const afterOriginalExpiry = renewalCoordinator.acquire({
  leadId: "renewal-lead",
  ownerToken: "late-worker",
  directQuestion: true,
  nowMs: now + 16_000
});
check("Reply reservation renews the lease through the external send boundary", !afterOriginalExpiry.acquired && afterOriginalExpiry.reason === "active_processing", JSON.stringify(afterOriginalExpiry));

check("Only the lease owner can release", coordinator.release({ leadId: "concurrent-lead", ownerToken: "wrong-owner", cooldownSeconds: 30, nowMs: now + 5 }) === false);
check("Lease owner releases with reply cooldown", coordinator.release({
  leadId: "concurrent-lead",
  ownerToken: winningOwner,
  cooldownSeconds: WHATSAPP_REPLY_COOLDOWN_SECONDS,
  nowMs: now + 5
}) === true);
const cooldownAttempt = coordinator.acquire({
  leadId: "concurrent-lead",
  ownerToken: "cooldown-worker",
  directQuestion: false,
  nowMs: now + 6
});
check("Normal burst messages are coalesced during cooldown", !cooldownAttempt.acquired && cooldownAttempt.reason === "cooldown_active", JSON.stringify(cooldownAttempt));
const directAfterRelease = coordinator.acquire({
  leadId: "concurrent-lead",
  ownerToken: "direct-after-release",
  directQuestion: true,
  nowMs: now + 7
});
check("A direct question may bypass cooldown after the active worker releases", directAfterRelease.acquired, JSON.stringify(directAfterRelease));

function inbound(id, createdAt) {
  return {
    id,
    leadId: "concurrent-lead",
    direction: "inbound",
    channel: "whatsapp",
    body: id,
    safeToSend: false,
    providerMessageId: `wamid.${id}`,
    providerTimestamp: createdAt,
    whatsappStatus: "received",
    metadata: {},
    createdAt
  };
}
const plannedMessages = [inbound("one", "2026-07-18T04:00:00.000Z")];
const refreshedMessages = [...plannedMessages, inbound("two", "2026-07-18T04:00:01.000Z")];
check("Final refresh detects inbound messages that arrived during planning", findNewInboundProviderIds(plannedMessages, refreshedMessages).join(",") === "wamid.two");
check("Final refresh does not invent new inbound messages", findNewInboundProviderIds(refreshedMessages, refreshedMessages).length === 0);
check("Burst owner selects the newest inbound regardless of query order", latestInboundMessage([refreshedMessages[1], refreshedMessages[0]])?.providerMessageId === "wamid.two");

const handler = read("lib/whatsapp-auto-reply.ts");
const acquireIndex = handler.indexOf("acquireWhatsAppConversationReplyLease({");
const plannerIndex = handler.indexOf("orchestrateWhatsAppConversationReply({");
const finalRefreshIndex = handler.indexOf("let finalReplyMessages:");
const reservationIndex = handler.indexOf("reserveWhatsAppConversationReply({");
const sendIndex = handler.indexOf("adapter.sendReply(senderPhone, reply)");
const releaseIndex = handler.indexOf("releaseWhatsAppConversationReplyLease({");
check("Live planner runs only after the cross-instance lease", acquireIndex >= 0 && plannerIndex > acquireIndex, `${acquireIndex}:${plannerIndex}`);
check("Live path refreshes conversation state after planning and before reservation", finalRefreshIndex > plannerIndex && reservationIndex > finalRefreshIndex, `${plannerIndex}:${finalRefreshIndex}:${reservationIndex}`);
check("Burst owner replans from the newest inbound instead of the first webhook", handler.includes("latestInboundMessage(recentMessages)") && handler.includes("inboundMessageText: replyInboundBody") && handler.includes("whatsapp_inbound_burst_reclassified_from_latest_message"));
check("Atomic reservation is written before the Meta send call", reservationIndex >= 0 && sendIndex > reservationIndex, `${reservationIndex}:${sendIndex}`);
check("Conversation lease is released from a finally block", handler.includes("} finally {") && releaseIndex > sendIndex, `${sendIndex}:${releaseIndex}`);
check("Lease and reservation failures suppress sends closed", handler.includes("Conversation safety lease unavailable; no auto-reply was sent.") && handler.includes("Atomic reply reservation unavailable; no auto-reply was sent."));
check("Successful external send activates the full cooldown", handler.includes("replyLeaseCooldownSeconds = WHATSAPP_REPLY_COOLDOWN_SECONDS"));
check("Successful and failed sends complete their reservation state", handler.includes('status: "sent"') && handler.includes('status: "failed"'));

const migration = read("supabase/migrations/028_v10_2_1_whatsapp_conversation_concurrency.sql");
for (const marker of [
  "whatsapp_conversation_reply_leases",
  "whatsapp_reply_reservations",
  "acquire_whatsapp_conversation_reply_lease",
  "release_whatsapp_conversation_reply_lease",
  "reserve_whatsapp_conversation_reply",
  "whatsapp_conversation_concurrency_schema_ready",
  "whatsapp_reply_reservations_signature_bucket_uidx",
  "reserved_at > v_now - interval '10 minutes'",
  "v_now + interval '90 seconds'",
  "migration 027 is required",
  "security definer",
  "grant execute",
  "revoke all"
]) {
  check(`Migration includes ${marker}`, migration.toLowerCase().includes(marker.toLowerCase()));
}

const failures = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.name}${!item.passed && item.detail ? ` — ${item.detail}` : ""}`);
if (failures.length) process.exit(1);
console.log(`PASS: WhatsApp conversation concurrency safety (${checks.length} checks).`);
