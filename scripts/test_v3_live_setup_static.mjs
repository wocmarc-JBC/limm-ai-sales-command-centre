import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    output.push(full);
    if (entry.isDirectory()) walk(full, output);
  }
  return output;
}

for (const file of [
  "LIVE_SUPABASE_SETUP_GUIDE.md",
  "supabase/MIGRATION_ORDER.md",
  "supabase/bootstrap_profiles.sql",
  "RLS_VERIFICATION_NOTES.md",
  "V3_3_LIVE_SUPABASE_VERIFICATION_REPORT.md",
  "scripts/print_live_supabase_setup_checklist.mjs",
  "scripts/verify_live_supabase_schema.mjs",
  "scripts/verify_live_authenticated_actions.mjs"
]) {
  assert(exists(file), `Missing v3.3 setup file: ${file}`);
}

const setupGuide = read("LIVE_SUPABASE_SETUP_GUIDE.md");
for (const phrase of [
  "Create Supabase Project",
  "Copy Project URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "Do not put the service role key in frontend",
  "Apply Migrations In Order",
  "Create Marcus Auth User",
  "Insert Matching Profiles",
  "Run Live Schema Verification",
  "Login And Verify Dashboard"
]) {
  assert(setupGuide.includes(phrase), `Setup guide missing phrase: ${phrase}`);
}
assert(!/password\s*=\s*['"](?!TEST_USER_PASSWORD|PASTE_TEST_PASSWORD|YOUR_TEST_PASSWORD)[^'"]+['"]/i.test(setupGuide), "Setup guide appears to include a real password.");

const migrationOrder = read("supabase/MIGRATION_ORDER.md");
for (const migration of [
  "001_profiles.sql",
  "002_leads.sql",
  "003_lead_messages.sql",
  "004_lead_ai_decisions.sql",
  "005_appointments.sql",
  "006_appointment_rules.sql",
  "007_appointment_slots.sql",
  "008_appointment_holds.sql",
  "009_followups.sql",
  "010_approval_requests.sql",
  "011_client_files.sql",
  "012_quotation_readiness.sql",
  "013_audit_logs.sql",
  "014_settings_templates_outcomes.sql",
  "015_v3_1_persistence_updates.sql",
  "016_v3_2_auth_rls.sql",
  "017_v3_4_audit_log_actor_compatibility.sql",
  "018_v4_8_whatsapp_closed_test.sql"
]) {
  assert(migrationOrder.includes(migration), `Migration order missing: ${migration}`);
}
for (const phrase of ["Purpose:", "Dependencies:", "Safe to re-run:", "Verification query:"]) {
  assert(migrationOrder.includes(phrase), `Migration order missing section label: ${phrase}`);
}

const bootstrap = read("supabase/bootstrap_profiles.sql");
for (const placeholder of ["MARCUS_AUTH_USER_UUID", "MARCUS_EMAIL", "ADMIN_AUTH_USER_UUID", "ADMIN_EMAIL"]) {
  assert(bootstrap.includes(placeholder), `Bootstrap profiles missing placeholder: ${placeholder}`);
}
assert(!/@limmworks/i.test(bootstrap), "Bootstrap profile SQL should use placeholders only.");
assert(!/password/i.test(bootstrap.replace(/Do not paste real passwords here\./, "")), "Bootstrap profile SQL must not contain passwords.");

const rlsNotes = read("RLS_VERIFICATION_NOTES.md");
for (const role of ["Boss Access", "Admin Access", "Sales Access", "Viewer Access", "Audit Log Protection", "Temporary / Development-Friendly Areas"]) {
  assert(rlsNotes.includes(role), `RLS notes missing section: ${role}`);
}

const schemaVerifier = read("scripts/verify_live_supabase_schema.mjs");
assert(/Mock Mode: Supabase env vars missing/.test(schemaVerifier), "Live schema verifier must skip cleanly in Mock Mode.");
assert(/appointment_rules/.test(schemaVerifier) && /allowed_days/.test(schemaVerifier), "Live schema verifier must check appointment rules/day config.");
assert(/quotation_readiness/.test(schemaVerifier), "Live schema verifier must check quotation readiness.");
assert(/profiles/.test(schemaVerifier) && /boss/.test(schemaVerifier) && /viewer/.test(schemaVerifier), "Live schema verifier must check profile roles.");
assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(schemaVerifier), "Live schema verifier must not require service role key.");

