import pg from "pg";
import { pathToFileURL } from "node:url";

const { Client } = pg;

export const requiredTables = [
  "profiles",
  "leads",
  "lead_messages",
  "lead_ai_decisions",
  "appointments",
  "followups",
  "approval_requests",
  "audit_logs",
  "settings",
  "message_templates",
  "lead_outcomes",
  "client_files",
  "quotation_readiness",
  "lead_files",
  "lead_upload_links",
  "quotation_packages",
  "project_accounts",
  "payment_records",
  "monthly_targets"
];

export const requiredColumnsByTable = {
  leads: [
    "id",
    "client_name",
    "phone",
    "email",
    "source",
    "division",
    "property_type",
    "service_type",
    "scope_summary",
    "lead_score",
    "lead_category",
    "status",
    "missing_info",
    "boss_approval_needed",
    "appointment_suitable",
    "appointment_type",
    "appointment_readiness",
    "quotation_readiness_score",
    "next_action",
    "last_client_message",
    "last_reply_at",
    "created_at",
    "updated_at",
    "preferred_contact_time",
    "risk_flags",
    "deleted_at",
    "deleted_by",
    "delete_reason",
    "archived_at",
    "archived_by",
    "archived_reason",
    "is_test",
    "is_spam",
    "duplicate_of",
    "restored_at",
    "restored_by",
    "bot_paused",
    "bot_paused_at",
    "bot_paused_by",
    "bot_pause_reason",
    "assigned_to",
    "needs_marcus",
    "followed_up_at",
    "followed_up_by",
    "lead_level",
    "conversation_summary",
    "mission_category",
    "sales_stage",
    "lead_owner",
    "sales_next_action",
    "follow_up_date",
    "probability_percent",
    "potential_value",
    "expected_close_date",
    "lead_source",
    "won_lost_reason",
    "stage_notes",
    "quotation_status",
    "quoted_amount",
    "quote_sent_date",
    "quote_expiry_date",
    "quote_revision_count",
    "quote_follow_up_date",
    "quote_notes",
    "confirmed_value",
    "won_date",
    "lost_date",
    "project_id",
    "property_area",
    "postal_code",
    "project_address",
    "planning_region",
    "planning_area",
    "map_lat",
    "map_lng",
    "location_confidence",
    "location_source",
    "location_notes",
    "intake_profile"
  ],
  quotation_packages: [
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
    "voided_at",
    "voided_by",
    "void_reason",
    "qa_run_id",
    "is_test",
    "created_at",
    "updated_at"
  ]
};

export const requiredIndexes = [
  "leads_active_command_queue_idx",
  "leads_cleanup_queue_idx",
  "leads_bot_paused_idx",
  "leads_needs_marcus_idx",
  "quotation_packages_lead_id_idx",
  "quotation_packages_status_idx",
  "quotation_packages_qa_run_id_idx",
  "quotation_packages_lead_number_version_idx"
];

export const rlsRequiredTables = [
  "profiles",
  "leads",
  "audit_logs",
  "quotation_packages",
  "lead_files",
  "lead_upload_links"
];

export const requiredStorageBuckets = ["client-files"];

