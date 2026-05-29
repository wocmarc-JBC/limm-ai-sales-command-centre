"use client";

import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/data/supabase-browser";

export function LogoutButton({ mode }: { mode: "Mock Mode" | "Supabase Mode" }) {
  const router = useRouter();

  async function logout() {
    if (mode === "Supabase Mode") {
      await getSupabaseBrowserClient().auth.signOut();
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={logout} className="mt-2 rounded border border-command-line bg-command-panel2 px-3 py-2 text-xs text-command-muted transition hover:text-command-text">
      Logout
    </button>
  );
}
