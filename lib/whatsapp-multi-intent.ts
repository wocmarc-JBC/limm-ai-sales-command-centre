import { type QuestionBankIntentKey } from "@/lib/whatsapp-question-bank";

export type WhatsAppDetectedIntent =
  | "greeting_ping"
  | "appointment_request"
  | "meeting_availability"
  | "design_theme"
  | "landed_renovation"
  | "landed_aa"
  | "price_question"
  | "hacking_wall"
  | "approval_submission"
  | "portfolio_request"
  | "generic_renovation"
  | "floorplan_or_photos_sent"
  | "complaint_or_risk";

export interface WhatsAppMultiIntentResult {
  detectedIntents: WhatsAppDetectedIntent[];
  primaryIntent: WhatsAppDetectedIntent;
  multiIntentDetected: boolean;
  portfolioRequestDetected: boolean;
}

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function isBudgetStatement(text: string) {
  return /\b(?:my\s+)?budget(?:\s+expectation)?(?:\s+is)?(?:\s+around|\s+about)?\s*(?:s\$|\$)?\s*\d+(?:\.\d+)?\s*(?:k|thousand|m|million)?\b/i.test(text) ||
    /\b(?:around|about)\s*(?:s\$|\$)?\s*\d+(?:\.\d+)?\s*(?:k|thousand|m|million)?\s+budget\b/i.test(text) ||
    /\bi have (?:around|about)?\s*(?:s\$|\$)?\s*\d+(?:\.\d+)?\s*(?:k|thousand|m|million)\b/i.test(text);
}

function isActualPriceQuestion(text: string) {
  return /\b(how much|roughly how much|how much roughly|what price|how much.*cost|estimate\?|rough estimate|quotation\?|quote\?|budget how|price\?)\b/i.test(text);
}

const intentPatterns: Array<{ intent: WhatsAppDetectedIntent; pattern: RegExp; priority: number }> = [
  { intent: "complaint_or_risk", pattern: /\b(refund|lawyer|complaint|unhappy|defect|your work.*problem|call me|urgent|paid deposit|cancel project|cancel)\b/i, priority: 1 },
  { intent: "price_question", pattern: /\b(how much|how much ah|roughly|price|price ah|cost|budget|budget how|estimate|quotation|quote|package)\b|多少钱|报价|价格/i, priority: 2 },
  { intent: "appointment_request", pattern: /\b(appt|appointment|can make|can make appt anot|can meet anot|book|schedule|wed(?:nesday)?|tomorrow|\d{1,2}\s*(?:am|pm)|site visit|come site|come down)\b|预约|可以约/i, priority: 3 },
  { intent: "meeting_availability", pattern: /\b(next available|available slot|meeting|meet|when.*available)\b|见面|会议/i, priority: 4 },
  { intent: "hacking_wall", pattern: /\b(hack wall|can hack|can hack wall or not|remove wall|structural wall|load bearing|need pe|wall)\b|敲墙|拆墙/i, priority: 5 },
  { intent: "approval_submission", pattern: /\b(need approval|need approval meh|can approve|approval|permit|submission|ura|bca|will this pass)\b|申请|批准|审批|报批/i, priority: 6 },
  { intent: "portfolio_request", pattern: /\b(past works?|past projects?|project photos?|portfolio|before[-\s]?after|before and after|show me your work|photos of your works?|renovation photos?|completed project|design photos?|got project photo|got landed photo)\b|作品|案例|照片/i, priority: 7 },
  { intent: "design_theme", pattern: /\b(design theme|design concept|style|modern luxury|japandi|minimalist|moodboard|design direction)\b/i, priority: 8 },
  { intent: "landed_aa", pattern: /\b(a&a|a a|addition|alteration|extension|extend kitchen|add shelter|roofline|rebuild)\b/i, priority: 9 },
  { intent: "landed_renovation", pattern: /\b(landed|terrace|semi d|bungalow|corner terrace|inter terrace)\b/i, priority: 10 },
  { intent: "floorplan_or_photos_sent", pattern: /\b(floor plan|floorplan|site photos?|photos?|attached|layout|drawing|sent plan|sent photos?)\b/i, priority: 11 },
  { intent: "greeting_ping", pattern: /\b(hello|hi|are you there|can reply|any update|\?)\b|你好|在吗/i, priority: 12 },
  { intent: "generic_renovation", pattern: /\b(renovate|renovation|reno landed can|can do anot|house|home|works?)\b/i, priority: 13 }
];

export function detectWhatsAppMessageIntents(text: string): WhatsAppMultiIntentResult {
  const normalized = normalise(text);
  const raw = String(text).toLowerCase();
  const found = intentPatterns
    .map((item) => {
      const match = item.pattern.exec(normalized) ?? item.pattern.exec(raw);
      return match ? { intent: item.intent, index: match.index, priority: item.priority } : null;
    })
    .filter(Boolean) as Array<{ intent: WhatsAppDetectedIntent; index: number; priority: number }>;

  const unique = new Map<WhatsAppDetectedIntent, { intent: WhatsAppDetectedIntent; index: number; priority: number }>();
  for (const item of found) {
    const existing = unique.get(item.intent);
    if (!existing || item.index < existing.index) unique.set(item.intent, item);
  }

  const ordered = [...unique.values()].sort((left, right) => {
    if (left.index !== right.index) return left.index - right.index;
    return left.priority - right.priority;
  });
  let detectedIntents = ordered.map((item) => item.intent);
  if (isBudgetStatement(text) && !isActualPriceQuestion(text)) {
    detectedIntents = detectedIntents.filter((intent) => intent !== "price_question");
  }
  const primaryIntent = selectPrimaryDetectedIntent(detectedIntents);

  return {
    detectedIntents: detectedIntents.length ? detectedIntents : ["generic_renovation"],
    primaryIntent,
    multiIntentDetected: detectedIntents.length > 1,
    portfolioRequestDetected: detectedIntents.includes("portfolio_request")
  };
}

function selectPrimaryDetectedIntent(intents: WhatsAppDetectedIntent[]): WhatsAppDetectedIntent {
  const safetyPriority: WhatsAppDetectedIntent[] = [
    "complaint_or_risk",
    "price_question",
    "hacking_wall",
    "approval_submission",
    "appointment_request",
    "meeting_availability",
    "portfolio_request",
    "design_theme",
    "landed_aa",
    "landed_renovation",
    "floorplan_or_photos_sent",
    "greeting_ping",
    "generic_renovation"
  ];
  return safetyPriority.find((intent) => intents.includes(intent)) ?? intents[0] ?? "generic_renovation";
}

export function mapDetectedIntentToQuestionBankIntent(intent: WhatsAppDetectedIntent): QuestionBankIntentKey {
  if (intent === "greeting_ping") return "follow_up_ping";
  if (intent === "meeting_availability") return "appointment_request";
  if (intent === "landed_aa") return "aa_works";
  if (intent === "hacking_wall") return "hacking_demo";
  if (intent === "approval_submission") return "submission_approval";
  if (intent === "portfolio_request") return "design_theme";
  if (intent === "generic_renovation") return "general_enquiry";
  return intent;
}
