import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function check(name, ok, detail = "") {
  results.push({ level: ok ? "PASS" : "FAIL", name, detail });
}

function warn(name, detail = "") {
  results.push({ level: "WARN", name, detail });
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "dist", "build", "coverage"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    output.push(full);
    if (entry.isDirectory()) walk(full, output);
  }
  return output;
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
check("Node version", nodeMajor >= 18, `Detected ${process.versions.node}`);

const npmCandidates = process.platform === "win32" ? ["npm.cmd", "npm"] : ["npm"];
let npmVersion = null;
for (const candidate of npmCandidates) {
  const result = spawnSync(candidate, ["--version"], { shell: true, encoding: "utf8" });
  if (result.status === 0) {
    npmVersion = result;
    break;
  }
}
if (npmVersion) {
  check("npm availability", true, npmVersion.stdout.trim());
} else {
  warn("npm availability", "npm was not found in this runner. The startup script checks npm before launch and will stop with a clear message if Node/npm is not installed.");
}

check("package.json exists", exists("package.json"));
const pkg = JSON.parse(read("package.json"));
for (const dependency of ["next", "react", "react-dom"]) {
  check(`dependency ${dependency}`, Boolean(pkg.dependencies?.[dependency]), pkg.dependencies?.[dependency] ?? "missing");
}
for (const script of ["doctor", "verify", "audit:launch", "start:local"]) {
  check(`npm script ${script}`, Boolean(pkg.scripts?.[script]));
}

if (!exists(".env.local")) {
  warn(".env.local", "Missing. Mock Mode can run; Supabase Mode needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
} else {
  const envLocal = read(".env.local");
  warn(".env.local", "Present locally. Values were not printed.");
  check("Supabase URL env name", /NEXT_PUBLIC_SUPABASE_URL\s*=/.test(envLocal), "Value hidden.");
  check("Supabase anon env name", /NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=/.test(envLocal), "Value hidden.");
}

check("migrations folder", exists("supabase/migrations"));
check("audit actor compatibility migration", exists("supabase/migrations/017_v4_0_audit_log_actor_compatibility.sql"));

for (const route of [
  "app/page.tsx",
  "app/leads/page.tsx",
  "app/appointment-settings/page.tsx",
  "app/approvals/page.tsx",
  "app/followups/page.tsx",
  "app/quotation-readiness/page.tsx",
  "app/settings/page.tsx",
  "app/audit-log/page.tsx",
  "app/review-chatgpt-ui/page.tsx"
]) {
  check(`route ${route}`, exists(route));
}

for (const doc of [
  "LAUNCH_CHECKLIST.md",
  "GO_LIVE_MANUAL_STEPS.md",
  "BACKUP_AND_RECOVERY_GUIDE.md",
  "PROJECT_LAUNCH_AUDIT_NOTES.md",
  "V4_0_LAUNCH_CANDIDATE_REPORT.md"
]) {
  check(`doc ${doc}`, exists(doc));
}

const sourceFiles = walk(root).filter((file) => /\.(ts|tsx|js|mjs|md|sql|json|example|ps1|bat)$/i.test(file));
const secretPatterns = [/sk-[A-Za-z0-9_-]{20,}/, /EAAG[A-Za-z0-9]{20,}/, /^SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S{20,}$/m];
let secretFinding = "";
for (const file of sourceFiles) {
  if (file.endsWith(".env.local")) continue;
  const content = fs.readFileSync(file, "utf8");
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) secretFinding = path.relative(root, file);
  }
}
check("no obvious secrets in source files", !secretFinding, secretFinding);

const clientSafetyFiles = ["lib/ai-decision-schema.ts", "lib/mock-data.ts", "lib/adapters/whatsapp-adapter.ts", "app/review-chatgpt-ui/page.tsx"];
const pricingPatterns = [/\bS\$\s*\d{2,}/i, /\bSGD\s*\d{2,}/i, /\bquote range\b/i, /\bprice estimate\b/i, /\bestimate range\b/i, /\brough estimate\b/i, /\bpackage price\b/i];
for (const file of clientSafetyFiles) {
  const content = read(file);
  check(`${file} has no forbidden consultation phrase`, !/free consultation/i.test(content));
  for (const pattern of pricingPatterns) {
    check(`${file} has no generated amount wording ${pattern}`, !pattern.test(content));
  }
}

const appointmentEngine = read("lib/appointment-engine.ts");
check("Sunday config present", appointmentEngine.includes("sunday"));
check("No hardcoded Sunday block", !/dayName\s*===\s*["']sunday["']|getDay\(\)\s*===\s*0|sunday[\s\S]{0,80}continue/i.test(appointmentEngine));

for (const result of results) {
  const suffix = result.detail ? ` - ${result.detail}` : "";
  console.log(`${result.level}: ${result.name}${suffix}`);
}

const failed = results.filter((item) => item.level === "FAIL");
console.log(`\nDoctor summary: ${failed.length ? "FAIL" : "PASS"} (${results.filter((item) => item.level === "WARN").length} WARN)`);
process.exit(failed.length ? 1 : 0);
