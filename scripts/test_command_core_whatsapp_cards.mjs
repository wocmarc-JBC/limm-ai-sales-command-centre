import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

const leadCard = read("components/LeadCard.tsx");
const leadsPage = read("app/leads/page.tsx");
const dashboardPage = read("app/dashboard/page.tsx");
const homePage = read("app/page.tsx");
const commandCore = read("app/command-core/page.tsx");
const leadMessagesRepo = read("lib/data/lead-messages-repository.ts");
const inboxPage = read("app/inbox/page.tsx");

assert(/latestWhatsAppMessage/.test(leadCard), "LeadCard must accept latestWhatsAppMessage from lead_messages.");
assert(/Last WhatsApp message/.test(leadCard), "LeadCard must keep the Last WhatsApp message label.");
assert(!/snippet\(lead\.lastClientMessage\)/.test(leadCard), "LeadCard must not render stale lead.lastClientMessage as the WhatsApp preview.");
assert(/No WhatsApp message yet/.test(leadCard), "LeadCard must show the no-message fallback.");
assert(/return "Client"/.test(leadCard) && /return "Marcus"/.test(leadCard) && /return "AI"/.test(leadCard), "LeadCard must label WhatsApp message sender source.");

assert(/listLatestMeaningfulWhatsAppMessagesForLeads/.test(leadMessagesRepo), "Repository must expose latest meaningful WhatsApp messages by lead.");
assert(/\.from\("lead_messages"\)/.test(leadMessagesRepo), "Latest WhatsApp source must be lead_messages.");
assert(/\.eq\("channel", "whatsapp"\)/.test(leadMessagesRepo), "Latest WhatsApp source must filter channel=whatsapp.");
assert(/message\.direction !== "inbound" && message\.direction !== "outbound"/.test(leadMessagesRepo), "Latest WhatsApp source must exclude non-client/non-outbound technical directions.");
assert(/audit\|debug\|webhook\|technical\|log\|internal/i.test(leadMessagesRepo), "Latest WhatsApp source must filter audit/debug/internal noise.");

assert(/listLatestMeaningfulWhatsAppMessagesForLeads/.test(leadsPage), "AI Lead Inbox must load latest WhatsApp messages from lead_messages.");
assert(/latestWhatsAppMessage=\{latestWhatsAppMessages\.get\(lead\.id\) \?\? null\}/.test(leadsPage), "AI Lead Inbox must pass latest WhatsApp message into LeadCard.");
assert(/redirect\("\/command-core"\)/.test(dashboardPage), "Dashboard route must redirect to Command Core.");
assert(/redirect\("\/command-core"\)/.test(homePage), "Home route must redirect to Command Core.");

assert(/Open WhatsApp Chat/.test(leadCard), "LeadCard must include Open WhatsApp Chat.");
assert(/\/inbox\?lead=\$\{encodeURIComponent\(lead\.id\)\}/.test(leadCard), "LeadCard Open WhatsApp Chat must link to /inbox?lead=<leadId>.");
assert(/View Lead Details/.test(leadCard), "LeadCard must rename Open Lead to View Lead Details.");
assert(!/>[\s\r\n]*Open Lead[\s\r\n]*</.test(leadCard), "LeadCard must not expose old Open Lead label.");
assert(/Take Over/.test(leadCard), "LeadCard must keep Take Over action.");
assert(/Bot Paused/.test(leadCard) && /Pause Bot/.test(leadCard), "LeadCard must show paused state or Pause Bot path.");

assert(/Open WhatsApp Chat/.test(commandCore), "Command Core must expose direct WhatsApp chat opening.");
assert(/\/inbox\?lead=\$\{[^}]+\.id\}/.test(commandCore), "Command Core lead actions must link to /inbox?lead=<leadId>.");
assert(/View Lead Details/.test(commandCore), "Command Core inspector must keep clear admin lead details action.");
assert(/selectedLeadId=\{searchParams\?\.lead\}/.test(inboxPage), "/inbox must receive the lead query for initial selected chat.");

for (const file of [leadCard, leadsPage, dashboardPage, homePage, commandCore, leadMessagesRepo]) {
  assert(!/WHATSAPP_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY/.test(file), "No token or service-role key names should be exposed in card UI path.");
}

console.log("PASS: command-core and lead-card WhatsApp actions use latest lead_messages and direct inbox links.");
