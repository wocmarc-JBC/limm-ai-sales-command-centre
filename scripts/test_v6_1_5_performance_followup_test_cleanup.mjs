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

const followupsPage = read("app/followups/page.tsx");
const followupsRepo = read("lib/data/followups-repository.ts");
const followupButton = read("components/FollowUpSummaryActions.tsx");
const followupSummaryRepo = read("lib/data/phase3-summaries-repository.ts");
const followupStatusRoute = read("app/api/followups/status/route.ts");
const cleanupPanel = read("components/CleanupPanel.tsx");
const cleanupRules = read("lib/test-lead-cleanup.ts");
const actions = read("lib/actions.ts");
const settings = read("app/settings/page.tsx");
const dashboard = read("app/page.tsx");
const leadsRepo = read("lib/data/leads-repository.ts");
const reports = read("app/reports/page.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const pkg = read("package.json");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");
const docs = read("docs/V6_1_5_PERFORMANCE_FOLLOWUP_TEST_CLEANUP.md");

for (const phrase of [
  "listFollowUpProtectionSummaries",
  "listFollowUpProtectionSummaries(80)",
  "Needs Marcus reply",
  "Follow-up due",
  "Overdue",
  "Waiting for client",
  "High-intent idle",
  "Failed send",
  "Search client / phone / message",
  "Latest-message read model only",
  "No active follow-up signals now.",
  "No auto follow-up messages are sent"
]) {
  assert(followupsPage.includes(phrase), `Follow-Up Queue missing ${phrase}`);
}
assert(followupSummaryRepo.includes("isActiveProductionLeadForDailyScreens") && followupSummaryRepo.includes("listLatestLeadMessagesForInbox") && followupSummaryRepo.includes(".slice(0, limit)"), "Follow-Up Queue must use a bounded, production-only latest-message read model.");
assert(followupButton.includes('pending !== null') && followupButton.includes("disabled={!canMarkDone") && followupButton.includes("disabled={!canSnooze"), "Follow-Up action buttons must expose pending/loading and capability states.");
for (const phrase of ["Saving...", "Snoozing...", "Mark Follow-Up Done", "Snooze Follow-Up", "/api/followups/status"]) {
  assert(followupButton.includes(phrase), `Follow-Up action UI missing ${phrase}`);
}
assert(followupStatusRoute.includes("getCurrentProfile") && followupStatusRoute.includes("updateFollowUpStatus") && followupStatusRoute.includes("markLeadFollowedUp"), "Follow-Up action API must authenticate and persist both follow-up and lead-summary actions.");

for (const phrase of [
  "ListFollowUpsOptions",
  "pageSize?: number",
  "scanAll?: boolean",
  "range(0, fetchLimit - 1)",
  "isTestFollowUp",
  "filterAndPageFollowUps",
  "status !== \"completed\"",
  "status !== \"all\"",
  "updateFollowUpStatus",
  "createAuditLog",
  "Snoozed for one day from Follow-Up Queue.",
  "Marked no reply from Follow-Up Queue.",
  "Completed from Follow-Up Queue.",
  "hideTestFollowUp"
]) {
  assert(followupsRepo.includes(phrase), `Follow-up repository missing ${phrase}`);
}
assert(!followupsRepo.includes("normaliseStatus"), "Follow-up repository should not keep unused status normalizer.");

for (const phrase of [
  "isTestLead",
  "isTestFollowUp",
  "isProtectedLead",
  "isProtectedFollowUp",
  "buildTestFollowUpCleanupPlan",
  "v3_3_live_test",
  "v4_3_auth_boss_browser_test",
  "test_only",
  "test-only follow-up verification",
  "Request scope, floor plan, and photos for initial project review".toLowerCase(),
  "Marcus",
  "Fio",
  "Fion"
]) {
  assert(cleanupRules.includes(phrase), `Shared cleanup rules missing ${phrase}`);
}

for (const phrase of [
  "Live Test Lead Cleanup + Follow-Ups",
  "Scan Test Data",
  "Soft Delete Test Leads + Test Follow-Ups",
  "Hide / Complete Test Follow-Ups",
  "scanRequested",
  "followUpTargets",
  "followUpSamples",
  "Marcus/Fio/Fion protected"
]) {
  assert(cleanupPanel.includes(phrase), `Cleanup panel missing ${phrase}`);
}
assert(cleanupPanel.includes("window.confirm"), "Cleanup actions must use a clear browser confirmation before writes.");

