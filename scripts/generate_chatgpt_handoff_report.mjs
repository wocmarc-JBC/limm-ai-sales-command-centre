import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = process.env.DEV_BRAIN_RUN_JSON ? JSON.parse(process.env.DEV_BRAIN_RUN_JSON) : null;

const status = data?.status ?? "UNKNOWN";
const authStatus = data?.authTested ? "Authenticated boss browser/write checks ran." : "Authenticated boss checks are MANUAL REQUIRED until test credentials are set.";
const browserStatus = data?.browserCompleted ? "Playwright browser QA completed." : "Playwright browser QA did not complete.";
const openIssues = data?.bugsRemaining?.length ? data.bugsRemaining : ["None known from the latest Dev Brain run."];
const nextAction = data?.nextCodexTask ?? "v5.3 WhatsApp Reply Coach is ready for controlled live retest after the health endpoint proves the Vercel deployment. Next recommended phase: observe real WhatsApp traces before adding any optional OpenAI WhatsApp reply testing.";

const report = [
  "# ChatGPT Handoff Report",
  "",
  "## Current Phase",
  "",
  "v5.3 WhatsApp Reply Coach + No-Silence Guard implemented on top of the live WhatsApp Sales Brain.",
  "",
  "## Latest Report",
  "",
  data?.browserReport ? "`DEV_BRAIN_QA_REPORT.md`, `V5_3_WHATSAPP_REPLY_COACH_REPORT.md`, `V5_2_WHATSAPP_QUESTION_BANK_REPORT.md`, `V5_0_WHATSAPP_SALES_BRAIN_AND_CALENDAR_FOUNDATION_REPORT.md`, `V4_10_WHATSAPP_LIVE_PASS_REPORT.md`, and `V4_3_AUTHENTICATED_BOSS_BROWSER_WRITE_QA_REPORT.md`." : "`DEV_BRAIN_QA_REPORT.md`, `V5_3_WHATSAPP_REPLY_COACH_REPORT.md`, `V5_2_WHATSAPP_QUESTION_BANK_REPORT.md`, and `V5_0_WHATSAPP_SALES_BRAIN_AND_CALENDAR_FOUNDATION_REPORT.md`.",
  "",
  "## Tests / Audit Status",
  "",
  `Status: ${status}`,
  `Browser QA: ${browserStatus}`,
  "",
  "## Open Issues",
  "",
  ...openIssues.map((issue) => `- ${issue}`),
  "",
  "## Safety Status",
  "",
  "- OpenAI WhatsApp reply is off by default.",
  "- Fallback WhatsApp replies still work without OpenAI.",
  "- v5.2 question bank covers common homeowner questions through structured intents, examples, strategies, safety rules, and reply variations.",
  "- v5.3 adds a central reply decision engine, reply coach, quality gate, no-silence guard, and black box reply trace.",
  "- Question bank replies include non-repetition handling, escalation rules, and audit metadata.",
  "- WhatsApp live inbound and auto-reply are confirmed PASS for Marcus-approved live mode.",
  "- Public WhatsApp auto-reply is allowed only for Marcus-approved live mode and remains safety-gated.",
  "- Google Calendar live booking remains disabled.",
  "- Calendar booking foundation requires boss approval and cannot confirm booking before an event exists.",
  "- Auto pricing and amount ranges remain blocked.",
  "- Review route is development-only and disabled by default unless NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=true.",
  "- Secrets and .env values are not printed.",
  "",
  "## Auth Status",
  "",
  authStatus,
  "",
  "## Browser QA Status",
  "",
  browserStatus,
  data?.browserReport ? `Report: ${data.browserReport}` : "Report: not generated.",
  "",
  "## Next Recommended Action",
  "",
  nextAction,
  "",
  "## Marcus Paste Block For ChatGPT",
  "",
  "```text",
  "We are continuing LIMM AI Sales Command Centre after v5.3 WhatsApp Reply Coach + No-Silence Guard.",
  `Latest Dev Brain QA status: ${status}.`,
  browserStatus,
  authStatus,
  "Confirmed live result: inbound WhatsApp received, lead created, lead visible, audit logs written, and WhatsApp auto-reply sent successfully.",
  "v5.3 fixes the live silence issue by changing the old 3-in-10-min auto-reply gate into a warning, then forcing valid client text through the reply coach, safety/quality/repetition gates, and a no-silence fallback.",
  "OpenAI WhatsApp reply is off by default. Calendar booking and auto booking remain disabled by default. No pricing, quote ranges, blasting, or booking confirmation before event exists.",
  "Please review V5_3_WHATSAPP_REPLY_COACH_REPORT.md and use the health endpoint first before Marcus performs the controlled WhatsApp live retest.",
  "```",
  ""
].join("\n");

fs.writeFileSync(path.join(root, "CHATGPT_HANDOFF_REPORT.md"), report, "utf8");
console.log("Generated CHATGPT_HANDOFF_REPORT.md");
