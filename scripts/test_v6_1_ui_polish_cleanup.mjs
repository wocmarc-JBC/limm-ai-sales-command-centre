import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = path.join(root, "reports", "tmp_v6_1_cleanup_test");
const fixturePath = path.join(tempDir, "fixture.json");
const reportPath = path.join(tempDir, "dry_run_report.md");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(args) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    shell: false
  });
}

fs.mkdirSync(tempDir, { recursive: true });
fs.writeFileSync(
  fixturePath,
  JSON.stringify(
    {
      leads: [
        {
          id: "qa-test-lead-001",
          client_name: "QA Test Lead",
          phone: "+65 9999 9999",
          source: "Playwright QA",
          status: "New Enquiry",
          last_client_message: "hello...can help me do my kitchen?",
          is_test: false
        },
        {
          id: "real-lead-001",
          client_name: "Real Homeowner",
          phone: "+65 9123 7788",
          source: "WhatsApp",
          status: "New Enquiry",
          last_client_message: "how much ah",
          is_test: false
        },
        {
          id: "sandbox-lead-001",
          client_name: "Sandbox Lead",
          phone: "+65 0000 0000",
          source: "QA",
          status: "Awaiting Client",
          deleted_at: "2026-05-31T10:00:00+08:00",
          is_test: true
        }
      ],
      messages: [
        {
          lead_id: "qa-test-lead-001",
          body: "v6_ultimate QA marker floor plan test",
          metadata: { created_by: "test_v6_ultimate_deep_qa" }
        },
        {
          lead_id: "real-lead-001",
          body: "how much ah",
          metadata: {}
        }
      ]
    },
    null,
    2
  ),
  "utf8"
);

const cleanupResult = runNode([
  "scripts/cleanup_old_test_leads_v6_1.mjs",
  "--fixture",
  path.relative(root, fixturePath),
  "--report",
  path.relative(root, reportPath)
]);

assert(cleanupResult.status === 0, `cleanup dry run failed: ${cleanupResult.stderr || cleanupResult.stdout}`);
assert(fs.existsSync(reportPath), "cleanup dry-run report was not created");
const cleanupReport = fs.readFileSync(reportPath, "utf8");
assert(/Mode: DRY RUN/.test(cleanupReport), "cleanup report must default to dry-run mode");
assert(/Total leads scanned: 3/.test(cleanupReport), "cleanup dry run should scan fixture leads");
assert(/Test leads identified: 2/.test(cleanupReport), "cleanup dry run should identify only clear test leads");
assert(/Real Homeowner[\s\S]{0,300}Action: not_touched/.test(cleanupReport), "real-looking weak phrase lead must not be touched");
assert(/Soft-deleted: 0/.test(cleanupReport), "dry run must not soft-delete anything");
assert(/Hard-deleted: 0/.test(cleanupReport), "dry run must not hard-delete anything");

const cleanupScript = read("scripts/cleanup_old_test_leads_v6_1.mjs");
assert(cleanupScript.includes("--apply"), "cleanup script must require explicit --apply for writes");
assert(cleanupScript.includes("--hard-delete-test-data"), "cleanup script must require explicit hard-delete test-data flag");
assert(cleanupScript.includes("lead_test_cleanup_soft_delete_planned"), "cleanup script must audit soft-delete cleanup actions");
assert(cleanupScript.includes("lead_test_cleanup_hard_delete_pre_audit"), "cleanup script must audit before hard delete");
assert(cleanupScript.includes("already-soft-deleted"), "cleanup script must only hard-delete already-soft-deleted test data");

const globals = read("app/globals.css");
const tailwind = read("tailwind.config.ts");
const dashboard = read("app/page.tsx");
const leadCard = read("components/LeadCard.tsx");
const leadDetail = read("app/leads/[id]/page.tsx");
const settings = read("app/settings/page.tsx");
const reports = read("app/reports/page.tsx");
const health = read("app/api/whatsapp/health/route.ts");

for (const field of [
  'version: "v6_1_ui_polish_test_cleanup"',
  "uiPolishAvailable",
  "premiumGoldCommandCentreThemeAvailable",
  "largerReadableFontsAvailable",
  "testLeadCleanupAvailable",
  "testLeadCleanupDryRunAvailable",
  "testLeadCleanupSoftDeleteDefault",
  "bossOnlyHardDeleteAvailable",
  "softDeleteAvailable",
  "restoreAvailable",
  "deleteAuditAvailable",
  "goldCommandCentreUiAvailable",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled"
]) {
  assert(health.includes(field), `health endpoint missing ${field}`);
}

for (const color of ["#120D08", "#1B120B", "#24170D", "#D6A84F", "#E8C76A", "#FFF7E6"]) {
  assert(tailwind.includes(color), `premium palette missing ${color}`);
}
assert(globals.includes("font-size: 15.5px"), "base font size must be increased slightly");
assert(globals.includes(".premium-card"), "premium card style must exist");
assert(dashboard.includes("Today's Missions"), "dashboard must put Today's Missions first");
assert(dashboard.includes("What Marcus should clear first"), "dashboard must answer boss-first action question");
assert(leadCard.includes("Open Lead") && leadCard.includes("Pause Bot") && leadCard.includes("Take Over"), "lead cards must include clearer quick actions");
assert(leadCard.includes("text-xl") && leadCard.includes("text-base"), "lead cards should use larger readable text");
assert(leadDetail.includes('id="bot-controls"'), "lead detail must anchor bot controls from cards");
assert(leadDetail.includes("Next best action"), "lead detail must surface next best action near top");
assert(settings.includes("Bot / WhatsApp") && settings.includes("Handoff Email / Portfolio") && settings.includes("Safety Rules") && settings.includes("Dry Run Test Lead Cleanup"), "settings page must group key control cards and expose cleanup commands");
assert(reports.includes("Latest QA") && reports.includes("Deep QA Cases"), "reports page must include boss-friendly QA cards");

const leadsRepo = read("lib/data/leads-repository.ts");
const actions = read("lib/actions.ts");
assert(leadsRepo.includes("lead_hard_delete_pre_audit"), "hard delete pre-audit must remain");
assert(leadsRepo.includes("if (!before?.deletedAt)"), "hard delete must require prior soft delete");
assert(actions.includes('confirmation !== "PERMANENT DELETE"'), "hard delete action must require typed confirmation");

assert(exists("docs/V6_1_UI_POLISH_TEST_CLEANUP.md"), "v6.1 docs must exist");
assert(read("package.json").includes("test:v6.1"), "package.json must expose v6.1 test script");

fs.rmSync(tempDir, { recursive: true, force: true });

console.log("PASS: v6.1 UI polish and cleanup tests passed.");
