import { limmCarpentryDemoQaModule } from "@/lib/knowledge/limm-carpentry-demo-qa";

export type QuestionBankIntentKey =
  | "general_enquiry"
  | "landed_renovation"
  | "aa_works"
  | "design_theme"
  | "price_question"
  | "site_visit_request"
  | "appointment_request"
  | "follow_up_ping"
  | "floorplan_or_photos_sent"
  | "condo_renovation"
  | "commercial_renovation"
  | "carpentry_demo_common_questions"
  | "hacking_demo"
  | "carpentry"
  | "timeline_question"
  | "submission_approval"
  | "structural_wall"
  | "waterproofing_drainage_roof"
  | "bathroom_kitchen"
  | "small_handyman"
  | "complaint_or_risk"
  | "spam_unrelated"
  | "unsupported_media"
  | "repeated_enquiry"
  | "unsupported";

export type QuestionBankEscalationRule =
  | "auto_safe"
  | "auto_safe_with_boss_review"
  | "boss_review_required"
  | "boss_only"
  | "no_auto_reply";

export interface QuestionBankEntry {
  intent_key: QuestionBankIntentKey;
  category: string;
  example_questions: string[];
  classification_keywords: string[];
  safe_answer_strategy: string;
  required_missing_info: string[];
  risk_flags: string[];
  escalation_rule: QuestionBankEscalationRule;
  forbidden_claims: string[];
  reply_variations: string[];
  follow_up_question: string;
  audit_tag: string;
}

export interface QuestionBankMatch {
  entry: QuestionBankEntry;
  score: number;
  matchedKeywords: string[];
  matchedExamples: string[];
}

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ").replace(/\s+/g, " ").trim();
}

function includesPhrase(text: string, phrase: string) {
  return normalise(text).includes(normalise(phrase));
}

function matchesEntryPhrase(entry: QuestionBankEntry, text: string, phrase: string) {
  const normalisedPhrase = normalise(phrase);
  if (entry.intent_key === "follow_up_ping" && ["hello", "hi", "update"].includes(normalisedPhrase)) {
    return text === normalisedPhrase;
  }
  return includesPhrase(text, phrase);
}

