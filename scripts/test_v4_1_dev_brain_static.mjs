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

const pkg = JSON.parse(read("package.json"));
for (const script of ["qa:browser", "qa:dev-brain", "qa:report", "verify:all", "doctor", "audit:launch", "start:local"]) {
  assert(pkg.scripts?.[script], `Missing package script: ${script}`);
}
assert(pkg.devDependencies?.["@playwright/test"], "Playwright dev dependency missing.");

for (const file of [
  "playwright.config.ts",
  "tests/e2e/review-route.spec.ts",
  "tests/e2e/protected-routes.spec.ts",
  "tests/e2e/login.spec.ts",
  "tests/e2e/authenticated-boss.spec.ts",
  "tests/e2e/route-checks.spec.ts",
  "tests/e2e/v4-2-human-browser.spec.ts",
  "scripts/run_playwright_if_available.mjs",
  "scripts/dev_brain_qa.mjs",
  "scripts/dev_brain_route_probe.mjs",
  "scripts/generate_v4_2_browser_report.mjs",
  "scripts/generate_dev_brain_report.mjs",
  "scripts/generate_chatgpt_handoff_report.mjs",
  "scripts/cleanup_generated_artifacts.mjs",
  "CREATE_CHATGPT_HANDOFF_REPORT.ps1",
  "CREATE_CHATGPT_HANDOFF_REPORT.bat",
  "DEV_BRAIN_AUTOFIX_POLICY.md",
  "V4_1_DEV_BRAIN_QA_SYSTEM_REPORT.md"
]) {
  assert(exists(file), `Missing v4.1 Dev Brain file: ${file}`);
}

const reviewSpec = read("tests/e2e/review-route.spec.ts");
for (const phrase of [
  "NEXT_PUBLIC_ENABLE_REVIEW_ROUTE",
  "Mock UI Review Mode",
  "No Login Required",
  "No Live Actions",
  "Demo Data Only",
  "review-route-disabled.png",
  "screenshots/review-route.png",
  "2026-05-31",
  "Client Files Preview",
  "Preview Only"
]) {
  assert(reviewSpec.includes(phrase), `Review route browser test missing ${phrase}`);
}

const protectedSpec = read("tests/e2e/protected-routes.spec.ts");
for (const route of ["/", "/leads", "/appointments", "/appointment-settings", "/approvals", "/followups", "/quotation-readiness", "/client-files", "/reports", "/settings", "/audit-log"]) {
  assert(protectedSpec.includes(route), `Protected route browser test missing ${route}`);
}
assert(protectedSpec.includes("Logout") && protectedSpec.includes("Go to Login"), "Protected route test must check logout absence and login link.");

const loginSpec = read("tests/e2e/login.spec.ts");
assert(loginSpec.includes("Email") && loginSpec.includes("Password") && loginSpec.includes("Sign In"), "Login browser test missing core fields.");
assert(loginSpec.includes("SERVICE_ROLE"), "Login browser test must check service-role wording is not displayed.");

const authSpec = read("tests/e2e/authenticated-boss.spec.ts");
assert(authSpec.includes("SUPABASE_TEST_EMAIL") && authSpec.includes("SUPABASE_TEST_PASSWORD"), "Authenticated browser test must use env credentials.");
assert(authSpec.includes("test.skip"), "Authenticated browser test must skip cleanly when credentials are missing.");

const runner = read("scripts/dev_brain_qa.mjs");
for (const phrase of ["scripts/doctor.mjs", "scripts/test_v4_1_dev_brain_static.mjs", "scripts/audit_v3_package.mjs", "generate_dev_brain_report", "generate_chatgpt_handoff_report", "scripts/run_playwright_if_available.mjs"]) {
  assert(runner.includes(phrase), `Dev Brain runner missing ${phrase}`);
}
assert(runner.includes("SUPABASE_TEST_EMAIL") && runner.includes("SUPABASE_TEST_PASSWORD"), "Dev Brain runner must report authenticated credential status.");
assert(!/Playwright browser QA[\s\S]{0,120}optional:\s*true/.test(runner), "Dev Brain runner must not hide browser QA failure behind optional PASS.");