const migrationHints = [
  { matchType: "table", name: "quotation_packages", file: "024_quotation_packages.sql" },
  { matchType: "table", name: "project_accounts", file: "023_boss_ops_command_centre.sql" },
  { matchType: "table", name: "payment_records", file: "023_boss_ops_command_centre.sql" },
  { matchType: "table", name: "monthly_targets", file: "023_boss_ops_command_centre.sql" },
  { matchType: "table", name: "lead_files", file: "020_v6_7_client_file_uploads.sql" },
  { matchType: "table", name: "lead_upload_links", file: "020_v6_7_client_file_uploads.sql" },
  { matchType: "table", name: "quotation_readiness", file: "011_quotation_readiness.sql" },
  { matchType: "column", table: "leads", name: "id", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "client_name", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "phone", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "source", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "division", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "property_type", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "service_type", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "scope_summary", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "lead_score", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "lead_category", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "status", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "missing_info", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "boss_approval_needed", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "appointment_readiness", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "created_at", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "updated_at", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "preferred_contact_time", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "risk_flags", file: "002_leads.sql" },
  { matchType: "column", table: "leads", name: "email", file: "015_v3_1_persistence_updates.sql" },
  { matchType: "column", table: "leads", name: "appointment_suitable", file: "015_v3_1_persistence_updates.sql" },
  { matchType: "column", table: "leads", name: "appointment_type", file: "015_v3_1_persistence_updates.sql" },
  { matchType: "column", table: "leads", name: "quotation_readiness_score", file: "015_v3_1_persistence_updates.sql" },
  { matchType: "column", table: "leads", name: "next_action", file: "015_v3_1_persistence_updates.sql" },
  { matchType: "column", table: "leads", name: "last_client_message", file: "015_v3_1_persistence_updates.sql" },
  { matchType: "column", table: "leads", name: "last_reply_at", file: "015_v3_1_persistence_updates.sql" },
  { matchType: "column", table: "leads", name: "deleted_at", file: "019_v6_ultimate_command_centre.sql" },
  { matchType: "column", table: "leads", name: "lead_level", file: "019_v6_ultimate_command_centre.sql" },
  { matchType: "column", table: "leads", name: "conversation_summary", file: "019_v6_ultimate_command_centre.sql" },
  { matchType: "column", table: "leads", name: "mission_category", file: "019_v6_ultimate_command_centre.sql" },
  { matchType: "column", table: "leads", name: "sales_stage", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "lead_owner", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "sales_next_action", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "follow_up_date", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "probability_percent", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "potential_value", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "expected_close_date", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "lead_source", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "won_lost_reason", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "stage_notes", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "quotation_status", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "quoted_amount", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "quote_sent_date", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "quote_expiry_date", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "quote_revision_count", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "quote_follow_up_date", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "quote_notes", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "confirmed_value", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "won_date", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "lost_date", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "project_id", file: "020_v6_3_sales_collection_command_centre.sql" },
  { matchType: "column", table: "leads", name: "intake_profile", file: "018_v6_5_smart_lead_intake.sql" },
  { matchType: "index", name: "leads_active_command_queue_idx", file: "019_v6_ultimate_command_centre.sql" },
  { matchType: "index", name: "quotation_packages_lead_number_version_idx", file: "024_quotation_packages.sql" },
  { matchType: "bucket", name: "client-files", file: "020_v6_7_client_file_uploads.sql" }
];

function unique(values) {
  return [...new Set(values)].sort();
}

export function likelyMigrationFor(item) {
  const hint = migrationHints.find((entry) => {
    if (entry.matchType !== item.type) return false;
    if (entry.table && entry.table !== item.table) return false;
    return entry.name === item.name;
  });
  return hint?.file ?? "unknown migration; check supabase/MIGRATION_ORDER.md";
}

export function analyzeSchemaSnapshot(snapshot) {
  const tableSet = new Set(snapshot.tables ?? []);
  const indexSet = new Set(snapshot.indexes ?? []);
  const bucketSet = new Set(snapshot.storageBuckets ?? []);
  const rlsEnabled = new Set(snapshot.rlsEnabledTables ?? []);
  const policyCounts = snapshot.policyCounts ?? {};
  const columnSets = Object.fromEntries(
    Object.entries(snapshot.columnsByTable ?? {}).map(([table, columns]) => [table, new Set(columns)])
  );

  const missingTables = requiredTables.filter((table) => !tableSet.has(table));
  const missingColumns = {};
  for (const [table, columns] of Object.entries(requiredColumnsByTable)) {
    const existing = columnSets[table] ?? new Set();
    const missing = columns.filter((column) => !existing.has(column));
    if (missing.length) missingColumns[table] = missing;
  }

  const missingIndexes = requiredIndexes.filter((index) => !indexSet.has(index));
  const missingRls = rlsRequiredTables.filter((table) => !rlsEnabled.has(table));
  const missingPolicies = rlsRequiredTables.filter((table) => Number(policyCounts[table] ?? 0) < 1);
  const missingStorageBuckets = requiredStorageBuckets.filter((bucket) => !bucketSet.has(bucket));

  const hints = unique([
    ...missingTables.map((name) => likelyMigrationFor({ type: "table", name })),
    ...Object.entries(missingColumns).flatMap(([table, columns]) =>
      columns.map((name) => likelyMigrationFor({ type: "column", table, name }))
    ),
    ...missingIndexes.map((name) => likelyMigrationFor({ type: "index", name })),
    ...missingStorageBuckets.map((name) => likelyMigrationFor({ type: "bucket", name }))
  ]);

  const ok =
    missingTables.length === 0 &&
    Object.keys(missingColumns).length === 0 &&
    missingIndexes.length === 0 &&
    missingRls.length === 0 &&
    missingPolicies.length === 0 &&
    missingStorageBuckets.length === 0;

  return {
    ok,
    missingTables,
    missingColumns,
    missingIndexes,
    missingRls,
    missingPolicies,
    missingStorageBuckets,
    likelyMigrationFiles: hints
  };
}

