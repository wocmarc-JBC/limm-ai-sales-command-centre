import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function assertIncludes(source, phrase, label) {
  assert(source.includes(phrase), `${label} missing ${phrase}`);
}

const queue = read("lib/inbox-queue.ts");
const inboxPage = read("app/inbox/page.tsx");
const summariesApi = read("app/api/inbox/conversations/route.ts");
const detailApi = read("app/api/inbox/conversations/[leadId]/route.ts");
const inboxClient = read("components/inbox/MultiChatInbox.tsx");
const sendApi = read("app/api/inbox/send/route.ts");
const leadsRepository = read("lib/data/leads-repository.ts");

for (const phrase of [
  "export type InboxPrimaryStatus",
  '"Failed send"',
  '"Waiting for Marcus"',
  '"Waiting for client"',
  '"New lead"',
  '"Bot active"',
  '"Human takeover"',
  '"Closed / Done"',
  "export function latestMeaningfulWhatsAppMessage",
  "export function getInboxQueueState",
  "export function inboxQueuePriority"
]) {
  assertIncludes(queue, phrase, "shared inbox queue helper");
}

assert(
  /latestMessage\?\.direction === "inbound"[\s\S]*primaryStatus: "Waiting for Marcus"/.test(queue),
  "latest client WhatsApp message must map to Waiting for Marcus."
);
assert(
  /latestMessage\?\.direction === "outbound"[\s\S]*manualOutbound[\s\S]*primaryStatus: manualOutbound \? "Waiting for client" : "Bot active"/.test(queue),
  "latest Marcus/manual outbound message must map to Waiting for client while bot outbound can remain Bot active."
);
assert(
  /if \(failedSend\) \{[\s\S]*primaryStatus: "Failed send"/.test(queue),
  "failed send must map to Failed send."
);
assert(
  /if \(closedOrDone\) \{[\s\S]*primaryStatus: "Closed \/ Done"/.test(queue),
  "closed/done leads must be identified."
);
assert(
  /lead\.botPaused[\s\S]*primaryStatus: "Human takeover"/.test(queue),
  "paused lead with no newer client/outbound message must map to Human takeover."
);

for (const source of [inboxPage, summariesApi, detailApi]) {
  assertIncludes(source, "getInboxQueueState(lead, messages)", "server summary must use shared queue state");
  assertIncludes(source, "primaryStatus: queue.primaryStatus", "server summary primary status");
  assertIncludes(source, "waitingForClient: queue.waitingForClient", "server waiting-for-client state");
  assertIncludes(source, "waitingForMarcus: queue.waitingForMarcus", "server waiting-for-Marcus state");
  assertIncludes(source, "closedOrDone: queue.closedOrDone", "server closed/done state");
}

for (const phrase of [
  "return sortInboxLatestFirst(chats)",
  "return chat.primaryStatus || \"Bot active\"",
  "filter === \"Waiting for Marcus\") return chat.primaryStatus === \"Waiting for Marcus\"",
  "filter === \"Waiting for client\") return chat.primaryStatus === \"Waiting for client\"",
  "filter === \"New leads\") return chat.primaryStatus === \"New lead\"",
  "filter === \"Bot active\") return chat.primaryStatus === \"Bot active\"",
  "filter === \"Failed send\") return chat.primaryStatus === \"Failed send\"",
  "summary.primaryStatus === \"Failed send\" || summary.primaryStatus === \"Waiting for Marcus\"",
  "primaryStatus: \"Waiting for client\"",
  "primaryStatus: result.ok ? \"Waiting for client\" : \"Failed send\""
]) {
  assertIncludes(inboxClient, phrase, "client queue status logic");
}

assert(!inboxClient.includes("inboxQueuePriority"), "status priority must not override latest chat activity in the client queue.");
assert(inboxPage.includes("compareInboxLatestActivity"), "server inbox must sort strictly by latest chat activity.");
assert(
  /primaryStatus: "Waiting for client"[\s\S]*botPaused: true/.test(inboxClient),
  "successful manual send must immediately show Waiting for client and human takeover state."
);
assert(
  /latestMessage\?\.direction === "inbound"[\s\S]*waitingForMarcus: true/.test(queue),
  "client reply after takeover must stay bot-paused but become Waiting for Marcus by latest inbound direction."
);

for (const phrase of [
  "export async function markLeadAwaitingClientAfterManualReply",
  'status: "Awaiting Client"',
  "botPaused: true",
  "needsMarcus: false",
  "bossApprovalNeeded: false",
  "Manual WhatsApp reply sent; bot remains paused and lead is waiting for client response."
]) {
  assertIncludes(leadsRepository, phrase, "manual reply lead-state update");
}

for (const phrase of [
  "markLeadAwaitingClientAfterManualReply",
  "await markLeadAwaitingClientAfterManualReply(leadId, actor)",
  "NextResponse.json({",
  "whatsappStatus: \"sent\""
]) {
  assertIncludes(sendApi, phrase, "JSON send API manual takeover state");
}

assert(!sendApi.includes("takeOverLead(leadId, actor)"), "send API must not leave needsMarcus true after successful manual reply.");
assert(!sendApi.includes("redirect("), "send API must not redirect.");
assert(!sendApi.includes("revalidatePath"), "send API must not revalidate.");
assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(inboxClient), "client inbox must not expose WhatsApp credentials.");

console.log("PASS: /inbox queue status logic test passed.");
