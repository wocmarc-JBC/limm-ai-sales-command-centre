"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/data/supabase-browser";

export function LoginForm({ mode }: { mode: "Mock Mode" | "Supabase Mode" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(formData: FormData) {
    setError("");
    if (mode === "Mock Mode") {
      router.push("/command-core");
      return;
    }

    setLoading(true);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const { error: loginError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
    setLoading(false);

    if (loginError) {
      setError(loginError.message);
      return;
    }

    router.push("/command-core");
    router.refresh();
  }

  if (mode === "Mock Mode") {
    return (
      <div className="rounded border border-command-line bg-command-panel p-6 shadow-command">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-cyan">Mock Mode</p>
        <p className="mt-2 text-command-muted">Supabase env vars are missing, so Marcus demo boss access is available without real credentials.</p>
        <p className="mt-2 text-sm text-command-muted">To use real sign-in, configure the Supabase URL and publishable key, then restart the app.</p>
        <Link href="/command-core" data-testid="login-mock-enter" className="mt-5 inline-flex rounded border border-command-cyan bg-command-cyan px-4 py-2 text-sm font-semibold text-black">
          Enter Command Centre
        </Link>
      </div>
    );
  }

  return (
    <form action={submit} className="rounded border border-command-line bg-command-panel p-6 shadow-command">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-cyan">Supabase Mode</p>
      <p className="mt-2 text-sm text-command-muted">Enter the authorised email and password.</p>
      <div className="mt-5 grid gap-4">
        <label className="grid gap-1 text-sm">
          <span className="text-command-muted">Email</span>
          <input name="email" type="email" required className="rounded border border-command-line bg-command-bg px-3 py-2 text-command-text" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-command-muted">Password</span>
          <input name="password" type="password" required className="rounded border border-command-line bg-command-bg px-3 py-2 text-command-text" />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-command-red">{error}</p> : null}
      <button disabled={loading} data-testid="login-submit" className="mt-5 rounded border border-command-cyan bg-command-cyan px-4 py-2 text-sm font-semibold text-black disabled:opacity-60">
        {loading ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
