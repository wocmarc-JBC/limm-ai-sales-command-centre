import type { Lead, LeadIntakeChecklistItem, LeadIntakeProfile, LeadMessage } from "@/lib/types";

export const SMART_LEAD_INTAKE_VERSION = "v6.5";
export const MIN_INTAKE_QUESTIONS = 3;
export const MAX_INTAKE_QUESTIONS = 5;

type IntakeFieldDefinition = {
  key: keyof LeadIntakeProfile;
  label: string;
  question: string;
  meetingWeight: number;
  proposalWeight: number;
};

export const intakeFieldDefinitions: IntakeFieldDefinition[] = [
  {
    key: "propertyType",
    label: "Property type",
    question: "What property type should Marcus note, such as landed, condo, HDB, or commercial?",
    meetingWeight: 10,
    proposalWeight: 8
  },
  {
    key: "scopeOfWork",
    label: "Scope of work",
    question: "Which areas are you planning to renovate, and what is the main scope?",
    meetingWeight: 14,
    proposalWeight: 18
  },
  {
    key: "floorPlanStatus",
    label: "Floor plan",
    question: "Do you have a floor plan or drawing available for the team to review?",
    meetingWeight: 12,
    proposalWeight: 16
  },
  {
    key: "sitePhotosStatus",
    label: "Site photos",
    question: "Can you send site photos so Marcus can understand the current condition better?",
    meetingWeight: 10,
    proposalWeight: 12
  },
  {
    key: "propertyAreaOrAddress",
    label: "Address or area",
    question: "Which property area or address should the team use for meeting preparation?",
    meetingWeight: 12,
    proposalWeight: 8
  },
  {
    key: "lifestyleNotes",
    label: "Lifestyle needs",
    question: "How do you use the home daily, and are there lifestyle needs Marcus should consider?",
    meetingWeight: 6,
    proposalWeight: 8
  },
  {
    key: "occupants",
    label: "Occupants",
    question: "Who will be staying there, such as adults, children, elderly family members, or tenants?",
    meetingWeight: 6,
    proposalWeight: 7
  },
  {
    key: "helper",
    label: "Helper",
    question: "Will there be a helper or service area requirement to consider?",
    meetingWeight: 4,
    proposalWeight: 5
  },
  {
    key: "pets",
    label: "Pets",
    question: "Do you have pets or pet-safety needs the layout should account for?",
    meetingWeight: 4,
    proposalWeight: 5
  },
  {
    key: "safetyNeeds",
    label: "Safety needs",
    question: "Are there any safety needs, elderly-friendly features, child safety, or accessibility concerns?",
    meetingWeight: 6,
    proposalWeight: 8
  },
  {
    key: "budgetExpectation",
    label: "Budget expectation",
    question: "Do you have a budget expectation or comfort level Marcus should note for planning only?",
    meetingWeight: 5,
    proposalWeight: 10
  },
  {
    key: "timeline",
    label: "Timeline",
    question: "Is there a target timeline, key collection date, or move-in date Marcus should note?",
    meetingWeight: 7,
    proposalWeight: 8
  },
  {
    key: "keyCollectionDate",
    label: "Key collection",
    question: "When is key collection, if relevant?",
    meetingWeight: 3,
    proposalWeight: 3
  },
  {
    key: "moveInDate",
    label: "Move-in date",
    question: "Is there a target move-in date the team should plan around?",
    meetingWeight: 4,
    proposalWeight: 5
  },
  {
    key: "preferredMeetingTiming",
    label: "Preferred meeting timing",
    question: "What meeting timing is preferred, subject to Marcus and team availability?",
    meetingWeight: 8,
    proposalWeight: 3
  }
];

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function getMessageContext(messages: LeadMessage[]) {
  const joined = messages
    .slice(0, 12)
    .map((message) => `${message.body ?? ""} ${JSON.stringify(message.metadata ?? {})}`)
    .join(" ")
    .toLowerCase();

  return {
    floorPlan: includesAny(joined, [/\bfloor\s*plan\b/, /\bfloorplan\b/, /\bdrawing\b/, /\blayout\b/, /\bplan attached\b/, /\bpdf\b/]),
    sitePhotos: includesAny(joined, [/\bsite photo/, /\bphoto\b/, /\bimage\b/, /\bpicture\b/, /\battached\b/]),
    scope: includesAny(joined, [/\bscope\b/, /\bkitchen\b/, /\bbathroom\b/, /\bcarpentr/, /\bhacking\b/, /\bextension\b/, /\brenovat/]),
    propertyType: includesAny(joined, [/\blanded\b/, /\bcondo\b/, /\bhdb\b/, /\bcommercial\b/, /\bshop\b/, /\boffice\b/]),
    address: includesAny(joined, [/\baddress\b/, /\bpostal\b/, /\bstreet\b/, /\broad\b/, /\bavenue\b/, /\bdrive\b/, /\bblk\b/, /\bunit\b/]),
    preferredTiming: includesAny(joined, [/\bwed\b/, /\bwednesday\b/, /\btomorrow\b/, /\b\d{1,2}\s*(am|pm)\b/, /\bslot\b/, /\bmeeting\b/])
  };
}

