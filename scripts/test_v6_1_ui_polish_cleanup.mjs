import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = path.join(root, "reports", "tmp_v6_1_cleanup_test");
const fixturePath = path.join(tempDir, "fixture.json");
const reportPath = path.join(tempDir, "dry_run_report.md");
const applyReportPath = path.join(tempDir, "apply_report.md");
const hardDeleteReportPath = path.join(tempDir, "hard_delete_report.md");

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
          id: "marcus-protected-test-lead",
          client_name: "Marcus QA Test Lead",
          phone: "+65 9999 9999",
          source: "Playwright QA",
          status: "New Enquiry",
          last_client_message: "floor plan test",
          is_test: true
        },
        {
          id: "fio-protected-message-lead",
          client_name: "Old QA Lead",
          display_name: "Fio",
          phone_label: "Fio WhatsApp",
          phone: "+65 0000 0000",
          source: "QA",
          status: "New Enquiry",
          last_client_message: "Fio laminated wall cladding test",
          is_test: true
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
        },
        {
          lead_id: "marcus-protected-test-lead",
          body: "Marcus test marker hello...can help me do my kitchen?",
          metadata: {}
        },
        {
          lead_id: "fio-protected-message-lead",
          body: "Fio voice test",
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
assert(/Total leads scanned: 5/.test(cleanupReport), "cleanup dry run should scan fixture leads");
assert(/Test leads identified: 2/.test(cleanupReport), "cleanup dry run should identify only clear test leads");
assert(/Marcus\/Fio leads protected: 2/.test(cleanupReport), "cleanup dry run must protect Marcus and Fio leads");
assert(/Skipped uncertain leads: 1/.test(cleanupReport), "cleanup dry run must count uncertain real-looking leads");
assert(/Real Homeowner[\s\S]{0,300}Action: not_touched/.test(cleanupReport), "real-looking weak phrase lead must not be touched");
assert(/Marcus QA Test Lead[\s\S]{0,300}Action: protected_marcus_fio/.test(cleanupReport), "Marcus lead must be completely protected");
assert(/Old QA Lead[\s\S]{0,300}Action: protected_marcus_fio/.test(cleanupReport), "Fio lead must be completely protected");
assert(/Soft-deleted: 0/.test(cleanupReport), "dry run must not soft-delete anything");
assert(/Hard-deleted: 0/.test(cleanupReport), "dry run must not hard-delete anything");

const applyResult = runNode([
  "scripts/cleanup_old_test_leads_v6_1.mjs",
  "--fixture",
  path.relative(root, fixturePath),
  "--report",
  path.relative(root, applyReportPath),
  "--apply"
]);
assert(applyResult.status === 0, `cleanup apply fixture simulation failed: ${applyResult.stderr || applyResult.stdout}`);
const applyReport = fs.readFileSync(applyReportPath, "utf8");
assert(/Mode: APPLY/.test(applyReport), "apply report must be in apply mode");
assert(/Test leads cleaned: 1/.test(applyReport), "fixture apply should clean the unprotected test lead");
assert(/Soft-deleted: 1/.test(applyReport), "fixture apply should soft-delete unprotected test lead");
assert(/Hard-deleted: 0/.test(applyReport), "fixture apply must not hard-delete by default");
assert(/Marcus QA Test Lead[\s\S]{0,300}Result: skipped/.test(applyReport), "Marcus lead must be skipped in apply mode");
assert(/Old QA Lead[\s\S]{0,300}Result: skipped/.test(applyReport), "Fio lead must be skipped in apply mode");

const hardDeleteResult = runNode([
  "scripts/cleanup_old_test_leads_v6_1.mjs",
  "--fixture",
  path.relative(root, fixturePath),
  "--report",
  path.relative(root, hardDeleteReportPath),
  "--apply",
  "--hard-delete-test-data"
]);
assert(hardDeleteResult.status === 0, `cleanup hard-delete fixture simulation failed: ${hardDeleteResult.stderr || hardDeleteResult.stdout}`);
const hardDeleteReport = fs.readFileSync(hardDeleteReportPath, "utf8");
assert(/Hard-deleted: 1/.test(hardDeleteReport), "explicit hard-delete should affect only already-soft-deleted test lead");
assert(/### QA Test Lead[\s\S]{0,300}Action: mark_test_and_soft_delete/.test(hardDeleteReport), "not-yet-soft-deleted test lead must not be hard deleted");
assert(/Real Homeowner[\s\S]{0,300}Action: not_touched[\s\S]{0,200}Result: skipped/.test(hardDeleteReport), "uncertain real-looking lead must not be hard deleted");
assert(/Marcus QA Test Lead[\s\S]{0,300}Action: protected_marcus_fio[\s\S]{0,200}Result: skipped/.test(hardDeleteReport), "Marcus lead must never be hard deleted");
assert(/Old QA Lead[\s\S]{0,300}Action: protected_marcus_fio[\s\S]{0,200}Result: skipped/.test(hardDeleteReport), "Fio lead must never be hard deleted");

const cleanupScript = read("scripts/cleanup_old_test_leads_v6_1.mjs");
assert(cleanupScript.includes("--apply"), "cleanup script must require explicit --apply for writes");
assert(cleanupScript.includes("--hard-delete-test-data"), "cleanup script must require explicit hard-delete test-data flag");
assert(cleanupScript.includes("lead_test_cleanup_soft_delete_planned"), "cleanup script must audit soft-delete cleanup actions");
assert(cleanupScript.includes("lead_test_cleanup_hard_delete_pre_audit"), "cleanup script must audit before hard delete");
assert(cleanupScript.includes("already-soft-deleted"), "cleanup script must only hard-delete already-soft-deleted test data");
assert(cleanupScript.includes("protectedPersonEvidence"), "cleanup script must have Marcus/Fio hard protection");
assert(cleanupScript.includes("laminated wall cladding test"), "cleanup script must include laminated wall cladding test phrase");

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
