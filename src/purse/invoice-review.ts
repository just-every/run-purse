import { openInvoiceFlags } from './invoice-status';
import { audit, get, put, requireThat, text, type Actor, type Data, type State } from './types';
import { requirePermission } from './access';
import { scopedInvoice } from './invoices';
/** A risk disposition records human review; it never verifies a bank or resolves matching discrepancies. */
export function invoiceReview(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (!['invoice-risk-review', 'invoice-dispute'].includes(op)) return;
    requirePermission(s, a, 'invoice.review');
    const invoice = get(s, 'invoice', b.invoice);
    requirePermission(s, a, 'invoice.review', invoice);
    requireThat(!invoice.imported || invoice.adoptedVia, 'Native or adopted invoice evidence required', 409);
    if (op === 'invoice-dispute') {
        requireThat(b.version === (invoice.disputeVersion ?? 0), 'Invoice dispute changed; reload', 409);
        requireThat(typeof b.disputed === 'boolean' && b.disputed !== Boolean(invoice.disputed), 'Choose a changed dispute decision', 409);
        const entry = { version: (invoice.disputeVersion ?? 0) + 1, disputed: b.disputed, reason: text(b.reason, 'Dispute decision reason'), actor: a.id, at: new Date().toISOString() };
        put(s, 'invoice', invoice.id, { ...invoice, disputed: entry.disputed, disputeVersion: entry.version, disputeHistory: [...(invoice.disputeHistory ?? []), entry] });
        audit(s, a, op, invoice.id, entry);
        return scopedInvoice(s, a, get(s, 'invoice', invoice.id));
    }
    requireThat(b.version === (invoice.riskVersion ?? 0), 'Invoice risk review changed; reload', 409);
    const flag = openInvoiceFlags(invoice).find(f => f.id === b.flag);
    requireThat(flag, 'Flag is missing or already reviewed', 409);
    const review = { flag: flag.id, code: flag.code, reason: text(b.reason, 'Risk review reason'), actor: a.id, at: new Date().toISOString() };
    const version = (invoice.riskVersion ?? 0) + 1;
    put(s, 'invoice', invoice.id, { ...invoice, riskVersion: version, riskReviews: [...(invoice.riskReviews ?? []), review] });
    audit(s, a, op, invoice.id, { ...review, version });
    return scopedInvoice(s, a, get(s, 'invoice', invoice.id));
}
