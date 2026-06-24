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

const actions = read("lib/actions.ts");
const leadPage = read("app/leads/[id]/page.tsx");
const salesInbox = read("components/WhatsAppSalesInbox.tsx");
const multiChatInbox = read("components/inbox/MultiChatInbox.tsx");
const inboxPage = read("app/inbox/page.tsx");
const inboxMessagesApi = read("app/api/inbox/messages/route.ts");
const leadMessagesRepository = read("lib/data/lead-messages-repository.ts");
const adapter = read("lib/adapters/whatsapp-adapter.ts");
const health = read("app/api/whatsapp/health/route.ts");

for (const phrase of [
  "sendManualWhatsAppReplyAction",
  "WhatsAppCloudApiAdapter",
  "getWhatsAppSendPayloadSummary",
  "adapter.sendReply(lead.phone, body)",
  "saveLeadMessage({",
  'direction: "outbound"',
  'whatsappStatus: "sent"',
  'whatsappStatus: "failed"',
  "metaMessageId",
  "takeOverLead(leadId, actor)",
  "pauseBotForLead(leadId",
  "whatsapp_manual_reply_send_payload_summary",
  "whatsapp_manual_reply_sent",
  "whatsapp_manual_reply_failed",
  "replaySafePostRedirect",
  "manualReplyRedirect(formData",
  'returnTo === "inbox"',
  'redirect(`/inbox?lead=${encodeURIComponent(leadId)}&${query.toString()}`)',
  'revalidatePath("/inbox")'
]) {
  assert(actions.includes(phrase), `manual outbound action missing ${phrase}`);
}

for (const phrase of [
  "sendManualWhatsAppTestAction",
  "adapter.sendReply(to, body)",
  "whatsapp_manual_test_send_payload_summary",
  "whatsapp_manual_test_sent",
  "whatsapp_manual_test_failed"
]) {
  assert(actions.includes(phrase), `manual test send action missing ${phrase}`);
}

for (const phrase of [
  "conversationMessages",
  ".sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())",
  "WhatsAppSalesInbox",
  "inboxChatSummaries",
  "listLeads()",
  "buildInboxChatSummary"
]) {
  assert(leadPage.includes(phrase), `lead page missing inbox split phrase ${phrase}`);
}

for (const phrase of [
  '"use client"',
  "Sales Inbox",
  "WhatsApp Leads",
  "Search name, phone, message, property",
  "Waiting for Marcus",
  "Waiting for client",
  "Human takeover",
  "Failed send",
  'name="manual_reply_body"',
  "Type your WhatsApp reply...",
  "Ask for floor plan/photos",
  "Ask property type",
  "Ask scope",
  "Ask appointment preference",
  "Instagram portfolio",
  "Acknowledge and review",
  "AI Draft Assist",
  "Generate suggested reply",
  "Draft only. Marcus must review, edit, and send manually.",
  "Send",
  "Manual WhatsApp reply sent",
  "Manual WhatsApp reply failed",
  "Test send to Marcus first",
  "Send Test",
  "Bot takeover is now active",
  "Developer Test Tools",
  "Technical Audit",
  "WhatsApp Delivery Details",
  "scrollIntoView",
  "bottomRef",
  "sticky bottom-0",
  "event.ctrlKey || event.metaKey",
  "requestSubmit",
  "disabled={!canSend}",
  "isSending ? \"Sending...\" : \"Send\"",
  "justify-end",
  "justify-start",
  "rounded-br-md",
  "rounded-bl-md",
  "NEXT_REDIRECT",
  "displayMessageStatus",
  "providerMessageId"
]) {
  assert(salesInbox.includes(phrase), `sales inbox missing manual inbox UI phrase ${phrase}`);
}

assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(leadPage), "lead page must not reference WhatsApp server credentials.");
assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(salesInbox), "sales inbox must not reference WhatsApp server credentials.");
assert(!salesInbox.includes("<details open"), "developer tools, delivery details, and audit trail must be collapsed by default.");
assert(!salesInbox.includes("from $"), "sales inbox must not include price/package quick replies.");

for (const phrase of [
  "WhatsAppInboxPage",
  "MultiChatInbox",
  "listLeads()",
  "listLatestLeadMessagesForInbox(leadIds, 3)",
  "listLeadMessagesPage(selectedLead.id, 30)",
  "listAllLeadFiles()",
  "slice(0, 30)",
  "buildSummary",
  "manualReplyStatus={searchParams?.manualReplyStatus}"
]) {
  assert(inboxPage.includes(phrase), `/inbox page missing ${phrase}`);
}