function inferProfileFromLead(lead: Lead, messages: LeadMessage[] = []): LeadIntakeProfile {
  const saved = lead.intakeProfile ?? {};
  const messageContext = getMessageContext(messages);
  const leadText = `${lead.propertyType} ${lead.scopeSummary} ${lead.propertyArea} ${lead.projectAddress} ${lead.preferredContactTime} ${lead.lastClientMessage}`.toLowerCase();

  const hasFloorPlan = Boolean(normalize(saved.floorPlanStatus)) ||
    messageContext.floorPlan ||
    includesAny(leadText, [/\bfloor\s*plan\b/, /\bfloorplan\b/, /\bdrawing\b/, /\blayout\b/]);

  const hasSitePhotos = Boolean(normalize(saved.sitePhotosStatus)) ||
    messageContext.sitePhotos ||
    includesAny(leadText, [/\bsite photo/, /\bphoto\b/, /\bimage\b/, /\bpicture\b/]);

  return {
    ...saved,
    propertyType: normalize(saved.propertyType) || normalize(lead.propertyType) || (messageContext.propertyType ? "Mentioned in conversation" : ""),
    propertyAreaOrAddress: normalize(saved.propertyAreaOrAddress) || normalize(lead.projectAddress) || normalize(lead.propertyArea) || (messageContext.address ? "Mentioned in conversation" : ""),
    scopeOfWork: normalize(saved.scopeOfWork) || normalize(lead.scopeSummary) || (messageContext.scope ? "Mentioned in conversation" : ""),
    preferredMeetingTiming: normalize(saved.preferredMeetingTiming) || normalize(lead.preferredContactTime) || (messageContext.preferredTiming ? "Mentioned in conversation" : ""),
    floorPlanStatus: hasFloorPlan ? normalize(saved.floorPlanStatus) || "Received or likely received" : "",
    sitePhotosStatus: hasSitePhotos ? normalize(saved.sitePhotosStatus) || "Received or likely received" : "",
    timeline: normalize(saved.timeline),
    keyCollectionDate: normalize(saved.keyCollectionDate),
    moveInDate: normalize(saved.moveInDate),
    budgetExpectation: normalize(saved.budgetExpectation),
    lifestyleNotes: normalize(saved.lifestyleNotes),
    occupants: normalize(saved.occupants),
    helper: normalize(saved.helper),
    pets: normalize(saved.pets),
    safetyNeeds: normalize(saved.safetyNeeds)
  };
}

function itemStatus(value: string): LeadIntakeChecklistItem["status"] {
  if (!value) return "missing";
  if (/mentioned|likely/i.test(value)) return "partial";
  return "collected";
}

function calculateScore(checklist: LeadIntakeChecklistItem[], key: "meetingWeight" | "proposalWeight") {
  const total = checklist.reduce((sum, item) => sum + item[key], 0);
  const collected = checklist.reduce((sum, item) => {
    if (item.status === "collected") return sum + item[key];
    if (item.status === "partial") return sum + Math.round(item[key] * 0.6);
    return sum;
  }, 0);
  return total ? Math.min(100, Math.round((collected / total) * 100)) : 0;
}

export function buildLeadIntakePlan(lead: Lead, messages: LeadMessage[] = []) {
  const profile = inferProfileFromLead(lead, messages);
  const checklist = intakeFieldDefinitions.map((definition) => {
    const value = normalize(profile[definition.key]);
    return {
      key: String(definition.key),
      label: definition.label,
      status: itemStatus(value),
      value,
      question: definition.question,
      meetingWeight: definition.meetingWeight,
      proposalWeight: definition.proposalWeight
    } satisfies LeadIntakeChecklistItem;
  });
  const missing = checklist.filter((item) => item.status === "missing");
  const questionLimit = Math.min(MAX_INTAKE_QUESTIONS, Math.max(MIN_INTAKE_QUESTIONS, missing.length));
  const suggestedQuestions = missing.slice(0, questionLimit).map((item) => item.question);
  const meetingReadinessScore = calculateScore(checklist, "meetingWeight");
  const proposalReadinessScore = calculateScore(checklist, "proposalWeight");
  const missingInfo = missing.map((item) => item.key);
  const completed = checklist.filter((item) => item.status !== "missing").map((item) => item.key);

  const nextBestQuestion = suggestedQuestions.length
    ? `Ask ${suggestedQuestions.length} missing intake question${suggestedQuestions.length === 1 ? "" : "s"} before meeting prep.`
    : "Intake profile is ready for Marcus to review before the initial project review.";

  return {
    profile: {
      ...profile,
      meetingReadinessScore,
      proposalReadinessScore,
      missingInfo,
      suggestedQuestions,
      checklist,
      trace: {
        version: SMART_LEAD_INTAKE_VERSION,
        intakeChecklistBuilt: true,
        missingInfoDetected: true,
        questionLimitApplied: true,
        maxQuestions: MAX_INTAKE_QUESTIONS,
        noPriceReplyRule: true,
        noCalendarConfirmationRule: true,
        completedFields: completed,
        missingFields: missingInfo
      }
    } satisfies LeadIntakeProfile,
    checklist,
    missingInfo,
    suggestedQuestions,
    meetingReadinessScore,
    proposalReadinessScore,
    completedFields: completed,
    nextBestQuestion
  };
}
