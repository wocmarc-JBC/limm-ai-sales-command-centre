import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const pkg = JSON.parse(read("package.json"));
assert(pkg.scripts?.["test:v4.7"], "package.json must expose test:v4.7.");

const envExample = read(".env.example");
assert(/OPENAI_BRAIN_DRY_RUN=false/.test(envExample), "OpenAI brain dry-run must stay off by default.");

const leadDetail = read("app/leads/[id]/page.tsx");
for (const phrase of [
  "AI status: ${aiStatus}",
  "Off",
  "Dry-run fallback",
  "Dry-run active",
  "Draft only",
  "boss approval required",
  "Recommendation category",
  "Risk Flags",
  "Missing Information",
  "Suggested Next Best Action",
  "Draft client reply",
  "Internal boss note",
  "Validation result",
  "Fallback message shown instead of unsafe AI output",
  "No auto-send",
  "No WhatsApp sending",
  "No Calendar booking",
  "No pricing generated",
  "Boss approval required",
  "Save AI draft",
  "Mark useful",
  "Mark not useful",
  "Needs edit",
  "Reject unsafe",
  "Copy draft reply"
]) {
  assert(leadDetail.includes(phrase), `Lead detail missing v4.7 boss-review UI phrase: ${phrase}`);
}
assert(leadDetail.includes("reviewAiDraftAction"), "Lead detail must call reviewAiDraftAction.");
assert(/<form[\s\S]{0,180}action=\{reviewAiDraftAction\}/.test(leadDetail), "Boss review buttons must post only to internal review action.");
assert(!/whatsapp-adapter|calendar-adapter|sendMessage|createEvent|bookAppointment/i.test(leadDetail), "Lead detail must not import or trigger live integrations.");

const actions = read("lib/actions.ts");
assert(actions.includes("reviewAiDraftAction"), "Server action for boss AI draft review missing.");
assert(actions.includes("recordAiDraftReviewAction"), "Boss AI draft review action must use repository helper.");
assert(actions.includes("requirePermission(\"update_leads\")"), "Boss AI draft review action must require lead update permission.");
assert(!/sendMessage|createEvent|bookAppointment/i.test(actions), "Server actions must not send/book from AI review.");

const repository = read("lib/data/ai-decisions-repository.ts");
for (const phrase of [
  "recordAiDraftReviewAction",
  "ai_draft_saved",
  "ai_draft_marked_useful",
  "ai_draft_marked_not_useful",
  "ai_draft_needs_edit",
  "ai_draft_rejected_unsafe",
  "ai_draft_copied",
  "noAutoSend",
  "noWhatsApp",
  "noCalendarBooking",
  "noPricing",
  "copiedOnly",
  "No external message, WhatsApp send, calendar booking, or pricing action performed"
]) {
  assert(repository.includes(phrase), `AI decision repository missing boss-review audit support: ${phrase}`);
}
assert(!/from\(["']audit_logs["']\)\.delete|from\('audit_logs'\)\.delete/i.test(repository), "AI boss review repository must not delete audit logs.");

const types = read("lib/types.ts");
for (const phrase of [
  "AiDraftReviewStatus",
  "marked_useful",
  "marked_not_useful",
  "needs_edit",
  "rejected_unsafe",
  "copied",
  "reviewStatus",
  "reviewNotes",
  "reviewedAt"
]) {
  assert(types.includes(phrase), `Types missing AI draft review field: ${phrase}`);
}

const dryRun = read("lib/ai-dry-run.ts");
for (const phrase of [
  "validateAiDryRunRecommendation",
  "Boss approval must be required",
  "Auto booking must be false",
  "live sending or booking",
  "quote range",
  "rough estimate",
  "package price"
]) {
  assert(dryRun.includes(phrase), `Safety validator missing expected guard: ${phrase}`);
}

const adapter = read("lib/adapters/openai-adapter.ts");
assert(!/whatsapp-adapter|calendar-adapter|sendMessage|createEvent|bookAppointment/i.test(adapter), "OpenAI adapter must not import live WhatsApp/Calendar actions.");
assert(adapter.includes("No live actions") && adapter.includes("No prices") && adapter.includes("Boss approval required"), "OpenAI prompt must keep dry-run constraints.");

const settings = read("app/settings/page.tsx");
assert(settings.includes("OpenAI live actions") && settings.includes("Disabled"), "Settings must still show OpenAI live actions disabled.");
assert(settings.includes("WhatsApp") && settings.includes("Calendar"), "Settings must still show WhatsApp and Calendar status.");

for (const file of [
  "app/leads/[id]/page.tsx",
  "lib/actions.ts",
  "lib/data/ai-decisions-repository.ts",
  "lib/ai-dry-run.ts",
  "lib/adapters/openai-adapter.ts"
]) {
  const content = read(file);
  assert(!/free consultation/i.test(content), `${file} contains forbidden consultation wording.`);
  assert(!/\bS\$\s*\d{2,}|\bSGD\s*\d{2,}|\$\s*\d{2,}/.test(content), `${file} must not contain generated amounts.`);
}

assert(exists("V4_7_OPENAI_DRY_RUN_BOSS_REVIEW_UX_REPORT.md"), "v4.7 report must exist before final audit.");

console.log("PASS: v4.7 OpenAI dry-run boss review UX tests passed.");
