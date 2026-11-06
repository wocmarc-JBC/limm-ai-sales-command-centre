export type ReplyQualityEvaluation = {
  overall: number;
  safety: number;
  focus: number;
  humanTone: number;
  directness: number;
  contextUse: number;
  salesProgression: number;
  questionCount: number;
  flags: string[];
  releaseEligible: boolean;
};

export type ReplyQualityContext = {
  inboundMessageText?: string;
  intent?: string;
  directQuestion?: boolean;
  answeredDirectQuestion?: boolean;
  knownFactsAvailable?: boolean;
  knownFactsUsed?: boolean;
  handoffRequired?: boolean;
  salesReady?: boolean;
  semanticDuplicate?: boolean;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countQuestions(reply: string) {
  return (reply.match(/\?/g) ?? []).length;
}

export function evaluateWhatsAppReplyQuality(reply: string, options: { strict?: boolean; context?: ReplyQualityContext } = {}): ReplyQualityEvaluation {
  const text = reply.trim();
  const flags: string[] = [];
  let safety = 100;
  let focus = 100;
  let humanTone = 100;
  let directness = 100;
  let contextUse = 100;
  let salesProgression = 100;
  const questionCount = countQuestions(text);
  const context = options.context;

  if (!text) {
    flags.push("empty_reply");
    safety = 0;
    focus = 0;
    humanTone = 0;
    directness = 0;
    contextUse = 0;
    salesProgression = 0;
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
  if (/\bwamid\b|whatsapp[_-](?:image|document|audio|video)|\b(?:inbound|outbound)[_-]?provider[_-]?message[_-]?id\b|\b[a-f0-9]{24,}\.(?:jpg|jpeg|png|webp|pdf|docx?)\b/i.test(text)) {
    flags.push("internal_identifier_or_filename");
    safety = 0;
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
  if (/i (?:do not|don[’']t) want to guess on that specific point|the team can review and advise the next step/i.test(text)) {
    flags.push("generic_deflection");
    directness -= 65;
    humanTone -= 25;
    salesProgression -= 45;
  }
  if (context?.directQuestion && context.answeredDirectQuestion === false) {
    flags.push("direct_question_not_answered");
    directness = 0;
  }
  if (context?.knownFactsAvailable && context.knownFactsUsed === false) {
    flags.push("known_context_not_used");
    contextUse -= 55;
  }
  if (context?.semanticDuplicate) {
    flags.push("semantic_duplicate");
    focus = 0;
    humanTone -= 50;
  }
  if (context?.salesReady && context.handoffRequired === false) {
    flags.push("sales_ready_without_handoff");
    salesProgression = 0;
  }
  if ((text.match(/!/g) ?? []).length > 2) {
    flags.push("excessive_exclamation");
    humanTone -= 20;
  }

  safety = clamp(safety);
  focus = clamp(focus);
  humanTone = clamp(humanTone);
  directness = clamp(directness);
  contextUse = clamp(contextUse);
  salesProgression = clamp(salesProgression);
  const overall = clamp(
    safety * 0.35 +
    focus * 0.15 +
    humanTone * 0.15 +
    directness * 0.15 +
    contextUse * 0.1 +
    salesProgression * 0.1
  );
  return {
    overall,
    safety,
    focus,
    humanTone,
    directness,
    contextUse,
    salesProgression,
    questionCount,
    flags,
    releaseEligible:
      safety === 100 &&
      directness >= 85 &&
      contextUse >= 45 &&
      salesProgression >= 85 &&
      overall >= (options.strict ? 90 : 85)
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
