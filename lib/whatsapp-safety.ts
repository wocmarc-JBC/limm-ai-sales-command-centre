export const WHATSAPP_SAFE_FALLBACK_REPLY =
  "Thanks for reaching out. To review your renovation enquiry properly, could you send your floor plan or site photos if available? We can then arrange an initial project review.";

export const WHATSAPP_ULTRA_SAFE_FALLBACK_REPLY =
  "Thanks for your message. The team will review the details and get back to you shortly. If you have a floor plan, site photos or preferred timing, you can send them here too.";

const blockedPatterns = [
  { pattern: /\bS\$\s*\d{2,}|\bSGD\s*\d{2,}|\$\s*\d{2,}|\b\d{2,}\s*k\b|\b\d{5,}\b/i, code: "pricing_amount", reason: "pricing amount" },
  { pattern: /\bquote range\b|\bprice range\b|\brough estimate\b|\bestimated price\b|\bprice estimate\b|\bpackage price\b/i, code: "pricing_wording", reason: "pricing wording" },
  { pattern: /\bfrom\s*\$|\baround\s*\$|\bcheap package\b|\bbest price\b/i, code: "pricing_sales_tone", reason: "unsafe pricing or sales wording" },
  { pattern: /\bfree consultation\b/i, code: "forbidden_consultation_wording", reason: "forbidden consultation wording" },
  { pattern: /\bdear\b|\bkindly furnish\b|\brevert accordingly\b|\bhii dear\b|\bwow exciting\b/i, code: "bad_sales_tone", reason: "bad sales tone" },
  { pattern: /\bcontinue sending project details\b|\bteam will review the next step properly\b|\bno problem confirm can\b/i, code: "legacy_or_unsafe_reply_phrase", reason: "legacy or unsafe reply phrase" },
  { pattern: /\bguarantee(?:d)? approval\b|\bapproval (?:is )?(?:confirmed|guaranteed|sure pass)\b|\bapproval sure pass\b|\bsure pass approval\b|\bconfirmed approval\b|\bapproved by (?:hdb|bca|ura|mcst|management|authority)\b/i, code: "approval_promise", reason: "approval promise" },
  // Blocks unsafe permit certainty such as "confirmed no permit".
  { pattern: /\bno permit (?:is )?(?:needed|required)\b|\bpermit (?:is )?(?:not needed|not required|confirmed)\b|\bconfirmed no permit\b/i, code: "permit_certainty", reason: "permit certainty" },
  { pattern: /\bguarantee(?:d)? completion\b|\bcompletion date (?:is )?(?:confirmed|guaranteed)\b/i, code: "completion_guarantee", reason: "completion guarantee" },
  // Blocks unsafe hacking certainty such as "confirmed can hack".
  { pattern: /\b(?:can|confirmed to|confirmed can) hack\b|\bwall can be hacked\b/i, code: "hacking_certainty", reason: "hacking certainty" },
  { pattern: /\bstructural(?:ly)? (?:safe|confirmed|certain|feasible)\b/i, code: "structural_certainty", reason: "structural certainty" },
  { pattern: /\bwe can definitely\b|\bguaranteed\b/i, code: "over_promise", reason: "over-promise" },
  { pattern: /\b(?:legal|medical|financial) advice\b|\b(?:legally|medically|financially) (?:confirmed|guaranteed|safe)\b/i, code: "unsafe_professional_claim", reason: "unsafe legal/medical/financial claim" },
  { pattern: /\b(?:service[_-]?role|supabase[_-]?service|whatsapp[_-]?access[_-]?token|openai[_-]?api[_-]?key)\b/i, code: "secret_or_token_reference", reason: "secret or token reference" }
];

const calendarConfirmationPattern = /\bcalendar booking confirmed\b|\bwe have booked\b|\bappointment confirmed\b|\byour appointment has been arranged\b|\bbooked\b|\bsee you tomorrow\b/i;
const pricingAmountPattern = /\bS\$\s*\d{2,}|\bSGD\s*\d{2,}|\$\s*\d{2,}|\b\d{2,}\s*k\b|\b\d{5,}\b/i;

export type WhatsAppAutoReplyValidationIssue = {
  code: string;
  label: string;
  blocking: boolean;
};

function pricingAmountOnlyAppearsAsClientBudgetExpectation(reply: string) {
  const amountSentences = reply
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => pricingAmountPattern.test(sentence));
  if (!amountSentences.length) return false;
  return amountSentences.every((sentence) =>
    /\bbudget expectation\b|\bbudget you shared\b|\bclient[-\s]?provided budget\b|\byour budget\b/i.test(sentence)
  );
}

export function validateWhatsAppAutoReply(reply: string, options: { calendarEventId?: string } = {}) {
  const trimmedReply = reply.trim();
  const issues: WhatsAppAutoReplyValidationIssue[] = [];

  if (!trimmedReply) {
    issues.push({ code: "empty_reply", label: "empty reply", blocking: true });
  }

  for (const item of blockedPatterns) {
    if (item.code === "pricing_amount" && pricingAmountOnlyAppearsAsClientBudgetExpectation(reply)) {
      continue;
    }
    if (item.pattern.test(reply)) {
      issues.push({ code: item.code, label: item.reason, blocking: true });
    }
  }

  if (calendarConfirmationPattern.test(reply) && !options.calendarEventId) {
    issues.push({
      code: "appointment_confirmation_without_calendar_event",
      label: "final appointment confirmation without calendar event",
      blocking: true
    });
  }

  if (!/\binitial project review\b/i.test(reply)) {
    issues.push({
      code: "missing_initial_project_review_wording",
      label: "missing initial project review wording",
      blocking: false
    });
  }

  const blockingIssues = issues.filter((issue) => issue.blocking);
  const warningIssues = issues.filter((issue) => !issue.blocking);

  return {
    ok: blockingIssues.length === 0,
    errors: blockingIssues.map((issue) => issue.label),
    warnings: warningIssues.map((issue) => issue.label),
    errorCodes: blockingIssues.map((issue) => issue.code),
    errorLabels: blockingIssues.map((issue) => issue.label),
    warningCodes: warningIssues.map((issue) => issue.code),
    warningLabels: warningIssues.map((issue) => issue.label),
    issues
  };
}
