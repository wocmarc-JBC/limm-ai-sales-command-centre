export function StatusBadge({ label }: { label: string }) {
  const lower = label.toLowerCase();
  const tone = lower.includes("hot") || lower.includes("approval") || lower.includes("marcus")
    ? "border-command-red/60 bg-command-red/10 text-command-red"
    : lower.includes("ready") || lower.includes("sent") || lower.includes("gold")
      ? "border-command-green/60 bg-command-green/10 text-command-green"
      : lower.includes("paused") || lower.includes("test") || lower.includes("archive") || lower.includes("spam")
        ? "border-command-gold/55 bg-command-gold/10 text-command-yellow"
        : "border-command-line bg-command-elevated text-command-muted";
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-4 ${tone}`}>{label}</span>;
}
