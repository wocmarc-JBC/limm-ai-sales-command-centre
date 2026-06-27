// Source: C:\Users\Lenovo\Downloads\limm_whatsapp_carpentry_demo_qa_pack.json
// Safe response knowledge only. This module does not enable pricing, booking, voice transcription, or WhatsApp sending.

export type CarpentryDemoQaItemId =
  | "CDQ01_PRICE_FIRST"
  | "CDQ02_SMALL_JOBS"
  | "CDQ03_SITE_VISIT"
  | "CDQ04_WALL_HACKING"
  | "CDQ05_APPROVAL"
  | "CDQ06_HOUSEHOLD_SHELTER"
  | "CDQ07_DISPOSAL"
  | "CDQ08_DUST_PROTECTION"
  | "CDQ09_TIMELINE"
  | "CDQ10_CABINET_MODIFICATION"
  | "CDQ11_LAMINATE_MATCH"
  | "CDQ12_MATERIALS"
  | "CDQ13_HIDDEN_SERVICES";

export interface CarpentryDemoQaItem {
  id: CarpentryDemoQaItemId;
  questionPatterns: string[];
  answerPolicy: string;
  templateEn: string;
  templateZh?: string;
  forbidden?: string[];
}

export interface CarpentryDemoQaMatch {
  item: CarpentryDemoQaItem;
  score: number;
  matchedKeywords: string[];
  matchedPatterns: string[];
}

export const limmCarpentryDemoQaModule = {
  moduleId: "limm_carpentry_demo_common_questions_sg",
  moduleName: "Carpentry & Demo Works - Common Client Questions Singapore",
  version: "2026-06-27",
  owner: "LIMM Works Pte Ltd",
  safeClaim: "common questions clients usually ask / details we usually need to clarify before quoting",
  pricingPolicy: "No automatic price, range, from-price, or package replies. Ask for scope details first.",
  featureConstraints: {
    PRICE_GUIDE_AUTOMATION_ENABLED: false,
    CALENDAR_AUTO_BOOKING_ENABLED: false,
    VOICE_TRANSCRIPTION_ENABLED: false
  },
  triggerKeywordsEn: [
    "carpentry",
    "cabinet",
    "kitchen cabinet",
    "wardrobe",
    "TV console",
    "feature wall",
    "laminate",
    "hinge",
    "drawer track",
    "soft closing",
    "modify cabinet",
    "cabinet modification",
    "existing cabinet",
    "add shelf",
    "replace door",
    "dismantle",
    "dismantling",
    "demo",
    "demolition",
    "hacking",
    "hack wall",
    "wall removal",
    "remove wall",
    "remove built-in",
    "remove cabinet",
    "remove tiles",
    "tile hacking",
    "floor hacking",
    "debris",
    "disposal",
    "haulage",
    "rubbish",
    "dust",
    "noisy",
    "protection",
    "lift protection",
    "corridor protection",
    "HDB permit",
    "HDB approval",
    "condo approval",
    "MCST",
    "management approval",
    "bomb shelter",
    "household shelter"
  ],
  triggerKeywordsZh: [
    "木工",
    "橱柜",
    "衣柜",
    "电视柜",
    "修改柜",
    "加层板",
    "换门",
    "拆柜",
    "拆除",
    "敲墙",
    "打墙",
    "拆墙",
    "拆地砖",
    "拆墙砖",
    "垃圾清理",
    "清走垃圾",
    "灰尘",
    "噪音",
    "保护",
    "电梯保护",
    "HDB批准",
    "公寓管理处",
    "管理处批准",
    "防空壳",
    "防空室",
    "避难所"
  ],
  globalRules: [
    "Answer the client's actual question first.",
    "Use one concise WhatsApp reply for multi-intent questions.",
    "Do not repeat requests for photos, floor plan, property type, or measurements if already received.",
    "Ask only for the next useful missing item.",
    "Use project review or initial review wording.",
    "Do not overpromise approval, timing, or feasibility.",
    "For hacking or wall removal, approval and wall type must be checked first.",
    "For household shelter or bomb shelter, do not suggest hacking or weakening shelter parts."
  ],
  standardFirstReplyEn:
    "Hi, thanks for contacting us. Yes, we can help review this.\n\nPlease send:\n1. Property type - HDB / condo / landed / commercial\n2. Photos or video of the area\n3. Rough measurements, if available\n4. What you want to build, remove, modify, or hack\n5. Preferred start date\n\nOnce we see the scope and site condition, we can advise the next step more accurately.\n\nFor hacking or wall removal, approval and wall type may need to be checked first before works can proceed.",
  receivedInfoVariants: {
    photosReceived:
      "Thanks, I've received the photos. We can help review this. May I check the property type, rough measurements and preferred start date? For hacking or wall removal, approval and wall type may need to be checked first before works can proceed.",
    photosAndPropertyTypeReceived:
      "Thanks, I've received the photos and property type. May I check the rough measurements and preferred start date? Once we see the full scope, we can advise the next step more accurately."
  }
} as const;

