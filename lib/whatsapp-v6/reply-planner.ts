import type { V6ReplyPlan, V6Understanding, V6VerifiedContext } from "@/lib/whatsapp-v6/types";

function includes(list: string[], value: string) {
  return list.includes(value);
}

export function planV6Reply(input: {
  understanding: V6Understanding;
  context: V6VerifiedContext;
  calendarEventId?: string | null;
}): V6ReplyPlan {
  const { understanding, context } = input;
  const intents = understanding.detectedIntents;
  const askOnlyMissingInfo = [...context.missingFields];
  const safetyNotes: string[] = [];
  const handoffReason: string[] = [];

  if (includes(intents, "price_question")) {
    safetyNotes.push("No pricing, ranges, package prices, or rough estimates.");
    handoffReason.push("price_budget_question");
  }
  if (includes(intents, "appointment_request")) {
    safetyNotes.push("Do not confirm appointment unless a real calendar event exists.");
    handoffReason.push("appointment_request");
  }
  if (includes(intents, "demolition_hacking") || includes(intents, "structural_wall")) {
    safetyNotes.push("Wall demolition/hacking requires drawing, wall type, services and site-condition review.");
    handoffReason.push("hacking_or_structural_question");
  }
  if (includes(intents, "approval_submission")) {
    safetyNotes.push("No approval, permit or submission certainty.");
    handoffReason.push("approval_or_submission_question");
  }
  if (includes(intents, "portfolio_request")) {
    safetyNotes.push("Route to official Instagram; do not claim unverified project photos.");
    handoffReason.push("portfolio_request");
  }
  if (includes(intents, "human_escalation") || understanding.detectedRisks.includes("human_follow_up_required")) {
    safetyNotes.push("Human follow-up required. Do not argue, admit liability, or promise refund.");
    handoffReason.push("urgent_or_sensitive_handoff");
  }
  if (context.hasImageOrFile) handoffReason.push("media_received");
  if (includes(intents, "landed_renovation") || includes(intents, "aa_works") || includes(intents, "commercial_renovation")) {
    handoffReason.push("high_value_or_risk_scope");
  }

  let answerFirst = "Thanks for your message. We can help review the renovation enquiry.";
  if (includes(intents, "kitchen_renovation") && (includes(intents, "demolition_hacking") || includes(intents, "structural_wall"))) {
    answerFirst = "Yes, we can help review the kitchen renovation and wall demolition scope.";
  } else if (includes(intents, "kitchen_renovation")) {
    answerFirst = "Hi, yes we can help with kitchen renovation.";
  } else if (includes(intents, "price_question")) {
    answerFirst = "I understand you'd like a rough idea.";
  } else if (includes(intents, "appointment_request")) {
    answerFirst = "We can help check the requested appointment timing.";
  } else if (includes(intents, "portfolio_request")) {
    answerFirst = "Yes, you can view some of our renovation works and design references.";
  } else if (includes(intents, "demolition_hacking") || includes(intents, "structural_wall")) {
    answerFirst = "We can help review the wall demolition or hacking request.";
  } else if (includes(intents, "approval_submission")) {
    answerFirst = "It depends on the exact scope and property type.";
  } else if (includes(intents, "human_escalation")) {
    answerFirst = "Thanks, the team should follow up with you directly on this.";
  }

  return {
    answerFirst,
    safetyNotes,
    askOnlyMissingInfo,
    handoffNeeded: handoffReason.length > 0,
    handoffReason: [...new Set(handoffReason)]
  };
}
