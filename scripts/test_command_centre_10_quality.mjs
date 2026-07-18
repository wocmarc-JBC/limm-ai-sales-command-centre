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
const authGate = read("components/auth/AuthGate.tsx");
const palette = read("components/CommandPalette.tsx");
const pageHeader = read("components/PageHeader.tsx");
const commandCorePage = read("app/command-core/page.tsx");
const deferredMap = read("components/command-core/CommandCoreMissionMap.tsx");
const inbox = read("components/inbox/MultiChatInbox.tsx");
const leadCard = read("components/LeadCard.tsx");
const salesPipeline = read("app/sales-pipeline/page.tsx");
const collectionQueue = read("app/sales-collection/page.tsx");

check("preserves the v10.5.0 measurable quality release in later versions", () => {
  const [major, minor] = packageJson.version.split(".").map(Number);
  assert.ok(major > 10 || (major === 10 && minor >= 5));
  assert.ok(packageJson.scripts["test:v10.5.0"]?.includes("test:v10.4.0"));
  assert.ok(packageJson.scripts["test:v10.5.0"]?.includes("test_command_centre_10_quality.mjs"));
  const currentReleaseTest = packageJson.scripts["test:v11.1.0"] ?? packageJson.scripts["test:v10.6.0"] ?? packageJson.scripts["test:v10.5.0"] ?? "";
  assert.ok(packageJson.scripts.verify.includes(packageJson.scripts["test:v11.1.0"] ? "test:v11.1.0" : packageJson.scripts["test:v10.6.0"] ? "test:v10.6.0" : "test:v10.5.0"));
  if (packageJson.scripts["test:v11.1.0"]) assert.ok(currentReleaseTest.includes("test:v10.6.0"));
  assert.ok(currentReleaseTest.includes("test:v10.6.0") || currentReleaseTest.includes("test:v10.5.0") || currentReleaseTest.includes("test:v10.4.0"));
  assert.ok(packageJson.scripts.build.includes("test_command_core_bundle_budget.mjs"));
  for (const marker of [
    "v10_5_0_command_centre_10_quality",
    'uiVersion: "v10.5.0"',
    "commandCentreGlobalCommandPaletteAvailable",
    "commandCentreSkipNavigationAvailable",
    "commandCentreSemanticHeadingHierarchyAvailable",
    "commandCoreDeferredMapBundleAvailable",
    "commandCoreInitialBundleBudgetKb",
    "commandCentreCrossRouteAccessibilityGateAvailable",
    "commandCentreUnauthenticatedAccessibilityAvailable",
    "duplicatePrioritySignalsSuppressedAvailable",
    "collectionQueueOverflowContainedAvailable"
  ]) {
    assert.ok(health.includes(marker), `Health marker missing ${marker}.`);
  }
});

check("gives every protected route a semantic page heading and skip target", () => {
  assert.ok(pageHeader.includes("<h1"));
  assert.equal(pageHeader.includes("<h2"), false);
  assert.ok(shell.includes('href="#main-content"'));
  assert.ok(shell.includes("Skip to main content"));
  assert.ok(shell.includes('id="main-content" tabIndex={-1}'));
  assert.equal(/<h1[^>]*>Mission Control<\/h1>/.test(shell), false);
  assert.ok(authGate.includes('<main id="main-content" tabIndex={-1}'));
  assert.ok(authGate.includes('<h1 className="mt-2 text-2xl font-semibold">Login required</h1>'));
  assert.equal(authGate.includes('<h2 className="mt-2 text-2xl font-semibold">Login required</h2>'), false);
});

check("provides a discoverable global keyboard command palette", () => {
  for (const marker of [
    'aria-label="Open command palette"',
    'aria-keyshortcuts="Meta+K Control+K"',
    'event.key.toLowerCase() !== "k"',
    "event.metaKey",
    "event.ctrlKey",
    "commandPaletteItems",
    "Create Manual Lead",
    "System Health"
  ]) {
    assert.ok(shell.includes(marker), `Shell command marker missing ${marker}.`);
  }
  assert.ok((shell.match(/href:/g) ?? []).length >= 25, "Command palette must cover the full operator navigation surface.");
});

check("keeps command navigation accessible and focus-safe", () => {
  for (const marker of [
    'role="dialog"',
    'aria-modal="true"',
    'role="combobox"',
    'role="listbox"',
    'role="option"',
    'event.key === "Escape"',
    'event.key === "Tab"',
    'event.key === "ArrowDown"',
    'event.key === "ArrowUp"',
    "triggerRef.current?.focus()",
    "document.body.style.overflow = \"hidden\"",
    "router.push(item.href)"
  ]) {
    assert.ok(palette.includes(marker), `Command palette accessibility marker missing ${marker}.`);
  }
});

check("defers the heavy Singapore map outside the initial Command Core bundle", () => {
  assert.ok(commandCorePage.includes("CommandCoreMissionMap"));
  assert.equal(commandCorePage.includes('from "@/components/SingaporeMissionMap"'), false);
  assert.ok(deferredMap.includes('dynamic('));
  assert.ok(deferredMap.includes('ssr: false'));
  assert.ok(deferredMap.includes('data-testid="command-core-map-loading"'));
  assert.ok(deferredMap.includes('import("@/components/SingaporeMissionMap")'));
  assert.ok(fs.statSync(path.join(root, "lib/singapore-map-data.json")).size > 3_000_000);
});

check("keeps the map loading state stable and reduced-motion compatible", () => {
  assert.ok(deferredMap.includes("min-h-[34rem]"));
  assert.ok(deferredMap.includes("md:min-h-[42rem]"));
  assert.ok(deferredMap.includes('role="status"'));
  assert.ok(read("app/globals.css").includes("prefers-reduced-motion: reduce"));
});

check("preserves the complete inbox speed and safety experience", () => {
  for (const marker of [
    "sortInboxLatestFirst",
    "INBOX_FILTER_STORAGE_KEY",
    'key === "j" || key === "k"',
    'data-testid="inbox-mark-spam"',
    'data-testid="inbox-bulk-spam-toolbar"',
    "recoverable from Leads → Show Spam",
    "detailsDrawerRef"
  ]) {
    assert.ok(inbox.includes(marker), `Inbox quality marker missing ${marker}.`);
  }
});

check("keeps repeated operational signals and wide money tables layout-safe", () => {
  assert.ok(leadCard.includes("[...new Set(["));
  assert.ok(salesPipeline.includes("[...new Set(["));
  assert.ok(collectionQueue.includes("2xl:grid-cols-[20rem_minmax(0,1fr)]"));
  assert.ok(collectionQueue.includes('className="mission-panel min-w-0 rounded-2xl p-5"'));
  assert.ok(collectionQueue.includes("overflow-x-auto"));
});

check("does not expand the release into client messaging or infrastructure", () => {
  for (const source of [shell, palette, deferredMap]) {
    for (const forbidden of ["sendReply(", "WHATSAPP_ACCESS_TOKEN", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "priceGuide"]) {
      assert.equal(source.includes(forbidden), false, `UI quality code must not include ${forbidden}.`);
    }
  }
});

console.log(`PASS: v10.5.0 Command Centre 10-quality checks passed: ${checks.length}`);