function sslConfigFor(dbUrl) {
  const host = new URL(dbUrl).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return undefined;
  return { rejectUnauthorized: false };
}

async function listStorageBuckets(client) {
  const availability = await client.query(
    "select exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') as exists"
  );
  if (!availability.rows[0]?.exists) return [];
  const buckets = await client.query("select id from storage.buckets");
  return buckets.rows.map((row) => row.id);
}

export async function loadSchemaSnapshot(dbUrl) {
  const client = new Client({ connectionString: dbUrl, ssl: sslConfigFor(dbUrl) });
  try {
    await client.connect();

    const [tables, columns, indexes, rls, policies, storageBuckets] = await Promise.all([
      client.query("select table_name from information_schema.tables where table_schema = 'public'"),
      client.query("select table_name, column_name from information_schema.columns where table_schema = 'public'"),
      client.query("select indexname from pg_indexes where schemaname = 'public'"),
      client.query(`
        select c.relname as table_name
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relrowsecurity = true
      `),
      client.query(`
        select tablename, count(*)::int as policy_count
        from pg_policies
        where schemaname = 'public'
        group by tablename
      `),
      listStorageBuckets(client)
    ]);

    const columnsByTable = {};
    for (const row of columns.rows) {
      columnsByTable[row.table_name] ??= [];
      columnsByTable[row.table_name].push(row.column_name);
    }

    return {
      tables: tables.rows.map((row) => row.table_name),
      columnsByTable,
      indexes: indexes.rows.map((row) => row.indexname),
      rlsEnabledTables: rls.rows.map((row) => row.table_name),
      policyCounts: Object.fromEntries(policies.rows.map((row) => [row.tablename, row.policy_count])),
      storageBuckets
    };
  } finally {
    await client.end().catch(() => {});
  }
}

function printReport(result, skipped = false) {
  if (skipped) {
    console.log("SKIP: full Supabase schema verification not run. Set STAGING_SUPABASE_DB_URL or SUPABASE_DB_URL.");
    return;
  }

  console.log(result.ok ? "PASS: full Supabase schema verification passed." : "FAIL: full Supabase schema verification failed.");
  console.log(`Missing tables: ${result.missingTables.length ? result.missingTables.join(", ") : "none"}`);
  console.log("Missing columns:");
  if (Object.keys(result.missingColumns).length) {
    for (const [table, columns] of Object.entries(result.missingColumns)) {
      console.log(`  ${table}: ${columns.join(", ")}`);
    }
  } else {
    console.log("  none");
  }
  console.log(`Missing indexes: ${result.missingIndexes.length ? result.missingIndexes.join(", ") : "none"}`);
  console.log(`Missing RLS: ${result.missingRls.length ? result.missingRls.join(", ") : "none"}`);
  console.log(`Missing policies: ${result.missingPolicies.length ? result.missingPolicies.join(", ") : "none"}`);
  console.log(`Missing storage buckets: ${result.missingStorageBuckets.length ? result.missingStorageBuckets.join(", ") : "none"}`);
  console.log(`Likely migration files: ${result.likelyMigrationFiles.length ? result.likelyMigrationFiles.join(", ") : "none"}`);
}

export async function main() {
  const dbUrl = process.env.STAGING_SUPABASE_DB_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    printReport(null, true);
    return 0;
  }

  const snapshot = await loadSchemaSnapshot(dbUrl);
  const result = analyzeSchemaSnapshot(snapshot);
  printReport(result);
  return result.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(`FAIL: full Supabase schema verification could not run: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
