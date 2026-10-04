import type { Notice } from "./types";

export interface OwnerOutboxPorts {
  now(): Date;
  claim(idempotencyKey: string): Promise<"new" | "duplicate" | "reconcile_required">;
  // Recheck current owner registration, company/channel binding, kill switch, opt-out,
  // spam, Meta policy blocks and service window. No marketing follow-up is ever scheduled.
  authorise(notice: Notice): Promise<{ allowed: boolean; code: string }>;
  send(notice: Notice): Promise<
    | { status: "accepted"; providerMessageId: string }
    | { status: "rejected"; code: string }
    | { status: "unknown" }
  >;
  record(idempotencyKey: string, outcome: { status: "provider_accepted" | "blocked" | "failed" | "needs_review"; providerMessageId?: string; code?: string }): Promise<void>;
}

/** Deliberately never returns "delivered". Only a verified Meta delivery callback can do that. */
export async function deliverOwnerNotice(notice: Notice, ports: OwnerOutboxPorts) {
  const claim = await ports.claim(notice.idempotencyKey);
  if (claim !== "new") return claim;
  let sendStarted = false;
  try {
    if (!Number.isFinite(Date.parse(notice.expiresAt)) || Date.parse(notice.expiresAt) <= ports.now().getTime()) {
      await ports.record(notice.idempotencyKey, { status: "blocked", code: "notice_expired" });
      return "blocked";
    }
    const gate = await ports.authorise(notice);
    if (!gate.allowed) {
      await ports.record(notice.idempotencyKey, { status: "blocked", code: gate.code });
      return "blocked";
    }
    if (Date.parse(notice.expiresAt) <= ports.now().getTime()) {
      await ports.record(notice.idempotencyKey, { status: "blocked", code: "notice_expired" });
      return "blocked";
    }
    sendStarted = true;
    const result = await ports.send(notice);
    if (result.status === "accepted" && result.providerMessageId) {
      await ports.record(notice.idempotencyKey, { status: "provider_accepted", providerMessageId: result.providerMessageId });
      return "provider_accepted";
    }
    if (result.status === "rejected") {
      await ports.record(notice.idempotencyKey, { status: "failed", code: result.code });
      return "failed";
    }
    await ports.record(notice.idempotencyKey, { status: "needs_review", code: "send_outcome_unknown" });
    return "needs_review";
  } catch {
    // Never auto-retry a request that might already have reached Meta. Persisted PROCESSING
    // also requires reconciliation if recording this state fails.
    await ports.record(notice.idempotencyKey, { status: "needs_review", code: sendStarted ? "send_outcome_unknown" : "outbox_operation_failed" }).catch(() => undefined);
    return "needs_review";
  }
}
