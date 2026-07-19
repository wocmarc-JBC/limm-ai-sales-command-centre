import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const packageJson = JSON.parse(read("package.json"));
const gate = read("scripts/verify_production_schema_gate.mjs");
const authGate = read("scripts/verify_authenticated_release_gate.mjs");
const deployedProof = read("scripts/verify_deployed_production_proof.mjs");
const recoveryRepo = read("lib/data/whatsapp-webhook-failures-repository.ts");
const messageRepo = read("lib/data/lead-messages-repository.ts");
const recoveryApi = read("app/api/operations/whatsapp-recovery/route.ts");
const recoveryPanel = read("components/operations/WhatsAppRecoveryPanel.tsx");
const operationsPage = read("app/operations/page.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const webhook = read("app/api/whatsapp/webhook/route.ts");
const migration = read("supabase/migrations/031_v11_1_1_whatsapp_persistence_recovery.sql");

assert.equal(packageJson.version, "11.1.2");
assert.ok(packageJson.scripts.build.indexOf("verify_production_schema_gate.mjs") < packageJson.scripts.build.indexOf("next build"), "Production schema gate must execute before Next.js build.");
assert.ok(packageJson.scripts["verify:authenticated-release"]);
assert.ok(packageJson.scripts["verify:deployed-production"]);

for (const marker of [
  "VERCEL_ENV", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "whatsapp_webhook_failures",
  "intake_profile", "whatsapp_conversation_concurrency_schema_ready", "world_class_operations_schema_ready",
  "process.exit(1)"
]) assert.ok(gate.includes(marker), `Production schema gate missing ${marker}`);
assert.equal(/\.insert\(|\.update\(|\.delete\(/.test(gate), false, "Production schema deployment gate must remain read-only.");

const cleanEnv = { PATH: process.env.PATH || "", HOME: process.env.HOME || "" };
const skipped = spawnSync(process.execPath, ["scripts/verify_production_schema_gate.mjs"], { cwd: root, encoding: "utf8", env: cleanEnv });
assert.equal(skipped.status, 0);
assert.match(skipped.stdout, /SKIP: production schema deployment gate/);
const blocked = spawnSync(process.execPath, ["scripts/verify_production_schema_gate.mjs", "--required"], { cwd: root, encoding: "utf8", env: cleanEnv });
assert.notEqual(blocked.status, 0);
assert.match(blocked.stderr, /requires the Supabase URL and a server-only service credential/);

for (const marker of ["SUPABASE_TEST_EMAIL", "SUPABASE_TEST_PASSWORD", "verify_live_authenticated_actions.mjs", "authenticated-boss.spec.ts", 'QA_E2E_MODE: "0"']) {
  assert.ok(authGate.includes(marker), `Authenticated release gate missing ${marker}`);
}
assert.ok(deployedProof.includes("freshV1112RealInboundProofObserved"));
assert.ok(deployedProof.includes("whatsappProductionSafetyReady"));

for (const marker of [
  "listPendingWhatsAppWebhookFailures", "recoverWhatsAppWebhookFailureToCrm", "limm-recovery:",
  "preserveExistingActivity: true", "recoveredFromFailureQueue", "getWhatsAppProductionProofSnapshot"
]) assert.ok(recoveryRepo.includes(marker), `Recovery repository missing ${marker}`);
assert.ok(messageRepo.includes("preserveExistingActivity?: boolean"));
assert.ok(messageRepo.includes("createdAt?: string"));

for (const marker of [
  'auth.profile.role !== "boss"', "sameOrigin(request)", "consumeRateLimit", "whatsapp_failure_recovered_to_crm",
  'recoveryMode: "crm_only_no_send"', "externalSendAttempted: false", "recordOperationalEvent"
]) assert.ok(recoveryApi.includes(marker), `Recovery API missing ${marker}`);
for (const forbidden of ["sendReply(", "handleWhatsAppInboundMessage", "orchestrateWhatsAppConversationReply", "whatsapp-adapter"]) {
  assert.equal(recoveryApi.includes(forbidden), false, `Recovery API must not use ${forbidden}`);
}

for (const marker of ["Boss-only recovery", "Recover to CRM — no send", "No client reply was sent", "Refresh queue"]) {
  assert.ok(recoveryPanel.includes(marker), `Recovery panel missing ${marker}`);
}
assert.ok(operationsPage.includes("WhatsAppRecoveryPanel"));
assert.ok(operationsPage.includes('auth.profile.role === "boss"'));
for (const marker of [
  'version: "v11_1_2_production_proof"', "productionSchemaDeploymentGateAvailable", "bossOnlyFailureRecoveryWorkspaceAvailable",
  "freshV1112RealInboundProofObserved", "whatsappRecoveryProofSchemaReady"
]) assert.ok(health.includes(marker), `Production health missing ${marker}`);
assert.ok(webhook.includes('releaseVersion: "11.1.2"'));

for (const marker of [
  "revoke all on table public.whatsapp_webhook_failures from public, anon, authenticated",
  "grant select, insert, update, delete on table public.whatsapp_webhook_failures to service_role",
  "alter table public.whatsapp_webhook_failures enable row level security"
]) assert.ok(migration.includes(marker), `Service-only recovery table missing ${marker}`);

console.log("PASS: v11.1.2 production schema gate, boss-only no-send recovery, proof telemetry, and authenticated QA gate checks passed.");
