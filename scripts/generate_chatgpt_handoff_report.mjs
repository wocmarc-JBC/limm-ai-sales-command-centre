import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = process.env.DEV_BRAIN_RUN_JSON ? JSON.parse(process.env.DEV_BRAIN_RUN_JSON) : null;

const status = data?.status ?? "UNKNOWN";
const authStatus = data?.authTested ? "Authenticated boss browser/write checks ran." : "Authenticated boss checks are MANUAL REQUIRED until test credentials are set.";
const browserStatus = data?.browserCompleted ? "Playwright browser QA completed." : "Playwright browser QA did not complete.";
const openIssues = data?.bugsRemaining?.length ? data.bugsRemaining : ["None known from the latest Dev Brain run."];
const nextAction = data?.nextCodexTask ?? "v5 WhatsApp Sales Brain and boss-approved Calendar booking foundation is ready for controlled live testing. Next recommended phase: Marcus live message review and v5.1 tuning if needed.";

const report = [
  "# ChatGPT Handoff Report",
  "",
  "## Current Phase",
  "",
  "v5.0 WhatsApp Sales Brain + boss-approved Calendar booking foundation implemented.",
  "",
  "## Latest Report",
  "",
  data?.browserReport ? "`DEV_BRAIN_QA_REPORT.md`, `V5_0_WHATSAPP_SALES_BRAIN_AND_CALENDAR_FOUNDATION_REPORT.md`, `V4_10_WHATSAPP_LIVE_PASS_REPORT.md`, and `V4_3_AUTHENTICATED_BOSS_BROWSER_WRITE_QA_REPORT.md`." : "`DEV_BRAIN_QA_REPORT.md` and `V5_0_WHATSAPP_SALES_BRAIN_AND_CALENDAR_FOUNDATION_REPORT.md`.",
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
  "We are continuing LIMM AI Sales Command Centre after v5.0 WhatsApp Sales Brain + Calendar foundation.",
  `Latest Dev Brain QA status: ${status}.`,
  browserStatus,
  authStatus,
  "Confirmed live result: inbound WhatsApp received, lead created, lead visible, audit logs written, and WhatsApp auto-reply sent successfully.",
  "v5.0 adds structured WhatsApp reply brain, friendly fallback templates, repetition guard, audit metadata, and boss-approved Calendar booking foundation.",
  "OpenAI WhatsApp reply is off by default. Calendar booking and auto booking remain disabled by default. No pricing, quote ranges, blasting, or booking confirmation before event exists.",
  "Please review V5_0_WHATSAPP_SALES_BRAIN_AND_CALENDAR_FOUNDATION_REPORT.md and propose a v5.1 live observation/tuning pass.",
  "```",
  ""
].join("\n");

fs.writeFileSync(path.join(root, "CHATGPT_HANDOFF_REPORT.md"), report, "utf8");
console.log("Generated CHATGPT_HANDOFF_REPORT.md");
