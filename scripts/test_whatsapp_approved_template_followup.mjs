import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const get = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const api = get("app/api/inbox/template-followups/route.ts");
const provider = get("lib/whatsapp-approved-template-followups.ts");
const client = get("components/inbox/ApprovedTemplateFollowupPanel.tsx");
const inbox = get("components/inbox/MultiChatInbox.tsx");
const freeform = get("app/api/inbox/send/route.ts");
const sql = get("supabase/migrations/20261107170000_whatsapp_marketing_template_opt_in.sql");

const checks = [
  ["only marketing templates", provider.includes('FOLLOWUP_TEMPLATE_CATEGORY = "MARKETING"')],
  ["fixed template name", provider.includes('FOLLOWUP_TEMPLATE_NAME = "limm_renovation_followup_v1"')],
  ["Meta approval rechecked at send time", api.includes("getMetaFollowupTemplate()") && api.includes("template?.approved")],
  ["Graph template payload, not freeform text", provider.includes('type: "template" as const')],
  ["provider WAMID required", provider.includes("whatsapp_template_provider_receipt_missing")],
  ["documented opt-in required", api.includes('consent?.status !== "OPTED_IN"')],
  ["STOP / opt-out guard", api.includes("OPT_OUT_PATTERN") && api.includes("hasOptOutSinceConsent")],
  ["blocked/spam contacts rejected", api.includes("hasInternalBlock(context)") && api.includes("lead.isSpam")],
  ["old Meta policy hard block preserved", api.includes("hasPriorMetaPolicyBlock(context)") && api.includes("whatsapp_v16_1_policy_block_state")],
  ["idempotency ledger reserved before Graph send", api.indexOf('from("whatsapp_desk_send_requests").insert') < api.indexOf("sendMetaApprovedFollowup(context.lead.phone)")],
  ["unique request ID required", api.includes("clientRequestId") && api.includes("UUID_PATTERN.test(clientRequestId)")],
  ["template submission boss/admin only", api.includes('["boss", "admin"].includes(operator.role)')],
  ["provider-accepted not delivery-verified", api.includes('whatsappStatus: "accepted"') && api.includes('completionStatus: "pending"')],
  ["no direct sends in QA", api.includes("qa_no_external_sends")],
  ["service-only consent table with RLS", sql.includes("enable row level security") && sql.includes("revoke all")],
  ["user-facing link from closed-window warning", inbox.includes('Use Meta-approved follow-up template')],
  ["full freeform window guard preserved", freeform.includes("!serviceWindow.canSendFreeform")],
  ["operator UI never claims provider acceptance is delivery", client.includes("Delivery is pending WhatsApp webhook confirmation")]
];
for (const [label, passed] of checks) {
  assert.ok(passed, "FAILED: " + label);
  process.stdout.write("PASS " + label + "\n");
}
console.log("WhatsApp approved-template follow-up static safety checks: " + checks.length + " PASS");
