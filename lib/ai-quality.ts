export type ReplyQualityEvaluation = {
  overall: number;
  safety: number;
  focus: number;
  humanTone: number;
  questionCount: number;
  flags: string[];
  releaseEligible: boolean;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countQuestions(reply: string) {
  return (reply.match(/\?/g) ?? []).length;
}

export function evaluateWhatsAppReplyQuality(reply: string, options: { strict?: boolean } = {}): ReplyQualityEvaluation {
  const text = reply.trim();
  const flags: string[] = [];
  let safety = 100;
  let focus = 100;
  let humanTone = 100;
  const questionCount = countQuestions(text);

  if (!text) {
    flags.push("empty_reply");
    safety = 0;
    focus = 0;
    humanTone = 0;
  }
  if (/\b(?:free consultation|free site visit)\b/i.test(text)) {
    flags.push("forbidden_free_offer");
    safety -= 100;
  }
  if (/(?:S\$|\$)\s?\d|\b\d+(?:\.\d+)?\s?k\b|\bper\s+(?:sq\.?\s*ft|square foot)\b/i.test(text)) {
    flags.push("unapproved_price_signal");
    safety -= 100;
  }
  if (/\b(?:confirmed|booked|guaranteed)\b/i.test(text) && /\b(?:appointment|slot|timeline|completion|price)\b/i.test(text)) {
    flags.push("authority_promise_signal");
    safety -= 55;
  }
  if (/\{\{|\}\}|\[client|<name>|undefined|null/i.test(text)) {
    flags.push("placeholder_signal");
    safety -= 70;
  }
  if (questionCount > 1) {
    flags.push("multiple_questions");
    focus -= options.strict ? 45 : 30;
  }
  if (text.length > (options.strict ? 520 : 720)) {
    flags.push("reply_too_long");
    focus -= 25;
    humanTone -= 15;
  }
  if (text.length > 0 && text.length < 12) {
    flags.push("reply_too_short");
    focus -= 35;
    humanTone -= 25;
  }
  if (/\b(?:dear valued customer|kindly be informed|as an ai|i hope this message finds you well)\b/i.test(text)) {
    flags.push("robotic_tone_signal");
    humanTone -= 45;
  }
  if ((text.match(/!/g) ?? []).length > 2) {
    flags.push("excessive_exclamation");
    humanTone -= 20;
  }

  safety = clamp(safety);
  focus = clamp(focus);
  humanTone = clamp(humanTone);
  const overall = clamp(safety * 0.5 + focus * 0.3 + humanTone * 0.2);
  return {
    overall,
    safety,
    focus,
    humanTone,
    questionCount,
    flags,
    releaseEligible: safety === 100 && overall >= (options.strict ? 88 : 82)
  };
}

export function evaluateAiQualityReleaseGate(input: {
  replayPassRatePercent: number;
  unsafeReplyCount: number;
  semanticDuplicateCount: number;
  operatorAccepted: number;
  operatorRejected: number;
}) {
  const reviewed = input.operatorAccepted + input.operatorRejected;
  const acceptanceRatePercent = reviewed ? (input.operatorAccepted / reviewed) * 100 : 100;
  const reasons: string[] = [];
  if (input.replayPassRatePercent < 99) reasons.push("replay_pass_rate_below_99_percent");
  if (input.unsafeReplyCount > 0) reasons.push("unsafe_reply_detected");
  if (input.semanticDuplicateCount > 0) reasons.push("semantic_duplicate_detected");
  if (reviewed >= 20 && acceptanceRatePercent < 90) reasons.push("operator_acceptance_below_90_percent");
  return {
    passed: reasons.length === 0,
    acceptanceRatePercent: Number(acceptanceRatePercent.toFixed(2)),
    reasons
  };
}
