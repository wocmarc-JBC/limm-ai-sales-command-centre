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
    neutral: "border-command-line before:bg-command-subtle",
    good: "border-command-green/45 before:bg-command-green",
    warn: "border-command-gold/50 before:bg-command-gold",
    danger: "border-command-red/50 before:bg-command-red"
  };
  return (
    <section className={`relative overflow-hidden rounded-2xl border ${tones[tone]} bg-command-card p-4 shadow-command before:absolute before:inset-y-0 before:left-0 before:w-0.5`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-command-muted">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold tabular-nums tracking-[-0.03em] text-command-text">{value}</p>
      {detail ? <p className="mt-2 text-[13px] leading-5 text-command-muted">{detail}</p> : null}
    </section>
  );
}
