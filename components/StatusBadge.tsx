export function StatusBadge({ label }: { label: string }) {
  const lower = label.toLowerCase();
  const tone = lower.includes("hot") || lower.includes("approval")
    ? "border-command-red/60 bg-command-red/10 text-command-red"
    : lower.includes("ready")
      ? "border-command-green/60 bg-command-green/10 text-command-green"
      : "border-command-line bg-command-panel2 text-command-muted";
  return <span className={`rounded border px-2 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}
