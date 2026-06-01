# V6.1 Test Lead Cleanup Report

Mode: DRY RUN
Source: not_configured
Generated: 2026-06-01T05:22:00.751Z

## Summary

- Total leads scanned: 0
- Test leads identified: 0
- Test leads cleaned: 0
- Marcus/Fio leads protected: 0
- Skipped uncertain leads: 0
- Soft-deleted: 0
- Hard-deleted: 0
- Leads not touched: 0
- Hard delete flag enabled: no

## Safety Rules

- Dry run is default.
- Apply requires `--apply`.
- Cleanup defaults to mark test + soft delete.
- Hard delete requires `--hard-delete-test-data` and the lead must already be soft-deleted.
- Any lead mentioning Marcus or Fio in name, contact/display name, phone label, title, or message content is excluded completely.
- Audit logs are not deleted.
- Real-looking leads are not touched.

## Warnings

- Live Supabase admin env is missing. No live leads were scanned. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY locally, then rerun dry run.

## Leads Selected For Cleanup

None.

## Marcus / Fio Protected Leads

None found.

## Planned / Applied Actions

