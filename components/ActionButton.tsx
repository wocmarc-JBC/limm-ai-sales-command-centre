import type { ButtonHTMLAttributes, ReactNode } from "react";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "primary" | "muted" | "danger";
};

export function ActionButton({ children, tone = "primary", type = "button", ...props }: ActionButtonProps) {
  const tones = {
    primary: "border-command-cyan bg-command-cyan text-black",
    muted: "border-command-line bg-command-panel2 text-command-text",
    danger: "border-command-red bg-command-red/12 text-command-red"
  };
  return (
    <button
      type={type}
      className={`inline-flex min-h-10 items-center justify-center rounded border px-4 py-2 text-sm font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55 ${tones[tone]}`}
      {...props}
    >
      {children}
    </button>
  );
}
