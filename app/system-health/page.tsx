import { PageHeader } from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth/session";
import { getCalendarRuntime } from "@/lib/calendar-config";
import { getDataMode } from "@/lib/data/data-source";
import { getHandoffEmailRuntime } from "@/lib/handoff-email";
import { getOpenAiWhatsAppReplyRuntime } from "@/lib/openai-whatsapp-config";
import { getWhatsAppRuntime } from "@/lib/whatsapp-config";

function boolLabel(value: boolean) {
  return value ? "Yes" : "No";
}

function schemaSummaryRows() {
  const status = process.env.FULL_SUPABASE_SCHEMA_STATUS ?? "Not run in this runtime";
  const missingTables = process.env.FULL_SUPABASE_SCHEMA_MISSING_TABLES ?? "";
  const missingColumns = process.env.FULL_SUPABASE_SCHEMA_MISSING_COLUMNS ?? "";
  const missingIndexes = process.env.FULL_SUPABASE_SCHEMA_MISSING_INDEXES ?? "";
  const missingPolicies = process.env.FULL_SUPABASE_SCHEMA_MISSING_POLICIES ?? "";
  const missingBuckets = process.env.FULL_SUPABASE_SCHEMA_MISSING_BUCKETS ?? "";
  return [
    ["Schema verifier", status],
    ["Missing tables", missingTables || "None reported"],
    ["Missing columns", missingColumns || "None reported"],
    ["Missing indexes", missingIndexes || "None reported"],
    ["Missing policies", missingPolicies || "None reported"],
    ["Missing storage buckets", missingBuckets || "None reported"]
  ];
}

export default async function SystemHealthPage() {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) {
    return (
      <>
        <PageHeader title="System Health" eyebrow="Read-only diagnostics" />
        <section className="rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Login required</p>
          <h2 className="mt-1 text-2xl font-semibold">Protected system health view</h2>
          <p className="mt-2 text-command-muted">Sign in before viewing internal diagnostics.</p>
        </section>
      </>
    );
  }

  const whatsapp = getWhatsAppRuntime();
  const calendar = getCalendarRuntime();
  const handoffEmail = getHandoffEmailRuntime();
  const openAiWhatsApp = getOpenAiWhatsAppReplyRuntime();
  const dataMode = getDataMode();
  const schemaRows = schemaSummaryRows();
  const schemaWarning = schemaRows.some(([, value]) => !["None reported", "Not run in this runtime"].includes(value) && value.length > 0);
  const rows = [
    ["App version", process.env.npm_package_version ?? "5.0.0"],
    ["Commit", process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "Not available locally"],
    ["Data mode", dataMode],
    ["Supabase mode", auth.mode],
    ["Current role", auth.profile.role],
    ["WhatsApp health", whatsapp.statusLabel],
    ["WhatsApp live inbound", boolLabel(whatsapp.liveInboundEnabled)],
    ["OpenAI WhatsApp reply", openAiWhatsApp.enabled ? "Enabled" : "Off"],
    ["Price guide automation", "Off"],
    ["Calendar auto-booking", calendar.autoBookingEnabled ? "Enabled" : "Off"],
    ["Email sending provider", handoffEmail.configured ? "Configured" : "Not configured"],
    ["Handoff email enabled", handoffEmail.enabled ? "Enabled" : "Off"]
  ];

  return (
    <>
      <PageHeader title="System Health" eyebrow="Read-only diagnostics">
        <a
          href="/leads/new?template=qa"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black transition hover:bg-command-goldHover"
        >
          Create QA Test Lead
        </a>
        <a
          href="/api/whatsapp/health"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-cyan/60 bg-command-cyan/10 px-4 py-2 text-base font-semibold text-command-cyan transition hover:bg-command-cyan/15"
        >
          WhatsApp Health JSON
        </a>
        <a
          href="/settings"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-muted transition hover:border-command-gold/60"
        >
          Settings
        </a>
      </PageHeader>

      {schemaWarning ? (
        <section className="mb-6 rounded-lg border border-command-red/60 bg-command-red/10 p-4 text-command-red">
          <p className="font-semibold">Schema warning</p>
          <p className="mt-1 text-sm">The latest schema verifier summary reports missing database requirements. Run `npm run verify:full-supabase` against the target Supabase database before release.</p>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Runtime posture</p>
          <h2 className="mt-1 text-2xl font-semibold">App and automation status</h2>
          <div className="mt-5 divide-y divide-command-line">
            {rows.map(([label, value]) => (
              <div key={label} className="grid gap-2 py-3 sm:grid-cols-[14rem_1fr]">
                <span className="text-command-muted">{label}</span>
                <span className="font-semibold text-command-text">{value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Schema verifier</p>
          <h2 className="mt-1 text-2xl font-semibold">Database compatibility</h2>
          <p className="mt-2 text-command-muted">This page does not connect to the database directly. Use the read-only CLI verifier and publish its summary through environment metadata if needed.</p>
          <div className="mt-5 divide-y divide-command-line">
            {schemaRows.map(([label, value]) => (
              <div key={label} className="grid gap-2 py-3 sm:grid-cols-[14rem_1fr]">
                <span className="text-command-muted">{label}</span>
                <span className="font-semibold text-command-text">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
