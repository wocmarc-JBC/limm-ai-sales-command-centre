import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const tier = read("lib/whatsapp-handoff-tier.ts");
const handoff = read("lib/handoff-email.ts");
const control = read("lib/data/whatsapp-handoff-control-repository.ts");
const autoReply = read("lib/whatsapp-auto-reply.ts");
const migration = read("supabase/migrations/20260726100000_v11_4_11_tiered_handoff_notification.sql");
const gate = read(".github/workflows/release-gate.yml");

assert.match(tier, /"pause_and_escalate"/);
assert.match(tier, /"notify_marcus_continue_bot"/);
assert.match(tier, /"bot_handles_normally"/);
assert.match(tier, /Existing client project issue/);
assert.match(tier, /Explicit human request/);
assert.match(tier, /Legal or payment dispute/);
assert.match(tier, /Safety or property-damage issue/);
assert.match(tier, /Authority or approval enforcement issue/);
assert.match(tier, /Appointment interest/);
assert.match(tier, /Quotation or proposal interest/);
assert.match(tier, /Floor plan, site photo or project file received/);
assert.match(tier, /Highly qualified renovation lead/);
assert.match(tier, /Routine enquiry handled by bot/);
assert.match(tier, /portfolio_request/);

assert.match(migration, /reserve_human_handoff_notification/);
assert.match(migration, /needs_marcus = true/);
assert.doesNotMatch(migration, /bot_paused = true/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /revoke all on function public\.reserve_human_handoff_notification/);
assert.match(migration, /grant execute on function public\.reserve_human_handoff_notification.*service_role/);

assert.match(handoff, /reserve_human_handoff_notification/);
assert.match(handoff, /reserve_human_handoff"/);
assert.match(handoff, /notification_only_reservation/);
assert.match(handoff, /urgent_pause_reservation/);
assert.match(handoff, /Marcus notification only\. The bot remains active/);
assert.match(handoff, /The bot may send the prepared acknowledgement, then it will pause for Marcus/);
assert.match(handoff, /handoffStatusTruthful:\s*true/);
assert.doesNotMatch(handoff, /portfolio requested/i);
assert.doesNotMatch(handoff, /Bot confidence low/);

assert.match(control, /finalizeWhatsAppHandoffPause/);
assert.match(control, /reply_send_failed/);
assert.match(control, /post_send_persistence_failed/);
assert.match(control, /whatsapp_handoff_pause_applied_after_reply/);
assert.match(control, /whatsapp_handoff_pause_applied_after_reply_failure/);

assert.match(autoReply, /finalizeWhatsAppHandoffPause/);
assert.match(autoReply, /outcome: "reply_sent"/);
assert.match(autoReply, /outcome: "reply_send_failed"/);
assert.match(autoReply, /outcome: "post_send_persistence_failed"/);
assert.match(autoReply, /handoffPauseFinalized/);

assert.match(gate, /Verify v11\.4\.11 tiered handoff/);
assert.doesNotMatch(`${tier}\n${control}`, /sendWhatsApp|WhatsAppCloudApiAdapter|WHATSAPP_ACCESS_TOKEN/);

const primaryLinkCount = (read("components/ShellChrome.tsx").match(/href: "\/reply-performance", label: "Reply Performance"/g) ?? []).length;
assert.equal(primaryLinkCount, 1);

console.log("PASS v11.4.11 urgent pause, notification-only continuation, routine bot handling, truthful status, durable dedupe, and no-send control boundary");
