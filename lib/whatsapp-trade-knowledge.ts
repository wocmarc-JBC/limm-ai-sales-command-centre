export const WHATSAPP_TRADE_KNOWLEDGE_VERSION = "v11.4.10_trade_knowledge";

export type TradeKnowledgeReply = {
  reply: string;
  knowledgeKey: string;
  trade: string;
  handoffRequired: boolean;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9\u4e00-\u9fff?$&+\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function questionLike(text: string) {
  return /\?|\b(?:can|could|do|does|is|are|should|need|possible|how|what|which|whether|better|recommend|advise)\b/.test(text);
}

function priceQuestion(text: string) {
  return /\b(?:how much|price|cost|quote|quotation|estimate|roughly|budget)\b|\$/.test(text);
}

function answer(reply: string, knowledgeKey: string, trade: string, handoffRequired = false): TradeKnowledgeReply {
  return { reply, knowledgeKey, trade, handoffRequired };
}

export function buildTradeKnowledgeReply(input: {
  inboundMessageText: string;
  knownFloorPlan: boolean;
  knownSitePhotos: boolean;
}): TradeKnowledgeReply | null {
  const text = normalize(input.inboundMessageText);
  if (!text || !questionLike(text) || priceQuestion(text)) return null;

  if (/\b(?:structural wall|load bearing|load-bearing|hack wall|remove wall|demolish wall|knock down wall)\b/.test(text)) {
    const evidence = input.knownFloorPlan
      ? "We already have the floor plan, but the exact wall and any concealed services still need to be checked."
      : "The floor plan and exact wall location are needed before the wall can be assessed.";
    return answer(
      `A wall should not be confirmed as removable from a photo alone. ${evidence} Which wall are you referring to?`,
      "structural_wall_assessment",
      "hacking",
      true
    );
  }

  if (/\b(?:waterproof|waterproofing|leak|leaking|flood test|ponding test)\b/.test(text)) {
    return answer(
      "Waterproofing performance depends on substrate preparation, corner and pipe detailing, drainage falls and proper testing before finishes are installed. Is this new waterproofing or an existing leak repair?",
      "waterproofing_system_review",
      "waterproofing"
    );
  }

  if (/\b(?:overlay|tile over|tile-on-tile|hack tiles|hacking tiles|replace tiles|hollow tiles|tile popping)\b/.test(text)) {
    return answer(
      "Overlay may be possible only when the existing tiles and substrate are stable, levels and door clearances work, and wet-area detailing is not compromised. Is this for a dry area, kitchen or bathroom?",
      "tile_overlay_vs_hack",
      "tiling"
    );
  }

  if (/\b(?:tiles|tiling|grout|tile joint|floor fall|drainage fall|homogeneous|porcelain|ceramic)\b/.test(text)) {
    return answer(
      "Tile selection is only part of the result; substrate condition, setting-out, joint width, edge cuts and drainage falls also affect durability and appearance. Which area and tile size are you considering?",
      "tiling_material_and_installation",
      "tiling"
    );
  }

  if (/\b(?:carpentry|cabinet|wardrobe|kitchen cabinet|plywood|laminate|hinge|drawer|soft close|soft-close|modify cabinet|alter cabinet)\b/.test(text)) {
    if (/\b(?:modify|alter|add shelf|change door|reuse|existing cabinet)\b/.test(text)) {
      return answer(
        "Existing carpentry can sometimes be modified, but feasibility depends on the carcass condition, laminate matching, hardware clearances and whether the alteration weakens the cabinet. What change are you planning to make?",
        "existing_carpentry_modification",
        "carpentry"
      );
    }
    return answer(
      "Good carpentry depends on the internal board specification, edge sealing, hardware, ventilation and accurate site measurement—not only the visible laminate. Which carpentry item are you planning?",
      "carpentry_specification_review",
      "carpentry"
    );
  }

  if (/\b(?:quartz|sintered stone|solid surface|countertop|worktop|kitchen top|vanity top)\b/.test(text)) {
    return answer(
      "The suitable countertop depends on heat exposure, joint locations, unsupported spans, edge profile, staining risk and the sink or hob cut-outs. Is this for a kitchen, island or bathroom vanity?",
      "countertop_material_selection",
      "carpentry"
    );
  }

  if (/\b(?:electrical|socket|power point|plug point|lighting point|downlight|track light|rewire|wiring|distribution board|db box|circuit|heater point|hob point)\b/.test(text)) {
    return answer(
      "Electrical changes should be planned around the required load, circuit capacity, cable route, concealment method and final equipment positions. Which appliance, light or socket are you adding or relocating?",
      "electrical_load_and_routing",
      "electrical"
    );
  }

  if (/\b(?:plumbing|water pipe|pipe|sink|tap|mixer|wc|toilet bowl|bidet|heater|floor trap|drain pipe|relocate toilet|relocate sink)\b/.test(text)) {
    return answer(
      "Plumbing relocation depends on pipe routes, drainage gradient, access for maintenance, waterproofing interfaces and the existing stack or discharge point. Which fixture are you moving or installing?",
      "plumbing_route_and_fixture",
      "plumbing"
    );
  }

  if (/\b(?:false ceiling|ceiling board|plaster ceiling|gypsum|cove light|ceiling access|access panel)\b/.test(text)) {
    return answer(
      "A false ceiling needs enough clearance for services, lights, air-conditioning components and future access, while preserving comfortable ceiling height. Which room and ceiling feature are you considering?",
      "false_ceiling_clearance",
      "ceiling"
    );
  }

  if (/\b(?:paint|painting|mould|mold|peeling paint|crack|hairline crack|odourless|odorless|anti mould|anti-mould)\b/.test(text)) {
    return answer(
      "A durable paint finish depends on correcting moisture or surface defects first, then proper cleaning, repair, sealer or primer and compatible finish coats. Is the issue ordinary repainting, cracks, peeling or mould?",
      "painting_surface_preparation",
      "painting"
    );
  }

  if (/\b(?:hack|hacking|demolition|dismantle|remove cabinet|remove built-in|remove built in|debris|haulage)\b/.test(text)) {
    return answer(
      "Hacking and dismantling should be planned with protection, service isolation, controlled removal, debris handling and checks on what must remain. What exactly needs to be removed?",
      "hacking_scope_and_protection",
      "hacking"
    );
  }

  if (/\b(?:site protection|protect floor|protection board|dust protection|lift protection|common area protection)\b/.test(text)) {
    return answer(
      "Site protection should match the work risk and protect retained finishes, access routes, lifts or common areas while keeping escape and work paths usable. Which existing finishes or common areas must remain protected?",
      "site_protection_planning",
      "site_preparation"
    );
  }

  if (/\b(?:sequence|sequencing|work order|what comes first|which comes first|renovation process|renovation timeline)\b/.test(text)) {
    return answer(
      "The sequence normally follows confirmed scope and protection, removal works, concealed services and wet works, ceilings and finishes, then carpentry, final fixtures, testing and touch-ups. Is this a full renovation or selected works?",
      "renovation_sequencing",
      "project_planning"
    );
  }

  if (/\b(?:approval|permit|submission|can approve|guarantee approval|authority approval)\b/.test(text)) {
    return answer(
      "Approval requirements depend on the property, exact work scope and whether structural, façade, services or common-property elements are affected. We should review the proposed work before confirming what submissions may be required. What alteration are you planning?",
      "approval_scope_review",
      "project_planning",
      true
    );
  }

  return null;
}