export const carpentryDemoQaItems: readonly CarpentryDemoQaItem[] = [
  {
    id: "CDQ01_PRICE_FIRST",
    questionPatterns: ["How much?", "How much roughly?", "Can give price?", "多少钱?", "roughly how much to hack/build/modify?"],
    answerPolicy: "No price/range/package. Ask for property type, photos/video, rough measurements, scope and preferred start date.",
    templateEn:
      "Sure, we can help review this. For carpentry or demo works, pricing depends on the actual scope, size, site condition, access, disposal/protection, material choice, and whether approval is needed.\n\nPlease send the property type, photos/video of the area, rough measurements if available, what you want to build/remove/modify/hack, and preferred start date. Once we see the scope, we can advise the next step more accurately.",
    templateZh:
      "可以，我们可以先帮您 review。木工或拆除工程需要看实际范围、尺寸、现场情况、出入通道、垃圾清理/保护、材料选择，以及是否需要批准。\n\n请先发 property type、现场照片或视频、rough measurements、想做/拆/修改的内容，以及希望开工的时间。我们看清楚范围后，才能更准确地 advise next step。",
    forbidden: ["price amount", "price range", "package", "exact quote without details"]
  },
  {
    id: "CDQ02_SMALL_JOBS",
    questionPatterns: ["Can do small job?", "only remove cabinet", "modify one cabinet", "small hacking"],
    answerPolicy: "Small work can be reviewed; ask for photos, dimensions and required change/removal.",
    templateEn:
      "Yes, we can help review smaller works too - such as cabinet modification, dismantling built-in carpentry, removing fixtures, replacing cabinet doors, adding shelves, or small dismantling/hacking scopes.\n\nPlease send clear photos, rough dimensions, and what you need changed or removed. We'll review whether the job is suitable and advise from there."
  },
  {
    id: "CDQ03_SITE_VISIT",
    questionPatterns: ["Need site visit?", "photo enough?", "can quote by photo?"],
    answerPolicy: "Explain when photos may be enough and when site review may be needed.",
    templateEn:
      "For simple carpentry or dismantling works, photos and measurements may be enough for an initial review.\n\nFor hacking, wall removal, bathroom/kitchen demo, hidden pipes/wiring, or HDB/condo approval matters, a site review may be needed before confirming the method and quotation."
  },
  {
    id: "CDQ04_WALL_HACKING",
    questionPatterns: ["Can hack this wall?", "Can remove wall?", "hack wall", "敲墙", "打墙", "拆墙"],
    answerPolicy: "Do not confirm wall hacking from photos. Ask for property type, floor plan, wall location and approval context.",
    templateEn:
      "We cannot confirm wall hacking from photo alone.\n\nWe'll need to check the property type, floor plan, wall location, whether the wall is structural/restricted, and whether hidden services may be present. For HDB or condo works, approval may also be required before hacking can proceed.",
    forbidden: ["sure can", "no problem", "confirm wall from photo only"]
  },
  {
    id: "CDQ05_APPROVAL",
    questionPatterns: ["Need HDB approval?", "Need condo approval?", "Need permit?", "management approval", "MCST"],
    answerPolicy: "Explain approval depends on HDB/MCST/building management rules and exact scope.",
    templateEn:
      "For HDB flats, some renovation works require HDB permits, especially certain wall, floor, tile or hacking works. For condos, approval depends on the MCST/building management rules, and they may require renovation forms, contractor details, work schedule, deposit, insurance, lift/corridor protection and approved working hours.\n\nPlease send the property type and scope first, then we can advise what needs to be checked."
  },
  {
    id: "CDQ06_HOUSEHOLD_SHELTER",
    questionPatterns: ["Can hack bomb shelter?", "household shelter wall", "bomb shelter wall", "防空壳", "防空室", "避难所"],
    answerPolicy: "Household shelter parts are restricted; suggest safer alternatives around the area only.",
    templateEn:
      "Household shelter walls, floor, ceiling, door and ventilation parts are restricted and should not be treated like normal walls.\n\nWe should not plan hacking to household shelter walls or shelter parts. If you send photos and what you want to achieve, we can review safer alternatives around the area.",
    forbidden: ["hack household shelter", "cut shelter wall", "remove shelter door", "weaken shelter wall"]
  },
  {
    id: "CDQ07_DISPOSAL",
    questionPatterns: ["Disposal included?", "debris disposal", "haulage", "rubbish", "清走垃圾", "垃圾清理"],
    answerPolicy: "Say disposal must be stated clearly and itemised after scope review.",
    templateEn:
      "For demo works, disposal should be clearly stated in the quotation.\n\nWe'll review whether the scope includes labour, dismantling/hacking, bagging, haulage, debris disposal, transport, protection and basic cleaning after works, then itemise it properly."
  },
  {
    id: "CDQ08_DUST_PROTECTION",
    questionPatterns: ["Dusty or not?", "noisy?", "got protection?", "lift protection", "corridor protection", "灰尘", "噪音", "保护"],
    answerPolicy: "Be honest about dust/noise/debris and explain protection/work planning.",
    templateEn:
      "Demo works will create dust, noise and debris, so protection and work planning are important.\n\nWe'll need to review the work area, access route, lift/corridor protection, floor protection, nearby furniture and disposal path. For condo/HDB jobs, works must also follow property rules and approved working hours."
  },
  {
    id: "CDQ09_TIMELINE",
    questionPatterns: ["How long?", "How fast can start?", "can start tomorrow?", "timeline"],
    answerPolicy: "Do not promise timeline. Ask for photos, measurements and target start date.",
    templateEn:
      "Timeline depends on scope.\n\nFor carpentry, it depends on measurement, design confirmation, material selection, fabrication and installation.\n\nFor demo works, it depends on the removal scope, access, disposal, protection, approvals and whether hidden pipes/wiring are involved.\n\nPlease send photos, rough measurements and target start date so we can advise properly."
  },
  {
    id: "CDQ10_CABINET_MODIFICATION",
    questionPatterns: ["Can modify existing cabinet?", "modify cabinet", "fit bigger fridge", "add shelves", "replace cabinet door", "修改柜", "加层板"],
    answerPolicy: "Confirm modification can be reviewed and explain practicality factors.",
    templateEn:
      "Yes, we can help review existing cabinet modification, such as resizing openings, modifying for appliances or adjusting built-ins.\n\nWhether it is practical depends on the existing cabinet condition, internal support, laminate and whether the altered area can still look clean after modification."
  },
  {
    id: "CDQ11_LAMINATE_MATCH",
    questionPatterns: ["match laminate", "same colour", "match existing", "laminate colour"],
    answerPolicy: "Manage expectations on exact laminate/colour matching.",
    templateEn:
      "We can try to match as close as possible, but exact matching depends on whether the original laminate is still available, supplier stock, surface age, sunlight fading, stains and wear.\n\nFor repair or extension works, we should manage expectations clearly before proceeding."
  },
  {
    id: "CDQ12_MATERIALS",
    questionPatterns: ["What material?", "plywood or MDF?", "laminate", "hinges", "drawer track", "soft closing"],
    answerPolicy: "Explain material depends on usage and internal layout, not only length.",
    templateEn:
      "Material depends on the usage area and requirements.\n\nBefore quoting, we should clarify board type, laminate/internal finish, hinges, drawer tracks, handles, soft-closing hardware, moisture-prone areas and internal shelf layout. A cabinet should not be quoted only by length without understanding the material and internal layout."
  },
  {
    id: "CDQ13_HIDDEN_SERVICES",
    questionPatterns: ["Will damage pipes?", "wires inside?", "hidden pipe", "hidden wire", "conduit"],
    answerPolicy: "Flag possible hidden pipes/wires/services and ask for drawings/site review.",
    templateEn:
      "There may be hidden pipes, wires, conduits or old services behind walls, cabinets, floors or tiles.\n\nBefore hacking, we should check the area, property type, drawings if available and site condition. For older units, some hidden conditions may only be confirmed after opening works begin."
  }
] as const;

