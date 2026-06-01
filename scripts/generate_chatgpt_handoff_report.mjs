import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = process.env.DEV_BRAIN_RUN_JSON ? JSON.parse(process.env.DEV_BRAIN_RUN_JSON) : null;

const status = data?.status ?? "UNKNOWN";
const authStatus = data?.authTested ? "Authenticated boss browser/write checks ran." : "Authenticated boss checks are MANUAL REQUIRED until test credentials are set.";
const browserStatus = data?.browserCompleted ? "Playwright browser QA completed." : "Playwright browser QA did not complete.";
const openIssues = data?.bugsRemaining?.length ? data.bugsRemaining : ["None known from the latest Dev Brain run."];
const nextAction = data?.nextCodexTask ?? "v6.0 Human-Like WhatsApp Sales Brain is ready for controlled live retest after the health endpoint proves the Vercel deployment. Next recommended phase: observe real WhatsApp traces, then consider a CRM trace viewer or optional AI interpreter behind explicit env flags.";

const report = [
  "# ChatGPT Handoff Report",
  "",
  "## Current Phase",
  "",
  "v6.0 Human-Like WhatsApp Sales Brain implemented on top of the live WhatsApp CRM pipeline.",
  "",
  "## Latest Report",
  "",
  data?.browserReport ? "`DEV_BRAIN_QA_REPORT.md`, `reports/V6_HUMAN_LIKE_SALES_BRAIN_DEEP_QA_REPORT.md`, `docs/V6_HUMAN_LIKE_SALES_BRAIN.md`, `reports/V5_3_2_DEEP_WHATSAPP_AGENT_QA_REPORT.md`, `docs/V5_3_2_DEEP_QA_MEDIA_SINGLISH_VOICE_EMAIL_HANDOFF.md`, `V4_10_WHATSAPP_LIVE_PASS_REPORT.md`, and `V4_3_AUTHENTICATED_BOSS_BROWSER_WRITE_QA_REPORT.md`." : "`DEV_BRAIN_QA_REPORT.md`, `reports/V6_HUMAN_LIKE_SALES_BRAIN_DEEP_QA_REPORT.md`, `docs/V6_HUMAN_LIKE_SALES_BRAIN.md`, `reports/V5_3_2_DEEP_WHATSAPP_AGENT_QA_REPORT.md`, `docs/V5_3_2_DEEP_QA_MEDIA_SINGLISH_VOICE_EMAIL_HANDOFF.md`, and `V4_10_WHATSAPP_LIVE_PASS_REPORT.md`.",
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
  "- v5.3.1 adds multi-intent detection, lead context memory, repeated-info avoidance, and portfolio/Instagram routing.",
  "- v5.3.2 adds deep WhatsApp QA, media/floor-plan context repair, voice fallback without transcription, Singlish intent support with English replies, and server-only handoff email tracing.",
  "- v6.0 adds a Context Truth Gate, Singapore renovation meaning parser, natural reply composer, Safety Governor, Reply Quality Judge, and 150+ case deep QA.",
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
  "We are continuing LIMM AI Sales Command Centre after v6.0 Human-Like WhatsApp Sales Brain.",
  `Latest Dev Brain QA status: ${status}.`,
  browserStatus,
  authStatus,
  "Confirmed live result: inbound WhatsApp received, lead created, lead visible, audit logs written, and WhatsApp auto-reply sent successfully.",
  "v5.3 fixes the live silence issue by changing the old 3-in-10-min auto-reply gate into a warning, then forcing valid client text through the reply coach, safety/quality/repetition gates, and a no-silence fallback.",
  "v5.3.1 improves reply intelligence for multi-question messages, avoids asking again for details already received, and routes portfolio/past-work requests to configured Instagram only.",
  "v5.3.2 fixes media context so floor plan images/documents can prevent repeated floor-plan requests, adds voice fallback without transcription, understands common Singlish-style intent while replying in professional English, and records/sends handoff email alerts to limmwork@gmail.com when configured.",
  "v6.0 improves reply quality with a Context Truth Gate, Singapore renovation shorthand understanding, natural replies, a strict Safety Governor, and a Reply Quality Judge. It specifically blocks over-claimed context and generic route-style replies for normal renovation questions.",
  "OpenAI WhatsApp reply is off by default. Calendar booking and auto booking remain disabled by default. No pricing, quote ranges, blasting, or booking confirmation before event exists.",
  "Please review docs/V6_HUMAN_LIKE_SALES_BRAIN.md and use the health endpoint first before Marcus performs the controlled WhatsApp live retest.",
  "```",
  ""
].join("\n");

fs.writeFileSync(path.join(root, "CHATGPT_HANDOFF_REPORT.md"), report, "utf8");
console.log("Generated CHATGPT_HANDOFF_REPORT.md");
