import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_TEST_EMAIL",
  "SUPABASE_TEST_PASSWORD"
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`FAIL: authenticated release QA requires ${missing.join(", ")}. Credentials are never hardcoded or printed.`);
  process.exit(1);
}

function run(label, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, QA_E2E_MODE: "0", NEXT_TELEMETRY_DISABLED: "1" }
  });
  if (result.status !== 0) {
    console.error(`FAIL: ${label} exited ${result.status ?? 1}.`);
    process.exit(result.status ?? 1);
  }
  console.log(`PASS: ${label}.`);
}

run("authenticated live Supabase actions", ["scripts/verify_live_authenticated_actions.mjs"]);
run("authenticated boss browser flow", [
  "node_modules/@playwright/test/cli.js",
  "test",
  "tests/e2e/authenticated-boss.spec.ts",
  "--project=desktop-chromium"
]);
console.log("PASS: authenticated release gate completed without exposing credentials.");
