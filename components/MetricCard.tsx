export function MetricCard({
  label,
  value,
  tone = "neutral",
  detail
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "good" | "warn" | "danger";
  detail?: string;
}) {
  const tones = {
    neutral: "border-command-line",
    good: "border-command-green/50",
    warn: "border-command-amber/60",
    danger: "border-command-red/60"
  };
  return (
    <section className={`rounded border ${tones[tone]} bg-command-panel p-4 shadow-command`}>
      <p className="text-sm text-command-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-command-text">{value}</p>
      {detail ? <p className="mt-2 text-sm text-command-muted">{detail}</p> : null}
    </section>
  );
}
