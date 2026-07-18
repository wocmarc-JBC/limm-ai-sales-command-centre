import { CopySuggestedReplyButton } from "@/components/CopySuggestedReplyButton";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth/session";
import { listAllLeadFiles } from "@/lib/data/lead-files-repository";
import { listLeadMessages } from "@/lib/data/lead-messages-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { buildLeadFacts, leadFactsLocationLabel } from "@/lib/lead-facts";
import { formatLeadDisplayName } from "@/lib/lead-display";
import {
  limmQaExpansionPackMetadata,
  limmQaScenarios,
  limmQaScenarioStats
} from "@/lib/knowledge/limm-qa-scenarios";
import {
  carpentryDemoQaItems,
  carpentryDemoQaStats,
  limmCarpentryDemoQaModule
} from "@/lib/knowledge/limm-carpentry-demo-qa";
import type { Lead, LeadMessage } from "@/lib/types";
import {
  detectReplyQualityScenario,
  runWhatsAppQaReplay,
  type QaReplayResult,
  type ReplyQualityScenario
} from "@/lib/whatsapp-reply-quality-scoreboard";

const scenarioOptions: Array<[ReplyQualityScenario, string]> = [
  ["greeting_only", "Greeting only"],
  ["price_question", "Price question"],
  ["kitchen_enquiry", "Kitchen enquiry"],
  ["toilet_enquiry", "Toilet enquiry"],
  ["whole_house_renovation", "Whole house renovation"],
  ["landed_aa", "Landed/A&A"],
  ["design_question", "Design/concept enquiry"],
  ["property_type", "Condo/HDB/commercial"],
  ["appointment_request", "Appointment request"],
  ["media_received", "Photo/floor plan received"],
  ["frustrated_client", "Frustrated client"],
  ["chinese_message", "Chinese message"],
  ["human_takeover", "Human takeover"],
  ["safety_risk", "Safety risk"],
  ["general", "General"]
];

const scenarioPack = [
  ["Hi", "text", "greeting_only"],
  ["Hello", "text", "greeting_only"],
  ["Are you there?", "text", "greeting_only"],
  ["Can do renovation?", "text", "general"],
  ["can you do design for me", "text", "design_question"],
  ["你好", "text", "chinese_message"],
  ["Hi, I want renovate kitchen", "text", "kitchen_enquiry"],
  ["Condo kitchen and 2 toilets", "text", "kitchen_enquiry"],
  ["Landed A&A", "text", "landed_aa"],
  ["Office renovation at Ubi", "text", "property_type"],
  ["How much?", "text", "price_question"],
  ["Kitchen how much?", "text", "price_question"],
  ["Toilet how much?", "text", "price_question"],
  ["Whole house how much?", "text", "price_question"],
  ["Any package?", "text", "price_question"],
  ["", "image", "media_received"],
  ["floor plan attached", "document", "media_received"],
  ["I sent the floor plan already", "text", "frustrated_client"],
  ["Can come down?", "text", "appointment_request"],
  ["Can meet tomorrow?", "text", "appointment_request"],
  ["Can site visit?", "text", "appointment_request"],
  ["I already sent you the plan", "text", "frustrated_client"],
  ["Why ask again?", "text", "frustrated_client"],
  ["Can hack wall?", "text", "safety_risk"],
  ["Confirm can approve?", "text", "safety_risk"],
  ["Can start tomorrow?", "text", "appointment_request"],
  ["Marcus has replied already", "text", "human_takeover"]
] as const;

const multiMessageIntakeScenarios = [
  {
    name: "HDB full renovation intake",
    sequence: ["Hello", "5 room flat", "HDB", "Full work"],
    expected: "First-touch sent once; property HDB; flat 5-room; scope full renovation; ask for floor plan/photos/reference images."
  },
  {
    name: "Condo kitchen intake",
    sequence: ["Hi", "condo", "kitchen"],
    expected: "First-touch sent once; property condo; scope kitchen; ask whether carpentry only or full kitchen works."
  },
  {
    name: "Landed A&A intake",
    sequence: ["Hello", "landed", "A&A", "wet kitchen extension"],
    expected: "First-touch sent once; landed/A&A captured; ask for layout, site photos and areas to change without approval promise."
  },
  {
    name: "Mandarin renovation intake",
    sequence: ["你好", "HDB", "全屋装修"],
    expected: "First-touch sent once; HDB and full renovation captured; repeated greeting prevented."
  }
] as const;

