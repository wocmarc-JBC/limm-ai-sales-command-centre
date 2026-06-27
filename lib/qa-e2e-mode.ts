export const QA_E2E_RUN_ID = process.env.QA_RUN_ID || process.env.QA_E2E_RUN_ID || "QA_RUN_LOCAL";

export function isQaE2EMode() {
  return process.env.QA_E2E_MODE === "true" || process.env.QA_E2E_MODE === "1";
}

export function qaE2eSafetyMetadata() {
  return {
    qaE2eMode: isQaE2EMode(),
    qaRunId: QA_E2E_RUN_ID,
    dryRunOnly: true,
    noWhatsAppSend: true,
    noEmailSend: true,
    noCalendarBooking: true,
    noHardDelete: true,
    noProductionClientMutation: true,
    noPriceGuideAutomation: true
  };
}
