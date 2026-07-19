type SupabaseSchemaError = {
  code?: string | null;
  message?: string | null;
};

export const INTENT_GATE_INSERT_COLUMNS = new Set([
  "conversation_intent",
  "lead_eligible",
  "conversation_route",
  "intent_confidence",
  "intent_reason_codes",
  "intent_classifier_version",
  "intent_classified_at",
  "conversation_safety_state"
]);

const SCHEMA_COMPATIBILITY_ERROR = /column|schema cache|PGRST204|42703/i;

function missingColumnFromError(error: SupabaseSchemaError) {
  const detail = `${error.code ?? ""} ${error.message ?? ""}`;
  const patterns = [
    /could not find the ['"]([a-z0-9_]+)['"] column/i,
    /column ['"]?([a-z0-9_]+)['"]? of relation ['"]?leads['"]? does not exist/i,
    /column (?:public\.)?leads\.([a-z0-9_]+) does not exist/i
  ];
  for (const pattern of patterns) {
    const match = detail.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function nextWhatsAppLeadCompatibilityRow(
  row: Record<string, unknown>,
  error: SupabaseSchemaError
) {
  const detail = `${error.code ?? ""} ${error.message ?? ""}`;
  if (!SCHEMA_COMPATIBILITY_ERROR.test(detail)) return null;

  const missingColumn = missingColumnFromError(error);
  if (missingColumn === "intake_profile" && Object.hasOwn(row, missingColumn)) {
    return Object.fromEntries(Object.entries(row).filter(([column]) => column !== missingColumn));
  }

  if (missingColumn && INTENT_GATE_INSERT_COLUMNS.has(missingColumn)) {
    const compatible = Object.fromEntries(
      Object.entries(row).filter(([column]) => !INTENT_GATE_INSERT_COLUMNS.has(column))
    );
    return Object.keys(compatible).length < Object.keys(row).length ? compatible : null;
  }

  return null;
}
