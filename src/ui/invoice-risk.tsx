import { InvoiceEvidence } from './invoice-evidence';
import { openInvoiceFlags } from '../purse/invoice-status';
import { Form, Field, when, type D } from './shared';
const labels: Record<string, string> = { 'near-duplicate': 'Possible duplicate invoice', 'duplicate-document': 'Repeated original document', 'remit-baseline-missing': 'Missing bank comparison baseline', 'remit-mismatch': 'Remit details changed', 'remit-details-changed': 'Remit details changed', 'sender-domain': 'Unverified sender domain differs', 'release-balance': 'Invoice exceeds release balance', 'release-allocation': 'Invoice exceeds unallocated blanket authority', 'po-balance': 'Invoice exceeds remaining PO value', 'blanket-validity': 'Invoice date outside blanket validity' };
export function InvoiceRisk({ invoice, data, actor, mutate }: { invoice: D; data: D; actor: D; mutate: (op: string, b: D) => Promise<any> }) {
    const open = openInvoiceFlags(invoice);
    return <section aria-label={'Invoice risk '+invoice.reference}>
        <InvoiceEvidence invoice={invoice} owner={actor.roles.includes('owner')}/><h5>Invoice checks</h5><p className="quiet">Buyer-recorded source evidence, not bank verification or sender authentication. A reasoned risk review never resolves price, quantity or receiving discrepancies.</p>
        {invoice.invoiceDate ? <p>Invoice date {invoice.invoiceDate} · {invoice.invoiceDateSource === 'supplied' ? 'Recorded from source' : 'Default UTC entry date'}</p> : <p>Legacy invoice source checks were not recorded.</p>}
        {invoice.sender?.supplied && <p>Recorded sender {invoice.sender.email} · {invoice.sender.comparison} · unverified</p>}
        {invoice.remit?.supplied && <p>Remit comparison {invoice.remit.comparison} · {invoice.remit.baseline === 'matching-only' ? 'Buyer-recorded identity, not bank verification' : 'No bank identity baseline'}</p>}
        {invoice.document && <p>Original {invoice.document.name} · {invoice.document.size} bytes · exact-byte duplicate check</p>}
        {open.length > 0 && <p role="alert">Cash-planning hold · {open.length} unresolved risk {open.length === 1 ? 'flag' : 'flags'}</p>}
        {(invoice.flags ?? []).map((flag: D) => {
            const review = invoice.riskReviews?.find((r: D) => r.flag === flag.id), related = data.invoice.find((i: D) => i.id === flag.relatedInvoice);
            return <section className="invoice" key={flag.id} aria-label={'Risk '+flag.code+' '+invoice.reference}><h5>{labels[flag.code] || flag.code} · {review ? 'Reviewed' : 'Open'}</h5><p>{flag.reason}</p>{related && <p>Related invoice {related.reference}</p>}
                {review ? <p>Risk review · {review.reason} · {when(review.at)}</p> : invoice.mayReview && <Form label="Resolve risk flag" initial={{ invoice: invoice.id, flag: flag.id, version: invoice.riskVersion }} onSubmit={b => mutate('invoice-risk-review', b)}><Field label="Risk review reason" name="reason"/></Form>}
            </section>;
        })}
    </section>;
}
