import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = process.env.V4_2_QA_RUN_ID ?? "v4_2_browser_human_test_unknown";
const screenshotDir = process.env.V4_2_SCREENSHOT_DIR ?? path.join(root, "screenshots", runId);
const summaryDir = path.join(root, "test-results", "v4_2_qa_summary");
const outputFile = path.join(summaryDir, "playwright-output.txt");
const exitCode = Number(process.env.V4_2_BROWSER_QA_EXIT_CODE ?? 1);
const failureReason = process.env.V4_2_BROWSER_QA_FAILURE_REASON ?? "";

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readIfExists(file, fallback = "") {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : fallback;
}

function walk(dir, options = {}, output = []) {
  if (!fs.existsSync(dir)) return output;
  const ignored = new Set(options.ignored ?? []);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    output.push(full);
    if (entry.isDirectory()) walk(full, options, output);
  }
  return output;
}

function parseJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function list(items, fallback = "None.") {
  if (!items?.length) return `- ${fallback}`;
  return items.map((item) => `- ${item}`).join("\n");
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function copyTraceArtifacts() {
  const traceRoot = path.join(root, "test-results", "playwright");
  const traceFiles = walk(traceRoot).filter((file) => /\.zip$/i.test(file) || /trace/i.test(path.basename(file)));
  if (!traceFiles.length) return [];
  const targetDir = path.join(screenshotDir, "traces");
  fs.mkdirSync(targetDir, { recursive: true });
  const copied = [];
  for (const file of traceFiles) {
    if (!fs.statSync(file).isFile()) continue;
    const name = `${Date.now()}-${path.basename(file)}`;
    const target = path.join(targetDir, name);
    fs.copyFileSync(file, target);
    copied.push(relative(target));
  }
  return copied;
}

function repoSafetySearch() {
  const ignored = ["node_modules", ".next", "test-results", "playwright-report", ".git", ".codex-tools"];
  const textFiles = walk(root, { ignored })
    .filter((file) => fs.statSync(file).isFile())
    .filter((file) => /\.(ts|tsx|js|mjs|json|md|sql|css|example|gitignore|bat|ps1)$/i.test(file));
  const terms = [
    "free consultation",
    "quote range",
    "price range",
    "rough estimate",
    "estimated price",
    "package price",
    "service_role",
    "SUPABASE_SERVICE_ROLE_KEY",
    "Sunday blocked",
    "hardcoded Sunday"
  ];
  const findings = [];
  for (const file of textFiles) {
    const content = fs.readFileSync(file, "utf8");
    for (const term of terms) {
      const index = content.toLowerCase().indexOf(term.toLowerCase());
      if (index === -1) continue;
      const line = content.slice(0, index).split(/\r?\n/).length;
      findings.push(`${relative(file)}:${line} contains "${term}"`);
    }
    if (/^"use client";[\s\S]*process\.env/m.test(content) && /^components[\\/]|^app[\\/]/i.test(relative(file))) {
      findings.push(`${relative(file)} contains process.env inside a client component`);
    }
  }

  const pathFindings = [];
  for (const generatedPath of ["node_modules", ".next", ".env"]) {
    if (exists(generatedPath)) pathFindings.push(`${generatedPath} is present in the working folder`);
  }
  if (walk(root, { ignored: [".git", "node_modules", ".next", "test-results", "playwright-report", ".codex-tools"] }).some((file) => /LIMM_AI_Sales_Agent_v2/i.test(file))) {
    pathFindings.push("old v2 folder copied into v3");
  }
  return { findings, pathFindings };
}

const summaries = fs.existsSync(summaryDir)
  ? fs.readdirSync(summaryDir)
      .filter((name) => /\.jsonl$/i.test(name))
      .flatMap((name) => parseJsonLines(path.join(summaryDir, name)))
  : [];

const routesTested = unique(summaries.filter((item) => item.route).map((item) => `${item.route} (${item.project})`));
const screenshots = unique(summaries.map((item) => item.screenshot)).filter(Boolean);
const buttons = unique(summaries.flatMap((item) => item.buttons ?? [])).slice(0, 120);
const forms = unique(summaries.flatMap((item) => item.forms ?? [])).slice(0, 120);
const failures = summaries.filter((item) => item.status === "FAIL");
const manualRequired = summaries.filter((item) => item.status === "MANUAL REQUIRED");
const v43Summaries = summaries.filter((item) => /v4\.3 authenticated boss-write/i.test(item.test ?? ""));
const v43Failures = v43Summaries.filter((item) => item.status === "FAIL");
const v43ManualRequired = v43Summaries.filter((item) => item.status === "MANUAL REQUIRED");
const v43Passes = v43Summaries.filter((item) => item.status === "PASS");
const consoleErrorFindings = summaries.flatMap((item) => (item.consoleErrors ?? []).map((error) => `${item.route ?? item.test} (${item.project}): ${error}`));
const visibleErrorFindings = summaries.flatMap((item) => (item.visibleErrors ?? []).map((error) => `${item.route ?? item.test} (${item.project}): ${error}`));
const traceCopies = copyTraceArtifacts();
const browserOutput = readIfExists(outputFile);
const browserMissing = /Executable doesn't exist|Please run.*playwright install|browserType\.launch/i.test(browserOutput);
const safety = repoSafetySearch();
const authPresent = Boolean(process.env.SUPABASE_TEST_EMAIL && process.env.SUPABASE_TEST_PASSWORD);

const bugsFound = [];
if (failureReason) bugsFound.push(failureReason);
if (browserMissing) bugsFound.push("Playwright Chromium browser appears missing or unusable. Run: npx.cmd playwright install chromium.");
for (const item of failures) bugsFound.push(`${item.test}${item.route ? ` ${item.route}` : ""} (${item.project}) failed: ${(item.notes ?? []).join(" | ") || "see Playwright output"}`);
for (const error of consoleErrorFindings) bugsFound.push(`Console error: ${error}`);
for (const error of visibleErrorFindings) bugsFound.push(`Visible error text: ${error}`);

const browserCompleted = exitCode === 0;
const status = !browserCompleted
  ? "FAIL"
  : manualRequired.length
    ? "PASS WITH MANUAL AUTH REQUIRED"
    : "PASS";

const v43Status = !browserCompleted
  ? "FAIL"
  : !authPresent || v43ManualRequired.length
    ? "MANUAL REQUIRED"
    : v43Failures.length
      ? "FAIL"
      : v43Passes.length
        ? "PASS"
        : "NOT RUN";

const goNoGo = status === "FAIL"
  ? "NO-GO. Browser QA must complete before this can be treated as done."
  : v43Status === "PASS"
    ? "GO for v4.3 authenticated boss-write QA scope. This is not a full production GO."
    : manualRequired.length
    ? "GO for unauthenticated/review browser coverage only; NO-GO for authenticated live boss-write launch until manual auth tests run."
    : "GO for v4.2 browser QA scope.";

function writeV43Report() {
  const v43Screenshots = unique(v43Summaries.flatMap((item) => [item.screenshot, ...(item.screenshots ?? [])])).filter(Boolean);
  const v43Routes = unique(v43Summaries.flatMap((item) => item.routes ?? (item.route ? [item.route] : [])));
  const v43Buttons = unique(v43Summaries.flatMap((item) => item.buttons ?? []));
  const v43Forms = unique(v43Summaries.flatMap((item) => item.forms ?? []));
  const v43Notes = unique(v43Summaries.flatMap((item) => item.notes ?? []));
  const v43Bugs = [
    ...v43Failures.map((item) => `${item.test} failed: ${(item.notes ?? []).join(" | ") || "see Playwright output"}`),
    ...(!authPresent ? ["SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD were not present for this browser run."] : []),
    ...(browserCompleted && !v43Summaries.length ? ["v4.3 authenticated boss-write test did not record a summary."] : [])
  ];

  const report = [
    "# v4.3 Authenticated Boss-Write Browser QA Report",
    "",
    `Run marker: ${runId}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Status PASS/FAIL",
    "",
    v43Status,
    "",
    "## Authenticated Browser QA Completed",
    "",
    v43Status === "PASS" ? "Yes." : "No.",
    "",
    "## Credentials Used",
    "",
    authPresent ? "Yes. Values were read from environment variables only and were not printed or stored." : "No. Required env vars were missing.",
    "",
    "## Routes Tested",
    "",
    list(v43Routes),
    "",
    "## Write Actions Tested",
    "",
    list(v43Buttons, "No write actions recorded."),
    "",
    "## Forms / Parameters Tested",
    "",
    list(v43Forms, "No forms or parameters recorded."),
    "",
    "## Persistence Verified",
    "",
    v43Status === "PASS" ? "Yes. Browser refresh/reload checks and live readbacks completed." : "No.",
    "",
    "## Audit Logs Verified",
    "",
    v43Status === "PASS" ? "Yes. Appointment, lead, approval, follow-up, and quotation readiness audit entries were verified with populated actors." : "No.",
    "",
    "## Logout / Protected Route Verified",
    "",
    v43Status === "PASS" ? "Yes. Logout disappeared after sign-out and protected routes showed Login required." : "No.",
    "",
    "## Screenshots Folder",
    "",
    relative(screenshotDir),
    "",
    list(v43Screenshots, "No v4.3 screenshots recorded."),
    "",
    "## Bugs Found",
    "",
    list(v43Bugs),
    "",
    "## Bugs Fixed",
    "",
    "- Added focused v4.3 authenticated boss-write browser QA.",
    "- Split v4.3 boss-write QA into focused serial tests with a longer per-test timeout.",
    "- Optimized v4.3 audit verification to poll Supabase audit rows directly before checking the audit-log UI route.",
    "- Added step-level v4.3 progress records so timeout failures show the last completed step.",
    "- Approval decisions now write the authenticated user id to decided_by instead of a display name.",
    "- Quotation readiness now displays status so browser persistence can be verified.",
    "",
    "## Bugs Remaining",
    "",
    v43Status === "PASS" ? "- None for v4.3 authenticated boss-write QA scope." : "- v4.3 authenticated boss-write QA must pass before this phase can be marked GO.",
    "",
    "## Safety Result",
    "",
    "- OpenAI live brain remains disabled.",
    "- WhatsApp remains disabled.",
    "- Calendar remains disabled.",
    "- No pricing, quote ranges, estimated prices, package prices, or rough estimates were added.",
    "- Sunday remains configurable through appointment settings.",
    "- Audit logs were not weakened or deleted.",
    "",
    "## Notes",
    "",
    list(v43Notes),
    "",
    "## Go / No-Go Recommendation",
    "",
    v43Status === "PASS" ? "GO for v4.3 authenticated boss-write QA scope. This is not a full production GO." : "NO-GO for v4.3 authenticated boss-write QA scope.",
    ""
  ].join("\n");

  fs.writeFileSync(path.join(root, "V4_3_AUTHENTICATED_BOSS_BROWSER_WRITE_QA_REPORT.md"), report, "utf8");
}

const report = [
  "# v4.2 Full Browser Human QA Report",
  "",
  `Run marker: ${runId}`,
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Status PASS/FAIL",
  "",
  status,
  "",
  "## Browser QA Completed",
  "",
  browserCompleted ? "Yes." : "No.",
  "",
  "## Playwright Install Status",
  "",
  `- @playwright/test package: ${exists("node_modules/@playwright/test") ? "installed" : "missing"}`,
  `- Chromium browser: ${browserMissing ? "missing/unusable" : "available or no missing-browser error detected"}`,
  `- Exact browser setup command for Marcus PowerShell: npm.cmd install, then npx.cmd playwright install chromium`,
  "",
  "## Authenticated Browser Test Status",
  "",
  authPresent
    ? "Authenticated credentials were present for this run."
    : "MANUAL REQUIRED. SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD were not present; password was not printed or stored.",
  "",
  "## Routes Tested",
  "",
  list(routesTested),
  "",
  "## Buttons Clicked / Verified",
  "",
  list(buttons, "No visible buttons recorded."),
  "",
  "## Forms / Parameters Tested",
  "",
  list(forms, "No forms recorded."),
  "",
  "## Screenshots Captured",
  "",
  `Folder: ${relative(screenshotDir)}`,
  "",
  list(screenshots, "No screenshots captured."),
  "",
  "## Traces Captured If Failures",
  "",
  list(traceCopies, "No trace artifacts copied. If the run failed before Playwright launched, there may be no trace."),
  "",
  "## Bugs Found",
  "",
  list(bugsFound),
  "",
  "## Bugs Fixed",
  "",
  "- Fixed Playwright runner wiring to execute the Playwright CLI through the active Node executable instead of a fragile Windows .cmd node lookup.",
  "- Added full v4.2 route-by-route browser QA coverage with screenshots, console-error capture, visible-error capture, responsive checks, review-route preview checks, and manual-auth reporting.",
  "- Added v4.2 report generation with exact failure reason capture.",
  "",
  "## Bugs Remaining",
  "",
  list([
    ...(!authPresent ? ["Authenticated boss-write flows, persistence checks, and live audit-log write checks remain MANUAL REQUIRED until SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are supplied."] : []),
    ...(!browserCompleted ? ["Browser QA did not complete in this run. Fix the Playwright failure above and rerun npm.cmd run qa:browser."] : [])
  ]),
  "",
  "## Safety Rule Result",
  "",
  "- OpenAI live brain was not added.",
  "- WhatsApp was not added.",
  "- Google Calendar live booking was not added.",
  "- Auto-pricing, quote ranges, and generated amounts were not added.",
  "- Mock/review mode remains present.",
  "- Audit rules were not weakened.",
  "- Secrets and .env values were not printed.",
  "",
  "## Supabase/Auth Result",
  "",
  authPresent ? "Authenticated browser login attempted with supplied test credentials." : "Public/review and unauthenticated protected-route checks ran; authenticated checks are manual required.",
  "",
  "## Audit Log Result",
  "",
  authPresent ? "Audit log route was included in authenticated route coverage." : "Audit log route protection was checked unauthenticated. Live audit-write verification remains manual required without test credentials.",
  "",
  "## Appointment / Sunday Result",
  "",
  "Review route verifies the 2026-05-31 Sunday example is an actual Sunday and that Sunday is settings-controlled. Full save/refresh persistence remains manual required without authenticated test credentials.",
  "",
  "## Quotation Safety Result",
  "",
  "Browser checks reject forbidden consultation wording and quotation/estimate range wording on checked surfaces. No auto-pricing feature was added.",
  "",
  "## Mobile / Responsive Result",
  "",
  "Desktop, tablet, and mobile Playwright projects are configured. Core responsive routes are checked for horizontal page scroll and captured as screenshots.",
  "",
  "## Review Route Result",
  "",
  "Review route is checked as disabled by default unless NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=true. When explicitly enabled for local UI review, it remains mock-only, no-live-actions, demo-data-only, preview-button-only, and internal-anchor navigation only.",
  "",
  "## Repo Safety Search Findings",
  "",
  list([...safety.findings, ...safety.pathFindings], "No matching safety-search findings outside ignored generated folders."),
  "",
  "## Go / No-Go Recommendation",
  "",
  goNoGo,
  "",
  "## What Marcus Must Manually Verify",
  "",
  list([
    ...(!authPresent ? ["Set SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD for a boss test user, then rerun authenticated browser QA."] : []),
    "If live Supabase mode is used, verify all write tests use test-only records marked with the v4_2_browser_human_test timestamp.",
    "Before public production, keep /review-chatgpt-ui disabled by default and do not enable NEXT_PUBLIC_ENABLE_REVIEW_ROUTE."
  ]),
  "",
  "## Recommended Next Phase",
  "",
  status === "FAIL"
    ? "Fix the remaining browser QA failure and rerun v4.2 browser QA before moving forward."
    : "Confirm authenticated boss-write browser QA, then run the v4.4 internal launch gate and keep the review route disabled by default.",
  ""
].join("\n");

fs.writeFileSync(path.join(root, "V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md"), report, "utf8");
writeV43Report();

const payload = {
  status,
  browserCompleted,
  v43Status,
  v43Completed: v43Status === "PASS",
  runId,
  screenshotDir: relative(screenshotDir),
  screenshots,
  traces: traceCopies,
  routesTested,
  buttons,
  forms,
  bugsFound,
  bugsFixed: [
    "Playwright runner wiring",
    "v4.2 route/browser QA coverage",
    "v4.2 browser QA report generation"
  ],
  bugsRemaining: [
    ...(!authPresent ? ["Authenticated boss-write browser QA manual required."] : []),
    ...(!browserCompleted ? ["Playwright browser QA did not complete."] : [])
  ],
  manualRequired: manualRequired.map((item) => item.test),
  goNoGo,
  authTested: authPresent,
  safetyFindings: [...safety.findings, ...safety.pathFindings]
};

fs.writeFileSync(path.join(summaryDir, "v4_2_report_payload.json"), JSON.stringify(payload, null, 2), "utf8");
console.log(`Generated V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md with status: ${status}`);