const browserSpec = read("tests/e2e/v4-2-human-browser.spec.ts");
for (const phrase of ["v4_2_browser_human_test", "route human check", "review route detailed", "authenticated boss flow", "desktop", "tablet", "mobile"]) {
  assert(browserSpec.includes(phrase), `v4.2 browser human spec missing ${phrase}`);
}
assert(browserSpec.includes("fullPage: false"), "v4.2 route screenshots must stay viewport-sized so responsive evidence remains deterministic.");

const browserRunner = read("scripts/run_playwright_if_available.mjs");
for (const phrase of ["generate_v4_2_browser_report.mjs", "V4_2_QA_RUN_ID", "V4_2_SCREENSHOT_DIR", "process.execPath", "npm.cmd install", "npx.cmd playwright install chromium"]) {
  assert(browserRunner.includes(phrase), `v4.2 browser runner missing ${phrase}`);
}
assert(browserRunner.includes('"-H", "127.0.0.1"'), "v4.2 browser runner must bind Next.js explicitly for restricted CI network-interface environments.");
assert(browserRunner.includes('process.env.QA_E2E_MODE ?? "1"'), "v4.2 browser runner must default to isolated QA mode so Mock Mode route checks match the live application behavior.");
assert(browserRunner.includes('[nextCli, "build"]') && browserRunner.includes('[nextCli, "start"'), "v4.2 browser QA must verify the production Next.js bundle instead of relying on the long-running development compiler.");
const playwrightConfig = read("playwright.config.ts");
assert(playwrightConfig.includes("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH") && playwrightConfig.includes('existsSync("/tmp/chromium")'), "Playwright config must support the managed Chromium executable without relying on a locked home cache.");
assert(playwrightConfig.includes("-H 127.0.0.1"), "Playwright-managed Next.js server must bind explicitly for restricted CI environments.");
assert(playwrightConfig.includes('name: "boss-ops-chromium"') && playwrightConfig.includes("testIgnore: /boss-ops-quotation-data-hygiene"), "Stateful boss-ops browser QA must run in its own final project so route smoke tests keep a clean mock server.");

const mockData = read("lib/mock-data.ts");
assert(/division:\s*"LIMM Works"[\s\S]{0,260}propertyType:\s*"Old inter-terrace"/.test(mockData), "Landed kitchen extension scenario missing or misclassified.");
assert(/division:\s*"LIMM Works"[\s\S]{0,260}propertyType:\s*"Commercial clinic"/.test(mockData), "Commercial clinic scenario must be LIMM Works.");
assert(/division:\s*"Demo Works"[\s\S]{0,260}serviceType:\s*"Hacking and disposal"/.test(mockData), "Hacking-only scenario must be Demo Works.");
assert(/division:\s*"Carpentry Works"[\s\S]{0,260}serviceType:\s*"Carpentry"/.test(mockData), "Carpentry wardrobe scenario must be Carpentry Works.");
assert(/lastClientMessage:\s*"How much for wardrobe\?"/.test(mockData), "Price enquiry scenario missing.");
assert(!/\bS\$\s*\d{2,}|\bSGD\s*\d{2,}|\bquote range\b|\brough estimate\b|\bprice estimate\b/i.test(mockData), "Mock scenario data must not contain prices/ranges.");

const nextBestAction = read("lib/next-best-action.ts");
assert(nextBestAction.includes("action") && nextBestAction.includes("reason") && nextBestAction.includes("urgency") && nextBestAction.includes("blockers"), "Next best action must include action, reason, urgency, blockers.");

const approvalGates = read("lib/approval-gates.ts");
for (const key of ["price_estimate", "timeline_promise", "authority_statement", "landed_extension", "commercial_project", "structural_concern", "complaint", "discount_request", "special_appointment_timing", "risky_site_visit", "reject_high_value_lead"]) {
  assert(approvalGates.includes(key), `Approval gate matrix missing ${key}`);
}

const policy = read("DEV_BRAIN_AUTOFIX_POLICY.md");
assert(/Auto-?Fix Allowed/i.test(policy) && /Approval Required/i.test(policy), "Autofix policy missing key sections.");

const gitignore = read(".gitignore");
for (const ignored of ["test-results/", "playwright-report/", "screenshots/"]) {
  assert(gitignore.includes(ignored), `.gitignore missing ${ignored}`);
}

console.log("PASS: v4.1 Dev Brain static tests passed.");
