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
const globals = read("app/globals.css");
const tailwind = read("tailwind.config.ts");
const shell = read("components/ShellChrome.tsx");
const leadCard = read("components/LeadCard.tsx");
const leadDisplay = read("lib/lead-display.ts");
const clientFiles = read("app/client-files/page.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const followups = read("app/followups/page.tsx");
const followupRepo = read("lib/data/followups-repository.ts");
const followupSummaryRepo = read("lib/data/phase3-summaries-repository.ts");
const followupActions = read("components/FollowUpSummaryActions.tsx");
const cleanupPanel = read("components/CleanupPanel.tsx");
const cleanupRules = read("lib/test-lead-cleanup.ts");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");
const packageJson = read("package.json");
const docs = read("docs/V6_1_6_MISSION_CONTROL_UI_INTEGRATED.md");

for (const phrase of [
  "Boss Daily Brief",
  "Operator advantage",
  "Do this next",
  "Work priority queue",
  "Must Handle Now",
  "Sales To Push",
  "Delivery / Money Risk",
  "Open WhatsApp Inbox",
  "Command Core"
]) {
  assert(dashboard.includes(phrase), `dashboard missing Mission Control phrase: ${phrase}`);
}
assert(dashboard.includes("mission-panel"), "dashboard must use the current premium mission panels.");
assert(!dashboard.includes("raw health JSON") && !dashboard.includes("Daniel Tan") && !dashboard.includes("Apex Clinic"), "dashboard must not show debug/mock client clutter.");
assert(dashboard.includes('listFollowUps({ status: "active", pageSize: 80'), "dashboard must preserve an explicitly bounded follow-up fetch.");
assert(!dashboard.includes("listLeadMessages") && !dashboard.includes("buildTestLeadCleanupPlan"), "dashboard must not run cleanup scans on page load.");

for (const phrase of [
  ".mission-panel",
  ".radar-ring",
  ".cockpit-grid",
  "backdrop-filter: blur",
  "font-size: 16px"
]) {
  assert(globals.includes(phrase), `cockpit styling missing ${phrase}`);
}
for (const color of ["#05070A", "#090E14", "#0E151D", "#DDB35D", "#F1C968", "#55C7D9", "#42C97A", "#F06464"]) {
  assert(tailwind.includes(color), `Mission Control palette missing ${color}`);
}

for (const group of ["Today", "Sales Pipeline", "Delivery", "Money", "Admin"]) {
  assert(shell.includes(`title: "${group}"`), `sidebar missing group ${group}`);
}
for (const item of ["Boss Daily Brief", "WhatsApp Inbox", "Command Core", "Sales Pipeline", "Quotation Review", "Follow-Ups", "Appointments", "Collection Queue", "Targets", "Boss Report", "Client Files", "Production Data Cleanup", "Audit Log", "Settings", "QA Centre", "Health Diagnostics"]) {
  assert(shell.includes(item), `sidebar missing item ${item}`);
}
assert(shell.includes("pathname.startsWith"), "sidebar must preserve active-route highlighting.");

for (const phrase of [
  "formatFullPhoneForProtectedApp",
  "fullPhone",
  "Next Action",
  "Last WhatsApp message",
  "Risk",
  "missing info",
  "Open WhatsApp Chat",
  "Take Over",
  "Pause Bot"
]) {
  assert(leadCard.includes(phrase), `lead cards missing ${phrase}`);
}
assert(leadDisplay.includes("formatFullPhoneForProtectedApp"), "lead display helper must expose full phone formatting for protected app.");
assert(leadDisplay.includes("maskPhone"), "legacy mask helper can remain for non-operational display contexts.");
assert(!leadCard.includes("Mission Brief") && !leadCard.includes("debug metadata"), "lead cards must stay action-first and not bulky/debug-style.");

for (const phrase of ["Real client storage", "listAllLeadFiles", "listLeadUploadLinks", "No files received yet", "Create an upload link"]) {
  assert(clientFiles.includes(phrase), `Client Files repository-backed page missing ${phrase}`);
}
for (const forbidden of ["Daniel Tan", "Apex Clinic", "Mock folder", "Placeholder only", "Create Upload Link Later"]) {
  assert(!clientFiles.includes(forbidden), `Client Files must not show fake/mock wording: ${forbidden}`);
}

for (const field of [
  'version: "v6_3_sales_collection_command_centre"',
  "missionControlUiIntegrated",
  "julesUiIdeasAppliedByCodex",
  "cockpitGlassmorphismThemeAvailable",
  "radarGridBackgroundAvailable",
  "sidebarNavigationGrouped",
  "marcusTodayPanelAvailable",
  "mainActionQueueAvailable",
  "cleanLeadCardsAvailable",
  "clientFilesComingSoonOnly",
  "mockClientFilesRemoved",
  "fullPhoneNumbersShownInProtectedApp",
  "v615FollowupPerformancePreserved",
  "v615TestCleanupPreserved",
  "priceGuideOnHold",
  "priceGuideAutomationEnabled: false",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled",
  "gstRegistered: false"
]) {
  assert(health.includes(field), `health missing v6.1.6 proof field ${field}`);
}

for (const phrase of ["listFollowUpProtectionSummaries(80)", "Latest-message read model only", "No auto follow-up messages are sent", "FollowUpSummaryActions"]) {
  assert(followups.includes(phrase), `bounded Follow-Up Queue behavior regressed: missing ${phrase}`);
}
assert(followupSummaryRepo.includes("listLatestLeadMessagesForInbox") && followupSummaryRepo.includes("isActiveProductionLeadForDailyScreens") && followupSummaryRepo.includes(".slice(0, limit)"), "follow-up read model must stay bounded and production-only.");
assert(followupActions.includes("pending !== null") && followupActions.includes("/api/followups/status"), "follow-up actions must retain pending-state and persisted API behavior.");
for (const phrase of ["isTestFollowUp", "filterAndPageFollowUps", "range(0, fetchLimit - 1)", "hideTestFollowUp"]) {
  assert(followupRepo.includes(phrase), `v6.1.5 follow-up repository behavior regressed: missing ${phrase}`);
}
assert(cleanupPanel.includes("Soft Delete Test Leads + Test Follow-Ups") && cleanupPanel.includes("Hide / Complete Test Follow-Ups"), "cleanup UI must still cover leads and follow-ups.");
assert(cleanupRules.includes("isProtectedFollowUp") && cleanupRules.includes("Marcus") && cleanupRules.includes("Fio") && cleanupRules.includes("Fion"), "cleanup protection must preserve Marcus/Fio/Fion follow-up rules.");

assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook diagnostics must remain preserved.");
for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `Known-good WhatsApp payload shape missing ${phrase}`);
}

assert(packageJson.includes('"test:v6.1.6"'), "package.json must expose v6.1.6 test script.");
assert(packageJson.includes("test_v6_1_6_mission_control_ui_integrated.mjs"), "package.json must wire v6.1.6 test script.");
assert(exists("docs/V6_1_6_MISSION_CONTROL_UI_INTEGRATED.md"), "v6.1.6 docs must exist.");
assert(docs.includes("Jules UI ideas") && docs.includes("v6.1.5 follow-up performance"), "v6.1.6 docs must explain scope and preservation.");

const checkedSources = [dashboard, globals, shell, leadCard, clientFiles, health, followups, followupRepo, followupSummaryRepo, followupActions, cleanupPanel, cleanupRules, whatsappRoute, whatsappAdapter].join("\n");
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
assert(!/SUPABASE_SERVICE_ROLE_KEY\s*=|WHATSAPP_ACCESS_TOKEN\s*=|OPENAI_API_KEY\s*=/.test(checkedSources), "Source must not contain secret values.");

console.log("PASS: v6.1.6 Mission Control UI integration checks passed.");
