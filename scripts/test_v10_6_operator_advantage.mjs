import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function loadTypeScriptCommonJs(relativePath) {
  const compiled = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: relativePath,
    reportDiagnostics: true
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, `TypeScript diagnostics found in ${relativePath}.`);
  const loadedModule = { exports: {} };
  const execute = new Function("require", "module", "exports", compiled.outputText);
  execute(createRequire(import.meta.url), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}

const {
  buildConversationBrief,
  buildOperatorPriorityQueue,
  getOperatorSlaState,
  inboxViewFilterFromParam,
  parseSavedInboxViews,
  saveInboxView
} = loadTypeScriptCommonJs("lib/operator-advantage.ts");

check("models the 60-minute response target deterministically", () => {
  const now = "2026-07-18T12:00:00.000Z";
  assert.equal(getOperatorSlaState({ primaryStatus: "Waiting for Marcus", lastActivityAt: "2026-07-18T11:30:00.000Z" }, now).status, "on-track");
  assert.equal(getOperatorSlaState({ primaryStatus: "New lead", lastActivityAt: "2026-07-18T11:10:00.000Z" }, now).status, "due");
  const breached = getOperatorSlaState({ primaryStatus: "Waiting for Marcus", lastActivityAt: "2026-07-18T10:30:00.000Z" }, now);
  assert.equal(breached.status, "breached");
  assert.equal(breached.ageMinutes, 90);
  assert.match(breached.detail, /60-minute operator target/);
  assert.equal(getOperatorSlaState({ primaryStatus: "Failed send", lastActivityAt: now, failedSend: true }, now).label, "Send failed");
  assert.equal(getOperatorSlaState({ primaryStatus: "Waiting for client", lastActivityAt: now }, now).status, "inactive");
});

check("maps safe command links to supported inbox views", () => {
  assert.equal(inboxViewFilterFromParam("overdue"), "Response overdue");
  assert.equal(inboxViewFilterFromParam("WAITING"), "Waiting for Marcus");
  assert.equal(inboxViewFilterFromParam("unknown"), undefined);
});

check("sanitizes, deduplicates, bounds and restores saved inbox views", () => {
  let views = [];
  views = saveInboxView(views, "Waiting for Marcus", " kitchen   cabinet ");
  views = saveInboxView(views, "Waiting for Marcus", "kitchen cabinet");
  assert.equal(views.length, 1);
  assert.equal(views[0].search, "kitchen cabinet");
  assert.equal(parseSavedInboxViews(JSON.stringify(views))[0].filter, "Waiting for Marcus");
  assert.deepEqual(parseSavedInboxViews("not-json"), []);
  const invalid = JSON.stringify([{ id: "bad", label: "Bad", filter: "Delete everything", search: "" }]);
  assert.deepEqual(parseSavedInboxViews(invalid), []);
  for (let index = 0; index < 8; index += 1) views = saveInboxView(views, "All", `search ${index}`);
  assert.equal(views.length, 5);
});

check("ranks operator work from facts without sending or mutating anything", () => {
  const baseLead = {
    phone: "6590000000",
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-18T10:00:00.000Z",
    deletedAt: null,
    archivedAt: null,
    isSpam: false,
    leadEligible: true,
    bossApprovalNeeded: false,
    needsMarcus: false,
    status: "New Enquiry",
    botPaused: false,
    latestUnansweredQuestion: null,
    riskFlags: [],
    leadCategory: "Warm",
    salesNextAction: "Review",
    aiRecommendedNextAction: "Review"
  };
  const leads = [
    { ...baseLead, id: "normal", clientName: "Normal Lead" },
    {
      ...baseLead,
      id: "critical",
      clientName: "Critical Lead",
      bossApprovalNeeded: true,
      botPaused: true,
      leadCategory: "Hot",
      riskFlags: ["conflict", "complaint"],
      latestUnansweredQuestion: { text: "Can you confirm tomorrow?" }
    },
    { ...baseLead, id: "spam", clientName: "Hidden Spam", isSpam: true }
  ];
  const followUps = [{ leadId: "critical", status: "Overdue", dueAt: "2026-07-17T09:00:00.000Z" }];
  const queue = buildOperatorPriorityQueue(leads, followUps, "2026-07-18T12:00:00.000Z", 5);
  assert.deepEqual(queue.map((item) => item.leadId), ["critical", "normal"]);
  assert.equal(queue[0].urgency, "Critical");
  assert.equal(queue[0].action, "Review with Marcus");
  assert.match(queue[0].reason, /client question remains open/);
  assert.equal(queue[0].href, "/inbox?lead=critical");
});

