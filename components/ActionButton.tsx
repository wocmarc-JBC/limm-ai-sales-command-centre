import type { ButtonHTMLAttributes, ReactNode } from "react";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "primary" | "muted" | "danger";
};

export function ActionButton({ children, tone = "primary", type = "button", ...props }: ActionButtonProps) {
  const tones = {
    primary: "border-command-gold bg-command-gold text-black hover:bg-command-goldHover",
    muted: "border-command-line bg-command-elevated text-command-text hover:border-command-gold/60",
    danger: "border-command-red bg-command-red/10 text-command-red hover:bg-command-red/20"
  };
  return (
    <button
      type={type}
      className={`command-press inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${tones[tone]}`}
      {...props}
    >
      {children}
    </button>
  );
}
