"use client";

import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/data/supabase-browser";

export function LogoutButton({
  mode,
  compact = false
}: {
  mode: "Mock Mode" | "Supabase Mode";
  compact?: boolean;
}) {
  const router = useRouter();

  async function logout() {
    if (mode === "Supabase Mode") {
      await getSupabaseBrowserClient().auth.signOut();
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      className={`${compact ? "w-full justify-center" : "mt-2"} inline-flex min-h-10 items-center rounded-xl border border-command-line bg-command-panel2 px-3 py-2 text-xs font-semibold text-command-muted transition hover:border-command-gold/50 hover:text-command-text`}
    >
      Logout
    </button>
  );
}
