import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeRequire = createRequire(import.meta.url);
const modules = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: filename, reportDiagnostics: true });
  assert.equal(output.diagnostics?.length || 0, 0);
  const module = { exports: {} }; modules.set(filename, module);
  const require = name => name.startsWith(".") ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : nativeRequire(name);
  new Function("require", "exports", "module", output.outputText)(require, module.exports, module);
  return module.exports;
}
const { parseOwnerCommand, singaporeDate } = load("lib/owner-assistant/command-parser.ts");
const { dispatchOwnerCommand, dispatchClientConfirmation, ownerCommandKey, deterministicCalendarEventId } = load("lib/owner-assistant/engine.ts");
const { deliverOwnerNotice } = load("lib/owner-assistant/outbox.ts");
const NOW = new Date("2026-10-04T20:30:01Z"); // Monday 5 October, 04:30 Singapore.
let checks = 0;
async function check(name, run) { await run(); checks++; process.stdout.write(`PASS ${name}\n`); }
const parse = text => parseOwnerCommand(text, NOW, 60);
function fixture() {
  let now = new Date(NOW);
  const owner = { companyId: "company-1", channelId: "channel-1", phone: "6590000001", calendarResourceId: "owner-calendar-1", enabled: true, writeEnabled: true, timezone: "Asia/Singapore", defaultDurationMinutes: 60, slotStepMinutes: 30, invitationTtlMinutes: 60, noticeTtlMinutes: 30,
    searchWindows: Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, [{ startMinute: 540, endMinute: 1080 }]])) };
  const contact = { id: "contact-1", companyId: "company-1", channelId: "channel-1", phone: "6590000002", name: "Dini" };
  const capabilities = { eventsRead: true, freeBusy: true, eventsWrite: true };
  const events = new Map(), receipts = new Map(), commits = [], invitations = new Map(), intents = [], logs = [], locks = new Map();
  const counters = { create: 0, move: 0, cancel: 0, read: 0, busy: 0, policy: 0, lock: 0 };
  let sequence = 0;
  const lock = async (key, run) => {
    const previous = locks.get(key) || Promise.resolve();
    let release; const next = new Promise(resolve => release = resolve); locks.set(key, next);
    await previous;
    try { return await run(); } finally { release(); if (locks.get(key) === next) locks.delete(key); }
  };
  const ports = {
    now: () => new Date(now),
    ownerForChannel: async (companyId, channelId) => companyId === owner.companyId && channelId === owner.channelId ? owner : null,
    resolveContact: async (_company, _channel, name) => /dini|6590000002/i.test(name) ? [contact] : [],
    authoriseClientNotice: async () => ({ allowed: true, reason: "within_window" }),
    log: (phase, metadata) => logs.push({ phase, metadata }),
    calendar: {
      capabilities: async () => capabilities,
      listEvents: async (_owner, range) => { counters.read++; return [...events.values()].filter(e => Date.parse(e.start) < Date.parse(range.end) && Date.parse(e.end) > Date.parse(range.start)).map(e => ({ ...e })); },
      busy: async () => { counters.busy++; return [...events.values()].filter(e => e.status !== "cancelled").map(e => ({ start: e.start, end: e.end })); },
      bookingAllowed: async (_owner, slot, options) => {
        counters.policy++; assert.equal(options.ownerApproved, true);
        return { allowed: ![...events.values()].some(e => e.status !== "cancelled" && e.id !== options.excludeEventId && Date.parse(slot.start) < Date.parse(e.end) && Date.parse(slot.end) > Date.parse(e.start)), reason: "conflict" };
      },
      withResourceLock: async (key, run) => { counters.lock++; return lock(`calendar:${key}`, run); },
      createEvent: async (registration, input) => {
        counters.create++; await Promise.resolve();
        const event = events.get(input.id) || { id: input.id, etag: `etag-${input.id}`, calendarResourceId: registration.calendarResourceId, title: input.title, start: input.start, end: input.end, status: "confirmed" };
        events.set(event.id, event); return { ...event };
      },
      moveEvent: async (_owner, event, slot) => { counters.move++; assert.equal(event.etag, events.get(event.id).etag); const moved = { ...event, ...slot, etag: "etag-after-move" }; events.set(event.id, moved); return moved; },
      cancelEvent: async (_owner, event) => { counters.cancel++; assert.equal(event.etag, events.get(event.id).etag); events.set(event.id, { ...event, status: "cancelled" }); return { status: "cancelled", eventId: event.id, calendarResourceId: event.calendarResourceId }; }
    },
    store: {
      existingReceipt: async (key, fingerprint) => {
        const receipt = receipts.get(key);
        if (receipt && receipt.fingerprint !== fingerprint) throw new Error("fingerprint_mismatch");
        return receipt ? receipt.state === "done" ? "duplicate" : "reconcile_required" : null;
      },
      claim: async (key, fingerprint) => {
        const receipt = receipts.get(key);
        if (receipt && receipt.fingerprint !== fingerprint) throw new Error("fingerprint_mismatch");
        if (receipt) return receipt.state === "done" ? "duplicate" : "reconcile_required";
        receipts.set(key, { state: "processing", fingerprint }); return "new";
      },
      prepareMutation: async (key, intent) => { intents.push({ key, intent }); },
      commit: async (key, outcome) => {
        assert.ok(!commits.some(c => c.key === key)); commits.push({ key, ...structuredClone(outcome) });
        receipts.get(key).state = "done";
        if (outcome.invitation) invitations.set(outcome.invitation.id, structuredClone(outcome.invitation));
        if (outcome.invitationUpdate) Object.assign(invitations.get(outcome.invitationUpdate.id), { status: outcome.invitationUpdate.status, eventId: outcome.invitationUpdate.eventId });
      },
      needsReview: async (key, code) => { if (receipts.has(key)) Object.assign(receipts.get(key), { state: "review", code }); },
      pendingInvitations: async (companyId, channelId, sender) => [...invitations.values()].filter(i => i.companyId === companyId && i.channelId === channelId && i.contact.phone === sender && i.status === "pending").map(i => structuredClone(i)),
      withInvitationLock: (key, run) => lock(`invite:${key}`, run),
      invitationById: async id => structuredClone(invitations.get(id) || null)
    }
  };
  const inbound = (text, extra = {}) => ({ signatureVerified: true, companyId: owner.companyId, channelId: owner.channelId, sender: owner.phone, providerMessageId: `wamid-${++sequence}`, providerTimestamp: now.toISOString(), text, ...extra });
  const addEvent = (title, start = "2026-10-06T15:00:00+08:00", end = "2026-10-06T16:00:00+08:00", id = `event-${events.size + 1}`) => events.set(id, { id, etag: `etag-${id}`, calendarResourceId: owner.calendarResourceId, title, start, end, status: "confirmed" });
  return { owner, contact, capabilities, ports, counters, events, receipts, commits, invitations, intents, logs, inbound, addEvent, setNow: date => now = new Date(date), run: text => dispatchOwnerCommand(inbound(text), ports) };
}

