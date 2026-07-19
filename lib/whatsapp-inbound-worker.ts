import "server-only";

import { handleWhatsAppInboundMessage } from "@/lib/whatsapp-auto-reply";
import {
  claimWhatsAppInboundJob,
  completeWhatsAppInboundJob,
  retryWhatsAppInboundJob
} from "@/lib/data/whatsapp-inbound-jobs-repository";
import {
  captureWhatsAppWebhookFailure,
  classifyWhatsAppProcessingFailure,
  markWhatsAppWebhookFailureRecovered
} from "@/lib/data/whatsapp-webhook-failures-repository";

export async function processWhatsAppInboundJob(jobId?: string) {
  const job = await claimWhatsAppInboundJob(jobId);
  if (!job) return { status: "idle" as const };
  try {
    const result = await handleWhatsAppInboundMessage(job.message);
    await completeWhatsAppInboundJob(job.id, {
      status: result.status,
      terminalOutcome: result.terminalOutcome,
      leadId: result.leadId
    });
    await markWhatsAppWebhookFailureRecovered({ providerMessageId: job.message.providerMessageId, leadId: result.leadId }).catch(() => false);
    return { status: "completed" as const, jobId: job.id, result };
  } catch (error) {
    const errorCode = classifyWhatsAppProcessingFailure(error);
    await captureWhatsAppWebhookFailure({
      message: job.message,
      failureStage: "durable_job_processing",
      errorCode,
      safeReason: error instanceof Error ? error.message.slice(0, 500) : "unknown_processing_error"
    }).catch(() => false);
    await retryWhatsAppInboundJob(job.id, job.attempt_count, errorCode);
    return { status: "retry_scheduled" as const, jobId: job.id, errorCode };
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
