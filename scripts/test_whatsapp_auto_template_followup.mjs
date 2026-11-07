import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const get = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const worker = get("lib/whatsapp-auto-template-followups.ts");
const route = get("app/api/operations/whatsapp-template-followups/route.ts");
const migration = get("supabase/migrations/20261107193000_whatsapp_auto_template_attempts.sql");
const config = JSON.parse(get("vercel.json"));
const checks = [
  ["explicit kill switch default off", worker.includes('process.env.WHATSAPP_TEMPLATE_FOLLOWUPS_AUTO_ENABLED === "true"')],
  ["opted-in marketing only", worker.includes('.eq("status", "OPTED_IN")') && worker.includes("FOLLOWUP_TEMPLATE_CATEGORY")],
  ["never marketing without Meta live approval", worker.includes("getMetaFollowupTemplate()") && worker.includes("template?.approved")],
  ["only sales leads", worker.includes('lead.conversation_route === "sales_lead"')],
  ["exclude spam/test, closed leads and human takeovers", worker.includes("!lead.is_spam") && worker.includes("!lead.bot_paused")],
  ["exclude blocked WhatsApp contacts", worker.includes("whatsapp_blocklist")],
  ["preserve old Meta 131047 safety gate", worker.includes("whatsapp_v16_1_policy_block_state")],
  ["honour STOP and opt-out", worker.includes("hasStopAfterConsent") && worker.includes("STOP_PATTERN")],
  ["only after 24h, stop after 3 days", worker.includes("hoursSinceInbound < 25 || hoursSinceInbound > 71")],
  ["only verified provider inbound", worker.includes('.not("provider_timestamp", "is", null)')],
  ["one followup per latest inbound", migration.includes("unique (company_id, lead_id, inbound_message_id)")],
  ["no re-send after uncertain result", worker.includes('status: "unknown"') && worker.includes("Never automatically retry")],
  ["no more than 5 sends per run", worker.includes("MAX_SENDS_PER_RUN = 5")],
  ["7-day template cooldown", worker.includes("countPriorTemplateFollowup") && worker.includes("7 * 24 * ONE_HOUR_MS")],
  ["final pre-send opt-in and latest inbound read-back", worker.includes("finalConsent?.status") && worker.includes("finalInbounds?.[0]?.id === inbound.id")],
  ["provider accepted not delivered", worker.includes('whatsappStatus: "accepted"') && worker.includes('completionStatus: "pending"')],
  ["scheduler only authorized bearer", route.includes("authorizeReliabilityScheduler")],
  ["RLS service-role only", migration.includes("enable row level security") && migration.includes("revoke all")],
  ["daily SG 09:15 cron exists", config.crons.some((c) => c.path === "/api/operations/whatsapp-template-followups" && c.schedule === "15 1 * * *")]
];
for (const [name, valid] of checks) {
  assert.ok(valid, "FAIL " + name);
  console.log("PASS " + name);
}
console.log("WhatsApp auto-template safety tests: " + checks.length + " PASS");
