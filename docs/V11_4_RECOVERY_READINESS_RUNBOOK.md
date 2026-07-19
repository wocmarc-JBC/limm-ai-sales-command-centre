# v11.4 Recovery Readiness Runbook

v11.4 turns the v11.3 recovery controls into an evidence-driven incident system. It does not change the WhatsApp reply planner or send client messages.

## Recovery objectives and proof

| Asset | Objective | Proof required before green |
|---|---:|---|
| Accepted WhatsApp inbound | RPO 0 after durable HTTP acceptance | provider-message keyed queue row |
| WhatsApp processing | RTO under 2 minutes | successful worker heartbeat under 3 minutes, no old queue item, no stale lease, no dead letter |
| Client files | RPO 24h / RTO 4h | checksum audit, independent backup under 26h old, isolated restore under 35 days old |
| PostgreSQL business data | RPO 24h / RTO 4h | encrypted independent artifact under 26h old plus isolated PostgreSQL restore under 35 days old |
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
DR_S3_ENDPOINT
DR_S3_REGION
DR_S3_BUCKET
DR_S3_ACCESS_KEY_ID
DR_S3_SECRET_ACCESS_KEY
RELIABILITY_EVIDENCE_TOKEN
```

Add this Actions variable:

```text
RELIABILITY_EVIDENCE_URL=https://limm-ai-sales-command-centre.vercel.app/api/operations/database-recovery-evidence
```

Use a read-only database role that can dump every required application schema/object without owning or mutating production data. The S3-compatible bucket must be private and independent of Supabase/Vercel. Enable provider-side versioning, retention/lifecycle policy, access logging, and MFA-protected deletion where available.

The nightly job:

1. creates a PostgreSQL 17 custom-format dump;
2. encrypts it client-side with AES-256-CBC/PBKDF2 before upload;
3. records SHA-256 and byte size;
4. uploads the encrypted artifact and latest manifest;
5. reports evidence through the dedicated machine-authenticated endpoint.

The monthly drill downloads the latest artifact, verifies size and SHA-256, decrypts it, restores it into an isolated PostgreSQL 17 container, verifies six required schema contracts and four read queries, destroys the container, and reports evidence. Failure evidence is reported without client data or secret values.

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
