import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const triage = read("lib/inbox-boss-triage.ts");
const inbox = read("app/api/inbox/conversations/route.ts");
const exportRoute = read("app/api/operations/conversation-export/route.ts");

assert.match(triage, /classifyBossTriage/);
assert.match(triage, /critical_client_issue/);
assert.match(triage, /qualified_sales_lead/);
assert.match(triage, /job_or_subcontractor/);
assert.match(triage, /vendor_or_business/);
assert.match(triage, /spam_or_irrelevant/);
assert.match(triage, /operator_handling/);

assert.match(inbox, /bossTriageCategory/);
assert.match(inbox, /bossPriorityScore/);
assert.match(inbox, /requiresReply/);
assert.match(inbox, /priorityOnly/);
assert.match(inbox, /b\.bossPriorityScore - a\.bossPriorityScore/);
assert.match(inbox, /requiresReplyCount/);

assert.match(exportRoute, /auth\.profile\.role !== "boss"/);
assert.match(exportRoute, /boss_access_required/);
assert.match(exportRoute, /conversation_export_downloaded/);
assert.match(exportRoute, /includeQa/);
assert.match(exportRoute, /isLikelyQaLead/);
assert.match(exportRoute, /Content-Disposition/);
assert.match(exportRoute, /text\/csv/);
assert.match(exportRoute, /application\/json/);
assert.match(exportRoute, /Cache-Control.*no-store/);
assert.doesNotMatch(exportRoute, /WHATSAPP_ACCESS_TOKEN|sendWhatsApp|WhatsAppCloudApiAdapter/);

console.log("PASS v11.4.5 boss triage ranking, deterministic non-sales separation, QA-safe filtering, boss-only audited CSV/JSON export, and no-send boundary");
