import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

function assertIncludes(source, phrase, label) {
  assert(source.includes(phrase), `${label} missing ${phrase}`);
}

function assertNotIncludes(source, phrase, label) {
  assert(!source.includes(phrase), `${label} must not include ${phrase}`);
}

function assertNoProductionFacingWording(source, label) {
  const stringLiterals = source.match(/(["'`])(?:(?!\1)[\s\S])*?\1/g) ?? [];
  const renderedText = stringLiterals.join("\n");
  for (const phrase of [
    "test lead",
    "internal lead",
    "QA lead",
    "browser QA",
    "TEST_ONLY",
    "dummy lead",
    "seed record",
    "beta dashboard"
  ]) {
    assertNotIncludes(renderedText.toLowerCase(), phrase.toLowerCase(), `${label} production wording`);
  }
}

const home = read("app/page.tsx");
const dashboard = read("app/dashboard/page.tsx");
const shell = read("components/ShellChrome.tsx");
const commandCore = read("app/command-core/page.tsx");
const inboxPage = read("app/inbox/page.tsx");
const inboxClient = read("components/inbox/MultiChatInbox.tsx");
const leadCard = read("components/LeadCard.tsx");
const leadMessagesRepo = read("lib/data/lead-messages-repository.ts");
const lifecycle = read("lib/production-lead-lifecycle.ts");
const missionMap = read("lib/mission-map.ts");
const followups = read("app/followups/page.tsx");
const quotation = read("app/quotation-readiness/page.tsx");
const quotationActions = read("components/QuotationReadinessGateActions.tsx");
const qaCentre = read("app/qa-centre/page.tsx");
const replyQuality = read("scripts/test_reply_quality_scoreboard.mjs");
const buttonAudit = read("scripts/audit_command_centre_buttons.mjs");

assert(/redirect\("\/command-core"\)/.test(home), "Home must redirect to /command-core.");
assert(/redirect\("\/command-core"\)/.test(dashboard), "/dashboard must redirect to /command-core.");

for (const item of [
  'href: "/command-core", label: "Command Core"',
  'href: "/inbox", label: "WhatsApp Inbox"',
  'href: "/followups", label: "Follow-Ups"',
  'href: "/appointments", label: "Appointments"',
  'href: "/quotation-readiness", label: "Quotation Review"',
  'href: "/sales-pipeline", label: "Sales Pipeline"',
  'href: "/reports", label: "Boss Report"',
  'href: "/settings", label: "Settings"'
]) {
  assertIncludes(shell, item, "clean sidebar");
}
assertNotIncludes(shell, 'href: "/dashboard"', "clean sidebar");
assertNotIncludes(shell, "AI Lead Inbox", "clean sidebar");

for (const [source, label] of [
  [commandCore, "Command Core"],
  [inboxPage, "Inbox page"],
  [inboxClient, "Inbox client"],
  [followups, "Follow-Ups"],
  [quotation, "Quotation Review"]
]) {
  assertNoProductionFacingWording(source, label);
}

assertIncludes(commandCore, "isActiveProductionLeadForDailyScreens", "Command Core production lifecycle filter");
assertIncludes(inboxPage, "isActiveProductionLeadForDailyScreens", "Inbox production lifecycle filter");
assertIncludes(lifecycle, "getProductionLeadLifecycle", "production lifecycle filter");
assertIncludes(lifecycle, "qa_test", "production lifecycle filter can classify QA seeds outside live screens");

assertIncludes(commandCore, "listLatestLeadMessagesForInbox", "Command Core latest WhatsApp source");
assertIncludes(commandCore, "buildLeadFacts", "Command Core Lead Facts usage");
assertIncludes(commandCore, "buildSingaporeMissionMapData", "Command Core Mission Map usage");
assertIncludes(leadMessagesRepo, 'eq("channel", "whatsapp")', "latest WhatsApp repository");
assertIncludes(leadMessagesRepo, "listLatestMeaningfulWhatsAppMessagesForLeads", "latest WhatsApp repository");
assertIncludes(leadCard, "latestWhatsAppMessage", "LeadCard latest WhatsApp prop");
assertIncludes(leadCard, "Last WhatsApp message", "LeadCard latest WhatsApp label");
assertIncludes(leadCard, "Open WhatsApp Chat", "LeadCard WhatsApp action");
assert(/\/inbox\?lead=\$\{encodeURIComponent\(lead\.id\)\}/.test(leadCard), "LeadCard must open /inbox?lead=<leadId>.");
assertIncludes(commandCore, "Open WhatsApp Chat", "Command Core WhatsApp action");
assert(/\/inbox\?lead=\$\{[^}]+\.id\}/.test(commandCore), "Command Core must link lead actions to /inbox?lead=<leadId>.");

assertIncludes(inboxPage, "listLeadMessagesPage(selectedLead.id, 30)", "Inbox selected conversation latest 30 load");
assertIncludes(inboxClient, "Latest messages", "Inbox latest-first label");
assertIncludes(inboxClient, "Load older messages", "Inbox older message control");
assertIncludes(inboxClient, 'fetch("/api/inbox/send"', "Inbox JSON send API");
assertIncludes(inboxClient, "clientTempId", "Inbox replay-safe optimistic send");
assertIncludes(inboxClient, "SEND_TIMEOUT_MS = 15000", "Inbox send timeout protection");
assertIncludes(inboxClient, "Next waiting chat", "Inbox next waiting action");
assert(!/formAction|sendManualWhatsApp/.test(inboxClient), "Inbox daily send path must not use legacy redirect/server-action path.");
assertIncludes(inboxClient, "isLegacyRedirectFailure", "Inbox must suppress legacy NEXT_REDIRECT failed-bubble display.");

assertIncludes(followups, "listFollowUpProtectionSummaries", "Follow-Ups read model");
assertIncludes(followups, "Open WhatsApp Chat", "Follow-Ups direct chat action");
assertIncludes(followups, "No auto follow-up messages are sent.", "Follow-Ups safety note");

assertIncludes(quotation, "QuotationReadinessGateActions", "Quotation readiness guarded action");
assertIncludes(quotation, "No price generation", "Quotation readiness safety banner");
assertIncludes(quotation, "never generates quotation amounts", "Quotation readiness safety copy");
assertIncludes(quotationActions, "disabled={!canMove || pending}", "Quotation move disabled unless ready");
assert(!/from \$|around \$|package price|price range|quote range/i.test(quotation), "Quotation page must not show pricing/range wording.");

assertIncludes(missionMap, "buildLeadFacts", "Mission Map must use Lead Facts.");
assertIncludes(missionMap, "locationStatus", "Mission Map must use Lead Facts location status.");

assertIncludes(qaCentre, "Simulation only", "QA Centre simulation copy");
assertIncludes(qaCentre, "No WhatsApp message will be sent.", "QA Centre simulation copy");
assertIncludes(qaCentre, "never calls the Meta send adapter", "QA Centre send safety copy");
assert(!/Send WhatsApp|fetch\("\/api\/inbox\/send"|adapter\.sendReply|sendWhatsAppTextMessage/.test(qaCentre), "QA Centre must not expose live send.");
for (const phrase of [
  "Hi scores PASS >= 90",
  "Hello scores PASS >= 90",
  "Are you there scores PASS >= 90",
  "Chinese greeting scores PASS >= 90",
  "Image-only scores PASS >= 90"
]) {
  assertIncludes(replyQuality, phrase, "reply quality scenario pack guard");
}
assertIncludes(replyQuality, "Banned phrases are detected", "reply quality banned phrase guard");

assertIncludes(buttonAudit, "likely_noop", "button audit no-op detection");
assertIncludes(buttonAudit, "destructive_missing_confirmation", "button audit destructive confirmation detection");
assertIncludes(buttonAudit, "disabled_missing_reason", "button audit disabled reason detection");

const clientUiBundle = [
  commandCore,
  inboxPage,
  inboxClient,
  leadCard,
  followups,
  quotation,
  qaCentre,
  shell
].join("\n");
for (const secret of [
  "WHATSAPP_ACCESS_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "SMTP_PASSWORD"
]) {
  assert(!clientUiBundle.includes(secret), `Client UI must not expose ${secret}.`);
}
for (const unsafe of [
  "auto-pricing",
  "auto quotation",
  "calendar auto-booking enabled",
  "voice transcription enabled",
  "hard delete live"
]) {
  assert(!clientUiBundle.toLowerCase().includes(unsafe), `Client UI must not expose unsafe production behavior: ${unsafe}.`);
}

console.log("PASS: Phase 5 production readiness static test passed.");
