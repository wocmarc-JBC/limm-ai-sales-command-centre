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
const pkg = JSON.parse(read("package.json"));

assert(exists("app/command-core/page.tsx"), "/command-core route must exist.");
assert(dashboard.includes("LIMM Mission Control") && dashboard.includes("SingaporeMissionMap"), "existing dashboard route must remain preserved.");

for (const phrase of [
  "command-core-resource-bar",
  'data-resource-bar-readable-dark="true"',
  'data-resource-card-dark-counter="true"',
  "bg-[#010712]/95",
  "bg-[#030914]/95",
  "resourceCounterToneClasses(tone)",
  "tabular-nums text-command-text",
  "text-command-muted"
]) {
  assert(commandCore.includes(phrase), `final resource contrast proof missing ${phrase}`);
}
assert(!commandCore.includes("bg-command-card/70"), "top resource bar must not use old pale/washed-out cards.");
assert(!commandCore.includes("rounded-2xl border bg-[#04101d]/95 px-4 py-3"), "resource cards must be compact dark counters, not the old larger pale buttons.");

for (const phrase of [
  "command-core-operating-picture-compact",
  'data-operating-picture-compact="true"',
  "Singapore operating picture",
  "text-2xl font-semibold text-command-text",
  "Real CRM signals only. No fake client files, project values, or external map API."
]) {
  assert(commandCore.includes(phrase), `compact operating picture proof missing ${phrase}`);
}
assert(!commandCore.includes("mission-panel relative mb-4 overflow-hidden rounded-3xl p-4 md:p-5"), "operating picture panel must be compressed from the old bulky padding.");

for (const phrase of [
  "command-core-map-first-hero",
  'data-command-core-map-full-width-hero="true"',
  'data-map-uses-full-panel-width="true"',
  'data-map-same-size-as-dashboard="true"',
  "[&_.singapore-map-wide-layout]:w-full",
  "[&_.singapore-tactical-map]:md:min-h-[42rem]",
  "SingaporeMissionMap"
]) {
  assert(commandCore.includes(phrase), `map hero preservation proof missing ${phrase}`);
}

for (const phrase of [
  "command-core-panels-below-map grid items-stretch",
  'data-bottom-panels-aligned="true"',
  'data-command-core-side-panel="decisions-below-map"',
  'data-command-core-side-panel="inspector-below-map"',
  'data-timeline-compact="true"',
  "No timeline pressure right now."
]) {
  assert(commandCore.includes(phrase), `bottom panel alignment proof missing ${phrase}`);
}

assert(commandCore.includes("Back to Dashboard") && commandCore.includes("bg-[#04101d]/90") && commandCore.includes("text-sm font-semibold text-command-cyan"), "header/back button polish proof missing.");
assert(commandCore.indexOf("command-core-map-first-hero") < commandCore.indexOf("command-core-panels-below-map"), "map hero must remain above lower operational panels.");

assert(mapGeometry.includes("sourceDatasetId === \"d_4765db0e87b9c86336792efe8a1f7a66\""), "official Singapore planning-area geometry must remain preserved.");
assert(mapData.includes("data.gov.sg / URA") && mapData.includes("d_4765db0e87b9c86336792efe8a1f7a66"), "local official Singapore map asset proof must remain.");

for (const field of [
  'version: "v6_6_3_strategic_command_core_final_touchup"',
  'salesBrainVersion: "v6.6.3"',
  "commandCoreFinalTouchupAvailable",
  "commandCoreResourceBarContrastFixed",
  "commandCoreOperatingPictureCompressed",
  "commandCoreMapHeroPreserved",
  "commandCoreBottomPanelsAligned",
  "commandCoreMapFullWidthHeroAvailable",
  "commandCoreMapSameSizeAsDashboardAvailable",
  "commandCoreUsesRealDataOnly",
  "priceGuideOnHold",
  "gstRegistered: false",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled"
]) {
  assert(health.includes(field), `health route missing v6.6.3 proof field: ${field}`);
}

assert(pkg.scripts?.["test:v6.6.3"], "package.json missing v6.6.3 final touchup script.");
assert(pkg.scripts?.["verify:all"]?.includes("test:v6.6.3"), "verify:all must include v6.6.3 final touchup test.");

assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook diagnostics/handler must remain preserved.");
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

console.log("PASS: v6.6.3 strategic command core final touchup checks passed.");