const qaPriority: CarpentryDemoQaItemId[] = [
  "CDQ06_HOUSEHOLD_SHELTER",
  "CDQ10_CABINET_MODIFICATION",
  "CDQ11_LAMINATE_MATCH",
  "CDQ13_HIDDEN_SERVICES",
  "CDQ07_DISPOSAL",
  "CDQ08_DUST_PROTECTION",
  "CDQ05_APPROVAL",
  "CDQ04_WALL_HACKING",
  "CDQ09_TIMELINE",
  "CDQ03_SITE_VISIT",
  "CDQ02_SMALL_JOBS",
  "CDQ12_MATERIALS",
  "CDQ01_PRICE_FIRST"
];

export function normalizeCarpentryDemoText(text: string) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9\u4e00-\u9fff\s?$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesPhrase(text: string, phrase: string) {
  return normalizeCarpentryDemoText(text).includes(normalizeCarpentryDemoText(phrase));
}

export function isCarpentryDemoKnowledgeTrigger(text: string) {
  const normalized = normalizeCarpentryDemoText(text);
  if (!normalized) return false;
  if (/\bhack\b|\bhack\b.{0,30}\bwall\b|\bwall\b.{0,30}\bhack\b|\bremove\b.{0,20}\bwall\b|敲墙|打墙|拆墙/.test(normalized)) {
    return true;
  }
  return [...limmCarpentryDemoQaModule.triggerKeywordsEn, ...limmCarpentryDemoQaModule.triggerKeywordsZh]
    .some((keyword) => includesPhrase(normalized, keyword));
}

