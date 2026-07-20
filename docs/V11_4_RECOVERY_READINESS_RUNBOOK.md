# v11.4 Recovery Readiness Runbook

v11.4 turns the v11.3 recovery controls into an evidence-driven incident system. It does not change the WhatsApp reply planner or send client messages.

## Recovery objectives and proof

Daily backup freshness and monthly restore proof are independent controls. The
latest successful restore drill must match its recorded source artifact (hash,
size, provider, and scope); a newer nightly backup does not invalidate that
still-current drill. The newest backup is evaluated separately against the
24-hour RPO and full-database scope requirements.

| Asset | Objective | Proof required before green |
|---|---:|---|
| Accepted WhatsApp inbound | RPO 0 after durable HTTP acceptance | provider-message keyed queue row |
| WhatsApp processing | RTO under 2 minutes | successful worker heartbeat under 3 minutes, no old queue item, no stale lease, no dead letter |
| Client files | RPO 24h / RTO 4h | checksum audit, independent backup under 26h old, isolated restore under 35 days old |
| PostgreSQL core business data | RPO 24h / RTO 4h | encrypted independent artifact under 26h old plus isolated PostgreSQL restore under 35 days old |
| Full Supabase database, including managed auth data and storage metadata | RPO 24h / RTO 4h | encrypted full-scope artifact under 26h old plus isolated Supabase PostgreSQL restore under 35 days old |
| Incident detection | under 5 minutes | Supabase Cron dispatch and `reliability_watchdog` heartbeat |

No configuration flag alone makes a control green. The application derives readiness from completed timestamps, checksums, status, and isolation evidence.

## Database objects

- `reliability_incidents`: one durable row per condition fingerprint, with occurrence count, acknowledgement, notification cooldown, and automatic resolution evidence.
- `database_recovery_runs`: idempotent external workflow evidence keyed by `external_run_id`.
- Both tables have RLS enabled, no `public`, `anon`, or `authenticated` table privileges, and service-role-only policies/grants.
- `limm_private.dispatch_reliability_watchdog()` reads the URL and scheduler token from Vault. Neither secret is returned by SQL.

The five-minute watchdog checks:

- worker heartbeat older than 3 minutes;
- oldest queued inbound older than 2 minutes;
- stale processing leases or dead letters;
- unavailable or stale client-file integrity evidence;
- missing/stale client-file offsite backup and isolated restore proof;
- missing/stale database backup and isolated restore proof;
- disabled or incomplete proactive alert delivery.

Acknowledgement suppresses repeat email for that incident. It does not resolve the incident. The next successful watchdog check resolves a row only when its condition is absent.

## Application environment

Set these as server-only Production and Preview values in Vercel:

```text
RELIABILITY_EVIDENCE_TOKEN             # at least 32 random bytes
RELIABILITY_ALERT_EMAIL_ENABLED        # true only after delivery test
RELIABILITY_ALERT_EMAIL_TO
RELIABILITY_ALERT_EMAIL_FROM           # optional; verified Resend sender recommended
RESEND_API_KEY                          # existing provider credential
```

The evidence token must never use a `NEXT_PUBLIC_` prefix. Keep alert delivery disabled until the recipient and sender have been verified. Disabled delivery leaves a visible warning incident rather than silently claiming alert readiness.

## GitHub Actions configuration

The `Database Disaster Recovery` workflow needs these Actions secrets:

```text
DR_DATABASE_URL
DR_BACKUP_PASSPHRASE
DR_S3_ACCESS_KEY_ID
DR_S3_SECRET_ACCESS_KEY
RELIABILITY_EVIDENCE_TOKEN
```

The workflow pins the non-secret R2 endpoint, `auto` region, primary bucket name, and evidence URL. This prevents malformed copied endpoint values while keeping credentials in Actions secrets.

Evidence endpoint:

```text
RELIABILITY_EVIDENCE_URL=https://limm-ai-sales-command-centre.vercel.app/api/operations/database-recovery-evidence
```

`DR_DATABASE_URL` must be the project's `postgres.<project-ref>` shared-pooler URL, with its database password percent-encoded. A scoped application role cannot read Supabase-managed Auth and Storage rows; the workflow fails closed if that older URL is supplied. The owner-level credential exists only as a masked Actions secret, is passed only to the official Supabase CLI, and is never printed. Limit workflow-edit permission to trusted maintainers and rotate the database password if repository or Actions-secret access changes. The S3-compatible bucket must be private and independent of Supabase/Vercel. Enable provider-side versioning, retention/lifecycle policy, access logging, and MFA-protected deletion where available.

### Independent full-database backup scope

