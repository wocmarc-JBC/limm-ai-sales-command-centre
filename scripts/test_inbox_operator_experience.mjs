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

const inbox = read("components/inbox/MultiChatInbox.tsx");
const spamDialog = read("components/inbox/InboxSpamDialog.tsx");
const inboxPage = read("app/inbox/page.tsx");
const shell = read("components/ShellChrome.tsx");
const actions = read("lib/actions.ts");
const health = read("app/api/whatsapp/health/route.ts");
const packageJson = JSON.parse(read("package.json"));

check("publishes the v10.3.0 operator-experience release", () => {
  assert.equal(packageJson.version, "10.3.0");
  assert.ok(packageJson.scripts["test:v10.3.0"]?.includes("test_inbox_operator_experience.mjs"));
  assert.ok(packageJson.scripts.verify.includes("test:v10.3.0"));
  for (const marker of [
    "v10_3_0_inbox_operator_experience",
    'uiVersion: "v10.3.0"',
    "inboxStickyComposerAvailable",
    "inboxDetailsDrawerAvailable",
    "inboxBulkSpamRemovalAvailable",
    "inboxMobileQueueChatFlowAvailable",
    "inboxTabletFullWidthAvailable"
  ]) {
    assert.ok(health.includes(marker), `Health marker missing ${marker}.`);
  }
});

check("keeps the composer below the message viewport", () => {
  const mainStart = inbox.indexOf('<main data-testid="inbox-active-chat"');
  const mainEnd = inbox.indexOf("</main>", mainStart);
  const main = inbox.slice(mainStart, mainEnd);
  const messagesIndex = main.indexOf("ref={messagePaneRef}");
  const composerIndex = main.indexOf("<ReplyComposer");
  assert.ok(messagesIndex >= 0 && composerIndex > messagesIndex);
  assert.ok(inbox.includes('data-testid="inbox-sticky-composer"'));
  assert.ok(inbox.includes("shrink-0 border-t border-command-line"));
  assert.ok(inbox.includes('rows={2}'));
});

check("keeps optional drafting tools collapsed until requested", () => {
  assert.ok(inbox.includes("const [quickRepliesOpen, setQuickRepliesOpen] = useState(false)"));
  assert.ok(inbox.includes("const [draftToolsOpen, setDraftToolsOpen] = useState(false)"));
  assert.ok(inbox.includes("quickRepliesOpen ? ("));
  assert.ok(inbox.includes("draftToolsOpen ? ("));
  assert.ok(inbox.includes("Draft only. Marcus reviews and sends manually."));
});

check("opens details as an overlay without changing the two-column chat grid", () => {
  assert.ok(inbox.includes('lg:grid-cols-[20rem_minmax(0,1fr)]'));
  assert.ok(inbox.includes('data-testid="inbox-details-drawer"'));
  assert.ok(inbox.includes('className="fixed inset-0 z-[60]"'));
  assert.ok(inbox.includes('role="dialog" aria-modal="true"'));
  assert.ok(inbox.includes("sm:w-[26rem] lg:w-[28rem]"));
  assert.equal(inbox.includes("grid-cols-[18rem_minmax(0,1fr)_18rem]"), false);
});

check("uses a dedicated mobile queue-to-chat flow", () => {
  for (const phrase of [
    'useState<"queue" | "chat">',
    'setMobilePane("chat")',
    'setMobilePane("queue")',
    'data-mobile-pane={mobilePane}',
    'data-testid="inbox-queue-pane"',
    'aria-label="Back to conversations"',
    'mobilePane === "queue" ? "flex" : "hidden"',
    'mobilePane === "chat" ? "flex" : "hidden"'
  ]) {
    assert.ok(inbox.includes(phrase), `Mobile flow missing ${phrase}.`);
  }
});

check("gives tablets the full canvas and exposes Inbox in mobile navigation", () => {
  assert.ok(shell.includes("lg:ml-64"));
  assert.ok(shell.includes("lg:w-64"));
  assert.ok(shell.includes("lg:hidden"));
  assert.ok(shell.includes('{ href: "/inbox", label: "Inbox" }'));
  assert.ok(shell.includes("grid-cols-6"));
  assert.equal(shell.includes("md:ml-64"), false);
});

check("supports permission-gated multi-select spam cleanup", () => {
  for (const phrase of [
    "selectionMode",
    "selectedSpamLeadIds",
    'data-testid="inbox-bulk-spam-toolbar"',
    "toggleSelectAllVisible",
    "requestBulkSpamRemoval",
    "markInboxConversationsSpamAction(leadIds)",
    "removeConversationsLocally(removedLeadIds)",
    "withoutRecordKeys(current, removed)"
  ]) {
    assert.ok(inbox.includes(phrase), `Bulk cleanup missing ${phrase}.`);
  }
  assert.ok(inboxPage.includes('can(auth.profile.role, "soft_delete_leads")'));
});

check("bulk server action is bounded, permission checked, audited, and recoverable", () => {
  const start = actions.indexOf("export async function markInboxConversationsSpamAction");
  const end = actions.indexOf("export async function markLeadSpamAction", start);
  const action = actions.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(action.includes("Array.isArray(leadIdsInput)"));
  assert.ok(action.includes('typeof leadId === "string"'));
  assert.ok(action.includes("new Set("));
  assert.ok(action.includes(".slice(0, 30)"));
  assert.ok(action.includes('requirePermission("soft_delete_leads")'));
  assert.ok(action.includes("await markLeadAsSpam(leadId)"));
  assert.ok(action.includes("const concurrency = 5"));
  assert.ok(action.includes("await Promise.all(batch.map"));
  assert.ok(action.includes("revalidateBulkLeadPaths(removedLeadIds)"));
  assert.ok(action.includes("removedLeadIds"));
  assert.ok(action.includes("failedLeadIds"));
  assert.equal(action.includes("hardDeleteLead"), false);
});

check("uses an accessible recovery-first confirmation dialog", () => {
  for (const phrase of [
    'role="alertdialog"',
    'aria-modal="true"',
    'data-testid="inbox-confirm-spam"',
    "recoverable from Leads → Show Spam",
    'event.key === "Escape"',
    "confirmButtonRef.current?.focus()"
  ]) {
    assert.ok(spamDialog.includes(phrase), `Spam dialog missing ${phrase}.`);
  }
  assert.equal(inbox.includes("window.confirm("), false);
});

check("preserves strict newest-client ordering and fast chat switching", () => {
  assert.ok(inbox.includes("return sortInboxLatestFirst(chats)"));
  assert.ok(inbox.includes("Newest client activity stays at the top."));
  assert.ok(inbox.includes("Latest chat first"));
  assert.ok(inbox.includes("window.history.replaceState"));
  assert.ok(inbox.includes("conversationCacheRef"));
});

check("does not touch reply-brain or live integration settings", () => {
  assert.equal(inbox.includes("WHATSAPP_ACCESS_TOKEN"), false);
  assert.equal(inbox.includes("WHATSAPP_PHONE_NUMBER_ID"), false);
  assert.equal(actions.slice(actions.indexOf("export async function markInboxConversationsSpamAction"), actions.indexOf("export async function markLeadSpamAction")).includes("sendReply"), false);
  assert.equal(actions.slice(actions.indexOf("export async function markInboxConversationsSpamAction"), actions.indexOf("export async function markLeadSpamAction")).includes("price"), false);
});

console.log(`PASS: v10.3.0 inbox operator-experience checks passed: ${checks.length}`);
