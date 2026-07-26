export const REPLY_STRATEGY_RECOMMENDATION_VERSION = "v11.4.12_reply_strategy_recommendations";
export const REPLY_STRATEGY_MIN_REPLIES = 20;
export const REPLY_STRATEGY_MIN_RESPONSES = 8;
export const REPLY_STRATEGY_WARNING_MIN_REPLIES = 10;
export const REPLY_STRATEGY_WARNING_MIN_NEGATIVE = 3;

export type ReplyMovePerformance = {
  move: string;
  replies: number;
  responded: number;
  progressed: number;
  files: number;
  appointments: number;
  quotations: number;
  frustration: number;
  corrections: number;
  responseRatePercent: number;
  progressionRatePercent: number;
};

export type ReplyStrategyRecommendationStatus =
  | "risk_warning"
  | "review_candidate"
  | "monitor"
  | "insufficient_evidence";

export type ReplyStrategyRecommendation = {
  move: string;
  status: ReplyStrategyRecommendationStatus;
  replies: number;
  responded: number;
  responseRatePercent: number;
  progressionPerReplyPercent: number;
  commercialSignalPercent: number;
  frustrationRatePercent: number;
  correctionRatePercent: number;
  evidenceScore: number;
  evidenceLabel: "Strong" | "Sufficient" | "Limited" | "Insufficient";
  rationale: string;
  nextReviewAction: string;
  automaticPromotionAllowed: false;
  marcusApprovalRequired: true;
  version: string;
};

export type ReplyStrategyRecommendationSummary = {
  totalMoves: number;
  eligibleMoves: number;
  reviewCandidateCount: number;
  riskWarningCount: number;
  insufficientEvidenceCount: number;
  minimumReplies: number;
  minimumResponses: number;
  baselineProgressionPerReplyPercent: number;
  recommendations: ReplyStrategyRecommendation[];
  automaticPromotionAllowed: false;
  marcusApprovalRequired: true;
  version: string;
};

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function evidenceLabel(item: ReplyMovePerformance): ReplyStrategyRecommendation["evidenceLabel"] {
  if (item.replies >= 60 && item.responded >= 25) return "Strong";
  if (item.replies >= REPLY_STRATEGY_MIN_REPLIES && item.responded >= REPLY_STRATEGY_MIN_RESPONSES) return "Sufficient";
  if (item.replies >= REPLY_STRATEGY_WARNING_MIN_REPLIES || item.responded >= 5) return "Limited";
  return "Insufficient";
}

function riskWarningEligible(item: ReplyMovePerformance) {
  const negative = item.frustration + item.corrections;
  if (item.replies < REPLY_STRATEGY_WARNING_MIN_REPLIES || negative < REPLY_STRATEGY_WARNING_MIN_NEGATIVE) return false;
  const frustrationRate = percent(item.frustration, item.replies);
  const correctionRate = percent(item.corrections, item.replies);
  const combinedRate = percent(negative, item.replies);
  return frustrationRate >= 15 || correctionRate >= 15 || combinedRate >= 20;
}

function statusPriority(status: ReplyStrategyRecommendationStatus) {
  if (status === "risk_warning") return 0;
  if (status === "review_candidate") return 1;
  if (status === "monitor") return 2;
  return 3;
}

