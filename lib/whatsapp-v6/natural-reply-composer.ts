import { getLimmInstagramUrl } from "@/lib/whatsapp-lead-context";
import { normaliseV6Text } from "@/lib/whatsapp-v6/singapore-renovation-language";
import { receivedAcknowledgement } from "@/lib/whatsapp-v6/context-truth-gate";
import type { V6ReplyPlan, V6Understanding, V6VerifiedContext } from "@/lib/whatsapp-v6/types";

function hasIntent(understanding: V6Understanding, intent: string) {
  return understanding.detectedIntents.includes(intent);
}

function appointmentTimeText(text: string) {
  const normalized = normaliseV6Text(text);
  if (/\bwed(?:nesday)?\b/i.test(normalized) && /\b2\s*pm\b/i.test(normalized)) return "Wednesday 2pm";
  if (/\bwed(?:nesday)?\b/i.test(normalized)) return "Wednesday";
  if (/\bsat(?:urday)?\b/i.test(normalized)) return "Saturday";
  if (/\btomorrow\b/i.test(normalized)) return "tomorrow";
  const time = normalized.match(/\b\d{1,2}\s*(?:am|pm)\b/i)?.[0];
  return time ? time.toUpperCase().replace(/\s+/g, "") : "the requested timing";
}

function askForMissing(context: V6VerifiedContext, fields: string[], mode: "kitchen" | "appointment" | "wall" | "general" = "general") {
  const missing = fields.filter((field) => context.missingFields.includes(field));
  if (!missing.length) return "";
  if (mode === "kitchen") {
    const basics = [
      missing.includes("property_type") ? "whether this is for a landed house, condo or commercial unit" : "",
      missing.includes("scope") ? "what you're planning to change in the kitchen" : ""
    ].filter(Boolean);
    const media = [
      missing.includes("floor_plan") ? "floor plan" : "",
      missing.includes("site_photos") ? "photos" : ""
    ].filter(Boolean);
    const sentences = [
      basics.length ? `Could you share ${basics.join(" and ")}?` : "",
      media.length ? `If possible, you can also send ${media.join(" and ")} for an initial project review.` : ""
    ].filter(Boolean);
    return sentences.join(" ");
  }
  if (mode === "appointment") {
    const asks = [
      missing.includes("property_type") ? "property type" : "",
      missing.includes("address_or_area") ? "property area/address" : "",
      missing.includes("scope") ? "basic renovation scope" : ""
    ].filter(Boolean);
    return asks.length
      ? `Could you share your ${asks.join(", ").replace(/, ([^,]*)$/, " and $1")} first so the team can review before confirming for an initial project review?`
      : "The team will review the current details and check availability for an initial project review.";
  }
  if (mode === "wall") {
    const media = [
      missing.includes("floor_plan") ? "the floor plan" : "",
      missing.includes("site_photos") ? "photos of the walls" : ""
    ].filter(Boolean);
    return media.length
      ? `If possible, send ${media.join(" and ")} so the team can review the next step for an initial project review.`
      : "The team can review the wall details and next step for an initial project review.";
  }
  const labels = [
    missing.includes("property_type") ? "property type" : "",
    missing.includes("scope") ? "basic scope" : "",
    missing.includes("floor_plan") ? "floor plan" : "",
    missing.includes("site_photos") ? "site photos" : "",
    missing.includes("address_or_area") ? "property area/address" : ""
  ].filter(Boolean);
  return labels.length ? `Could you share the ${labels.join(", ").replace(/, ([^,]*)$/, " and $1")} if available for an initial project review?` : "";
}

function composePortfolio(context: V6VerifiedContext) {
  const instagram = getLimmInstagramUrl();
  const intro = "Yes, you can view some of our renovation works, design references and project-related content on our Instagram here:";
  if (instagram) {
    return `${intro}\n\n${instagram}\n\nIf you're looking for a specific type of reference, let us know whether it's for landed A&A, kitchen, bathroom, carpentry, hacking works, design works or commercial renovation for your initial project review.`;
  }
  return "Yes, we can share relevant references. Could you let us know what type of project you want to see, such as landed A&A, kitchen, bathroom, carpentry, hacking works, design works or commercial renovation for your initial project review?";
}