await check("Singapore date uses the local next day across UTC midnight", () => assert.equal(singaporeDate(NOW), "2026-10-05"));
await check("natural booking uses tomorrow in Singapore with one-hour duration", () => { const c = parse("CC, book site meeting with Dini tomorrow 3pm for 1 hour."); assert.equal(c.kind, "create"); assert.equal(c.slot.start, "2026-10-06T07:00:00.000Z"); assert.equal(c.slot.end, "2026-10-06T08:00:00.000Z"); });
await check("agenda parses an owner question", () => assert.equal(parse("What appointments do I have tomorrow?").kind, "agenda"));
await check("free time accepts two-hour afternoon requests", () => { const c = parse("Find me a free 2 hour slot Thursday afternoon"); assert.equal(c.kind, "find"); assert.equal(c.durationMinutes, 120); assert.equal(c.range.start, "2026-10-08T04:00:00.000Z"); });
await check("hyphenated two-hour duration cannot silently become one hour", () => assert.equal(parse("Find me a free 2-hour slot Thursday afternoon").durationMinutes, 120));
await check("word duration requests a clarification rather than guessing", () => assert.equal(parse("Book dentist tomorrow 3pm for two hours").kind, "clarify"));
await check("multiple time windows are ambiguous", () => assert.equal(parse("Find a slot Thursday morning or afternoon").kind, "clarify"));
await check("a vague reminder requests an exact time", () => assert.equal(parse("Remind me to call Jack tomorrow morning").kind, "clarify"));
await check("an exact reminder is a calendar event with a reminder", () => assert.equal(parse("Remind me to call Jack tomorrow 9am").reminder, true));
for (const text of ["Book dentist tomorrow 3", "Book dentist 10/11 3pm", "Book dentist 31 Oct 3pm", "Book dentist 2026-02-30 3pm", "Book dentist tomorrow 25:00", "Book dentist tomorrow 0am", "Book dentist next Thursday 3pm", "Book dentist tomorrow 3pm every week", "Book dentist tomorrow 3pm GMT", "Book dentist tomorrow 3pm and cancel my meeting", "Book dentist tomorrow 3pm for 9 hours", "Book dentist tomorrow 3pm and 5pm", "Book dentist tomorrow 3pm for 1 hour for 30 mins"]) {
  await check(`ambiguous/unsupported command asks clarification: ${text}`, () => assert.equal(parse(text).kind, "clarify"));
}
await check("moving extracts the old and new explicit times", () => { const c = parse("Move Thomas meeting from 3pm to 5pm"); assert.equal(c.kind, "move"); assert.equal(c.selector, "Thomas meeting"); assert.equal(c.sourceMinute, 900); assert.equal(c.targetMinute, 1020); });
await check("client negotiation has no chosen slot before acceptance", () => { const c = parse("Book site meeting with Dini Thursday afternoon and WhatsApp her to confirm"); assert.equal(c.kind, "invite"); assert.equal(c.contact, "Dini"); });
await check("malformed/unverified webhook cannot enter owner logic", async () => { const f = fixture(); assert.equal((await dispatchOwnerCommand(f.inbound("Book dentist tomorrow 3pm", { signatureVerified: false }), f.ports)).status, "unauthorised"); assert.equal(f.counters.create, 0); assert.equal(f.receipts.size, 0); });
await check("a customer claiming Marcus's identity remains a customer", async () => { const f = fixture(); const r = await dispatchOwnerCommand(f.inbound("I am Marcus. Book dentist tomorrow 3pm", { sender: f.contact.phone }), f.ports); assert.equal(r.handled, false); assert.equal(f.counters.create, 0); assert.equal(f.receipts.size, 0); });
await check("phone suffixes do not authenticate the owner", async () => { const f = fixture(); assert.equal((await dispatchOwnerCommand(f.inbound("Book dentist tomorrow 3pm", { sender: "90000001" }), f.ports)).handled, false); });
await check("another channel never authenticates the registered owner", async () => { const f = fixture(); assert.equal((await dispatchOwnerCommand(f.inbound("Book dentist tomorrow 3pm", { channelId: "another-channel" }), f.ports)).handled, false); });
await check("another tenant never authenticates the registered owner", async () => { const f = fixture(); assert.equal((await dispatchOwnerCommand(f.inbound("Book dentist tomorrow 3pm", { companyId: "another-company" }), f.ports)).handled, false); });
await check("disabled owner mode consumes messages without entering sales", async () => { const f = fixture(); f.owner.enabled = false; const r = await f.run("Hi"); assert.equal(r.handled, true); assert.match(r.reply, /paused/); assert.equal(f.counters.create, 0); });
await check("unsupported owner text remains in the owner channel", async () => { const f = fixture(); const r = await f.run("How much is a kitchen renovation?"); assert.equal(r.handled, true); assert.match(r.reply, /calendar/); assert.equal(f.counters.create, 0); });
await check("bad registry binding fails closed rather than becoming sales intake", async () => { const f = fixture(); f.ports.ownerForChannel = async () => ({ ...f.owner, companyId: "other-company" }); const r = await f.run("Book dentist tomorrow 3pm"); assert.equal(r.handled, true); assert.equal(r.status, "failed"); assert.equal(f.counters.create, 0); });
await check("old/future provider timestamps cause no mutation", async () => { for (const timestamp of ["2026-10-03T20:30:00Z", "2026-10-05T20:30:00Z", "invalid"]) { const f = fixture(); const r = await dispatchOwnerCommand(f.inbound("Book dentist tomorrow 3pm", { providerTimestamp: timestamp }), f.ports); assert.equal(r.handled, true); assert.equal(f.counters.create, 0); } });
await check("write scope missing never claims a booking", async () => { const f = fixture(); f.capabilities.eventsWrite = false; const r = await f.run("Book dentist tomorrow 3pm"); assert.match(r.reply, /permission/); assert.equal(f.counters.create, 0); });
await check("availability-only scope cannot expose event details", async () => { const f = fixture(); f.capabilities.eventsRead = false; const r = await f.run("What appointments do I have tomorrow?"); assert.match(r.reply, /read event details/); assert.equal(f.counters.read, 0); });
await check("unverified required calendar blocks availability and create", async () => { const f = fixture(); f.capabilities.freeBusy = false; const r = await f.run("Book dentist tomorrow 3pm"); assert.match(r.reply, /verify availability/); assert.equal(f.counters.create, 0); });
await check("booking succeeds only after journalling and real event proof", async () => { const f = fixture(); const original = f.ports.calendar.createEvent; f.ports.calendar.createEvent = async (...args) => { assert.equal(f.intents.length, 1); assert.equal(f.commits.length, 0); return original(...args); }; const r = await f.run("Book dentist tomorrow 3pm"); assert.match(r.reply, /Added to your calendar/); assert.equal(f.events.size, 1); assert.equal(f.commits[0].notices.length, 1); });
await check("Google event IDs use the documented base32hex character set", () => assert.match(deterministicCalendarEventId("test-command"), /^[0-9a-v]{5,1024}$/));
await check("duplicate webhook produces one mutation and one durable reply", async () => { const f = fixture(); const inbound = f.inbound("Book dentist tomorrow 3pm"); const [a, b] = await Promise.all([dispatchOwnerCommand(inbound, f.ports), dispatchOwnerCommand(inbound, f.ports)]); assert.equal(f.counters.create, 1); assert.equal(f.commits.length, 1); assert.ok([a.status, b.status].some(s => s === "reconcile_required" || s === "duplicate")); });
await check("same provider ID with different content cannot execute a new action", async () => { const f = fixture(); const inbound = f.inbound("Book dentist tomorrow 3pm"); await dispatchOwnerCommand(inbound, f.ports); const r = await dispatchOwnerCommand({ ...inbound, text: "Cancel dentist" }, f.ports); assert.equal(r.status, "failed"); assert.equal(f.counters.cancel, 0); });
await check("processing receipt requires reconciliation rather than replay", async () => { const f = fixture(); const inbound = f.inbound("Book dentist tomorrow 3pm"); const claim = f.ports.store.claim; f.ports.store.claim = async (key, fingerprint) => { await claim(key, fingerprint); return claim(key, fingerprint); }; const r = await dispatchOwnerCommand(inbound, f.ports); assert.equal(r.status, "reconcile_required"); assert.equal(f.counters.create, 0); assert.equal(f.commits.length, 0); });
await check("distinct overlapping commands use the shared lock to prevent double booking", async () => { const f = fixture(); const results = await Promise.all([f.run("Book dentist tomorrow 3pm"), f.run("Book lunch tomorrow 3pm")]); assert.equal(f.counters.create, 1); assert.equal(f.counters.lock, 2); assert.equal(results.filter(r => /Added/.test(r.reply)).length, 1); });
await check("kill switch changed while waiting for the calendar lock stops the write", async () => { const f = fixture(); f.ports.calendar.withResourceLock = async (_key, run) => { f.owner.enabled = false; return run(); }; const r = await f.run("Book dentist tomorrow 3pm"); assert.match(r.reply, /paused/); assert.equal(f.counters.create, 0); });
await check("past explicit start cannot create an event", async () => { const f = fixture(); const r = await f.run("Book dentist 2026-10-04 3pm"); assert.equal(f.counters.create, 0); assert.match(r.reply, /future/); });
await check("a conflicting requested slot cannot create an event", async () => { const f = fixture(); f.addEvent("Busy"); const r = await f.run("Book dentist tomorrow 3pm"); assert.equal(f.counters.create, 0); assert.match(r.reply, /unavailable/); });
await check("a calendar timeout gives reconciliation, no false booked notice", async () => { const f = fixture(); f.ports.calendar.createEvent = async () => { throw new Error("secret-provider-token-should-never-appear"); }; const r = await f.run("Book dentist tomorrow 3pm"); assert.equal(r.status, "reconcile_required"); assert.equal(f.commits.length, 0); assert.ok(!JSON.stringify(f.logs).includes("secret-provider")); });
await check("a fake/wrong calendar proof cannot confirm a booking", async () => { for (const patch of [{ id: "wrong" }, { calendarResourceId: "another-calendar" }, { status: "tentative" }, { etag: "" }, { start: "2026-10-06T09:00:00Z" }]) { const f = fixture(); const create = f.ports.calendar.createEvent; f.ports.calendar.createEvent = async (...args) => ({ ...(await create(...args)), ...patch }); const r = await f.run("Book dentist tomorrow 3pm"); assert.equal(r.status, "reconcile_required"); assert.equal(f.commits.length, 0); } });
await check("mandatory audit/journal failure stops before provider mutation", async () => { const f = fixture(); f.ports.store.prepareMutation = async () => { throw new Error("db failure"); }; const r = await f.run("Book dentist tomorrow 3pm"); assert.equal(r.status, "failed"); assert.equal(f.counters.create, 0); });
await check("post-Google commit failure cannot replay the event creation", async () => { const f = fixture(); const input = f.inbound("Book dentist tomorrow 3pm"); f.ports.store.commit = async () => { throw new Error("db failure"); }; assert.equal((await dispatchOwnerCommand(input, f.ports)).status, "reconcile_required"); assert.equal((await dispatchOwnerCommand(input, f.ports)).status, "reconcile_required"); assert.equal(f.counters.create, 1); });
await check("Sunday is configurable and can produce available slots", async () => { const f = fixture(); assert.match((await f.run("Find a free 1 hour slot Sunday afternoon")).reply, /Available slots/); f.owner.searchWindows[0] = []; assert.match((await f.run("Find a free 1 hour slot Sunday afternoon")).reply, /couldn't find/); });
await check("agenda does not expose another calendar's event", async () => { const f = fixture(); f.addEvent("private wrong tenant event"); f.events.get("event-1").calendarResourceId = "another-calendar"; const r = await f.run("What appointments do I have tomorrow?"); assert.equal(r.status, "failed"); assert.equal(f.commits.length, 0); });
await check("move passes the original ETag and keeps duration", async () => { const f = fixture(); f.addEvent("Site meeting with Thomas"); const r = await f.run("Move Thomas meeting from 3pm to 5pm"); assert.match(r.reply, /Moved in your calendar/); assert.equal(f.counters.move, 1); assert.equal(f.events.get("event-1").start, "2026-10-06T09:00:00.000Z"); assert.equal(f.intents[0].intent.expectedEtag, "etag-event-1"); });
await check("multiple matching events produce clarification and no cancellation", async () => { const f = fixture(); f.addEvent("Thomas meeting"); f.addEvent("Thomas meeting", "2026-10-07T15:00:00+08:00", "2026-10-07T16:00:00+08:00"); const r = await f.run("Cancel Thomas meeting"); assert.match(r.reply, /2 matching/); assert.equal(f.counters.cancel, 0); });
await check("cancel verifies provider proof before reporting removal", async () => { const f = fixture(); f.addEvent("Thomas meeting"); assert.match((await f.run("Cancel Thomas meeting tomorrow 3pm")).reply, /Removed from your calendar/); assert.equal(f.events.get("event-1").status, "cancelled"); });
await check("event changed/ETag rejected causes reconciliation and no false removal", async () => { const f = fixture(); f.addEvent("Thomas meeting"); f.ports.calendar.cancelEvent = async () => { throw new Error("412"); }; const r = await f.run("Cancel Thomas meeting tomorrow 3pm"); assert.equal(r.status, "reconcile_required"); assert.equal(f.commits.length, 0); });
await check("failed move availability leaves the original appointment in place", async () => { const f = fixture(); f.addEvent("Thomas meeting"); f.addEvent("Busy", "2026-10-06T17:00:00+08:00", "2026-10-06T18:00:00+08:00"); const r = await f.run("Move Thomas meeting from 3pm to 5pm"); assert.match(r.reply, /original time/); assert.equal(f.counters.move, 0); });
await check("ambiguous client contact never books or sends", async () => { const f = fixture(); f.ports.resolveContact = async () => [f.contact, { ...f.contact, id: "contact-2", phone: "6590000003" }]; const r = await f.run("Book site meeting with Dini tomorrow 3pm and WhatsApp her"); assert.match(r.reply, /one contact/); assert.equal(f.counters.create, 0); assert.equal(f.commits[0].notices.filter(n => n.audience === "client").length, 0); });
await check("cross-tenant contact is rejected even when uniquely resolved", async () => { const f = fixture(); f.ports.resolveContact = async () => [{ ...f.contact, companyId: "another-company" }]; assert.equal((await f.run("Book site meeting with Dini tomorrow 3pm and WhatsApp her")).status, "failed"); assert.equal(f.counters.create, 0); });
await check("direct booking queues client notice only after a verified event", async () => { const f = fixture(); const r = await f.run("Book site meeting with Dini tomorrow 3pm and WhatsApp her"); assert.match(r.reply, /queued/); assert.equal(f.counters.create, 1); assert.equal(f.commits[0].notices.filter(n => n.audience === "client").length, 1); assert.ok(!r.reply.includes("delivered")); });
await check("Meta policy denial blocks notice while truthfully preserving the calendar entry", async () => { const f = fixture(); f.ports.authoriseClientNotice = async () => ({ allowed: false, reason: "131047" }); const r = await f.run("Book site meeting with Dini tomorrow 3pm and WhatsApp her"); assert.match(r.reply, /notice was blocked/); assert.equal(f.events.size, 1); assert.equal(f.commits[0].notices.filter(n => n.audience === "client").length, 0); });

async function offeredFixture() { const f = fixture(); await f.run("Book site meeting with Dini Thursday afternoon and WhatsApp her to confirm"); f.setNow(new Date(NOW.getTime() + MINUTE)); return f; }
const MINUTE = 60000;
await check("client invitation persists options but creates no calendar event", async () => { const f = await offeredFixture(); assert.equal(f.invitations.size, 1); assert.equal(f.events.size, 0); assert.equal(f.commits[0].notices.filter(n => n.audience === "client").length, 1); });
await check("Meta blocked recipient cannot receive a new invitation", async () => { const f = fixture(); f.ports.authoriseClientNotice = async () => ({ allowed: false, reason: "131049" }); const r = await f.run("Book site meeting with Dini Thursday afternoon and WhatsApp her to confirm"); assert.match(r.reply, /can't WhatsApp/); assert.equal(f.invitations.size, 0); assert.equal(f.events.size, 0); });
await check("exact client acceptance writes one event and informs both parties", async () => { const f = await offeredFixture(); const r = await dispatchClientConfirmation(f.inbound("1", { sender: f.contact.phone }), f.ports); assert.match(r.reply, /confirmed/); assert.equal(f.events.size, 1); assert.equal(f.commits.at(-1).notices.length, 2); assert.equal([...f.invitations.values()][0].status, "confirmed"); });
await check("replayed completed client confirmation never falls through to sales", async () => { const f = await offeredFixture(); const input = f.inbound("1", { sender: f.contact.phone }); await dispatchClientConfirmation(input, f.ports); const r = await dispatchClientConfirmation(input, f.ports); assert.equal(r.handled, true); assert.equal(r.status, "duplicate"); assert.equal(f.counters.create, 1); });
await check("replayed declined client offer never falls through to sales", async () => { const f = await offeredFixture(); const input = f.inbound("no", { sender: f.contact.phone }); await dispatchClientConfirmation(input, f.ports); const r = await dispatchClientConfirmation(input, f.ports); assert.equal(r.handled, true); assert.equal(r.status, "duplicate"); assert.equal(f.counters.create, 0); });
await check("bare yes cannot choose among offered slots", async () => { const f = await offeredFixture(); const r = await dispatchClientConfirmation(f.inbound("yes", { sender: f.contact.phone }), f.ports); assert.match(r.reply, /option number/); assert.equal(f.events.size, 0); });
await check("unrelated pending-client message continues the existing single sales planner", async () => { const f = await offeredFixture(); const r = await dispatchClientConfirmation(f.inbound("What materials do you use?", { sender: f.contact.phone }), f.ports); assert.equal(r.handled, false); assert.equal(f.events.size, 0); });
await check("another contact cannot accept an invitation", async () => { const f = await offeredFixture(); const r = await dispatchClientConfirmation(f.inbound("1", { sender: "6590000009" }), f.ports); assert.equal(r.handled, false); assert.equal(f.events.size, 0); });
await check("client confirmation checks the locked row's tenant and contact again", async () => { const f = await offeredFixture(); const original = f.ports.store.invitationById; f.ports.store.invitationById = async id => ({ ...(await original(id)), contact: { ...f.contact, phone: "6590000009" } }); const r = await dispatchClientConfirmation(f.inbound("1", { sender: f.contact.phone }), f.ports); assert.equal(r.status, "failed"); assert.equal(f.events.size, 0); });
await check("old inbound cannot accept a more recent invitation", async () => { const f = await offeredFixture(); const r = await dispatchClientConfirmation(f.inbound("1", { sender: f.contact.phone, providerTimestamp: "2026-10-04T20:29:00Z" }), f.ports); assert.match(r.reply, /reply again/); assert.equal(f.events.size, 0); });
await check("expired invitation produces no write", async () => { const f = await offeredFixture(); f.setNow(new Date(NOW.getTime() + 61 * MINUTE)); const r = await dispatchClientConfirmation(f.inbound("1", { sender: f.contact.phone }), f.ports); assert.match(r.reply, /expired/); assert.equal(f.events.size, 0); });
await check("declined invitation creates no event", async () => { const f = await offeredFixture(); const r = await dispatchClientConfirmation(f.inbound("no", { sender: f.contact.phone }), f.ports); assert.match(r.reply, /haven't booked/); assert.equal(f.events.size, 0); assert.equal([...f.invitations.values()][0].status, "declined"); });
await check("two active offers cannot be selected by a bare option number", async () => { const f = await offeredFixture(); const first = [...f.invitations.values()][0]; f.invitations.set("second-offer", { ...first, id: "second-offer" }); const r = await dispatchClientConfirmation(f.inbound("1", { sender: f.contact.phone }), f.ports); assert.match(r.reply, /more than one/); assert.equal(f.events.size, 0); });
await check("fresh conflict after offering does not confirm a stale available slot", async () => { const f = await offeredFixture(); const slot = [...f.invitations.values()][0].slots[0]; f.addEvent("New conflicting meeting", slot.start, slot.end); const r = await dispatchClientConfirmation(f.inbound("1", { sender: f.contact.phone }), f.ports); assert.match(r.reply, /no longer available/); assert.equal(f.counters.create, 0); });
await check("concurrent client confirmations create one event through invitation lock", async () => { const f = await offeredFixture(); await Promise.all([dispatchClientConfirmation(f.inbound("1", { sender: f.contact.phone }), f.ports), dispatchClientConfirmation(f.inbound("1", { sender: f.contact.phone }), f.ports)]); assert.equal(f.counters.create, 1); assert.equal(f.events.size, 1); });
await check("paused scheduling cannot be bypassed by a client accepting an older offer", async () => { const f = await offeredFixture(); f.owner.enabled = false; const r = await dispatchClientConfirmation(f.inbound("1", { sender: f.contact.phone }), f.ports); assert.match(r.reply, /paused/); assert.equal(f.events.size, 0); });

function outboxFixture() {
  const notice = { idempotencyKey: "notice-1", companyId: "company-1", channelId: "channel-1", recipientPhone: "6590000002", audience: "client", text: "Meeting options", expiresAt: "2026-10-04T21:00:01Z" };
  const records = []; let state, sends = 0;
  const ports = { now: () => NOW, claim: async () => { if (state) return state === "done" ? "duplicate" : "reconcile_required"; state = "processing"; return "new"; }, authorise: async () => ({ allowed: true, code: "ready" }), send: async () => { sends++; return { status: "accepted", providerMessageId: "provider-1" }; }, record: async (_key, result) => { records.push(result); state = "done"; } };
  return { notice, ports, records, sends: () => sends };
}
await check("outbox rechecks live Meta policy at actual send time", async () => { const f = outboxFixture(); f.ports.authorise = async () => ({ allowed: false, code: "meta_policy_blocked" }); assert.equal(await deliverOwnerNotice(f.notice, f.ports), "blocked"); assert.equal(f.sends(), 0); });
await check("outbox expiry prevents a delayed client send", async () => { const f = outboxFixture(); f.notice.expiresAt = "2026-10-04T20:30:01Z"; assert.equal(await deliverOwnerNotice(f.notice, f.ports), "blocked"); assert.equal(f.sends(), 0); });
await check("expiry during the final authorisation lookup stops the send", async () => { const f = outboxFixture(); f.ports.authorise = async () => { f.ports.now = () => new Date("2026-10-04T21:01:00Z"); return { allowed: true, code: "ready" }; }; assert.equal(await deliverOwnerNotice(f.notice, f.ports), "blocked"); assert.equal(f.sends(), 0); });
await check("accepted provider request is never described as delivered", async () => { const f = outboxFixture(); assert.equal(await deliverOwnerNotice(f.notice, f.ports), "provider_accepted"); assert.equal(f.records[0].status, "provider_accepted"); assert.equal(f.sends(), 1); });
await check("outbox duplicate cannot send again", async () => { const f = outboxFixture(); await deliverOwnerNotice(f.notice, f.ports); assert.equal(await deliverOwnerNotice(f.notice, f.ports), "duplicate"); assert.equal(f.sends(), 1); });
await check("uncertain Meta result requires review and never retries automatically", async () => { const f = outboxFixture(); f.ports.send = async () => ({ status: "unknown" }); assert.equal(await deliverOwnerNotice(f.notice, f.ports), "needs_review"); assert.equal(await deliverOwnerNotice(f.notice, f.ports), "duplicate"); });
await check("sync Meta policy rejection is failed, with no retry/follow-up action", async () => { const f = outboxFixture(); f.ports.send = async () => ({ status: "rejected", code: "131049" }); assert.equal(await deliverOwnerNotice(f.notice, f.ports), "failed"); assert.equal(f.records[0].code, "131049"); });
await check("post-send persistence failure cannot cause another provider request", async () => { const f = outboxFixture(); f.ports.record = async () => { throw new Error("db failure"); }; assert.equal(await deliverOwnerNotice(f.notice, f.ports), "needs_review"); assert.equal(await deliverOwnerNotice(f.notice, f.ports), "reconcile_required"); assert.equal(f.sends(), 1); });
await check("all logs contain opaque keys/safe codes only", async () => { const f = fixture(); await f.run("Book private medical review tomorrow 3pm"); const text = JSON.stringify(f.logs); assert.ok(!text.includes("medical")); assert.ok(!text.includes(f.owner.phone)); assert.ok(!text.includes(f.contact.phone)); });

process.stdout.write(`\n${checks} owner calendar draft regression scenarios passed. No real Google, Meta or production database calls.\n`);
