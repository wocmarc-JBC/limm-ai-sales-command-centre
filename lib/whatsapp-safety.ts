export const WHATSAPP_SAFE_FALLBACK_REPLY =
  "Thanks for reaching out. To review your renovation enquiry properly, could you send your floor plan or site photos if available? We can then arrange an initial project review.";

const blockedPatterns = [
  { pattern: /\bS\$\s*\d{2,}|\bSGD\s*\d{2,}|\$\s*\d{2,}|\b\d{2,}\s*k\b|\b\d{5,}\b/i, reason: "pricing amount" },
  { pattern: /\bquote range\b|\bprice range\b|\brough estimate\b|\bestimated price\b|\bprice estimate\b|\bpackage price\b/i, reason: "pricing wording" },
  { pattern: /\bfree consultation\b/i, reason: "forbidden consultation wording" },
  { pattern: /\bguarantee(?:d)? approval\b|\bapproval (?:is )?(?:confirmed|guaranteed)\b/i, reason: "approval promise" },
  // Blocks unsafe permit certainty such as "confirmed no permit".
  { pattern: /\bno permit (?:is )?(?:needed|required)\b|\bpermit (?:is )?(?:not needed|not required|confirmed)\b|\bconfirmed no permit\b/i, reason: "permit certainty" },
  { pattern: /\bguarantee(?:d)? completion\b|\bcompletion date (?:is )?(?:confirmed|guaranteed)\b/i, reason: "completion guarantee" },
  // Blocks unsafe hacking certainty such as "confirmed can hack".
  { pattern: /\b(?:can|confirmed to|confirmed can) hack\b|\bwall can be hacked\b/i, reason: "hacking certainty" },
  { pattern: /\bstructural(?:ly)? (?:safe|confirmed|certain|feasible)\b/i, reason: "structural certainty" },
  { pattern: /\bcalendar booking confirmed\b|\bwe have booked\b|\bappointment confirmed\b/i, reason: "final appointment confirmation" }
];

export function validateWhatsAppAutoReply(reply: string) {
  const errors = blockedPatterns.filter((item) => item.pattern.test(reply)).map((item) => item.reason);
  if (!/\binitial project review\b/i.test(reply)) {
    errors.push("missing initial project review wording");
  }
  return {
    ok: errors.length === 0,
    errors
  };
}
