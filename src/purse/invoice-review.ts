import { openInvoiceFlags } from './invoice-status';
import { audit, get, put, requireThat, text, type Actor, type Data, type State } from './types';
import { requirePermission } from './access';
import { scopedInvoice } from './invoices';
/** A risk disposition records human review; it never verifies a bank or resolves matching discrepancies. */
export function invoiceReview(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op !== 'invoice-risk-review') return;
    requirePermission(s, a, 'invoice.review');
    const invoice = get(s, 'invoice', b.invoice);
    requirePermission(s, a, 'invoice.review', invoice);
    requireThat(!invoice.imported || invoice.adoptedVia, 'Native or adopted invoice evidence required', 409);
    requireThat(b.version === (invoice.riskVersion ?? 0), 'Invoice risk review changed; reload', 409);
    const flag = openInvoiceFlags(invoice).find(f => f.id === b.flag);
    requireThat(flag, 'Flag is missing or already reviewed', 409);
    const review = { flag: flag.id, code: flag.code, reason: text(b.reason, 'Risk review reason'), actor: a.id, at: new Date().toISOString() };
    const version = (invoice.riskVersion ?? 0) + 1;
    put(s, 'invoice', invoice.id, { ...invoice, riskVersion: version, riskReviews: [...(invoice.riskReviews ?? []), review] });
    audit(s, a, op, invoice.id, { ...review, version });
    return scopedInvoice(s, a, get(s, 'invoice', invoice.id));
}
