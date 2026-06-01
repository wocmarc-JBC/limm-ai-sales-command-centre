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
    good: "border-command-green/55",
    warn: "border-command-gold/65",
    danger: "border-command-red/65"
  };
  return (
    <section className={`rounded-lg border ${tones[tone]} bg-command-card p-5 shadow-premium`}>
      <p className="text-sm font-medium text-command-muted">{label}</p>
      <p className="mt-2 text-4xl font-semibold text-command-text">{value}</p>
      {detail ? <p className="mt-3 text-sm leading-6 text-command-muted">{detail}</p> : null}
    </section>
  );
}
