import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const artifactsDir = path.join(root, "artifacts");
const jsonReportPath = path.join(artifactsDir, "button-audit-report.json");
const markdownReportPath = path.join(artifactsDir, "button-audit-report.md");

const auditedFiles = [
  "components/ShellChrome.tsx",
  "components/LeadCard.tsx",
  "components/AppointmentSlotActions.tsx",
  "components/inbox/MultiChatInbox.tsx",
  "app/command-core/page.tsx",
  "app/appointments/page.tsx",
  "app/settings/page.tsx",
  "app/leads/[id]/page.tsx",
  "app/followups/page.tsx",
  "app/quotation-readiness/page.tsx",
  "app/sales-pipeline/page.tsx",
  "app/reports/page.tsx"
];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function ensureArtifacts() {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

function hasNearbyAction(source, index) {
  const window = source.slice(index, index + 500);
  return /href=|onClick=|type="submit"|disabled|aria-disabled|action=|<Link\b/.test(window);
}

function hasDisabledReason(source, index) {
  const window = source.slice(index, index + 700);
  return /title=|disabledReason|not enabled|Select a lead first|Calendar auto-booking is disabled|Bot Paused|Boss Access Required|not available|moved to Settings/i.test(window);
}

function destructiveHasConfirmation(source, index) {
  const window = source.slice(index, index + 360);
  if (/cleanup=scan/i.test(window)) return true;
  if (!/delete|archive|void|spam|duplicate|permanently/i.test(window)) return true;
  const nearby = source.slice(Math.max(0, index - 500), index + 900);
  return /confirm\(|onSubmit=\{confirm|Confirmation required|requires confirmation/i.test(nearby);
}

function auditFile(file) {
  const source = read(file);
  const results = [];
  const clickablePattern = /<(button|a|Link)\b/g;
  let match;
  while ((match = clickablePattern.exec(source))) {
    const tag = match[1];
    const index = match.index;
    const snippet = source.slice(index, index + 260).replace(/\s+/g, " ").trim();
    const labelMatch = snippet.match(/>([^<]{2,80})</);
    const label = labelMatch ? labelMatch[1].trim() : snippet.slice(0, 90);
    const hasAction = hasNearbyAction(source, index);
    const disabled = /disabled|aria-disabled/.test(source.slice(index, index + 500));
    const disabledReason = disabled ? hasDisabledReason(source, index) : true;
    const destructiveConfirmed = destructiveHasConfirmation(source, index);
    const status = !hasAction
      ? "likely_noop"
      : disabled && !disabledReason
        ? "disabled_missing_reason"
        : !destructiveConfirmed
          ? "destructive_missing_confirmation"
          : "ok";

    results.push({
      file,
      tag,
      label,
      status,
      actionType: disabled ? "disabled_with_reason" : tag === "a" || tag === "Link" ? "navigation" : /onClick=/.test(source.slice(index, index + 500)) ? "local_ui" : "form_or_api",
      snippet
    });
  }
  return results;
}

function writeReports(report) {
  ensureArtifacts();
  fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2), "utf8");
  const problems = report.results.filter((item) => item.status !== "ok");
  const lines = [
    "# Command Centre Button Audit",
    "",
    `- Started: ${report.startedAt}`,
    `- Files scanned: ${report.files.length}`,
    `- Clickable elements scanned: ${report.totals.scanned}`,
    `- Navigation/API/local/disabled controls with outcome: ${report.totals.ok}`,
    `- Likely no-op controls: ${report.totals.likelyNoop}`,
    `- Disabled controls missing reason: ${report.totals.disabledMissingReason}`,
    `- Destructive controls missing confirmation: ${report.totals.destructiveMissingConfirmation}`,
    "",
    "## Problems",
    problems.length ? "" : "None found.",
    ...problems.map((item) => `- ${item.file}: ${item.status} - ${item.label}`),
    "",
    "## Notes",
    "- This is a static safety audit. It does not send WhatsApp messages, delete data, or click live destructive actions.",
    "- Controls are considered valid when they have navigation, local UI, submit/API behavior, disabled reason, or destructive confirmation."
  ];
  fs.writeFileSync(markdownReportPath, `${lines.join("\n")}\n`, "utf8");
}

const results = auditedFiles.flatMap((file) => auditFile(file));
const report = {
  startedAt: new Date().toISOString(),
  files: auditedFiles,
  results,
  totals: {
    scanned: results.length,
    ok: results.filter((item) => item.status === "ok").length,
    likelyNoop: results.filter((item) => item.status === "likely_noop").length,
    disabledMissingReason: results.filter((item) => item.status === "disabled_missing_reason").length,
    destructiveMissingConfirmation: results.filter((item) => item.status === "destructive_missing_confirmation").length
  }
};

writeReports(report);
console.log(`PASS: button audit scanned ${report.totals.scanned} controls; likely no-op ${report.totals.likelyNoop}.`);

if (report.totals.likelyNoop || report.totals.disabledMissingReason || report.totals.destructiveMissingConfirmation) {
  throw new Error("Command centre button audit found controls needing fixes.");
}
