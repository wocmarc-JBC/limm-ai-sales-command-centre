import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const repository = read("lib/data/phase3-summaries-repository.ts");
const commandCore = read("app/command-core/page.tsx");
const followups = read("app/followups/page.tsx");
const quotation = read("app/quotation-readiness/page.tsx");
const inbox = read("components/inbox/MultiChatInbox.tsx");

assert(repository.includes("listLatestLeadMessagesForInbox"), "Phase 3 summaries must use latest-message summaries.");
assert(repository.includes("listAllLeadFiles"), "Phase 3 summaries must use lightweight file flags.");
assert(!repository.includes("listLeadMessagesPage"), "Phase 3 summary repository must not load full selected message pages.");
assert(!repository.includes("listLeadMessages("), "Phase 3 summary repository must not load full histories.");
assert(!repository.includes("listAuditLogs"), "Phase 3 summaries must not load audit logs.");

assert(commandCore.includes("buildCommandCoreLeadSummary"), "Command Core must build lightweight lead summaries.");
assert(commandCore.includes("commandCoreLeadSummaries"), "Command Core must use summary rows for decision/inspector status.");
assert(commandCore.includes("followUpStatus") && commandCore.includes("quotationReadinessStatus"), "Command Core must expose follow-up and quotation readiness status.");

assert(followups.includes("listFollowUpProtectionSummaries"), "Follow-Ups page must use follow-up summaries.");
assert(!followups.includes("listFollowUpsPage"), "Follow-Ups page must not depend only on stored follow-up rows.");
assert(!followups.includes("listLeadMessagesPage"), "Follow-Ups page must not load full histories.");

assert(quotation.includes("listQuotationReadinessSummaries"), "Quotation page must use readiness summaries.");
assert(!quotation.includes("listQuotationReadinessRows"), "Quotation page must not depend only on stored readiness rows.");
assert(!quotation.includes("listLeadMessagesPage"), "Quotation page must not load full histories.");

assert(inbox.includes("showTechnicalAudit") && inbox.includes("setShowTechnicalAudit(false)"), "Technical audit panels must stay collapsed by default.");
assert(inbox.includes("listLeadMessagesPage(selectedLead.id, 30)") || read("app/inbox/page.tsx").includes("listLeadMessagesPage(selectedLead.id, 30)"), "Inbox selected chat should stay limited to latest 30 messages.");

console.log("PASS test_phase3_read_models_performance");
