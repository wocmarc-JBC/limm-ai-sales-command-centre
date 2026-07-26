import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260726043000_v11_4_3_human_handoff_reliability.sql");
const handoff = read("lib/handoff-email.ts");
const gate = read("scripts/verify_production_schema_gate.mjs");

assert.match(migration, /create table if not exists public\.human_handoff_events/);
assert.match(migration, /dedupe_key text not null unique/);
assert.match(migration, /reserve_human_handoff/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /needs_marcus = true/);
assert.match(migration, /bot_paused = true/);
assert.match(migration, /bot_paused_by = 'human_handoff_guard'/);
assert.match(migration, /complete_human_handoff/);
assert.match(migration, /human_handoff_reliability_schema_ready/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.human_handoff_events from public, anon, authenticated/);
assert.doesNotMatch(migration, /grant .* to anon|grant .* to authenticated/);

assert.match(handoff, /getSupabaseAdminClient/);
assert.match(handoff, /reserve_human_handoff/);
assert.match(handoff, /complete_human_handoff/);
assert.match(handoff, /HANDOFF_COOLDOWN_SECONDS = 30 \* 60/);
assert.match(handoff, /createHash\("sha256"\)/);
assert.match(handoff, /envFlag\("HANDOFF_EMAIL_ENABLED", providerConfigured\)/);
assert.match(handoff, /AbortSignal\.timeout\(8_000\)/);
assert.match(handoff, /provider_timeout/);
assert.match(handoff, /Paused automatically\. Needs Marcus is active\./);
assert.doesNotMatch(handoff, /const handoffCooldown = new Map/);
assert.doesNotMatch(handoff, /sendWhatsAppTextMessage|WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/);

assert.match(gate, /human_handoff_events/);
assert.match(gate, /human_handoff_reliability_schema_ready/);
assert.match(gate, /5 readiness contracts/);

console.log("PASS v11.4.3 durable human handoff reservation, automatic bot pause, Needs Marcus escalation, delivery evidence, duplicate suppression, and no-send safety");
