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
const dashboard = read("app/page.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const mapGeometry = read("lib/singapore-map-geometry.ts");
const mapData = read("lib/singapore-map-data.json");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const salesCollection = read("app/sales-collection/page.tsx");

assert(exists("app/command-core/page.tsx"), "/command-core route must exist.");
assert(dashboard.includes("LIMM Mission Control") && dashboard.includes("SingaporeMissionMap"), "existing dashboard must remain preserved.");

for (const phrase of [
  "command-core-resource-bar",
  "data-resource-bar-readable-dark=\"true\"",
  "data-readable-resource-card=\"true\"",
  "bg-[#04101d]/95",
  "text-command-text",
  "dotClass(tone)"
]) {
  assert(commandCore.includes(phrase), `resource bar readability proof missing ${phrase}`);
}
assert(!commandCore.includes("bg-command-card/70"), "resource bar must not use old pale/washed-out card style.");

for (const phrase of [
  "command-core-map-first-hero",
  "data-command-core-map-first-layout=\"true\"",
  "data-command-core-map-full-width-hero=\"true\"",
  "command-core-map-module",
  "data-map-uses-full-panel-width=\"true\"",
  "data-map-same-size-as-dashboard=\"true\"",
  "[&_.singapore-map-wide-layout]:w-full",
  "[&_.singapore-tactical-map]:md:min-h-[42rem]",
  "SingaporeMissionMap"
]) {
  assert(commandCore.includes(phrase), `full-width map hero proof missing ${phrase}`);
}

assert(commandCore.indexOf("command-core-map-first-hero") < commandCore.indexOf("command-core-panels-below-map"), "map hero must appear before decision/inspector/timeline panels.");
assert(commandCore.includes("data-side-panels-no-longer-squeeze-map=\"true\""), "side panels must not squeeze the map.");
assert(commandCore.includes("data-command-core-side-panel=\"decisions-below-map\""), "Marcus Decisions must be below/separate from map.");
assert(commandCore.includes("data-command-core-side-panel=\"inspector-below-map\""), "Inspector must be below/separate from map.");
assert(commandCore.includes("data-timeline-compact=\"true\"") && commandCore.includes("No timeline pressure right now."), "timeline must be compact when empty.");
assert(!commandCore.includes("command-core-shell-grid"), "old three-column squeeze grid must be removed.");
assert(!commandCore.includes("2xl:grid-cols-[minmax(16.25rem,18.75rem)_minmax(42rem,1fr)_minmax(17.5rem,21.25rem)]"), "old side-map-side row must be removed.");

assert(mapGeometry.includes("sourceDatasetId === \"d_4765db0e87b9c86336792efe8a1f7a66\""), "official Singapore geometry must remain preserved.");
assert(mapData.includes("data.gov.sg / URA") && mapData.includes("d_4765db0e87b9c86336792efe8a1f7a66"), "local official Singapore map asset proof must remain.");

for (const field of [
  'version: "v6_6_2_command_core_map_first_layout"',
  "commandCoreMapFirstLayoutAvailable",
  "commandCoreMapFullWidthHeroAvailable",
  "commandCoreMapSameSizeAsDashboardAvailable",
  "commandCoreResourceBarReadable",
  "commandCorePaleResourceCardsRemoved",
  "commandCoreSidePanelsNoLongerSqueezeMap",
  "currentDashboardPreserved",
  "officialSingaporeMapPreserved",
  "priceGuideOnHold",
  "gstRegistered: false",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled"
]) {
  assert(health.includes(field), `health route missing v6.6.2 proof field: ${field}`);
}

assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook must remain untouched.");
assert(salesCollection.includes("Manual non-GST tracking"), "non-GST mode must remain.");
assert(salesCollection.includes("not automated quotation pricing"), "price guide must remain on hold.");
assert(!salesCollection.includes("Tax Invoice"), "GST/Tax Invoice wording must not be introduced.");

const checked = [commandCore, dashboard, health, mapGeometry, whatsappRoute, salesCollection].join("\n");
for (const forbidden of [
  "free consultation",
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

console.log("PASS: v6.6.2 command core map-first layout checks passed.");