for (const phrase of [
  "mode === \"followups_only\"",
  "manage_followups",
  "buildTestFollowUpCleanupPlan",
  "hideTestFollowUp",
  "v6.1.5 in-app cleanup",
  "v6.1.5 in-app hard cleanup",
  "revalidatePath(\"/followups\")"
]) {
  assert(actions.includes(phrase), `Cleanup server action missing ${phrase}`);
}

assert(settings.includes('searchParams?.cleanup === "scan"'), "Settings cleanup scan must only run when requested.");
assert(settings.includes("listFollowUps({ includeTest: true, includeCompleted: true, status: \"all\", pageSize: 500, scanAll: true })"), "Settings cleanup scan must include follow-ups only during explicit scan.");
assert(settings.includes("buildTestFollowUpCleanupPlan"), "Settings cleanup scan must preview test follow-ups.");
assert(!/const cleanupLeads = await listLeads/.test(settings), "Settings must not scan cleanup records on normal page load.");

assert(!dashboard.includes("listLeadMessages"), "Dashboard must not fetch all messages for cleanup scan.");
assert(!dashboard.includes("buildTestLeadCleanupPlan"), "Dashboard must not build cleanup plan on page load.");
assert(dashboard.includes('listFollowUps({ status: "active", pageSize: 80'), "Dashboard must keep the active follow-up fetch explicitly bounded.");
assert(settings.includes("/settings?cleanup=scan#test-lead-cleanup"), "Settings must route cleanup to an explicit scan page.");
assert(leadsRepo.includes("scoreTestLead") && leadsRepo.includes("!options?.includeTest"), "Lead repository must hide test leads by default.");
assert(reports.includes("listFollowUps({ includeTest: showTestDemoRecords })"), "Reports must read follow-ups through repository defaults while explicitly controlling test/demo visibility.");

for (const field of [
  'version: "v6_3_sales_collection_command_centre"',
  "followUpQueuePaginationAvailable",
  "followUpButtonsFixed",
  "testFollowUpsHiddenByDefault",
  "liveTestLeadCleanupAvailable",
  "liveTestFollowUpCleanupAvailable",
  "testDataHiddenByDefault",
  "cleanupDoesNotRunOnPageLoad",
  "performanceDashboardLimitAvailable",
  "marcusFioCleanupProtectionAvailable",
  "fionCleanupProtectionAvailable",
  "priceGuideOnHold",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled"
]) {
  assert(health.includes(field), `Health endpoint missing ${field}`);
}

assert(pkg.includes('"test:v6.1.5"'), "package.json must expose v6.1.5 test script.");
assert(pkg.includes("test_v6_1_5_performance_followup_test_cleanup.mjs"), "package.json must wire v6.1.5 test script.");
assert(pkg.includes("npm run test:v6.1.5"), "verify:all must include v6.1.5 test.");
assert(exists("docs/V6_1_5_PERFORMANCE_FOLLOWUP_TEST_CLEANUP.md"), "v6.1.5 docs must exist.");
assert(docs.includes("Follow-Up Queue pagination") && docs.includes("Marcus/Fio/Fion protection"), "v6.1.5 docs must explain performance and cleanup protection.");

for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `Known-good WhatsApp payload shape missing ${phrase}`);
}

const sourceSafety = [
  followupsPage,
  followupsRepo,
  followupSummaryRepo,
  followupStatusRoute,
  cleanupPanel,
  cleanupRules,
  actions,
  settings,
  dashboard,
  health,
  whatsappAdapter
].join("\n");
const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";
for (const forbidden of [
  wrongWhatsAppPhoneNumberId,
  "free consultation",
  "Tax Invoice",
  "GST calculation",
  "package price",
  "from $",
  "around $"
]) {
  assert(!sourceSafety.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden regression found: ${forbidden}`);
}
assert(!/SUPABASE_SERVICE_ROLE_KEY\s*=|WHATSAPP_ACCESS_TOKEN\s*=|OPENAI_API_KEY\s*=/.test(sourceSafety), "Source must not contain secret values.");

console.log("PASS: v6.1.5 performance, follow-up button, and live test cleanup tests passed.");
