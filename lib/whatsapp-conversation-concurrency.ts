import type { LeadMessage } from "@/lib/types";

export const WHATSAPP_REPLY_LEASE_SECONDS = 90;
export const WHATSAPP_REPLY_COOLDOWN_SECONDS = 30;
export const WHATSAPP_REPLY_NO_SEND_COOLDOWN_SECONDS = 3;
export const WHATSAPP_BURST_SETTLE_MS = 400;
export const WHATSAPP_REPLY_RESERVATION_BUCKET_SECONDS = 600;

export type ConversationReplyLeaseResult = {
  acquired: boolean;
  reason: "acquired" | "active_processing" | "cooldown_active";
  leaseExpiresAt: string | null;
};

export type ConversationReplyReservationResult = {
  reserved: boolean;
  reason: "reserved" | "lease_not_owned" | "duplicate_reply_reservation";
  reservationId: string | null;
};

type InMemoryLeaseState = {
  ownerToken: string;
  leaseExpiresAt: number;
  cooldownUntil: number;
  reservations: Map<string, { reservationId: string; replySignature: string; reservedAt: number }>;
};

export class InMemoryConversationReplyLeaseCoordinator {
  private readonly states = new Map<string, InMemoryLeaseState>();

  acquire(input: {
    leadId: string;
    ownerToken: string;
    directQuestion: boolean;
    nowMs?: number;
    leaseSeconds?: number;
  }): ConversationReplyLeaseResult {
    const now = input.nowMs ?? Date.now();
    const current = this.states.get(input.leadId) ?? {
      ownerToken: "",
      leaseExpiresAt: 0,
      cooldownUntil: 0,
      reservations: new Map<string, { reservationId: string; replySignature: string; reservedAt: number }>()
    };
    if (current.ownerToken && current.leaseExpiresAt > now && current.ownerToken !== input.ownerToken) {
      this.states.set(input.leadId, current);
      return { acquired: false, reason: "active_processing", leaseExpiresAt: new Date(current.leaseExpiresAt).toISOString() };
    }
    if (!input.directQuestion && current.cooldownUntil > now) {
      current.ownerToken = "";
      current.leaseExpiresAt = 0;
      this.states.set(input.leadId, current);
      return { acquired: false, reason: "cooldown_active", leaseExpiresAt: null };
    }
    current.ownerToken = input.ownerToken;
    current.leaseExpiresAt = now + (input.leaseSeconds ?? WHATSAPP_REPLY_LEASE_SECONDS) * 1000;
    this.states.set(input.leadId, current);
    return { acquired: true, reason: "acquired", leaseExpiresAt: new Date(current.leaseExpiresAt).toISOString() };
  }

  reserve(input: {
    leadId: string;
    ownerToken: string;
    replySignature: string;
    nowMs?: number;
    bucketSeconds?: number;
    leaseSeconds?: number;
  }): ConversationReplyReservationResult {
    const now = input.nowMs ?? Date.now();
    const state = this.states.get(input.leadId);
    if (!state || state.ownerToken !== input.ownerToken || state.leaseExpiresAt <= now) {
      return { reserved: false, reason: "lease_not_owned", reservationId: null };
    }
    const windowMs = (input.bucketSeconds ?? WHATSAPP_REPLY_RESERVATION_BUCKET_SECONDS) * 1000;
    for (const [key, reservation] of state.reservations) {
      if (reservation.reservedAt <= now - windowMs) state.reservations.delete(key);
    }
    const duplicate = [...state.reservations.values()].find(
      (reservation) => reservation.replySignature === input.replySignature && reservation.reservedAt > now - windowMs
    );
    if (duplicate) {
      return { reserved: false, reason: "duplicate_reply_reservation", reservationId: duplicate.reservationId };
    }
    const bucket = Math.floor(now / windowMs);
    const key = `${input.replySignature}:${bucket}`;
    const reservationId = `${input.leadId}:${key}`;
    state.reservations.set(key, { reservationId, replySignature: input.replySignature, reservedAt: now });
    state.leaseExpiresAt = Math.max(
      state.leaseExpiresAt,
      now + (input.leaseSeconds ?? WHATSAPP_REPLY_LEASE_SECONDS) * 1000
    );
    return { reserved: true, reason: "reserved", reservationId };
  }

  release(input: {
    leadId: string;
    ownerToken: string;
    cooldownSeconds: number;
    nowMs?: number;
  }) {
    const now = input.nowMs ?? Date.now();
    const state = this.states.get(input.leadId);
    if (!state || state.ownerToken !== input.ownerToken) return false;
    state.ownerToken = "";
    state.leaseExpiresAt = 0;
    state.cooldownUntil = Math.max(state.cooldownUntil, now + Math.max(0, input.cooldownSeconds) * 1000);
    return true;
  }
}

export function inboundProviderIds(messages: LeadMessage[]) {
  return new Set(
    messages
      .filter((message) => message.direction === "inbound" && message.providerMessageId)
      .map((message) => String(message.providerMessageId))
  );
}

export function findNewInboundProviderIds(plannedMessages: LeadMessage[], refreshedMessages: LeadMessage[]) {
  const planned = inboundProviderIds(plannedMessages);
  return [...inboundProviderIds(refreshedMessages)].filter((providerMessageId) => !planned.has(providerMessageId));
}

export function latestInboundMessage(messages: LeadMessage[]) {
  return [...messages]
    .filter((message) => message.direction === "inbound")
    .sort((a, b) => {
      const aTime = Date.parse(a.createdAt || a.providerTimestamp || "");
      const bTime = Date.parse(b.createdAt || b.providerTimestamp || "");
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    })[0] ?? null;
}

export function replyReservationBucket(nowMs = Date.now()) {
  return Math.floor(nowMs / (WHATSAPP_REPLY_RESERVATION_BUCKET_SECONDS * 1000));
}

export async function settleWhatsAppInboundBurst(delayMs = WHATSAPP_BURST_SETTLE_MS) {
  await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, delayMs)));
}
