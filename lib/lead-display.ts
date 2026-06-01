import type { Lead } from "@/lib/types";

export function containsProtectedName(text: string) {
  return /marcus|fio/i.test(text);
}

export function cleanLeadDisplayName(lead: Lead) {
  const name = lead.clientName.trim();
  if (containsProtectedName(name)) return name;

  const generatedName = !name
    || /^whats\s*app lead$/i.test(name)
    || /^whatsapp enquiry$/i.test(name)
    || /\b(test|qa|sample|sandbox|playwright|dev brain|chatgpt|codex)\b/i.test(name)
    || /\bv[3-6][._ -]?(test|qa|live|brain|ultimate)\b/i.test(name);

  if (lead.isTest) return "Test Lead";
  if (generatedName && /whats\s*app/i.test(lead.source)) return "WhatsApp Enquiry";
  if (generatedName) return "Internal Test Lead";
  return name;
}

export function leadSubtitle(lead: Lead) {
  const property = lead.propertyType || "Property type pending";
  const scope = lead.scopeSummary || "Scope pending";
  return `${property} | ${scope}`;
}
