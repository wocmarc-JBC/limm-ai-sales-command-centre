import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const engine = read("lib/phase3-read-models.ts");
const page = read("app/followups/page.tsx");
const api = read("app/api/followups/status/route.ts");
const repo = read("lib/data/phase3-summaries-repository.ts");

for (const status of [
  "Needs Marcus reply",
  "Waiting for client",
  "Follow-up due",
  "Overdue follow-up",
  "High-intent idle",
  "Failed send unresolved",
  "Closed / not active"
]) {
  assert(engine.includes(status), `Follow-up engine missing status: ${status}`);
}

assert(engine.includes('latest?.direction === "inbound"'), "Latest client message must map to Marcus reply handling.");
assert(engine.includes("messageIsManual"), "Manual Marcus replies must be detected.");
assert(engine.includes("TWO_DAYS"), "Waiting-for-client threshold must exist.");
assert(engine.includes("ONE_DAY"), "High-intent idle threshold must exist.");
assert(engine.includes("failedSend(messages)"), "Failed sends must be detected immediately.");
assert(engine.includes("lead.deletedAt || lead.archivedAt || lead.isSpam || lead.isTest"), "Archived/spam/QA leads must be excluded or closed.");

assert(repo.includes("isActiveProductionLeadForDailyScreens"), "Follow-up summaries must use production lifecycle filtering.");
assert(page.includes("Open WhatsApp Chat") && page.includes("/inbox?lead="), "Follow-Up cards must link directly to the WhatsApp Inbox.");
assert(page.includes("FollowUpSummaryActions"), "Follow-Up cards must have real action buttons.");
assert(api.includes("updateFollowUpStatus") && api.includes("markLeadFollowedUp"), "Snooze/Mark Done API must have real outcome paths.");
assert(api.includes("NextResponse.json"), "Follow-up actions must return JSON.");

console.log("PASS test_follow_up_protection");
