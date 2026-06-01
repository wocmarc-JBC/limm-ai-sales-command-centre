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
const leadCard = read("components/LeadCard.tsx");
const leadDisplay = read("lib/lead-display.ts");
const leadRepo = read("lib/data/leads-repository.ts");
const clientFiles = read("app/client-files/page.tsx");
const cleanupPanel = read("components/CleanupPanel.tsx");
const sharedCleanup = read("lib/test-lead-cleanup.ts");
const cleanupScript = read("scripts/cleanup_old_test_leads_v6_1.mjs");
const health = read("app/api/whatsapp/health/route.ts");
const webhook = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");
const v6Understanding = read("lib/whatsapp-v6/message-understanding.ts");
const v6Composer = read("lib/whatsapp-v6/natural-reply-composer.ts");

for (const phrase of [
  "LIMM Mission Control",
  "What must Marcus do now?",
  "Marcus Today",
  "Clear these first",
  "Search lead / phone / scope",
  "Focus Mode",
  "Full Cockpit",
  "Main Action Queue",
  "Recent WhatsApp Leads",
  "System Core",
  "Quick Actions"
]) {
  assert(dashboard.includes(phrase), `dashboard missing ${phrase}`);
}

assert(dashboard.includes("priorityCount") && dashboard.includes("Today's command priority"), "dashboard must show concise command priority");
assert(
  (dashboard.includes("Collections Due") && dashboard.includes("Accounts module on hold")) ||
    (shell.includes('href: "/sales-collection"') && shell.includes('href: "/targets"')),
  "dashboard must keep accounts compact, or expose the v6.3 accounts routes in sidebar without dashboard clutter"
);
assert(dashboard.includes("/settings?cleanup=scan#test-lead-cleanup"), "dashboard must include explicit cleanup scan action without dumping raw test data");
assert(!dashboard.includes("raw command") && !dashboard.includes("health JSON") && !dashboard.includes("Daniel Tan") && !dashboard.includes("Apex Clinic"), "dashboard must not show debug or mock client-file clutter");
assert(!dashboard.includes("Client Files"), "dashboard must not promote fake client files");

for (const group of ["Command", "Sales", "Accounts", "Operations", "System"]) {
  assert(shell.includes(`title: "${group}"`), `sidebar missing ${group} group`);
}
for (const item of ["Mission Queue", "Sales Pipeline", "Sales & Collection", "Targets", "Client Files", "Cleanup", "Health / Diagnostics"]) {
  assert(shell.includes(item), `sidebar missing grouped item ${item}`);
}
assert(shell.includes("disabled: true") && shell.includes("soon"), "sidebar must show unfinished modules as disabled/coming soon");
assert(shell.includes("pathname.startsWith"), "sidebar must highlight active routes");

for (const phrase of ["Next Action", "Last Message", "Risk", "Missing", "Open", "Take Over", "Pause Bot"]) {
  assert(leadCard.includes(phrase), `clean lead card missing ${phrase}`);
}
assert(!leadCard.includes("Mission Brief") && !leadCard.includes("Info Collected") && !leadCard.includes("Quotation readiness"), "lead cards must be simplified and not show bulky debug-style blocks");
assert(leadCard.includes("formatLeadDisplayName"), "lead cards must use display name cleaner");
assert(leadDisplay.includes("formatLeadDisplayName") && leadDisplay.includes("Unknown WhatsApp Lead") && leadDisplay.includes("maskPhone"), "display name cleaner must hide ugly generated titles");
assert(leadDisplay.includes("marcus|fio|fion"), "display name cleaner must preserve Marcus/Fio/Fion");
assert(leadRepo.includes("scoreTestLead") && leadRepo.includes("!options?.includeTest"), "test/generated leads must be hidden from active lists by default");

assert(clientFiles.includes("Client file upload is not enabled yet."), "Client Files page must be disabled until real storage exists");
assert(clientFiles.includes("No fake folders") && clientFiles.includes("No real client files"), "Client Files page must explicitly avoid fake/mock file data");
assert(!clientFiles.includes("Daniel Tan") && !clientFiles.includes("Apex Clinic") && !clientFiles.includes("Mock folder") && !clientFiles.includes("Create Upload Link Later"), "Client Files page must not show mock clients or fake upload actions");

assert(cleanupPanel.includes("Live Test Lead Cleanup") && cleanupPanel.includes("Soft Delete Test Leads"), "cleanup access must remain in app");
assert(cleanupPanel.includes("Permanently Delete Soft-Deleted Test Leads") && cleanupPanel.includes("window.confirm"), "hard delete bulk cleanup must use normal confirmation modal");
assert(cleanupPanel.includes("Marcus/Fio/Fion"), "cleanup UI must mention Marcus/Fio/Fion protection");
assert(sharedCleanup.includes("/fion/i") && cleanupScript.includes("/fion/i"), "cleanup rules must protect Fion as well as Marcus/Fio");

for (const field of [
  'version: "v6_3_sales_collection_command_centre"',
  "missionControlUxFinalPolishAvailable",
  "marcusTodayPanelAvailable",
  "sidebarNavigationGrouped",
  "topCommandBarAvailable",
  "focusModeAvailable",
  "cleanLeadCardsAvailable",
  "emptyStatesAvailable",
  "colourHierarchyAvailable",
  "dashboardDebugClutterRemoved",
  "clientFilesHiddenUntilRealStorage",
  "clientFilesMockDataRemoved",
  "fionCleanupProtectionAvailable",
  "nonGstModeAvailable",
  "gstRegistered: false",
  "priceGuideOnHold",
  "priceGuideAutomationEnabled: false",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled"
]) {
  assert(health.includes(field), `health missing ${field}`);
}

assert(v6Understanding.includes("specific_works"), "specific works intent must remain available");
for (const service of ["laminated wall cladding", "toilet overlay", "hacking 2 walls", "commercial office renovation", "wardrobe", "false ceiling"]) {
  assert(v6Understanding.toLowerCase().includes(service) || v6Composer.toLowerCase().includes(service), `specific works brain missing ${service}`);
}
assert(v6Composer.includes("Yes, we can help review") && v6Composer.includes("laminated wall cladding"), "specific works replies must mention the requested item");

assert(webhook.includes("handleWhatsAppInboundMessage") && webhook.includes("whatsapp_webhook_received_start"), "WhatsApp webhook diagnostics must remain preserved");
assert(whatsappAdapter.includes("messaging_product") && whatsappAdapter.includes("recipient_type") && whatsappAdapter.includes("preview_url"), "known-good WhatsApp payload shape must remain preserved");
assert(!/GST|Tax Invoice|tax invoice/i.test(dashboard + leadCard + clientFiles), "live UI must not show GST/Tax Invoice wording");
assert(exists("docs/V6_1_4_MISSION_CONTROL_UX_FINAL_POLISH.md"), "v6.1.4 docs must exist");
assert(read("package.json").includes("test:v6.1.4"), "package.json must expose v6.1.4 test script");

console.log("PASS: v6.1.4 Mission Control UX final polish tests passed.");
