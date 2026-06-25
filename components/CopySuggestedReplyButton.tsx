"use client";

import { useState } from "react";

export function CopySuggestedReplyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
      className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-sm font-semibold text-command-text transition hover:border-command-cyan/70 hover:bg-command-cyan/10"
    >
      {copied ? "Copied" : "Copy Suggested Reply"}
    </button>
  );
}