check("builds a compact operator brief only from persisted lead context and messages", () => {
  const brief = buildConversationBrief({
    lead: {
      riskFlags: ["scope conflict"],
      latestUnansweredQuestion: { text: "Does the quote include hacking?" }
    },
    context: {
      propertyType: "HDB resale",
      scopeSummary: "Kitchen renovation",
      addressOrArea: "Tampines",
      floorPlanStatus: "Received / available",
      sitePhotosStatus: "Not received yet",
      conflictFields: ["budget mismatch"],
      nextAction: "Review floor plan",
      nextReason: "The client supplied the plan."
    },
    messages: [
      { direction: "outbound", body: "I will review this with the team and get back to you.", createdAt: "2026-07-18T10:00:00.000Z" },
      { direction: "inbound", body: "Thanks", createdAt: "2026-07-18T10:01:00.000Z" }
    ]
  });
  assert.match(brief.clientNeed, /HDB resale/);
  assert.match(brief.openQuestion, /include hacking/);
  assert.match(brief.lastCommitment, /get back to you/);
  assert.match(brief.riskSummary, /budget mismatch/);
  assert.equal(brief.nextAction, "Review floor plan");
});

const packageJson = JSON.parse(read("package.json"));
const health = read("app/api/whatsapp/health/route.ts");
const home = read("app/page.tsx");
const inboxPage = read("app/inbox/page.tsx");
const inbox = read("components/inbox/MultiChatInbox.tsx");
const briefComponent = read("components/inbox/InboxOperatorBrief.tsx");
const palette = read("components/CommandPalette.tsx");
const shell = read("components/ShellChrome.tsx");
const actions = read("lib/actions.ts");
const leadsRepository = read("lib/data/leads-repository.ts");
const operatorCommands = read("lib/operator-commands.ts");