Earlier v11.4 evidence used a deliberately scoped `limm_dr_backup` role. That proved core business-data recovery but could not read Supabase-managed `auth` and `storage`, so the health endpoint correctly remained fail-closed with risk code `supabase_managed_auth_and_storage_schemas_not_in_independent_backup`.

The current workflow uses the official Supabase CLI portable-backup sequence. It creates separate role, schema, data, and migration-history SQL files. The data file includes application rows, Auth users and password hashes, identities, sessions, and Storage database metadata. It excludes only Supabase Storage vector tables that the official migration procedure excludes. The five SQL files are archived, encrypted client-side with AES-256-CBC/PBKDF2, checksummed, and uploaded to the private independent R2 bucket. No plaintext backup is uploaded or retained as an Actions artifact.

The nightly full-database job:

1. creates the official Supabase portable SQL bundle and asserts that Auth and Storage `COPY` sections exist;
2. records source row counts for five critical application tables plus Auth users/identities and Storage buckets/objects;
3. encrypts the bundle client-side and records its SHA-256 and byte size;
4. uploads the encrypted artifact and a versioned, non-secret manifest;
5. reports full-scope evidence through the dedicated machine-authenticated endpoint.

The monthly drill first creates a fresh full-scope artifact, then downloads it, verifies size and SHA-256, decrypts it, and rejects unexpected archive entries before extraction. It starts an isolated local Supabase PostgreSQL target pinned to the production PostgreSQL release, restores roles/schema/data/migration history, verifies nine schema/dependency contracts, and exactly matches nine restored row counts to the source manifest. It then destroys the isolated target and reports evidence without row contents or secret values.

Storage object bytes are not contained in a PostgreSQL backup. They remain independently protected and restore-tested by the separate client-file R2 workflow; this database workflow covers the corresponding Storage bucket/object metadata. A full successful database backup plus isolated restore clears the managed-schema risk only when the separate client-file controls are also green.

Portable database recovery does not clone Supabase project-level configuration. In a total project replacement, recreate Auth provider settings, API/JWT keys, Vault secrets, Cron jobs, and other platform configuration from their controlled sources. Existing browser sessions may require sign-in again because a replacement project uses new JWT signing keys. The current project has no Edge Functions. These are recovery-runbook steps, not missing database rows, and must be verified during a real project-replacement exercise.

If any required GitHub value is absent, the configuration job emits a warning, skips backup/restore, and creates no false green evidence.

## Supabase scheduler activation

After the application route is deployed, create or replace the private Vault URL:

```sql
select vault.create_secret(
  'https://limm-ai-sales-command-centre.vercel.app/api/operations/reliability-watchdog',
  'limm_reliability_watchdog_url'
);
```

The existing `limm_whatsapp_worker_token` authenticates the request. Verify:

```sql
select jobname, schedule, active
from cron.job
where jobname = 'limm-reliability-watchdog-five-minutes';

select service_name, status, last_succeeded_at, metadata
from public.reliability_heartbeats
where service_name = 'reliability_watchdog';
```

Never select `vault.decrypted_secrets` in screenshots, tickets, logs, or support messages.

## Incident response

1. Open Operations → Recovery control plane.
2. Read the safe incident summary and current metrics.
3. Acknowledge only after an owner is actively investigating.
4. Fix the source condition; do not manually mark the incident resolved.
5. Run the watchdog or wait up to five minutes and confirm automatic resolution.
6. Record the incident timeline and corrective action in the normal audit/incident process.

For inbound queue incidents, never bypass webhook signature checks, durable acceptance, provider-ID deduplication, or the existing live handler. Dead-letter replay must use the boss-only safe replay action.

## Release and rollback

Release gate:

1. Migration is rehearsed inside a transaction and rolled back.
2. Static v11.4 tests, legacy replay tests, typecheck, lint, full verify, build, and browser QA pass.
3. Migration is applied and Supabase security/performance advisors are reviewed.
4. Code is deployed and the health endpoint reports v11.4.
5. Vault watchdog URL is activated, then the endpoint is invoked and heartbeat/incident rows are inspected.
6. A reversible failure injection proves open → acknowledge → recover → auto-resolve without sending a client message.

To roll back application code, redeploy the previous immutable Vercel deployment. To disable only the watchdog, unschedule `limm-reliability-watchdog-five-minutes`; existing incident/evidence rows remain available. Do not drop evidence tables during an incident. A schema rollback, if ever required, must first export retained incident and recovery evidence and confirm no deployed v11.4 code still reads it.

References: [Supabase Cron](https://supabase.com/docs/guides/cron), [Vault](https://supabase.com/docs/guides/database/vault), [database backups](https://supabase.com/docs/guides/platform/backups), and [project cloning limitations](https://supabase.com/docs/guides/platform/clone-project).
