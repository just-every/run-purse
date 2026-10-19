import { openInvoiceFlags } from './invoice-status';
import { all, audit, can, date, get, put, requireThat, text, type Actor, type Data, type State } from './types';
import { discrepancies } from './orders';
import { termDates } from './payment-terms';
export function payables(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (!['payable-terms', 'approve-payable', 'cash-expectation'].includes(op)) return;
    can(s, a, 'buyer');
    if (op === 'cash-expectation') {
        const order = get(s, 'order', b.order), old = s.get('cashExpectation:' + order.id)?.value;
        requireThat(order.issuedAt && !order.imported && ['issued', 'amendment-pending'].includes(order.status), 'Current native issued PO required', 409);
        requireThat(b.version === (old?.version ?? 0), 'Cash expectation changed; reload', 409);
        const entry = { expectedDate: date(b.expectedDate, 'Expected invoice date'), reason: text(b.reason, 'Forecast reason'), actor: a.id, at: new Date().toISOString(), version: (old?.version ?? 0) + 1 };
        put(s, 'cashExpectation', order.id, { order: order.id, ...entry, history: [...(old?.history ?? []), entry] });
        audit(s, a, op, order.id, entry);
        return get(s, 'cashExpectation', order.id);
    }
    const invoice = get(s, 'invoice', b.invoice), order = get(s, 'order', invoice.order), old = s.get('payable:' + invoice.id)?.value;
    requireThat(!invoice.imported && !order.imported && order.issuedAt, 'Native invoice evidence required', 409);
    requireThat(b.version === (old?.version ?? 0), 'Payable changed; reload', 409);
    requireThat(!old?.approvedAt, 'Approved cash-planning terms are immutable', 409);
    if (op === 'payable-terms') {
        const entry = { ...termDates(b.invoiceDate, b.term), reason: text(b.reason, 'Terms evidence'), actor: a.id, at: new Date().toISOString(), version: (old?.version ?? 0) + 1 };
        put(s, 'payable', invoice.id, { invoice: invoice.id, ...entry, history: [...(old?.history ?? []), entry] });
        audit(s, a, op, invoice.id, entry);
    } else {
        requireThat(old, 'Record invoice date and payment terms first', 409);
        requireThat(!openInvoiceFlags(invoice).length, 'Resolve invoice risk flags before cash-planning approval', 409);
        requireThat(!invoice.exception && !discrepancies(s).filter(d => d.invoiceId === invoice.id).some(d => d.priceMismatch || d.quantityMismatch || d.receiptShortfall || d.closedBalance || d.exception), 'Resolve invoice discrepancies before cash-planning approval', 409);
        const entry: Data = { ...old, version: old.version + 1, approvedAt: new Date().toISOString(), approvedBy: a.id, approvalReason: text(b.reason, 'Approval reason'), approvedMinor: invoice.totalMinor };
        put(s, 'payable', invoice.id, entry);
        audit(s, a, op, invoice.id, { version: entry.version, reason: entry.approvalReason, term: entry.term, dueDate: entry.dueDate, approvedMinor: entry.approvedMinor });
    }
    return get(s, 'payable', invoice.id);
}
