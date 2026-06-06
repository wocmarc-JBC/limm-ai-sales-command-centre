# v6.7 Real Client File Upload + WhatsApp Media Storage

Status: implemented locally; deploy after migration and Vercel build.

## What Changed

- Added private Supabase Storage support for the `client-files` bucket.
- Added additive migration `023_v6_7_real_client_file_upload.sql`.
- Added `lead_files` records for files linked to a lead.
- Added `lead_upload_links` with hashed upload tokens only.
- Upgraded `/client-files` from placeholder to real lead/file status.
- Added `/upload/{token}` public upload page for clients.
- Added lead detail file panel with signed view/download, review, and void actions.
- Added WhatsApp image/document media storage linked to the lead.
- Connected received files to meeting and quotation readiness intake signals.

## Storage Design

Bucket: `client-files`

Visibility: private only.

Paths:

- `leads/{lead_id}/floor-plan/`
- `leads/{lead_id}/site-photos/`
- `leads/{lead_id}/reference-images/`
- `leads/{lead_id}/existing-quotation/`
- `leads/{lead_id}/building-rules/`
- `leads/{lead_id}/other-documents/`

Files are opened through short-lived signed URLs. The bucket must not be public.

## File Categories

- `floor_plan`
- `site_photos`
- `reference_images`
- `existing_quotation`
- `building_rules`
- `other_documents`

## File Statuses

- `missing`
- `received`
- `reviewed`
- `needs_clarification`
- `archived`
- `voided`

Void is the default removal workflow. No hard delete is exposed in the normal UI.

## Allowed Files

First version:

- JPG / JPEG
- PNG
- WEBP
- HEIC
- PDF

Default max size: 20MB.

## Supabase Setup

Apply migration:

```sql
supabase/migrations/023_v6_7_real_client_file_upload.sql
```

Confirm:

- `lead_files` exists.
- `lead_upload_links` exists.
- Storage bucket `client-files` exists.
- Bucket is private.

If Supabase does not allow bucket creation from SQL in your project, create the bucket manually:

- Name: `client-files`
- Visibility: private

## WhatsApp Media Flow

This WhatsApp media flow stores client images and documents privately, then links them back to the correct CRM lead.

1. WhatsApp webhook receives image/document.
2. Inbound message is saved first.
3. `whatsapp_inbound_received` audit is written.
4. Server downloads WhatsApp media using the server-only WhatsApp access token.
5. File type/size is validated.
6. File is classified by caption, filename, MIME type, and message type.
7. File uploads to private Supabase Storage.
8. `lead_files` row is created.
9. File readiness is reflected in lead intake.
10. Audit records `whatsapp_media_stored`.

If media storage fails, the webhook does not crash after inbound save. It records a `needs_clarification` metadata row and audit trail for review.

## Upload Link Flow

1. Marcus opens a lead.
2. Marcus creates an upload link.
3. The raw token is shown once in the redirect query.
4. The database stores only SHA-256 token hash.
5. Client opens `/upload/{token}`.
6. Client chooses category and uploads image/PDF.
7. File stores privately and appears in lead detail and Client Files.

## Security Rules

- Service role key stays server-only.
- WhatsApp media token stays server-only.
- Client upload page cannot browse files.
- Files are never public.
- Signed URLs are short-lived.
- No full storage paths are meant for client browsing.
- Upload links expire.
- Upload count is limited.
- File view/download creation is audited when feasible.

## Live Test Checklist

1. Apply migration `023`.
2. Confirm private bucket `client-files`.
3. Open a real lead.
4. Create upload link.
5. Upload a PDF floor plan.
6. Upload site photos.
7. Confirm files appear on lead detail.
8. Confirm `/client-files` shows real file status.
9. Confirm signed view/download opens.
10. Mark file reviewed.
11. Void a test file with reason.
12. Send WhatsApp image as client.
13. Confirm image links to lead.
14. Send WhatsApp document as client.
15. Confirm document links to lead.
16. Confirm meeting/quotation readiness improves.
17. Confirm WhatsApp text auto-reply still works.

## Rollback Plan

- Disable upload link sharing.
- Stop using `/upload/{token}` links.
- Leave stored files and audit logs intact.
- If needed, void file records instead of deleting.
- Revert app code only after exporting any needed file list from `lead_files`.

## Safety Status

- Price guide remains on hold.
- Calendar auto-booking remains off.
- Voice transcription remains off.
- LIMM Works remains non-GST mode.
- WhatsApp known-good text send payload is preserved.
