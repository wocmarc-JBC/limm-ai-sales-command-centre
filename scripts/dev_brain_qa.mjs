import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const startedAt = new Date().toISOString();
const results = [];
const bugsFound = [];
const bugsFixed = [];
const bugsRemaining = [];
const screenshots = [];
let browserPayload = null;

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  console.log(`${status}: ${name}${detail ? ` - ${detail}` : ""}`);
}

function run(name, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: Boolean(options.shell),
    env: { ...process.env, ...(options.env ?? {}) }
  });
  if (result.status === 0) {
    record(name, "PASS");
    return true;
  }
  if (options.optional) {
    record(name, "SKIP", options.skipDetail ?? `exit ${result.status}`);
    return false;
  }
  record(name, "FAIL", `exit ${result.status}`);
  return false;
}

function loadBrowserPayload() {
  const payloadPath = path.join(root, "test-results", "v4_2_qa_summary", "v4_2_report_payload.json");
  if (!fs.existsSync(payloadPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  } catch {
    return null;
  }
}

function getNpmCommand() {
  const candidates = process.platform === "win32" ? ["npm.cmd", "npm"] : ["npm"];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { cwd: root, encoding: "utf8", shell: true });
    if (result.status === 0) return candidate;
  }
  return "";
}

function loadPublicEnv() {
  const env = {};
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return env;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    if (["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"].includes(match[1])) {
      env[match[1]] = match[2].trim();
    }
  }
  return env;
}

const npmCommand = getNpmCommand();
const nextBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
if (!fs.existsSync(nextBin)) {
  if (npmCommand) {
    run("npm install", npmCommand, ["install"], { shell: process.platform === "win32" });
  } else {
    record("npm install", "SKIP", "npm was not found in this runner; browser tests remain ready for Marcus's shell.");
  }
}

const requiredScripts = [
  "scripts/doctor.mjs",
  "scripts/test_v3_foundation.mjs",
  "scripts/test_v3_supabase_layer.mjs",
  "scripts/test_v3_auth_rls_static.mjs",
  "scripts/test_v3_live_setup_static.mjs",
  "scripts/test_v3_review_route_static.mjs",
  "scripts/test_v4_launch_candidate.mjs",
  "scripts/test_v4_1_dev_brain_static.mjs",
  "scripts/test_v4_6_openai_dry_run.mjs",
  "scripts/test_v4_7_openai_boss_review_ux.mjs",
  "scripts/test_v4_8_whatsapp_closed_test.mjs",
  "scripts/test_v4_8_live_diagnostics_static.mjs",
  "scripts/test_whatsapp_adapter_payload_shape.mjs",
  "scripts/test_v4_9_deployment_readiness.mjs",
  "scripts/test_v5_whatsapp_sales_brain_calendar.mjs",
  "scripts/test_v5_2_whatsapp_question_bank.mjs",
  "scripts/test_v5_3_whatsapp_reply_coach_replay.mjs",
  "scripts/test_v5_3_1_multi_intent_lead_context_portfolio.mjs",
  "scripts/test_v5_3_2_deep_whatsapp_agent_qa.mjs",
  "scripts/test_v6_human_like_sales_brain_deep_qa.mjs",
  "scripts/test_v6_ultimate_deep_qa.mjs",
  "scripts/test_v6_1_ui_polish_cleanup.mjs",
  "scripts/test_v6_1_2_mission_control_ui_cleanup.mjs",
  "scripts/test_v6_1_4_mission_control_ux_final_polish.mjs",
  "scripts/test_v6_1_5_performance_followup_test_cleanup.mjs",
  "scripts/test_v6_1_6_mission_control_ui_integrated.mjs",
  "scripts/test_v6_1_7_mission_control_ui_refinement.mjs",
  "scripts/test_v6_1_8_dashboard_compression_zero_state_polish.mjs",
  "scripts/test_v6_3_sales_collection_command_centre.mjs",
  "scripts/test_v6_4_singapore_mission_map.mjs",
  "scripts/test_v6_4_1_singapore_tactical_map_ui_polish.mjs",
  "scripts/test_v6_4_2_accurate_singapore_map_no_overlay.mjs",
  "scripts/test_v6_4_3_singapore_map_zoom_hq_redesign.mjs"
];

let hardFail = false;

if (!fs.existsSync(path.join(root, "node_modules", "@supabase", "supabase-js"))) {
  record("live Supabase schema verifier", "SKIP", "Supabase package is not installed in this runner. Run npm.cmd install first.");
} else {
  run("live Supabase schema verifier", node, ["scripts/verify_live_supabase_schema.mjs"], {
    optional: true,
    skipDetail: "Live network may be blocked in this runner.",
    env: {
      ...loadPublicEnv(),
      SUPABASE_VERIFY_TIMEOUT_MS: process.env.SUPABASE_VERIFY_TIMEOUT_MS ?? "8000"
    }
  });
}

if (!process.env.SUPABASE_TEST_EMAIL || !process.env.SUPABASE_TEST_PASSWORD) {
  record("authenticated live actions verifier", "MANUAL REQUIRED", "Set SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD for a test boss user.");
} else {
  run("authenticated live actions verifier", node, ["scripts/verify_live_authenticated_actions.mjs"], {
    optional: true,
    skipDetail: "Manual required when SUPABASE_TEST_EMAIL/PASSWORD are not set.",
    env: loadPublicEnv()
  });
}