function composePrice(input: { text: string; understanding: V6Understanding; context: V6VerifiedContext }) {
  const ack = receivedAcknowledgement(input.context);
  if (input.context.hasFloorPlan && input.context.hasScopeOfWork) {
    return `I understand you'd like a rough idea. ${ack || "Thanks, we've received the project details."} We'll need to review the drawings, site condition and material direction first, because giving a rough figure too early can be misleading. The team can go through this properly during the initial project review.`;
  }
  if (hasIntent(input.understanding, "kitchen_renovation")) {
    return "I understand you'd like a rough idea. To advise properly, could you share the kitchen scope first, such as whether it involves hacking, carpentry, plumbing, electrical works, tiles or appliances? Pricing depends on the site condition, materials and exact scope, so we should review the details first for an initial project review.";
  }
  return "I understand you'd like a rough idea. To advise properly, could you share the scope of work first? Pricing depends on the property type, areas involved, site condition, material direction and whether any A&A or authority-related work is needed. Once we understand the scope, we can review the next step more accurately for an initial project review.";
}

function specificWorkLabel(text: string) {
  const normalized = normaliseV6Text(text);
  const match = normalized.match(/\b(laminated wall cladding|wall cladding|fluted panel|feature wall|toilet overlay|false ceiling|vinyl|spc flooring|wardrobe|kitchen cabinet|backsplash|commercial office renovation|waterproofing|hacking 2 walls?)\b/i);
  return match?.[0] ?? "";
}

function composeSpecificWork(text: string, context: V6VerifiedContext) {
  const label = specificWorkLabel(text);
  if (!label) return "";
  const mediaAsk = askForMissing(context, ["site_photos"], "general") || "The team can review the current details and advise the next step for an initial project review.";
  if (/laminated wall cladding|wall cladding|fluted panel|feature wall/i.test(label)) {
    return `Yes, we can help review ${label} works. Suitability depends on the wall condition, moisture exposure, backing/substrate, area size and finishing details. ${mediaAsk}`;
  }
  if (/toilet overlay|waterproofing/i.test(label)) {
    return `Yes, we can help review ${label} works. Wet areas need careful checking because waterproofing, drainage, substrate condition and existing defects can affect the right method. ${mediaAsk}`;
  }
  if (/false ceiling/i.test(label)) {
    return `Yes, we can help review false ceiling works. The team will need to check ceiling height, lighting points, access panels and site condition before advising the next step. ${mediaAsk}`;
  }
  if (/vinyl|spc flooring/i.test(label)) {
    return `Yes, we can help review ${label} works. Floor condition, levelness, moisture and transition details should be checked before advising the right finish. ${mediaAsk}`;
  }
  if (/wardrobe|kitchen cabinet|backsplash/i.test(label)) {
    return `Yes, we can help review ${label} works. It helps to check the area size, measurements, wall condition and finishing direction before advising the next step. ${mediaAsk}`;
  }
  return `Yes, we can help review ${label} works. The team should check the site condition, scope and finishing details before advising the next step for an initial project review. ${mediaAsk}`;
}

function composeAppointment(text: string, context: V6VerifiedContext) {
  const requested = appointmentTimeText(text);
  const ack = receivedAcknowledgement(context);
  const ask = askForMissing(context, ["property_type", "address_or_area", "scope"], "appointment");
  return `${requested} noted. We can help check availability, but the appointment is not confirmed yet. ${ack ? `${ack} ` : ""}${ask || "The team will review the current details and confirm whether that slot works for an initial project review."}`;
}

