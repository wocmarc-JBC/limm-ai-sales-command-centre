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
const leadCard = read("components/LeadCard.tsx");
const leadDetail = read("app/leads/[id]/page.tsx");
const globals = read("app/globals.css");
const clientFiles = read("app/client-files/page.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const followups = read("app/followups/page.tsx");
const followupRepo = read("lib/data/followups-repository.ts");
const cleanupRules = read("lib/test-lead-cleanup.ts");
const cleanupPanel = read("components/CleanupPanel.tsx");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");
const packageJson = read("package.json");
const docs = read("docs/V6_1_7_MISSION_CONTROL_UI_REFINEMENT.md");

for (const phrase of [
  "LIMM Mission Control",
  "Marcus Today",
  "What must Marcus do now?",
  "Top {Math.min(items.length, 5)}",
  ".slice(0, 5)",
  "Focus Mode",
  "Full Cockpit",
  "Sticky top command bar",
  "Search lead / phone / scope",
  "Clean Test Data",
  "Compact System Core status strip",
  "No urgent leads right now",
  "No follow-ups overdue",
  "No appointment requests now"
]) {
  assert(dashboard.includes(phrase), `dashboard missing v6.1.7 refinement marker: ${phrase}`);
}
assert(dashboard.includes('listFollowUps({ status: "active", pageSize: 20 })'), "dashboard must preserve bounded follow-up fetch.");
assert(!dashboard.includes("buildTestLeadCleanupPlan") && !dashboard.includes("listLeadMessages"), "dashboard must not scan cleanup or load heavy message history on page load.");
assert(!dashboard.includes("Client Files"), "dashboard must not surface Client Files before real storage exists.");

for (const phrase of [
  "LeadHeatMeter",
  "Lead Heat",
  "formatFullPhoneForProtectedApp",
  "fullPhone",
  "Next Action",
  "Last WhatsApp message",
  "Open Lead",
  "Take Over",
  "Pause Bot",
  "command-hover-lift",
  "command-press"
]) {
  assert(leadCard.includes(phrase), `LeadCard missing cleaner hierarchy marker: ${phrase}`);
}
assert(!leadCard.includes("Mission Brief") && !leadCard.includes("debug metadata"), "LeadCard must not regress into bulky/debug wording.");

for (const phrase of [
  "Command Timeline",
  "Recent activity",
  "Client message received",
  "Bot reply recorded",
  "No recent activity yet"
]) {
  assert(leadDetail.includes(phrase), `lead detail missing command timeline marker: ${phrase}`);
}

for (const phrase of [
  ".mission-panel",
  ".radar-ring",
  ".cockpit-grid",
  ".command-hover-lift",
  ".command-press",
  "backdrop-filter: blur",
  "font-size: 16px"
]) {
  assert(globals.includes(phrase), `global cockpit styling missing: ${phrase}`);
}

for (const phrase of ["Coming soon", "Client file upload is not enabled yet.", "No fake folders", "No real client files"]) {
  assert(clientFiles.includes(phrase), `Client Files coming-soon page missing ${phrase}`);
}
for (const forbidden of ["Daniel Tan", "Apex Clinic", "Mock folder", "Placeholder only", "Create Upload Link Later"]) {
  assert(!clientFiles.includes(forbidden), `Client Files must not show fake/mock wording: ${forbidden}`);
}

for (const field of [
  'version: "v6_1_7_mission_control_ui_refinement"',
  'salesBrainVersion: "v6.ultimate"',
  "missionControlUiRefinementAvailable",
  "marcusTodayHeroPanelAvailable",
  "focusModeAvailable",
  "leadHeatMeterAvailable",
  "stickyTopCommandBarAvailable",
  "compactSystemCoreAvailable",
  "commandTimelineAvailable",
  "emptyStatesPolished",
  "microInteractionsAvailable",
  "colourHierarchyRefined",
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
  assert(health.includes(field), `health route missing v6.1.7 proof field: ${field}`);
}

for (const phrase of ["pageSize = 20", "Show Test Follow-Ups", "Load More", "submitFollowUpStatusAction", "FollowUpActionButton"]) {
  assert(followups.includes(phrase), `v6.1.5 follow-up UI behavior regressed: missing ${phrase}`);
}
for (const phrase of ["isTestFollowUp", "filterAndPageFollowUps", "range(0, fetchLimit - 1)", "hideTestFollowUp"]) {
  assert(followupRepo.includes(phrase), `v6.1.5 follow-up repository behavior regressed: missing ${phrase}`);
}
assert(cleanupPanel.includes("Soft Delete Test Leads + Test Follow-Ups") && cleanupPanel.includes("Hide / Complete Test Follow-Ups"), "cleanup panel must still cover leads and follow-ups.");
assert(cleanupRules.includes("Marcus") && cleanupRules.includes("Fio") && cleanupRules.includes("Fion"), "cleanup protection must preserve Marcus/Fio/Fion.");

assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook diagnostics must remain preserved.");
for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `Known-good WhatsApp payload shape missing ${phrase}`);
}

assert(packageJson.includes('"test:v6.1.7"'), "package.json must expose v6.1.7 test script.");
assert(packageJson.includes("test_v6_1_7_mission_control_ui_refinement.mjs"), "package.json must wire v6.1.7 test script.");
assert(packageJson.includes("test:v6.1.6") && packageJson.includes("test:v6.1.5"), "v6.1.5/v6.1.6 regression scripts must stay wired.");
assert(exists("docs/V6_1_7_MISSION_CONTROL_UI_REFINEMENT.md"), "v6.1.7 docs must exist.");
assert(docs.includes("Marcus Today") && docs.includes("Focus Mode") && docs.includes("Lead Heat Meter"), "v6.1.7 docs must explain UI refinements.");

const checkedSources = [dashboard, leadCard, leadDetail, globals, clientFiles, health, followups, followupRepo, cleanupPanel, cleanupRules, whatsappRoute, whatsappAdapter].join("\n");
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

console.log("PASS: v6.1.7 Mission Control UI refinement checks passed.");
