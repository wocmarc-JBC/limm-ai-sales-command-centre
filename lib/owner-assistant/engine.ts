import { createHash } from "node:crypto";
import { atSingaporeMinute, minuteInSingapore, parseOwnerCommand, singaporeDate } from "./command-parser";
import type { CalendarEvent, CommandCommit, Contact, DispatchResult, Invitation, Notice, OwnerAssistantPorts, OwnerRegistration, TimeRange, VerifiedInbound } from "./types";

export const OWNER_ASSISTANT_VERSION = "owner-calendar-draft-20261005.1";
const MINUTE = 60_000;
const DAY = 1440 * MINUTE;

/** Strict E.164 comparison: no country guessing, name lookup or suffix matching. */
export function normaliseOwnerPhone(value: string): string | null {
  if (!/^\+?[0-9 ()-]+$/.test(value)) return null;
  const digits = value.replace(/[+ ()-]/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

function hash(parts: string[]) { return createHash("sha256").update(JSON.stringify(parts)).digest("hex"); }
export function ownerCommandKey(input: VerifiedInbound) {
  return hash([input.companyId, input.channelId, normaliseOwnerPhone(input.sender) || "", input.providerMessageId]);
}
export function deterministicCalendarEventId(key: string) { return `cc${hash([key, "calendar-event"])}`; }

function validEnvelope(input: VerifiedInbound) {
  return input.signatureVerified && Boolean(input.companyId && input.channelId && input.providerMessageId) && Boolean(normaliseOwnerPhone(input.sender));
}
function fresh(input: VerifiedInbound, now: Date) {
  const timestamp = Date.parse(input.providerTimestamp);
  return Number.isFinite(timestamp) && timestamp <= now.getTime() + 5 * MINUTE && timestamp > now.getTime() - DAY;
}
function validOwner(owner: OwnerRegistration, input: VerifiedInbound) {
  return owner.companyId === input.companyId && owner.channelId === input.channelId && owner.timezone === "Asia/Singapore" && Boolean(normaliseOwnerPhone(owner.phone));
}
async function mutationStillAllowed(owner: OwnerRegistration, input: VerifiedInbound, ports: OwnerAssistantPorts) {
  const current = await ports.ownerForChannel(input.companyId, input.channelId);
  return Boolean(current && validOwner(current, input) && current.enabled && current.writeEnabled && current.calendarResourceId === owner.calendarResourceId && normaliseOwnerPhone(current.phone) === normaliseOwnerPhone(owner.phone));
}
function validRange(slot: TimeRange, now: Date) {
  const start = Date.parse(slot.start), end = Date.parse(slot.end);
  return Number.isFinite(start) && Number.isFinite(end) && start > now.getTime() && end > start && end - start <= 480 * MINUTE && start - now.getTime() <= 366 * DAY;
}
function ownerConfigValid(owner: OwnerRegistration) {
  return owner.calendarResourceId && Number.isInteger(owner.defaultDurationMinutes) && owner.defaultDurationMinutes >= 5 && owner.defaultDurationMinutes <= 480 &&
    Number.isInteger(owner.slotStepMinutes) && owner.slotStepMinutes >= 5 && owner.slotStepMinutes <= 120 &&
    Number.isInteger(owner.noticeTtlMinutes) && owner.noticeTtlMinutes >= 1 && owner.noticeTtlMinutes <= 1440 &&
    Number.isInteger(owner.invitationTtlMinutes) && owner.invitationTtlMinutes >= 1 && owner.invitationTtlMinutes <= 1440 &&
    owner.searchWindows && Object.entries(owner.searchWindows).every(([day, windows]) => /^[0-6]$/.test(day) && Array.isArray(windows) && windows.every(w => Number.isInteger(w.startMinute) && Number.isInteger(w.endMinute) && w.startMinute >= 0 && w.endMinute <= 1440 && w.startMinute < w.endMinute));
}

export function formatSlot(slot: TimeRange) {
  const date = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(slot.start));
  const clock = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit", hour12: true });
  const endDate = singaporeDate(new Date(slot.end));
  const end = endDate === singaporeDate(new Date(slot.start)) ? clock.format(new Date(slot.end)) : `${endDate} ${clock.format(new Date(slot.end))}`;
  return `${date} · ${clock.format(new Date(slot.start))}–${end} (Singapore time)`;
}

function notice(owner: OwnerRegistration, key: string, audience: "owner" | "client", text: string, now: Date, contact?: Contact, invitationId?: string): Notice {
  return { idempotencyKey: hash([key, audience, contact?.id || "owner", invitationId || ""]), companyId: owner.companyId, channelId: owner.channelId,
    recipientPhone: normaliseOwnerPhone(contact?.phone || owner.phone)!, audience, text, expiresAt: new Date(now.getTime() + owner.noticeTtlMinutes * MINUTE).toISOString(), invitationId };
}

function provedEvent(event: CalendarEvent, owner: OwnerRegistration, id: string, slot: TimeRange) {
  return event.id === id && event.calendarResourceId === owner.calendarResourceId && event.status === "confirmed" && Boolean(event.etag) && Date.parse(event.start) === Date.parse(slot.start) && Date.parse(event.end) === Date.parse(slot.end);
}

function eventMatches(event: CalendarEvent, selector: string, sourceMinute?: number) {
  const tokens = selector.toLowerCase().split(/\s+/).filter(token => token && !["my", "the", "appointment", "appt", "event"].includes(token));
  const title = event.title.toLowerCase();
  return event.status !== "cancelled" && tokens.every(token => title.includes(token)) && (sourceMinute === undefined || minuteInSingapore(event.start) === sourceMinute);
}

async function contactFor(owner: OwnerRegistration, selector: string, ports: OwnerAssistantPorts): Promise<Contact | null> {
  const candidates = await ports.resolveContact(owner.companyId, owner.channelId, selector);
  // Do not silently discard a wrong-tenant or invalid candidate and then choose another.
  if (candidates.some(c => c.companyId !== owner.companyId || c.channelId !== owner.channelId || !normaliseOwnerPhone(c.phone) || !c.id || normaliseOwnerPhone(c.phone) === normaliseOwnerPhone(owner.phone))) throw new Error("contact_scope_invalid");
  return candidates.length === 1 ? candidates[0] : null;
}

export async function findOwnerSlots(owner: OwnerRegistration, requested: TimeRange, duration: number, ports: OwnerAssistantPorts) {
  const from = Date.parse(requested.start), until = Date.parse(requested.end);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from || until - from > DAY || !Number.isInteger(duration) || duration < 5 || duration > 480) throw new Error("invalid_search_window");
  if (until <= ports.now().getTime() || from - ports.now().getTime() > 366 * DAY) return [];
  const busy = await ports.calendar.busy(owner, requested);
  if (busy.some(b => !Number.isFinite(Date.parse(b.start)) || !Number.isFinite(Date.parse(b.end)) || Date.parse(b.end) <= Date.parse(b.start))) throw new Error("invalid_busy_result");
  const date = singaporeDate(new Date(from));
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const found: TimeRange[] = [];
  for (const window of owner.searchWindows[day] || []) {
    const lower = Math.max(from, atSingaporeMinute(date, window.startMinute), ports.now().getTime() + 1);
    const origin = atSingaporeMinute(date, window.startMinute);
    let cursor = origin + Math.ceil((lower - origin) / (owner.slotStepMinutes * MINUTE)) * owner.slotStepMinutes * MINUTE;
    const upper = Math.min(until, atSingaporeMinute(date, window.endMinute));
    for (; cursor + duration * MINUTE <= upper; cursor += owner.slotStepMinutes * MINUTE) {
      const end = cursor + duration * MINUTE;
      if (busy.some(b => cursor < Date.parse(b.end) && end > Date.parse(b.start))) continue;
      const slot = { start: new Date(cursor).toISOString(), end: new Date(end).toISOString() };
      const policy = await ports.calendar.bookingAllowed(owner, slot, { ownerApproved: true });
      if (policy.allowed && !found.some(s => s.start === slot.start)) found.push(slot);
      if (found.length === 3) return found;
    }
  }
  return found;
}

