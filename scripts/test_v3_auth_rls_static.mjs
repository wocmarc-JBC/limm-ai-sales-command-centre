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
  "lib/auth/roles.ts",
  "lib/auth/session.ts",
  "lib/data/supabase-browser.ts",
  "lib/data/supabase-server.ts",
  "components/auth/AuthGate.tsx",
  "components/auth/LoginForm.tsx",
  "components/auth/LogoutButton.tsx",
  "app/login/page.tsx",
  "supabase/migrations/016_v3_2_auth_rls.sql",
  "scripts/verify_live_supabase_schema.mjs"
]) {
  assert(exists(file), `Missing auth/RLS file: ${file}`);
}

const roles = read("lib/auth/roles.ts");
for (const role of ["boss", "admin", "sales", "viewer"]) {
  assert(roles.includes(`"${role}"`), `Missing role label: ${role}`);
}
for (const permission of ["approve_requests", "edit_appointment_settings", "view_audit", "update_leads"]) {
  assert(roles.includes(`"${permission}"`), `Missing permission: ${permission}`);
}

const session = read("lib/auth/session.ts");
assert(/getCurrentProfile/.test(session), "Current profile bootstrap missing.");
assert(/requirePermission/.test(session), "Action-layer permission guard missing.");
assert(/Mock Mode/.test(session), "Mock Mode auth behavior missing.");
assert(/Supabase Auth/.test(session), "Supabase auth behavior missing.");

const actions = read("lib/actions.ts");
for (const permission of [
  "edit_appointment_settings",
  "update_leads",
  "approve_requests",
  "manage_followups",
  "update_quotation_readiness"
]) {
  assert(actions.includes(`requirePermission("${permission}")`), `Server action missing permission check: ${permission}`);
}

const rls = read("supabase/migrations/016_v3_2_auth_rls.sql");
for (const table of [
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
  "lead_outcomes"
]) {
  assert(new RegExp(`alter table ${table} enable row level security`, "i").test(rls), `RLS not enabled for ${table}`);
  assert(new RegExp(`create policy [\\s\\S]+ on ${table}`, "i").test(rls), `No policy found for ${table}`);
}
assert(/references auth\.users\(id\)/i.test(rls), "Profiles must link to auth.users.");
assert(/role in \('boss', 'admin', 'sales', 'viewer'\)/i.test(rls), "Role check constraint missing.");
assert(/to authenticated/i.test(rls), "Policies must target authenticated users.");
assert(!/to anon/i.test(rls), "Anonymous access policy found.");
assert(/No update\/delete policy is created for audit_logs/i.test(rls), "Audit log delete protection note missing.");
assert(!/audit_logs[\s\S]{0,180}for delete/i.test(rls), "Audit logs must not have delete policy.");
assert(/appointment_rules_update_boss/i.test(rls), "Appointment settings update must be boss-restricted.");
assert(/settings_write_boss/i.test(rls), "Settings write must be boss-restricted.");

const settings = read("app/settings/page.tsx");
for (const phrase of ["Auth status", "Current role", "RLS expected", "OpenAI", "WhatsApp", "Calendar"]) {
  assert(settings.includes(phrase), `Settings health missing: ${phrase}`);
}

const loginPage = read("app/login/page.tsx") + read("components/auth/LoginForm.tsx");
assert(/Email/.test(loginPage) && /Password/.test(loginPage), "Login page must include email/password UI.");
assert(/Mock Mode/.test(loginPage) && /demo boss access/i.test(loginPage), "Login page must show mock mode behavior.");

const shell = read("components/Shell.tsx");
const shellChrome = read("components/ShellChrome.tsx");
assert(/ShellChrome/.test(shell), "Server shell must delegate to ShellChrome.");
assert(/AuthGate/.test(shellChrome), "Protected app shell must use AuthGate.");
assert(/LogoutButton/.test(shellChrome), "Shell must expose logout for authenticated users.");

const appointmentPage = read("app/appointment-settings/page.tsx");
assert(/canEdit/.test(appointmentPage), "Appointment settings page must be role-aware.");
assert(/disabled=\{!canEdit\}/.test(appointmentPage), "Appointment settings edit controls must be restricted.");
assert(/Sunday is controlled only by this setting/i.test(appointmentPage), "Sunday config proof missing.");

const approvalsPage = read("app/approvals/page.tsx");
assert(/canApprove/.test(approvalsPage), "Approval queue must be role-aware.");
assert(/disabled=\{!canApprove\}/.test(approvalsPage), "Approval buttons must be restricted.");

const auditPage = read("app/audit-log/page.tsx");
assert(/view_audit/.test(auditPage), "Audit page must check view_audit permission.");

const appTs = walk(path.join(root, "app")).filter((file) => /\.(ts|tsx)$/.test(file));
const componentTs = walk(path.join(root, "components")).filter((file) => /\.(ts|tsx)$/.test(file));
const libTs = walk(path.join(root, "lib")).filter((file) => /\.(ts|tsx)$/.test(file));
for (const file of [...appTs, ...componentTs, ...libTs]) {
  const relative = path.relative(root, file);
  const content = fs.readFileSync(file, "utf8");
  if (relative === path.join("lib", "data", "supabase-admin.ts")) continue;
  if (relative.startsWith(`app${path.sep}api${path.sep}`)) continue;
  assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(content), `Service role key referenced in app code: ${relative}`);
}

const appointmentEngine = read("lib/appointment-engine.ts");
assert(!/dayName\s*===\s*["']sunday["']/i.test(appointmentEngine), "Hardcoded Sunday branch found.");
assert(!/getDay\(\)\s*===\s*0/i.test(appointmentEngine), "Hardcoded Sunday getDay block found.");

for (const file of ["lib/ai-decision-schema.ts", "lib/mock-data.ts", "lib/adapters/whatsapp-adapter.ts"]) {
  assert(!/free consultation/i.test(read(file)), `${file} contains forbidden phrase.`);
}

for (const file of ["lib/quotation-readiness.ts", "app/quotation-readiness/page.tsx", "lib/data/quotation-repository.ts"]) {
  const content = read(file);
  for (const pattern of [/\bS\$\s*\d{2,}/i, /\bSGD\s*\d{2,}/i, /\bquote range\b/i, /\bprice estimate\b/i, /\bestimate range\b/i, /\brough pricing\b/i]) {
    assert(!pattern.test(content), `${file} contains forbidden pricing pattern: ${pattern}`);
  }
}

assert(!exists(".env"), ".env must not be committed.");
assert(!walk(root).some((file) => /(__pycache__|node_modules|\.next|[\\/]build[\\/]|[\\/]dist[\\/]|\bcoverage\b)/i.test(file)), "Generated cache/dependency folder found.");

console.log("PASS: v3 auth/RLS static tests passed.");
