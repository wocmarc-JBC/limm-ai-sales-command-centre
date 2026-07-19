import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const packageJson = JSON.parse(read("package.json"));
const controlRepo = read("lib/data/whatsapp-lead-control-repository.ts");
const autoReply = read("lib/whatsapp-auto-reply.ts");
const webhook = read("app/api/whatsapp/webhook/route.ts");
const proofRepo = read("lib/data/whatsapp-webhook-failures-repository.ts");
const health = read("app/api/whatsapp/health/route.ts");
const deployedProof = read("scripts/verify_deployed_production_proof.mjs");
const schemaGate = read("scripts/verify_production_schema_gate.mjs");
const teamWorkspace = read("components/inbox/InboxTeamWorkspace.tsx");
const inbox = read("components/inbox/MultiChatInbox.tsx");

assert.ok(packageJson.version >= "11.1.3");
assert.ok(packageJson.scripts["test:v11.1.3"]?.includes("test_v11_1_3_outbound_hotfix.mjs"));
assert.ok(packageJson.scripts.verify.includes("test:v11.1.3") || packageJson.scripts.verify.includes("test:v11.2.0"));

assert.ok(controlRepo.startsWith('import "server-only";'));
assert.ok(controlRepo.includes("getSupabaseAdminClient"));
assert.ok(controlRepo.includes('select("id,bot_paused,bot_paused_at,bot_paused_by,bot_pause_reason,needs_marcus")'));
assert.equal(controlRepo.includes("getSupabaseServerClient"), false, "Webhook control state must not depend on a browser/user session.");
assert.equal(controlRepo.includes('.select("*")'), false, "Trusted webhook read must remain minimal-column.");
assert.equal(/\.insert\(|\.update\(|\.delete\(/.test(controlRepo), false, "Trusted webhook control reader must remain read-only.");

assert.equal(autoReply.includes("getLeadById"), false, "Live webhook must not use the user-scoped lead reader.");
assert.equal((autoReply.match(/getWhatsAppLeadControlState\(lead\.id\)/g) ?? []).length, 2, "Burst and final send guards must both use the trusted reader.");
assert.ok(autoReply.includes('terminalOutcome: "unexpected_no_send"'));
assert.ok(autoReply.includes('terminalOutcome: "intentional_no_send"'));
assert.ok(autoReply.includes('terminalOutcome: "outbound_sent"'));
assert.ok(autoReply.includes('terminalOutcome: "outbound_send_failed"'));

const duplicateIndex = autoReply.indexOf('status: "ignored_duplicate"');
const finalControlIndex = autoReply.indexOf("const finalLeadControl = await getWhatsAppLeadControlState(lead.id)");
const pauseIndex = autoReply.indexOf("if (finalLeadState.botPaused)", finalControlIndex);
const unavailableIndex = autoReply.indexOf('suppressionReason: "final_human_takeover_state_unavailable"', finalControlIndex);
const sendCall = "adapter.sendReply(senderPhone, reply)";
const sendIndex = autoReply.indexOf(sendCall);
assert.ok(duplicateIndex > 0 && duplicateIndex < sendIndex, "Duplicate inbound must terminate before Meta send.");
assert.ok(finalControlIndex > 0 && finalControlIndex < pauseIndex && pauseIndex < sendIndex, "Active/paused control state must be resolved before Meta send.");
assert.ok(unavailableIndex > pauseIndex && unavailableIndex < sendIndex, "Unavailable control state must fail closed before Meta send.");
assert.equal((autoReply.match(new RegExp(sendCall.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 1, "Live handler must retain exactly one Meta send call.");

if (packageJson.version === "11.1.3") {
  for (const marker of [
    "unexpectedNoSendCount", "outboundSendFailedCount", "completionDegraded",
    "firstTerminalOutcome", "outboundTerminalProof", 'releaseVersion: "11.1.3"'
  ]) assert.ok(webhook.includes(marker), `Webhook completion telemetry missing ${marker}`);
  assert.ok(webhook.includes('status: completionDegraded ? "degraded" : "ok"'));
} else {
  for (const marker of ["enqueueWhatsAppInboundMessages", "processWhatsAppInboundJob", 'releaseVersion: "11.2.0"']) {
    assert.ok(webhook.includes(marker), `Durable webhook telemetry missing ${marker}`);
  }
}

for (const marker of [
  'WHATSAPP_OUTBOUND_PROOF_RELEASE = "11.1.3"', "lastReleaseOutboundAt",
  'outboundTerminalProof: true', '.eq("status", "ok")'
]) assert.ok(proofRepo.includes(marker), `Outbound production proof missing ${marker}`);
for (const marker of [
  'version: "v11_1_3_outbound_hotfix"', "trustedWebhookLeadControlReadAvailable",
  "unexpectedNoSendTelemetryAvailable", "outboundTerminalProofRequired",
  "freshV1113RealInboundProofObserved", "freshV1113RealOutboundProofObserved"
]) assert.ok(health.includes(marker), `Health contract missing ${marker}`);
assert.ok(deployedProof.includes("--readiness-only"));
assert.ok(deployedProof.includes("fresh_v11_1_3_outbound_terminal_proof_missing"));

for (const column of ["bot_paused", "bot_paused_at", "bot_paused_by", "bot_pause_reason", "needs_marcus"]) {
  assert.ok(schemaGate.includes(`"${column}"`), `Production schema gate missing ${column}`);
}

for (const marker of ["Assign to me", "does not pause bot", "Bot state unchanged"]) {
  assert.ok(teamWorkspace.includes(marker), `Assignment clarity missing ${marker}`);
}
for (const marker of ["inbox-header-automation-control", "Pause bot", "Resume bot"]) {
  assert.ok(inbox.includes(marker), `Visible bot control missing ${marker}`);
}
assert.ok(inbox.includes('href={selectionMode ? undefined : `/inbox?lead=${encodeURIComponent(chat.id)}`}'));
assert.ok(inbox.includes('role={selectionMode ? "button" : undefined}'));

console.log("PASS: v11.1.3 trusted webhook control reads, outbound terminal telemetry, proof gate, inbox control clarity, and progressive mobile navigation checks passed.");
