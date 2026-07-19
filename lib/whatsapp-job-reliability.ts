export const WHATSAPP_JOB_ATTEMPTS_PER_CYCLE = 8;
export const WHATSAPP_JOB_LEASE_SECONDS = 5 * 60;
export const WHATSAPP_JOB_MAX_RETRY_DELAY_SECONDS = 5 * 60;

export function getWhatsAppJobCycleAttempt(attemptCount: number, manualRequeueCount: number) {
  return Math.max(1, attemptCount - Math.max(0, manualRequeueCount) * WHATSAPP_JOB_ATTEMPTS_PER_CYCLE);
}

export function getWhatsAppJobRetryDelaySeconds(attemptCount: number, manualRequeueCount = 0) {
  const cycleAttempt = getWhatsAppJobCycleAttempt(attemptCount, manualRequeueCount);
  return Math.min(WHATSAPP_JOB_MAX_RETRY_DELAY_SECONDS, 2 ** Math.max(1, cycleAttempt));
}

export function isWhatsAppJobTerminal(attemptCount: number, maxAttempts: number) {
  return attemptCount >= Math.max(1, maxAttempts);
}
