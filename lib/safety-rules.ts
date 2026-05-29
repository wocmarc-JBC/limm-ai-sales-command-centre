export const forbiddenClientReplyTerms = [
  "free consultation",
  "human review",
  "human escalation",
  "confirmed final price",
  "guaranteed approval",
  "confirmed can hack",
  "confirmed no permit needed",
  "guaranteed completion date",
  "lowest price",
  "cheapest package",
  "cheap package",
  "lead score",
  "CRM",
  "backend",
  "system prompt"
];

export const priceEstimatePatterns = [
  /\bS\$\s*\d/i,
  /\bSGD\s*\d/i,
  /\$\s*\d/i,
  /\b\d+\s*k\s*-\s*\d+\s*k\b/i,
  /\b\d{5,}\s*-\s*\d{5,}\b/i
];

export function assertSafeClientReply(reply: string) {
  const lower = reply.toLowerCase();
  const forbidden = forbiddenClientReplyTerms.filter((term) => lower.includes(term.toLowerCase()));
  const hasPrice = priceEstimatePatterns.some((pattern) => pattern.test(reply));
  return {
    ok: forbidden.length === 0 && !hasPrice,
    forbidden,
    hasPrice
  };
}
