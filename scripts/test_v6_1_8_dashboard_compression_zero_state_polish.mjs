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
const cleanupRules = read("lib/test-lead-cleanup.ts");
const packageJson = read("package.json");
const docs = read("docs/V6_1_8_DASHBOARD_COMPRESSION_ZERO_STATE_POLISH.md");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");

for (const phrase of ["md:h-screen", "md:overflow-y-auto", "md:overscroll-contain", "thin-scrollbar", "md:bottom-0"]) {
  assert(shell.includes(phrase), `sidebar must be independently scrollable on desktop: missing ${phrase}`);
}
assert(shell.includes("overflow-x-auto") && shell.includes("md:overflow-visible"), "mobile sidebar must keep horizontal nav behavior.");

for (const phrase of [
  "MissionRadarPanel",
  "Mission Radar",
  "Highest Priority",
  "radar-ring",
  "Hot Leads",
  "Needs Marcus",
  "Follow-Up Due",
  "Appointment Requests",
  "Bot Paused",
  "Hacking / Approval Risk",
  "Test Data Detected",
  "Email Handoff Pending",
  "Gold = Hot / priority",
  "Cyan = system / bot",
  "Amber = follow-up",
  "Red = risk",
  "Green = clear",
  "Open Priority Lead"
]) {
  assert(dashboard.includes(phrase), `useful Mission Radar missing ${phrase}`);
}
assert(dashboard.includes("h-80") && dashboard.includes("max-w-[26rem]"), "Mission Radar must remain grand, not tiny.");
assert(dashboard.includes("primary?.href") && dashboard.includes("primary?.actionLabel"), "Mission Radar must expose one contextual action button.");
assert(dashboard.includes("radarItems") && dashboard.includes("count:"), "Mission Radar must be driven by operational counts.");

const whatNowCount = (dashboard.match(/What must Marcus do now\?/g) ?? []).length;
assert(whatNowCount === 1, `duplicate What must Marcus do now? copy should be removed; found ${whatNowCount}`);
assert(dashboard.includes("Next Best Action"), "Marcus Today should use compact Next Best Action copy.");
assert(dashboard.includes(".filter((card) => card.value > 0)"), "zero-count mission cards must be compacted/hidden.");
assert(!dashboard.includes("No urgent leads right now when Marcus Today is clear."), "repeated old zero-state cards must be removed.");
assert(!dashboard.includes("No follow-ups overdue means the active queue is current."), "repeated old zero-state cards must be removed.");
assert(!dashboard.includes("No appointment requests now unless a lead asks for a slot."), "repeated old zero-state cards must be removed.");
assert(dashboard.includes("All clear: no urgent leads"), "dashboard must keep a compact all-clear zero state.");
assert(dashboard.includes("Action queue clear."), "empty action queue must be compact.");
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

for (const phrase of ["Coming soon", "Client file upload is not enabled yet.", "No fake folders", "No real client files"]) {
  assert(clientFiles.includes(phrase), `Client Files coming-soon page missing ${phrase}`);
}
for (const forbidden of ["Daniel Tan", "Apex Clinic", "Mock folder", "Placeholder only", "Create Upload Link Later"]) {
  assert(!clientFiles.includes(forbidden), `Client Files must not show fake/mock wording: ${forbidden}`);
}

for (const phrase of ["pageSize = 20", "Show Test Follow-Ups", "Load More", "submitFollowUpStatusAction", "FollowUpActionButton"]) {
  assert(followups.includes(phrase), `v6.1.5 follow-up behavior regressed: missing ${phrase}`);
}
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

const checkedSources = [dashboard, shell, health, clientFiles, followups, followupRepo, cleanupRules, whatsappRoute, whatsappAdapter].join("\n");
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
