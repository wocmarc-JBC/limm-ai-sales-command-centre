export interface TimeRange { start: string; end: string }

/** Construct only after Meta signature verification and trusted channel resolution. */
export interface VerifiedInbound {
  signatureVerified: boolean;
  companyId: string;
  channelId: string;
  sender: string;
  providerMessageId: string;
  providerTimestamp: string;
  text: string;
}

export interface OwnerRegistration {
  companyId: string;
  channelId: string;
  phone: string;
  calendarResourceId: string;
  enabled: boolean;
  writeEnabled: boolean;
  timezone: "Asia/Singapore";
  defaultDurationMinutes: number;
  // Sunday is a configured day, exactly like every other weekday.
  searchWindows: Record<number, Array<{ startMinute: number; endMinute: number }>>;
  slotStepMinutes: number;
  invitationTtlMinutes: number;
  noticeTtlMinutes: number;
}

export interface CalendarEvent extends TimeRange {
  id: string;
  etag: string;
  calendarResourceId: string;
  title: string;
  status: "confirmed" | "tentative" | "cancelled";
}

export interface Contact {
  id: string;
  companyId: string;
  channelId: string;
  phone: string;
  name: string;
}

export type OwnerCommand =
  | { kind: "help" | "clarify"; reply: string }
  | { kind: "agenda"; range: TimeRange }
  | { kind: "find"; range: TimeRange; durationMinutes: number }
  | { kind: "create"; title: string; slot: TimeRange; reminder: boolean; notify: boolean; contact?: string }
  | { kind: "invite"; title: string; range: TimeRange; durationMinutes: number; contact: string }
  | { kind: "cancel"; selector: string; sourceMinute?: number; range: TimeRange }
  | { kind: "move"; selector: string; sourceMinute?: number; range: TimeRange; targetDate?: string; targetMinute: number; durationMinutes?: number };

export interface Invitation {
  id: string;
  companyId: string;
  channelId: string;
  ownerPhone: string;
  contact: Contact;
  calendarResourceId: string;
  title: string;
  slots: TimeRange[];
  offeredAt: string;
  expiresAt: string;
  status: "pending" | "confirmed" | "declined" | "expired" | "needs_new_slot";
}

export interface Notice {
  idempotencyKey: string;
  companyId: string;
  channelId: string;
  recipientPhone: string;
  audience: "owner" | "client";
  text: string;
  expiresAt: string;
  invitationId?: string;
}

export interface MutationIntent {
  operation: "create" | "move" | "cancel";
  calendarResourceId: string;
  eventId: string;
  expectedEtag?: string;
  slot?: TimeRange;
}

export interface CommandCommit {
  reply: string;
  notices: Notice[];
  eventId?: string;
  invitation?: Invitation;
  invitationUpdate?: { id: string; status: Invitation["status"]; eventId?: string };
}

export interface OwnerAssistantPorts {
  now(): Date;
  ownerForChannel(companyId: string, channelId: string): Promise<OwnerRegistration | null>;
  resolveContact(companyId: string, channelId: string, selector: string): Promise<Contact[]>;
  // Existing Meta-policy, spam, opt-out and service-window controls. Recheck at send time.
  authoriseClientNotice(contact: Contact): Promise<{ allowed: boolean; reason: string }>;
  calendar: {
    capabilities(owner: OwnerRegistration): Promise<{ eventsRead: boolean; freeBusy: boolean; eventsWrite: boolean }>;
    // Fully paginate and expand recurring instances. Throw if the result is incomplete.
    listEvents(owner: OwnerRegistration, range: TimeRange): Promise<CalendarEvent[]>;
    busy(owner: OwnerRegistration, range: TimeRange): Promise<TimeRange[]>;
    // Check current settings, ALL required calendars and existing holds, failing closed on any read error.
    bookingAllowed(owner: OwnerRegistration, slot: TimeRange, options: { ownerApproved: true; excludeEventId?: string }): Promise<{ allowed: boolean; reason: string }>;
    // Must share the current application's calendar-resource lock, across tenants and booking paths.
    withResourceLock<T>(resourceId: string, run: () => Promise<T>): Promise<T>;
    // Adapter must recover 409 by fetching and verifying this deterministic ID, never invent a new ID.
    createEvent(owner: OwnerRegistration, event: TimeRange & { id: string; title: string; reminder: boolean; commandKey: string }): Promise<CalendarEvent>;
    moveEvent(owner: OwnerRegistration, event: CalendarEvent, slot: TimeRange): Promise<CalendarEvent>;
    cancelEvent(owner: OwnerRegistration, event: CalendarEvent): Promise<{ status: "cancelled"; eventId: string; calendarResourceId: string }>;
  };
  store: {
    // Lookup before pending-offer routing, so an already-handled confirmation never
    // falls into sales after its invitation becomes confirmed/declined/expired.
    existingReceipt(key: string, fingerprint: string): Promise<"duplicate" | "reconcile_required" | null>;
    // Atomic, durable uniqueness on key. PROCESSING is never automatically reclaimed/replayed.
    claim(key: string, fingerprint: string): Promise<"new" | "duplicate" | "reconcile_required">;
    // Persist intent and required audit atomically BEFORE any Google mutation;
    // re-authorise the current registered owner, kill switch and write target.
    prepareMutation(key: string, intent: MutationIntent): Promise<void>;
    // Receipt, reply outbox, client notices, invitation and audit commit in one transaction.
    commit(key: string, outcome: CommandCommit): Promise<void>;
    needsReview(key: string, safeCode: string): Promise<void>;
    pendingInvitations(companyId: string, channelId: string, sender: string): Promise<Invitation[]>;
    // Atomic lock/claim on invitation prevents concurrent accept/decline races.
    withInvitationLock<T>(invitationId: string, run: () => Promise<T>): Promise<T>;
    invitationById(id: string): Promise<Invitation | null>;
  };
  log(phase: string, metadata: { key?: string; code?: string }): void;
}

export interface DispatchResult {
  handled: boolean;
  status: "not_owner" | "unauthorised" | "completed" | "duplicate" | "reconcile_required" | "failed";
  // Informational only. All messaging is through the committed durable outbox.
  reply?: string;
}
