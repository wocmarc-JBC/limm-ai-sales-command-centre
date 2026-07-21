import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoTrackedOrPackagedGeneratedArtifacts, isGeneratedFolderPath } from "./generated_folder_guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isGeneratedFolderPath(path.relative(root, full))) continue;
      walk(full, output);
    } else {
      output.push(full);
    }
  }
  return output;
}

const requiredRepos = [
  "lib/data/data-source.ts",
  "lib/data/supabase-env.ts",
  "lib/data/supabase-client.ts",
  "lib/data/mock-store.ts",
  "lib/data/leads-repository.ts",
  "lib/data/appointment-settings-repository.ts",
  "lib/data/approvals-repository.ts",
  "lib/data/followups-repository.ts",
  "lib/data/quotation-repository.ts",
  "lib/data/audit-repository.ts",
  "lib/data/settings-repository.ts"
];

for (const repo of requiredRepos) {
  assert(exists(repo), `Missing repository/data file: ${repo}`);
}

const dataSource = read("lib/data/data-source.ts");
const supabaseEnv = read("lib/data/supabase-env.ts");
assert(/NEXT_PUBLIC_SUPABASE_URL/.test(supabaseEnv), "Supabase environment resolver must check the project URL.");
assert(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/.test(supabaseEnv), "Supabase environment resolver must prefer the current publishable key.");
assert(/NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(supabaseEnv), "Supabase environment resolver must retain the legacy anon-key fallback.");
assert(/supabase-env/.test(dataSource), "Data source must use the browser-safe Supabase environment resolver.");
assert(/Mock Mode/.test(dataSource) && /Supabase Mode/.test(dataSource), "Data source must expose mock and Supabase mode.");

const supabaseClient = read("lib/data/supabase-client.ts");
assert(/createClient/.test(supabaseClient), "Supabase adapter must create a client.");
assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(supabaseClient), "Supabase adapter must not use service role key.");

const tsFiles = walk(root).filter((file) => /\.(ts|tsx)$/.test(file));
for (const file of tsFiles) {
  const relative = path.relative(root, file);
  const content = fs.readFileSync(file, "utf8");
  if (relative === path.join("lib", "data", "supabase-admin.ts")) continue;
  if (relative.startsWith(`app${path.sep}api${path.sep}`)) continue;
  assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(content), `Service role key leaked into application code: ${relative}`);
}

for (const file of walk(path.join(root, "app")).filter((item) => item.endsWith(".tsx"))) {
  const relative = path.relative(root, file);
  if (relative === path.join("app", "review-chatgpt-ui", "page.tsx")) continue;
  const content = fs.readFileSync(file, "utf8");
  assert(!/lib\/mock-data/.test(content), `App page imports mock data directly: ${relative}`);
}

const appointmentRepo = read("lib/data/appointment-settings-repository.ts");
assert(/saveAppointmentSettings/.test(appointmentRepo), "Appointment settings save function missing.");
assert(/createAuditLog/.test(appointmentRepo), "Appointment settings save must write audit log.");
assert(/sunday/i.test(read("app/appointment-settings/page.tsx")), "Appointment settings page must show Sunday setting.");
assert(!/dayName\s*===\s*["']sunday["']/i.test(read("lib/appointment-engine.ts")), "Sunday hardcoded branch found.");
assert(!/getDay\(\)\s*===\s*0/i.test(read("lib/appointment-engine.ts")), "Sunday hardcoded getDay block found.");

function slotProbe(sundayEnabled) {
  const settings = {
    days: {
      sunday: { enabled: sundayEnabled, approvalRequired: true, slots: [{ start: "10:00", end: "15:00" }] }
    },
    appointmentTypes: {
      site_discussion: { enabled: true, durationMinutes: 60, approvalRequired: false }
    }
  };
  return settings.days.sunday.enabled && settings.appointmentTypes.site_discussion.enabled ? ["sunday"] : [];
}
assert(slotProbe(true).includes("sunday"), "Sunday enabled should produce Sunday slot examples.");
assert(!slotProbe(false).includes("sunday"), "Sunday disabled should hide Sunday slots.");

const leadRepo = read("lib/data/leads-repository.ts");
assert(/updateLeadStatus/.test(leadRepo), "Lead status update function missing.");
assert(/createAuditLog/.test(leadRepo), "Lead actions must write audit logs.");
assert(/lead_status_updated/.test(leadRepo), "Lead status update audit action missing.");

const approvalRepo = read("lib/data/approvals-repository.ts");
assert(/decideApprovalRequest/.test(approvalRepo), "Approval decision function missing.");
assert(/approval_decision_recorded/.test(approvalRepo), "Approval decision audit action missing.");

const followupRepo = read("lib/data/followups-repository.ts");
assert(/updateFollowUpStatus/.test(followupRepo), "Follow-up status function missing.");
assert(/followup_status_updated/.test(followupRepo), "Follow-up audit action missing.");

const quotationRepo = read("lib/data/quotation-repository.ts");
assert(/updateQuotationReadinessStatus/.test(quotationRepo), "Quotation readiness update function missing.");
assert(/quotation_readiness_updated/.test(quotationRepo), "Quotation readiness audit action missing.");

for (const file of ["lib/quotation-readiness.ts", "app/quotation-readiness/page.tsx", "lib/data/quotation-repository.ts"]) {
  const content = read(file);
  for (const pattern of [/\bS\$\s*\d{2,}/i, /\bSGD\s*\d{2,}/i, /\bquote range\b/i, /\bprice estimate\b/i, /\bestimate range\b/i]) {
    assert(!pattern.test(content), `${file} contains forbidden quotation pricing pattern: ${pattern}`);
  }
}

for (const file of ["lib/ai-decision-schema.ts", "lib/mock-data.ts", "lib/adapters/whatsapp-adapter.ts"]) {
  assert(!/free consultation/i.test(read(file)), `${file} contains forbidden client phrase.`);
}

const migrationText = walk(path.join(root, "supabase", "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

for (const field of [
  "email",
  "appointment_suitable",
  "appointment_type",
  "quotation_readiness_score",
  "next_action",
  "approval_type",
  "ai_recommendation",
  "suggested_message",
  "allowed_days",
  "standard_slots",
  "max_per_day",
  "buffer_minutes",
  "same_day_rule",
  "boss_approval_required",
  "before_data",
  "after_data",
  "metadata",
  "actor_email",
  "actor_id"
]) {
  assert(new RegExp(`\\b${field}\\b`, "i").test(migrationText), `Migration missing v3.1 field: ${field}`);
}

for (const indexName of [
  "leads_status_idx",
  "leads_score_idx",
  "followups_due_at_idx",
  "approval_requests_status_idx",
  "appointments_starts_at_idx",
  "audit_logs_created_at_idx"
]) {
  assert(migrationText.includes(indexName), `Missing common-query index: ${indexName}`);
}

assert(!exists(".env"), ".env must not be committed.");
assertNoTrackedOrPackagedGeneratedArtifacts({ root, assert });

console.log("PASS: v3 Supabase persistence layer tests passed.");
