import { randomUUID } from "node:crypto";
import { createAuditLog } from "./audit-repository";

export type ConsequentialActionType =
  | "whatsapp_message"
  | "calendar_appointment"
  | "lead_stage_change"
  | "followup_job";

export type VerifiedCompletionStatus = "pending" | "verified" | "failed";

export type VerifiedCompletionReceipt = {
  receiptId: string;
  actionType: ConsequentialActionType;
  entityType: string;
  entityId: string;
  leadId?: string;
  intent: string;
  expectedPostcondition: Record<string, unknown>;
  requestedAt: string;
  actorType: string;
  actorName: string;
  metadata: Record<string, unknown>;
};

type BeginReceiptInput = Omit<VerifiedCompletionReceipt, "receiptId" | "requestedAt" | "actorType" | "actorName" | "metadata"> & {
  receiptId?: string;
  actorType?: string;
  actorName?: string;
  metadata?: Record<string, unknown>;
};

export type CompletionObservation = {
  observedEvidence: Record<string, unknown>;
  independentlyObserved?: boolean;
  postconditionMatched?: boolean;
  terminalFailure?: boolean;
  failureReason?: string;
  observedAt?: string;
};

function statusForObservation(observation: CompletionObservation): VerifiedCompletionStatus {
  if (observation.terminalFailure) return "failed";
  if (observation.independentlyObserved && observation.postconditionMatched) return "verified";
  return "pending";
}

async function persistReceipt(
  receipt: VerifiedCompletionReceipt,
  status: VerifiedCompletionStatus,
  observation?: CompletionObservation
) {
  const observedAt = observation?.observedAt ?? new Date().toISOString();
  return createAuditLog({
    actorType: receipt.actorType,
    actorName: receipt.actorName,
    action: `verified_completion_${status}`,
    entityType: receipt.entityType,
    entityId: receipt.entityId,
    summary: `${receipt.actionType} completion is ${status}.`,
    beforeData: null,
    afterData: {
      receiptId: receipt.receiptId,
      actionType: receipt.actionType,
      status,
      intent: receipt.intent,
      expectedPostcondition: receipt.expectedPostcondition,
      observedEvidence: observation?.observedEvidence ?? null,
      independentlyObserved: Boolean(observation?.independentlyObserved),
      postconditionMatched: Boolean(observation?.postconditionMatched),
      failureReason: observation?.failureReason ?? "",
      requestedAt: receipt.requestedAt,
      observedAt
    },
    metadata: {
      ...receipt.metadata,
      verifiedCompletionAdapter: true,
      receiptId: receipt.receiptId,
      actionType: receipt.actionType,
      leadId: receipt.leadId ?? ""
    }
  });
}

export async function beginVerifiedCompletion(input: BeginReceiptInput): Promise<VerifiedCompletionReceipt> {
  const receipt: VerifiedCompletionReceipt = {
    ...input,
    receiptId: input.receiptId ?? randomUUID(),
    requestedAt: new Date().toISOString(),
    actorType: input.actorType ?? "system",
    actorName: input.actorName ?? "Verified Completion Adapter",
    metadata: input.metadata ?? {}
  };
  await persistReceipt(receipt, "pending");
  return receipt;
}

/**
 * Completion is deliberately fail-closed: provider acceptance, an update
 * response, or an attempted write stays pending. Only a separate observation
 * that matches the expected postcondition can produce `verified`.
 */
export async function observeVerifiedCompletion(
  receipt: VerifiedCompletionReceipt,
  observation: CompletionObservation
): Promise<VerifiedCompletionStatus> {
  const status = statusForObservation(observation);
  await persistReceipt(receipt, status, observation);
  return status;
}

export function restoreVerifiedCompletionReceipt(input: VerifiedCompletionReceipt) {
  return input;
}
