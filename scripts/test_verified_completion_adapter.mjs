import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
};
const includes = (source, phrase, label) => assert(source.includes(phrase), `${label} missing ${phrase}`);

const adapter = read("lib/data/verified-completion-repository.ts");
const sendApi = read("app/api/inbox/send/route.ts");
const autoReply = read("lib/whatsapp-auto-reply.ts");
const delivery = read("lib/data/whatsapp-inbound-jobs-repository.ts");
const leads = read("lib/data/leads-repository.ts");
const followups = read("lib/data/followups-repository.ts");
const inbox = read("components/inbox/MultiChatInbox.tsx");
const leadContext = read("components/inbox/InboxLeadContextPanel.tsx");

for (const actionType of ["whatsapp_message", "calendar_appointment", "lead_stage_change", "followup_job"]) {
  includes(adapter, `| "${actionType}"`, "consequential action type");
}
for (const phrase of [
  'export type VerifiedCompletionStatus = "pending" | "verified" | "failed"',
  "expectedPostcondition",
  "observedEvidence",
  "independentlyObserved && observation.postconditionMatched",
  "verified_completion_${status}",
  "Completion is deliberately fail-closed"
]) includes(adapter, phrase, "verified completion repository");

for (const source of [sendApi, autoReply]) {
  includes(source, 'actionType: "whatsapp_message"', "WhatsApp completion receipt");
  includes(source, 'whatsappStatus: "accepted"', "provider acceptance state");
  includes(source, 'completionStatus: "pending"', "pending delivery state");
  includes(source, "completionReceiptId", "delivery correlation id");
  assert(!source.includes('whatsappStatus: "sent"'), "provider API acceptance must not be stored as sent");
}

for (const phrase of [
  "apply_whatsapp_delivery_status",
  "findLeadMessageByProviderId(status.providerMessageId)",
  "completionReceiptId",
  "independentlyObserved: true",
  "postconditionMatched: !failed",
  'status.status === "failed" || status.status === "deleted"'
]) includes(delivery, phrase, "WhatsApp webhook completion verification");

for (const phrase of [
  'actionType: "lead_stage_change"',
  "const readBack = await getLeadByIdForCompletionReadBack(id)",
  "Lead stage read-back did not match",
  'actionType: "calendar_appointment"',
  "Live Calendar adapter is disabled; no event exists to read back."
]) includes(leads, phrase, "lead/calendar completion verification");

for (const phrase of [
  'actionType: "followup_job"',
  "const readBack = await getFollowUpByIdForCompletionReadBack(id)",
  "Persisted follow-up did not match"
]) includes(followups, phrase, "follow-up completion verification");

for (const source of [inbox, leadContext]) {
  includes(source, 'return "Provider Accepted"', "truthful message status");
  includes(source, 'return "Pending"', "unproven message status");
  assert(!source.includes('message.providerMessageId || metadataMetaMessageId || message.whatsappStatus === "sent"'), "provider id must not imply Sent");
}
includes(sendApi, 'errorCode: "outbound_persist_failed"', "post-acceptance persistence warning");
includes(sendApi, 'whatsappStatus: "accepted"', "post-acceptance pending truth");
includes(inbox, "!result.ok && !providerAccepted", "accepted message reconciliation");

console.log("PASS: verified completion adapter covers WhatsApp, calendar, lead-stage, and follow-up actions.");
