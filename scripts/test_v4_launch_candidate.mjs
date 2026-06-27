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
    if (entry.isDirectory() && isGeneratedFolderPath(path.relative(root, full))) continue;
    output.push(full);
    if (entry.isDirectory()) walk(full, output);
  }
  return output;
}

const pkg = JSON.parse(read("package.json"));
for (const dependency of ["next", "react", "react-dom"]) {
  assert(pkg.dependencies?.[dependency], `Missing dependency: ${dependency}`);
}
for (const script of ["doctor", "verify", "audit:launch", "start:local", "test:v4"]) {
  assert(pkg.scripts?.[script], `Missing npm script: ${script}`);
}

const lock = read("package-lock.json");
for (const dependency of ["node_modules/next", "node_modules/react", "node_modules/react-dom"]) {
  assert(lock.includes(dependency), `package-lock missing ${dependency}`);
}

assert(exists("START_LIMM_SALES_APP.bat"), "Missing BAT startup script.");
assert(exists("START_LIMM_SALES_APP.ps1"), "Missing PowerShell startup script.");
const startup = read("START_LIMM_SALES_APP.ps1");
for (const phrase of ["node_modules\\.bin\\next.cmd", "npm install", "run doctor", "run start:local", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
  assert(startup.includes(phrase), `Startup script missing: ${phrase}`);
}
assert(startup.includes("Get-Command npm.cmd") || startup.includes("Get-Command npm"), "Startup script must resolve npm on Windows.");

assert(exists("supabase/migrations/017_v4_0_audit_log_actor_compatibility.sql"), "Missing v4 audit actor migration.");
const auditMigration = read("supabase/migrations/017_v4_0_audit_log_actor_compatibility.sql");
for (const phrase of ["actor_type", "actor_name", "actor_email", "actor_id", "metadata", "set_audit_logs_actor", "trg_set_audit_logs_actor", "alter column actor set default 'system'"]) {
  assert(auditMigration.includes(phrase), `v4 audit migration missing ${phrase}`);
}
assert(read("supabase/MIGRATION_ORDER.md").includes("017_v4_0_audit_log_actor_compatibility.sql"), "Migration order missing v4 audit migration.");

const auditRepo = read("lib/data/audit-repository.ts");
for (const phrase of ["actor: audit.actor", "actor_type: audit.actorType", "actor_name: audit.actorName", "actor_email: audit.actorEmail", "actor_id: audit.actorId"]) {
  assert(auditRepo.includes(phrase), `Audit repository missing ${phrase}`);
}
assert(!/deleteAudit|from\("audit_logs"\)\.delete|from\('audit_logs'\)\.delete/i.test(read("lib/actions.ts")), "Normal app actions must not delete audit logs.");

const clientSafetyFiles = ["lib/ai-decision-schema.ts", "lib/mock-data.ts", "lib/adapters/whatsapp-adapter.ts", "app/review-chatgpt-ui/page.tsx"];
const generatedAmountPatterns = [/\bS\$\s*\d{2,}/i, /\bSGD\s*\d{2,}/i, /\bquote range\b/i, /\bprice estimate\b/i, /\bestimate range\b/i, /\brough estimate\b/i, /\bpackage price\b/i];
for (const file of clientSafetyFiles) {
  const content = read(file);
  assert(!/free consultation/i.test(content), `${file} contains forbidden consultation wording.`);
  for (const pattern of generatedAmountPatterns) {
    assert(!pattern.test(content), `${file} contains generated amount wording: ${pattern}`);
  }
}

const appointmentEngine = read("lib/appointment-engine.ts");
assert(appointmentEngine.includes("sunday"), "Sunday setting missing.");
assert(!/dayName\s*===\s*["']sunday["']|getDay\(\)\s*===\s*0|sunday[\s\S]{0,80}continue/i.test(appointmentEngine), "Hardcoded Sunday block found.");
assert(new Date("2026-05-31T00:00:00").getDay() === 0, "Sunday example date must be real Sunday.");

const reviewRoute = read("app/review-chatgpt-ui/page.tsx");
const shellChrome = read("components/ShellChrome.tsx");
assert(shellChrome.includes("Mock UI Review Mode") && shellChrome.includes("No Login Required") && shellChrome.includes("No Live Actions") && shellChrome.includes("Demo Data Only"), "Review shell safety header incomplete.");
assert(!/from\s+["']@\/lib\/actions["']|from\s+["']@\/lib\/data\/.*repository|from\s+["']@\/lib\/data\/supabase|<form/i.test(reviewRoute), "Review route imports live write path.");
assert(reviewRoute.includes("(Preview Only)") && reviewRoute.includes("Client Files Preview"), "Review route preview-only controls or files section missing.");
assert(!/reviewNavItems[\s\S]{0,900}href:\s*["']\/(leads|appointments|settings|audit-log)/.test(shellChrome), "Review route nav links to protected routes.");

assert(/auth\.profile\s*&&\s*auth\.authenticated[\s\S]{0,260}<LogoutButton/.test(shellChrome), "Logout must only render for authenticated profile.");
assert(shellChrome.includes("isLoginRoute") && shellChrome.includes("Secure sign-in"), "Login route shell must avoid protected-page warning copy.");
const loginText = read("app/login/page.tsx") + read("components/auth/LoginForm.tsx");
assert(loginText.includes("Sign in to Command Centre"), "Login page missing clean title.");
assert(!/<h2[\s\S]{0,80}>Login<\/h2>/i.test(loginText), "Login page duplicates Login heading.");

const nba = read("lib/next-best-action.ts");
for (const phrase of ["getNextBestAction", "reason", "urgency", "blockers", "Ask for floor plan/photos", "Needs Marcus approval"]) {
  assert(nba.includes(phrase), `Next best action missing ${phrase}`);
}

const approvalGates = read("lib/approval-gates.ts");
for (const phrase of ["approvalGateMatrix", "landed_extension", "commercial_project", "complaint_or_damage", "special_appointment_timing", "high_value_rejection"]) {
  assert(approvalGates.includes(phrase), `Approval gate matrix missing ${phrase}`);
}

const settings = read("app/settings/page.tsx");
for (const phrase of ["Supabase connected", "Audit log writable", "Appointment settings writable", "RLS enforced status", "Environment", "OpenAI", "WhatsApp", "Calendar"]) {
  assert(settings.includes(phrase), `System Health missing ${phrase}`);
}

for (const doc of ["LAUNCH_CHECKLIST.md", "GO_LIVE_MANUAL_STEPS.md", "BACKUP_AND_RECOVERY_GUIDE.md", "PROJECT_LAUNCH_AUDIT_NOTES.md", "V4_0_LAUNCH_CANDIDATE_REPORT.md"]) {
  assert(exists(doc), `Missing launch doc: ${doc}`);
}

for (const file of walk(root).filter((item) => /\.(ts|tsx)$/.test(item) && /^(app|components|lib)/.test(path.relative(root, item)))) {
  const relative = path.relative(root, file);
  if (relative === path.join("lib", "data", "supabase-admin.ts")) continue;
  if (relative.startsWith(`app${path.sep}api${path.sep}`)) continue;
  assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(fs.readFileSync(file, "utf8")), `Service role key referenced in frontend/app code: ${relative}`);
}

const allPaths = walk(root).map((file) => path.relative(root, file));
assert(!exists(".env"), ".env must not be present.");
assertNoTrackedOrPackagedGeneratedArtifacts({ root, assert });
assert(!allPaths.some((file) => /LIMM_AI_Sales_Agent_v2/i.test(file)), "Old v2 folder copied into v3.");

console.log("PASS: v4 launch candidate tests passed.");
