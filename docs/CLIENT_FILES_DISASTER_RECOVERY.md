# Client Files Disaster Recovery

The `client-files` bucket is private and production access uses short-lived signed URLs. Database backups do not include Storage objects, so database restore or PITR alone is not a client-file backup.

## v11.3 control plane

- Every new upload stores a SHA-256 checksum and is marked verified only after the bytes are available.
- A source-integrity run downloads each active object, compares byte size and checksum, records every result, and marks missing/corrupt rows visibly.
- An optional independent S3-compatible target stores content-addressed objects at `objects/<prefix>/<sha256>` so unchanged files are deduplicated.
- Each successful backup writes a checksum-protected manifest. At least 35 daily and 12 monthly manifests are retained.
- A restore drill reads a protected object, writes it into a temporary private restore prefix/bucket, reads it back, verifies byte size and SHA-256, and removes the temporary copy.
- Run evidence is service-only in `client_file_recovery_runs` and `client_file_recovery_items`. No storage credentials or signed URLs are recorded.

## Production target

- Target RPO: 24 hours.
- Target RTO: 4 hours.
- The restore bucket must be different from the source backup bucket for the strongest drill evidence.
- The replica bucket must block public access and use provider-side encryption or a customer-managed key.
- Same-project Supabase Storage is never counted as an independent backup.

## Required server-only configuration

```text
DR_S3_ENDPOINT
DR_S3_REGION
DR_S3_BUCKET
DR_S3_RESTORE_BUCKET
DR_S3_ACCESS_KEY_ID
DR_S3_SECRET_ACCESS_KEY
DR_S3_FORCE_PATH_STYLE
DR_S3_SERVER_SIDE_ENCRYPTION        # optional: AES256 or aws:kms
DR_S3_KMS_KEY_ID                    # optional, only for aws:kms
```

No release may report client-file disaster recovery as ready until:

1. `clientFileOffsiteBackupConfigured` is true.
2. A full backup reports `succeeded` with zero failed objects.
3. The manifest checksum is present.
4. `clientFileRestoreBucketIsolated` is true.
5. A restore drill reports `succeeded`.

Until those five checks pass, the application reports the gap explicitly while continuing to run source-integrity audits.
