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
const followupSummaryRepo = read("lib/data/phase3-summaries-repository.ts");
const followupActions = read("components/FollowUpSummaryActions.tsx");
const clientFiles = read("app/client-files/page.tsx");
const salesCollection = read("app/sales-collection/page.tsx");
const map = read("components/SingaporeMissionMap.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");

for (const phrase of [
  "Boss Daily Brief",
  "Operator advantage",
  "Do this next",
  "buildOperatorPriorityQueue",
  "Work priority queue",
  "Must Handle Now",
  "Sales To Push",
  "Delivery / Money Risk"
]) {
  assert(dashboard.includes(phrase), `dashboard boss-first command centre missing ${phrase}`);
}

assert(shell.includes("lg:h-screen") && shell.includes("lg:overflow-y-auto") && shell.includes("lg:overscroll-contain"), "sidebar must remain desktop-scrollable.");
for (const group of ["Today", "Sales Pipeline", "Delivery", "Money", "Admin"]) {
  assert(shell.includes(`title: "${group}"`), `sidebar must retain the ${group} group.`);
}

for (const phrase of ["compactPriorityBadges", "visibleBadges", "hiddenSignalCount", "+{hiddenSignalCount} more signals", "Open WhatsApp Chat", "View Details"]) {
  assert(leadCard.includes(phrase), `lead card UI polish missing ${phrase}`);
}
assert(leadCard.includes("formatFullPhoneForProtectedApp"), "protected lead cards must keep full phone display.");
assert(leadCard.includes("Next Action") && leadCard.includes("Last WhatsApp message"), "lead cards must keep action and message preview.");

for (const phrase of ["Inbox Clear", "No leads in this view.", "Use the filter chips above"]) {
  assert(leadsPage.includes(phrase), `lead inbox empty state missing ${phrase}`);
}

for (const phrase of ["listFollowUpProtectionSummaries(80)", "FollowUpSummaryActions", "Latest-message read model only", "No auto follow-up messages are sent"]) {
  assert(followups.includes(phrase), `follow-up performance/UI preservation missing ${phrase}`);
}
assert(followupSummaryRepo.includes("listLatestLeadMessagesForInbox") && followupSummaryRepo.includes(".slice(0, limit)"), "follow-up read model must stay bounded to latest messages.");
assert(followupActions.includes("pending !== null") && followupActions.includes("/api/followups/status"), "follow-up actions must retain pending feedback and persistence.");

for (const phrase of ["Real client storage", "listAllLeadFiles", "listLeadUploadLinks", "No files received yet"]) {
  assert(clientFiles.includes(phrase), `client files real-storage safety missing ${phrase}`);
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

const checked = [dashboard, shell, leadCard, leadsPage, followups, followupSummaryRepo, followupActions, clientFiles, salesCollection, map, health, whatsappRoute, whatsappAdapter].join("\n");
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