export function composeNaturalV6Reply(input: {
  inboundText: string;
  inboundMessageType: string;
  understanding: V6Understanding;
  context: V6VerifiedContext;
  plan: V6ReplyPlan;
  calendarEventId?: string | null;
}) {
  const { understanding, context } = input;
  const parts: string[] = [];

  if (input.inboundMessageType === "audio" || input.inboundMessageType === "voice" || hasIntent(understanding, "voice_message")) {
    return "Sorry, we're not able to listen to voice messages here. Could you type the key details instead, such as your property type, renovation scope, and preferred appointment timing for an initial project review?";
  }

  if (hasIntent(understanding, "human_escalation")) {
    return "Thanks, the team should follow up with you directly on this. Could you share the key details, photos or messages related to the issue so it can be checked properly for an initial project review?";
  }

  if (hasIntent(understanding, "portfolio_request")) return composePortfolio(context);
  if (hasIntent(understanding, "price_question")) return composePrice({ text: input.inboundText, understanding, context });
  if (hasIntent(understanding, "specific_works") && !hasIntent(understanding, "demolition_hacking") && !hasIntent(understanding, "structural_wall")) {
    const specificReply = composeSpecificWork(input.inboundText, context);
    if (specificReply) return specificReply;
  }

  const hasKitchen = hasIntent(understanding, "kitchen_renovation");
  const hasWallRisk = hasIntent(understanding, "demolition_hacking") || hasIntent(understanding, "structural_wall");
  const hasAppointment = hasIntent(understanding, "appointment_request");
  const hasDesign = hasIntent(understanding, "design_theme");
  const hasApproval = hasIntent(understanding, "approval_submission");
  const hasLanded = hasIntent(understanding, "landed_renovation") || hasIntent(understanding, "aa_works");

  if (hasKitchen && hasWallRisk) {
    parts.push("Yes, we can help review the kitchen renovation and wall demolition scope.");
    parts.push("For the walls, we'll need to check the floor plan, wall type, site condition and whether any services are inside before advising the safe next step.");
    parts.push(askForMissing(context, ["floor_plan", "site_photos"], "wall") || "The team can review the wall details and next step for an initial project review.");
    return parts.join(" ");
  }

  if (hasAppointment || hasDesign || hasLanded || hasWallRisk || hasApproval) {
    if (hasLanded || hasDesign || hasAppointment) {
      const scopes = [
        hasLanded ? "landed renovation" : "",
        hasDesign ? "design direction" : "",
        hasAppointment ? "appointment request" : ""
      ].filter(Boolean);
      if (scopes.length) parts.push(`Yes, we can help with the ${scopes.join(", ").replace(/, ([^,]*)$/, " and $1")}.`);
    }
    if (hasDesign) parts.push("For the design theme, we can propose a suitable direction after reviewing your layout, lighting, storage needs and preferred style.");
    if (hasAppointment) parts.push(composeAppointment(input.inboundText, context));
    if (hasWallRisk || hasApproval) parts.push("For wall hacking or approval matters, we'll need to review the drawings and site condition first because it depends on the wall type, structure, services, scope and whether submission is required.");
    const ack = receivedAcknowledgement(context);
    const missing = askForMissing(context, ["floor_plan", "site_photos", "address_or_area", "scope"], "general");
    if (!hasAppointment && (ack || missing)) parts.push(`${ack ? `${ack} ` : ""}${missing || "The team can review the details for an initial project review."}`.trim());
    return parts.join("\n\n").trim();
  }

  if (hasKitchen) return `Hi, yes we can help with kitchen renovation. ${askForMissing(context, ["property_type", "scope", "floor_plan", "site_photos"], "kitchen")}`;

  if (hasIntent(understanding, "approval_submission")) {
    return "It depends on the exact scope and property type. Some works may require proper checking or submission, so we should review the drawings, site condition and proposed changes before advising for an initial project review.";
  }

  if (understanding.chineseDetected) {
    return "Hi, yes we can help review your renovation enquiry. Could you type the property type, basic scope, and any floor plan or photos if available for an initial project review?";
  }

  if (hasIntent(understanding, "greeting_ping")) {
    return "Hi, yes we're here. How can we help with your renovation? You can share your property type, basic scope, and any floor plan or photos if available for an initial project review.";
  }

  return "Thanks for reaching out. We can help review your renovation enquiry. Could you share your property type, basic scope, and any floor plan or photos if available for an initial project review?";
}
