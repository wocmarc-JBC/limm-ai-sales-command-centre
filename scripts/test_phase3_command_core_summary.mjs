import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const commandCore = read("app/command-core/page.tsx");
const leadCard = read("components/LeadCard.tsx");
const summaries = read("lib/data/phase3-summaries-repository.ts");
const readModels = read("lib/phase3-read-models.ts");

assert(commandCore.includes("commandCoreLeadSummaries"), "Command Core must build commandCoreLeadSummaries.");
assert(commandCore.includes("followUpStatus"), "Command Core must show/use follow-up status.");
assert(commandCore.includes("quotationReadinessStatus"), "Command Core must show/use quotation readiness status.");
assert(commandCore.includes("Open WhatsApp Chat") && commandCore.includes("/inbox?lead="), "Command Core must keep direct WhatsApp chat links.");
assert(commandCore.includes("isActiveProductionLeadForDailyScreens"), "Command Core must exclude archived/spam/QA/test lifecycle records.");
assert(commandCore.includes("listLatestLeadMessagesForInbox"), "Command Core latest WhatsApp data must come from lead_messages summary source.");
assert(commandCore.includes("listAllLeadFiles"), "Command Core summaries must include file facts without full history.");

assert(summaries.includes("listLatestLeadMessagesForInbox"), "Summary repository must use latest WhatsApp messages.");
assert(summaries.includes("isActiveProductionLeadForDailyScreens"), "Summary repository must filter production active leads.");
assert(readModels.includes("latestMeaningfulWhatsAppMessage"), "Latest preview must use meaningful WhatsApp message source.");
assert(readModels.includes("latestWhatsappPreview"), "Command summary must include latest WhatsApp preview.");
assert(readModels.includes("quotationReadinessStatus") && readModels.includes("followUpStatus"), "Summary shape must include Phase 3 statuses.");

assert(leadCard.includes("latestWhatsAppPreview"), "Lead cards must preserve real latest WhatsApp message preview.");

console.log("PASS test_phase3_command_core_summary");
