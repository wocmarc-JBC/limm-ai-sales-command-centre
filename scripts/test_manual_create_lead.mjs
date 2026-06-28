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

const leadsRepo = read("lib/data/leads-repository.ts");
const actions = read("lib/actions.ts");
const newLeadPage = read("app/leads/new/page.tsx");
const leadsPage = read("app/leads/page.tsx");
const leadDetailPage = read("app/leads/[id]/page.tsx");
const systemHealth = read("app/system-health/page.tsx");
const pkg = JSON.parse(read("package.json"));

assert(exists("app/leads/new/page.tsx"), "/leads/new route must exist.");
assert(newLeadPage.includes("Create Manual Lead"), "/leads/new must render the manual create page.");
assert(newLeadPage.includes("createManualLeadAction"), "/leads/new form must post to createManualLeadAction.");
assert(newLeadPage.includes("Use QA production test template"), "/leads/new must include a QA template prefill link.");
assert(newLeadPage.includes("QA_PRODUCTION_TEST_QUOTE_001"), "QA production test template must prefill the requested fake lead name.");
assert(newLeadPage.includes("defaultChecked={values.isTest}"), "QA template must prefill the test/QA checkbox without auto-submit.");
assert(!newLeadPage.includes("useEffect") && !newLeadPage.includes("requestSubmit"), "QA template must not auto-submit.");

assert(leadsPage.includes("href=\"/leads/new\"") && leadsPage.includes("Create Manual Lead"), "/leads page must link to Create Manual Lead.");
assert(systemHealth.includes("href=\"/leads/new?template=qa\"") && systemHealth.includes("Create QA Test Lead"), "System Health must link to the QA test lead template.");
assert(leadDetailPage.includes("manual-lead-created-feedback"), "Lead detail must show manual-create success feedback.");
assert(leadDetailPage.includes("No WhatsApp/email/calendar action was sent."), "Success feedback must confirm no external action was sent.");

for (const phrase of [
  "export type ManualLeadCreateInput",
  "export async function createManualLead",
  "ManualLeadCreateError",
  "Manual lead creation failed in Supabase",
  "throw new ManualLeadCreateError",
  "getMockStore().leads.unshift(lead)",
  "lead_manual_created",
  "manualCreate: true",
  "noWhatsAppSend: true",
  "noEmailSend: true",
  "noCalendarBooking: true",
  "noPriceGuideAutomation: true",
  "isTest ? \"Spam/Test\" : \"Warm Lead\"",
  "isTest ? \"Test/Spam Cleanup\" : \"Sales Follow-Up\"",
  "Manual internal lead created from Command Centre.",
  "Review manually. No WhatsApp/email/calendar action was sent."
]) {
  assert(leadsRepo.includes(phrase), `Manual lead repository missing ${phrase}`);
}

assert(!/handleWhatsAppInboundMessage|upsertWhatsAppLead|WhatsAppCloudApiAdapter/.test(leadsRepo), "Manual lead repository must not use WhatsApp webhook/upsert/send paths.");

for (const phrase of [
  "export async function createManualLeadAction",
  "requirePermission(\"update_leads\")",
  "Missing required fields",
  "createManualLead(",
  "redirect(`/leads/${encodeURIComponent(leadId)}?created=1`)",
  "redirect(`/leads/new?createStatus=failed",
  "listValue(formData, \"risk_flags\")",
  "listValue(formData, \"missing_info\")"
]) {
  assert(actions.includes(phrase), `Manual lead action missing ${phrase}`);
}

assert(!/createManualLeadAction[\s\S]{0,1800}sendManualWhatsAppReplyAction/.test(actions), "Manual lead action must stay separate from WhatsApp send action.");
assert(pkg.scripts.test.includes("test_manual_create_lead.mjs"), "npm run test must include manual create lead tests.");

console.log("PASS: manual create lead route, action, repository, and safety guardrails verified.");
