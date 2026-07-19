import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}

const packageJson = JSON.parse(read("package.json"));
const health = read("app/api/whatsapp/health/route.ts");
const shell = read("components/ShellChrome.tsx");
const icons = read("components/AppIcon.tsx");
const inbox = read("components/inbox/MultiChatInbox.tsx");
const inboxPage = read("app/inbox/page.tsx");
const globals = read("app/globals.css");
const tailwind = read("tailwind.config.ts");
const pageHeader = read("components/PageHeader.tsx");
const metricCard = read("components/MetricCard.tsx");

check("publishes the v10.4.0 product-polish release", () => {
  const [major, minor] = packageJson.version.split(".").map(Number);
  assert.ok(major > 10 || (major === 10 && minor >= 4));
  assert.ok(packageJson.scripts["test:v10.4.0"]?.includes("test_command_centre_product_polish.mjs"));
  assert.ok(packageJson.scripts["test:v10.4.0"]?.includes("test:v10.3.0"));
  const currentReleaseTest = packageJson.scripts["test:v11.1.0"] ?? packageJson.scripts["test:v10.6.0"] ?? packageJson.scripts["test:v10.5.0"] ?? "";
  assert.ok(
    packageJson.scripts.verify.includes("test:v11.2.0") || packageJson.scripts.verify.includes("test:v11.1.3") ||
      packageJson.scripts.verify.includes(packageJson.scripts["test:v11.1.0"] ? "test:v11.1.0" : packageJson.scripts["test:v10.6.0"] ? "test:v10.6.0" : "test:v10.5.0")
  );
  if (packageJson.scripts["test:v11.1.0"]) assert.ok(currentReleaseTest.includes("test:v10.6.0"));
  assert.ok(currentReleaseTest.includes("test:v10.6.0") || currentReleaseTest.includes("test:v10.5.0") || currentReleaseTest.includes("test:v10.4.0"));
  assert.ok(packageJson.scripts["test:v10.5.0"]?.includes("test:v10.4.0"));
  for (const marker of [
    "v10_4_0_command_centre_product_polish",
    'uiVersion: "v10.4.0"',
    "commandCentreUnifiedVisualSystemAvailable",
    "commandCentreCompactResponsiveShellAvailable",
    "commandCentreMobileIconNavigationAvailable",
    "commandCentreRouteLoadingErrorStatesAvailable",
    "commandCentreReducedMotionAvailable",
    "inboxKeyboardShortcutsAvailable",
    "inboxRememberedFilterAvailable",
    "inboxAccessibleDetailsFocusTrapAvailable"
  ]) {
    assert.ok(health.includes(marker), `Health marker missing ${marker}.`);
  }
});

check("uses one restrained high-contrast command-centre visual system", () => {
  for (const marker of [
    'panel: "#090E14"',
    'panel2: "#0E151D"',
    'gold: "#DDB35D"',
    'muted: "#CBC0AD"',
    'subtle: "#8F9CAF"'
  ]) {
    assert.ok(tailwind.includes(marker), `Visual token missing ${marker}.`);
  }
  assert.ok(globals.includes(":focus-visible"));
  assert.ok(globals.includes("prefers-reduced-motion: reduce"));
  assert.ok(globals.includes("skeleton-shimmer"));
  assert.ok(globals.includes("-webkit-font-smoothing: antialiased"));
});

check("compresses the shell without sacrificing navigation", () => {
  for (const marker of [
    'const mobileTopPadding = qaE2eMode ? "pt-32" : "pt-20"',
    "lg:ml-56",
    "lg:w-56",
    'data-testid="shell-account-menu"',
    'aria-label="Primary navigation"',
    'aria-label="Mobile navigation"',
    "grid-cols-6",
    'aria-current={active ? "page" : undefined}'
  ]) {
    assert.ok(shell.includes(marker), `Responsive shell marker missing ${marker}.`);
  }
  assert.ok(shell.includes("<AppIcon"));
  assert.ok(icons.includes('name: AppIconName'));
  assert.equal(shell.includes("lg:ml-64"), false);
});

check("provides polished loading, failure and not-found route states", () => {
  for (const file of ["app/loading.tsx", "app/inbox/loading.tsx", "app/error.tsx", "app/not-found.tsx"]) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing.`);
  }
  assert.ok(read("app/inbox/loading.tsx").includes('data-testid="inbox-loading-state"'));
  assert.ok(read("app/error.tsx").includes("No action was completed"));
  assert.ok(read("app/not-found.tsx").includes('href="/inbox"'));
});

check("improves shared information density and responsive actions", () => {
  assert.ok(pageHeader.includes("overflow-x-auto"));
  assert.ok(pageHeader.includes("[&>*]:shrink-0"));
  assert.ok(metricCard.includes("tabular-nums"));
  assert.ok(metricCard.includes("text-3xl"));
  assert.ok(inboxPage.includes("Operator console · newest client activity first"));
  assert.ok(inboxPage.includes("Live"));
});

check("adds keyboard-first inbox navigation and remembers the operator view", () => {
  for (const marker of [
    "INBOX_FILTER_STORAGE_KEY",
    "window.localStorage.getItem",
    "window.localStorage.setItem",
    'key === "/"',
    'key === "j" || key === "k"',
    'key === "n"',
    'key === "r"',
    'key === "d"',
    'aria-keyshortcuts="/"',
    'aria-keyshortcuts="D"',
    "J/K",
    "view remembered"
  ]) {
    assert.ok(inbox.includes(marker), `Inbox shortcut marker missing ${marker}.`);
  }
});

check("keeps the details drawer accessible and returns focus", () => {
  for (const marker of [
    "detailsDrawerRef",
    "previousDrawerFocusRef",
    "focusableSelector",
    'event.key !== "Tab"',
    "returnFocus?.focus()",
    'role="dialog" aria-modal="true"'
  ]) {
    assert.ok(inbox.includes(marker), `Drawer accessibility marker missing ${marker}.`);
  }
});

check("preserves fast latest-first queue and recovery-first spam handling", () => {
  assert.ok(inbox.includes("return sortInboxLatestFirst(chats)"));
  assert.ok(inbox.includes("Latest chat first"));
  assert.ok(inbox.includes('data-testid="inbox-mark-spam"'));
  assert.ok(inbox.includes('data-testid="inbox-bulk-spam-toolbar"'));
  assert.ok(inbox.includes("recoverable from Leads → Show Spam"));
  assert.equal(inbox.includes("hardDeleteLead"), false);
});

check("does not introduce reply-brain or live integration changes into the UI pass", () => {
  for (const secret of ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"]) {
    assert.equal(inbox.includes(secret), false, `Inbox must not reference ${secret}.`);
    assert.equal(shell.includes(secret), false, `Shell must not reference ${secret}.`);
  }
  assert.equal(inbox.includes("priceGuide"), false);
  assert.equal(shell.includes("sendReply"), false);
});

console.log(`PASS: v10.4.0 command-centre product-polish checks passed: ${checks.length}`);
