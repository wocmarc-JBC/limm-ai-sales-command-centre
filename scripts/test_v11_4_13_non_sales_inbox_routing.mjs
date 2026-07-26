import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const lanes = read("lib/inbox-lanes.ts");
const inboxPage = read("app/inbox/page.tsx");
const conversationsApi = read("app/api/inbox/conversations/route.ts");
const intentGate = read("lib/whatsapp-intent-gate.ts");
const actions = read("lib/actions.ts");
const releaseGate = read(".github/workflows/release-gate.yml");

for (const marker of [
  "vendor_supplier_solicitation",
  "partnership_collaboration_outreach",
  "recruitment_job_enquiry",
  "spam_scam_irrelevant",
  "wrong_number_or_general_chat",
  "existing_vendor_or_business_contact",
  "leadMatchesInboxLane",
  "isNonSalesInboxConversation",
  "nonSalesInboxCategory"
]) {
  assert.match(lanes, new RegExp(marker));
}
assert.doesNotMatch(lanes, /existing_client_project_message/);
assert.doesNotMatch(lanes, /unclear_intent/);
assert.doesNotMatch(lanes, /sendWhatsApp|WhatsAppCloudApiAdapter|WHATSAPP_ACCESS_TOKEN/);

assert.match(inboxPage, /listInboxLeadCandidates\(\{ limit: 200/);
assert.match(inboxPage, /leadMatchesInboxLane\(lead, lane\)/);
assert.match(inboxPage, /href="\/inbox\?view=non-sales"/);
assert.match(inboxPage, /href="\/inbox\?view=jobs"/);
assert.match(inboxPage, /href="\/inbox\?view=vendors"/);
assert.match(inboxPage, /href="\/inbox\?view=spam"/);
assert.match(inboxPage, /initialFilter=\{lane === "sales" \? inboxViewFilterFromParam\(searchParams\?\.view\) : "All"\}/);
assert.match(inboxPage, /directlySelected \|\| leadMatchesInboxLane\(lead, lane\)/);

assert.match(conversationsApi, /request\.headers\.get\("referer"\)/);
assert.match(conversationsApi, /inboxLaneFromParam\(requestedView\(request, url\)\)/);
assert.match(conversationsApi, /leadMatchesInboxLane\(lead, lane\)/);
assert.match(conversationsApi, /listInboxLeadCandidates\(\{ limit: 200/);
assert.doesNotMatch(conversationsApi, /includeNonSales: true is the inbox contract/);

assert.match(intentGate, /RECRUITMENT_ACKNOWLEDGEMENT/);
assert.match(intentGate, /one_time_recruitment_acknowledgement/);
assert.match(intentGate, /one_time_vendor_acknowledgement/);
assert.match(intentGate, /spam_scam_irrelevant/);
assert.match(actions, /setLeadConversationIntentOverrideAction/);
assert.match(actions, /setLeadConversationIntentOverride/);
assert.match(releaseGate, /Verify v11\.4\.13 non-sales inbox routing/);

const primaryLinkCount = (read("components/ShellChrome.tsx").match(/href: "\/reply-performance", label: "Reply Performance"/g) ?? []).length;
assert.equal(primaryLinkCount, 1);

console.log("PASS v11.4.13 sales-first inbox, separated non-sales lanes, realtime lane persistence, one-time acknowledgements, and manual recovery");