export function findCarpentryDemoQaItem(id: CarpentryDemoQaItemId) {
  return carpentryDemoQaItems.find((item) => item.id === id) ?? carpentryDemoQaItems[0];
}

export function matchCarpentryDemoQaItem(text: string): CarpentryDemoQaMatch | null {
  const normalized = normalizeCarpentryDemoText(text);
  if (!normalized) return null;
  if (!isCarpentryDemoKnowledgeTrigger(text) && !/\bhow much\b|\bprice\b|\bquote\b|\bquotation\b|多少钱/.test(normalized)) {
    return null;
  }

  const scored = carpentryDemoQaItems.map((item) => {
    const matchedPatterns = item.questionPatterns.filter((pattern) => includesPhrase(normalized, pattern));
    const matchedKeywords = [...limmCarpentryDemoQaModule.triggerKeywordsEn, ...limmCarpentryDemoQaModule.triggerKeywordsZh]
      .filter((keyword) => includesPhrase(normalized, keyword));
    let score = matchedPatterns.length * 3;
    if (matchedKeywords.length) score += Math.min(matchedKeywords.length, 4);
    if (item.id === "CDQ01_PRICE_FIRST" && /\bhow much\b|\bprice\b|\bquote\b|\bquotation\b|\broughly\b|多少钱/.test(normalized)) score += 5;
    if (item.id === "CDQ06_HOUSEHOLD_SHELTER" && /bomb shelter|household shelter|防空|避难所/.test(normalized)) score += 8;
    if (item.id === "CDQ04_WALL_HACKING" && /hack|hacking|remove wall|wall removal|敲墙|打墙|拆墙/.test(normalized)) score += 4;
    if (item.id === "CDQ07_DISPOSAL" && /disposal|debris|haulage|rubbish|垃圾|清走/.test(normalized)) score += 4;
    if (item.id === "CDQ05_APPROVAL" && /approval|permit|mcst|management|批准|管理处/.test(normalized)) score += 4;
    if (item.id === "CDQ10_CABINET_MODIFICATION" && /modify|cabinet|fridge|shelf|door|修改柜|加层板/.test(normalized)) score += 4;
    if (item.id === "CDQ11_LAMINATE_MATCH" && /match|same colour|laminate colour/.test(normalized)) score += 4;
    if (item.id === "CDQ09_TIMELINE" && /how long|start tomorrow|next week|timeline|start/.test(normalized)) score += 3;
    return { item, score, matchedKeywords, matchedPatterns };
  });

  const candidates = scored.filter((match) => match.score > 0);
  if (!candidates.length) return null;
  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return qaPriority.indexOf(left.item.id) - qaPriority.indexOf(right.item.id);
  });
  return candidates[0];
}

export function carpentryDemoQaStats() {
  return {
    qaItems: carpentryDemoQaItems.length,
    englishTriggers: limmCarpentryDemoQaModule.triggerKeywordsEn.length,
    mandarinTriggers: limmCarpentryDemoQaModule.triggerKeywordsZh.length,
    testScenarios: 10
  };
}
