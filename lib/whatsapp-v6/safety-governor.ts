import type { V6SafetyResult, V6Understanding } from "@/lib/whatsapp-v6/types";

const unsafeRules: Array<{ key: keyof Omit<V6SafetyResult, "bannedPhrasesRemoved" | "ok">; phrase: string; pattern: RegExp }> = [
  { key: "priceSafe", phrase: "from $", pattern: /\bfrom\s+\$?\d+/i },
  { key: "priceSafe", phrase: "around $", pattern: /\baround\s+\$?\d+/i },
  { key: "priceSafe", phrase: "about $", pattern: /\babout\s+\$?\d+/i },
  { key: "priceSafe", phrase: "estimated $", pattern: /\bestimated\s+\$?\d+/i },
  { key: "priceSafe", phrase: "package price", pattern: /\bpackage price\b/i },
  { key: "priceSafe", phrase: "price range", pattern: /\bprice range\b|\bquote range\b/i },
  { key: "appointmentSafe", phrase: "appointment confirmed", pattern: /\bappointment confirmed\b|\bbooked for you\b|\bconfirmed for (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bsee you on\b|\bcalendar confirmed\b/i },
  { key: "approvalSafe", phrase: "approval guarantee", pattern: /\bapproval sure pass\b|\bno approval needed\b|\bsure can approve\b|\bconfirm no submission\b|\bpermit guaranteed\b/i },
  { key: "hackingSafe", phrase: "hacking certainty", pattern: /\bsure can hack\b|\bconfirm can hack\b|\bwall can be hacked\b/i },
  { key: "portfolioSafe", phrase: "unverified project photo claim", pattern: /\bour completed project\b|\bour past project\b|\bbefore\/after claim\b/i },
  { key: "portfolioSafe", phrase: "forbidden consultation wording", pattern: /\bfree consultation\b/i }
];

function baseSafety(): V6SafetyResult {
  return {
    priceSafe: true,
    appointmentSafe: true,
    approvalSafe: true,
    hackingSafe: true,
    portfolioSafe: true,
    bannedPhrasesRemoved: [],
    ok: true
  };
}

function safeRewrite(understanding: V6Understanding) {
  if (understanding.detectedIntents.includes("price_question")) {
    return "I understand you'd like a rough idea. To advise properly, could you share the scope of work first? Pricing depends on the property type, areas involved, site condition and material direction, so the team should review the details first for an initial project review.";
  }
  if (understanding.detectedIntents.includes("appointment_request")) {
    return "We can help check availability, but the appointment is not confirmed yet. Could you share your property type, property area/address and basic renovation scope so the team can review before confirming for an initial project review?";
  }
  if (understanding.detectedIntents.includes("demolition_hacking") || understanding.detectedIntents.includes("structural_wall")) {
    return "We can help review the wall demolition or hacking request, but it should not be advised blindly. The team needs to check the floor plan, wall type, services and site condition before advising the next step for an initial project review.";
  }
  return "Thanks for reaching out. We can help review your renovation enquiry. Could you share your property type, basic scope, and any floor plan or photos if available for an initial project review?";
}

export function governV6Safety(reply: string, understanding: V6Understanding, calendarEventId?: string | null) {
  const result = baseSafety();
  let rewrittenReply = reply;

  for (const rule of unsafeRules) {
    if (!rule.pattern.test(rewrittenReply)) continue;
    result[rule.key] = false;
    result.bannedPhrasesRemoved.push(rule.phrase);
  }

  if (/\byour appointment has been arranged\b|\bappointment confirmed\b|\bbooked\b/i.test(rewrittenReply) && !calendarEventId) {
    result.appointmentSafe = false;
    result.bannedPhrasesRemoved.push("booking confirmation without calendar event");
  }

  result.ok = result.priceSafe && result.appointmentSafe && result.approvalSafe && result.hackingSafe && result.portfolioSafe;
  if (!result.ok) {
    rewrittenReply = safeRewrite(understanding);
    result.ok = true;
    result.priceSafe = true;
    result.appointmentSafe = true;
    result.approvalSafe = true;
    result.hackingSafe = true;
    result.portfolioSafe = true;
  }

  return { replyText: rewrittenReply, safety: result };
}