async function finish(ports: OwnerAssistantPorts, owner: OwnerRegistration, input: VerifiedInbound, key: string, outcome: CommandCommit) {
  const replyToSender = normaliseOwnerPhone(input.sender) === normaliseOwnerPhone(owner.phone)
    ? notice(owner, key, "owner", outcome.reply, ports.now())
    : notice(owner, key, "client", outcome.reply, ports.now(), { id: normaliseOwnerPhone(input.sender)!, companyId: input.companyId, channelId: input.channelId, phone: input.sender, name: "" }, outcome.invitationUpdate?.id);
  await ports.store.commit(key, { ...outcome, notices: [replyToSender, ...outcome.notices] });
  ports.log("owner_assistant_committed", { key });
  return { handled: true, status: "completed", reply: outcome.reply } satisfies DispatchResult;
}

export async function dispatchOwnerCommand(input: VerifiedInbound, ports: OwnerAssistantPorts): Promise<DispatchResult> {
  if (!validEnvelope(input)) return { handled: true, status: "unauthorised" };
  const owner = await ports.ownerForChannel(input.companyId, input.channelId);
  if (!owner) return { handled: false, status: "not_owner" };
  if (!validOwner(owner, input)) return { handled: true, status: "failed" };
  if (normaliseOwnerPhone(owner.phone) !== normaliseOwnerPhone(input.sender)) return { handled: false, status: "not_owner" };
  const key = ownerCommandKey(input);
  let mutationStarted = false;
  ports.log("owner_assistant_received", { key });
  try {
    const claim = await ports.store.claim(key, hash([input.text, input.providerTimestamp]));
    if (claim !== "new") return { handled: true, status: claim };
    if (!ownerConfigValid(owner)) {
      await ports.store.needsReview(key, "owner_configuration_invalid");
      return { handled: true, status: "failed" };
    }
    const complete = (reply: string, extra: Partial<CommandCommit> = {}) => finish(ports, owner, input, key, { reply, notices: [], ...extra });
    if (!fresh(input, ports.now())) return await complete("This command is too old to act on safely. Please send it again.");
    if (!owner.enabled) return await complete("Your calendar assistant is paused. Your message has stayed in the owner command channel.");
    const command = parseOwnerCommand(input.text, ports.now(), owner.defaultDurationMinutes);
    if (command.kind === "help" || command.kind === "clarify") return await complete(command.reply);
    const capabilities = await ports.calendar.capabilities(owner);
    if (command.kind === "agenda" || command.kind === "move" || command.kind === "cancel") {
      if (!capabilities.eventsRead) return await complete("I need permission to read event details on your chosen calendar. Please reconnect it before using this command.");
    }
    if (command.kind === "agenda") {
      const events = (await ports.calendar.listEvents(owner, command.range)).filter(e => e.status !== "cancelled").sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      if (events.some(e => e.calendarResourceId !== owner.calendarResourceId)) throw new Error("calendar_scope_invalid");
      return await complete(events.length ? events.slice(0, 20).map(e => `${e.title}\n${formatSlot(e)}`).join("\n\n") + (events.length > 20 ? `\n\n${events.length - 20} more events on this day.` : "") : "You have no appointments in that time window.");
    }
    if (!capabilities.freeBusy && command.kind !== "cancel") return await complete("I couldn't verify availability on all required calendars. Please reconnect the affected calendar before I schedule anything.");
    if (command.kind === "find") {
      const slots = await findOwnerSlots(owner, command.range, command.durationMinutes, ports);
      return await complete(slots.length ? `Available slots:\n${slots.map((s, i) => `${i + 1}. ${formatSlot(s)}`).join("\n")}\n\nThese slots are available now; they have not been reserved.` : "I couldn't find an available slot in that window.");
    }
    if (!owner.writeEnabled || !capabilities.eventsWrite) return await complete("Your chosen calendar needs event-write access before I can add, move or cancel appointments. Please reconnect it with that permission.");

    if (command.kind === "invite") {
      const contact = await contactFor(owner, command.contact, ports);
      if (!contact) return await complete(`I couldn't identify one contact for “${command.contact}”. Please use their full name or phone number.`);
      const policy = await ports.authoriseClientNotice(contact);
      if (!policy.allowed) return await complete("I can't WhatsApp that contact under the current sending rules. No meeting has been booked. Ask them to message CC first, then send me the request again.");
      const slots = await findOwnerSlots(owner, command.range, command.durationMinutes, ports);
      if (!slots.length) return await complete("I couldn't find an available slot to offer that contact.");
      const now = ports.now();
      const invitation: Invitation = { id: hash([key, "invite"]), companyId: owner.companyId, channelId: owner.channelId, ownerPhone: normaliseOwnerPhone(owner.phone)!, contact, calendarResourceId: owner.calendarResourceId,
        title: command.title, slots, status: "pending", offeredAt: now.toISOString(), expiresAt: new Date(Math.min(now.getTime() + owner.invitationTtlMinutes * MINUTE, Date.parse(slots[0].start))).toISOString() };
      const clientText = `Marcus would like to arrange a meeting. Which of these times works for you?\n${slots.map((s, i) => `${i + 1}. ${formatSlot(s)}`).join("\n")}\nReply with the option number. I'll check the slot again before confirming.`;
      const clientNotice = notice(owner, key, "client", clientText, now, contact, invitation.id);
      clientNotice.expiresAt = invitation.expiresAt;
      return await complete(`Meeting options for ${contact.name || command.contact} are queued for WhatsApp. No appointment has been booked; I'll add it after they confirm and the slot passes a fresh availability check.`, { invitation, notices: [clientNotice] });
    }

    let contact: Contact | null = null;
    if (command.kind === "create" && command.notify) {
      contact = await contactFor(owner, command.contact!, ports);
      if (!contact) return await complete(`I couldn't identify one contact for “${command.contact}”. Please use their full name or phone number.`);
    }
    return await ports.calendar.withResourceLock(owner.calendarResourceId, async () => {
      if (!await mutationStillAllowed(owner, input, ports)) return await complete("Your calendar assistant is paused or its calendar configuration has changed. No change was made.");
      if (command.kind === "create") {
        if (!validRange(command.slot, ports.now())) return await complete("Please choose a future start time and a duration of up to 8 hours.");
        const allowed = await ports.calendar.bookingAllowed(owner, command.slot, { ownerApproved: true });
        if (!allowed.allowed) return await complete("That slot is unavailable under your current calendar settings. Please choose another time.");
        const id = deterministicCalendarEventId(key);
        await ports.store.prepareMutation(key, { operation: "create", calendarResourceId: owner.calendarResourceId, eventId: id, slot: command.slot });
        mutationStarted = true;
        ports.log("owner_calendar_create_requested", { key });
        const event = await ports.calendar.createEvent(owner, { ...command.slot, id, title: command.title, reminder: command.reminder, commandKey: key });
        if (!provedEvent(event, owner, id, command.slot)) throw new Error("calendar_create_not_verified");
        const notices: Notice[] = [];
        let suffix = "";
        if (contact) {
          if ((await ports.authoriseClientNotice(contact)).allowed) {
            notices.push(notice(owner, key, "client", `Marcus has added your meeting to his calendar:\n${formatSlot(event)}\nPlease let us know if you need to change it.`, ports.now(), contact));
            suffix = "\nYour client notice is queued for WhatsApp.";
          } else suffix = "\nThe client notice was blocked by the current WhatsApp sending rules.";
        }
        return await complete(`Added to your calendar.\n${command.title}\n${formatSlot(event)}${suffix}`, { eventId: event.id, notices });
      }
      if (command.kind !== "move" && command.kind !== "cancel") throw new Error("unexpected_owner_command");
      const all = await ports.calendar.listEvents(owner, command.range);
      if (all.some(e => e.calendarResourceId !== owner.calendarResourceId)) throw new Error("calendar_scope_invalid");
      const candidates = all.filter(e => eventMatches(e, command.selector, command.sourceMinute));
      if (candidates.length !== 1) return await complete(candidates.length ? `I found ${candidates.length} matching appointments. Please include the exact title, date and start time.` : "I couldn't find a matching appointment. Please include its title, date and start time.");
      const event = candidates[0];
      if (!event.id || !event.etag || !Number.isFinite(Date.parse(event.start)) || !Number.isFinite(Date.parse(event.end)) || Date.parse(event.end) <= Date.parse(event.start)) throw new Error("invalid_calendar_event");
      if (command.kind === "cancel") {
        await ports.store.prepareMutation(key, { operation: "cancel", calendarResourceId: owner.calendarResourceId, eventId: event.id, expectedEtag: event.etag });
        mutationStarted = true;
        const proof = await ports.calendar.cancelEvent(owner, event);
        if (proof.status !== "cancelled" || proof.eventId !== event.id || proof.calendarResourceId !== owner.calendarResourceId) throw new Error("calendar_cancel_not_verified");
        return await complete(`Removed from your calendar.\n${event.title}\n${formatSlot(event)}\nNo client notice was sent.`, { eventId: event.id });
      }
      const date = command.targetDate || singaporeDate(new Date(event.start));
      const start = atSingaporeMinute(date, command.targetMinute);
      const slot = { start: new Date(start).toISOString(), end: new Date(start + (command.durationMinutes ? command.durationMinutes * MINUTE : Date.parse(event.end) - Date.parse(event.start))).toISOString() };
      if (!validRange(slot, ports.now())) return await complete("Please choose a future start time and a duration of up to 8 hours.");
      const allowed = await ports.calendar.bookingAllowed(owner, slot, { ownerApproved: true, excludeEventId: event.id });
      if (!allowed.allowed) return await complete("The new slot is unavailable. The appointment has stayed at its original time.");
      await ports.store.prepareMutation(key, { operation: "move", calendarResourceId: owner.calendarResourceId, eventId: event.id, expectedEtag: event.etag, slot });
      mutationStarted = true;
      const moved = await ports.calendar.moveEvent(owner, event, slot);
      if (!provedEvent(moved, owner, event.id, slot)) throw new Error("calendar_move_not_verified");
      return await complete(`Moved in your calendar.\n${event.title}\n${formatSlot(moved)}\nNo client notice was sent.`, { eventId: event.id });
    });
  } catch {
    const code = mutationStarted ? "owner_calendar_reconciliation_required" : "owner_command_failed";
    ports.log("owner_assistant_failed", { key, code });
    await ports.store.needsReview(key, code).catch(() => ports.log("owner_receipt_review_write_failed", { key, code: "receipt_persistence_failed" }));
    return { handled: true, status: mutationStarted ? "reconcile_required" : "failed" };
  }
}

