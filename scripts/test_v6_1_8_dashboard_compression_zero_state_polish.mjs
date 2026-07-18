import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dashboard = read("app/page.tsx");
const shell = read("components/ShellChrome.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const clientFiles = read("app/client-files/page.tsx");
const followups = read("app/followups/page.tsx");
const followupRepo = read("lib/data/followups-repository.ts");
const followupSummaryRepo = read("lib/data/phase3-summaries-repository.ts");
const followupActions = read("components/FollowUpSummaryActions.tsx");
const cleanupRules = read("lib/test-lead-cleanup.ts");
const packageJson = read("package.json");
const docs = read("docs/V6_1_8_DASHBOARD_COMPRESSION_ZERO_STATE_POLISH.md");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");

for (const phrase of ["lg:h-screen", "lg:overflow-y-auto", "lg:overscroll-contain", "thin-scrollbar", "lg:bottom-0"]) {
  assert(shell.includes(phrase), `sidebar must be independently scrollable on desktop: missing ${phrase}`);
}
assert(shell.includes("fixed inset-x-0 bottom-0") && shell.includes("lg:hidden"), "mobile navigation must stay reachable as a fixed bottom bar.");

for (const phrase of [
  "buildOperatorPriorityQueue",
  "Operator advantage",
  "Do this next",
  "Work priority queue",
  "Score {item.score}",
  "Open chat",
  "Must Handle Now",
  "Sales To Push",
  "Delivery / Money Risk",
  "No message is sent and no client promise is made here"
]) {
  assert(dashboard.includes(phrase), `ranked operator cockpit missing ${phrase}`);
}
assert(dashboard.includes("buildOperatorPriorityQueue(leads, followUps, singaporeNow(), 5)"), "operator cockpit must remain deliberately capped to five priorities.");
assert(dashboard.includes("visibleItems = group.items.filter((item) => item.count > 0)"), "zero-count mission items must be compacted/hidden.");
assert(!dashboard.includes("No urgent leads right now when Marcus Today is clear."), "repeated old zero-state cards must be removed.");
assert(!dashboard.includes("No follow-ups overdue means the active queue is current."), "repeated old zero-state cards must be removed.");
assert(!dashboard.includes("No appointment requests now unless a lead asks for a slot."), "repeated old zero-state cards must be removed.");
assert(dashboard.includes("All clear: no active pressure in this group."), "dashboard must keep a compact all-clear zero state.");
assert(dashboard.includes("No active sales action is waiting. The priority queue is clear."), "empty action queue must be compact.");
assert(!dashboard.includes("Collections Due\", value: 0"), "zero-count collection card must not be forced into the dashboard.");

for (const field of [
  'version: "v6_3_sales_collection_command_centre"',
  "scrollableSidebarAvailable",
  "usefulMissionRadarAvailable",
  "radarPriorityLegendAvailable",
  "radarActionButtonAvailable",
  "dashboardCompressionAvailable",
  "zeroStatePolishAvailable",
  "priceGuideOnHold",
  "priceGuideAutomationEnabled: false",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled",
  "gstRegistered: false"
]) {
  assert(health.includes(field), `health missing v6.1.8 proof field: ${field}`);
}

for (const phrase of ["Real client storage", "listAllLeadFiles", "listLeadUploadLinks", "No files received yet", "Create an upload link"]) {
  assert(clientFiles.includes(phrase), `Client Files repository-backed page missing ${phrase}`);
}
for (const forbidden of ["Daniel Tan", "Apex Clinic", "Mock folder", "Placeholder only", "Create Upload Link Later"]) {
  assert(!clientFiles.includes(forbidden), `Client Files must not show fake/mock wording: ${forbidden}`);
}

for (const phrase of ["listFollowUpProtectionSummaries(80)", "Latest-message read model only", "No auto follow-up messages are sent", "FollowUpSummaryActions"]) {
  assert(followups.includes(phrase), `bounded follow-up behavior regressed: missing ${phrase}`);
}
assert(followupSummaryRepo.includes("listLatestLeadMessagesForInbox") && followupSummaryRepo.includes("isActiveProductionLeadForDailyScreens") && followupSummaryRepo.includes(".slice(0, limit)"), "follow-up read model must stay bounded and production-only.");
assert(followupActions.includes("pending !== null") && followupActions.includes("/api/followups/status"), "follow-up actions must retain pending-state and persisted API behavior.");
for (const phrase of ["isTestFollowUp", "filterAndPageFollowUps", "range(0, fetchLimit - 1)", "hideTestFollowUp"]) {
  assert(followupRepo.includes(phrase), `v6.1.5 follow-up repository behavior regressed: missing ${phrase}`);
}
assert(cleanupRules.includes("Marcus") && cleanupRules.includes("Fio") && cleanupRules.includes("Fion"), "cleanup protection must preserve Marcus/Fio/Fion.");
assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook must remain untouched/preserved.");
for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `Known-good WhatsApp payload shape missing ${phrase}`);
}

assert(packageJson.includes('"test:v6.1.8"'), "package.json must expose v6.1.8 test script.");
assert(packageJson.includes("test_v6_1_8_dashboard_compression_zero_state_polish.mjs"), "package.json must wire v6.1.8 test script.");
assert(exists("docs/V6_1_8_DASHBOARD_COMPRESSION_ZERO_STATE_POLISH.md"), "v6.1.8 docs must exist.");
assert(docs.includes("Scrollable Sidebar") && docs.includes("Mission Radar") && docs.includes("Zero-State Polish"), "v6.1.8 docs must explain the requested refinements.");

const checkedSources = [dashboard, shell, health, clientFiles, followups, followupRepo, followupSummaryRepo, followupActions, cleanupRules, whatsappRoute, whatsappAdapter].join("\n");
const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";
for (const forbidden of [
  wrongWhatsAppPhoneNumberId,
  "free consultation",
  "Tax Invoice",
  "GST calculation",
  "rough price",
  "price range",
  "package price",
  "appointment confirmed",
  "booked for you"
]) {
  assert(!checkedSources.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden UI/safety regression found: ${forbidden}`);
}

console.log("PASS: v6.1.8 dashboard compression, sidebar scroll, and useful radar checks passed.");