export const whatsappQuestionBank: QuestionBankEntry[] = [
  {
    intent_key: "general_enquiry",
    category: "General enquiry",
    example_questions: ["I want to renovate", "Do you do renovation?", "Can help with house renovation?"],
    classification_keywords: ["renovate", "renovation", "house renovation", "home renovation", "can help"],
    safe_answer_strategy: "Acknowledge, identify property type and scope, ask for floor plan or site photos if available.",
    required_missing_info: ["property_type", "scope", "floor_plan", "site_photos"],
    risk_flags: [],
    escalation_rule: "auto_safe",
    forbidden_claims: ["pricing", "confirmed timeline", "guaranteed result"],
    reply_variations: [
      "Thanks for reaching out. No worries, we can help you review the renovation enquiry properly. Could you share the property type and which areas you are planning to work on? Floor plans or site photos would also help for an initial project review.",
      "Thanks for your message. To avoid advising blindly, could you let us know the property type, main scope, and whether you have a floor plan or site photos? We can take a look properly for an initial project review.",
      "No worries, we can guide you from the basic details first. Could you share what type of property this is and the areas you want to renovate? A floor plan or photos will help us review it for an initial project review."
    ],
    follow_up_question: "Could you share the property type and the main areas you want to renovate?",
    audit_tag: "qb_general_enquiry"
  },
  {
    intent_key: "landed_renovation",
    category: "Landed enquiry",
    example_questions: ["I want to renovate landed", "Do you do landed house?", "Can you do inter terrace?"],
    classification_keywords: ["landed", "terrace", "inter terrace", "semi d", "bungalow", "corner terrace"],
    safe_answer_strategy: "Explain landed layout/access/site conditions matter, then ask for floor plan or photos.",
    required_missing_info: ["floor_plan", "site_photos", "scope"],
    risk_flags: ["landed_review"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["approval certainty", "structural certainty", "pricing"],
    reply_variations: [
      "Thanks for reaching out. For landed renovation, it is best not to advise blindly because layout, access and site conditions can affect the scope. Could you send the floor plan or site photos if available? We can take a look properly for an initial project review.",
      "No worries, we can help you review it properly. For landed work, the layout, access and existing condition matter quite a bit, so floor plans or site photos would be useful before we advise the next step for an initial project review.",
      "Thanks for sharing. For a landed home, we will need to understand the layout and site condition before guiding you properly. If you have a floor plan or site photos, send them over and we can review it for an initial project review."
    ],
    follow_up_question: "Do you have the floor plan or site photos for the landed house?",
    audit_tag: "qb_landed"
  },
  {
    intent_key: "aa_works",
    category: "A&A enquiry",
    example_questions: ["Do you do A&A?", "Can extend kitchen?", "Can build extension?", "Can add shelter?", "Can change roofline?"],
    classification_keywords: ["a&a", "aa", "addition", "alteration", "extension", "extend kitchen", "add shelter", "roofline", "rebuild"],
    safe_answer_strategy: "Mention A&A scope depends on drawings, drainage, roofline, access, waterproofing and submission requirements.",
    required_missing_info: ["floor_plan", "site_photos", "scope", "address_or_area"],
    risk_flags: ["structural_or_aa", "submission_review"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["approval certainty", "permit certainty", "structural certainty", "pricing"],
    reply_variations: [
      "Thanks for sharing. For landed A&A works, items like roofline, drainage, waterproofing, access and submission requirements can affect the scope. If you have the floor plan or site photos, send them over and we will review it more properly for an initial project review.",
      "No worries, we can take a look. For A&A, it is important not to advise blindly because site condition, structure, drainage and submission matters may affect the scope. Could you send the floor plan or photos for an initial project review?",
      "Thanks, that sounds like a landed A&A type enquiry. To guide you properly, could you send over any existing drawings, floor plan or site photos? We will review the layout and site conditions before advising the next step for an initial project review."
    ],
    follow_up_question: "Do you have existing drawings, floor plan or site photos for the A&A area?",
    audit_tag: "qb_aa"
  },
  {
    intent_key: "design_theme",
    category: "Design theme",
    example_questions: ["Can you come up with design theme?", "Can you do design concept?", "What style can you do?", "Can do modern luxury?", "Can do Japandi?", "Can do minimalist?"],
    classification_keywords: ["design theme", "design concept", "style", "modern luxury", "japandi", "minimalist", "theme", "moodboard"],
    safe_answer_strategy: "Confirm design direction can be reviewed after understanding lifestyle, layout, scope and references.",
    required_missing_info: ["property_type", "floor_plan", "site_photos", "design_direction"],
    risk_flags: [],
    escalation_rule: "auto_safe",
    forbidden_claims: ["guaranteed design outcome", "pricing"],
    reply_variations: [
      "Yes, we can help review the design direction. To make the concept practical, we should first understand the layout, scope and your preferred style. Could you send the floor plan, site photos or any reference images for an initial project review?",
      "No worries, design theme can be discussed properly once we see the layout and understand how the space will be used. If you have a floor plan, site photos or style references, send them over for an initial project review.",
      "Thanks for asking. We can look at styles like modern luxury, Japandi or minimalist, but the right direction depends on layout, lighting, storage needs and scope. Could you share the floor plan or photos for an initial project review?"
    ],
    follow_up_question: "Do you have reference images or a preferred style direction?",
    audit_tag: "qb_design_theme"
  },
  {
    intent_key: "price_question",
    category: "Price question",
    example_questions: ["How much?", "Roughly how much?", "Can give estimate?", "Any package?", "Price for landed renovation?"],
    classification_keywords: ["how much", "roughly", "estimate", "price", "cost", "package", "quote", "quotation", "budget"],
    safe_answer_strategy: "Never give amount. Explain scope/layout/site condition must be reviewed before quotation direction.",
    required_missing_info: ["floor_plan", "site_photos", "scope"],
    risk_flags: ["pricing_request"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["pricing", "quote range", "rough estimate", "package price"],
    reply_variations: [
      "I understand you would want to get a sense of cost. To avoid giving you the wrong idea, we need to understand the scope, layout and site condition first. Could you send the floor plan, site photos and the areas you plan to renovate for an initial project review?",
      "No worries, cost is usually one of the first things owners want to understand. We should not advise blindly without the layout and scope, so could you send the floor plan or photos and the areas involved for an initial project review?",
      "Thanks for checking. We need to review the scope, site condition and materials before advising any quotation direction. Could you share the floor plan, site photos and main works for an initial project review?"
    ],
    follow_up_question: "Could you send the floor plan, site photos and main scope first?",
    audit_tag: "qb_price"
  },
  {
    intent_key: "site_visit_request",
    category: "Appointment request",
    example_questions: ["Can come site visit?", "Can meet?", "Can come down?", "Can do site discussion?"],
    classification_keywords: ["site visit", "come site", "come down", "site discussion", "meet", "visit my place"],
    safe_answer_strategy: "Do not confirm booking. Ask for basic scope, address or area, floor plan/photos before checking availability.",
    required_missing_info: ["floor_plan", "site_photos", "address_or_area", "scope"],
    risk_flags: ["appointment_request"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["appointment confirmed", "we have booked", "see you tomorrow"],
    reply_variations: [
      "No worries, we can look into arranging an initial project review. Before confirming a slot, could you send the floor plan or site photos and the property area/address? That helps us understand the scope first.",
      "Thanks for checking. Let us review the basic scope and availability first before confirming a slot. Could you send the floor plan or site photos and the property area/address for an initial project review?",
      "Thanks for checking. We can look into a site discussion, but we should understand the layout and scope first so the session is useful. Could you send the floor plan or photos and the property area/address for an initial project review?"
    ],
    follow_up_question: "Could you share the property area/address and floor plan or photos before we check availability?",
    audit_tag: "qb_site_visit"
  },
  {
    intent_key: "appointment_request",
    category: "Appointment request",
    example_questions: ["Can make appt Wednesday 2pm?", "Are you free tomorrow?", "Can schedule?", "Can book appointment?"],
    classification_keywords: ["appt", "appointment", "wednesday", "tomorrow", "free tomorrow", "schedule", "book appointment", "2pm", "3pm", "morning", "afternoon"],
    safe_answer_strategy: "Acknowledge timing request, do not confirm, ask for scope and basic details before availability check.",
    required_missing_info: ["scope", "property_type", "preferred_date_time"],
    risk_flags: ["appointment_request"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["appointment confirmed", "booked", "see you tomorrow"],
    reply_variations: [
      "Thanks for checking. We can look into a suitable time, but before confirming anything we should understand the basic scope first. Could you send the floor plan or site photos and the property area for an initial project review?",
      "No worries, we can review possible timing after we understand the scope. Could you send the floor plan or site photos and your preferred date/time for an initial project review?",
      "Sure, we can check the next available option. Before confirming a slot, could you share the property type, basic scope, and any floor plan or photos for an initial project review?"
    ],
    follow_up_question: "Could you share your preferred date/time together with the basic scope?",
    audit_tag: "qb_appointment"
  },
  {
    intent_key: "follow_up_ping",
    category: "Follow-up ping",
    example_questions: ["Are you there?", "Hello?", "Can reply?", "Any update?"],
    classification_keywords: ["are you there", "hello?", "can reply", "any update", "update?", "still there"],
    safe_answer_strategy: "Acknowledge promptly and continue the latest missing-info request without sounding robotic.",
    required_missing_info: ["scope"],
    risk_flags: [],
    escalation_rule: "auto_safe",
    forbidden_claims: ["pricing", "confirmed timeline"],
    reply_variations: [
      "Yes, thanks for checking in. We are here. To help you properly, could you send the floor plan or site photos and a short note on the renovation scope for an initial project review?",
      "Hi, yes we are here. No worries, send over the property type, scope and any floor plan or photos when ready, and we can review it for an initial project review.",
      "Thanks for following up. The next useful step is to understand the layout and scope, so floor plan or site photos would help us review it properly for an initial project review."
    ],
    follow_up_question: "Could you send the floor plan/photos or a short scope note when ready?",
    audit_tag: "qb_follow_up"
  },
  {
    intent_key: "floorplan_or_photos_sent",
    category: "Floor plan/photos received",
    example_questions: ["I have floor plan", "I sent photos", "See attached", "This is my layout"],
    classification_keywords: ["floor plan", "photos", "attached", "layout", "drawing", "sent photo", "see attached", "i have plan"],
    safe_answer_strategy: "Acknowledge receipt and say it will be reviewed before advising next step.",
    required_missing_info: ["scope"],
    risk_flags: [],
    escalation_rule: "auto_safe",
    forbidden_claims: ["pricing", "confirmed timeline"],
    reply_variations: [
      "Thanks, received. We will take a look at the layout/details and check what else is needed before advising the next step for an initial project review.",
      "Thanks for sending that over. We will review the layout and scope carefully first, then advise what other details may be needed for an initial project review.",
      "Got it, thanks. We will look through the floor plan or photos so we can understand the site better before advising the next step for an initial project review."
    ],
    follow_up_question: "Could you also share the main areas you want to renovate?",
    audit_tag: "qb_files_received"
  },
  {
    intent_key: "condo_renovation",
    category: "Condo enquiry",
    example_questions: ["Do you do condo?", "Can renovate condo?", "Full condo renovation"],
    classification_keywords: ["condo", "apartment", "mcst", "full condo", "condominium"],
    safe_answer_strategy: "Mention condo management rules, access, working hours and scope details.",
    required_missing_info: ["floor_plan", "site_photos", "scope"],
    risk_flags: ["mcst_review"],
    escalation_rule: "auto_safe",
    forbidden_claims: ["approval certainty", "pricing"],
    reply_variations: [
      "Thanks for reaching out. For condo renovation, management rules, access, working hours and the exact areas involved can affect planning. Could you send the floor plan or site photos if available so we can review it for an initial project review?",
      "No worries, we can help you take a look. Could you share which areas you are planning to renovate, plus the floor plan or photos if you have them? That will help us review the next step for an initial project review.",
      "Thanks for sharing. For condo work, it helps to see the layout and understand the scope before advising. Send the floor plan or photos if available and we can review it properly for an initial project review."
    ],
    follow_up_question: "Which areas of the condo are you planning to renovate?",
    audit_tag: "qb_condo"
  },
  {
    intent_key: "commercial_renovation",
    category: "Commercial enquiry",
    example_questions: ["Do you do office/shop?", "Commercial renovation?", "Can renovate clinic?"],
    classification_keywords: ["commercial", "office", "shop", "clinic", "restaurant", "retail", "treatment room", "reception"],
    safe_answer_strategy: "Ask for layout, usage, landlord requirements and services.",
    required_missing_info: ["floor_plan", "site_photos", "scope", "landlord_requirements"],
    risk_flags: ["commercial_project"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["approval certainty", "pricing"],
    reply_variations: [
      "Thanks for reaching out. For commercial renovation, the use of space, services, landlord requirements and site access can affect planning. Could you send the layout, site photos and a short scope so we can review it for an initial project review?",
      "No worries, we can review this properly. For commercial spaces, it helps to know the unit type, required rooms or functions, and any landlord requirements. If you have photos or a layout, send them over for an initial project review.",
      "Thanks for sharing. Commercial renovation needs a clearer look at layout, services and usage before we advise. Could you send the floor plan or site photos and the main scope for an initial project review?"
    ],
    follow_up_question: "Could you share the layout, usage of the space, and any landlord requirements?",
    audit_tag: "qb_commercial"
  },
  {
    intent_key: "carpentry_demo_common_questions",
    category: limmCarpentryDemoQaModule.moduleName,
    example_questions: [
      "How much roughly for wardrobe and kitchen cabinet?",
      "Can hack this wall? I send photo.",
      "Can hack bomb shelter wall to make bigger?",
      "Your hacking price include disposal?",
      "Can modify existing cabinet to fit bigger fridge?",
      "拆柜多少钱？可以明天做吗？"
    ],
    classification_keywords: [
      ...limmCarpentryDemoQaModule.triggerKeywordsEn,
      ...limmCarpentryDemoQaModule.triggerKeywordsZh
    ],
    safe_answer_strategy: "Use the carpentry/demo Q&A module: answer the exact question, avoid prices, avoid hacking certainty, and ask only for missing property type, photos/video, measurements, scope or preferred start date.",
    required_missing_info: ["property_type", "site_photos", "measurements", "scope", "preferred_start_date"],
    risk_flags: ["carpentry_demo_review", "hacking_approval_review"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["pricing", "quote range", "rough estimate", "package price", "hacking certainty", "approval certainty"],
    reply_variations: [
      limmCarpentryDemoQaModule.standardFirstReplyEn,
      limmCarpentryDemoQaModule.receivedInfoVariants.photosReceived,
      "For carpentry or demo works, we can help review the details first. Please send the property type, photos or video, rough measurements, what you want to build/remove/modify/hack, and preferred start date so we can advise the next step more accurately."
    ],
    follow_up_question: "Could you send the property type, photos/video, rough measurements, scope and preferred start date?",
    audit_tag: "qb_carpentry_demo_common_questions"
  },
  {
    intent_key: "hacking_demo",
    category: "Hacking / demolition",
    example_questions: ["Need hacking", "Can hack wall?", "Can demolish?"],
    classification_keywords: ["hacking", "hack wall", "demolish", "demolition", "remove wall", "debris", "disposal"],
    safe_answer_strategy: "Ask for photos/scope and avoid saying any wall can be hacked before review.",
    required_missing_info: ["site_photos", "scope"],
    risk_flags: ["hacking_review"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["hacking certainty", "structural certainty", "pricing"],
    reply_variations: [
      "Thanks for reaching out. For hacking or removal works, we should see the affected area before advising because wall type, services and site protection can matter. Could you send site photos and a short scope for an initial project review?",
      "No worries, we can take a look first. Could you send photos of the wall or area and let us know what you hope to remove? We will review it carefully before advising the next step for an initial project review.",
      "Thanks for sharing. For hacking works, site condition, access and protection can affect the method. Send photos or a plan if available and we can review the next step for an initial project review."
    ],
    follow_up_question: "Could you send photos of the wall or area involved?",
    audit_tag: "qb_hacking"
  },
  {
    intent_key: "carpentry",
    category: "Carpentry",
    example_questions: ["Do you do carpentry?", "Can do wardrobe?", "Can do kitchen cabinet?"],
    classification_keywords: ["carpentry", "wardrobe", "kitchen cabinet", "cabinet", "feature wall", "vanity", "shelving"],
    safe_answer_strategy: "Ask for area, item list, measurements/photos and reference style.",
    required_missing_info: ["site_photos", "measurements", "scope"],
    risk_flags: [],
    escalation_rule: "auto_safe",
    forbidden_claims: ["pricing", "guaranteed timeline"],
    reply_variations: [
      "Thanks for reaching out. For carpentry, it helps to know the item, location and rough measurements or photos. Could you send photos of the area and what you would like built for an initial project review?",
      "No worries, we can help you review the carpentry scope. If you have photos, measurements, or reference style, send them over and we will look at what information is needed for an initial project review.",
      "Thanks for sharing. Could you send photos of the area and list the carpentry items needed? That helps us understand the layout and review the next step for an initial project review."
    ],
    follow_up_question: "Could you send photos, measurements, and the carpentry items you need?",
    audit_tag: "qb_carpentry"
  },
  {
    intent_key: "timeline_question",
    category: "Timeline question",
    example_questions: ["How long?", "Can finish fast?", "Can complete before CNY?"],
    classification_keywords: ["how long", "finish fast", "complete before", "before cny", "timeline", "urgent", "rush"],
    safe_answer_strategy: "Do not promise exact timeline. Ask for scope/layout and explain timing depends on review.",
    required_missing_info: ["scope", "floor_plan", "site_photos", "timeline"],
    risk_flags: ["urgent_timeline"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["completion guarantee", "exact timeline promise"],
    reply_variations: [
      "I understand timing is important. We should not promise a timeline before reviewing the scope, site condition and required works. Could you send the floor plan, site photos and target timing for an initial project review?",
      "No worries, we can check the timeline properly after seeing the layout and scope. Could you share the floor plan or photos and what date you are hoping to work towards for an initial project review?",
      "Thanks for checking. The timeline depends on the actual scope, materials, access and site conditions, so we should review the details first. Could you send the floor plan or site photos for an initial project review?"
    ],
    follow_up_question: "What target date are you working towards, and what areas are involved?",
    audit_tag: "qb_timeline"
  },
  {
    intent_key: "submission_approval",
    category: "Submission / authority",
    example_questions: ["Need approval?", "Can approve?", "URA/BCA submission?", "Will this pass?"],
    classification_keywords: ["need approval", "can approve", "ura", "bca", "submission", "permit", "will pass", "authority"],
    safe_answer_strategy: "Never guarantee approval. Explain requirements depend on scope/site/authority requirements and need review.",
    required_missing_info: ["floor_plan", "site_photos", "scope"],
    risk_flags: ["approval_expectation", "submission_review"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["approval certainty", "permit certainty"],
    reply_variations: [
      "Thanks for checking. Submission or authority requirements depend on the exact scope, property type and site conditions, so we should review the details first. Could you send the floor plan, photos and intended works for an initial project review?",
      "No worries, we can look into what may need review, but we should not assume the authority requirements before seeing the scope. Please send the floor plan or photos and what you plan to change for an initial project review.",
      "Thanks for asking. Whether submission is needed depends on the works and site details, so this should be reviewed carefully. Could you share drawings, floor plan or photos for an initial project review?"
    ],
    follow_up_question: "Could you send drawings or a floor plan showing what you want to change?",
    audit_tag: "qb_submission"
  },
  {
    intent_key: "structural_wall",
    category: "Structural / wall",
    example_questions: ["Can remove wall?", "Can hack structural wall?", "Need PE?"],
    classification_keywords: ["remove wall", "structural wall", "need pe", "pe endorsement", "beam", "column", "load bearing"],
    safe_answer_strategy: "Never confirm hacking/structural feasibility. Ask for plan/photos and flag professional review.",
    required_missing_info: ["floor_plan", "site_photos", "scope"],
    risk_flags: ["structural_review"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["hacking certainty", "structural certainty"],
    reply_variations: [
      "Thanks for checking. For wall removal or structural questions, we should not advise blindly because the wall type and services need proper review. Could you send the floor plan and photos of the wall for an initial project review?",
      "No worries, we can review the information first, but we cannot confirm wall removal without checking the layout and site details. Please send the floor plan or photos for an initial project review.",
      "Thanks for sharing. If structural or PE review may be involved, we should look at the drawings and site condition carefully before advising the next step for an initial project review."
    ],
    follow_up_question: "Could you send the floor plan and photos of the wall or structure?",
    audit_tag: "qb_structural"
  },
  {
    intent_key: "waterproofing_drainage_roof",
    category: "Waterproofing / drainage / roof",
    example_questions: ["Water leaking", "Drainage issue", "Waterproofing problem", "Roof leaking"],
    classification_keywords: ["water leaking", "leak", "drainage", "waterproofing", "roof leaking", "seepage", "ponding"],
    safe_answer_strategy: "Acknowledge concern and ask for photos/videos/location. Avoid diagnosing without review.",
    required_missing_info: ["site_photos", "scope", "address_or_area"],
    risk_flags: ["waterproofing_review", "site_condition_review"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["guaranteed fix", "structural certainty", "pricing"],
    reply_variations: [
      "Thanks for sharing. Water leakage or drainage issues should be reviewed carefully because the source may not be obvious from the message alone. Could you send photos or a short video of the affected area for an initial project review?",
      "No worries, we can take a look at the issue properly. Please send photos of the leak or drainage area and let us know when it usually happens, so we can review the next step for an initial project review.",
      "Thanks for explaining. For waterproofing or roof leak issues, site condition matters a lot, so photos and the affected location would help us review it properly for an initial project review."
    ],
    follow_up_question: "Could you send photos or a short video of the affected area?",
    audit_tag: "qb_waterproofing"
  },
  {
    intent_key: "bathroom_kitchen",
    category: "Bathroom / kitchen",
    example_questions: ["Renovate toilet", "Wet kitchen", "Dry kitchen", "Change bathroom"],
    classification_keywords: ["toilet", "bathroom", "wet kitchen", "dry kitchen", "kitchen", "washroom", "wc"],
    safe_answer_strategy: "Ask which area, wet works, plumbing and photos/floor plan before review.",
    required_missing_info: ["floor_plan", "site_photos", "scope"],
    risk_flags: ["wet_works_review"],
    escalation_rule: "auto_safe",
    forbidden_claims: ["pricing", "completion guarantee"],
    reply_variations: [
      "Thanks for reaching out. For bathroom or kitchen renovation, plumbing, waterproofing, layout and finishes can affect the scope. Could you send the floor plan or photos and what you want to change for an initial project review?",
      "No worries, we can review it properly. Could you share whether it is the bathroom, wet kitchen or dry kitchen, plus photos or a floor plan if available for an initial project review?",
      "Thanks for sharing. Kitchen and bathroom works need a clearer look at layout and wet works, so photos or a floor plan would help us advise the next step for an initial project review."
    ],
    follow_up_question: "Which bathroom or kitchen area are you planning to change?",
    audit_tag: "qb_bathroom_kitchen"
  },
  {
    intent_key: "small_handyman",
    category: "Small handyman / not suitable",
    example_questions: ["Can just fix small thing?", "Small repair only", "Small job only"],
    classification_keywords: ["small repair", "fix small", "minor repair", "handyman", "just fix", "small thing"],
    safe_answer_strategy: "Politely check fit and ask for photos/scope. Escalate/decline if not suitable.",
    required_missing_info: ["site_photos", "scope"],
    risk_flags: ["fit_review"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["pricing", "low-value fit assumption"],
    reply_variations: [
      "Thanks for checking. Could you send a photo and short description of what needs to be fixed? We will review whether it fits our scope before advising the next step for an initial project review.",
      "No worries, send over a photo and the issue first. Some small repair items may not fit our main renovation scope, but we can review it properly before advising for an initial project review.",
      "Thanks for sharing. Please send photos and a short note on the repair needed, and we will check whether this is suitable for us to take further for an initial project review."
    ],
    follow_up_question: "Could you send a photo and short description of the repair?",
    audit_tag: "qb_small_handyman"
  },
  {
    intent_key: "complaint_or_risk",
    category: "Complaint / risk",
    example_questions: ["Your work got problem", "I'm unhappy", "I want refund", "Lawyer"],
    classification_keywords: ["problem", "unhappy", "refund", "lawyer", "complaint", "defect", "angry"],
    safe_answer_strategy: "Acknowledge calmly, do not argue, do not admit liability, mark boss review required.",
    required_missing_info: ["details", "photos"],
    risk_flags: ["complaint", "manager_review"],
    escalation_rule: "boss_only",
    forbidden_claims: ["liability admission", "refund promise", "fault admission"],
    reply_variations: [
      "Thanks for explaining. I will get my manager to review the matter properly before we advise the next step for an initial project review.",
      "I understand this needs to be handled carefully. I will get my manager to review the details properly before any next step is advised for an initial project review.",
      "Thanks for raising this. I will get my manager to review the matter properly so we do not give you the wrong advice for an initial project review."
    ],
    follow_up_question: "Could you share photos and a short explanation of what happened?",
    audit_tag: "qb_complaint"
  },
  {
    intent_key: "spam_unrelated",
    category: "Spam / unrelated",
    example_questions: ["irrelevant messages", "empty messages", "media only"],
    classification_keywords: ["crypto", "loan", "investment", "casino", "job offer", "marketing"],
    safe_answer_strategy: "Do not engage beyond a safe clarification if it might be a real enquiry.",
    required_missing_info: ["scope"],
    risk_flags: ["spam_or_unrelated"],
    escalation_rule: "no_auto_reply",
    forbidden_claims: ["pricing", "booking"],
    reply_variations: [
      "Thanks for your message. If this is about renovation, please share the property type and scope so we can review it for an initial project review.",
      "Hi, if you are checking on renovation works, please send the property type, main scope and any photos for an initial project review.",
      "Thanks. For renovation enquiries, floor plans or site photos and a short scope will help us review the next step for an initial project review."
    ],
    follow_up_question: "Is this regarding a renovation enquiry?",
    audit_tag: "qb_spam"
  },
  {
    intent_key: "unsupported_media",
    category: "Unsupported media",
    example_questions: ["media only", "empty attachment", "voice note only"],
    classification_keywords: ["unsupported_media", "media only", "voice note", "sticker"],
    safe_answer_strategy: "Ask for a short text description so the file can be understood in context.",
    required_missing_info: ["scope"],
    risk_flags: [],
    escalation_rule: "auto_safe",
    forbidden_claims: ["pricing", "booking"],
    reply_variations: [
      "Thanks, received. Could you also send a short text note on what you need done? That helps us review the file or photo in the right context for an initial project review.",
      "No worries, please add a short description of the property type and scope too. It will help us understand the file or photo before advising the next step for an initial project review.",
      "Thanks for sending it over. A short note on the area and works involved would help us review it properly for an initial project review."
    ],
    follow_up_question: "Could you add a short text description of the scope?",
    audit_tag: "qb_unsupported_media"
  },
  {
    intent_key: "repeated_enquiry",
    category: "Repeated enquiry",
    example_questions: ["same question again", "repeated price question", "repeated missing info"],
    classification_keywords: ["repeat", "again", "same question"],
    safe_answer_strategy: "Acknowledge previous request and vary wording; escalate repeated price pressure.",
    required_missing_info: ["scope"],
    risk_flags: ["repetition_review"],
    escalation_rule: "auto_safe_with_boss_review",
    forbidden_claims: ["pricing", "booking confirmation"],
    reply_variations: [
      "No worries, once you have the floor plan or photos ready, just send them over. That will help us review the layout and scope more accurately for an initial project review.",
      "Thanks, we have your enquiry. The next useful step is still to review the layout or photos, so send those over whenever ready and we can take a closer look for an initial project review.",
      "Got it. To avoid repeating the same advice blindly, the floor plan or site photos will help us understand the layout and guide the next step for an initial project review."
    ],
    follow_up_question: "Could you send the floor plan/photos when ready?",
    audit_tag: "qb_repeated"
  },
  {
    intent_key: "unsupported",
    category: "Unsupported / unclear",
    example_questions: ["unclear text", "unknown request", "not enough context"],
    classification_keywords: [],
    safe_answer_strategy: "Ask for property type and scope in a friendly way.",
    required_missing_info: ["property_type", "scope"],
    risk_flags: [],
    escalation_rule: "auto_safe",
    forbidden_claims: ["pricing", "booking"],
    reply_variations: [
      "Thanks for reaching out. Could you share a short note on the property type and what works you are planning? That will help us review it properly for an initial project review.",
      "No worries, we can guide you better with a bit more context. Could you tell us the property type and main scope for an initial project review?",
      "Thanks for your message. So we do not advise blindly, could you share what type of property this is and the areas involved for an initial project review?"
    ],
    follow_up_question: "Could you share the property type and main scope?",
    audit_tag: "qb_unsupported"
  }
];

const priority: QuestionBankIntentKey[] = [
  "complaint_or_risk",
  "price_question",
  "carpentry_demo_common_questions",
  "submission_approval",
  "structural_wall",
  "aa_works",
  "site_visit_request",
  "appointment_request",
  "floorplan_or_photos_sent",
  "follow_up_ping",
  "waterproofing_drainage_roof",
  "design_theme",
  "commercial_renovation",
  "landed_renovation",
  "condo_renovation",
  "bathroom_kitchen",
  "hacking_demo",
  "carpentry",
  "timeline_question",
  "small_handyman",
  "spam_unrelated",
  "general_enquiry",
  "unsupported"
];

export function findQuestionBankEntry(intentKey: QuestionBankIntentKey) {
  return whatsappQuestionBank.find((entry) => entry.intent_key === intentKey) ?? whatsappQuestionBank[whatsappQuestionBank.length - 1];
}

export function matchQuestionBankIntent(text = ""): QuestionBankMatch {
  const normalisedText = normalise(text);
  const scored = whatsappQuestionBank.map((entry) => {
    const matchedKeywords = entry.classification_keywords.filter((keyword) => keyword && matchesEntryPhrase(entry, normalisedText, keyword));
    const matchedExamples = entry.example_questions.filter((example) => example && matchesEntryPhrase(entry, normalisedText, example));
    const score = matchedKeywords.length + matchedExamples.length * 2;
    return { entry, score, matchedKeywords, matchedExamples };
  });
  const specificMatches = scored.filter((item) => item.score > 0 && !["general_enquiry", "unsupported"].includes(item.entry.intent_key));
  const candidates = specificMatches.length ? specificMatches : scored;
  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return priority.indexOf(left.entry.intent_key) - priority.indexOf(right.entry.intent_key);
  });
  const best = candidates[0];
  if (!best || best.score <= 0) {
    return {
      entry: findQuestionBankEntry("unsupported"),
      score: 0,
      matchedKeywords: [],
      matchedExamples: []
    };
  }
  return best;
}

export function selectQuestionBankReply(input: {
  entry: QuestionBankEntry;
  previousReplies: string[];
  seed: string;
}) {
  const candidates = input.entry.reply_variations;
  const fallback = "Thanks for reaching out. Could you share the property type and main scope so we can review it properly for an initial project review?";
  if (!candidates.length) {
    return {
      reply: fallback,
      variationUsed: false,
      repeated: false,
      similarityReason: "none" as const
    };
  }
  const start = Math.abs([...input.seed].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % candidates.length;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[(start + index) % candidates.length] ?? fallback;
    const normalisedCandidate = normalise(candidate);
    const exact = input.previousReplies.some((reply) => normalise(reply) === normalisedCandidate);
    const high = input.previousReplies.some((reply) => {
      const left = new Set(normalise(reply).split(" ").filter(Boolean));
      const right = new Set(normalisedCandidate.split(" ").filter(Boolean));
      if (!left.size || !right.size) return false;
      const overlap = [...left].filter((word) => right.has(word)).length;
      return overlap / Math.max(left.size, right.size) > 0.82;
    });
    if (!exact && !high) {
      return {
        reply: candidate,
        variationUsed: index > 0,
        repeated: false,
        similarityReason: "none" as const
      };
    }
  }
  return {
    reply: candidates[start] ?? fallback,
    variationUsed: true,
    repeated: true,
    similarityReason: "high_similarity" as const
  };
}

export function questionBankStats() {
  return {
    categories: whatsappQuestionBank.length,
    exampleQuestions: whatsappQuestionBank.reduce((sum, entry) => sum + entry.example_questions.length, 0)
  };
}