assert(!inboxPage.includes("listLeadMessages(lead.id)"), "/inbox must not load full message history for every chat.");
assert(!inboxPage.includes("listAuditLogs({ entityType: \"lead\", entityId: lead.id })"), "/inbox must not load audit logs for every chat.");

for (const phrase of [
  '"use client"',
  "memo(function ChatRow",
  "memo(function MessageBubble",
  "function ReplyComposer",
  "WhatsApp Sales Inbox",
  "Conversations",
  "Search name, phone, message, property",
  "Next waiting chat",
  "Unread",
  "Waiting for Marcus",
  "Waiting for client",
  "Human takeover",
  "Failed send",
  "window.setInterval(() => router.refresh(), 12000)",
  "selectConversation",
  "router.replace(`/inbox?lead=${encodeURIComponent(leadId)}`",
  "Load earlier messages",
  "fetch(`/api/inbox/messages?leadId=${encodeURIComponent(activeConversation.lead.id)}",
  "Ask property type/scope",
  "Ask floor plan/photos",
  "Ask appointment preference",
  "Instagram portfolio",
  "Ask design/reference images",
  "Team review handoff",
  "May I know if this is for a condo, HDB, landed property, or commercial unit?",
  "Generate AI Draft",
  "Draft only. Marcus must review, edit, and send manually.",
  'name="return_to"',
  'value="inbox"',
  'placeholder="Type WhatsApp reply..."',
  "event.ctrlKey || event.metaKey",
  "event.key === \"Escape\"",
  "disabled={!canSend}",
  "optimisticReplies",
  "onOptimisticReply",
  "Mark waiting for client",
  "Mark closed/lost/done",
  "Pause bot",
  "Resume bot",
  "WhatsApp Delivery Details",
  "Technical Audit",
  "showDeliveryDetails ?",
  "showTechnicalAudit ?",
  "onToggle={(event) => setShowDeliveryDetails(event.currentTarget.open)}",
  "providerMessageId",
  "NEXT_REDIRECT",
  "messageStatus(message)"
]) {
  assert(multiChatInbox.includes(phrase), `multi-chat inbox missing ${phrase}`);
}

assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(inboxPage), "/inbox page must not reference WhatsApp server credentials.");
assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(multiChatInbox), "multi-chat inbox must not reference WhatsApp server credentials.");
assert(!multiChatInbox.includes("<details open"), "multi-chat technical panels must be collapsed by default.");
assert(!multiChatInbox.includes("from $"), "multi-chat inbox must not include price/package quick replies.");

for (const phrase of [
  "export async function listLatestLeadMessagesForInbox",
  ".in(\"lead_id\", uniqueLeadIds)",
  ".limit(Math.max(uniqueLeadIds.length * perLead * 2, uniqueLeadIds.length))",
  "export async function listLeadMessagesPage",
  ".limit(limit + 1)",
  "hasOlder",
  "oldestCursor"
]) {
  assert(leadMessagesRepository.includes(phrase), `lead message repository missing performance helper ${phrase}`);
}

for (const phrase of [
  "export async function GET",
  "listLeadMessagesPage(leadId, 30, before)",
  "hasOlder",
  "oldestCursor",
  "unauthorized"
]) {
  assert(inboxMessagesApi.includes(phrase), `inbox message API missing ${phrase}`);
}

for (const phrase of [
  'messaging_product: "whatsapp"',
  'recipient_type: "individual"',
  'type: "text"',
  "preview_url: false",
  "normalizeWhatsAppPhone(process.env.WHATSAPP_PHONE_NUMBER_ID",
  "Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`"
]) {
  assert(adapter.includes(phrase), `known-good WhatsApp adapter contract missing ${phrase}`);
}

for (const phrase of [
  "manualWhatsappOutboundReplyAvailable: true",
  "leadConversationTimelineAvailable: true",
  "manualTakeoverOnReplyAvailable: true",
  "whatsappManualTestSendAvailable: true",
  "replaySafeManualReplyPostRedirect: true",
  "priceGuideOnHold: true",
  "calendarAutoBookingEnabled: calendar.autoBookingEnabled",
  "voiceTranscriptionEnabled: false"
]) {
  assert(health.includes(phrase), `health proof missing ${phrase}`);
}

assert(!actions.includes("autoPricingEnabled: true"), "manual WhatsApp reply must not enable auto-pricing.");
assert(!actions.includes("calendarAutoBookingEnabled: true"), "manual WhatsApp reply must not enable calendar auto-booking.");
assert(!actions.includes("voiceTranscriptionEnabled: true"), "manual WhatsApp reply must not enable voice transcription.");

console.log("PASS: v9 manual WhatsApp outbound reply static test passed.");
