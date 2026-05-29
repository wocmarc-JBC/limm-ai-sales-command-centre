import { LoginForm } from "@/components/auth/LoginForm";
import { getDataMode } from "@/lib/data/data-source";

export default function LoginPage() {
  const mode = getDataMode();
  return (
    <section className="max-w-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-cyan">Access control</p>
      <h2 className="mt-2 text-3xl font-semibold text-command-text">Sign in to Command Centre</h2>
      <p className="mt-3 text-command-muted">
        Use the approved Supabase account for Marcus or an authorised team member.
      </p>
      <div className="mt-6">
        <LoginForm mode={mode} />
      </div>
    </section>
  );
}