export function buildReplyStrategyRecommendations(moves: ReplyMovePerformance[]): ReplyStrategyRecommendationSummary {
  const eligible = moves.filter((item) =>
    item.replies >= REPLY_STRATEGY_MIN_REPLIES &&
    item.responded >= REPLY_STRATEGY_MIN_RESPONSES
  );
  const eligibleReplies = eligible.reduce((sum, item) => sum + item.replies, 0);
  const eligibleProgressed = eligible.reduce((sum, item) => sum + item.progressed, 0);
  const baselineProgressionPerReplyPercent = percent(eligibleProgressed, eligibleReplies);

  const recommendations = moves.map((item): ReplyStrategyRecommendation => {
    const progressionPerReplyPercent = percent(item.progressed, item.replies);
    const commercialSignals = Math.min(item.replies, item.files + item.appointments + item.quotations);
    const commercialSignalPercent = percent(commercialSignals, item.replies);
    const frustrationRatePercent = percent(item.frustration, item.replies);
    const correctionRatePercent = percent(item.corrections, item.replies);
    const combinedRiskPercent = percent(item.frustration + item.corrections, item.replies);
    const evidence = evidenceLabel(item);
    const enoughEvidence = item.replies >= REPLY_STRATEGY_MIN_REPLIES && item.responded >= REPLY_STRATEGY_MIN_RESPONSES;
    const warning = riskWarningEligible(item);
    const evidenceScore = clamp(
      item.responseRatePercent * 0.25 +
      progressionPerReplyPercent * 0.5 +
      commercialSignalPercent * 0.25 -
      combinedRiskPercent * 0.6
    );

    let status: ReplyStrategyRecommendationStatus = "insufficient_evidence";
    let rationale = `${item.replies}/${REPLY_STRATEGY_MIN_REPLIES} replies and ${item.responded}/${REPLY_STRATEGY_MIN_RESPONSES} observed responses.`;
    let nextReviewAction = "Collect more genuine production outcomes. Do not change the live reply strategy from this sample.";

    if (warning) {
      status = "risk_warning";
      rationale = `${frustrationRatePercent}% frustration and ${correctionRatePercent}% operator correction across ${item.replies} replies.`;
      nextReviewAction = "Review the exact reply wording and corrected examples before this move is used more broadly.";
    } else if (enoughEvidence) {
      const clearsProgression = progressionPerReplyPercent >= Math.max(20, baselineProgressionPerReplyPercent + 5);
      const clearsResponse = item.responseRatePercent >= 50;
      const riskControlled = frustrationRatePercent < 10 && correctionRatePercent < 10;
      if (clearsProgression && clearsResponse && riskControlled && evidenceScore >= 40) {
        status = "review_candidate";
        rationale = `${item.responseRatePercent}% response and ${progressionPerReplyPercent}% progression per reply, with controlled frustration and correction rates.`;
        nextReviewAction = "Marcus may review representative conversations and approve a controlled replay test. Live automatic promotion remains blocked.";
      } else {
        status = "monitor";
        rationale = `${item.responseRatePercent}% response and ${progressionPerReplyPercent}% progression per reply versus a ${baselineProgressionPerReplyPercent}% eligible-move baseline.`;
        nextReviewAction = "Continue measuring. Review wording only if the rate materially improves or risk signals increase.";
      }
    }

    return {
      move: item.move,
      status,
      replies: item.replies,
      responded: item.responded,
      responseRatePercent: item.responseRatePercent,
      progressionPerReplyPercent,
      commercialSignalPercent,
      frustrationRatePercent,
      correctionRatePercent,
      evidenceScore,
      evidenceLabel: evidence,
      rationale,
      nextReviewAction,
      automaticPromotionAllowed: false,
      marcusApprovalRequired: true,
      version: REPLY_STRATEGY_RECOMMENDATION_VERSION
    };
  }).sort((a, b) =>
    statusPriority(a.status) - statusPriority(b.status) ||
    b.evidenceScore - a.evidenceScore ||
    b.replies - a.replies
  );

  return {
    totalMoves: recommendations.length,
    eligibleMoves: eligible.length,
    reviewCandidateCount: recommendations.filter((item) => item.status === "review_candidate").length,
    riskWarningCount: recommendations.filter((item) => item.status === "risk_warning").length,
    insufficientEvidenceCount: recommendations.filter((item) => item.status === "insufficient_evidence").length,
    minimumReplies: REPLY_STRATEGY_MIN_REPLIES,
    minimumResponses: REPLY_STRATEGY_MIN_RESPONSES,
    baselineProgressionPerReplyPercent,
    recommendations,
    automaticPromotionAllowed: false,
    marcusApprovalRequired: true,
    version: REPLY_STRATEGY_RECOMMENDATION_VERSION
  };
}
