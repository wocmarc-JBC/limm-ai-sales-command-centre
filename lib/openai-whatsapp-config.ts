export function isOpenAiWhatsAppReplyEnabled() {
  return process.env.OPENAI_WHATSAPP_REPLY_ENABLED === "true";
}

export function getOpenAiWhatsAppReplyRuntime() {
  const enabled = isOpenAiWhatsAppReplyEnabled();
  const keyConfigured = Boolean(process.env.OPENAI_API_KEY);
  const model = process.env.OPENAI_WHATSAPP_MODEL || "gpt-4.1-mini";
  const debug = process.env.WHATSAPP_REPLY_BRAIN_DEBUG === "true";

  return {
    enabled,
    keyConfigured,
    canCallOpenAi: enabled && keyConfigured,
    model,
    debug,
    status: !enabled ? "disabled" as const : keyConfigured ? "ready" as const : "fallback_key_missing" as const
  };
}