const actionVerifier = read("scripts/verify_live_authenticated_actions.mjs");
for (const phrase of ["SUPABASE_TEST_EMAIL", "SUPABASE_TEST_PASSWORD", "signInWithPassword", "audit_logs", "appointment_rules", "approval_requests", "followups", "quotation_readiness", "actor compatibility", "compatAudit"]) {
  assert(actionVerifier.includes(phrase), `Authenticated verifier missing: ${phrase}`);
}
assert(/Skipping authenticated action verification safely/.test(actionVerifier), "Authenticated verifier must skip safely without test credentials.");
assert(!/password\s*=\s*['"][^'"]+['"]/i.test(actionVerifier), "Authenticated verifier appears to hardcode a password.");
assert(!/from\("audit_logs"\)\.delete|from\('audit_logs'\)\.delete/i.test(actionVerifier), "Authenticated verifier must never delete audit logs.");

const auditRepo = read("lib/data/audit-repository.ts");
assert(/actor:\s*audit\.actor/.test(auditRepo), "Audit repository must insert legacy actor field.");
assert(/actor_type:\s*audit\.actorType/.test(auditRepo), "Audit repository must insert actor_type.");
assert(/actor_name:\s*audit\.actorName/.test(auditRepo), "Audit repository must insert actor_name.");

const auditCompatMigration = read("supabase/migrations/017_v3_4_audit_log_actor_compatibility.sql");
for (const phrase of ["actor_type", "actor_name", "actor_email", "actor_id", "set_audit_logs_actor", "trg_set_audit_logs_actor", "alter column actor set default 'system'"]) {
  assert(auditCompatMigration.includes(phrase), `Audit compatibility migration missing: ${phrase}`);
}

const setupChecklist = read("scripts/print_live_supabase_setup_checklist.mjs");
assert(/Create a new Supabase project/.test(setupChecklist), "Setup checklist printer missing setup steps.");

const envExample = read(".env.example");
for (const variable of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_TEST_EMAIL", "SUPABASE_TEST_PASSWORD"]) {
  assert(envExample.includes(variable), `.env.example missing ${variable}`);
}

const settings = read("app/settings/page.tsx");
for (const phrase of ["Current user email", "Current role", "Live verification", "OpenAI", "WhatsApp", "Calendar"]) {
  assert(settings.includes(phrase), `Settings page missing v3.3 health line: ${phrase}`);
}

const login = read("components/auth/LoginForm.tsx");
assert(/Supabase env vars are missing/.test(login), "Login page must explain missing Supabase env vars.");
assert(/Mock Mode/.test(login) && /demo boss access/i.test(login), "Login page must keep Mock Mode demo access.");

const actions = read("lib/actions.ts");
assert(!/deleteAudit|audit.*delete|from\("audit_logs"\)\.delete|from\('audit_logs'\)\.delete/i.test(actions), "Normal actions must not delete audit logs.");

const appFiles = [...walk(path.join(root, "app")), ...walk(path.join(root, "components")), ...walk(path.join(root, "lib"))].filter((file) => /\.(ts|tsx)$/.test(file));
for (const file of appFiles) {
  const content = fs.readFileSync(file, "utf8");
  if (path.relative(root, file) === path.join("lib", "data", "supabase-admin.ts")) continue;
  assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(content), `Service role key referenced in app/client/lib code: ${path.relative(root, file)}`);
}

const appointmentEngine = read("lib/appointment-engine.ts");
assert(!/dayName\s*===\s*["']sunday["']/i.test(appointmentEngine), "Hardcoded Sunday branch found.");
assert(!/getDay\(\)\s*===\s*0/i.test(appointmentEngine), "Hardcoded Sunday getDay block found.");

for (const file of ["lib/ai-decision-schema.ts", "lib/mock-data.ts", "lib/adapters/whatsapp-adapter.ts"]) {
  assert(!/free consultation/i.test(read(file)), `${file} contains forbidden phrase.`);
}

for (const file of ["lib/quotation-readiness.ts", "app/quotation-readiness/page.tsx", "lib/data/quotation-repository.ts"]) {
  const content = read(file);
  for (const pattern of [/\bS\$\s*\d{2,}/i, /\bSGD\s*\d{2,}/i, /\bquote range\b/i, /\bprice estimate\b/i, /\bestimate range\b/i, /\brough renovation estimate/i]) {
    assert(!pattern.test(content), `${file} contains forbidden pricing pattern: ${pattern}`);
  }
}

assert(!exists(".env"), ".env must not be committed.");
assert(!walk(root).some((file) => /(__pycache__|node_modules|\.next|[\\/]build[\\/]|[\\/]dist[\\/]|\bcoverage\b)/i.test(file)), "Generated cache/dependency folder found.");

console.log("PASS: v3 live setup static tests passed.");
