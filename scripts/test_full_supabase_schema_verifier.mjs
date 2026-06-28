import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeSchemaSnapshot,
  requiredColumnsByTable,
  requiredIndexes,
  requiredStorageBuckets,
  requiredTables,
  rlsRequiredTables
} from "./verify_full_supabase_schema.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function completeSnapshot() {
  return {
    tables: [...requiredTables],
    columnsByTable: Object.fromEntries(Object.entries(requiredColumnsByTable).map(([table, columns]) => [table, [...columns]])),
    indexes: [...requiredIndexes],
    rlsEnabledTables: [...rlsRequiredTables],
    policyCounts: Object.fromEntries(rlsRequiredTables.map((table) => [table, 1])),
    storageBuckets: [...requiredStorageBuckets]
  };
}

const missingColumnSnapshot = completeSnapshot();
missingColumnSnapshot.columnsByTable.leads = missingColumnSnapshot.columnsByTable.leads.filter((column) => column !== "deleted_at");
const missingColumnResult = analyzeSchemaSnapshot(missingColumnSnapshot);
assert(!missingColumnResult.ok, "Missing column should fail schema analysis.");
assert(missingColumnResult.missingColumns.leads.includes("deleted_at"), "Missing column detection must report leads.deleted_at.");
assert(missingColumnResult.likelyMigrationFiles.includes("019_v6_ultimate_command_centre.sql"), "Missing leads.deleted_at should hint migration 019.");

const missingTableSnapshot = completeSnapshot();
missingTableSnapshot.tables = missingTableSnapshot.tables.filter((table) => table !== "quotation_packages");
const missingTableResult = analyzeSchemaSnapshot(missingTableSnapshot);
assert(!missingTableResult.ok, "Missing table should fail schema analysis.");
assert(missingTableResult.missingTables.includes("quotation_packages"), "Missing table detection must report quotation_packages.");
assert(missingTableResult.likelyMigrationFiles.includes("024_quotation_packages.sql"), "Missing quotation_packages should hint migration 024.");

const missingIndexSnapshot = completeSnapshot();
missingIndexSnapshot.indexes = missingIndexSnapshot.indexes.filter((index) => index !== "leads_active_command_queue_idx");
assert(analyzeSchemaSnapshot(missingIndexSnapshot).missingIndexes.includes("leads_active_command_queue_idx"), "Missing index detection must report leads_active_command_queue_idx.");

const missingBucketSnapshot = completeSnapshot();
missingBucketSnapshot.storageBuckets = [];
assert(analyzeSchemaSnapshot(missingBucketSnapshot).missingStorageBuckets.includes("client-files"), "Missing storage bucket detection must report client-files.");

const noDb = spawnSync(process.execPath, ["scripts/verify_full_supabase_schema.mjs"], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    STAGING_SUPABASE_DB_URL: "",
    SUPABASE_DB_URL: "",
    FAKE_SECRET_SHOULD_NOT_PRINT: "postgresql://user:password@example.supabase.co:5432/postgres"
  }
});

assert(noDb.status === 0, `No DB URL verifier path should exit 0. stderr: ${noDb.stderr}`);
assert(noDb.stdout.includes("SKIP: full Supabase schema verification not run"), "No DB URL path must print a clear SKIP message.");
assert(!noDb.stdout.includes("password@example") && !noDb.stderr.includes("password@example"), "Verifier must not print DB URL or password.");

const verifierSource = await import("node:fs").then((fs) => fs.readFileSync(path.join(root, "scripts/verify_full_supabase_schema.mjs"), "utf8"));
for (const forbidden of [/\binsert\s+/i, /\bupdate\s+/i, /\bdelete\s+/i, /\bupsert\s+/i, /\.delete\(/i, /\.insert\(/i, /\.update\(/i, /\.upsert\(/i]) {
  assert(!forbidden.test(verifierSource), `Verifier must remain read-only and not contain mutation pattern ${forbidden}.`);
}

console.log("PASS: full Supabase schema verifier tests passed.");
