export type ParsedWhatsAppMessage = {
  senderPhone: string;
  providerMessageId: string;
  timestamp: string | null;
  text: string;
  type: string;
  contactName: string;
  businessPhoneNumberId: string;
};

function parseProviderTimestamp(timestamp: unknown) {
  if (timestamp === null || timestamp === undefined || timestamp === "") return null;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function parseWhatsAppInbound(payload: any): ParsedWhatsAppMessage[] {
  const parsed: ParsedWhatsAppMessage[] = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value ?? {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        const senderPhone = String(message?.from ?? "");
        const providerMessageId = String(message?.id ?? "");
        const type = String(message?.type ?? "");
        const text = type === "text" ? String(message?.text?.body ?? "").trim() : "";
        const contact = contacts.find((item: any) => String(item?.wa_id ?? "") === senderPhone) ?? contacts[0] ?? {};
        parsed.push({
          senderPhone,
          providerMessageId,
          timestamp: parseProviderTimestamp(message?.timestamp),
          text,
          type,
          contactName: String(contact?.profile?.name ?? ""),
          businessPhoneNumberId: String(value?.metadata?.phone_number_id ?? "")
        });
      }
    }
  }

  return parsed;
}
