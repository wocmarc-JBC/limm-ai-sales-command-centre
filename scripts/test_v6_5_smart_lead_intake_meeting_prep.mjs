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
const replyCoach = read("lib/whatsapp-reply-coach.ts");
const naturalComposer = read("lib/whatsapp-v6/natural-reply-composer.ts");
const qualityJudge = read("lib/whatsapp-v6/reply-quality-judge.ts");
const safetyGovernor = read("lib/whatsapp-v6/safety-governor.ts");
const leadContext = read("lib/whatsapp-lead-context.ts");
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
  "APPROVED_GENERAL_INTAKE_MESSAGE",
  "SHORT_EARLY_STAGE_INTAKE_MESSAGE",
  "LIFESTYLE_HOUSEHOLD_INTAKE_MESSAGE",
  "BUDGET_EXPECTATION_WORDING",
  "TIMELINE_KEY_MOVE_IN_QUESTION",
  "PROPOSAL_PREP_QUESTION",
  "composeSmartLeadIntakeMessage",
  "buildSmartLeadIntakeQuestionTopics",
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

for (const phrase of [
  "children, elderly family members, helper or pets",
  "safety, accessibility, storage, work-from-home, hobby, helper or pet-related needs",
  "budget expectation",
  "Final pricing still depends on drawings, site condition and confirmed works.",
  "key collection date, move-in date",
  "must-have items, nice-to-have items",
  "topics.length < MAX_INTAKE_QUESTIONS"
]) {
  assert(leadIntake.includes(phrase), `Lead intake approved wording/rule missing ${phrase}`);
}

for (const phrase of [
  "hasTimeline",
  "hasBudgetExpectation",
  "hasHouseholdInfo",
  "hasSafetyAccessibilityNeeds",
  "hasMustHaveNiceToHave",
  "key collection",
  "move-in",
  "children",
  "helper",
  "pets"
]) {
  assert(leadContext.includes(phrase), `WhatsApp context memory missing ${phrase}`);
}

for (const source of [replyCoach, naturalComposer, qualityJudge, safetyGovernor]) {
  assert(source.includes("SHORT_EARLY_STAGE_INTAKE_MESSAGE") || source.includes("composeSmartLeadIntakeMessage"), "WhatsApp reply path must use smart intake wording.");
}
assert(replyCoach.includes("BUDGET_EXPECTATION_WORDING") && naturalComposer.includes("BUDGET_EXPECTATION_WORDING"), "Price replies must capture budget expectation as planning info only.");
assert(replyCoach.includes("composeSmartIntakeReply(context, \"design_question\"") || replyCoach.includes("composeDesignReply"), "Design replies must ask design/lifestyle prep questions.");
assert(replyCoach.includes("composeSmartIntakeReply(context, \"serious_lead\"") && naturalComposer.includes("composeSmartV6MeetingPrep"), "Serious lead / appointment replies must collect meeting prep context.");

const clientFacingReplySources = [replyCoach, naturalComposer, qualityJudge, safetyGovernor].join("\n");
for (const overlyTechnical of [
  "inter-terrace/corner terrace/semi-D/detached",
  "roofline/drainage/waterproofing/neighbour boundary/access issues",
  "new launch/resale/currently occupied",
  "condo management rules",
  "changing sink/hob position",
  "overlay/waterproofing/fittings replacement",
  "which wall exactly are you hacking",
  "PE/submission/authority issue"
]) {
  assert(!clientFacingReplySources.includes(overlyTechnical), `Overly technical first-contact wording leaked into client-facing reply path: ${overlyTechnical}`);
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
  "meetingPrepBrainAvailable: true",
  "lifestyleIntakeAvailable: true",
  "householdOccupantsIntakeAvailable: true",
  "helperPetsIntakeAvailable: true",
  "safetyAccessibilityIntakeAvailable: true",
  "budgetExpectationCaptureAvailable: true",
  "timelineKeyMoveInCaptureAvailable: true",
  "intakeChecklistAvailable: true",
  "missingInfoDetectorAvailable: true",
  "intakeQuestionLimitAvailable: true",
  "maxFiveQuestionsRuleAvailable: true",
  "noOverlyTechnicalFirstContactQuestions: true",
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
const checked = [leadIntake, leadDetail, actions, leadsRepo, health, replyCoach, naturalComposer, qualityJudge].join("\n");
for (const pattern of forbiddenPatterns) {
  assert(!pattern.test(checked), `Forbidden safety regression found: ${pattern}`);
}

assert(!checked.includes("115395" + "2887800145"), "Wrong WhatsApp Phone Number ID must not be reintroduced.");
assert(!/WHATSAPP_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY/.test(leadDetail), "Lead detail UI must not reference secrets.");

console.log("PASS: v6.5 smart lead intake and meeting prep checks passed.");
