import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const projectRoot = process.cwd();
const require = createRequire(import.meta.url);

async function loadDateSafetyModule() {
  const ts = await import("typescript");
  const sourcePath = path.join(projectRoot, "lib", "date-safety.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require,
    console,
    Intl,
    Date,
    Number,
    String,
    Math,
    Object,
    RegExp
  };
  vm.runInNewContext(output, sandbox, { filename: sourcePath });
  return Object.keys(sandbox.module.exports).length ? sandbox.module.exports : sandbox.exports;
}

const {
  daysBetweenSingaporeDates,
  overdueDaysSingapore,
  parseSafeDate,
  singaporeDateKey,
  isDueOnOrBeforeSingaporeDate,
  addSingaporeDays
} = await loadDateSafetyModule();

const today = "2026-06-27T09:30:00+08:00";

assert.equal(singaporeDateKey(today), "2026-06-27", "today key should use Singapore date");
assert.equal(daysBetweenSingaporeDates("2026-06-27T00:01:00+08:00", today), 0, "same Singapore day is not overdue");
assert.equal(overdueDaysSingapore("2026-06-27T00:01:00+08:00", today), 0, "due today should have zero overdue days");
assert.equal(overdueDaysSingapore("2026-06-26T23:59:00+08:00", today), 1, "yesterday should be one overdue day");
assert.equal(overdueDaysSingapore("2026-06-24T18:00:00+08:00", today), 3, "three days overdue should calculate exactly");
assert.equal(overdueDaysSingapore("2026-06-28T09:00:00+08:00", today), 0, "future due date should not be overdue");
assert.equal(daysBetweenSingaporeDates("2026-06-28T09:00:00+08:00", today), 1, "tomorrow should be one day ahead");
assert.equal(isDueOnOrBeforeSingaporeDate("2026-06-27T23:59:00+08:00", today), true, "due today should be actionable");
assert.equal(isDueOnOrBeforeSingaporeDate("2026-06-28T00:00:00+08:00", today), false, "future date should not be due yet");
assert.equal(addSingaporeDays(today, 2), "2026-06-29", "Singapore day addition should be stable");

assert.equal(parseSafeDate("not-a-date"), null, "invalid date should not parse");
assert.equal(parseSafeDate("1970-01-01T00:00:00Z"), null, "Unix epoch should be rejected");
assert.equal(parseSafeDate("1969-12-31T23:59:59Z"), null, "pre-epoch date should be rejected");
assert.equal(overdueDaysSingapore("1970-01-01T00:00:00Z", today), 0, "epoch date must not become a giant overdue number");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

const productionVisibility = read("lib/production-visibility.ts");
const dataPreference = read("lib/data-visibility-preference.ts");
const homePage = read("app/page.tsx");
const settingsPage = read("app/settings/page.tsx");
const cleanupPage = read("app/settings/production-data-cleanup/page.tsx");
const actions = read("lib/actions.ts");
const shell = read("components/ShellChrome.tsx");
const salesRepo = read("lib/data/sales-collection-repository.ts");
const approvalsRepo = read("lib/data/approvals-repository.ts");
const leadsRepo = read("lib/data/leads-repository.ts");

for (const term of ["test", "qa", "demo", "v3_live_test", "miamamun", "semon", "dummy", "sample"]) {
  assert.ok(productionVisibility.includes(term), `production visibility filter missing ${term}`);
}
for (const phrase of [
  "filterLeadsForProductionVisibility",
  "filterApprovalsForProductionVisibility",
  "filterProjectsForProductionVisibility",
  "filterPaymentsForProductionVisibility",
  "isProductionHiddenLead"
]) {
  assert.ok(productionVisibility.includes(phrase), `production visibility helper missing ${phrase}`);
}
assert.ok(leadsRepo.includes("isProductionHiddenLead") && leadsRepo.includes("!options?.includeTest"), "lead repository must hide production-noise records unless explicitly included");
assert.ok(approvalsRepo.includes("visibleLeadIds") && approvalsRepo.includes("filterApprovalsForProductionVisibility"), "approval repository must hide demo approvals and approvals linked to hidden leads");
assert.ok(salesRepo.includes("visibleLeadIds") && salesRepo.includes("visibleProjectIds"), "sales collection repository must filter projects/payments through visible leads/projects");
assert.ok(dataPreference.includes("limm_show_test_demo_records") && dataPreference.includes("maxAge"), "visibility preference cookie must be server-side and durable");
assert.ok(homePage.includes("getShowTestDemoRecordsPreference") && homePage.includes("visibleLeadIds"), "Boss Daily Brief must use the production visibility preference and visible lead IDs");
assert.ok(settingsPage.includes("Show test/demo records") && settingsPage.includes("Default is OFF in production"), "Settings must expose the production visibility toggle");
assert.ok(cleanupPage.includes("Production Data Cleanup") && cleanupPage.includes("Soft Archive Selected"), "admin cleanup page must preview and soft archive selected records");
assert.ok(actions.includes("softArchiveProductionNoiseRecordsAction") && !/softArchiveProductionNoiseRecordsAction[\s\S]{0,900}hardDeleteLead/.test(actions), "production cleanup action must not hard delete records");
assert.ok(!/"Delivery"[\s\S]{0,220}"Appointments"/.test(shell), "sidebar must not duplicate Appointments under Delivery");
assert.ok(!/<p>\{auth\.mode\}<\/p>/.test(shell), "normal sidebar display must not show Supabase/Mock mode");

console.log("PASS: boss ops Singapore date safety and production visibility checks passed.");
