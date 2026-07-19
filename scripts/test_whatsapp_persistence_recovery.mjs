import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function loadTypeScriptCommonJs(relativePath) {
  const compiled = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: relativePath,
    reportDiagnostics: true
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, `${relativePath} must transpile cleanly.`);
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", compiled.outputText)(
    createRequire(import.meta.url),
    loadedModule,
    loadedModule.exports
  );
  return loadedModule.exports;
}

const { INTENT_GATE_INSERT_COLUMNS, nextWhatsAppLeadCompatibilityRow } = loadTypeScriptCommonJs(
  "lib/data/lead-schema-compatibility.ts"
);

const representativeRow = {
  client_name: "WhatsApp Contact",
  phone: "6590000000",
  intake_profile: { trace: { intentGate: {} } },
  conversation_intent: "unclear_intent",
  lead_eligible: false,
  conversation_route: "intent_review",
  intent_confidence: 0,
  intent_reason_codes: ["awaiting_pre_sales_intent_classification"],
  intent_classifier_version: "v10.2.0",
  intent_classified_at: null,
  conversation_safety_state: {}
};

const withoutIntakeProfile = nextWhatsAppLeadCompatibilityRow(representativeRow, {
  code: "PGRST204",
  message: "Could not find the 'intake_profile' column of 'leads' in the schema cache"
});
assert.ok(withoutIntakeProfile, "Missing intake_profile must produce one safe compatibility retry row.");
assert.equal(Object.hasOwn(withoutIntakeProfile, "intake_profile"), false);
assert.equal(withoutIntakeProfile.conversation_intent, "unclear_intent", "Available intent-gate columns must be preserved.");

const withoutIntentGate = nextWhatsAppLeadCompatibilityRow(withoutIntakeProfile, {
  code: "PGRST204",
  message: "Could not find the 'conversation_intent' column of 'leads' in the schema cache"
});
assert.ok(withoutIntentGate, "An older pre-intent schema must receive the bounded second compatibility row.");
for (const column of INTENT_GATE_INSERT_COLUMNS) {
  assert.equal(Object.hasOwn(withoutIntentGate, column), false, `Compatibility row must omit ${column}.`);
}
assert.equal(withoutIntentGate.phone, representativeRow.phone);

assert.equal(
  nextWhatsAppLeadCompatibilityRow(representativeRow, {
    code: "PGRST204",
    message: "Could not find the 'phone' column of 'leads' in the schema cache"
  }),
  null,
  "Required base-column drift must fail closed instead of silently deleting required data."
);
assert.equal(
  nextWhatsAppLeadCompatibilityRow(representativeRow, { code: "23505", message: "duplicate key" }),
  null,
  "Non-schema errors must never trigger a compatibility retry."
);

const leadRepository = read("lib/data/lead-messages-repository.ts");
assert.ok(leadRepository.includes("nextWhatsAppLeadCompatibilityRow"));
assert.match(leadRepository, /attempt < 3/);
assert.equal(leadRepository.includes("!INTENT_GATE_INSERT_COLUMNS.has(column)"), false, "The old blanket retry must remain removed.");

const migration = read("supabase/migrations/031_v11_1_1_whatsapp_persistence_recovery.sql");
for (const marker of [
  "add column if not exists intake_profile jsonb",
  "create index if not exists leads_intake_profile_gin",
  "create table if not exists public.whatsapp_webhook_failures",
  "provider_message_id_hash text not null unique",
  "message_body text not null",
  "attempt_count = public.whatsapp_webhook_failures.attempt_count + 1",
  "alter table public.whatsapp_webhook_failures enable row level security",
  "revoke all on table public.whatsapp_webhook_failures from public, anon, authenticated",
  "for all to service_role using (true) with check (true)",
  "security invoker",
  "set search_path = ''",
  "expires_at = now() + interval '14 days'"
]) {
  assert.ok(migration.includes(marker), `Migration 031 missing ${marker}.`);
}
assert.equal(migration.includes("security definer"), false, "Failure capture does not need RLS bypass privileges.");

const failureRepository = read("lib/data/whatsapp-webhook-failures-repository.ts");
for (const marker of [
  "captureWhatsAppWebhookFailure",
  "markWhatsAppWebhookFailureRecovered",
  "purgeExpiredWhatsAppWebhookFailures",
  "classifyWhatsAppProcessingFailure",
  'admin.rpc("capture_whatsapp_webhook_failure"',
  "hashProviderMessageId"
]) {
  assert.ok(failureRepository.includes(marker), `Failure repository missing ${marker}.`);
}
assert.equal(failureRepository.includes("console.warn(input.message"), false, "Failure logging must not print client content.");
assert.ok(failureRepository.includes('.lt("expires_at", now.toISOString())'), "Expired recovery content must be purged automatically.");

const webhook = read("app/api/whatsapp/webhook/route.ts");
const handlerIndex = webhook.indexOf("await handleWhatsAppInboundMessage(message)");
const recoveredIndex = webhook.indexOf("await markWhatsAppWebhookFailureRecovered", handlerIndex);
const catchIndex = webhook.indexOf("} catch (error) {", handlerIndex);
const captureIndex = webhook.indexOf("await captureWhatsAppWebhookFailure", catchIndex);
const telemetryIndex = webhook.indexOf("await recordOperationalEvent", captureIndex);
assert.ok(handlerIndex >= 0 && recoveredIndex > handlerIndex, "Successful retries must mark captured failures recovered.");
assert.ok(captureIndex > catchIndex && telemetryIndex > captureIndex, "Failed content must be captured before failure telemetry returns HTTP 500.");
assert.ok(webhook.includes("failureCaptured"));
const failureLogStart = webhook.indexOf('console.error("whatsapp_webhook_error"', catchIndex);
const failureLogEnd = webhook.indexOf("await recordOperationalEvent", failureLogStart);
const failureLog = webhook.slice(failureLogStart, failureLogEnd);
assert.equal(failureLog.includes("providerMessageId: message.providerMessageId"), false, "Failure logs must hash provider message IDs.");
assert.ok(webhook.includes("providerMessageIdHash: hashProviderMessageId(message.providerMessageId)"));

const canary = read("app/api/operations/canary/route.ts");
assert.ok(canary.includes("purgeExpiredWhatsAppWebhookFailures"), "The daily operations canary must enforce failure-content retention.");
assert.ok(canary.includes("failureRetentionReady"));

const health = read("app/api/whatsapp/health/route.ts");
for (const marker of [
  "migration031Ready",
  "intakeProfileSchemaReady",
  "inboundFailureRecoveryAvailable",
  "schemaCompatibilityRetryAvailable"
]) {
  assert.ok(health.includes(marker), `Production health proof missing ${marker}.`);
}

const packageJson = JSON.parse(read("package.json"));
assert.ok(packageJson.scripts["test:whatsapp-persistence"]?.includes("test_whatsapp_persistence_recovery.mjs"));
assert.ok(packageJson.scripts["test:v11.1.0"]?.includes("test:whatsapp-persistence"));

console.log("PASS: WhatsApp schema compatibility, protected failure capture, recovery marking, and health proof checks passed.");
