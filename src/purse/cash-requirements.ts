import { adoptionDeposits, currentOperationalOrder, operationalOrder } from './adoption-position';
import { openInvoiceFlags } from './invoice-status';
import { all, extended, get, type Actor, type Data, type State } from './types';
import { discrepancies, linePosition } from './orders';
import { weekOf } from './payment-terms';
import { allowed, requirePermission } from './access';
export function cashRequirements(s: State, a: Actor) {
    requirePermission(s, a, 'cash.read');
    return cashRequirementsFromRecords(s,record=>allowed(s,a,'cash.read',record));
}
/** Arithmetic over an explicitly selected source set; callers authorize that set first. */
export function cashRequirementsFromRecords(s:State,accepts:(record:Data)=>boolean) {
    // Receipt corrections suspend historical cash approval without changing the
    // existing forecast treatment of other invoices on the same purchase.
    const correctedOrders = new Set(all(s, 'receipt').filter(r => r.correctionOf).map(r => r.order));
    const heldInvoices = new Set(discrepancies(s).filter(d => correctedOrders.has(d.orderId)).filter(d => d.priceMismatch || d.quantityMismatch || d.receiptShortfall || d.closedBalance || d.exception).map(d => d.invoiceId));
    const payables = all(s, 'payable').filter(p => accepts(get(s, 'invoice', p.invoice)));
    const eligibleBills = payables.filter(p => p.approvedAt && !heldInvoices.has(p.invoice) && !get(s, 'invoice', p.invoice).disputed && !openInvoiceFlags(get(s, 'invoice', p.invoice)).length).map((p): Data => {
        const invoice = get(s, 'invoice', p.invoice), order = get(s, 'order', invoice.order);
        const amountMinor = invoice.pantry?.status === 'posted' ? invoice.pantry.openMinor : p.approvedMinor;
        return { ...p, reference: invoice.reference, order: order.id, number: order.number, currency: invoice.currency, amountMinor, dueDate: invoice.pantry?.dueDate ?? p.dueDate, discountDate: invoice.pantry?.discountDate ?? p.discountDate, week: weekOf(invoice.pantry?.dueDate ?? p.dueDate), discountMinor: Number((BigInt(amountMinor) * BigInt(p.discountPercent) + 50n) / 100n) };
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.reference.localeCompare(b.reference));
    const bills = eligibleBills.filter(bill => !get(s, 'invoice', bill.invoice).sourcePayment && bill.amountMinor > 0);
    const orders = all(s, 'order').filter(o => currentOperationalOrder(s, o) && ['issued', 'adopted', 'amendment-pending', 'cancelled'].includes(o.status)
        && accepts(o));
    const commitments = orders.map(o => {
        const base = o.lines.reduce((n: number, l: Data) => n + l.totalMinor, 0);
        const active = o.lines.reduce((n: number, l: Data) => { const p = linePosition(s, o.id, l); return n + extended(Math.max(0, l.q - p.cancelled - p.closed), l.unitMinor); }, 0);
        const liability = base ? Number((BigInt(o.totalMinor) * BigInt(active) + BigInt(base) / 2n) / BigInt(base)) : 0;
        const lineage = new Set(all(s, 'order').filter(p => p.request === o.request && operationalOrder(s, p) && accepts(p)).map(p => p.id));
        const billed = eligibleBills.filter(p => lineage.has(p.order) && p.currency === o.currency).reduce((n, p) => n + p.approvedMinor, 0);
        const expectedDate = s.get('cashExpectation:' + o.id)?.value.expectedDate ?? o.needDate;
        return { order: o.id, number: o.number, currency: o.currency, expectedDate, week: weekOf(expectedDate), amountMinor: Math.max(0, liability - billed - adoptionDeposits(s, o).amountMinor), basis: s.has('cashExpectation:' + o.id) ? 'Recorded forecast' : 'PO need date' };
    }).filter(o => o.amountMinor > 0);
    const weeks = new Map<string, Data>();
    for (const [kind, records] of [['billsMinor', bills], ['commitmentsMinor', commitments]] as const) for (const r of records) {
        const key = r.week + ':' + r.currency, row = weeks.get(key) ?? { week: r.week, currency: r.currency, billsMinor: 0, commitmentsMinor: 0 };
        row[kind] += r.amountMinor; row.totalMinor = row.billsMinor + row.commitmentsMinor; weeks.set(key, row);
    }
    return { bills, commitments, weeks: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week) || a.currency.localeCompare(b.currency)) };
}
