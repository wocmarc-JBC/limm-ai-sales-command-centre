import {
  detectRenovationShortforms,
  detectWallCount,
  isChineseText,
  isSinglishText,
  normaliseV6Text
} from "@/lib/whatsapp-v6/singapore-renovation-language";
import type { V6Understanding } from "@/lib/whatsapp-v6/types";

function addUnique(target: string[], value: string) {
  if (value && !target.includes(value)) target.push(value);
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

export function understandWhatsAppMessage(text: string, type = "text"): V6Understanding {
  const normalized = normaliseV6Text(text);
  const raw = text.toLowerCase();
  const detectedIntents: string[] = [];
  const detectedScopes: string[] = [];
  const detectedRisks: string[] = [];
  const shortforms = detectRenovationShortforms(text);

  if (type === "audio" || type === "voice") {
    addUnique(detectedIntents, "voice_message");
    addUnique(detectedRisks, "needs_typed_details");
  }

  if (has(raw, /你好|在吗|hello|^hi\b|\bhi\b/)) addUnique(detectedIntents, "greeting_ping");
  if (has(raw, /多少钱|报价|价格/) || has(normalized, /\b(how much|rough|roughly|price|cost|budget|estimate|quotation|quote)\b/i)) {
    addUnique(detectedIntents, "price_question");
    addUnique(detectedRisks, "pricing_request");
  }
  if (has(raw, /预约|见面|会议/) || has(normalized, /\b(appt|appointment|meet|meeting|site visit|come down|come site|next available|available slot|wed(?:nesday)?|tomorrow|saturday|\d{1,2}\s*(?:am|pm))\b/i)) {
    addUnique(detectedIntents, "appointment_request");
    addUnique(detectedRisks, "appointment_needs_availability_check");
  }
  if (has(raw, /作品|案例|照片/) || has(normalized, /\b(past works?|past projects?|project photos?|portfolio|before after|before and after|show me your work|got photo|got landed photo|completed project)\b/i)) {
    addUnique(detectedIntents, "portfolio_request");
  }
  if (has(normalized, /\b(design theme|design concept|design ideas?|style|japandi|modern luxury|minimalist|moodboard)\b/i)) {
    addUnique(detectedIntents, "design_theme");
    addUnique(detectedScopes, "design direction");
  }
  if (has(normalized, /\b(kitchen|wet kitchen|dry kitchen)\b/i)) {
    addUnique(detectedIntents, "kitchen_renovation");
    addUnique(detectedScopes, "kitchen works");
  }
  if (has(normalized, /\b(toilet|bathroom|washroom|wc)\b/i)) {
    addUnique(detectedIntents, "bathroom_renovation");
    addUnique(detectedScopes, "bathroom works");
  }
  if (has(normalized, /\b(carpentry|wardrobe|cabinet|kitchen cabinet|vanity)\b/i)) {
    addUnique(detectedIntents, "carpentry");
    addUnique(detectedScopes, "carpentry");
  }
  if (has(normalized, /\b(landed|terrace|semi d|bungalow|corner terrace|inter terrace)\b/i)) {
    addUnique(detectedIntents, "landed_renovation");
    addUnique(detectedScopes, "landed renovation");
    addUnique(detectedRisks, "landed_or_aa_review");
  }
  if (has(normalized, /\b(a a|aa|a&a|addition|alteration|extend|extension|roofline|add shelter)\b/i)) {
    addUnique(detectedIntents, "aa_works");
    addUnique(detectedScopes, "A&A works");
    addUnique(detectedRisks, "authority_or_submission_review");
  }
  if (has(normalized, /\b(condo|apartment|mcst)\b/i)) {
    addUnique(detectedIntents, "condo_renovation");
    addUnique(detectedScopes, "condo renovation");
  }
  if (has(normalized, /\b(commercial|office|shop|clinic|restaurant|retail)\b/i)) {
    addUnique(detectedIntents, "commercial_renovation");
    addUnique(detectedScopes, "commercial renovation");
    addUnique(detectedRisks, "commercial_review");
  }
  if (has(raw, /敲墙|拆墙/) || has(normalized, /\b(demo|demolish|demolition|hack|hacking|knock|remove|tear down)\b/i)) {
    addUnique(detectedIntents, "demolition_hacking");
    addUnique(detectedScopes, detectWallCount(text) > 0 ? `${detectWallCount(text)} wall demolition` : "demolition or hacking works");
    addUnique(detectedRisks, "wall_or_hacking_review");
  }
  if (has(normalized, /\b(wall|beam|column|structural|load bearing|pe)\b/i)) {
    addUnique(detectedIntents, "structural_wall");
    addUnique(detectedRisks, "structural_or_pe_review");
  }
  if (has(raw, /申请|批准|审批|报批/) || has(normalized, /\b(approval|permit|submission|ura|bca|will pass|need approval)\b/i)) {
    addUnique(detectedIntents, "approval_submission");
    addUnique(detectedRisks, "approval_or_submission_review");
  }
  if (has(normalized, /\b(leak|waterproofing|drainage|roof leaking|seepage|ponding)\b/i)) {
    addUnique(detectedIntents, "waterproofing_drainage");
    addUnique(detectedRisks, "site_condition_review");
  }
  if (has(normalized, /\b(call me|urgent|paid deposit|refund|lawyer|complaint|unhappy|cancel)\b/i)) {
    addUnique(detectedIntents, "human_escalation");
    addUnique(detectedRisks, "human_follow_up_required");
  }
  if (has(normalized, /\b(renovate|renovation|reno|can do|got do|house|home)\b/i)) {
    addUnique(detectedIntents, "general_renovation");
  }
  if (!detectedIntents.length && normalized) addUnique(detectedIntents, "general_renovation");

  return {
    detectedIntents,
    detectedScopes,
    detectedRisks,
    clientQuestion: text.trim(),
    clientTone: detectedRisks.includes("human_follow_up_required") ? "urgent_or_sensitive" : "casual_homeowner",
    singlishDetected: isSinglishText(text),
    chineseDetected: isChineseText(text),
    renovationShortformDetected: shortforms
  };
}
