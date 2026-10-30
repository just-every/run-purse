import { nativeDepositInvoice } from './deposit-position';
import { operationalOrder } from './adoption-position';
import { openInvoiceFlags } from './invoice-status';
import { audit, date, get, put, requireThat, text, type Actor, type Data, type State } from './types';
import { discrepancies } from './orders';
import { termDates } from './payment-terms';
import { requirePermission } from './access';
export function payables(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (!['payable-terms', 'approve-payable', 'cash-expectation'].includes(op)) return;
    const permission = op === 'approve-payable' ? 'payable.approve' : 'payable.terms';
    requirePermission(s, a, permission);
    if (op === 'cash-expectation') {
        const order = get(s, 'order', b.order), old = s.get('cashExpectation:' + order.id)?.value;
        requirePermission(s, a, permission, order);
        requireThat(operationalOrder(s, order) && ['issued', 'adopted', 'amendment-pending'].includes(order.status), 'Current native issued PO required', 409);
        requireThat(b.version === (old?.version ?? 0), 'Cash expectation changed; reload', 409);
        const entry = { expectedDate: date(b.expectedDate, 'Expected invoice date'), reason: text(b.reason, 'Forecast reason'), actor: a.id, at: new Date().toISOString(), version: (old?.version ?? 0) + 1 };
        put(s, 'cashExpectation', order.id, { order: order.id, ...entry, history: [...(old?.history ?? []), entry] });
        audit(s, a, op, order.id, entry);
        return get(s, 'cashExpectation', order.id);
    }
    const invoice = get(s, 'invoice', b.invoice), order = get(s, 'order', invoice.order), old = s.get('payable:' + invoice.id)?.value;
    requirePermission(s, a, permission, invoice);
    requireThat(!nativeDepositInvoice(invoice), 'Deposit bill terms and approval require the current exact-term owner rule and confirmed original', 409);
    requireThat(operationalOrder(s, order) && (!invoice.imported || invoice.adoptedVia), 'Native or explicitly adopted invoice evidence required', 409);
    if (invoice.imported || invoice.supplierSubmission) requireThat(invoice.sourceConfirmation === 'confirmed', 'Confirm the private invoice original through a source-bound invoice reading before new cash-planning terms or approval', 409);
    requireThat(b.version === (old?.version ?? 0), 'Payable changed; reload', 409);
    requireThat(!old?.approvedAt, 'Approved cash-planning terms are immutable', 409);
    if (op === 'payable-terms') {
        if (invoice.imported || invoice.supplierSubmission) requireThat(b.invoiceDate === invoice.invoiceDate, 'Use the confirmed source invoice date for imported bill terms', 409);
        const entry = { ...termDates(b.invoiceDate, b.term), reason: text(b.reason, 'Terms evidence'), actor: a.id, at: new Date().toISOString(), version: (old?.version ?? 0) + 1 };
        put(s, 'payable', invoice.id, { invoice: invoice.id, ...entry, history: [...(old?.history ?? []), entry] });
        audit(s, a, op, invoice.id, entry);
    } else {
        requireThat(old, 'Record invoice date and payment terms first', 409);
        requireThat(!invoice.disputed, 'Resolve the invoice dispute before cash-planning approval', 409);
        requireThat(!openInvoiceFlags(invoice).length, 'Resolve invoice risk flags before cash-planning approval', 409);
        requireThat(!invoice.exception && !discrepancies(s).filter(d => d.invoiceId === invoice.id).some(d => d.priceMismatch || d.quantityMismatch || d.receiptShortfall || d.closedBalance || d.exception), 'Resolve invoice discrepancies before cash-planning approval', 409);
        const entry: Data = { ...old, version: old.version + 1, approvedAt: new Date().toISOString(), approvedBy: a.id, approvalReason: text(b.reason, 'Approval reason'), approvedMinor: invoice.totalMinor };
        put(s, 'payable', invoice.id, entry);
        audit(s, a, op, invoice.id, { version: entry.version, reason: entry.approvalReason, term: entry.term, dueDate: entry.dueDate, approvedMinor: entry.approvedMinor });
    }
    return get(s, 'payable', invoice.id);
}
