import type { Lead } from "@/lib/types";

export function containsProtectedName(text: string) {
  return /marcus|fio/i.test(text);
}

export function maskPhone(phone: string) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "";
  const suffix = digits.slice(-4);
  return digits.startsWith("65") ? `+65 **** ${suffix}` : `**** ${suffix}`;
}

export function looksGeneratedLeadName(name: string) {
  const trimmed = name.trim();
  return !trimmed
    || /^whats\s*app lead$/i.test(trimmed)
    || /^whatsapp enquiry$/i.test(trimmed)
    || /^unknown(?:\s+lead|\s+client)?$/i.test(trimmed)
    || /^(v[3-9]|qa|test|sample|sandbox|browser[_ -]?test|playwright|codex|chatgpt|dev[_ -]?brain|generated)/i.test(trimmed)
    || /\b(test|qa|sample|sandbox|playwright|dev brain|chatgpt|codex)\b/i.test(trimmed)
    || /\bv[3-9][._ -]?(test|qa|live|brain|ultimate|cleanup)\b/i.test(trimmed)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
    || /^[a-z0-9_-]{24,}$/i.test(trimmed);
}

export function formatLeadDisplayName(lead: Lead) {
  const name = lead.clientName.trim();
  if (containsProtectedName(name)) return name;

  const generatedName = looksGeneratedLeadName(name);
  if (lead.isTest) return "Test Lead";
  if (generatedName) {
    const phone = maskPhone(lead.phone);
    if (phone) return /whats\s*app/i.test(lead.source) ? `WhatsApp Lead ${phone}` : `Lead ${phone}`;
    return /whats\s*app/i.test(lead.source) ? "Unknown WhatsApp Lead" : "Unknown Lead";
  }
  return name;
}

export const cleanLeadDisplayName = formatLeadDisplayName;

export function leadSubtitle(lead: Lead) {
  const property = lead.propertyType || "Property type pending";
  const scope = lead.scopeSummary || "Scope pending";
  return `${property} | ${scope}`;
}
