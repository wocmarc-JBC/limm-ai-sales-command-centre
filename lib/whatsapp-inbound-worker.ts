import "server-only";

import { handleWhatsAppInboundMessage } from "@/lib/whatsapp-auto-reply";
import { upsertWhatsAppLead } from "@/lib/data/lead-messages-repository";
import {
  claimWhatsAppInboundJob,
  completeWhatsAppInboundJob,
  retryWhatsAppInboundJob
} from "@/lib/data/whatsapp-inbound-jobs-repository";
import { persistWhatsAppReferralContext } from "@/lib/data/whatsapp-referral-context-repository";
import {
  captureWhatsAppWebhookFailure,
  classifyWhatsAppProcessingFailure,
  markWhatsAppWebhookFailureRecovered
} from "@/lib/data/whatsapp-webhook-failures-repository";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp-config";
import type { ParsedWhatsAppMessageWithReferral } from "@/lib/whatsapp-referral-ingestion";

async function prepareReferralContext(message: ParsedWhatsAppMessageWithReferral) {
  if (!message.whatsappReferral) return "not_present" as const;
  try {
    const inboundBody = message.text || message.caption || `[WhatsApp ${message.type || "message"} received]`;
    const lead = await upsertWhatsAppLead({
      phone: normalizeWhatsAppPhone(message.senderPhone),
      contactName: message.contactName,
      latestMessage: inboundBody,
      preserveExistingActivity: true
    });
    await persistWhatsAppReferralContext({
      leadId: lead.id,
      providerMessageId: message.providerMessageId,
      context: message.whatsappReferral
    });
    return "persisted" as const;
  } catch (error) {
    // Referral storage must never turn a successful inbound reply into a retry,
    // because retrying after an external send could create duplicate-send risk.
    console.error("whatsapp_meta_referral_context_prepare_failed", {
      providerMessageId: message.providerMessageId,
      reason: error instanceof Error ? error.message.slice(0, 300) : "unknown_referral_persistence_error",
      replyProcessingContinues: true
    });
    return "failed_non_blocking" as const;
  }
}

export async function processWhatsAppInboundJob(jobId?: string) {
  const job = await claimWhatsAppInboundJob(jobId);
  if (!job) return { status: "idle" as const };
  const startedAt = performance.now();
  const message = job.message as ParsedWhatsAppMessageWithReferral;
  try {
    const referralPersistence = await prepareReferralContext(message);
    const result = await handleWhatsAppInboundMessage(job.message);
    await completeWhatsAppInboundJob(
      job.id,
      job.attempt_count,
      {
        status: result.status,
        terminalOutcome: result.terminalOutcome,
        leadId: result.leadId,
        referralContextPresent: Boolean(message.whatsappReferral),
        referralPersistence
      },
      performance.now() - startedAt
    );
    await markWhatsAppWebhookFailureRecovered({ providerMessageId: message.providerMessageId, leadId: result.leadId }).catch(() => false);
    return { status: "completed" as const, jobId: job.id, result, referralPersistence };
  } catch (error) {
    const errorCode = classifyWhatsAppProcessingFailure(error);
    await captureWhatsAppWebhookFailure({
      message,
      failureStage: "durable_job_processing",
      errorCode,
      safeReason: error instanceof Error ? error.message.slice(0, 500) : "unknown_processing_error"
    }).catch(() => false);
    const retry = await retryWhatsAppInboundJob({
      jobId: job.id,
      attemptCount: job.attempt_count,
      maxAttempts: job.max_attempts,
      manualRequeueCount: job.manual_requeue_count,
      errorCode,
      durationMs: performance.now() - startedAt
    });
    return {
      status: retry.terminal ? "dead_lettered" as const : "retry_scheduled" as const,
      jobId: job.id,
      errorCode,
      retryAfterSeconds: retry.terminal ? null : retry.delaySeconds
    };
  }
}

export async function drainWhatsAppInboundJobs(limit = 10) {
  const results = [];
  for (let index = 0; index < Math.max(1, Math.min(limit, 25)); index += 1) {
    const result = await processWhatsAppInboundJob();
    if (result.status === "idle") break;
    results.push(result);
  }
  return results;
}
