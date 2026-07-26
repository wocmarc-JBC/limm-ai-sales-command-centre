import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const priorityPanel = read("components/inbox/MarcusPriorityPanel.tsx");
const priorityPage = read("app/inbox/priority/page.tsx");
const exportPanel = read("components/settings/ConversationExportPanel.tsx");
const exportPage = read("app/settings/conversation-export/page.tsx");

assert.match(priorityPanel, /priority=true/);
assert.match(priorityPanel, /What needs attention now/);
assert.match(priorityPanel, /bossPriorityScore/);
assert.match(priorityPanel, /Critical clients and qualified renovation leads/);
assert.match(priorityPanel, /\/inbox\?lead=/);
assert.match(priorityPage, /getCurrentProfile/);
assert.match(priorityPage, /Login required/);

assert.match(exportPanel, /conversation-export/);
assert.match(exportPanel, /includeQa/);
assert.match(exportPanel, /Download.*CSV/);
assert.match(exportPanel, /credentials: "same-origin"/);
assert.match(exportPanel, /never sends a WhatsApp message/);
assert.match(exportPage, /auth\.profile\.role !== "boss"/);
assert.match(exportPage, /Boss access required/);
assert.doesNotMatch(`${priorityPanel}\n${priorityPage}\n${exportPanel}\n${exportPage}`, /sendWhatsApp|WhatsAppCloudApiAdapter|WHATSAPP_ACCESS_TOKEN/);

console.log("PASS v11.4.6 protected Marcus priority queue and audited conversation export UI");
