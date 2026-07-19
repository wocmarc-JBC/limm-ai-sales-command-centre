import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const webhook = read("app/api/whatsapp/webhook/route.ts");
const parser = read("lib/whatsapp-parser.ts");
const worker = read("lib/whatsapp-inbound-worker.ts");
const jobs = read("lib/data/whatsapp-inbound-jobs-repository.ts");
const attachment = read("app/api/inbox/attachments/[fileId]/route.ts");
const inbox = read("app/api/inbox/conversations/route.ts");
const page = read("app/inbox/page.tsx");
const migration = read("supabase/migrations/20260719141822_v11_2_0_durable_whatsapp_release.sql");

assert.match(webhook, /enqueueWhatsAppInboundMessages/);
assert.match(webhook, /after\(\(\) => processWhatsAppInboundJob/);
assert.doesNotMatch(webhook, /await handleWhatsAppInboundMessage/);
assert.match(worker, /handleWhatsAppInboundMessage\(job\.message\)/);
assert.match(worker, /retryWhatsAppInboundJob/);
assert.match(jobs, /claim_whatsapp_inbound_job/);
assert.match(parser, /parseWhatsAppStatuses/);
assert.match(jobs, /apply_whatsapp_delivery_status/);
assert.match(migration, /for update skip locked/);
assert.match(migration, /whatsapp_delivery_events/);
assert.match(migration, /last_whatsapp_activity_at desc nulls last/);
assert.match(migration, /lead_files_select_visible_lead/);
assert.match(migration, /assignment\.assigned_profile_id <> \(select auth\.uid\(\)\)/);
assert.match(migration, /parent_lead\.deleted_at is null/);
assert.match(migration, /parent_lead\.archived_at is null/);
assert.match(migration, /coalesce\(parent_lead\.is_spam, false\) = false/);
assert.match(attachment, /getAuthorizedLeadFileById/);
assert.match(inbox, /listInboxLeadCandidates/);
assert.match(inbox, /listLeadFilesForLeads/);
assert.doesNotMatch(inbox, /listAllLeadFiles|listLeads\(/);
assert.match(page, /listInboxLeadCandidates/);
assert.doesNotMatch(page, /listAllLeadFiles|listLeads\(/);
assert.match(read(".github/workflows/release-gate.yml"), /npm run test:v11\.(?:2|3)\.0/);

console.log("PASS v11.2 durable ingestion, delivery receipts, bounded inbox, and attachment authorization gate");
