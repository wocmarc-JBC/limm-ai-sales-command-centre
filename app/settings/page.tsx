import { PageHeader } from "@/components/PageHeader";
import { CleanupPanel } from "@/components/CleanupPanel";
import { cleanupOldTestLeadsAction } from "@/lib/actions";
import { getCurrentProfile } from "@/lib/auth/session";
import { getCalendarRuntime } from "@/lib/calendar-config";
import { listFollowUps } from "@/lib/data/followups-repository";
import { listLeadMessages } from "@/lib/data/lead-messages-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { getSettingsSummary } from "@/lib/data/settings-repository";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { getOpenAiBrainRuntime } from "@/lib/openai-brain-config";
import { getOpenAiWhatsAppReplyRuntime } from "@/lib/openai-whatsapp-config";
import { buildTestFollowUpCleanupPlan, buildTestLeadCleanupPlan } from "@/lib/test-lead-cleanup";
import { getWhatsAppRuntime } from "@/lib/whatsapp-config";

export default async function SettingsPage({ searchParams }: { searchParams?: { cleanup?: string } }) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) {
    return (
      <>
        <PageHeader title="Settings" eyebrow="System controls" />
        <section className="rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Protected controls</p>
          <h2 className="mt-1 text-2xl font-semibold">Login required</h2>
          <p className="mt-2 text-base text-command-muted">
            Sign in before loading live settings, cleanup counts, and system health details.
          </p>
        </section>
      </>
    );
  }

  const { health } = await getSettingsSummary();
  const openAi = getOpenAiBrainRuntime();
  const openAiWhatsApp = getOpenAiWhatsAppReplyRuntime();
  const whatsapp = getWhatsAppRuntime();
  const calendar = getCalendarRuntime();
  const cleanupScanRequested = searchParams?.cleanup === "scan";
  const cleanupLeads = cleanupScanRequested ? await listLeads({ includeInactive: true, includeTest: true }) : [];
  const cleanupMessages = cleanupScanRequested ? await Promise.all(cleanupLeads.map(async (lead) => [lead.id, await listLeadMessages(lead.id)] as const)) : [];
  const cleanupPlan = cleanupScanRequested ? buildTestLeadCleanupPlan(cleanupLeads, new Map(cleanupMessages)) : [];
  const cleanupFollowUps = cleanupScanRequested ? await listFollowUps({ includeTest: true, includeCompleted: true, status: "all", pageSize: 500, scanAll: true }) : [];
  const followUpCleanupPlan = cleanupScanRequested ? buildTestFollowUpCleanupPlan(cleanupFollowUps) : [];
  const cleanupTargets = cleanupPlan.filter((item) => item.action === "mark_test_and_soft_delete");
  const followUpTargets = followUpCleanupPlan.filter((item) => item.action === "hide_or_complete_test_followup");
  const cleanupProtected = cleanupPlan.filter((item) => item.action === "protected_marcus_fio");
  const followUpProtected = followUpCleanupPlan.filter((item) => item.action === "protected_marcus_fio");
  const cleanupUncertain = cleanupPlan.filter((item) => item.action === "not_touched");
  const followUpUncertain = followUpCleanupPlan.filter((item) => item.action === "not_touched");
  const cleanupAlreadySoftDeleted = cleanupPlan.filter((item) => item.action === "already_soft_deleted_keep");
  const followUpAlreadyHidden = followUpCleanupPlan.filter((item) => item.action === "already_hidden_keep");
  const cleanupSamples = cleanupPlan
    .filter((item) => item.action !== "not_touched")
    .slice(0, 8)
    .map((item) => ({
      id: item.lead.id,
      name: formatLeadDisplayName(item.lead),
      status: item.action.replace(/_/g, " "),
      reason: [...item.reasons, ...item.weakReasons, item.riskWarning].filter(Boolean).join("; ") || "No action"
    }));
  const followUpSamples = followUpCleanupPlan
    .filter((item) => item.action !== "not_touched")
    .slice(0, 8)
    .map((item) => ({
      id: item.followUp.id,
      name: item.followUp.clientName,
      status: item.action.replace(/_/g, " "),
      reason: [...item.reasons, ...item.weakReasons, item.riskWarning].filter(Boolean).join("; ") || "No action"
    }));
  const settingGroups = [
    {
      title: "System / Supabase",
      detail: "Connection, auth, RLS, and live verification proof.",
      rows: [
        ["Current mode", health.mode],
        ["Supabase connected", health.supabaseUrlDetected && health.supabaseAnonKeyDetected ? "Yes" : "No"],
        ["Supabase URL detected", health.supabaseUrlDetected ? "Yes" : "No"],
        ["Supabase anon key detected", health.supabaseAnonKeyDetected ? "Yes" : "No"],
        ["Auth status", health.authEnabled ? "Enabled in Supabase Mode" : "Disabled in Mock Mode"],
        ["Current user", auth.profile ? auth.profile.fullName : "Not logged in"],
        ["Current user email", auth.profile ? auth.profile.email : "Not logged in"],
        ["Current role", auth.profile ? auth.profile.role : "None"],
        ["Audit log writable", health.mode === "Supabase Mode" ? "Unknown until action test" : "Yes in Mock Mode"],
        ["RLS expected", health.rlsExpected ? "Yes" : "No"],
        ["RLS enforced status", health.rlsExpected ? "Expected through Supabase policies" : "Not active in Mock Mode"],
        ["Environment", process.env.NEXT_PUBLIC_APP_ENV ?? "local"],
        ["Live verification", process.env.LIVE_SUPABASE_VERIFIED_AT ? `Last marked: ${process.env.LIVE_SUPABASE_VERIFIED_AT}` : "Run npm run verify:live-supabase manually"]
      ]
    },
    {
      title: "Bot / WhatsApp",
      detail: "Reply-only live mode remains kill-switch controlled.",
      rows: [
        ["WhatsApp", health.whatsappStatus],
        ["WhatsApp live inbound", whatsapp.liveInboundEnabled ? "Enabled" : "Disabled by default"],
        ["WhatsApp test auto-reply", whatsapp.testAutoReplyEnabled ? "Enabled" : "Disabled by default"],
        ["WhatsApp public auto-reply", whatsapp.publicAutoReplyEnabled ? "Enabled - Marcus-approved live mode" : "Disabled"],
        ["WhatsApp credentials", whatsapp.credentialsReady ? "Configured" : "Missing or incomplete"],
        ["WhatsApp auto-reply posture", whatsapp.statusLabel],
        ["Bot enabled/disabled", whatsapp.testAutoReplyEnabled ? "Enabled through WhatsApp auto-reply flag" : "Disabled by kill switch"],
        ["Bot pause behaviour", process.env.BOT_PAUSE_DEFAULT_MODE ?? "manual"]
      ]
    },
    {
      title: "Handoff Email / Portfolio",
      detail: "Human follow-up and Instagram routing settings.",
      rows: [
        ["Handoff email", process.env.HANDOFF_EMAIL_TO || "limmwork@gmail.com"],
        ["Handoff email enabled", process.env.HANDOFF_EMAIL_ENABLED === "true" ? "Enabled" : "Disabled or provider missing"],
        ["Instagram URL", process.env.NEXT_PUBLIC_LIMM_INSTAGRAM_URL || process.env.LIMM_INSTAGRAM_URL || "https://www.instagram.com/limmworks/"]
      ]
    },
    {
      title: "Safety Rules",
      detail: "These guardrails stay on for internal use and live WhatsApp.",
      rows: [
        ["OpenAI", openAi.label],
        ["OpenAI dry-run", openAi.dryRunEnabled ? "Enabled for draft recommendations only" : "Off by default"],
        ["OpenAI WhatsApp reply brain", openAiWhatsApp.enabled ? `${openAiWhatsApp.status} (${openAiWhatsApp.model})` : "Off by default"],
        ["OpenAI live actions", "Disabled"],
        ["WhatsApp safety", "No pricing / no Calendar booking / safety validator required"],
        ["Live auto-send", "Off"]
      ]
    },
    {
      title: "Calendar / Roles",
      detail: "Calendar remains boss-approved foundation only.",
      rows: [
        ["Calendar", health.calendarStatus],
        ["Calendar booking enabled", calendar.bookingEnabled ? "Enabled" : "Disabled by default"],
        ["Calendar boss approval required", calendar.bossApprovalRequired ? "Yes" : "No"],
        ["Calendar auto booking", calendar.autoBookingEnabled ? "Enabled" : "Disabled"],
        ["Google Calendar connected", calendar.googleCalendarConnected ? "Connected" : "Not connected"],
        ["Calendar timezone", calendar.timezone],
        ["Appointment settings writable", auth.profile?.role === "boss" ? "Yes for boss role" : "Boss role required"]
      ]
    },
    {
      title: "UI Theme / QA",
      detail: "Premium command centre and local QA commands.",
      rows: [
        ["Lead scoring", process.env.LEAD_SCORING_ENABLED === "false" ? "Disabled" : "Enabled as internal scoring foundation"],
        ["Weekly boss report draft", process.env.WEEKLY_BOSS_REPORT_DRAFT_ENABLED === "false" ? "Disabled" : "Available as draft foundation"],
        ["Premium theme", process.env.GOLD_COMMAND_CENTRE_UI_ENABLED === "false" ? "Disabled" : "Premium gold command centre active"],
        ["QA Centre", process.env.V6_ULTIMATE_QA_CENTRE_ENABLED === "false" ? "Disabled" : "Read-only QA report viewer and CLI commands"],
        ["Target monthly volume", "Around 60 leads"],
        ["Cost posture", "Lean internal operating cost target"]
      ]
    }
  ];
  const adminHubSections = [
    {
      title: "Business Settings",
      id: "business-settings",
      detail: "Business operating controls that are not needed in the daily sidebar.",
      links: [
        ["Appointment Settings", "/appointment-settings", "Control allowed days, Sunday setting, notice, buffers, and appointment types."],
        ["Targets", "/targets", "Monthly target and operating goal setup."],
        ["Sales & Collection", "/sales-collection", "Collection and payment status workspace."]
      ]
    },
    {
      title: "System Settings",
      id: "system-settings",
      detail: "System proof, QA, audit trail, and bot controls.",
      links: [
        ["WhatsApp / Bot Settings", "#bot-whatsapp-settings", "Review WhatsApp mode, bot posture, and live safety flags."],
        ["Health / Diagnostics", "/health", "Read-only system health page."],
        ["QA Centre", "/reports", "Boss reports and QA output."],
        ["Audit Log", "/audit-log", "Trace important actions and safety decisions."]
      ]
    },
    {
      title: "Data & Admin",
      id: "data-admin",
      detail: "Data cleanup, files, developer tools, and hidden lead views.",
      links: [
        ["Client Files", "/client-files", "Review file intake and upload-link status."],
        ["Cleanup", "/settings?cleanup=scan#test-lead-cleanup", "Dry-run cleanup before soft-deleting test data."],
        ["Developer Tools", "#developer-tools", "Safe command references only; no browser script execution."],
        ["Archived / Test Leads", "/leads?view=all", "Review hidden, archived, spam, or test lead records."]
      ]
    }
  ];

  return (
    <>
      <PageHeader title="Settings" eyebrow="Admin hub" />
      <section className="mb-6 grid gap-5 xl:grid-cols-3">
        {adminHubSections.map((section) => (
          <div key={section.title} id={section.id} className="mission-panel rounded-2xl p-5 shadow-premium">
            <p className="text-xs uppercase tracking-[0.24em] text-command-gold">{section.title}</p>
            <p className="mt-2 text-sm leading-6 text-command-muted">{section.detail}</p>
            <div className="mt-5 grid gap-3">
              {section.links.map(([label, href, detail]) => (
                <a
                  key={label}
                  href={href}
                  className="block rounded-xl border border-command-line bg-command-bg/55 p-3 transition hover:border-command-cyan/70 hover:bg-command-cyan/10"
                >
                  <span className="font-semibold text-command-text">{label}</span>
                  <span className="mt-1 block text-sm leading-5 text-command-muted">{detail}</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        {settingGroups.map((group) => (
          <section
            key={group.title}
            id={group.title === "Bot / WhatsApp" ? "bot-whatsapp-settings" : undefined}
            className="rounded-lg border border-command-line bg-command-card p-5 shadow-premium"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-command-gold">{group.title}</p>
            <p className="mt-2 text-base text-command-muted">{group.detail}</p>
            <div className="mt-5 divide-y divide-command-line">
              {group.rows.map(([label, value]) => (
                <div key={label} className="grid gap-2 py-3 sm:grid-cols-[13rem_1fr]">
                  <span className="text-command-muted">{label}</span>
                  <span className="font-semibold text-command-text">{value}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <section id="developer-tools" className="mt-6 rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
        <p className="text-xs uppercase tracking-[0.24em] text-command-gold">In-App QA Centre</p>
        <h2 className="mt-1 text-2xl font-semibold">Boss QA report viewer</h2>
        <p className="mt-2 text-base text-command-muted">
          Script execution from the browser is intentionally not exposed. Use the safe CLI checks below, then review the generated reports in the workspace.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {[
            ["Run WhatsApp Brain Test", "node scripts/test_v6_ultimate_deep_qa.mjs"],
            ["Run Media Context Test", "node scripts/test_v5_3_2_deep_whatsapp_agent_qa.mjs"],
            ["Run Safety Test", "node scripts/audit_v3_package.mjs"],
            ["Run Delete/Restore Test", "node scripts/test_v6_ultimate_deep_qa.mjs"],
            ["Dry Run Test Lead Cleanup", "node scripts/cleanup_old_test_leads_v6_1.mjs"],
            ["Apply Test Lead Cleanup", "node scripts/cleanup_old_test_leads_v6_1.mjs --apply"],
            ["Run Handoff Email Dry Run", "node scripts/test_v5_3_2_deep_whatsapp_agent_qa.mjs"],
            ["Generate Boss QA Report", "npm.cmd run qa:dev-brain"]
          ].map(([label, command]) => (
            <div key={label} className="rounded-lg border border-command-line bg-command-elevated p-4">
              <p className="font-semibold text-command-text">{label}</p>
              <p className="mt-2 font-mono text-xs text-command-muted">{command}</p>
            </div>
          ))}
        </div>
      </section>
      <CleanupPanel
        action={cleanupOldTestLeadsAction}
        scanRequested={cleanupScanRequested}
        scanned={cleanupPlan.length}
        followUpsScanned={followUpCleanupPlan.length}
        targets={cleanupTargets.length}
        followUpTargets={followUpTargets.length}
        protectedCount={cleanupProtected.length}
        followUpProtectedCount={followUpProtected.length}
        uncertain={cleanupUncertain.length}
        followUpUncertain={followUpUncertain.length}
        alreadySoftDeleted={cleanupAlreadySoftDeleted.length}
        alreadyHiddenFollowUps={followUpAlreadyHidden.length}
        samples={cleanupSamples}
        followUpSamples={followUpSamples}
      />
    </>
  );
}
