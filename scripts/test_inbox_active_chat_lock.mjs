import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function assertIncludes(source, phrase, label) {
  assert(source.includes(phrase), `${label} missing ${phrase}`);
}

const inboxClient = read("components/inbox/MultiChatInbox.tsx");
const inboxPage = read("app/inbox/page.tsx");
const commandCore = read("app/command-core/page.tsx");
const dashboard = read("app/dashboard/page.tsx");
const leadDetail = read("app/leads/[id]/page.tsx");

for (const phrase of [
  "const productionConversations = conversations.filter((item) => !isNonProductionChat(item.summary))",
  "const initialLeadId = selectedLeadId && productionConversations.some",
  "const initialSelectedLeadIdRef = useRef(initialLeadId)",
  "const [activeLeadId, setActiveLeadId] = useState(() => initialSelectedLeadIdRef.current)",
  "const activeLeadStillListed = activeLeadId ? chatSummaries.some((summary) => summary.id === activeLeadId) : false",
  "const activeConversation = activeLeadStillListed ? conversationMap[activeLeadId] : undefined",
  "Conversation unavailable.",
  "window.history.replaceState(null, \"\", `/inbox?lead=${encodeURIComponent(leadId)}`)"
]) {
  assertIncludes(inboxClient, phrase, "active chat lock");
}

assert(!inboxClient.includes("setActiveLeadId(selectedLeadId)"), "polling/deep-link effects must not reset active chat to selectedLeadId after user selection.");
assert(!inboxClient.includes("conversationMap[activeLeadId] ?? conversations[0]"), "active chat must not silently fall back to the first sorted conversation.");
assert(!inboxClient.includes("activeConversation = conversationMap[activeLeadId] ??"), "active chat must not derive from a fallback row.");

const pollingStart = inboxClient.indexOf('fetch("/api/inbox/conversations"');
const pollingEnd = inboxClient.indexOf("}, 15000)", pollingStart);
assert(pollingStart >= 0 && pollingEnd > pollingStart, "conversation summary polling block not found.");
const pollingBlock = inboxClient.slice(pollingStart, pollingEnd);
assert(!pollingBlock.includes("setActiveLeadId"), "summary polling must not change active chat.");

const filteredStart = inboxClient.indexOf("const filteredConversations = useMemo");
const filteredEnd = inboxClient.indexOf("const waitingChats = useMemo", filteredStart);
assert(filteredStart >= 0 && filteredEnd > filteredStart, "filtered conversation block not found.");
const filteredBlock = inboxClient.slice(filteredStart, filteredEnd);
assert(!filteredBlock.includes("setActiveLeadId"), "search/filter logic must not auto-open the first filtered result.");
assert(!filteredBlock.includes("selectConversation"), "search/filter logic must not select a conversation.");

const nextStart = inboxClient.indexOf("const nextWaitingChat = () =>");
const nextEnd = inboxClient.indexOf("const handleOptimisticReply", nextStart);
assert(nextStart >= 0 && nextEnd > nextStart, "next waiting chat block not found.");
const nextBlock = inboxClient.slice(nextStart, nextEnd);
assertIncludes(nextBlock, "selectConversation(next.id)", "next waiting chat action");

const selectStart = inboxClient.indexOf("const selectConversation = useCallback");
const selectEnd = inboxClient.indexOf("useEffect(() => {", selectStart);
assert(selectStart >= 0 && selectEnd > selectStart, "manual selectConversation block not found.");
const selectBlock = inboxClient.slice(selectStart, selectEnd);
assertIncludes(selectBlock, "setActiveLeadId(leadId)", "explicit user chat selection");
assertIncludes(selectBlock, "window.history.replaceState", "URL update without full navigation");
assert(!selectBlock.includes("window.location"), "manual chat switching must not force full navigation.");

assertIncludes(inboxPage, "selectedLeadId={searchParams?.lead}", "/inbox deep-link prop");
assertIncludes(dashboard, 'redirect("/command-core")', "dashboard redirect");
assertIncludes(commandCore, 'href="/inbox"', "Command Core WhatsApp inbox link");
assertIncludes(leadDetail, 'href={`/inbox?lead=${encodeURIComponent(lead.id)}`}', "lead detail reply link");
assert(!leadDetail.includes("WhatsAppSalesInbox"), "lead detail must not render the old WhatsApp composer.");

console.log("PASS: /inbox active chat lock static test passed.");
