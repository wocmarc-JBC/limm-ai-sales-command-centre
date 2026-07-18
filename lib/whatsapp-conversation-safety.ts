import type { LeadMessage } from "@/lib/types";

export const SEMANTIC_DUPLICATE_SIMILARITY_THRESHOLD = 0.85;
export const SEMANTIC_DUPLICATE_REPLY_WINDOW = 5;

export type UnansweredQuestionCategory =
  | "price"
  | "appointment"
  | "file_status"
  | "portfolio"
  | "timeline"
  | "hacking_or_approval"
  | "renovation_scope"
  | "general";

export type LatestUnansweredQuestion = {
  messageId: string;
  providerMessageId: string;
  text: string;
  normalizedText: string;
  category: UnansweredQuestionCategory;
  askedAt: string;
  answered: false;
};

export type SemanticDuplicateResult = {
  blocked: boolean;
  threshold: number;
  windowSize: number;
  comparedReplyCount: number;
  highestSimilarity: number;
  matchedReplyId: string;
  matchedReplyText: string;
  candidateSignature: string;
  reason: "semantic_duplicate_reply" | "pass";
};

function normalize(text: unknown) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/https?:\/\/\S+|www\.\S+/g, " link ")
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function timestamp(message: LeadMessage) {
  const parsed = Date.parse(message.createdAt || message.providerTimestamp || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function questionCategory(text: string): UnansweredQuestionCategory {
  if (/\bhow much\b|\bprice\b|\bquote\b|\bquotation\b|\bcost\b|\broughly\b|\u591a\u5c11\u94b1/.test(text)) return "price";
  if (/\bappointment\b|\bappt\b|\bmeet\b|\bsite visit\b|\bavailable\b|\bslot\b/.test(text)) return "appointment";
  if (/\bfloor\s*plan\b|\bfloorplan\b|\bfile\b|\bphoto\b|\bsee (?:it|this)\b|\breceived\b/.test(text)) return "file_status";
  if (/\bpast work\b|\bportfolio\b|\bproject photos?\b|\binstagram\b/.test(text)) return "portfolio";
  if (/\bhow long\b|\btimeline\b|\bwhen\b|\bstart\b|\bfinish\b|\bcomplete\b/.test(text)) return "timeline";
  if (/\bhack\b|\bwall\b|\bapproval\b|\bpermit\b|\bsubmission\b/.test(text)) return "hacking_or_approval";
  if (/\brenovat\b|\breno\b|\bkitchen\b|\bbathroom\b|\bcarpentry\b|\bscope\b/.test(text)) return "renovation_scope";
  return "general";
}

export function isDirectClientQuestion(text: string) {
  const normalized = normalize(text);
  if (!normalized) return false;
  if (/\?$/.test(String(text).trim())) return true;
  return /^(?:can|could|would|will|do|does|did|is|are|am|have|has|when|where|what|which|who|why|how|may|should)\b/.test(normalized) ||
    /\b(?:how much|how long|can meet|can hack|need approval|received my|see my|got my|any update|what time|which day)\b/.test(normalized) ||
    /\u5417|\u591a\u5c11\u94b1|\u53ef\u4ee5|\u80fd\u4e0d\u80fd|\u51e0\u65f6|\u591a\u4e45/.test(normalized);
}

function isClientFacingOutbound(message: LeadMessage) {
  if (message.direction !== "outbound" || !message.body.trim()) return false;
  const status = String(message.whatsappStatus ?? "").toLowerCase();
  if (status === "failed") return false;
  if (["sent", "delivered", "read"].includes(status)) return true;
  return message.metadata?.manualReply === true || (message.safeToSend && !status);
}

export function identifyLatestUnansweredQuestion(input: {
  messages: LeadMessage[];
  currentMessageText?: string;
  currentProviderMessageId?: string;
  currentCreatedAt?: string;
}): LatestUnansweredQuestion | null {
  const ordered = [...input.messages]
    .filter((message) => message.direction === "inbound" || message.direction === "outbound")
    .sort((a, b) => timestamp(a) - timestamp(b));

  const currentProviderId = input.currentProviderMessageId ?? "";
  if (input.currentMessageText?.trim() && isDirectClientQuestion(input.currentMessageText)) {
    const alreadyPresent = ordered.some((message) =>
      message.direction === "inbound" &&
      ((currentProviderId && message.providerMessageId === currentProviderId) || normalize(message.body) === normalize(input.currentMessageText))
    );
    if (!alreadyPresent) {
      ordered.push({
        id: currentProviderId || "current-inbound-question",
        leadId: "",
        direction: "inbound",
        channel: "whatsapp",
        body: input.currentMessageText,
        safeToSend: false,
        providerMessageId: currentProviderId,
        providerTimestamp: input.currentCreatedAt ?? null,
        whatsappStatus: "received",
        metadata: {},
        createdAt: input.currentCreatedAt ?? new Date().toISOString()
      });
    }
  }

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const message = ordered[index];
    if (message.direction !== "inbound" || !isDirectClientQuestion(message.body)) continue;
    const answeredAfter = ordered.slice(index + 1).some(isClientFacingOutbound);
    if (answeredAfter) continue;
    const normalizedText = normalize(message.body);
    return {
      messageId: message.id,
      providerMessageId: message.providerMessageId ?? "",
      text: message.body.trim(),
      normalizedText,
      category: questionCategory(normalizedText),
      askedAt: message.createdAt,
      answered: false
    };
  }
  return null;
}

function uniqueTokens(text: string) {
  return [...new Set(normalize(text).split(/\s+/).filter(Boolean))];
}

function tokenJaccard(a: string, b: string) {
  const left = new Set(uniqueTokens(a));
  const right = new Set(uniqueTokens(b));
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function wordBigrams(text: string) {
  const words = normalize(text).split(/\s+/).filter(Boolean);
  if (words.length < 2) return words;
  return words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`);
}

function diceCoefficient(a: string, b: string) {
  const left = wordBigrams(a);
  const right = wordBigrams(b);
  if (!left.length && !right.length) return 1;
  if (!left.length || !right.length) return 0;
  const remaining = [...right];
  let matches = 0;
  for (const item of left) {
    const index = remaining.indexOf(item);
    if (index < 0) continue;
    matches += 1;
    remaining.splice(index, 1);
  }
  return (2 * matches) / (left.length + right.length);
}

export function semanticReplySimilarity(a: string, b: string) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  return Math.max(tokenJaccard(left, right), diceCoefficient(left, right));
}

export function replySemanticSignature(text: string) {
  let hash = 2166136261;
  for (const char of normalize(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function latestAiReplies(messages: LeadMessage[]) {
  return [...messages]
    .filter((message) => isClientFacingOutbound(message) && message.metadata?.manualReply !== true)
    .sort((a, b) => timestamp(b) - timestamp(a))
    .slice(0, SEMANTIC_DUPLICATE_REPLY_WINDOW);
}

export function applySemanticDuplicateGuard(candidateReply: string, messages: LeadMessage[]): SemanticDuplicateResult {
  const replies = latestAiReplies(messages);
  let highestSimilarity = 0;
  let matched: LeadMessage | null = null;
  for (const reply of replies) {
    const similarity = semanticReplySimilarity(candidateReply, reply.body);
    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      matched = reply;
    }
  }
  const blocked = Boolean(candidateReply.trim()) && highestSimilarity >= SEMANTIC_DUPLICATE_SIMILARITY_THRESHOLD;
  return {
    blocked,
    threshold: SEMANTIC_DUPLICATE_SIMILARITY_THRESHOLD,
    windowSize: SEMANTIC_DUPLICATE_REPLY_WINDOW,
    comparedReplyCount: replies.length,
    highestSimilarity,
    matchedReplyId: matched?.id ?? "",
    matchedReplyText: blocked ? matched?.body ?? "" : "",
    candidateSignature: replySemanticSignature(candidateReply),
    reason: blocked ? "semantic_duplicate_reply" : "pass"
  };
}

export function applyHumanTakeoverGuard(input: { botPaused?: boolean; humanTakeover?: boolean }) {
  const blocked = Boolean(input.botPaused || input.humanTakeover);
  return {
    blocked,
    reason: blocked ? "human_takeover_or_bot_paused" : "pass"
  } as const;
}
