const required = process.env.VERCEL_ENV === "production"
  || process.env.LIMM_REQUIRE_PRODUCTION_SCHEMA_GATE === "1"
  || process.argv.includes("--required");

if (!required) {
  console.log("SKIP: production schema deployment gate is only enforced for production builds or an explicit release check.");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("FAIL: production schema deployment gate requires the Supabase URL and a server-only service credential.");
  process.exit(1);
}

const contract = {
  profiles: ["id", "email", "full_name", "role", "active"],
  leads: [
    "id", "client_name", "phone", "last_client_message", "updated_at", "intake_profile",
    "conversation_intent", "lead_eligible", "conversation_route", "intent_confidence",
    "intent_reason_codes", "intent_classifier_version", "intent_manual_override",
    "intent_classified_at", "non_sales_acknowledged_at", "latest_unanswered_question",
    "conversation_safety_state", "first_operator_response_at"
  ],
  lead_messages: [
    "id", "lead_id", "direction", "channel", "body", "safe_to_send", "provider_message_id",
    "provider_timestamp", "whatsapp_status", "metadata", "created_at"
  ],
  audit_logs: ["id", "actor", "actor_type", "actor_name", "actor_email", "actor_id", "action", "entity_type", "entity_id", "summary", "metadata", "created_at"],
  whatsapp_conversation_reply_leases: ["lead_id", "owner_token", "lease_expires_at", "cooldown_until", "pending_inbound_count", "last_inbound_at", "updated_at"],
  whatsapp_reply_reservations: ["id", "lead_id", "owner_token", "inbound_provider_message_id", "reply_signature", "reservation_bucket", "status", "outbound_provider_message_id", "failure_reason", "reserved_at", "completed_at"],
  inbox_assignments: ["lead_id", "assigned_profile_id", "assigned_name", "claimed_at", "lease_expires_at", "updated_at", "version"],
  inbox_internal_notes: ["id", "lead_id", "body", "mentions", "created_by", "created_by_name", "created_at", "edited_at"],
  operational_trace_events: ["id", "trace_id", "lead_id", "event_name", "stage", "status", "duration_ms", "provider_message_id_hash", "error_code", "metadata", "created_at"],
  ai_reply_quality_events: ["id", "lead_id", "message_id", "trace_id", "model_version", "prompt_version", "planner_version", "reply_signature", "primary_move", "quality_scores", "decision", "metadata", "created_at"],
  operator_product_events: ["id", "event_name", "actor_id", "lead_id", "session_id", "duration_ms", "metadata", "created_at"],
  api_rate_limit_windows: ["key_hash", "window_started_at", "request_count", "updated_at"],
  whatsapp_webhook_failures: [
    "id", "provider_message_id_hash", "sender_phone", "message_body", "message_type",
    "provider_timestamp", "failure_stage", "error_code", "safe_reason", "message_metadata",
    "attempt_count", "first_failed_at", "last_failed_at", "recovered_at", "recovered_lead_id", "expires_at"
  ]
};

const requiredTables = [
  "lead_ai_decisions", "appointments", "appointment_rules", "appointment_slots", "appointment_holds",
  "followups", "approval_requests", "settings", "message_templates", "lead_outcomes",
  "client_files", "quotation_readiness", "lead_files", "lead_upload_links", "quotation_packages",
  "project_accounts", "payment_records", "monthly_targets"
];

const timeoutMs = Math.max(2000, Number(process.env.SUPABASE_VERIFY_TIMEOUT_MS || 12000));
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  Accept: "application/json"
};

async function request(path, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) }, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkTable(table, columns) {
  const select = encodeURIComponent(columns.join(","));
  const response = await request(`/rest/v1/${table}?select=${select}&limit=1`);
  if (!response.ok) throw new Error(`table_contract_failed:${table}:${response.status}`);
}

async function checkRpc(name) {
  const response = await request(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  if (!response.ok) throw new Error(`rpc_contract_failed:${name}:${response.status}`);
  const value = await response.json();
  if (value !== true) throw new Error(`rpc_contract_not_ready:${name}`);
}

try {
  for (const [table, columns] of Object.entries(contract)) await checkTable(table, columns);
  for (const table of requiredTables) await checkTable(table, [table === "settings" ? "key" : "id"]);
  await checkRpc("whatsapp_conversation_concurrency_schema_ready");
  await checkRpc("world_class_operations_schema_ready");
  console.log(`PASS: production schema deployment gate verified ${Object.keys(contract).length + requiredTables.length} tables and 2 readiness contracts.`);
} catch (error) {
  const reason = error instanceof Error
    ? (error.name === "AbortError" ? "schema_gate_timeout" : error.message)
    : "schema_gate_failed";
  console.error(`FAIL: production schema deployment gate blocked this build (${reason.slice(0, 160)}).`);
  process.exit(1);
}
