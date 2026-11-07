"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type TemplateStatus = {
  ok: boolean;
  leadId: string;
  leadName: string;
  template: null | { name: string; language: string; status: string; body: string; approved: boolean; category: string };
  templateName: string;
  templateLanguage: string;
  suggestedText: string;
  consent: null | { status: string; source: string; consentedAt: string; updatedAt: string };
  eligible: boolean;
  metaError: string;
};

function newRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? "";
}

export function ApprovedTemplateFollowupPanel({ leadId }: { leadId: string }) {
  const [status, setStatus] = useState<TemplateStatus | null>(null);
  const [loading, setLoading] = useState(Boolean(leadId));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [evidence, setEvidence] = useState("");
  const [consentSource, setConsentSource] = useState("whatsapp_explicit");
  const [consentDate, setConsentDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" }));
  const [clientRequestId, setClientRequestId] = useState("");
  const backUrl = "/inbox?lead=" + encodeURIComponent(leadId);

  const refresh = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const response = await fetch("/api/inbox/template-followups?leadId=" + encodeURIComponent(leadId), { cache: "no-store" });
      const data = await response.json();
      if (!data.ok) {
        setStatus(null);
        setNotice(data.errorMessage || "Template availability could not be verified.");
      } else {
        setStatus(data as TemplateStatus);
      }
    } catch {
      setStatus(null);
      setNotice("Could not reach the follow-up service.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (!leadId) return;
    setClientRequestId(newRequestId());
    void refresh();
  }, [leadId, refresh]);

  async function submit(action: "record_consent" | "revoke_consent" | "send" | "submit_template") {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const consentedAt = new Date(consentDate + "T12:00:00+08:00").toISOString();
      const response = await fetch("/api/inbox/template-followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action, leadId,
          ...(action === "send" ? { clientRequestId } : {}),
          ...(action === "record_consent" || action === "revoke_consent"
            ? { source: consentSource, evidence, consentedAt } : {})
        })
      });
      const data = await response.json();
      if (!data.ok) {
        setNotice(data.errorMessage || "Action failed. No message was confirmed sent.");
      } else if (action === "send") {
        setNotice("Meta accepted the approved follow-up template. Delivery is pending WhatsApp webhook confirmation.");
        setClientRequestId(newRequestId());
      } else if (action === "submit_template") {
        setNotice(data.approved
          ? "Meta template is already approved."
          : "Template submitted or found. Await Meta's approval before sending.");
      } else {
        setEvidence("");
        setNotice(action === "record_consent" ? "Documented marketing opt-in saved." : "Opt-out saved. Automated follow-ups are blocked.");
      }
      await refresh();
    } catch {
      setNotice("Request failed. If sending was attempted, check the conversation before retrying to avoid a duplicate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 text-command-text sm:p-8">
      <div className="space-y-2">
        <Link href={leadId ? backUrl : "/inbox"} className="text-sm font-semibold text-command-gold underline">Back to WhatsApp inbox</Link>
        <h1 className="text-2xl font-semibold">Approved-template follow-up</h1>
        <p className="text-sm text-command-muted">
          Outside Meta’s 24-hour window, only approved templates may be sent through the Cloud API.
          This workflow requires a documented marketing opt-in and never sends a free-form substitute.
        </p>
      </div>
      {!leadId ? (
        <section className="rounded-2xl border border-command-line bg-command-card p-5">
          Open a client conversation in the inbox, then select <strong>Use approved follow-up template</strong>.
        </section>
      ) : loading && !status ? (
        <section className="rounded-2xl border border-command-line bg-command-card p-5">Checking Meta template approval and consent...</section>
      ) : (
        <>
          <section className="space-y-3 rounded-2xl border border-command-line bg-command-card p-5">
            <h2 className="text-lg font-semibold">Conversation</h2>
            <p className="text-sm">{status?.leadName || "Lead"} · WhatsApp follow-up</p>
            <p className="text-sm text-command-muted">
              Contact eligibility: {status?.eligible ? "Eligible for documented follow-up" : "Unavailable / blocked"}
            </p>
          </section>
          <section className="space-y-3 rounded-2xl border border-command-line bg-command-card p-5">
            <h2 className="text-lg font-semibold">1. Meta-approved template</h2>
            <p className="text-sm">
              {status?.templateName || "limm_renovation_followup_v1"} · {status?.template?.status || "NOT FOUND"} · marketing
            </p>
            <blockquote className="rounded-xl border border-command-line bg-command-bg p-4 text-sm leading-6">
              {status?.template?.body || status?.suggestedText || "Renovation enquiry follow-up"}
            </blockquote>
            {status?.metaError ? <p role="alert" className="text-sm text-command-amber">{status.metaError}</p> : null}
            {!status?.template?.approved ? (
              <button disabled={busy} onClick={() => void submit("submit_template")} type="button"
                className="rounded-xl border border-command-gold px-4 py-2 text-sm font-semibold text-command-gold disabled:opacity-50">
                Submit template to Meta for review
              </button>
            ) : <p className="text-sm font-medium text-command-green">Meta approval verified live</p>}
          </section>
          <section className="space-y-3 rounded-2xl border border-command-line bg-command-card p-5">
            <h2 className="text-lg font-semibold">2. Documented WhatsApp marketing permission</h2>
            <p className="text-sm text-command-muted">
              Status: {status?.consent?.status || "Not recorded"}. Do not infer marketing consent just because a customer previously enquired.
              Obtain and record genuine opt-in evidence. Respect all STOP requests.
            </p>
            <label className="block text-sm" htmlFor="followup-consent-source">Evidence source</label>
            <select id="followup-consent-source" value={consentSource} onChange={(event) => setConsentSource(event.target.value)}
              className="w-full rounded-xl border border-command-line bg-command-bg px-3 py-2">
              <option value="whatsapp_explicit">Customer explicitly opted in on WhatsApp</option>
              <option value="website_form">Website form with WhatsApp opt-in</option>
              <option value="signed_document">Signed document authorising WhatsApp follow-ups</option>
              <option value="other_documented">Other documented permission</option>
            </select>
            <label className="block text-sm" htmlFor="followup-consent-date">Date customer gave permission</label>
            <input id="followup-consent-date" type="date" value={consentDate} onChange={(event) => setConsentDate(event.target.value)}
              className="w-full rounded-xl border border-command-line bg-command-bg px-3 py-2" />
            <label className="block text-sm" htmlFor="followup-consent-evidence">Evidence reference / customer&apos;s exact opt-in</label>
            <textarea id="followup-consent-evidence" rows={3} value={evidence} onChange={(event) => setEvidence(event.target.value)}
              placeholder="Enter the customer's actual opt-in wording and where it is recorded (not an assumed consent)."
              className="w-full rounded-xl border border-command-line bg-command-bg px-3 py-2" />
            <div className="flex flex-wrap gap-3">
              <button disabled={busy || evidence.trim().length < 12 || !status?.eligible}
                onClick={() => void submit("record_consent")} type="button"
                className="rounded-xl bg-command-gold px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
                Record verified opt-in
              </button>
              <button disabled={busy || evidence.trim().length < 12}
                onClick={() => void submit("revoke_consent")} type="button"
                className="rounded-xl border border-command-line px-4 py-2 text-sm font-semibold disabled:opacity-40">
                Record opt-out
              </button>
            </div>
          </section>
          <section className="space-y-3 rounded-2xl border border-command-line bg-command-card p-5">
            <h2 className="text-lg font-semibold">3. Send approved follow-up</h2>
            <p className="text-sm text-command-muted">
              Only the template approved by Meta can be sent. Provider acceptance is not proof of delivery.
              The same request ID cannot be sent twice.
            </p>
            <button
              disabled={busy || !status?.eligible || !status?.template?.approved || status?.consent?.status !== "OPTED_IN" || !clientRequestId}
              onClick={() => void submit("send")} type="button"
              className="rounded-xl bg-command-gold px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? "Processing..." : "Send Meta-approved follow-up"}
            </button>
          </section>
        </>
      )}
      {notice ? <p role="status" aria-live="polite" className="rounded-xl border border-command-line bg-command-panel2 p-4 text-sm">{notice}</p> : null}
    </main>
  );
}
