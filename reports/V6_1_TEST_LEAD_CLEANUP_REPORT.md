# V6.1 Test Lead Cleanup Report

Mode: DRY RUN
Source: not_configured
Generated: 2026-06-01T05:14:30.590Z

## Summary

- Total leads scanned: 0
- Test leads identified: 0
- Soft-deleted: 0
- Hard-deleted: 0
- Leads not touched: 0
- Hard delete flag enabled: no

## Safety Rules

- Dry run is default.
- Apply requires `--apply`.
- Cleanup defaults to mark test + soft delete.
- Hard delete requires `--hard-delete-test-data` and the lead must already be soft-deleted.
- Audit logs are not deleted.
- Real-looking leads are not touched.

## Warnings

- Live Supabase admin env is missing. No live leads were scanned. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY locally, then rerun dry run.

## Planned / Applied Actions

