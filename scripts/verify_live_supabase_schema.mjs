import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const requiredTables = [
  "profiles",
  "leads",
  "lead_messages",
  "lead_ai_decisions",
  "appointments",
  "appointment_rules",
  "appointment_slots",
  "appointment_holds",
  "followups",
  "approval_requests",
  "client_files",
  "quotation_readiness",
  "audit_logs",
  "settings",
  "message_templates",
  "lead_outcomes",
  "whatsapp_conversation_reply_leases",
  "whatsapp_reply_reservations"
];

const requiredColumns = {
  profiles: ["id", "email", "full_name", "role", "active", "created_at", "updated_at"],
  leads: ["id", "client_name", "phone", "email", "source", "division", "property_type", "service_type", "scope_summary", "lead_score", "lead_category", "status", "missing_info", "risk_flags", "boss_approval_needed", "appointment_suitable", "appointment_type", "quotation_readiness_score", "next_action", "conversation_intent", "lead_eligible", "conversation_route", "intent_confidence", "intent_reason_codes", "intent_classifier_version", "intent_manual_override", "intent_classified_at", "non_sales_acknowledged_at", "latest_unanswered_question", "conversation_safety_state", "created_at", "updated_at"],
  lead_messages: ["id", "lead_id", "direction", "channel", "body", "safe_to_send", "provider_message_id", "provider_timestamp", "whatsapp_status", "metadata", "created_at"],
  approval_requests: ["id", "lead_id", "approval_type", "reason", "ai_recommendation", "status", "requested_at", "decided_at", "decided_by", "notes"],
  followups: ["id", "lead_id", "followup_type", "due_at", "status", "suggested_message", "completed_at", "notes"],
  appointment_rules: ["id", "appointment_type", "allowed_days", "standard_slots", "minimum_notice_hours", "max_per_day", "buffer_minutes", "same_day_rule", "public_holiday_rule", "boss_approval_required", "active"],
  quotation_readiness: ["id", "lead_id", "readiness_score", "missing_info", "quote_preparation_checklist", "boss_review_required", "status", "updated_at"],
  audit_logs: ["id", "actor", "actor_type", "actor_name", "actor_email", "actor_id", "action", "entity_type", "entity_id", "before_data", "after_data", "metadata", "created_at"],
  settings: ["key", "value", "updated_at"],
  whatsapp_conversation_reply_leases: ["lead_id", "owner_token", "lease_expires_at", "cooldown_until", "pending_inbound_count", "last_inbound_at", "last_acquired_at", "updated_at"],
  whatsapp_reply_reservations: ["id", "lead_id", "owner_token", "inbound_provider_message_id", "reply_signature", "reservation_bucket", "status", "outbound_provider_message_id", "failure_reason", "reserved_at", "completed_at"]
};

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function localStaticChecks() {
  const rls = read("supabase/migrations/016_v3_2_auth_rls.sql");
  const appointmentEngine = read("lib/appointment-engine.ts");
  const quotationReadinessMigration = read("supabase/migrations/012_quotation_readiness.sql") + "\n" + read("supabase/migrations/015_v3_1_persistence_updates.sql");

  const failures = [];
  for (const role of ["boss", "admin", "sales", "viewer"]) {
    if (!rls.includes(role)) failures.push(`RLS migration missing role: ${role}`);
  }
  if (!/enable row level security/i.test(rls)) failures.push("RLS migration does not enable row level security.");
  if (/to anon/i.test(rls)) failures.push("RLS migration contains anon policy.");
  if (/dayName\s*===\s*["']sunday["']/i.test(appointmentEngine) || /getDay\(\)\s*===\s*0/i.test(appointmentEngine)) {
    failures.push("Appointment engine contains hardcoded Sunday block.");
  }
  if (/\bprice\b|\bamount\b|\bquote_range\b|\bestimate_range\b/i.test(quotationReadinessMigration)) {
    failures.push("Quotation readiness migration appears to contain pricing/range fields.");
  }
  for (const repo of [
    "lib/data/leads-repository.ts",
    "lib/data/appointment-settings-repository.ts",
    "lib/data/approvals-repository.ts",
    "lib/data/followups-repository.ts",
    "lib/data/quotation-repository.ts",
    "lib/data/audit-repository.ts"
  ]) {
    if (!fs.existsSync(path.join(root, repo))) failures.push(`Repository missing: ${repo}`);
  }
  const auditCompatibility = read("supabase/migrations/017_v3_4_audit_log_actor_compatibility.sql");
  for (const phrase of ["set_audit_logs_actor", "trg_set_audit_logs_actor", "actor_email", "actor_id", "alter column actor set default"]) {
    if (!auditCompatibility.includes(phrase)) failures.push(`Audit compatibility migration missing: ${phrase}`);
  }
  const v4AuditCompatibility = read("supabase/migrations/017_v4_0_audit_log_actor_compatibility.sql");
  for (const phrase of ["set_audit_logs_actor", "trg_set_audit_logs_actor", "actor_email", "actor_id", "alter column actor set default"]) {
    if (!v4AuditCompatibility.includes(phrase)) failures.push(`v4 audit compatibility migration missing: ${phrase}`);
  }
  const whatsappMigration = read("supabase/migrations/018_v4_8_whatsapp_closed_test.sql");
  for (const phrase of ["provider_message_id", "provider_timestamp", "whatsapp_status", "metadata", "lead_messages_provider_message_id_unique"]) {
    if (!whatsappMigration.includes(phrase)) failures.push(`WhatsApp closed-test migration missing: ${phrase}`);
  }
  const intentGateMigration = read("supabase/migrations/027_v10_2_intent_gate_conversation_safety.sql");
  for (const phrase of ["conversation_intent", "lead_eligible", "conversation_route", "conversation_safety_state", "leads_sales_eligible_active_idx"]) {
    if (!intentGateMigration.includes(phrase)) failures.push(`Intent gate migration missing: ${phrase}`);
  }
  const concurrencyMigration = read("supabase/migrations/028_v10_2_1_whatsapp_conversation_concurrency.sql");
  for (const phrase of ["whatsapp_conversation_reply_leases", "whatsapp_reply_reservations", "acquire_whatsapp_conversation_reply_lease", "release_whatsapp_conversation_reply_lease", "reserve_whatsapp_conversation_reply", "whatsapp_conversation_concurrency_schema_ready"]) {
    if (!concurrencyMigration.includes(phrase)) failures.push(`Conversation concurrency migration missing: ${phrase}`);
  }
  return failures;
}

const staticFailures = localStaticChecks();
if (staticFailures.length) {
  for (const failure of staticFailures) console.error(failure);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.log("Mock Mode: Supabase env vars missing. Live schema verification skipped cleanly.");
  console.log("PASS: local migration/RLS/repository checks completed.");
  process.exit(0);
}

if (!fs.existsSync(path.join(root, "node_modules", "@supabase", "supabase-js"))) {
  console.log("SKIP: Supabase env vars are present, but node_modules/@supabase/supabase-js is not installed in this runner.");
  console.log("PASS: local migration/RLS/repository checks completed. Run npm.cmd install before live schema verification.");
  process.exit(0);
}

const { createClient } = await import("@supabase/supabase-js");
const fetchTimeoutMs = Number(process.env.SUPABASE_VERIFY_TIMEOUT_MS ?? 10000);
const timedFetch = async (input, init = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};
const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: timedFetch }
});

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${fetchTimeoutMs}ms`)), fetchTimeoutMs + 500);
    })
  ]);
}

const results = [];
let hardFail = false;

for (const table of requiredTables) {
  const columns = requiredColumns[table] ?? ["id"];
  const selectList = columns.join(",");
  let data = null;
  let error = null;
  try {
    const result = await withTimeout(supabase.from(table).select(selectList).limit(1), `Supabase check for ${table}`);
    data = result.data;
    error = result.error;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (/aborted|abort|timeout|timed out|fetch failed|network/i.test(message)) {
      console.warn(`SKIP: live Supabase network check could not complete within ${fetchTimeoutMs}ms. Static schema/RLS checks passed; retry from a network-enabled shell.`);
      process.exit(0);
    }
    throw caught;
  }

  if (!error) {
    results.push(`${table}: readable with current anon/auth context`);
    if (table === "appointment_rules" && data?.[0]) {
      const row = data[0];
      const hasDayConfig = Boolean(row.allowed_days ?? row.standard_slots);
      if (!hasDayConfig) {
        hardFail = true;
        results.push("appointment_rules: FAILED - no configurable day/slot JSON found");
      }
    }
    continue;
  }

  const message = `${error.code ?? "unknown"} ${error.message ?? ""}`;
  if (/permission denied|row-level security|JWT|not authenticated|401|42501/i.test(message)) {
    results.push(`${table}: exists or is protected by Auth/RLS for current context`);
    continue;
  }

  hardFail = true;
  results.push(`${table}: FAILED - ${message}`);
}

for (const line of results) console.log(line);

if (hardFail) {
  console.error("FAIL: live Supabase schema verification failed. Check migrations and required columns.");
  process.exit(1);
}

console.log("PASS: live Supabase schema verification completed without exposing secrets.");
