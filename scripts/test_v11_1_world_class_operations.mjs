import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadTs(file) {
  const compiled = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
    reportDiagnostics: true
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, `${file} must transpile without diagnostics.`);
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled.outputText)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}

const migration = read("supabase/migrations/029_v11_1_world_class_operations.sql");
const hardeningMigration = read("supabase/migrations/030_v11_1_world_class_database_hardening.sql");
const inbox = read("components/inbox/MultiChatInbox.tsx");
const realtime = read("components/inbox/useInboxRealtime.ts");
const teamWorkspace = read("components/inbox/InboxTeamWorkspace.tsx");
const teamApi = read("app/api/inbox/team/[leadId]/route.ts");
const sendApi = read("app/api/inbox/send/route.ts");
const autoReply = read("lib/whatsapp-auto-reply.ts");
const canary = read("app/api/operations/canary/route.ts");
const revenuePage = read("app/revenue-intelligence/page.tsx");
const nextConfig = read("next.config.mjs");
const packageJson = JSON.parse(read("package.json"));

for (const table of [
  "inbox_assignments",
  "inbox_internal_notes",
  "operational_trace_events",
  "ai_reply_quality_events",
  "operator_product_events",
  "api_rate_limit_windows"
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `${table} must be additive.`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enforce RLS.`);
}
for (const fn of ["claim_inbox_conversation", "release_inbox_conversation", "assign_inbox_conversation", "consume_api_rate_limit", "world_class_operations_schema_ready"]) {
  assert.ok(migration.includes(`function public.${fn}`), `${fn} must exist.`);
}
assert.ok(migration.includes("grant select on table public.inbox_assignments to authenticated"), "Authenticated clients must not receive direct assignment mutation grants.");
assert.ok(migration.includes("drop policy if exists leads_update_staff"), "Legacy permissive lead update policy must be retired.");
assert.ok(migration.includes("drop policy if exists lead_messages_insert_staff"), "Legacy permissive message insert policy must be retired.");
assert.ok(migration.includes("security definer"), "Atomic assignment RPCs must own their transaction after explicit auth checks.");
assert.ok(migration.includes("set search_path = ''"), "Definer functions must use an empty search path.");
assert.ok(migration.includes("private: true") === false, "SQL should use the boolean private flag, not a string configuration literal.");
assert.ok(migration.includes("'inbox:team:activity'"));
assert.ok(migration.includes("realtime.send($1, $2, $3, true)"));
assert.ok(migration.includes("limm_inbox_realtime_select"));
assert.ok(migration.includes("revoke all on table public.operational_trace_events from public, anon, authenticated"));
assert.ok(migration.includes("grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role"));

for (const index of [
  "inbox_internal_notes_created_by_idx",
  "operational_trace_events_lead_created_idx",
  "ai_reply_quality_events_lead_created_idx",
  "ai_reply_quality_events_message_idx",
  "ai_reply_quality_events_reviewer_idx",
  "operator_product_events_actor_created_idx",
  "operator_product_events_lead_created_idx"
]) {
  assert.ok(hardeningMigration.includes(`create index if not exists ${index}`), `${index} must remain additive.`);
}
for (const table of [
  "operational_trace_events",
  "ai_reply_quality_events",
  "operator_product_events",
  "api_rate_limit_windows"
]) {
  assert.ok(hardeningMigration.includes(`create policy ${table}_service_role`), `${table} must document service-only RLS.`);
}
assert.ok(hardeningMigration.includes("assigned_profile_id = (select auth.uid())"), "Assignment policies must cache the caller identity.");
assert.ok(hardeningMigration.includes("created_by = (select auth.uid())"), "Internal-note policies must cache the caller identity.");
assert.ok(hardeningMigration.includes("assignment.assigned_profile_id <> (select auth.uid())"), "Lead ownership policies must cache the caller identity.");

for (const marker of [
  'config: { private: true, presence:',
  '.on("broadcast", { event: "inbox_activity" }',
  '.on("presence", { event: "sync" }',
  "removeChannel(channel)",
  "showBackgroundNotification"
]) assert.ok(realtime.includes(marker), `Realtime client missing ${marker}`);
assert.ok(inbox.includes('realtimeStatus === "live" ? 60000 : 15000'), "Queue must poll slowly when Realtime is healthy and recover quickly when degraded.");
assert.ok(inbox.includes('realtimeStatus === "live" ? 60000 : 9000'), "Selected chat must retain a polling fallback.");
assert.ok(inbox.includes('dynamic(') && inbox.includes('InboxCollaborationLayer'), "Realtime collaboration must load behind a lazy client boundary.");
assert.ok(inbox.includes('filter === "Mine"'));
assert.ok(inbox.includes('filter === "Unassigned"'));
assert.ok(inbox.includes("contentVisibility: \"auto\""), "Long queues must use browser virtualization hints.");
assert.ok(inbox.includes("loadMoreConversations"));
assert.ok(inbox.includes("queueCursor"));

for (const marker of ["Assign to me", "does not pause bot", "Release", "Internal note", "viewing", "quality_feedback", "Enable alerts"]) {
  assert.ok(teamWorkspace.includes(marker), `Team workspace missing ${marker}`);
}
assert.ok(teamApi.includes('requirePermission("update_leads")'));
assert.ok(teamApi.includes("consumeRateLimit"));
assert.ok(teamApi.includes("recordOperationalEvent"));
assert.ok(sendApi.includes('action: "inbox_manual_send"'));
assert.ok(sendApi.includes("X-LIMM-Trace-Id"));

const semanticIndex = autoReply.indexOf("const finalSemanticGuard");
const qualityIndex = autoReply.indexOf("recordAiQualityObservation", semanticIndex);
const reservationIndex = autoReply.indexOf("reserveWhatsAppConversationReply", qualityIndex);
const sendIndex = autoReply.indexOf("adapter.sendReply(senderPhone, reply)", reservationIndex);
assert.ok(semanticIndex >= 0 && qualityIndex > semanticIndex && reservationIndex > qualityIndex && sendIndex > reservationIndex, "Quality observation must use the final planned reply without replacing reservation or send ordering.");
assert.ok(autoReply.includes("shadowCandidate: true"));
assert.ok(
  autoReply.includes("]).catch(() => [false, false])") || autoReply.includes("]).catch(() => [null, null])"),
  "Quality telemetry failure must never break the reply path."
);
assert.equal(canary.includes("sendReply("), false, "Synthetic canary must never call Meta.");
assert.ok(canary.includes("externalSendAttempted: false"));

const { evaluateWhatsAppReplyQuality, evaluateAiQualityReleaseGate } = loadTs("lib/ai-quality.ts");
const safeQuality = evaluateWhatsAppReplyQuality("Thanks for sharing. Could you send the floor plan when convenient?");
assert.equal(safeQuality.releaseEligible, true);
assert.equal(safeQuality.safety, 100);
const unsafeQuality = evaluateWhatsAppReplyQuality("We can confirm the price at S$50,000.");
assert.equal(unsafeQuality.releaseEligible, false);
assert.ok(unsafeQuality.flags.includes("unapproved_price_signal"));
assert.equal(evaluateAiQualityReleaseGate({ replayPassRatePercent: 100, unsafeReplyCount: 0, semanticDuplicateCount: 0, operatorAccepted: 20, operatorRejected: 1 }).passed, true);
assert.equal(evaluateAiQualityReleaseGate({ replayPassRatePercent: 100, unsafeReplyCount: 1, semanticDuplicateCount: 0, operatorAccepted: 20, operatorRejected: 0 }).passed, false);

const { buildRevenueIntelligence } = loadTs("lib/revenue-intelligence.ts");
const baseLead = {
  id: "lead-1", clientName: "Client", phone: "1", source: "Instagram", division: "LIMM Works",
  propertyType: "HDB", serviceType: "Renovation", scopeSummary: "Kitchen", leadScore: 80,
  leadCategory: "Hot", status: "Appointment Pending", missingInfo: [], aiRecommendedNextAction: "Follow up",
  bossApprovalNeeded: false, appointmentReadiness: 80, quotationReadiness: 50, lastClientMessage: "Hi",
  lastReplyAt: null, createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:02:00.000Z",
  preferredContactTime: "", riskFlags: [], leadEligible: true, salesStage: "Site Visit Booked",
  probabilityPercent: 60, potentialValue: 100000, confirmedValue: 0
};
const revenue = buildRevenueIntelligence([baseLead], [
  { id: "m1", leadId: "lead-1", direction: "inbound", channel: "whatsapp", body: "Hi", safeToSend: true, whatsappStatus: "received", createdAt: "2026-07-01T00:00:00.000Z" },
  { id: "m2", leadId: "lead-1", direction: "outbound", channel: "whatsapp", body: "Hello", safeToSend: true, whatsappStatus: "sent", createdAt: "2026-07-01T00:03:00.000Z" }
], Date.parse("2026-07-02T00:00:00.000Z"));
assert.deepEqual(revenue.funnel, { leads: 1, responded: 1, appointments: 1, quoted: 0, won: 0 });
assert.equal(revenue.weightedForecast, 60000);
assert.equal(revenue.responseImpact.find((bucket) => bucket.label === "Under 5 min")?.conversations, 1);
assert.equal(revenue.priorities[0]?.leadId, "lead-1");
assert.ok(revenuePage.includes("Source → response → appointment → quote → won"));
assert.ok(revenuePage.includes("Observed association"));

for (const header of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy"]) {
  assert.ok(nextConfig.includes(header), `Security header missing ${header}`);
}
assert.ok(packageJson.dependencies["@vercel/analytics"]);
assert.ok(packageJson.dependencies["@vercel/speed-insights"]);
assert.ok(packageJson.version >= "11.1.3");
assert.ok(packageJson.scripts["test:v11.1.0"]?.includes("test_v11_1_world_class_operations.mjs"));

console.log("PASS: v11.1 world-class operations, team inbox, AI quality, product experience, and revenue intelligence checks passed.");