check("publishes and chains the v10.6.0 Operator Advantage release", () => {
  const [major, minor] = packageJson.version.split(".").map(Number);
  assert.ok(major > 10 || (major === 10 && minor >= 6));
  assert.ok(packageJson.scripts["test:v10.6.0"]?.includes("test:v10.5.0"));
  assert.ok(packageJson.scripts["test:v10.6.0"]?.includes("test_v10_6_operator_advantage.mjs"));
  assert.ok(packageJson.scripts.verify.includes("test:v10.6.0") || packageJson.scripts.verify.includes("test:v11.1.0") || packageJson.scripts.verify.includes("test:v11.1.3") || packageJson.scripts.verify.includes("test:v11.2.0") || packageJson.scripts.verify.includes("test:v11.3.0") || packageJson.scripts.verify.includes("test:v11.4.0"));
  if (packageJson.scripts.verify.includes("test:v11.1.0") || packageJson.scripts.verify.includes("test:v11.1.3") || packageJson.scripts.verify.includes("test:v11.2.0") || packageJson.scripts.verify.includes("test:v11.3.0") || packageJson.scripts.verify.includes("test:v11.4.0")) {
    assert.ok(packageJson.scripts["test:v11.1.0"]?.includes("test:v10.6.0"));
  }
  assert.ok(packageJson.scripts.build.includes("test_operator_inbox_bundle_budget.mjs"));
  for (const marker of [
    "v10_6_0_operator_advantage",
    'uiVersion: "v10.6.0"',
    "operatorPriorityCockpitAvailable",
    "operatorContextActionPaletteAvailable",
    "operatorConversationBriefAvailable",
    "operatorResponseTargetMinutes: 60",
    "operatorSavedInboxViewsAvailable",
    "operatorSpamUndoAvailable",
    "operatorQueueSyncHealthAvailable",
    "operatorInboxInitialBundleBudgetKb: 140"
  ]) {
    const count = (health.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    const historicalVersionMarker = marker === "v10_6_0_operator_advantage" || marker === 'uiVersion: "v10.6.0"';
    assert.ok(count >= (historicalVersionMarker ? 1 : 2), `Health success/fallback marker missing ${marker}.`);
  }
});

check("puts a ranked, read-only next-action cockpit on the live boss brief", () => {
  for (const marker of [
    "buildOperatorPriorityQueue",
    'data-testid="operator-priority-cockpit"',
    'data-testid="operator-priority-item"',
    "Do this next",
    "No message is sent and no client promise is made here",
    "item.score",
    "item.reason",
    "item.href"
  ]) assert.ok(home.includes(marker), `Priority cockpit marker missing ${marker}.`);
});

check("connects queue links, contextual commands, briefs, saved views and SLA state to the live inbox", () => {
  assert.ok(inboxPage.includes("inboxViewFilterFromParam(searchParams?.view)"));
  for (const marker of [
    "INBOX_VIEW_FILTERS",
    '"Response overdue"',
    "getOperatorSlaState",
    "INBOX_SAVED_VIEWS_STORAGE_KEY",
    "parseSavedInboxViews",
    "saveInboxView",
    'data-testid="inbox-saved-views"',
    'data-testid="inbox-operator-brief"',
    'data-testid="inbox-queue-sync-health"',
    "OPERATOR_COMMAND_EVENT",
    "focus_inbox_reply",
    "open_inbox_details",
    "review_inbox_automation"
  ]) assert.ok(`${inbox}\n${briefComponent}`.includes(marker), `Live inbox operator marker missing ${marker}.`);
  assert.ok(palette.includes("window.dispatchEvent(new CustomEvent(OPERATOR_COMMAND_EVENT"));
  assert.ok(shell.includes("operatorQueueCommandItems"));
  assert.ok(shell.includes('action: "focus_inbox_reply"'));
  assert.ok(operatorCommands.includes('"remove_inbox_spam"'));
});

check("makes spam undo bounded, permission checked, audited and non-destructive", () => {
  const start = actions.indexOf("export async function restoreInboxConversationsAction");
  const end = actions.indexOf("export async function markLeadSpamAction", start);
  const action = actions.slice(start, end);
  for (const marker of [
    ".slice(0, 30)",
    'requirePermission("restore_leads")',
    "await restoreLead(leadId, actor)",
    "await Promise.all(batch.map",
    "revalidateBulkLeadPaths(restoredLeadIds)",
    "restoredLeadIds",
    "failedLeadIds"
  ]) assert.ok(action.includes(marker), `Undo action marker missing ${marker}.`);
  assert.equal(action.includes("hardDeleteLead"), false);
  assert.ok(inbox.includes('data-testid="inbox-spam-undo"'));
  assert.ok(inbox.includes("restoreInboxConversationsAction(leadIds)"));
  assert.ok(inbox.includes("restoreConversationsLocally"));
  assert.ok(leadsRepository.includes('return updateLead(id, { isSpam: true }, "lead_marked_spam"'));
  assert.ok(leadsRepository.includes("restoringLegacySpamClassification"));
  assert.ok(leadsRepository.includes("leadLevel: calculateLeadLevel(restoredLead)"));
  assert.ok(leadsRepository.includes("missionCategory: missionForLead(restoredLead)"));
  assert.ok(leadsRepository.includes("repairedLegacySpamClassification"));
});

check("keeps Operator Advantage outside client reply generation and infrastructure secrets", () => {
  for (const source of [home, briefComponent, shell, palette, operatorCommands, read("lib/operator-advantage.ts")]) {
    for (const forbidden of ["sendReply(", "OPENAI_API_KEY", "WHATSAPP_ACCESS_TOKEN", "SUPABASE_SERVICE_ROLE_KEY", "priceGuide"]) {
      assert.equal(source.includes(forbidden), false, `Operator layer must not include ${forbidden}.`);
    }
  }
});

console.log(`PASS: v10.6.0 Operator Advantage checks passed: ${checks.length}`);
