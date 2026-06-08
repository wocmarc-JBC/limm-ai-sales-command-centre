# v9 Architecture Audit

Status: PASS - old live reply engines identified and quarantined.

Production route before v9 executed `lib/whatsapp-reply-coach.ts`, `lib/whatsapp-v6/sales-brain.ts`, and `lib/whatsapp-v7-sales-brain.ts` inside `lib/whatsapp-reply-decision.ts`.

Production route after v9:

`lib/whatsapp-auto-reply.ts` -> `lib/whatsapp-reply-decision.ts` -> `lib/whatsapp-v9-sales-brain.ts`

Old reply-capable files remain in the repository for reference and older checks only. They are no longer called by the live decision wrapper.

The WhatsApp webhook, send adapter, safety validator, audit write path, and CRM message save path were preserved.