function acceptedSlot(text: string, invitation: Invitation): number | "declined" | "unrelated" | "clarify" {
  const value = text.trim().replace(/[.!]+$/, "").toLowerCase();
  if (/^(?:no|no thanks|decline|cancel|not available|i can't|cannot)$/.test(value)) return "declined";
  const option = value.match(/^(?:option\s*)?([1-3])(?:\s*(?:please|works|is fine))?$/);
  if (option) return Number(option[1]) <= invitation.slots.length ? Number(option[1]) - 1 : "clarify";
  if (/^(?:yes|yes please|ok|okay|confirm|that works)$/.test(value)) return invitation.slots.length === 1 ? 0 : "clarify";
  if (/\b(?:confirm|option|works|yes|ok|okay|book|available)\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/.test(value)) return "clarify";
  return "unrelated";
}

export async function dispatchClientConfirmation(input: VerifiedInbound, ports: OwnerAssistantPorts): Promise<DispatchResult> {
  if (!validEnvelope(input)) return { handled: true, status: "unauthorised" };
  const key = ownerCommandKey(input);
  const previousReceipt = await ports.store.existingReceipt(key, hash([input.text, input.providerTimestamp]));
  if (previousReceipt) return { handled: true, status: previousReceipt };
  const offers = await ports.store.pendingInvitations(input.companyId, input.channelId, normaliseOwnerPhone(input.sender)!);
  if (!offers.length) return { handled: false, status: "not_owner" };
  const owner = await ports.ownerForChannel(input.companyId, input.channelId);
  if (!owner || !validOwner(owner, input) || !ownerConfigValid(owner)) return { handled: true, status: "failed" };
  let mutationStarted = false;
  try {
    if (offers.some(i => i.companyId !== input.companyId || i.channelId !== input.channelId || i.contact.companyId !== input.companyId || i.contact.channelId !== input.channelId || normaliseOwnerPhone(i.contact.phone) !== normaliseOwnerPhone(input.sender) || normaliseOwnerPhone(i.ownerPhone) !== normaliseOwnerPhone(owner.phone) || i.calendarResourceId !== owner.calendarResourceId)) throw new Error("invitation_scope_invalid");
    const choice = acceptedSlot(input.text, offers[0]);
    if (choice === "unrelated") return { handled: false, status: "not_owner" };
    const claim = await ports.store.claim(key, hash([input.text, input.providerTimestamp]));
    if (claim !== "new") return { handled: true, status: claim };
    const complete = (reply: string, extra: Partial<CommandCommit> = {}) => finish(ports, owner, input, key, { reply, notices: [], ...extra });
    if (offers.length !== 1) return await complete("You have more than one meeting offer open. Please tell Marcus which meeting you are confirming.");
    if (!owner.enabled || !owner.writeEnabled) return await complete("Scheduling is currently paused. Please contact Marcus to confirm your meeting.");
    return await ports.store.withInvitationLock(offers[0].id, async () => {
      const invitation = await ports.store.invitationById(offers[0].id);
      if (!invitation || invitation.status !== "pending") return await complete("This meeting offer has already been handled. Please contact Marcus if you need a change.");
      // Revalidate the locked row; a stale pre-lock read is never authorisation.
      if (invitation.companyId !== input.companyId || invitation.channelId !== input.channelId || invitation.contact.companyId !== input.companyId || invitation.contact.channelId !== input.channelId || normaliseOwnerPhone(invitation.contact.phone) !== normaliseOwnerPhone(input.sender) || normaliseOwnerPhone(invitation.ownerPhone) !== normaliseOwnerPhone(owner.phone) || invitation.calendarResourceId !== owner.calendarResourceId) throw new Error("locked_invitation_scope_invalid");
      if (!fresh(input, ports.now()) || !Number.isFinite(Date.parse(invitation.offeredAt)) || Date.parse(input.providerTimestamp) < Date.parse(invitation.offeredAt)) return await complete("Please reply again to the current meeting offer so we can verify your selection.");
      if (!Number.isFinite(Date.parse(invitation.expiresAt)) || Date.parse(invitation.expiresAt) <= ports.now().getTime()) return await complete("That meeting offer has expired. Please ask Marcus for new times.", { invitationUpdate: { id: invitation.id, status: "expired" } });
      const freshChoice = acceptedSlot(input.text, invitation);
      if (freshChoice === "declined") return await complete("Noted. I haven't booked a meeting. Please let Marcus know a better time.", { invitationUpdate: { id: invitation.id, status: "declined" }, notices: [notice(owner, key, "owner", `${invitation.contact.name} declined the meeting offer. No appointment was booked.`, ports.now())] });
      if (typeof freshChoice !== "number") return await complete("Which time works for you? Please reply with the option number from the meeting offer.");
      const capabilities = await ports.calendar.capabilities(owner);
      if (!capabilities.freeBusy || !capabilities.eventsWrite) return await complete("I couldn't verify the calendar connection. Your meeting is awaiting Marcus's confirmation.");
      return await ports.calendar.withResourceLock(owner.calendarResourceId, async () => {
        if (!await mutationStillAllowed(owner, input, ports)) return await complete("Scheduling is currently paused or its calendar configuration has changed. Please contact Marcus to confirm your meeting.");
        const slot = invitation.slots[freshChoice];
        if (!slot || !validRange(slot, ports.now())) return await complete("That slot is no longer available. Please ask Marcus for a new time.", { invitationUpdate: { id: invitation.id, status: "needs_new_slot" } });
        const policy = await ports.calendar.bookingAllowed(owner, slot, { ownerApproved: true });
        if (!policy.allowed) return await complete("That slot is no longer available. Please ask Marcus for a new time.", { invitationUpdate: { id: invitation.id, status: "needs_new_slot" } });
        const id = deterministicCalendarEventId(invitation.id);
        await ports.store.prepareMutation(key, { operation: "create", calendarResourceId: owner.calendarResourceId, eventId: id, slot });
        mutationStarted = true;
        const event = await ports.calendar.createEvent(owner, { ...slot, id, title: invitation.title, reminder: false, commandKey: invitation.id });
        if (!provedEvent(event, owner, id, slot)) throw new Error("invitation_calendar_create_not_verified");
        return await complete(`Your meeting with Marcus is confirmed.\n${formatSlot(event)}`, { eventId: event.id, invitationUpdate: { id: invitation.id, status: "confirmed", eventId: event.id }, notices: [notice(owner, key, "owner", `${invitation.contact.name} confirmed. Added to your calendar.\n${invitation.title}\n${formatSlot(event)}`, ports.now())] });
      });
    });
  } catch {
    const code = mutationStarted ? "invitation_calendar_reconciliation_required" : "invitation_confirmation_failed";
    ports.log("owner_assistant_failed", { key, code });
    await ports.store.needsReview(key, code).catch(() => ports.log("owner_receipt_review_write_failed", { key, code: "receipt_persistence_failed" }));
    return { handled: true, status: mutationStarted ? "reconcile_required" : "failed" };
  }
}
