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
assert(pkg.scripts?.["test:v4.6"], "package.json must expose test:v4.6.");

const envExample = read(".env.example");
assert(/OPENAI_BRAIN_DRY_RUN=false/.test(envExample), "OpenAI brain dry-run must be off by default in .env.example.");
assert(/OPENAI_API_KEY=/.test(envExample), "OpenAI key placeholder must exist without a committed value.");

for (const file of [
  "lib/openai-brain-config.ts",
  "lib/ai-dry-run.ts",
  "lib/adapters/openai-adapter.ts",
  "lib/data/ai-decisions-repository.ts"
]) {
  assert(exists(file), `Missing OpenAI dry-run file: ${file}`);
}

const config = read("lib/openai-brain-config.ts");
assert(config.includes("OPENAI_BRAIN_DRY_RUN") && config.includes("OPENAI_API_KEY"), "OpenAI dry-run config must use explicit env flags.");
assert(config.includes("disabled") && config.includes("dry_run_key_missing") && config.includes("dry_run_ready"), "OpenAI status states missing.");
assert(config.includes("Draft only — boss approval required"), "Dry-run draft notice missing.");

const dryRun = read("lib/ai-dry-run.ts");
for (const phrase of [
  "validateAiDryRunRecommendation",
  "buildFallbackAiDryRunRecommendation",
  "normalizeOpenAiDryRunOutput",
  "mode !== \"dry_run\"",
  "Auto booking must be false",
  "Boss approval must be required",
  "assertSafeClientReply",
  "safe_fallback"
]) {
  assert(dryRun.includes(phrase), `Dry-run validator missing ${phrase}`);
}
assert(/quote range/i.test(dryRun) && /rough estimate/i.test(dryRun) && /package price/i.test(dryRun), "Validator must reject range/estimate/package wording.");
assert(/send\s*\+?\s*whatsapp|No live action/i.test(dryRun) || dryRun.includes("live sending or booking"), "Validator must block live send/booking implications.");

const adapter = read("lib/adapters/openai-adapter.ts");
for (const phrase of [
  "OpenAiBrainDryRunAdapter",
  "response_format",
  "json_object",
  "buildFallbackAiDryRunRecommendation",
  "No live actions",
  "No prices",
  "Boss approval required"
]) {
  assert(adapter.includes(phrase), `OpenAI adapter missing ${phrase}`);
}
assert(!/whatsapp-adapter|calendar-adapter|sendMessage|createEvent|bookAppointment/i.test(adapter), "OpenAI adapter must not import or trigger WhatsApp/Calendar/live actions.");

const repository = read("lib/data/ai-decisions-repository.ts");
for (const phrase of [
  "lead_ai_decisions",
  "ai_dry_run_recommendation_saved",
  "createAuditLog",
  "noAutoSend",
  "noBooking",
  "noPricing",
  "OpenAI brain dry-run is disabled by default"
]) {
  assert(repository.includes(phrase), `AI decision repository missing ${phrase}`);
}
assert(!/from\(["']audit_logs["']\)\.delete|from\('audit_logs'\)\.delete/i.test(repository), "AI repository must not delete audit logs.");

const actions = read("lib/actions.ts");
assert(actions.includes("generateAiDryRunRecommendationAction"), "Server action for dry-run recommendation missing.");
assert(actions.includes("getOpenAiBrainRuntime") && actions.includes("!runtime.dryRunEnabled"), "Server action must respect dry-run disabled state.");

const leadDetail = read("app/leads/[id]/page.tsx");
for (const phrase of [
  "OpenAI Brain Dry-Run",
  "Draft only — boss approval required",
  "cannot send messages, book appointments, bypass approval gates, or create pricing",
  "Generate Dry-Run Draft",
  "Dry-Run Off"
]) {
  assert(leadDetail.includes(phrase), `Lead detail missing dry-run UI phrase: ${phrase}`);
}

const settings = read("app/settings/page.tsx");
assert(settings.includes("OpenAI dry-run") && settings.includes("OpenAI live actions"), "Settings/System Health must show dry-run/live-action status.");

const types = read("lib/types.ts");
assert(types.includes("AiDryRunRecommendation") && types.includes("AiDryRunValidation"), "Dry-run recommendation types missing.");
assert(types.includes("dry_run_key_missing") && types.includes("dry_run_ready"), "System health OpenAI status union missing dry-run states.");

const mockStore = read("lib/data/mock-store.ts");
assert(mockStore.includes("aiRecommendations"), "Mock fallback store must persist AI dry-run recommendations.");

for (const file of ["lib/ai-dry-run.ts", "lib/adapters/openai-adapter.ts", "lib/data/ai-decisions-repository.ts", "app/leads/[id]/page.tsx"]) {
  const content = read(file);
  assert(!/\bS\$\s*\d{2,}|\bSGD\s*\d{2,}|\$\s*\d{2,}/.test(content), `${file} must not contain price amounts.`);
  assert(!/auto-send|auto send/i.test(content) || /No auto-send|cannot send|noAutoSend/i.test(content), `${file} must only mention auto-send as disabled.`);
}

console.log("PASS: v4.6 OpenAI dry-run adapter tests passed.");
