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

const commandCore = read("app/command-core/page.tsx");
const shell = read("components/ShellChrome.tsx");
const dashboard = read("app/page.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const mapGeometry = read("lib/singapore-map-geometry.ts");
const mapData = read("lib/singapore-map-data.json");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");
const salesCollection = read("app/sales-collection/page.tsx");
const packageJson = read("package.json");

assert(exists("app/command-core/page.tsx"), "/command-core route must exist.");
assert(shell.includes("/command-core") && shell.includes("Command Core Beta"), "sidebar must include Command Core Beta link.");

for (const phrase of [
  "command-core-resource-bar",
  "New Leads",
  "Hot Leads",
  "Appointments",
  "Follow-Ups Due",
  "Quotes Sent",
  "Won Sales",
  "Collections Due",
  "Overdue",
  "Bot Paused"
]) {
  assert(commandCore.includes(phrase), `top resource bar missing ${phrase}`);
}

for (const phrase of [
  "Marcus Decisions",
  "Confirm appointment request",
  "Review floor plan",
  "Follow up quote",
  "Check overdue collection",
  "Handle risk / complaint",
  "Clean test data",
  "Review hot lead",
  "Pause/resume bot",
  "All clear. No urgent decisions right now."
]) {
  assert(commandCore.includes(phrase), `Marcus Decisions panel missing ${phrase}`);
}

for (const phrase of [
  "command-core-centre-panel",
  "command-core-map-hero",
  "command-core-map-first-hero",
  "data-command-core-map-first-layout=\"true\"",
  "data-command-core-map-full-width-hero=\"true\"",
  "data-command-core-map-dominant=\"true\"",
  "command-core-map-module",
  "data-map-uses-full-panel-width=\"true\"",
  "data-map-same-size-as-dashboard=\"true\"",
  "[&_.singapore-map-wide-layout]:w-full",
  "Command Core",
  "SingaporeMissionMap",
  "buildSingaporeMissionMapData",
  "Singapore operating picture"
]) {
  assert(commandCore.includes(phrase), `central Command Core panel missing ${phrase}`);
}

assert(commandCore.includes("command-core-panels-below-map") && commandCore.includes("data-side-panels-no-longer-squeeze-map=\"true\""), "side panels must sit below/separate from map instead of squeezing it.");
assert(commandCore.includes("data-command-core-side-panel=\"decisions-below-map\""), "Marcus Decisions must be below/separate from the map.");
assert(commandCore.includes("data-command-core-side-panel=\"inspector-below-map\""), "Inspector must be below/separate from the map.");

for (const phrase of [
  "command-core-inspector-panel",
  "Inspector",
  "Select a lead, area, or mission item to inspect.",
  "Top Lead Inspector",
  "formatFullPhoneForProtectedApp",
  "Open Lead"
]) {
  assert(commandCore.includes(phrase), `right inspector panel missing ${phrase}`);
}

for (const phrase of [
  "command-core-timeline-strip",
  "Bottom Timeline",
  "Today",
  "Tomorrow",
  "This Week",
  "Overdue",
  "No timeline pressure right now."
]) {
  assert(commandCore.includes(phrase), `bottom timeline missing ${phrase}`);
}

for (const phrase of ["listLeads()", "listFollowUps", "listProjectAccounts", "listPaymentRecords"]) {
  assert(commandCore.includes(phrase), `command core must use repository data: missing ${phrase}`);
}
assert(commandCore.includes("listLeads({ includeTest: true })") && commandCore.includes("testLeadCount"), "test data may be counted for cleanup only.");
assert(!commandCore.includes("Daniel Tan") && !commandCore.includes("Apex Clinic") && !commandCore.includes("fake revenue"), "command core must not include fake client/financial data.");
assert(!commandCore.includes("Client Files"), "command core must not display Client Files unless real storage exists.");

assert(dashboard.includes("LIMM Mission Control") && dashboard.includes("MissionRadarPanel"), "current dashboard route must remain present.");
assert(mapGeometry.includes("sourceDatasetId === \"d_4765db0e87b9c86336792efe8a1f7a66\""), "official Singapore planning-area geometry must remain preserved.");
assert(mapGeometry.includes("data\\.gov\\.sg") && mapGeometry.includes("URA"), "official Singapore map source proof must remain.");
assert(mapData.includes("data.gov.sg / URA") && mapData.includes("d_4765db0e87b9c86336792efe8a1f7a66"), "local official Singapore map asset proof must remain.");

for (const field of [
  'version: "v6_6_2_command_core_map_first_layout"',
  'version: "v6_6_1_strategic_command_core_ui_fit_polish"',
  'version: "v6_6_strategic_command_core_layout"',
  "strategicCommandCoreAvailable",
  "commandCoreBetaRouteAvailable",
  "frostpunkInspiredLayoutAvailable",
  "commandCoreMapFirstLayoutAvailable",
  "commandCoreMapFullWidthHeroAvailable",
  "commandCoreMapSameSizeAsDashboardAvailable",
  "commandCoreResourceBarReadable",
  "commandCorePaleResourceCardsRemoved",
  "commandCoreSidePanelsNoLongerSqueezeMap",
  "commandCoreWideMapLayoutAvailable",
  "commandCoreMapDominantLayoutAvailable",
  "commandCoreMapUsesFullPanelWidth",
  "topResourceBarAvailable",
  "marcusDecisionsPanelAvailable",
  "rightInspectorPanelAvailable",
  "bottomTimelineStripAvailable",
  "commandCoreUsesRealDataOnly",
  "currentDashboardPreserved",
  "officialSingaporeMapPreserved",
  "priceGuideOnHold",
  "gstRegistered: false",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled"
]) {
  assert(health.includes(field), `health route missing v6.6 proof field: ${field}`);
}

assert(salesCollection.includes("Manual non-GST tracking"), "non-GST sales collection mode must remain.");
assert(salesCollection.includes("not automated quotation pricing"), "price guide automation must remain on hold.");
assert(!salesCollection.includes("Tax Invoice"), "GST/Tax Invoice wording must not be introduced.");
assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook must remain preserved.");
for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `known-good WhatsApp text payload shape missing ${phrase}`);
}

assert(packageJson.includes('"test:v6.6"') && packageJson.includes("test_v6_6_strategic_command_core_layout.mjs"), "package.json must expose v6.6 test script.");

const checked = [commandCore, shell, dashboard, health, mapGeometry, whatsappRoute, whatsappAdapter, salesCollection].join("\n");
const wrongPhoneNumberId = "115395" + "2887800145";
for (const forbidden of [
  wrongPhoneNumberId,
  "free consultation",
  "rough price",
  "rough estimate",
  "quote range",
  "price range",
  "package price",
  "appointment confirmed",
  "booked for you",
  "Tax Invoice"
]) {
  assert(!checked.toLowerCase().includes(forbidden.toLowerCase()), `forbidden regression found: ${forbidden}`);
}

console.log("PASS: v6.6 strategic command core beta layout checks passed.");
