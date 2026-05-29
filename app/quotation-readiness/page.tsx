import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";
import { updateQuotationReadinessAction } from "@/lib/actions";
import { listQuotationReadinessRows } from "@/lib/data/quotation-repository";
import { humanizeLabel } from "@/lib/labels";

export default async function QuotationReadinessPage() {
  const quotationRows = await listQuotationReadinessRows();
  return (
    <>
      <PageHeader title="Quotation Readiness" eyebrow="No price generation" />
      <div className="space-y-4">
        {quotationRows.map(({ lead, readiness }) => (
          <article key={lead.id} data-testid={`quotation-readiness-${readiness.id}`} className="rounded border border-command-line bg-command-panel p-5 shadow-command">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold">{lead.clientName}</h3>
                <p className="text-sm text-command-muted">{lead.scopeSummary}</p>
                <p className="mt-2 text-sm text-command-muted">Status: {humanizeLabel(readiness.status)}</p>
              </div>
              <div className="rounded border border-command-line bg-command-panel2 px-4 py-2 text-right">
                <p className="text-xs text-command-muted">Readiness</p>
                <p className="text-2xl font-semibold">{readiness.readinessScore}%</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {readiness.quotePreparationChecklist.map((item) => (
                <div key={item.item} className="flex justify-between rounded border border-command-line bg-command-panel2 p-3 text-sm">
                  <span>{humanizeLabel(item.item)}</span>
                  <span className={item.status === "complete" ? "text-command-green" : "text-command-amber"}>{humanizeLabel(item.status)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <p className="mr-auto text-sm text-command-muted">{readiness.nextAction}</p>
              <form action={updateQuotationReadinessAction}>
                <input type="hidden" name="readiness_id" value={readiness.id} />
                <input type="hidden" name="status" value="ready_for_boss_review" />
                <ActionButton type="submit">Ready for Quotation Review</ActionButton>
              </form>
              <form action={updateQuotationReadinessAction}>
                <input type="hidden" name="readiness_id" value={readiness.id} />
                <input type="hidden" name="status" value="more_info_needed" />
                <ActionButton type="submit" tone="muted">Request More Info</ActionButton>
              </form>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
