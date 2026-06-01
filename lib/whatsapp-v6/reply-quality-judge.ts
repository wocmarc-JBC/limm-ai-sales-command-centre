import type { V6QualityResult, V6Understanding, V6VerifiedContext } from "@/lib/whatsapp-v6/types";

const bannedGenericReply = "I'll help route this properly";
const bannedOverClaim =
  "Thanks, we've received the floor plan/image and property type, scope, site photos, preferred appointment time and design references.";

function questionCount(reply: string) {
  return (reply.match(/\?/g) ?? []).length;
}

function answersActualQuestion(reply: string, understanding: V6Understanding) {
  const intents = understanding.detectedIntents;
  if (intents.includes("kitchen_renovation")) return /\bkitchen renovation\b|\bkitchen\b/i.test(reply);
  if (intents.includes("demolition_hacking") || intents.includes("structural_wall")) return /\bwall\b|\bdemolition\b|\bhacking\b|\bwall type\b/i.test(reply);
  if (intents.includes("price_question")) return /\bI understand you'd like a rough idea\b/i.test(reply);
  if (intents.includes("appointment_request")) return /\bnot confirmed yet\b|\bcheck availability\b/i.test(reply);
  if (intents.includes("portfolio_request")) return /instagram\.com\/limmworks/i.test(reply);
  if (intents.includes("approval_submission")) return /\bdepends\b|\bsubmission\b|\brequirements\b/i.test(reply);
  return reply.trim().length > 0;
}

function overClaimsContext(reply: string, context: V6VerifiedContext) {
  if (reply.includes(bannedOverClaim)) return true;
  const receivedClaims = [
    { fact: "floor plan", pattern: /\bwe(?:'|’)ve received the floor plan\b/i },
    { fact: "scope", pattern: /\bwe(?:'|’)ve received (?:the )?(?:.*\band\b\s*)?scope\b/i },
    { fact: "site photos", pattern: /\bwe(?:'|’)ve received (?:the )?(?:.*\band\b\s*)?site photos\b/i },
    { fact: "address/area", pattern: /\bwe(?:'|’)ve received (?:the )?(?:.*\band\b\s*)?address\/area\b/i },
    { fact: "design references", pattern: /\bwe(?:'|’)ve received (?:the )?(?:.*\band\b\s*)?design references\b/i }
  ];
  return receivedClaims.some((claim) => claim.pattern.test(reply) && !context.confirmedFacts.includes(claim.fact));
}

export function judgeV6ReplyQuality(input: {
  reply: string;
  understanding: V6Understanding;
  context: V6VerifiedContext;
}): V6QualityResult {
  const rewriteReason: string[] = [];
  const answeredActualQuestion = answersActualQuestion(input.reply, input.understanding);
  const soundsHuman = /\b(hi|yes|thanks|I understand|we can help|sorry)\b/i.test(input.reply) && !/generic form/i.test(input.reply);
  const notOverLong = input.reply.length <= 850;
  const notGenericFormReply = !input.reply.includes(bannedGenericReply);
  const notOverClaimingContext = !overClaimsContext(input.reply, input.context);
  const asksOnlyUsefulNextQuestion = questionCount(input.reply) <= 2;

  if (!answeredActualQuestion) rewriteReason.push("did_not_answer_actual_question");
  if (!soundsHuman) rewriteReason.push("not_human_enough");
  if (!notOverLong) rewriteReason.push("too_long_for_whatsapp");
  if (!notGenericFormReply) rewriteReason.push("generic_route_reply");
  if (!notOverClaimingContext) rewriteReason.push("context_over_claim");
  if (!asksOnlyUsefulNextQuestion) rewriteReason.push("too_many_questions");

  return {
    answeredActualQuestion,
    soundsHuman,
    notOverLong,
    notGenericFormReply,
    notOverClaimingContext,
    ok: rewriteReason.length === 0,
    rewriteReason
  };
}

export function v6QualityFallback(understanding: V6Understanding) {
  if (understanding.detectedIntents.includes("kitchen_renovation")) {
    return "Hi, yes we can help with kitchen renovation. Could you share whether this is for a landed house, condo or commercial unit, and what you're planning to change in the kitchen? If you have a floor plan or photos, you can send them over for an initial project review.";
  }
  return "Thanks for reaching out. We can help review your renovation enquiry. Could you share your property type, basic scope, and any floor plan or photos if available for an initial project review?";
}