const burstIntakeScenarios = [
  {
    name: "HDB burst",
    sequence: ["Hello", "HDB", "5 room", "Full work", "Kitchen also"],
    expected: "First-touch reply, short facts captured quietly, one consolidated reply when enough context is known, then no extra reply for another short add-on.",
    steps: [
      "Hello -> replied first-touch",
      "HDB -> suppressed, captured property_type=HDB",
      "5 room -> suppressed, captured flat_type=5-room flat",
      "Full work -> consolidated reply sent",
      "Kitchen also -> suppressed after recent consolidated reply",
      "Next action: Ask for floor plan/photos/reference images"
    ]
  },
  {
    name: "Condo burst",
    sequence: ["Hi", "condo", "kitchen"],
    expected: "Condo is captured silently inside the quiet window; kitchen triggers the single useful stage-aware reply.",
    steps: [
      "Hi -> replied first-touch",
      "condo -> suppressed, captured property_type=condo",
      "kitchen -> consolidated reply sent",
      "Next action: Ask whether this is carpentry only or full kitchen works, then request floor plan/photos if available"
    ]
  },
  {
    name: "Landed A&A burst",
    sequence: ["Hello", "landed", "A&A", "wet kitchen extension"],
    expected: "Landed and A&A fragments are captured silently; wet kitchen extension triggers the consolidated landed/A&A reply.",
    steps: [
      "Hello -> replied first-touch",
      "landed -> suppressed, captured property_type=landed",
      "A&A -> suppressed, captured project_type=landed A&A",
      "wet kitchen extension -> consolidated reply sent",
      "Next action: Ask for existing layout/site photos/areas to change"
    ]
  },
  {
    name: "Direct-question bypass",
    sequence: ["Hi", "HDB", "How much?", "Need approval?"],
    expected: "Direct questions bypass quiet-window suppression and still receive immediate safe replies.",
    steps: [
      "Hi -> replied first-touch",
      "HDB -> suppressed, captured property_type=HDB",
      "How much? -> immediate safe no-price reply sent",
      "Need approval? -> immediate safe approval-caution reply sent",
      "Next action: continue from the answered client question, not another first-touch greeting"
    ]
  }
] as const;

function fallbackLead(): Lead {
  const now = new Date().toISOString();
  return {
    id: "qa-sample-lead",
    clientName: "QA Sample Lead",
    phone: "6599999999",
    source: "WhatsApp QA",
    division: "LIMM Works",
    propertyType: "",
    serviceType: "",
    scopeSummary: "",
    leadScore: 0,
    leadCategory: "Warm",
    status: "New Enquiry",
    missingInfo: [],
    aiRecommendedNextAction: "QA simulation only.",
    bossApprovalNeeded: false,
    appointmentReadiness: 0,
    quotationReadiness: 0,
    lastClientMessage: "",
    lastReplyAt: null,
    createdAt: now,
    updatedAt: now,
    preferredContactTime: "",
    riskFlags: []
  };
}

