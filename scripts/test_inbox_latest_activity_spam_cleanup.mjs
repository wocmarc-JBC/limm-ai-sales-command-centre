import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function loadTypeScriptCommonJs(relativePath) {
  const compiled = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: relativePath,
    reportDiagnostics: true
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, `TypeScript diagnostics found in ${relativePath}.`);
  const loadedModule = { exports: {} };
  const execute = new Function("require", "module", "exports", compiled.outputText);
  execute(createRequire(import.meta.url), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const checks = [];
function check(name, fn) {
  fn();
  checks.push(name);
}

const { compareInboxLatestActivity, sortInboxLatestFirst } = loadTypeScriptCommonJs("lib/inbox-conversation-order.ts");

check("sorts every conversation strictly by latest activity", () => {
  const input = [
    { id: "old-waiting", lastActivityAt: "2026-07-01T08:00:00.000Z", primaryStatus: "Waiting for Marcus" },
    { id: "new-bot", lastActivityAt: "2026-07-18T08:00:00.000Z", primaryStatus: "Bot active" },
    { id: "middle-failed", lastActivityAt: "2026-07-12T08:00:00.000Z", primaryStatus: "Failed send" }
  ];
  assert.deepEqual(sortInboxLatestFirst(input).map((item) => item.id), ["new-bot", "middle-failed", "old-waiting"]);
});

check("keeps the oldest conversation at the bottom", () => {
  const sorted = sortInboxLatestFirst([
    { id: "middle", lastActivityAt: "2026-07-10T00:00:00.000Z" },
    { id: "oldest", lastActivityAt: "2025-01-01T00:00:00.000Z" },
    { id: "latest", lastActivityAt: "2026-07-18T00:00:00.000Z" }
  ]);
  assert.equal(sorted.at(-1)?.id, "oldest");
});

check("uses deterministic id ordering for equal timestamps", () => {
  const at = "2026-07-18T08:00:00.000Z";
  assert.ok(compareInboxLatestActivity({ id: "a", lastActivityAt: at }, { id: "b", lastActivityAt: at }) < 0);
});

check("moves invalid activity timestamps behind real chat activity", () => {
  const sorted = sortInboxLatestFirst([
    { id: "invalid", lastActivityAt: "not-a-date" },
    { id: "valid", lastActivityAt: "2026-07-18T08:00:00.000Z" }
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ["valid", "invalid"]);
});

check("sorting does not mutate caller state", () => {
  const input = [
    { id: "old", lastActivityAt: "2026-01-01T00:00:00.000Z" },
    { id: "new", lastActivityAt: "2026-02-01T00:00:00.000Z" }
  ];
  sortInboxLatestFirst(input);
  assert.deepEqual(input.map((item) => item.id), ["old", "new"]);
});

const inboxPage = read("app/inbox/page.tsx");
const conversationsApi = read("app/api/inbox/conversations/route.ts");
const inboxClient = read("components/inbox/MultiChatInbox.tsx");
const actions = read("lib/actions.ts");
const leadsRepository = read("lib/data/leads-repository.ts");
const health = read("app/api/whatsapp/health/route.ts");
const packageJson = JSON.parse(read("package.json"));

check("server page orders the complete active pool before limiting it", () => {
  const poolStart = inboxPage.indexOf("const activeLeadPool");
  const poolSort = inboxPage.indexOf(".sort((a, b) => compareInboxLatestActivity(", poolStart);
  const poolLimit = inboxPage.indexOf("activeLeadPool.slice(0, 30)", poolStart);
  assert.ok(poolStart >= 0 && poolSort > poolStart && poolLimit > poolSort);
  assert.ok(inboxPage.includes(".sort((a, b) => compareInboxLatestActivity(a.summary, b.summary))"));
});

check("polling API orders by message activity before taking 30 rows", () => {
  const activeStart = conversationsApi.indexOf("const activeLeads");
  const sortIndex = conversationsApi.indexOf(".sort((a, b) => compareInboxLatestActivity(", activeStart);
  const sliceIndex = conversationsApi.indexOf(".slice(0, 30)", activeStart);
  assert.ok(activeStart >= 0 && sortIndex > activeStart && sliceIndex > sortIndex);
  assert.ok(conversationsApi.includes(".sort(compareInboxLatestActivity)"));
});

check("client state uses the same strict latest-first comparator", () => {
  assert.ok(inboxClient.includes("return sortInboxLatestFirst(chats)"));
  assert.equal(inboxClient.includes("inboxQueuePriority"), false);
  assert.ok(inboxClient.includes("Newest client activity stays at the top."));
  assert.ok(inboxClient.includes("Latest chat first"));
});

check("quick spam removal is permission-gated and audited through the repository", () => {
  const actionStart = actions.indexOf("export async function markInboxConversationSpamAction");
  const actionEnd = actions.indexOf("export async function markLeadSpamAction", actionStart);
  const action = actions.slice(actionStart, actionEnd);
  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  assert.ok(action.includes('requirePermission("soft_delete_leads")'));
  assert.ok(action.includes("await markLeadAsSpam(leadId)"));
  assert.ok(action.includes("revalidateLeadPaths(leadId)"));
  assert.equal(action.includes("hardDeleteLead"), false);
  assert.ok(leadsRepository.includes('"lead_marked_spam"'));
});

check("spam cleanup is recoverable instead of a permanent delete", () => {
  assert.ok(leadsRepository.includes("isSpam: true"));
  assert.ok(leadsRepository.includes("isSpam: false"));
  assert.ok(inboxClient.includes("recoverable from Leads → Show Spam"));
  assert.ok(inboxClient.includes("withoutRecordKeys(current, removed)"));
});

check("boss and admin see fast spam controls in both queue and active chat", () => {
  assert.ok(inboxPage.includes('can(auth.profile.role, "soft_delete_leads")'));
  assert.ok(inboxPage.includes("canManageSpam={canManageSpam}"));
  assert.ok(inboxClient.includes("onMarkSpam={markConversationSpam}"));
  assert.ok(inboxClient.includes('aria-label={`Remove ${chat.displayName || chat.phone} as spam`}'));
  assert.ok(inboxClient.includes("Remove spam"));
});

check("removing the active spam chat preserves operator continuity", () => {
  assert.ok(inboxClient.includes("const remaining = ordered.filter"));
  assert.ok(inboxClient.includes("const nextLeadId = remaining[nextIndex]?.id ?? \"\""));
  assert.ok(inboxClient.includes("window.history.replaceState"));
});

check("desktop panes use bounded independent scrolling and start chat-focused", () => {
  assert.ok(inboxClient.includes('useState(false)'));
  assert.ok(inboxClient.includes("lg:h-[calc(100dvh-8.5rem)]"));
  assert.ok(inboxClient.includes('data-testid="inbox-details-drawer"'));
  assert.ok(inboxClient.includes("min-h-0 flex-1 overflow-y-auto"));
});

check("v10.2.3 capabilities remain published in later releases", () => {
  const [major, minor, patch] = packageJson.version.split(".").map(Number);
  assert.ok(major > 10 || (major === 10 && (minor > 2 || (minor === 2 && patch >= 3))));
  assert.ok(packageJson.scripts["test:v10.2.3"]?.includes("test_inbox_latest_activity_spam_cleanup.mjs"));
  for (const marker of [
    "v10_2_3_inbox_latest_activity_spam_cleanup",
    "inboxLatestActivityFirstAvailable",
    "inboxQuickSpamRemovalAvailable",
    "inboxQuickSpamRemovalRecoverable"
  ]) {
    assert.ok(health.includes(marker), `Health marker missing ${marker}.`);
  }
});

console.log(`PASS: v10.2.3 inbox latest-activity and spam-cleanup checks passed: ${checks.length}`);
