import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const scriptPath = path.join(root, "scripts", "backfill_lead_facts_from_messages.mjs");
const source = fs.readFileSync(scriptPath, "utf8");

assert.ok(source.includes("const apply = process.argv.includes(\"--apply\")"), "Backfill must default to dry-run and require --apply.");
assert.ok(source.includes("DRY RUN: Supabase admin env is not configured"), "Backfill must be safe when env is missing.");
assert.ok(source.includes("leadFactsToLeadPatch"), "Backfill must use the shared Lead Facts patch contract.");
assert.ok(source.includes("lead_messages"), "Backfill must read raw WhatsApp message evidence.");
assert.ok(source.includes("channel"), "Backfill must filter WhatsApp message evidence.");
assert.ok(!source.includes("delete()"), "Backfill must not delete data.");

const result = spawnSync(process.execPath, [scriptPath], {
  cwd: root,
  env: {
    PATH: process.env.PATH || "",
    SystemRoot: process.env.SystemRoot || "",
    COMSPEC: process.env.COMSPEC || ""
  },
  encoding: "utf8"
});

assert.equal(result.status, 0, `Backfill dry-run without env should exit 0. stderr=${result.stderr}`);
assert.match(result.stdout, /DRY RUN: Supabase admin env is not configured|DRY RUN lead=/, "Backfill should announce dry-run mode.");

console.log("PASS test_lead_facts_backfill");
