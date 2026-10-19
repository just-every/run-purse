import { all, can, extended, get, type Actor, type Data, type State } from './types';
import { linePosition } from './orders';
import { weekOf } from './payment-terms';
export function cashRequirements(s: State, a: Actor) {
    can(s, a, 'buyer');
    const payables = all(s, 'payable');
    const bills = payables.filter(p => p.approvedAt).map((p): Data => {
        const invoice = get(s, 'invoice', p.invoice), order = get(s, 'order', invoice.order);
        return { ...p, reference: invoice.reference, order: order.id, number: order.number, currency: invoice.currency, amountMinor: p.approvedMinor, week: weekOf(p.dueDate), discountMinor: Number((BigInt(p.approvedMinor) * BigInt(p.discountPercent) + 50n) / 100n) };
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.reference.localeCompare(b.reference));
    const orders = all(s, 'order').filter(o => o.issuedAt && !o.imported && ['issued', 'amendment-pending'].includes(o.status));
    const commitments = orders.map(o => {
        const base = o.lines.reduce((n: number, l: Data) => n + l.totalMinor, 0);
        const active = o.lines.reduce((n: number, l: Data) => { const p = linePosition(s, o.id, l); return n + extended(Math.max(0, l.q - p.cancelled - p.closed), l.unitMinor); }, 0);
        const liability = base ? Number((BigInt(o.totalMinor) * BigInt(active) + BigInt(base) / 2n) / BigInt(base)) : 0;
        const lineage = new Set(all(s, 'order').filter(p => p.request === o.request && p.issuedAt).map(p => p.id));
        const billed = bills.filter(p => lineage.has(p.order)).reduce((n, p) => n + p.amountMinor, 0);
        const expectedDate = s.get('cashExpectation:' + o.id)?.value.expectedDate ?? o.needDate;
        return { order: o.id, number: o.number, currency: o.currency, expectedDate, week: weekOf(expectedDate), amountMinor: Math.max(0, liability - billed), basis: s.has('cashExpectation:' + o.id) ? 'Buyer forecast' : 'PO need date' };
    }).filter(o => o.amountMinor > 0);
    const weeks = new Map<string, Data>();
    for (const [kind, records] of [['billsMinor', bills], ['commitmentsMinor', commitments]] as const) for (const r of records) {
        const key = r.week + ':' + r.currency, row = weeks.get(key) ?? { week: r.week, currency: r.currency, billsMinor: 0, commitmentsMinor: 0 };
        row[kind] += r.amountMinor; row.totalMinor = row.billsMinor + row.commitmentsMinor; weeks.set(key, row);
    }
    return { bills, commitments, weeks: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week) || a.currency.localeCompare(b.currency)) };
}
