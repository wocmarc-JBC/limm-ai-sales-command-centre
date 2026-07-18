import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";
import { createManualLeadAction } from "@/lib/actions";
import { can } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import Link from "next/link";

const inputClass = "rounded-md border border-command-line bg-command-bg px-3 py-2 text-base text-command-text";

type ManualLeadFormValues = {
  clientName: string;
  phone: string;
  source: string;
  division: string;
  propertyType: string;
  serviceType: string;
  scopeSummary: string;
  preferredContactTime: string;
  leadCategory: string;
  leadScore: string;
  riskFlags: string;
  missingInfo: string;
  notes: string;
  isTest: boolean;
};

function defaultValues(template?: string): ManualLeadFormValues {
  if (template === "qa") {
    return {
      clientName: "QA_PRODUCTION_TEST_QUOTE_001",
      phone: "00000000",
      source: "Manual QA",
      division: "LIMM Works",
      propertyType: "Condo",
      serviceType: "Renovation QA",
      scopeSummary: "Production QA test quotation workflow only. Not a real client.",
      preferredContactTime: "",
      leadCategory: "Warm",
      leadScore: "0",
      riskFlags: "QA Test",
      missingInfo: "",
      notes: "QA production test only. Do not use for real client.",
      isTest: true
    };
  }

  return {
    clientName: "",
    phone: "",
    source: "Manual / Internal",
    division: "LIMM Works",
    propertyType: "",
    serviceType: "",
    scopeSummary: "",
    preferredContactTime: "",
    leadCategory: "Warm",
    leadScore: "0",
    riskFlags: "",
    missingInfo: "",
    notes: "",
    isTest: false
  };
}

function Field({
  label,
  name,
  value,
  required = false
}: {
  label: string;
  name: string;
  value: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-command-muted">{label}</span>
      <input name={name} defaultValue={value} required={required} className={inputClass} />
    </label>
  );
}

export default async function NewLeadPage({
  searchParams: searchParamsPromise
}: {
  searchParams?: Promise<{ template?: string; createStatus?: string; message?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) {
    return (
      <>
        <PageHeader title="Create Manual Lead" eyebrow="Internal lead intake" />
        <section className="mission-panel rounded-2xl p-6">
          <p className="font-semibold text-command-text">Login required</p>
          <p className="mt-2 text-command-muted">Sign in before creating internal leads.</p>
        </section>
      </>
    );
  }

  const allowed = can(auth.profile.role, "update_leads");
  const values = defaultValues(searchParams?.template);
  const failed = searchParams?.createStatus === "failed";

  return (
    <>
      <PageHeader title="Create Manual Lead" eyebrow="Internal lead intake">
        <Link
          href="/leads/new?template=qa"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-cyan/60 bg-command-cyan/10 px-4 py-2 text-base font-semibold text-command-cyan transition hover:bg-command-cyan/15"
        >
          Use QA production test template
        </Link>
        <Link
          href="/leads"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-muted transition hover:border-command-gold/60"
        >
          Back to Leads
        </Link>
      </PageHeader>

      <section className="mission-panel mb-6 rounded-2xl p-5">
        <p className="text-base leading-7 text-command-muted">
          Manual leads are internal Command Centre records. This form does not use the WhatsApp webhook, send WhatsApp or email, book Calendar events, or generate price estimates.
        </p>
      </section>

      {failed ? (
        <section className="mb-6 rounded-xl border border-command-red/60 bg-command-red/10 p-4 text-command-red" data-testid="manual-lead-create-feedback">
          <p className="font-semibold">Manual lead was not created</p>
          <p className="mt-1 text-sm">{searchParams?.message || "Please check the form and try again."}</p>
        </section>
      ) : null}

      {!allowed ? (
        <section className="mission-panel rounded-2xl p-6">
          <p className="font-semibold text-command-text">Permission required</p>
          <p className="mt-2 text-command-muted">Your role is {auth.profile.role}. Manual lead creation requires boss/admin/sales lead update permission.</p>
        </section>
      ) : (
        <form action={createManualLeadAction} className="mission-panel grid gap-5 rounded-2xl p-5" data-testid="manual-lead-create-form">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Client name" name="client_name" value={values.clientName} required />
            <Field label="Phone" name="phone" value={values.phone} required />
            <Field label="Source" name="source" value={values.source} required />
            <Field label="Division" name="division" value={values.division} required />
            <Field label="Property type" name="property_type" value={values.propertyType} required />
            <Field label="Service type" name="service_type" value={values.serviceType} required />
            <Field label="Preferred contact time" name="preferred_contact_time" value={values.preferredContactTime} />
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-command-muted">Lead category</span>
              <select name="lead_category" defaultValue={values.leadCategory} className={inputClass}>
                <option>Hot</option>
                <option>Warm</option>
                <option>Cold</option>
                <option>Low Fit</option>
                <option>Manager Review</option>
              </select>
            </label>
            <Field label="Lead score" name="lead_score" value={values.leadScore} />
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-command-muted">Scope summary</span>
            <textarea name="scope_summary" defaultValue={values.scopeSummary} required rows={4} className={inputClass} />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-command-muted">Risk flags</span>
              <textarea name="risk_flags" defaultValue={values.riskFlags} rows={3} className={inputClass} placeholder="Comma or line separated" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-command-muted">Missing info</span>
              <textarea name="missing_info" defaultValue={values.missingInfo} rows={3} className={inputClass} placeholder="Comma or line separated" />
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-command-muted">Notes</span>
            <textarea name="notes" defaultValue={values.notes} rows={3} className={inputClass} />
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-command-line bg-command-bg/55 p-4">
            <input name="is_test" type="checkbox" defaultChecked={values.isTest} className="mt-1 h-5 w-5" />
            <span>
              <span className="block font-semibold text-command-text">Mark as test / QA lead</span>
              <span className="mt-1 block text-sm leading-6 text-command-muted">Test leads are hidden from normal production queues unless test/demo visibility is enabled.</span>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <ActionButton type="submit" data-testid="create-manual-lead-button">Create Lead</ActionButton>
            <p className="text-sm text-command-muted">No WhatsApp/email/calendar action or price estimate will be created.</p>
          </div>
        </form>
      )}
    </>
  );
}
