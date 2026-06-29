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

const manualCreateRequiredColumns = [
  "email",
  "appointment_suitable",
  "appointment_type",
  "quotation_readiness_score",
  "next_action",
  "last_client_message",
  "last_reply_at",
  "lead_owner",
  "follow_up_date",
  "probability_percent",
  "potential_value",
  "expected_close_date",
  "lead_source",
  "won_lost_reason",
  "stage_notes",
  "sales_next_action"
];
for (const column of manualCreateRequiredColumns) {
  assert(requiredColumnsByTable.leads.includes(column), `Required lead columns must include ${column}.`);
}

const missingV31Snapshot = completeSnapshot();
missingV31Snapshot.columnsByTable.leads = missingV31Snapshot.columnsByTable.leads.filter((column) => ![
  "email",
  "appointment_suitable",
  "appointment_type",
  "quotation_readiness_score",
  "next_action",
  "last_client_message",
  "last_reply_at"
].includes(column));
const missingV31Result = analyzeSchemaSnapshot(missingV31Snapshot);
assert(!missingV31Result.ok, "Missing v3.1 persistence lead columns should fail schema analysis.");
for (const column of ["email", "appointment_suitable", "appointment_type", "quotation_readiness_score", "next_action", "last_client_message", "last_reply_at"]) {
  assert(missingV31Result.missingColumns.leads.includes(column), `Missing v3.1 column detection must report leads.${column}.`);
}
assert(missingV31Result.likelyMigrationFiles.includes("015_v3_1_persistence_updates.sql"), "Missing v3.1 lead columns should hint migration 015.");

const missingSalesSnapshot = completeSnapshot();
missingSalesSnapshot.columnsByTable.leads = missingSalesSnapshot.columnsByTable.leads.filter((column) => ![
  "lead_owner",
  "follow_up_date",
  "probability_percent",
  "potential_value",
  "expected_close_date",
  "lead_source",
  "won_lost_reason",
  "stage_notes",
  "sales_next_action"
].includes(column));
const missingSalesResult = analyzeSchemaSnapshot(missingSalesSnapshot);
assert(!missingSalesResult.ok, "Missing v6.3 sales lead columns should fail schema analysis.");
for (const column of ["lead_owner", "follow_up_date", "probability_percent", "potential_value", "expected_close_date", "lead_source", "won_lost_reason", "stage_notes", "sales_next_action"]) {
  assert(missingSalesResult.missingColumns.leads.includes(column), `Missing sales column detection must report leads.${column}.`);
}
assert(missingSalesResult.likelyMigrationFiles.includes("020_v6_3_sales_collection_command_centre.sql"), "Missing v6.3 sales lead columns should hint migration 020.");

for (const table of ["project_accounts", "payment_records"]) {
  assert(requiredColumnsByTable[table].includes("is_test"), `Required ${table} columns must include is_test.`);
}

const missingQaFlagsSnapshot = completeSnapshot();
missingQaFlagsSnapshot.columnsByTable.project_accounts = missingQaFlagsSnapshot.columnsByTable.project_accounts.filter((column) => column !== "is_test");
missingQaFlagsSnapshot.columnsByTable.payment_records = missingQaFlagsSnapshot.columnsByTable.payment_records.filter((column) => column !== "is_test");
missingQaFlagsSnapshot.indexes = missingQaFlagsSnapshot.indexes.filter((index) => index !== "project_accounts_is_test_idx" && index !== "payment_records_is_test_idx");
const missingQaFlagsResult = analyzeSchemaSnapshot(missingQaFlagsSnapshot);
assert(!missingQaFlagsResult.ok, "Missing QA downstream test flags should fail schema analysis.");
assert(missingQaFlagsResult.missingColumns.project_accounts.includes("is_test"), "Missing project_accounts.is_test must be reported.");
assert(missingQaFlagsResult.missingColumns.payment_records.includes("is_test"), "Missing payment_records.is_test must be reported.");
assert(missingQaFlagsResult.missingIndexes.includes("project_accounts_is_test_idx"), "Missing project_accounts_is_test_idx must be reported.");
assert(missingQaFlagsResult.missingIndexes.includes("payment_records_is_test_idx"), "Missing payment_records_is_test_idx must be reported.");
assert(missingQaFlagsResult.likelyMigrationFiles.includes("025_qa_downstream_test_flags.sql"), "Missing QA test flags should hint migration 025.");

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
