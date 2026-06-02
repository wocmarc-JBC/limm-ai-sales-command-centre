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

const leadIntake = read("lib/lead-intake.ts");
const types = read("lib/types.ts");
const leadsRepo = read("lib/data/leads-repository.ts");
const mapper = read("lib/data/mappers.ts");
const actions = read("lib/actions.ts");
const leadDetail = read("app/leads/[id]/page.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const migration = read("supabase/migrations/022_v6_5_smart_lead_intake.sql");
const migrationOrder = read("supabase/MIGRATION_ORDER.md");
const packageJson = read("package.json");

for (const phrase of [
  "buildLeadIntakePlan",
  "MIN_INTAKE_QUESTIONS = 3",
  "MAX_INTAKE_QUESTIONS = 5",
  "lifestyleNotes",
  "occupants",
  "helper",
  "pets",
  "safetyNeeds",
  "budgetExpectation",
  "timeline",
  "keyCollectionDate",
  "moveInDate",
  "meetingReadinessScore",
  "proposalReadinessScore",
  "noPriceReplyRule: true",
  "noCalendarConfirmationRule: true"
]) {
  assert(leadIntake.includes(phrase), `Lead intake brain missing ${phrase}`);
}

assert(types.includes("export interface LeadIntakeProfile"), "LeadIntakeProfile type must exist.");
assert(types.includes("intakeProfile?: LeadIntakeProfile"), "Lead must expose intakeProfile.");
assert(mapper.includes("intake_profile") && mapper.includes("intakeProfile"), "Lead mapper must map intake_profile.");
assert(leadsRepo.includes("updateLeadIntakeProfile"), "Lead repository must expose intake profile update.");
assert(leadsRepo.includes("lead_intake_fields_updated"), "Intake updates must create a dedicated audit action.");
assert(leadsRepo.includes("intake_profile"), "Lead repository must persist intake_profile.");
assert(actions.includes("saveLeadIntakeProfileAction"), "Server action must save lead intake profile.");
assert(actions.includes("suggestedQuestionCount") && actions.includes("intakeTrace"), "Server action must audit intake trace metadata.");

for (const label of [
  "Smart Lead Intake",
  "Meeting prep checklist",
  "Collected intake",
  "Ask only the next useful questions",
  "Budget expectation",
  "Key collection",
  "Move-in date",
  "Save Intake Profile"
]) {
  assert(leadDetail.includes(label), `Lead detail page missing ${label}`);
}

for (const field of [
  'version: "v6_5_smart_lead_intake_meeting_prep"',
  'salesBrainVersion: "v6.5"',
  "smartLeadIntakeAvailable: true",
  "intakeChecklistAvailable: true",
  "missingInfoDetectorAvailable: true",
  "intakeQuestionLimitAvailable: true",
  "lifestyleOccupantsPetsSafetyAvailable: true",
  "budgetExpectationCollectionNoPriceReply: true",
  "timelineKeyMoveInCollectionAvailable: true",
  "meetingReadinessScoreAvailable: true",
  "proposalReadinessScoreAvailable: true",
  "leadIntakeProfileStorageAvailable: true",
  "leadIntakeAuditTraceAvailable: true",
  "openaiWhatsappReplyEnabled",
  "calendarAutoBookingEnabled"
]) {
  assert(health.includes(field), `Health endpoint missing v6.5 proof field: ${field}`);
}

assert(migration.includes("add column if not exists intake_profile jsonb"), "Migration must add intake_profile JSONB safely.");
assert(migration.includes("leads_intake_profile_gin"), "Migration must add intake profile index.");
assert(migrationOrder.includes("022_v6_5_smart_lead_intake.sql"), "Migration order must include 022.");
assert(packageJson.includes('"test:v6.5"'), "package.json must expose v6.5 test.");
assert(packageJson.includes("test:v6.5") && packageJson.includes("verify:all"), "verify:all must include v6.5 test.");

const forbiddenPatterns = [
  /free consultation/i,
  /quote range/i,
  /rough estimate/i,
  /package price/i,
  /\bfrom\s+\$/i,
  /appointment confirmed/i,
  /booked for you/i,
  /calendar auto booking enabled/i
];
const checked = [leadIntake, leadDetail, actions, leadsRepo, health].join("\n");
for (const pattern of forbiddenPatterns) {
  assert(!pattern.test(checked), `Forbidden safety regression found: ${pattern}`);
}

assert(!checked.includes("115395" + "2887800145"), "Wrong WhatsApp Phone Number ID must not be reintroduced.");
assert(!/WHATSAPP_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY/.test(leadDetail), "Lead detail UI must not reference secrets.");

console.log("PASS: v6.5 smart lead intake and meeting prep checks passed.");
