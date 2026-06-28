import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "supabase", "migrations", "024_quotation_packages.sql");
const migrationOrderPath = path.join(root, "supabase", "MIGRATION_ORDER.md");

const requiredColumns = [
  "id",
  "lead_id",
  "client_name",
  "quotation_number",
  "version_number",
  "status",
  "prepared_by",
  "prepared_at",
  "submitted_for_boss_review_at",
  "boss_reviewed_at",
  "boss_reviewed_by",
  "approved_at",
  "rejected_at",
  "revision_requested_at",
  "sent_at",
  "sent_by",
  "accepted_at",
  "rejected_by_client_at",
  "quotation_amount",
  "internal_cost_estimate",
  "margin_estimate",
  "expiry_date",
  "scope_summary",
  "boss_notes",
  "revision_notes",
  "client_notes",
  "file_id",
  "storage_bucket",
  "storage_path",
  "original_file_name",
  "mime_type",
  "file_size_bytes",
  "qa_run_id",
  "is_test",
  "created_at",
  "updated_at",
  "voided_at",
  "voided_by",
  "void_reason"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

const migration = read(migrationPath);
const order = read(migrationOrderPath);

assert(/024_quotation_packages\.sql/i.test(order), "MIGRATION_ORDER.md must include 024_quotation_packages.sql.");
assert(/create table if not exists quotation_packages/i.test(migration), "Migration must create quotation_packages.");
assert(/alter table quotation_packages enable row level security/i.test(migration), "Migration must enable RLS.");
assert(/pg_policies[\s\S]+quotation packages authenticated read/i.test(migration), "Migration must create read policy.");
assert(/pg_policies[\s\S]+quotation packages authenticated write/i.test(migration), "Migration must create write policy.");

for (const column of requiredColumns) {
  assert(new RegExp(`\\b${column}\\b`, "i").test(migration), `Migration missing required column: ${column}`);
}

const dbUrl = process.env.SUPABASE_DB_URL || process.env.STAGING_SUPABASE_DB_URL;

if (!dbUrl) {
  console.log("PASS: local quotation_packages migration readiness checks passed.");
  console.log("SKIP: live/staging DB check not run. Set SUPABASE_DB_URL or STAGING_SUPABASE_DB_URL and ensure psql is available.");
  process.exit(0);
}

const sql = `
with required_columns(column_name) as (
  values ${requiredColumns.map((column) => `('${column}')`).join(",")}
),
missing_columns as (
  select column_name from required_columns
  except
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'quotation_packages'
),
table_check as (
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'quotation_packages'
  ) as exists
),
rls_check as (
  select coalesce((
    select relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'quotation_packages'
  ), false) as enabled
),
policy_check as (
  select count(*)::int as count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'quotation_packages'
    and policyname in ('quotation packages authenticated read', 'quotation packages authenticated write')
)
select json_build_object(
  'tableExists', (select exists from table_check),
  'missingColumns', coalesce((select json_agg(column_name) from missing_columns), '[]'::json),
  'rlsEnabled', (select enabled from rls_check),
  'policyCount', (select count from policy_check)
)::text;
`;

let output = "";
try {
  output = execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL: live/staging quotation_packages verification could not run: ${message}`);
  process.exit(1);
}

const result = JSON.parse(output);
assert(result.tableExists, "Live/staging DB is missing public.quotation_packages.");
assert(Array.isArray(result.missingColumns) && result.missingColumns.length === 0, `Live/staging DB missing columns: ${result.missingColumns.join(", ")}`);
assert(result.rlsEnabled, "Live/staging DB has RLS disabled for quotation_packages.");
assert(result.policyCount >= 2, "Live/staging DB is missing quotation_packages RLS policies.");

console.log("PASS: live/staging quotation_packages table, columns, RLS, and policies verified.");
