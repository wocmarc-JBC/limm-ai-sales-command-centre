export const OPENAI_DRY_RUN_DRAFT_NOTICE = "Draft only — boss approval required";

export function isOpenAiBrainDryRunEnabled() {
  return process.env.OPENAI_BRAIN_DRY_RUN === "true";
}

export function hasOpenAiApiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAiBrainRuntime() {
  const dryRunEnabled = isOpenAiBrainDryRunEnabled();
  const keyConfigured = hasOpenAiApiKey();
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!dryRunEnabled) {
    return {
      enabled: false,
      dryRunEnabled,
      keyConfigured,
      canCallOpenAi: false,
      model,
      status: "disabled" as const,
      label: "Disabled by default"
    };
  }

  if (!keyConfigured) {
    return {
      enabled: true,
      dryRunEnabled,
      keyConfigured,
      canCallOpenAi: false,
      model,
      status: "dry_run_key_missing" as const,
      label: "Dry-run enabled; OpenAI key missing; safe fallback only"
    };
  }

  return {
    enabled: true,
    dryRunEnabled,
    keyConfigured,
    canCallOpenAi: true,
    model,
    status: "dry_run_ready" as const,
    label: "Dry-run ready; no auto-send; boss approval required"
  };
}