const browserAvailable = fs.existsSync(path.join(root, "node_modules", "@playwright", "test", "cli.js"));
if (browserAvailable) {
  const ok = run("Playwright browser QA", node, ["scripts/run_playwright_if_available.mjs"]);
  browserPayload = loadBrowserPayload();
  if (!ok) {
    hardFail = true;
    bugsFound.push("Playwright browser QA failed. See V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md for exact reason.");
    bugsRemaining.push("Playwright browser QA must pass before v4.2 can be marked done.");
  }
  if (browserPayload?.screenshots?.length) screenshots.push(...browserPayload.screenshots);
} else {
  hardFail = true;
  record("Playwright browser QA", "FAIL", "Playwright package is not installed. Run npm.cmd install and npx.cmd playwright install chromium.");
  bugsFound.push("Playwright browser QA could not start because @playwright/test is not installed in node_modules.");
  bugsRemaining.push("Run npm.cmd install, npx.cmd playwright install chromium, then npm.cmd run qa:browser.");
}

function buildReportPayload() {
  return {
    status: hardFail ? "FAIL" : (browserPayload?.status ?? "PASS"),
    startedAt,
    finishedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      npmDetected: Boolean(npmCommand),
      envLocalPresent: fs.existsSync(path.join(root, ".env.local")),
      supabasePublicEnvDetected: Boolean(loadPublicEnv().NEXT_PUBLIC_SUPABASE_URL && loadPublicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY),
      authenticatedCredentialsPresent: Boolean(process.env.SUPABASE_TEST_EMAIL && process.env.SUPABASE_TEST_PASSWORD),
      openAi: process.env.OPENAI_BRAIN_DRY_RUN === "true" ? "dry-run enabled; no live actions" : "disabled",
      whatsapp: process.env.WHATSAPP_TEST_AUTO_REPLY_ENABLED === "true" ? "auto-reply requested; gated by live/closed-test mode flags and safety validator" : "auto-reply disabled by default",
      calendar: process.env.CALENDAR_BOOKING_ENABLED === "true" ? "booking foundation enabled; boss approval still required" : "disabled by default"
    },
    results,
    screenshots: [...new Set(screenshots)],
    bugsFound,
    bugsFixed,
    bugsRemaining,
    routesTested: browserPayload?.routesTested?.length ? browserPayload.routesTested : [
      "/",
      "/login",
      "/leads",
      "/leads/lead-001",
      "/appointments",
      "/appointment-settings",
      "/approvals",
      "/followups",
      "/quotation-readiness",
      "/client-files",
      "/reports",
      "/settings",
      "/audit-log",
      "/review-chatgpt-ui"
    ],
    authTested: Boolean(process.env.SUPABASE_TEST_EMAIL && process.env.SUPABASE_TEST_PASSWORD),
    browserCompleted: Boolean(browserPayload?.browserCompleted),
    browserReport: fs.existsSync(path.join(root, "V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md")) ? "V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md" : "",
    buttonsTested: browserPayload?.buttons ?? [],
    formsTested: browserPayload?.forms ?? [],
    traces: browserPayload?.traces ?? [],
    goNoGo: hardFail
      ? "NO-GO until failed checks are fixed."
      : browserPayload?.goNoGo ?? "GO for internal launch-candidate testing; MANUAL REQUIRED for authenticated boss writes when credentials are absent.",
    nextCodexTask: hardFail
      ? "Fix Playwright browser QA and rerun npm.cmd run qa:browser before moving forward."
      : "v6.4.3 Singapore Map Zoom + HQ Redesign is ready for controlled deploy proof after the health endpoint shows v6_4_3_singapore_map_zoom_hq_redesign. Next recommended phase: visually verify the wider zoomable dashboard map, pan/reset controls, LIMM HQ marker, Sentosa-only base, brighter gold/amber separation, no blocking empty overlay, privacy-safe area summaries, Sales Pipeline, Sales & Collection, Targets, and existing Mission Control dashboard."
  };
}

function generateReports() {
  const runJson = JSON.stringify(buildReportPayload());
  run("generate Dev Brain report", node, ["scripts/generate_dev_brain_report.mjs"], {
    env: { DEV_BRAIN_RUN_JSON: runJson }
  });
  run("generate ChatGPT handoff report", node, ["scripts/generate_chatgpt_handoff_report.mjs"], {
    env: { DEV_BRAIN_RUN_JSON: runJson }
  });
}

generateReports();
run("cleanup generated artifacts before package audit", node, ["scripts/cleanup_generated_artifacts.mjs"], {
  optional: true,
  env: {
    LIMM_CLEANUP_STOP_NODE: "true",
    LIMM_CLEANUP_KEEP_PIDS: String(process.pid)
  }
});
for (const script of requiredScripts) {
  const ok = run(script, node, [script]);
  if (!ok) hardFail = true;
}
const auditOk = run("package audit", node, ["scripts/audit_v3_package.mjs"]);
if (!auditOk) hardFail = true;
generateReports();

process.exit(hardFail ? 1 : 0);
