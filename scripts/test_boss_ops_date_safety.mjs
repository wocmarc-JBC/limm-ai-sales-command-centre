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

console.log("PASS: boss ops Singapore date safety checks passed.");
