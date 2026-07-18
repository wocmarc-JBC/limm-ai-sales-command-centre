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

function assertNotIncludes(source, phrase, label) {
  assert(!source.includes(phrase), `${label} must not include ${phrase}`);
}

const inboxPage = read("app/inbox/page.tsx");
const inboxClient = read("components/inbox/MultiChatInbox.tsx");
const sendApi = read("app/api/inbox/send/route.ts");
const detailApi = read("app/api/inbox/conversations/[leadId]/route.ts");
const summariesApi = read("app/api/inbox/conversations/route.ts");

assertIncludes(inboxPage, "WhatsApp Inbox", "/inbox page route");
assertIncludes(inboxClient, "Live · newest activity first", "deduplicated main inbox header");

for (const phrase of [
  "setActiveLeadId(leadId)",
  "window.history.replaceState",
  "fetch(`/api/inbox/conversations/${encodeURIComponent(leadId)}`",
  "conversationCacheRef",
  "loadConversation(leadId, { background: true })"
]) {
  assertIncludes(inboxClient, phrase, "fast chat switching");
}

for (const forbidden of [
  "useRouter",
  "router.push",
  "router.replace",
  "router.refresh",
  "sendManualWhatsAppReplyAction",
  'action={sendManualWhatsAppReplyAction}',
  "href={`/leads/${item.id}`",
  "href={`/leads/${chat.id}`"
]) {
  assert(!inboxClient.includes(forbidden), `/inbox must not use heavy navigation or redirect send path: ${forbidden}`);
}

for (const phrase of [
  "POST(request: Request)",
  "request.json()",
  "clientTempId",
  "NextResponse.json({",
  "adapter.sendReply(lead.phone, body)",
  "saveLeadMessage({"
]) {
  assertIncludes(sendApi, phrase, "JSON inbox send API");
}
assert(!sendApi.includes("redirect("), "JSON inbox send API must not redirect.");
assert(!sendApi.includes("revalidatePath"), "JSON inbox send API must not revalidate the whole route.");

for (const phrase of [
  "listLeads({ includeTest: showTestDemoRecords, includeNonSales: true })",
  "listLatestLeadMessagesForInbox(leadIds, 3)",
  "listLeadMessagesPage(selectedLead.id, 30)",
  "hasWhatsAppContactOrMessages",
  "firstThirtyActiveLeads = activeLeadPool.slice(0, 30)"
]) {
  assertIncludes(inboxPage, phrase, "lightweight initial inbox load");
}

for (const phrase of [
  "listLeadMessagesPage(lead.id, 30)",
  "hasOlderMessages",
  "oldestMessageCursor",
  "auditTrail: []"
]) {
  assertIncludes(detailApi, phrase, "selected conversation detail API");
}
assert(!detailApi.includes("listAuditLogs"), "selected conversation API must not fetch technical audit history.");
assert(!summariesApi.includes("listLeadMessagesPage"), "conversation summaries API must not fetch full message histories.");

for (const phrase of [
  "isLegacyRedirectFailure(message)",
  "NEXT_REDIRECT",
  "metadataMetaMessageId",
  "message.providerMessageId || metadataMetaMessageId || message.whatsappStatus === \"sent\"",
  "looksLikeSameOutboundAttempt",
  "Retry in composer"
]) {
  assertIncludes(inboxClient, phrase, "duplicate/false failure display guard");
}

for (const phrase of [
  "showDeliveryDetails ?",
  "showTechnicalAudit ?",
  "Meta message id:",
  "Technical Audit",
  "WhatsApp Delivery Details"
]) {
  assertIncludes(inboxClient, phrase, "collapsed technical panels");
}
assert(!inboxClient.includes("<details open"), "technical panels must not render open by default.");

for (const phrase of [
  "showInternalTestLeads",
  "Show internal/test leads",
  "hiddenInternalCount",
  "internalTestSignals",
  "isInternalTestChat",
  "isNonProductionChat",
  "nonProductionSignals",
  " hidden)"
]) {
  assertNotIncludes(inboxClient, phrase, "live inbox cleanup");
}

for (const phrase of [
  "function ReplyComposer",
  "const [drafts, setDrafts]",
  "insertQuickReply",
  "setReply(reply.trim() ?",
  "Generate AI Draft",
  "Use draft",
  "setReply(aiDraft)",
  'fetch("/api/inbox/send"',
  "SEND_TIMEOUT_MS = 15000",
  "sendingByLeadId",
  "errorByLeadId",
  "handleSendStarted",
  "handleSendFinished",
  "new AbortController()",
  "signal: controller.signal",
  "window.clearTimeout(timeoutId)",
  "send_timeout",
  "finally executed",
  "⌘/Ctrl + Enter to send"
]) {
  assertIncludes(inboxClient, phrase, "isolated manual composer");
}
assert(!inboxClient.includes("quickReplies.map((item) => (<form"), "quick replies must not submit/send automatically.");

for (const phrase of [
  "Waiting for Marcus",
  "Waiting for client",
  "New leads",
  "Bot active",
  "Human takeover",
  "Failed send",
  "Next waiting chat",
  "Lead Actions",
  "Approve Reply",
  "Book Appointment",
  "Move to Quotation Review"
]) {
  assertIncludes(inboxClient, phrase, "daily queue status/action coverage");
}

assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(inboxClient), "client inbox must not reference WhatsApp server credentials.");
assert(!sendApi.includes("autoPricingEnabled: true"), "manual inbox send must not enable auto-pricing.");
assert(!sendApi.includes("calendarAutoBookingEnabled: true"), "manual inbox send must not enable calendar auto-booking.");
assert(!sendApi.includes("voiceTranscriptionEnabled: true"), "manual inbox send must not enable voice transcription.");

console.log("PASS: /inbox 90-quality gate static test passed.");