function qaMessage(body: string, type = "text", leadId = "qa-sample-lead"): LeadMessage {
  return {
    id: `qa-${type}-${body || "media"}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80),
    leadId,
    direction: "inbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: `qa-${Date.now()}`,
    providerTimestamp: new Date().toISOString(),
    whatsappStatus: "received",
    metadata: { messageType: type },
    createdAt: new Date().toISOString()
  };
}

function statusTone(status: string) {
  if (status === "PASS") return "border-emerald-400/40 bg-emerald-400/10 text-emerald-100";
  if (status === "NEEDS REVIEW") return "border-amber-400/40 bg-amber-400/10 text-amber-100";
  return "border-red-400/40 bg-red-400/10 text-red-100";
}

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function QaCentrePage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) {
    return (
      <>
        <PageHeader title="QA Centre" eyebrow="Simulation only" />
        <section className="rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
          <h2 className="text-2xl font-semibold">Login required</h2>
          <p className="mt-2 text-command-muted">Sign in before using WhatsApp reply replay tools.</p>
        </section>
      </>
    );
  }

  const leads = await listLeads({ includeTest: true, includeNonSales: true });
  const selectedLeadId = getString(searchParams?.lead) || leads[0]?.id || "qa-sample-lead";
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? fallbackLead();
  const [messages, files] = await Promise.all([
    selectedLead.id === "qa-sample-lead" ? Promise.resolve([]) : listLeadMessages(selectedLead.id),
    listAllLeadFiles()
  ]);
  const selectedMessageId = getString(searchParams?.messageId);
  const selectedMessage = selectedMessageId
    ? messages.find((message) => message.id === selectedMessageId)
    : messages.find((message) => message.direction === "inbound") ?? messages[0];
  const customMessage = getString(searchParams?.customMessage) ?? "";
  const customMessageType = getString(searchParams?.messageType) || "text";
  const scenario = (getString(searchParams?.scenario) || "") as ReplyQualityScenario;
  const replayMessage = customMessage || selectedMessage?.body || "Hi";
  const replayType = customMessage ? customMessageType : String(selectedMessage?.metadata?.messageType || customMessageType || "text");
  const replayScenario = scenario || detectReplyQualityScenario(replayMessage, replayType, selectedLead);
  const replayMessages = customMessage
    ? [qaMessage(replayMessage, replayType, selectedLead.id), ...messages]
    : selectedMessage
      ? messages
      : [qaMessage(replayMessage, replayType, selectedLead.id)];
  const replay = runWhatsAppQaReplay({
    lead: selectedLead,
    previousMessages: replayMessages,
    clientMessage: replayMessage,
    messageType: replayType,
    scenario: replayScenario
  });
  const leadFiles = files.filter((file) => file.leadId === selectedLead.id);
  const facts = buildLeadFacts(selectedLead, messages, leadFiles);
  const showExpansionPack = getString(searchParams?.expansion) === "1";
  const showCarpentryDemoPack = getString(searchParams?.carpentryDemo) === "1";
  const expansionCategoryRows = Object.entries(limmQaScenarioStats.categoryCounts);
  const carpentryDemoStats = carpentryDemoQaStats();
  const packResults: QaReplayResult[] = getString(searchParams?.pack) === "1"
    ? scenarioPack.map(([message, type, packScenario]) => {
        const lead = packScenario === "human_takeover" ? { ...fallbackLead(), botPaused: true } : fallbackLead();
        return runWhatsAppQaReplay({
          lead,
          previousMessages: [qaMessage(message, type, lead.id)],
          clientMessage: message,
          messageType: type,
          scenario: packScenario
        });
      })
    : [];

  return (
    <>
      <PageHeader title="QA Centre" eyebrow="WhatsApp replay + reply quality">
        <a
          href="/settings#system-settings"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-sm font-semibold text-command-muted transition hover:border-command-gold/60"
        >
          System Settings
        </a>
        <a
          href="/reports"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-sm font-semibold text-command-muted transition hover:border-command-gold/60"
        >
          Reports
        </a>
      </PageHeader>

      <section className="rounded-2xl border border-command-gold/30 bg-command-card p-5 shadow-premium">
        <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Simulation only</p>
        <h2 className="mt-2 text-2xl font-semibold text-command-text">No WhatsApp message will be sent.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-command-muted">
          This page replays the same reply decision builder used by the live agent, then scores the proposed reply for tone, brand fit,
          safety, first-touch behavior, price handling, and language. It never calls the Meta send adapter.
        </p>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-command-line bg-command-bg/50 p-3">
            <p className="text-command-muted">Q&A Expansion Pack</p>
            <p className="mt-1 text-xl font-semibold text-command-text">{limmQaScenarioStats.scenarioCount} scenarios</p>
          </div>
          <div className="rounded-xl border border-command-line bg-command-bg/50 p-3">
            <p className="text-command-muted">Mandarin / mixed</p>
            <p className="mt-1 text-xl font-semibold text-command-text">{limmQaScenarioStats.mandarinOrMixedCount}</p>
          </div>
          <div className="rounded-xl border border-command-line bg-command-bg/50 p-3">
            <p className="text-command-muted">Live automation safety</p>
            <p className="mt-1 text-xl font-semibold text-emerald-200">Off</p>
          </div>
          <div className="rounded-xl border border-command-line bg-command-bg/50 p-3">
            <p className="text-command-muted">Carpentry / demo Q&A</p>
            <p className="mt-1 text-xl font-semibold text-command-text">{carpentryDemoStats.qaItems} policies</p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(520px,1.3fr)]">
        <section className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Replay setup</p>
          <form className="mt-5 grid gap-4" action="/qa-centre">
            <label className="grid gap-2 text-sm text-command-muted">
              Lead conversation
              <select name="lead" defaultValue={selectedLead.id} className="rounded-xl border border-command-line bg-command-bg px-3 py-3 text-command-text">
                {[selectedLead, ...leads.filter((lead) => lead.id !== selectedLead.id)].slice(0, 80).map((lead) => (
                  <option key={lead.id} value={lead.id}>{formatLeadDisplayName(lead)} - {lead.phone}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-command-muted">
              Source message
              <select name="messageId" defaultValue={selectedMessage?.id ?? ""} className="rounded-xl border border-command-line bg-command-bg px-3 py-3 text-command-text">
                <option value="">Use custom message below</option>
                {messages.slice(0, 30).map((message) => (
                  <option key={message.id} value={message.id}>
                    {message.direction}: {message.body.slice(0, 80) || String(message.metadata?.messageType || "media")}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-command-muted">
              Scenario type
              <select name="scenario" defaultValue={replayScenario} className="rounded-xl border border-command-line bg-command-bg px-3 py-3 text-command-text">
                {scenarioOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-command-muted">
              Message type
              <select name="messageType" defaultValue={replayType} className="rounded-xl border border-command-line bg-command-bg px-3 py-3 text-command-text">
                {["text", "image", "document", "voice", "audio"].map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-command-muted">
              Custom test message
              <textarea
                name="customMessage"
                defaultValue={customMessage}
                rows={5}
                className="rounded-xl border border-command-line bg-command-bg px-3 py-3 text-command-text"
                placeholder="Example: Hi"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="inline-flex min-h-11 items-center rounded-xl bg-command-gold px-4 py-2 text-sm font-semibold text-command-bg">
                Run Replay
              </button>
              <a
                href={`/qa-centre?lead=${encodeURIComponent(selectedLead.id)}&pack=1`}
                className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-elevated px-4 py-2 text-sm font-semibold text-command-text transition hover:border-command-cyan/70"
              >
                Run Scenario Pack
              </a>
              <a
                href={`/qa-centre?lead=${encodeURIComponent(selectedLead.id)}&expansion=1`}
                className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-elevated px-4 py-2 text-sm font-semibold text-command-text transition hover:border-command-cyan/70"
              >
                Open Q&A Expansion Pack
              </a>
              <a
                href={`/qa-centre?lead=${encodeURIComponent(selectedLead.id)}&carpentryDemo=1`}
                className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-elevated px-4 py-2 text-sm font-semibold text-command-text transition hover:border-command-cyan/70"
              >
                Open Carpentry / Demo Pack
              </a>
              <a
                href={`/inbox?lead=${encodeURIComponent(selectedLead.id)}`}
                className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-elevated px-4 py-2 text-sm font-semibold text-command-text transition hover:border-command-cyan/70"
              >
                Open Lead in Inbox
              </a>
              <a
                href={`/inbox?lead=${encodeURIComponent(selectedLead.id)}`}
                className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-elevated px-4 py-2 text-sm font-semibold text-command-text transition hover:border-command-cyan/70"
              >
                View Source Conversation
              </a>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Reply quality scoreboard</p>
              <h2 className="mt-2 text-3xl font-semibold text-command-text">{replay.score.overallScore}/100</h2>
            </div>
            <span className={`rounded-full border px-4 py-2 text-sm font-semibold ${statusTone(replay.score.status)}`}>
              {replay.score.status}
            </span>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-command-line bg-command-bg/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-command-muted">Client message</p>
              <p className="mt-2 whitespace-pre-wrap text-command-text">{replay.clientMessage || `(${replay.messageType} message)`}</p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-bg/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-command-muted">Detected stage</p>
              <p className="mt-2 text-command-text">{replay.decision.stage}</p>
              <p className="mt-1 text-sm text-command-muted">Intent: {replay.decision.intent}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-command-line bg-command-bg/60 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-command-muted">Proposed reply</p>
            <p className="mt-2 whitespace-pre-wrap text-lg leading-7 text-command-text">{replay.proposedReply || "(No auto-reply because this is disabled or unsupported.)"}</p>
          </div>

          <div className="mt-4 rounded-xl border border-command-line bg-command-bg/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.18em] text-command-muted">Suggested corrected reply</p>
              <CopySuggestedReplyButton text={replay.score.suggestedCorrectedReply} />
            </div>
            <p className="mt-2 whitespace-pre-wrap text-command-text">{replay.score.suggestedCorrectedReply}</p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(replay.score.categoryScores).map(([category, score]) => (
              <div key={category} className="rounded-xl border border-command-line bg-command-elevated p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-command-muted">{category}</p>
                <p className="mt-1 text-2xl font-semibold text-command-text">{score.score}</p>
                <p className="mt-2 text-sm leading-5 text-command-muted">{score.reasons[0] ?? "Checked."}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-command-line bg-command-elevated p-4">
              <p className="font-semibold text-command-text">Failed checks</p>
              {replay.score.failedRules.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-command-muted">
                  {replay.score.failedRules.map((rule) => <li key={rule}>{rule}</li>)}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-command-muted">No failed checks.</p>
              )}
            </div>
            <div className="rounded-xl border border-command-line bg-command-elevated p-4">
              <p className="font-semibold text-command-text">Detected lead facts</p>
              <dl className="mt-2 grid gap-2 text-sm text-command-muted">
                <div>Property: {facts.propertyType.value || replay.detectedLeadFacts.propertyType || "Not detected"}</div>
                <div>Scope: {facts.scopeSummary.value || replay.detectedLeadFacts.scopeSummary || "Not detected"}</div>
                <div>Floor plan: {facts.floorPlanReceived.value || replay.detectedLeadFacts.floorPlanReceived ? "Received" : "Not detected"}</div>
                <div>Site photos: {facts.sitePhotosReceived.value || replay.detectedLeadFacts.sitePhotosReceived ? "Received" : "Not detected"}</div>
                <div>Location: {leadFactsLocationLabel(facts.locationStatus)}</div>
                <div>Bot paused: {replay.detectedLeadFacts.botPaused ? "Yes" : "No"}</div>
              </dl>
            </div>
          </div>
        </section>
      </div>

      {packResults.length ? (
        <section className="mt-6 rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Scenario pack</p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-command-muted">
                <tr>
                  <th className="p-3">Message</th>
                  <th className="p-3">Scenario</th>
                  <th className="p-3">Score</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Failed checks</th>
                </tr>
              </thead>
              <tbody>
                {packResults.map((item) => (
                  <tr key={`${item.scenario}-${item.clientMessage}-${item.messageType}`} className="border-t border-command-line">
                    <td className="max-w-md p-3 text-command-text">{item.clientMessage || `(${item.messageType})`}</td>
                    <td className="p-3 text-command-muted">{item.scenario}</td>
                    <td className="p-3 font-semibold text-command-text">{item.score.overallScore}</td>
                    <td className="p-3 text-command-muted">{item.score.status}</td>
                    <td className="p-3 text-command-muted">{item.score.failedRules.join(", ") || "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
        <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Multi-message intake</p>
        <h2 className="mt-2 text-2xl font-semibold text-command-text">Repeated first-touch guard</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-command-muted">
          Simulation-only checks for short client fragments sent after the first greeting. QA expects first-touch once, facts captured, a stage-aware next action, and no repeated greeting.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {multiMessageIntakeScenarios.map((scenario) => (
            <div key={scenario.name} className="rounded-xl border border-command-line bg-command-bg/60 p-4">
              <p className="font-semibold text-command-text">{scenario.name}</p>
              <p className="mt-2 text-sm text-command-muted">{scenario.sequence.join(" -> ")}</p>
              <p className="mt-2 text-sm leading-6 text-command-text">{scenario.expected}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
        <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Burst intake</p>
        <h2 className="mt-2 text-2xl font-semibold text-command-text">Quiet-window suppression</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-command-muted">
          Simulation-only checks for rapid short facts after a greeting. QA expects facts to update silently during the 45-second quiet window, while direct questions still get immediate safe replies.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {burstIntakeScenarios.map((scenario) => (
            <div key={scenario.name} className="rounded-xl border border-command-line bg-command-bg/60 p-4">
              <p className="font-semibold text-command-text">{scenario.name}</p>
              <p className="mt-2 text-sm text-command-muted">{scenario.sequence.join(" -> ")}</p>
              <p className="mt-2 text-sm leading-6 text-command-text">{scenario.expected}</p>
              <ul className="mt-3 space-y-1 text-xs leading-5 text-command-muted">
                {scenario.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {showExpansionPack ? (
        <section className="mt-6 rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Q&A Expansion Pack</p>
              <h2 className="mt-2 text-2xl font-semibold text-command-text">{limmQaExpansionPackMetadata.title}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-command-muted">
                Simulation-only knowledge pack for reply QA coverage. It contains approved answer points and ideal replies, and it does not send WhatsApp messages or activate pricing, booking, or audio processing.
              </p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-bg/60 p-4 text-right">
              <p className="text-sm text-command-muted">Pack ID</p>
              <p className="mt-1 font-mono text-sm text-command-text">{limmQaExpansionPackMetadata.packId}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-command-line bg-command-elevated p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-command-muted">Scenarios</p>
              <p className="mt-1 text-2xl font-semibold text-command-text">{limmQaScenarioStats.scenarioCount}</p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-elevated p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-command-muted">Categories</p>
              <p className="mt-1 text-2xl font-semibold text-command-text">{expansionCategoryRows.length}</p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-elevated p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-command-muted">Mandarin / mixed</p>
              <p className="mt-1 text-2xl font-semibold text-command-text">{limmQaScenarioStats.mandarinOrMixedCount}</p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-elevated p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-command-muted">Dream-home cases</p>
              <p className="mt-1 text-2xl font-semibold text-command-text">{limmQaScenarioStats.dreamHomePhraseCount}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {expansionCategoryRows.map(([category, count]) => (
              <div key={category} className="flex items-center justify-between gap-3 rounded-xl border border-command-line bg-command-bg/50 px-4 py-3 text-sm">
                <span className="text-command-muted">{category}</span>
                <span className="font-semibold text-command-text">{count}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-command-muted">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Client examples</th>
                  <th className="p-3">Intent</th>
                  <th className="p-3">Ideal reply</th>
                  <th className="p-3">Safety</th>
                </tr>
              </thead>
              <tbody>
                {limmQaScenarios.map((scenario) => (
                  <tr key={scenario.id} className="border-t border-command-line align-top">
                    <td className="whitespace-nowrap p-3 font-mono text-command-text">{scenario.id}</td>
                    <td className="min-w-56 p-3 text-command-muted">{scenario.category}</td>
                    <td className="min-w-64 p-3 text-command-text">{scenario.client_examples.join(" / ")}</td>
                    <td className="min-w-48 p-3 text-command-muted">{scenario.detected_intent}</td>
                    <td className="min-w-96 p-3 text-command-text">{scenario.ideal_reply_zh || scenario.ideal_reply_en}</td>
                    <td className="min-w-64 p-3 text-command-muted">
                      No pricing: {scenario.should_auto_price ? "FAIL" : "OK"}; booking: {scenario.should_auto_book ? "FAIL" : "Off"}; audio: {scenario.should_enable_voice_transcription ? "FAIL" : "Off"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showCarpentryDemoPack ? (
        <section className="mt-6 rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Carpentry / Demo Works Q&A</p>
              <h2 className="mt-2 text-2xl font-semibold text-command-text">{limmCarpentryDemoQaModule.moduleName}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-command-muted">
                Simulation-only safe-response knowledge for common questions clients usually ask about carpentry, dismantling, wall review, disposal, protection and approval checks.
              </p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-bg/60 p-4 text-right">
              <p className="text-sm text-command-muted">Module ID</p>
              <p className="mt-1 font-mono text-sm text-command-text">{limmCarpentryDemoQaModule.moduleId}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-command-line bg-command-elevated p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-command-muted">Q&A policies</p>
              <p className="mt-1 text-2xl font-semibold text-command-text">{carpentryDemoStats.qaItems}</p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-elevated p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-command-muted">English triggers</p>
              <p className="mt-1 text-2xl font-semibold text-command-text">{carpentryDemoStats.englishTriggers}</p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-elevated p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-command-muted">Mandarin triggers</p>
              <p className="mt-1 text-2xl font-semibold text-command-text">{carpentryDemoStats.mandarinTriggers}</p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-elevated p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-command-muted">Safety mode</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-200">Simulation</p>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-command-muted">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Question patterns</th>
                  <th className="p-3">Response policy</th>
                  <th className="p-3">WhatsApp template</th>
                  <th className="p-3">Safety</th>
                </tr>
              </thead>
              <tbody>
                {carpentryDemoQaItems.map((item) => (
                  <tr key={item.id} className="border-t border-command-line align-top">
                    <td className="whitespace-nowrap p-3 font-mono text-command-text">{item.id}</td>
                    <td className="min-w-64 p-3 text-command-text">{item.questionPatterns.join(" / ")}</td>
                    <td className="min-w-64 p-3 text-command-muted">{item.answerPolicy}</td>
                    <td className="min-w-96 whitespace-pre-wrap p-3 text-command-text">{item.templateEn}</td>
                    <td className="min-w-52 p-3 text-command-muted">No amounts: OK; booking: Off; audio: Off</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
