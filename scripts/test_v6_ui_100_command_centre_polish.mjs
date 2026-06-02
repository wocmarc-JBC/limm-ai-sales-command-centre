import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dashboard = read("app/page.tsx");
const shell = read("components/ShellChrome.tsx");
const leadCard = read("components/LeadCard.tsx");
const leadsPage = read("app/leads/page.tsx");
const followups = read("app/followups/page.tsx");
const clientFiles = read("app/client-files/page.tsx");
const salesCollection = read("app/sales-collection/page.tsx");
const map = read("components/SingaporeMissionMap.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");

for (const phrase of [
  "LIMM Mission Control",
  "MarcusTodayPanel",
  "MissionRadarPanel",
  "SingaporeMissionMap",
  "Main Action Queue",
  "Recent WhatsApp Leads",
  "System Core",
  "Quick Actions"
]) {
  assert(dashboard.includes(phrase), `dashboard boss-first command centre missing ${phrase}`);
}

assert(shell.includes("md:h-screen") && shell.includes("md:overflow-y-auto") && shell.includes("md:overscroll-contain"), "sidebar must remain desktop-scrollable.");
assert(shell.includes("Command") && shell.includes("Sales") && shell.includes("Accounts") && shell.includes("Operations") && shell.includes("System"), "sidebar must remain grouped.");

for (const phrase of ["compactPriorityBadges", "visibleBadges", "hiddenBadgeCount", "+{hiddenBadgeCount} more signals", "Open Lead"]) {
  assert(leadCard.includes(phrase), `lead card UI polish missing ${phrase}`);
}
assert(leadCard.includes("formatFullPhoneForProtectedApp"), "protected lead cards must keep full phone display.");
assert(leadCard.includes("Next Action") && leadCard.includes("Last WhatsApp message"), "lead cards must keep action and message preview.");

for (const phrase of ["Inbox Clear", "No leads in this view.", "Use the filter chips above"]) {
  assert(leadsPage.includes(phrase), `lead inbox empty state missing ${phrase}`);
}

for (const phrase of ["pageSize = 20", "FollowUpActionButton", "Load More", "Show Test Follow-Ups"]) {
  assert(followups.includes(phrase), `follow-up performance/UI preservation missing ${phrase}`);
}

for (const phrase of ["Coming soon", "Client file upload is not enabled yet.", "No fake folders", "No real client files"]) {
  assert(clientFiles.includes(phrase), `client files coming-soon safety missing ${phrase}`);
}

assert(salesCollection.includes("Manual non-GST tracking"), "sales collection must remain non-GST manual tracking.");
assert(salesCollection.includes("not automated quotation pricing"), "sales collection must not imply automated pricing.");
assert(!salesCollection.includes("Tax Invoice"), "sales collection must not introduce GST Tax Invoice wording.");

for (const phrase of ["SingaporeSvgMap", "projectSingaporeCoordinate", "SINGAPORE_AREA_LABELS", "data-wheel-page-scroll-lock"]) {
  assert(map.includes(phrase), `Singapore Mission Map official/privacy proof missing ${phrase}`);
}

for (const field of [
  'version: "v6_ui_100_command_centre_polish"',
  "ui100CommandCentrePolishAvailable",
  "dashboardBossActionClarityAvailable",
  "marcusToday100PolishAvailable",
  "leadCards100PolishAvailable",
  "sidebar100PolishAvailable",
  "followUpQueueUiPreserved",
  "leadDetail100PolishAvailable",
  "emptyStates100PolishAvailable",
  "mobileUiPolishAvailable",
  "interactionFeedbackPolishAvailable",
  "performanceSafeUiPolishAvailable",
  "clientFilesComingSoonOnly",
  "officialSingaporeMapPreserved",
  "priceGuideOnHold",
  "gstRegistered: false",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled"
]) {
  assert(health.includes(field), `health proof missing ${field}`);
}

assert(whatsappRoute.includes("whatsapp_webhook_received_start"), "WhatsApp webhook diagnostics must remain preserved.");
for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `known-good WhatsApp adapter payload regressed: missing ${phrase}`);
}

const checked = [dashboard, shell, leadCard, leadsPage, followups, clientFiles, salesCollection, map, health, whatsappRoute, whatsappAdapter].join("\n");
const wrongPhoneNumberId = "115395" + "2887800145";
for (const forbidden of [
  wrongPhoneNumberId,
  "free consultation",
  "rough estimate",
  "quote range",
  "price range",
  "package price",
  "appointment confirmed",
  "booked for you",
  "Calendar auto-booking enabled"
]) {
  assert(!checked.toLowerCase().includes(forbidden.toLowerCase()), `forbidden UI/safety regression found: ${forbidden}`);
}

console.log("PASS: v6 UI 100 command centre polish checks passed.");
