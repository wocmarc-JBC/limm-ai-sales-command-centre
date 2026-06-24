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

const inboxPage = read("app/inbox/page.tsx");
const inboxClient = read("components/inbox/MultiChatInbox.tsx");
const messagesApi = read("app/api/inbox/messages/route.ts");
const sendApi = read("app/api/inbox/send/route.ts");
const summariesApi = read("app/api/inbox/conversations/route.ts");
const detailApi = read("app/api/inbox/conversations/[leadId]/route.ts");
const leadMessagesRepository = read("lib/data/lead-messages-repository.ts");
const adapter = read("lib/adapters/whatsapp-adapter.ts");

for (const phrase of [
  "listLatestLeadMessagesForInbox(leadIds, 3)",
  "listLeadMessagesPage(selectedLead.id, 30)",
  "activeLeads = leads.slice(0, 30)",
  "hasOlderMessages",
  "oldestMessageCursor"
]) {
  assertIncludes(inboxPage, phrase, "/inbox page");
}

assert(!inboxPage.includes("listLeadMessages(lead.id)"), "/inbox page must not load full message history for every conversation.");
assert(!inboxPage.includes("listAuditLogs({ entityType: \"lead\", entityId: lead.id })"), "/inbox page must not load audit logs for every conversation.");
assert(!inboxPage.includes("selectedAuditLogs"), "/inbox page must not build selected audit logs during chat open.");
assert(!inboxPage.includes("WhatsAppSalesInbox"), "/inbox must not import the old heavy lead-detail timeline component.");

for (const phrase of [
  "POST(request: Request)",
  "request.json()",
  "clientTempId",
  "WhatsAppCloudApiAdapter",
  "adapter.sendReply(lead.phone, body)",
  "saveLeadMessage({",
  'direction: "outbound"',
  'whatsappStatus: "sent"',
  'whatsappStatus: "failed"',
  "markLeadAwaitingClientAfterManualReply(leadId, actor)",
  "pauseBotForLead(leadId",
  "NextResponse.json({",
  "inboxJsonApiSend: true",
  "replaySafeJsonPost: true",
  "noTokenLogged: true"
]) {
  assertIncludes(sendApi, phrase, "fast inbox send API");
}

assert(!sendApi.includes("redirect("), "fast inbox send API must not redirect.");
assert(!sendApi.includes("revalidatePath"), "fast inbox send API must not revalidate the whole page.");
assert(!sendApi.includes("WHATSAPP_ACCESS_TOKEN"), "fast inbox send API must not read or expose WhatsApp token directly.");
assert(!sendApi.includes("WHATSAPP_PHONE_NUMBER_ID"), "fast inbox send API must not read or expose WhatsApp phone number id directly.");

for (const phrase of [
  "listLatestLeadMessagesForInbox(leadIds, 3)",
  "activeLeads = leads.slice(0, 30)",
  "conversations",
  "lastMessagePreview",
  "unreadCount",
  "failedSend",
  "floorPlanReceived",
  "sitePhotosReceived"
]) {
  assertIncludes(summariesApi, phrase, "conversation summaries API");
}

assert(!summariesApi.includes("listLeadMessagesPage"), "conversation summaries API must not fetch full selected histories.");
assert(!summariesApi.includes("listAuditLogs"), "conversation summaries API must not fetch audit trails.");

for (const phrase of [
  "listLeadMessagesPage(lead.id, 30)",
  "listLeadFiles(lead.id)",
  "hasOlderMessages",
  "oldestMessageCursor",
  "auditTrail: []"
]) {
  assertIncludes(detailApi, phrase, "selected conversation API");
}

assert(!detailApi.includes("listAuditLogs"), "selected conversation API must not fetch audit trails during chat open.");

for (const phrase of [
  "listLeadMessagesAfter(leadId, after, 30)",
  "listLeadMessagesPage(leadId, 30, before)",
  "hasOlder",
  "oldestCursor"
]) {
  assertIncludes(messagesApi, phrase, "message paging API");
}

for (const phrase of [
  "export async function listLatestLeadMessagesForInbox",
  "export async function listLeadMessagesPage",
  "export async function listLeadMessagesAfter",
  ".limit(limit + 1)",
  ".gt(\"created_at\", after)"
]) {
  assertIncludes(leadMessagesRepository, phrase, "lead message repository");
}

for (const phrase of [
  "memo(function ChatRow",
  "memo(function MessageBubble",
  "memo(function LeadContextPanel",
  "function ReplyComposer",
  "useDeferredValue",
  "clientTempId",
  "randomClientTempId",
  'fetch("/api/inbox/send"',
  'fetch("/api/inbox/conversations"',
  "after=${encodeURIComponent(latestPersistedCursor)}",
  "window.history.replaceState",
  "mergeTimelineMessages",
  "isLegacyRedirectFailure(message)",
  "Load earlier messages",
  "showDeliveryDetails",
  "showTechnicalAudit",
  "NEXT_REDIRECT",
  "metadataMetaMessageId",
  "messageStatus(message)"
]) {
  assertIncludes(inboxClient, phrase, "multi-chat inbox client");
}

assert(!inboxClient.includes("sendManualWhatsAppReplyAction"), "inbox client must not use redirect-based server action send.");
assert(!inboxClient.includes("router.refresh()"), "inbox client must not refresh the full route while polling.");
assert(!inboxClient.includes("useRouter"), "inbox client must not switch chats through router navigation.");
assert(!inboxClient.includes('action={sendManualWhatsAppReplyAction}'), "composer must not submit to redirect action.");
assert(!inboxClient.includes("<details open"), "technical panels must be collapsed and lazy by default.");
assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(inboxClient), "client component must not reference WhatsApp server credentials.");

for (const phrase of [
  'messaging_product: "whatsapp"',
  'recipient_type: "individual"',
  'type: "text"',
  "preview_url: false",
  "normalizeWhatsAppPhone(process.env.WHATSAPP_PHONE_NUMBER_ID",
  "Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`"
]) {
  assertIncludes(adapter, phrase, "known-good WhatsApp adapter contract");
}

assert(!inboxClient.includes("from $"), "inbox client must not include price/package quick replies.");
assert(!sendApi.includes("autoPricingEnabled: true"), "fast inbox send must not enable auto-pricing.");
assert(!sendApi.includes("calendarAutoBookingEnabled: true"), "fast inbox send must not enable calendar auto-booking.");
assert(!sendApi.includes("voiceTranscriptionEnabled: true"), "fast inbox send must not enable voice transcription.");

console.log("PASS: /inbox performance budget static test passed.");
