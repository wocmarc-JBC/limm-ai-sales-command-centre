"use client";

import { useFormStatus } from "react-dom";
import { ActionButton } from "@/components/ActionButton";

export function FollowUpActionButton({
  children,
  pendingLabel,
  tone = "muted"
}: {
  children: string;
  pendingLabel: string;
  tone?: "primary" | "muted" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <ActionButton type="submit" tone={tone} disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </ActionButton>
  );
}
