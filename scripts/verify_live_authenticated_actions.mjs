const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.SUPABASE_TEST_EMAIL;
const password = process.env.SUPABASE_TEST_PASSWORD;

if (!url || !anonKey) {
  console.log("Mock Mode: Supabase env vars missing. Authenticated live action verification skipped cleanly.");
  console.log("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY after creating the live Supabase project.");
  process.exit(0);
}

if (!email || !password) {
  console.log("Supabase Mode detected, but SUPABASE_TEST_EMAIL or SUPABASE_TEST_PASSWORD is missing.");
  console.log("Skipping authenticated action verification safely.");
  console.log("Create a test Auth user, bootstrap its profile, then set SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD to run this check.");
  process.exit(0);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function fail(label, error) {
  console.error(`FAIL: ${label}`);
  if (error?.message) console.error(error.message);
  process.exit(1);
}

async function insertOrFail(label, table, payload) {
  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  if (error) fail(label, error);
  return data;
}

async function updateOrFail(label, table, patch, column, value) {
  const { data, error } = await supabase.from(table).update(patch).eq(column, value).select("*").single();
  if (error) fail(label, error);
  return data;
}

const login = await supabase.auth.signInWithPassword({ email, password });
if (login.error) fail("login failed", login.error);

const user = login.data.user;
if (!user) fail("login returned no user");

const profileResult = await supabase.from("profiles").select("id,email,full_name,role,active").eq("id", user.id).single();
if (profileResult.error) fail("profile read failed", profileResult.error);
const profile = profileResult.data;
if (!["boss", "admin", "sales", "viewer"].includes(profile.role)) fail("profile role is invalid");
if (!profile.active) fail("profile is inactive");
if (profile.role !== "boss") {
  fail("authenticated action verifier requires a boss test profile because appointment settings are boss-only");
}

const marker = `v3_3_live_test_${Date.now()}`;
const leadId = crypto.randomUUID();

const lead = await insertOrFail("test lead insert failed", "leads", {
  id: leadId,
  client_name: `Test Lead ${marker}`,
  phone: "+65_TEST_ONLY",
  email: "",
  source: "v3.3 live verifier",
  division: "LIMM Works",
  property_type: "Test property",
  service_type: "Test service",
  scope_summary: "Test-only Supabase verification lead",
  lead_score: 10,
  lead_category: "Cold",
  status: "New Enquiry",
  missing_info: ["test_only"],
  risk_flags: ["test_only"],
  boss_approval_needed: false,
  appointment_suitable: false,
  appointment_type: "initial_project_review",
  quotation_readiness_score: 0,
  next_action: "Test-only verification. No client action."
});

await updateOrFail("test lead update failed", "leads", { status: "Follow Up Due", next_action: "Test-only action verified." }, "id", lead.id);

const audit = await insertOrFail("audit log insert failed", "audit_logs", {
  actor: "v3.3 live verifier",
  actor_type: "system",
  actor_name: "v3.3 live verifier",
  actor_email: profile.email,
  actor_id: profile.id,
  action: "live_verifier_lead_update",
  entity_type: "lead",
  entity_id: lead.id,
  before_data: { status: "New Enquiry" },
  after_data: { status: "Follow Up Due" },
  metadata: { marker },
  summary: "Live verifier wrote a test lead audit log."
});

if (!audit.actor) fail("audit actor compatibility failed: actor was not populated");
if (!audit.actor_type || !audit.actor_name) fail("audit actor compatibility failed: actor_type/actor_name missing");

const compatAudit = await insertOrFail("audit compatibility insert failed", "audit_logs", {
  actor_type: "system",
  actor_name: "v3.4 compatibility verifier",
  action: "live_verifier_actor_compatibility",
  entity_type: "lead",
  entity_id: lead.id,
  before_data: { compatibility: "actor_type_actor_name_only" },
  after_data: { compatibility: "actor_should_be_populated_by_trigger" },
  metadata: { marker },
  summary: "Live verifier confirmed actor compatibility trigger."
});

if (!compatAudit.actor) fail("audit compatibility trigger failed to populate actor");

const appointmentRule = await insertOrFail("appointment settings test insert failed", "appointment_rules", {
  name: marker,
  appointment_type: "site_discussion",
  timezone: "Asia/Singapore",
  minimum_notice_hours: 24,
  max_appointments_per_day: 1,
  max_per_day: 1,
  buffer_between_appointments_minutes: 30,
  buffer_minutes: 30,
  same_day_booking_rule: "approval_required",
  same_day_rule: "approval_required",
  public_holiday_rule: "approval_required",
  boss_approval_required: true,
  boss_approval_rules: ["test_only"],
  day_settings: { sunday: { enabled: true, approvalRequired: true, slots: [{ start: "10:00", end: "12:00" }] } },
  allowed_days: { sunday: { enabled: true, approvalRequired: true, slots: [{ start: "10:00", end: "12:00" }] } },
  standard_slots: { sunday: [{ start: "10:00", end: "12:00" }] },
  appointment_type_settings: { site_discussion: { enabled: true, durationMinutes: 60, approvalRequired: true } },
  active: false
});

const approval = await insertOrFail("approval request test insert failed", "approval_requests", {
  lead_id: lead.id,
  title: `Test approval ${marker}`,
  request_type: "test_only",
  approval_type: "test_only",
  reason: "Test-only approval verification.",
  ai_recommendation: "Test-only. No client reply.",
  proposed_reply: "Test-only internal verification.",
  status: "pending",
  risk_flags: ["test_only"],
  notes: marker
});

const followup = await insertOrFail("follow-up test insert failed", "followups", {
  lead_id: lead.id,
  followup_type: "test_only",
  template_type: "test_only",
  due_at: new Date(Date.now() + 86400000).toISOString(),
  status: "Scheduled",
  suggested_message: "Test-only follow-up verification.",
  notes: marker
});

const readiness = await insertOrFail("quotation readiness test insert failed", "quotation_readiness", {
  lead_id: lead.id,
  readiness_score: 0,
  missing_info: ["test_only"],
  missing_information: ["test_only"],
  quote_preparation_checklist: [{ item: "Test-only checklist", status: "missing" }],
  boss_review_required: true,
  status: "collecting_info",
  next_action: "Test-only readiness verification. No pricing."
});

for (const [label, table, id] of [
  ["lead readback", "leads", lead.id],
  ["audit readback", "audit_logs", audit.id],
  ["compat audit readback", "audit_logs", compatAudit.id],
  ["appointment rule readback", "appointment_rules", appointmentRule.id],
  ["approval readback", "approval_requests", approval.id],
  ["followup readback", "followups", followup.id],
  ["quotation readiness readback", "quotation_readiness", readiness.id]
]) {
  const { error } = await supabase.from(table).select("id").eq("id", id).single();
  if (error) fail(`${label} failed`, error);
}

await updateOrFail("test lead final marker failed", "leads", { status: "Not Suitable", next_action: `Test-only record verified: ${marker}` }, "id", lead.id);

console.log(`PASS: authenticated live action verification completed for role ${profile.role}.`);
console.log(`Test marker: ${marker}`);
console.log("Audit logs were not deleted.");
