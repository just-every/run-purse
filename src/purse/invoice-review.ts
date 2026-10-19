import { openInvoiceFlags, publicInvoice } from './invoice-status';
import { audit, can, get, put, requireThat, text, type Actor, type Data, type State } from './types';
/** A risk disposition records human review; it never verifies a bank or resolves matching discrepancies. */
export function invoiceReview(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op !== 'invoice-risk-review') return;
    can(s, a, 'buyer');
    const invoice = get(s, 'invoice', b.invoice);
    requireThat(!invoice.imported, 'Native invoice required', 409);
    requireThat(b.version === (invoice.riskVersion ?? 0), 'Invoice risk review changed; reload', 409);
    const flag = openInvoiceFlags(invoice).find(f => f.id === b.flag);
    requireThat(flag, 'Flag is missing or already reviewed', 409);
    const review = { flag: flag.id, code: flag.code, reason: text(b.reason, 'Risk review reason'), actor: a.id, at: new Date().toISOString() };
    const version = (invoice.riskVersion ?? 0) + 1;
    put(s, 'invoice', invoice.id, { ...invoice, riskVersion: version, riskReviews: [...(invoice.riskReviews ?? []), review] });
    audit(s, a, op, invoice.id, { ...review, version });
    return publicInvoice(get(s, 'invoice', invoice.id));
}
