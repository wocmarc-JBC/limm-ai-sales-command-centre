import type { Lead, LeadMessage } from "@/lib/types";

export type WhatsAppReplyQualityGateResult = {
  replyText: string;
  rewritten: boolean;
  reason: string;
  handoffRequired: boolean;
  answeredDirectQuestion: boolean;
  askedNextBestQuestion: boolean;
  questionCount: number;
  knownFloorPlan: boolean;
  knownSitePhotos: boolean;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9\u4e00-\u9fff?$\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function messageText(message: LeadMessage) {
  const metadata = message.metadata ?? {};
  return [
    message.body,
    metadata.caption,
    metadata.filename,
    metadata.mimeType,
    metadata.messageType,
    metadata.fileCategory
  ].filter(Boolean).map(String).join(" ");
}

function inboundHistory(messages: LeadMessage[]) {
  return messages
    .filter((message) => message.direction === "inbound")
    .map(messageText)
    .join("\n");
}

function leadContext(lead: Lead) {
  const intake = lead.intakeProfile;
  return [
    lead.propertyType,
    lead.projectAddress,
    lead.postalCode,
    lead.scopeSummary,
    lead.serviceType,
    intake?.propertyType,
    intake?.propertyAreaOrAddress,
    intake?.scopeOfWork,
    intake?.floorPlanStatus,
    intake?.sitePhotosStatus,
    intake?.budgetExpectation,
    intake?.timeline,
    intake?.keyCollectionDate,
    intake?.preferredMeetingTiming,
    intake?.occupants,
    intake?.helper,
    intake?.pets
  ].filter(Boolean).map(String).join(" ");
}

function detectsFrustration(text: string) {
  return /\b(?:wtf|stupid|nonsense|shit|already told you|why (?:do )?you keep repeating|why ask again|you asked already|are you blind|floorplan already sent|floor plan already sent|photos already (?:sent|have been sent))\b|\?\?\?/.test(text);
}

function detectsFloorPlan(text: string) {
  return /floor\s*plan|floorplan|layout drawing|drawing attached|plan attached|document.*(?:plan|layout)|(?:plan|floorplan).*(?:sent|received|uploaded|attached)/.test(text);
}

function detectsSitePhotos(text: string) {
  return /site photo|site photos|photos?.*(?:sent|received|uploaded|attached)|image.*(?:sent|received|uploaded|attached)|message type image|image\/jpeg|image\/png/.test(text);
}

function directAnswer(input: {
  text: string;
  intent: string;
  knownFloorPlan: boolean;
  knownSitePhotos: boolean;
}) {
  const { text, intent, knownFloorPlan, knownSitePhotos } = input;

  if (/laminated? wall cladding|laminate wall cladding/.test(text)) {
    return "Yes, we can do laminated wall cladding. The suitable backing, laminate type and joint detailing will depend on the wall condition and the finish you want. Is this for a feature wall, bedroom, living room or another area?";
  }

  if (intent === "hacking_wall" || /can (?:you )?(?:hack|remove|demo).*(?:wall)|wall.*(?:hack|remove|demo)/.test(text)) {
    const evidence = knownFloorPlan
      ? "We already have the floor plan, so the next step is to identify the exact wall and check whether it is structural or contains concealed services."
      : "We will need the floor plan and exact wall location to check whether it is structural or contains concealed services.";
    return `We can assess the wall hacking, but we cannot confirm it from a photo alone. ${evidence} Which wall are you planning to remove?`;
  }

  if (intent === "timeline_question" || intent === "timeline_followup" || /\b\d+\s*months?.*(?:finish|complete)|(?:finish|complete).*\b\d+\s*months?/.test(text)) {
    return "Three months may be possible for some renovation scopes, but it can be tight for a full landed A&A project. It depends on approvals, structural work, material lead times and the final scope. Is the deadline tied to your move-in date?";
  }

  if (intent === "appointment_request" || intent === "office_visit_request" || /\b(?:appointment|meeting|meet|appt|office visit)\b/.test(text)) {
    return "Your preferred meeting time is noted, but it is not confirmed yet because Marcus needs to check availability. We will confirm the slot or propose the nearest available timing.";
  }

  if (intent === "portfolio_request" || /past works?|portfolio|project photos?/.test(text)) {
    return "You can view our past works here: https://www.instagram.com/limmworks/\n\nWe can also shortlist more relevant examples after reviewing your property and scope.";
  }

  if (intent === "identity_question" || /are you (?:ai|human)|chatbot|\bbot\b/.test(text)) {
    return "This WhatsApp chat is assisted by LIMM's enquiry assistant. Important project details and any matters needing judgment are routed to Marcus and the team.";
  }

  if (intent === "price_question" || /how much|roughly|rough cost|price|cost|quotation|quote/.test(text)) {
    if (knownFloorPlan || knownSitePhotos) {
      return "I understand you are checking whether the project is within budget. We already have the files you sent, so I will not ask for them again. The useful next step is for the team to review the proposed scope and advise a realistic cost direction.";
    }
    return "Cost depends mainly on the property, work scope, site condition and material level, so I do not want to give you a misleading figure. What are the main areas you plan to renovate?";
  }

  return "";
}

function stripKnownFileRequests(reply: string, knownFloorPlan: boolean, knownSitePhotos: boolean) {
  let result = reply;
  if (knownFloorPlan) {
    result = result
      .replace(/(?:Could|Can|May) you (?:please )?(?:send|share)(?: over)? (?:your |the )?floor\s*plan[^?.!]*[?.!]?/gi, "")
      .replace(/(?:send|share)(?: over)? (?:your |the )?floor\s*plan[^?.!]*[?.!]?/gi, "");
  }
  if (knownSitePhotos) {
    result = result
      .replace(/(?:Could|Can|May) you (?:please )?(?:send|share)(?: over)? (?:your |the )?(?:site )?photos?[^?.!]*[?.!]?/gi, "")
      .replace(/(?:send|share)(?: over)? (?:your |the )?(?:site )?photos?[^?.!]*[?.!]?/gi, "");
  }
  return result.replace(/\s{2,}/g, " ").replace(/\s+([,.?!])/g, "$1").trim();
}

function capQuestions(reply: string) {
  const parts = reply.match(/[^.!?]+[.!?]?/g) ?? [reply];
  let usedQuestion = false;
  const kept: string[] = [];
  for (const part of parts) {
    const isQuestion = part.includes("?");
    if (isQuestion && usedQuestion) continue;
    if (isQuestion) usedQuestion = true;
    if (part.trim()) kept.push(part.trim());
  }
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

function countQuestions(reply: string) {
  return (reply.match(/\?/g) ?? []).length;
}

export function improveWhatsAppReplyQuality(input: {
  candidateReply: string;
  inboundMessageText: string;
  intent: string;
  lead: Lead;
  previousMessages: LeadMessage[];
}): WhatsAppReplyQualityGateResult {
  const inbound = normalize(input.inboundMessageText);
  const history = normalize(`${inboundHistory(input.previousMessages)} ${leadContext(input.lead)}`);
  const knownFloorPlan = detectsFloorPlan(history) || normalize(input.lead.intakeProfile?.floorPlanStatus).includes("received");
  const knownSitePhotos = detectsSitePhotos(history) || normalize(input.lead.intakeProfile?.sitePhotosStatus).includes("received");

  if (detectsFrustration(inbound)) {
    const known = [
      knownFloorPlan ? "floor plan" : "",
      knownSitePhotos ? "site photos" : "",
      input.lead.propertyType ? `${input.lead.propertyType} property` : "",
      input.lead.scopeSummary || input.lead.intakeProfile?.scopeOfWork || ""
    ].filter(Boolean);
    const context = known.length ? ` We already have your ${known.join(", ")}.` : "";
    const replyText = `You're right to be frustrated. We repeated or missed information you had already provided.${context} I've stopped the intake questions and routed the full conversation to Marcus for review.`;
    return {
      replyText,
      rewritten: true,
      reason: "frustration_stop_and_handoff",
      handoffRequired: true,
      answeredDirectQuestion: true,
      askedNextBestQuestion: false,
      questionCount: 0,
      knownFloorPlan,
      knownSitePhotos
    };
  }

  const direct = directAnswer({
    text: inbound,
    intent: input.intent,
    knownFloorPlan,
    knownSitePhotos
  });
  let replyText = direct || input.candidateReply.trim();
  const initial = replyText;
  replyText = stripKnownFileRequests(replyText, knownFloorPlan, knownSitePhotos);
  replyText = capQuestions(replyText);

  if (!replyText) {
    replyText = "Thanks, noted. We have the details shared so far and will review the next practical step.";
  }

  const questionCount = countQuestions(replyText);
  return {
    replyText,
    rewritten: replyText !== input.candidateReply.trim(),
    reason: direct ? "answer_first_override" : replyText !== initial ? "memory_or_question_budget_rewrite" : "pass",
    handoffRequired: false,
    answeredDirectQuestion: Boolean(direct) || !/[?]/.test(inbound),
    askedNextBestQuestion: questionCount === 1,
    questionCount,
    knownFloorPlan,
    knownSitePhotos
  };
}
