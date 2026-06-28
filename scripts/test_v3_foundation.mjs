import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoTrackedOrPackagedGeneratedArtifacts, isGeneratedFolderPath } from "./generated_folder_guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && isGeneratedFolderPath(path.relative(root, full))) continue;
    output.push(full);
    if (entry.isDirectory()) walk(full, output);
  }
  return output;
}

const requiredPages = [
  ["app/page.tsx", "Boss Daily Brief"],
  ["app/leads/page.tsx", "AI Lead Inbox"],
  ["app/leads/[id]/page.tsx", "Lead Detail"],
  ["app/appointments/page.tsx", "Appointment Command Centre"],
  ["app/appointment-settings/page.tsx", "Appointment Settings"],
  ["app/approvals/page.tsx", "Boss Review Gate"],
  ["app/followups/page.tsx", "Follow-Up Queue"],
  ["app/quotation-readiness/page.tsx", "Quotation Readiness"],
  ["app/client-files/page.tsx", "Client Files"],
  ["app/reports/page.tsx", "Reports"],
  ["app/settings/page.tsx", "Settings"],
  ["app/audit-log/page.tsx", "Audit Log"],
  ["app/review-chatgpt-ui/page.tsx", "ChatGPT UI Review"]
];

for (const [file, title] of requiredPages) {
  assert(exists(file), `Missing page: ${file}`);
  assert(read(file).includes(title), `Page ${file} does not contain expected title: ${title}`);
}

const schema = read("lib/ai-decision-schema.ts");
for (const key of [
  "division",
  "property_type",
  "service_type",
  "scope_summary",
  "lead_score",
  "lead_category",
  "missing_info",
  "risk_flags",
  "appointment_suitable",
  "appointment_type",
  "auto_booking_allowed",
  "boss_approval_needed",
  "quotation_readiness_score",
  "quote_preparation_checklist",
  "client_reply",
  "internal_notes"
]) {
  assert(schema.includes(`"${key}"`), `AI decision schema missing key: ${key}`);
}

const clientReplyFiles = [
  "lib/ai-decision-schema.ts",
  "lib/mock-data.ts",
  "lib/adapters/whatsapp-adapter.ts"
];
const forbiddenReplyTerms = [/free consultation/i];
const renovationPricePatterns = [
  /\bS\$\s*\d{2,}/i,
  /\bSGD\s*\d{2,}/i,
  /\$\s*\d{2,}/,
  /\b\d{2,}\s*k\s*[-–]\s*\d{2,}\s*k\b/i,
  /\bquote range\b/i,
  /\bprice estimate\b/i,
  /\bestimate range\b/i,
  /\bpackage price\b/i
];

for (const file of clientReplyFiles) {
  const content = read(file);
  for (const pattern of forbiddenReplyTerms) {
    assert(!pattern.test(content), `${file} contains forbidden client wording: ${pattern}`);
  }
  for (const pattern of renovationPricePatterns) {
    assert(!pattern.test(content), `${file} contains generated renovation pricing pattern: ${pattern}`);
  }
}

const quotationPage = read("app/quotation-readiness/page.tsx");
for (const pattern of renovationPricePatterns) {
  assert(!pattern.test(quotationPage), `Quotation readiness page contains pricing pattern: ${pattern}`);
}
assert(!/free consultation/i.test(quotationPage), "Quotation readiness page contains forbidden wording.");

