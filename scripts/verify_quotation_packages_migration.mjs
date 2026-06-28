import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
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

const requiredIndexes = [
  "quotation_packages_lead_id_idx",
  "quotation_packages_status_idx",
  "quotation_packages_qa_run_id_idx",
  "quotation_packages_lead_number_version_idx"
];

const requiredPolicies = [
  "quotation packages authenticated read",
  "quotation packages authenticated write"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function runLocalChecks() {
  const migration = read(migrationPath);
  const order = read(migrationOrderPath);

  assert(/024_quotation_packages\.sql/i.test(order), "MIGRATION_ORDER.md must include 024_quotation_packages.sql.");
  assert(/create table if not exists quotation_packages/i.test(migration), "Migration must create quotation_packages.");
  assert(/alter table quotation_packages enable row level security/i.test(migration), "Migration must enable RLS.");

  for (const column of requiredColumns) {
    assert(new RegExp(`\\b${column}\\b`, "i").test(migration), `Migration missing required column: ${column}`);
  }

  for (const index of requiredIndexes) {
    assert(new RegExp(`create\\s+(unique\\s+)?index\\s+if\\s+not\\s+exists\\s+${index}\\b`, "i").test(migration), `Migration missing required index: ${index}`);
  }

  for (const policy of requiredPolicies) {
    assert(new RegExp(`pg_policies[\\s\\S]+${policy}`, "i").test(migration), `Migration missing required policy: ${policy}`);
  }
}

function sslConfigFor(dbUrl) {
  const host = new URL(dbUrl).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return undefined;
  return { rejectUnauthorized: false };
}

async function runDbChecks(dbUrl) {
  const client = new Client({
    connectionString: dbUrl,
    ssl: sslConfigFor(dbUrl)
  });

  try {
    await client.connect();

    const { rows } = await client.query(
      `
      with required_columns(column_name) as (
        select unnest($1::text[])
      ),
      missing_columns as (
        select column_name from required_columns
        except
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'quotation_packages'
      ),
      required_indexes(index_name) as (
        select unnest($2::text[])
      ),
      missing_indexes as (
        select index_name from required_indexes
        except
        select indexname from pg_indexes
        where schemaname = 'public' and tablename = 'quotation_packages'
      ),
      required_policies(policy_name) as (
        select unnest($3::text[])
      ),
      missing_policies as (
        select policy_name from required_policies
        except
        select policyname from pg_policies
        where schemaname = 'public' and tablename = 'quotation_packages'
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
      )
      select
        (select exists from table_check) as "tableExists",
        coalesce((select array_agg(column_name order by column_name) from missing_columns), array[]::text[]) as "missingColumns",
        coalesce((select array_agg(index_name order by index_name) from missing_indexes), array[]::text[]) as "missingIndexes",
        (select enabled from rls_check) as "rlsEnabled",
        coalesce((select array_agg(policy_name order by policy_name) from missing_policies), array[]::text[]) as "missingPolicies";
      `,
      [requiredColumns, requiredIndexes, requiredPolicies]
    );

    const result = rows[0];
    assert(result.tableExists, "Staging DB is missing public.quotation_packages.");
    assert(result.missingColumns.length === 0, `Staging DB missing columns: ${result.missingColumns.join(", ")}`);
    assert(result.missingIndexes.length === 0, `Staging DB missing indexes: ${result.missingIndexes.join(", ")}`);
    assert(result.rlsEnabled, "Staging DB has RLS disabled for quotation_packages.");
    assert(result.missingPolicies.length === 0, `Staging DB missing policies: ${result.missingPolicies.join(", ")}`);

    console.log("PASS: staging quotation_packages table, columns, indexes, RLS, and policies verified.");
  } finally {
    await client.end().catch(() => {});
  }
}

try {
  runLocalChecks();
  console.log("PASS: local quotation_packages migration file checks passed.");

  const dbUrl = process.env.STAGING_SUPABASE_DB_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.log("SKIP: staging DB check not run. Set STAGING_SUPABASE_DB_URL or SUPABASE_DB_URL to verify the live/staging database.");
    process.exit(0);
  }

  await runDbChecks(dbUrl);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL: quotation_packages migration verification failed: ${message}`);
  process.exit(1);
}
