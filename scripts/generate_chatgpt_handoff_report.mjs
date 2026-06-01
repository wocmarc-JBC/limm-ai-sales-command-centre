import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = process.env.DEV_BRAIN_RUN_JSON ? JSON.parse(process.env.DEV_BRAIN_RUN_JSON) : null;

const status = data?.status ?? "UNKNOWN";
const authStatus = data?.authTested ? "Authenticated boss browser/write checks ran." : "Authenticated boss checks are MANUAL REQUIRED until test credentials are set.";
const browserStatus = data?.browserCompleted ? "Playwright browser QA completed." : "Playwright browser QA did not complete.";
const openIssues = data?.bugsRemaining?.length ? data.bugsRemaining : ["None known from the latest Dev Brain run."];
const nextAction = data?.nextCodexTask ?? "v6.1.8 Dashboard compression and Mission Radar polish is ready for controlled deploy proof after the health endpoint shows v6_1_8_dashboard_compression_zero_state_polish. Next recommended phase: visually verify sidebar scrolling, Mission Radar counts/action, Focus Mode, lead cards, Client Files, and Follow-Up Queue speed.";

const report = [
  "# ChatGPT Handoff Report",
  "",
  "## Current Phase",
  "",
  "v6.1 UI Polish + Test Lead Cleanup implemented on top of the v6 Ultimate live WhatsApp CRM pipeline.",
  "",
  "## Latest Report",
  "",
  data?.browserReport ? "`DEV_BRAIN_QA_REPORT.md`, `reports/V6_1_TEST_LEAD_CLEANUP_REPORT.md`, `reports/V6_ULTIMATE_DEEP_QA_REPORT.md`, `docs/V6_1_UI_POLISH_TEST_CLEANUP.md`, `docs/V6_ULTIMATE_SALES_COMMAND_CENTRE.md`, `docs/V6_ULTIMATE_BLUEPRINT.md`, `reports/V6_HUMAN_LIKE_SALES_BRAIN_DEEP_QA_REPORT.md`, `reports/V5_3_2_DEEP_WHATSAPP_AGENT_QA_REPORT.md`, `V4_10_WHATSAPP_LIVE_PASS_REPORT.md`, and `V4_3_AUTHENTICATED_BOSS_BROWSER_WRITE_QA_REPORT.md`." : "`DEV_BRAIN_QA_REPORT.md`, `reports/V6_1_TEST_LEAD_CLEANUP_REPORT.md`, `reports/V6_ULTIMATE_DEEP_QA_REPORT.md`, `docs/V6_1_UI_POLISH_TEST_CLEANUP.md`, `docs/V6_ULTIMATE_SALES_COMMAND_CENTRE.md`, `docs/V6_ULTIMATE_BLUEPRINT.md`, `reports/V6_HUMAN_LIKE_SALES_BRAIN_DEEP_QA_REPORT.md`, and `V4_10_WHATSAPP_LIVE_PASS_REPORT.md`.",
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
  "- v6 Ultimate adds safe cleanup, soft delete/restore, boss/admin hard-delete gating, human takeover, bot pause/resume, mission queue, lead scoring, follow-up reminders, role permissions, settings proof, gold command centre UI, QA centre, sales learning foundation, and quotation readiness foundation.",
  "- v6.1 polishes the premium command centre colour palette, increases readability, improves dashboard/lead/settings/report UX, and adds a dry-run-first old test lead cleanup script.",
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
  "We are continuing LIMM AI Sales Command Centre after v6.1 UI Polish + Test Lead Cleanup.",
  `Latest Dev Brain QA status: ${status}.`,
  browserStatus,
  authStatus,
  "Confirmed live result: inbound WhatsApp received, lead created, lead visible, audit logs written, and WhatsApp auto-reply sent successfully.",
  "v5.3 fixes the live silence issue by changing the old 3-in-10-min auto-reply gate into a warning, then forcing valid client text through the reply coach, safety/quality/repetition gates, and a no-silence fallback.",
  "v5.3.1 improves reply intelligence for multi-question messages, avoids asking again for details already received, and routes portfolio/past-work requests to configured Instagram only.",
  "v5.3.2 fixes media context so floor plan images/documents can prevent repeated floor-plan requests, adds voice fallback without transcription, understands common Singlish-style intent while replying in professional English, and records/sends handoff email alerts to limmwork@gmail.com when configured.",
  "v6.0 improves reply quality with a Context Truth Gate, Singapore renovation shorthand understanding, natural replies, a strict Safety Governor, and a Reply Quality Judge. It specifically blocks over-claimed context and generic route-style replies for normal renovation questions.",
  "v6 Ultimate adds soft delete/restore/hard-delete safety, human takeover/bot pause, lead scoring, mission queue, settings/QA centre, gold command centre UI, sales learning foundation, weekly boss report draft foundation, and quotation/site visit readiness foundation.",
  "v6.1 adds premium UI/readability polish and a safe old test-lead cleanup workflow. Cleanup dry-run is default; apply requires --apply; hard delete remains explicit, boss/admin-only in app logic, and only for already-soft-deleted test data.",
  "OpenAI WhatsApp reply is off by default. Calendar booking and auto booking remain disabled by default. No pricing, quote ranges, blasting, or booking confirmation before event exists.",
  "Please review docs/V6_ULTIMATE_SALES_COMMAND_CENTRE.md and use the health endpoint first before Marcus performs the controlled WhatsApp live retest.",
  "```",
  ""
].join("\n");

fs.writeFileSync(path.join(root, "CHATGPT_HANDOFF_REPORT.md"), report, "utf8");
console.log("Generated CHATGPT_HANDOFF_REPORT.md");
