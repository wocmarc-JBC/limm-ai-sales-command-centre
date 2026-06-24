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

const leadPage = read("app/leads/[id]/page.tsx");
const legacySalesInbox = read("components/WhatsAppSalesInbox.tsx");
const multiChatInbox = read("components/inbox/MultiChatInbox.tsx");
const inboxPage = read("app/inbox/page.tsx");
const sendApi = read("app/api/inbox/send/route.ts");
const inboxMessagesApi = read("app/api/inbox/messages/route.ts");
const leadMessagesRepository = read("lib/data/lead-messages-repository.ts");
const adapter = read("lib/adapters/whatsapp-adapter.ts");
const health = read("app/api/whatsapp/health/route.ts");

for (const phrase of [
  "conversationMessages",
  ".sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())",
  "Read-only lead view",
  "Manual WhatsApp replies now happen only in the WhatsApp Inbox",
  "Reply in WhatsApp Inbox",
  "href={`/inbox?lead=${encodeURIComponent(lead.id)}`"
]) {
  assertIncludes(leadPage, phrase, "lead detail read-only WhatsApp routing");
}

for (const forbidden of [
  "WhatsAppSalesInbox",
  "sendManualWhatsAppReplyAction",
  "sendManualWhatsAppTestAction",
  'name="manual_reply_body"',
  "Test send to Marcus first",
  "Sending..."
]) {
  assert(!leadPage.includes(forbidden), `/leads/[id] must not expose active WhatsApp send path: ${forbidden}`);
}

for (const phrase of [
  '"use client"',
  "Sales Inbox",
  "WhatsApp Leads",
  "Search name, phone, message, property",
  "Read-only",
  "Reply in WhatsApp Inbox",
  "href={`/inbox?lead=${encodeURIComponent(lead.id)}`",
  "Legacy send tools disabled",
  "Technical Audit",
  "WhatsApp Delivery Details",
  "scrollIntoView",
  "bottomRef",
  "justify-end",
  "justify-start",
  "rounded-br-md",
  "rounded-bl-md",
  "NEXT_REDIRECT",
  "displayMessageStatus",
  "providerMessageId"
]) {
  assertIncludes(legacySalesInbox, phrase, "legacy read-only WhatsApp component");
}

for (const forbidden of [
  "sendManualWhatsAppReplyAction",
  "sendManualWhatsAppTestAction",
  'name="manual_reply_body"',
  "Type your WhatsApp reply...",
  "isSending ? \"Sending...\" : \"Send\"",
  "requestSubmit",
  "Send Test",
  "form ref={formRef}"
]) {
  assert(!legacySalesInbox.includes(forbidden), `legacy WhatsApp component must not keep active send path: ${forbidden}`);
}

for (const phrase of [
  "WhatsAppInboxPage",
  "MultiChatInbox",
  "listLeads()",
  "listLatestLeadMessagesForInbox(leadIds, 3)",
  "listLeadMessagesPage(selectedLead.id, 30)",
  "listAllLeadFiles()",
  "slice(0, 30)",
  "buildSummary"
]) {
  assertIncludes(inboxPage, phrase, "/inbox page");
}

assert(!inboxPage.includes("listLeadMessages(lead.id)"), "/inbox must not load full message history for every chat.");
assert(!inboxPage.includes("listAuditLogs({ entityType: \"lead\", entityId: lead.id })"), "/inbox must not load audit logs for every chat.");

for (const phrase of [
  '"use client"',
  "memo(function ChatRow",
  "memo(function MessageBubble",
  "memo(function LeadContextPanel",
  "function ReplyComposer",
  "LIMM WhatsApp Inbox",
  "Queue",
  "Next waiting chat",
  "Waiting for Marcus",
  "Waiting for client",
  "Human takeover",
  "Failed send",
  'fetch("/api/inbox/send"',
  "clientTempId",
  "sendingByLeadId",
  "handleSendStarted",
  "handleSendFinished",
  "finishOnce",
  "settleOnce",
  "isLegacyRedirectFailure(message)",
  "optimisticReplies",
  "onSendSettled",
  "useDeferredValue",
  "selectConversation",
  "window.history.replaceState",
  "Load earlier messages",
  "after=${encodeURIComponent(latestPersistedCursor)}",
  "Generate AI Draft",
  "Draft only. Marcus must review, edit, and send manually.",
  'placeholder="Type WhatsApp reply..."',
  "event.ctrlKey || event.metaKey",
  "event.key === \"Escape\"",
  "disabled={!canSend}",
  "onOptimisticReply",
  "WhatsApp Delivery Details",
  "Technical Audit",
  "showDeliveryDetails ?",
  "showTechnicalAudit ?",
  "providerMessageId",
  "NEXT_REDIRECT",
  "messageStatus(message)"
]) {
  assertIncludes(multiChatInbox, phrase, "single active /inbox reply path");
}

for (const forbidden of [
  "sendManualWhatsAppReplyAction",
  "router.refresh()",
  "useRouter",
  'action={sendManualWhatsAppReplyAction}',
  "formAction",
  "useTransition"
]) {
  assert(!multiChatInbox.includes(forbidden), `/inbox must not use legacy send machinery: ${forbidden}`);
}

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
  "takeOverLead(leadId, actor)",
  "pauseBotForLead(leadId",
  "NextResponse.json({",
  "inboxJsonApiSend: true",
  "replaySafeJsonPost: true",
  "noTokenLogged: true"
]) {
  assertIncludes(sendApi, phrase, "POST /api/inbox/send");
}

assert(!sendApi.includes("redirect("), "POST /api/inbox/send must not redirect.");
assert(!sendApi.includes("revalidatePath"), "POST /api/inbox/send must not revalidate the whole inbox.");
assert(!sendApi.includes("sendManualWhatsAppReplyAction"), "POST /api/inbox/send must not call the old server action.");

for (const phrase of [
  "export async function listLatestLeadMessagesForInbox",
  ".in(\"lead_id\", uniqueLeadIds)",
  ".limit(Math.max(uniqueLeadIds.length * perLead * 2, uniqueLeadIds.length))",
  "export async function listLeadMessagesPage",
  ".limit(limit + 1)",
  "hasOlder",
  "oldestCursor",
  "export async function listLeadMessagesAfter",
  ".gt(\"created_at\", after)"
]) {
  assertIncludes(leadMessagesRepository, phrase, "lead message repository performance helpers");
}

for (const phrase of [
  "export async function GET",
  "listLeadMessagesAfter(leadId, after, 30)",
  "listLeadMessagesPage(leadId, 30, before)",
  "hasOlder",
  "oldestCursor",
  "unauthorized"
]) {
  assertIncludes(inboxMessagesApi, phrase, "inbox message API");
}

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

for (const phrase of [
  "manualWhatsappOutboundReplyAvailable: true",
  "leadConversationTimelineAvailable: true",
  "manualTakeoverOnReplyAvailable: true",
  "priceGuideOnHold: true",
  "calendarAutoBookingEnabled: calendar.autoBookingEnabled",
  "voiceTranscriptionEnabled: false"
]) {
  assertIncludes(health, phrase, "health proof");
}

assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(leadPage), "lead page must not reference WhatsApp server credentials.");
assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(legacySalesInbox), "legacy read-only component must not reference WhatsApp server credentials.");
assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(multiChatInbox), "/inbox client must not reference WhatsApp server credentials.");
assert(!multiChatInbox.includes("from $"), "/inbox must not include price/package quick replies.");

console.log("PASS: v9 manual WhatsApp outbound reply single-path static test passed.");
