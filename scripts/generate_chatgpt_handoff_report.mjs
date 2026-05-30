import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = process.env.DEV_BRAIN_RUN_JSON ? JSON.parse(process.env.DEV_BRAIN_RUN_JSON) : null;

const status = data?.status ?? "UNKNOWN";
const authStatus = data?.authTested ? "Authenticated boss browser/write checks ran." : "Authenticated boss checks are MANUAL REQUIRED until test credentials are set.";
const browserStatus = data?.browserCompleted ? "Playwright browser QA completed." : "Playwright browser QA did not complete.";
const openIssues = data?.bugsRemaining?.length ? data.bugsRemaining : ["None known from the latest Dev Brain run."];
const nextAction = data?.nextCodexTask ?? "Deploy the CRM to Vercel, verify WhatsApp health booleans for Marcus-approved live mode, then send one live WhatsApp test message and confirm lead, message, audit, and sent reply logs.";

const report = [
  "# ChatGPT Handoff Report",
  "",
  "## Current Phase",
  "",
  "v4.9 Live Deployment to Vercel + Production Webhook Readiness.",
  "",
  "## Latest Report",
  "",
  data?.browserReport ? "`DEV_BRAIN_QA_REPORT.md`, `V4_9_LIVE_DEPLOYMENT_READINESS_REPORT.md`, `V4_8_WHATSAPP_LIVE_CLOSED_TEST_REPORT.md`, and `V4_3_AUTHENTICATED_BOSS_BROWSER_WRITE_QA_REPORT.md`." : "`DEV_BRAIN_QA_REPORT.md` and `V4_9_LIVE_DEPLOYMENT_READINESS_REPORT.md`.",
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
  "- Client-facing OpenAI brain remains disabled.",
  "- WhatsApp supports closed test mode and Marcus-approved live auto-reply mode behind kill switches.",
  "- Public WhatsApp auto-reply is allowed only for Marcus-approved live mode and remains safety-gated.",
  "- Google Calendar live booking remains disabled.",
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
  "We are continuing LIMM AI Sales Command Centre v4.9 Vercel deployment and production WhatsApp webhook readiness.",
  `Latest Dev Brain QA status: ${status}.`,
  browserStatus,
  authStatus,
  "OpenAI dry-run remains boss-review only. WhatsApp public auto-reply is Marcus-approved for this live number only; Calendar booking and auto pricing are still disabled.",
  "Please review V4_8_WHATSAPP_LIVE_MODE_ENABLE_REPORT.md, VERCEL_DEPLOYMENT_GUIDE.md, and META_WHATSAPP_WEBHOOK_LIVE_SETUP.md, then guide Marcus through Vercel redeployment, health verification, and one live WhatsApp test.",
  "```",
  ""
].join("\n");

fs.writeFileSync(path.join(root, "CHATGPT_HANDOFF_REPORT.md"), report, "utf8");
console.log("Generated CHATGPT_HANDOFF_REPORT.md");