const reviewRoute = read("app/review-chatgpt-ui/page.tsx");
const shellChrome = read("components/ShellChrome.tsx");
const authGate = read("components/auth/AuthGate.tsx");
const reviewRouteFlag = read("lib/review-route.ts");
assert(reviewRouteFlag.includes("NEXT_PUBLIC_ENABLE_REVIEW_ROUTE"), "Review route flag helper missing env flag.");
assert(reviewRoute.includes("isReviewRouteEnabled") && reviewRoute.includes("notFound()"), "Review route must be disabled unless the review flag is enabled.");
assert(shellChrome.includes("isReviewRouteEnabled() && pathname === \"/review-chatgpt-ui\""), "Review shell must only activate behind the review flag.");
assert(authGate.includes("isReviewRouteEnabled() && pathname === \"/review-chatgpt-ui\""), "AuthGate must only exempt review route when the review flag is enabled.");
assert(reviewRoute.includes("Temporary ChatGPT UI Review Mode — Mock Data — No Live Actions"), "Review route missing safety banner.");
assert(reviewRoute.includes("@/lib/mock-data"), "Review route must use mock/demo data.");
assert(!/from\s+["']@\/lib\/actions["']|from\s+["']@\/lib\/data\/.*repository|from\s+["']@\/lib\/data\/supabase|save[A-Za-z]+Action|<form/i.test(reviewRoute), "Review route must not import write actions, live repositories, Supabase, or forms.");
assert(shellChrome.includes("Mock UI Review Mode"), "Review shell header must show Mock UI Review Mode.");
assert(shellChrome.includes("No Login Required"), "Review shell header must show No Login Required.");
assert(shellChrome.includes("No Live Actions"), "Review shell header must show No Live Actions.");
assert(shellChrome.includes("Demo Data Only"), "Review shell header must show Demo Data Only.");
assert(!reviewRoute.includes("Login required"), "Review route body must not show protected login copy.");
assert(!reviewRoute.includes("Logout"), "Review route body must not show logout.");
assert(/auth\.profile\s*&&\s*auth\.authenticated[\s\S]{0,260}<LogoutButton/.test(shellChrome), "Logout must only render for an authenticated profile.");
assert(shellChrome.includes("reviewNavItems"), "Review route must use dedicated review nav items.");
assert(shellChrome.includes("#dashboard") && shellChrome.includes("#client-files"), "Review nav must use internal anchors.");
assert(!/reviewNavItems[\s\S]{0,900}href:\s*["']\/(leads|appointments|settings|audit-log)/.test(shellChrome), "Review nav must not link to protected app routes.");
assert(reviewRoute.includes("(Preview Only)") && /<button[\s\S]{0,120}disabled/.test(reviewRoute), "Review route action buttons must be disabled or labelled Preview Only.");
assert(reviewRoute.includes("Move to Quotation Readiness"), "Review route must use Quotation Readiness wording.");
assert(!reviewRoute.includes("Move to Quotation</DisabledAction>"), "Review route must not use old Move to Quotation label.");
assert(!reviewRoute.includes("Quotation Needed"), "Review route dashboard must not use Quotation Needed wording.");
assert(reviewRoute.includes("Ready for Quotation Review"), "Review route dashboard must use quotation review wording.");
assert(reviewRoute.includes("Client Files Preview"), "Review route must include Client Files Preview.");
assert(reviewRoute.includes("new Date(`${slot.date}T00:00:00`).getDay() === 0"), "Review route must assert Sunday preview dates are real Sundays.");
const reviewSundayDate = "2026-05-31";
assert(reviewRoute.includes(reviewSundayDate), "Review route should use the May 2026 Sunday demo date.");
assert(new Date(`${reviewSundayDate}T00:00:00`).getDay() === 0, "Sunday preview demo date must be an actual Sunday.");
assert(!/free consultation/i.test(reviewRoute), "Review route contains forbidden client wording.");
for (const pattern of renovationPricePatterns) {
  assert(!pattern.test(reviewRoute), `Review route contains pricing pattern: ${pattern}`);
}
assert(!/sunday[\s\S]{0,80}(blocked|continue)/i.test(reviewRoute), "Review route appears to hardcode Sunday blocking.");

const loginPage = read("app/login/page.tsx");
const loginForm = read("components/auth/LoginForm.tsx");
assert(!loginPage.includes('PageHeader title="Login"'), "Login page must not use duplicate Login page header.");
assert(!/<h2[\s\S]{0,80}>Login<\/h2>/i.test(loginForm), "Login form must not duplicate Login heading.");
assert(loginPage.includes("Sign in to Command Centre"), "Login page must have one clear sign-in title.");
assert(loginForm.includes("Supabase Mode"), "Login form must show Supabase Mode indicator.");

const appointmentEngine = read("lib/appointment-engine.ts");
assert(appointmentEngine.includes("sunday"), "Appointment settings must include Sunday.");
assert(appointmentEngine.includes("dayConfig?.enabled"), "Appointment engine must use day config enabled flag.");
assert(!/dayName\s*===\s*["']sunday["']/i.test(appointmentEngine), "Appointment engine has a Sunday-specific branch.");
assert(!/getDay\(\)\s*===\s*0/i.test(appointmentEngine), "Appointment engine hardcodes Sunday by getDay.");
assert(!/sunday[\s\S]{0,80}continue/i.test(appointmentEngine), "Appointment engine appears to hard-block Sunday.");
assert(!/toISOString\(\)\.slice\(0,\s*10\)/.test(appointmentEngine), "Appointment date keys must not use UTC toISOString date slicing.");

const dashboardPage = read("app/page.tsx");
assert(!dashboardPage.includes("Quotation Needed"), "Dashboard must not use Quotation Needed wording.");
assert(dashboardPage.includes("Boss Daily Brief"), "Dashboard must use boss daily brief wording.");

const leadDetailPage = read("app/leads/[id]/page.tsx");
const actionsSource = read("lib/actions.ts");
const rolesSource = read("lib/auth/roles.ts");
assert(rolesSource.includes("sales: [\"view_all\", \"update_leads\", \"manage_followups\", \"control_bot\"]"), "Sales role must not have delete permissions.");
assert(/boss:[\s\S]{0,260}"soft_delete_leads"[\s\S]{0,120}"restore_leads"[\s\S]{0,120}"hard_delete_leads"/.test(rolesSource), "Boss role must retain delete permissions.");
assert(leadDetailPage.includes("const canSoftDelete = can(role, \"soft_delete_leads\")"), "Lead detail must calculate soft delete permission.");
assert(leadDetailPage.includes("const canRestore = can(role, \"restore_leads\")"), "Lead detail must calculate restore permission.");
assert(leadDetailPage.includes("const canHardDelete = can(role, \"hard_delete_leads\")"), "Lead detail must calculate hard delete permission.");
assert(leadDetailPage.includes("Your role:") && leadDetailPage.includes("Soft delete requires boss/admin permission.") && leadDetailPage.includes("Permanent delete requires boss/admin and prior soft delete."), "Lead detail must show delete permission guidance.");
assert(/data-testid="soft-delete-lead-button"[\s\S]{0,160}Boss\/admin only/.test(leadDetailPage), "Sales/no-permission users must see disabled Boss/admin only soft delete state.");
assert(/disabled=\{!canSoftDelete\}[\s\S]{0,100}data-testid="soft-delete-lead-button"/.test(leadDetailPage), "Soft delete button must be disabled without permission.");
assert(/const hardDeleteEnabled = canHardDelete && Boolean\(lead\.deletedAt\)/.test(leadDetailPage), "Hard delete must be enabled only for boss/admin after soft delete.");
assert(/disabled=\{!hardDeleteEnabled\}[\s\S]{0,120}data-testid="hard-delete-lead-button"/.test(leadDetailPage), "Hard delete button must be disabled before soft delete.");
assert(actionsSource.includes('deleteStatus: "permissionDenied"'), "Delete actions must redirect with permissionDenied feedback.");
assert(actionsSource.includes('deleteStatus: "softDeleted"'), "Soft delete action must redirect with softDeleted feedback.");
assert(actionsSource.includes('deleteStatus: "restored"'), "Restore action must redirect with restored feedback.");
assert(actionsSource.includes('deleteStatus: "failed"'), "Hard delete guard failures must redirect with failed feedback.");
assert(actionsSource.includes('confirmation !== "PERMANENT DELETE"'), "Hard delete must require exact PERMANENT DELETE confirmation.");
assert(actionsSource.includes("!lead?.deletedAt"), "Hard delete action must verify prior soft delete.");

const mockData = read("lib/mock-data.ts");
assert(/id:\s*"lead-003"[\s\S]{0,280}division:\s*"LIMM Works"[\s\S]{0,280}propertyType:\s*"Commercial clinic"/.test(mockData), "Commercial clinic mock lead must be classified under LIMM Works.");

function demoSlots(settings, appointmentType, startDate, days = 2) {
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const type = settings.appointmentTypes[appointmentType];
  const slots = [];
  const start = new Date(`${startDate}T00:00:00`);
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dayName = dayNames[date.getDay()];
    const dayConfig = settings.days[dayName];
    if (type.enabled && dayConfig.enabled) {
      slots.push({ day: dayName, start: dayConfig.slots[0].start, approvalRequired: dayConfig.approvalRequired || type.approvalRequired });
    }
  }
  return slots;
}

const sundayEnabledSettings = {
  days: {
    sunday: { enabled: true, approvalRequired: true, slots: [{ start: "10:00", end: "15:00" }] },
    monday: { enabled: true, approvalRequired: false, slots: [{ start: "09:00", end: "18:00" }] }
  },
  appointmentTypes: {
    site_discussion: { enabled: true, durationMinutes: 60, approvalRequired: false },
    quotation_review: { enabled: false, durationMinutes: 45, approvalRequired: true }
  }
};

const sundayDisabledSettings = JSON.parse(JSON.stringify(sundayEnabledSettings));
sundayDisabledSettings.days.sunday.enabled = false;

const sundaySlots = demoSlots(sundayEnabledSettings, "site_discussion", "2026-05-31", 1);
assert(sundaySlots.some((slot) => slot.day === "sunday"), "Sunday enabled should return Sunday slots.");
assert(sundaySlots[0].approvalRequired === true, "Sunday special approval should come from config.");

const noSundaySlots = demoSlots(sundayDisabledSettings, "site_discussion", "2026-05-31", 1);
assert(!noSundaySlots.some((slot) => slot.day === "sunday"), "Sunday disabled should hide Sunday slots.");

const disabledTypeSlots = demoSlots(sundayEnabledSettings, "quotation_review", "2026-05-31", 1);
assert(disabledTypeSlots.length === 0, "Appointment type settings should control slot availability.");

for (const migration of [
  "profiles",
  "leads",
  "lead_messages",
  "lead_ai_decisions",
  "appointments",
  "appointment_rules",
  "appointment_slots",
  "appointment_holds",
  "followups",
  "approval_requests",
  "client_files",
  "quotation_readiness",
  "audit_logs",
  "settings",
  "message_templates",
  "lead_outcomes"
]) {
  const migrationText = walk(path.join(root, "supabase", "migrations"))
    .filter((file) => file.endsWith(".sql"))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  assert(new RegExp(`create table if not exists\\s+${migration}`, "i").test(migrationText), `Missing migration table: ${migration}`);
}

const allPaths = walk(root);
assert(!allPaths.some((file) => /LIMM_AI_Sales_Agent_v2/i.test(file)), "v2 folder was copied into v3.");
assertNoTrackedOrPackagedGeneratedArtifacts({ root, assert });
assert(!exists(".env"), ".env must not exist in v3 scaffold.");

console.log("PASS: v3 foundation tests passed.");
