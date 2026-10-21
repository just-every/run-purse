import { openInvoiceFlags } from './invoice-status';
import { poProfileSnapshot } from './po-profiles';
import { currentDecision } from './approval';
import { all, audit, can, get, put, requireThat, text, extended, uid, type Actor, type Data, type State } from './types';
import { supplier } from './admin';
import { lapsedSupplierDocuments } from './supplier-documents';
const documentHold = (s: State, id: string) => requireThat(!lapsedSupplierDocuments(s, id).length, 'Required supplier document has lapsed; refresh and review it before a new PO', 409);
import { ledger, policies, approvalAmount } from './requests';
import { invoice } from './invoices';
import { receipt } from './receiving';
export function linePosition(s: State, order: string, line: Data) { const events = all(s, 'receipt').filter(e => e.order === order && e.line === line.id); const accepted = (line.carriedAccepted ?? 0) + events.reduce((n, e) => n + (e.event === 'receive' ? e.q : e.event === 'return' ? -e.q : 0), 0), cancelled = (line.carriedCancelled ?? 0) + events.filter(e => e.event === 'cancel').reduce((n, e) => n + e.q, 0); const closed = all(s, 'orderClosure').filter(c => c.order === order && c.active).flatMap(c => c.lines).filter((c: Data) => c.line === line.id).reduce((n: number, c: Data) => n + c.q, 0); return { accepted, cancelled, closed, outstanding: line.q - accepted - cancelled - closed }; }
export function commitment(s: State, r: Data) { return all(s, 'commitment').filter(e => e.request === r.id).reduce((n, e) => n + e.amountMinor, 0); }
export function remainingValue(s: State, o: Data) { const remaining = o.lines.reduce((n: number, l: Data) => n + extended(linePosition(s, o.id, l).outstanding, l.unitMinor), 0); const base = o.lines.reduce((n: number, l: Data) => n + l.totalMinor, 0); const any = o.lines.some((l: Data) => linePosition(s, o.id, l).outstanding > 0); return base ? Number((BigInt(o.totalMinor) * BigInt(remaining) + BigInt(base) / 2n) / BigInt(base)) : (any ? o.totalMinor : 0); }
export function orders(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op === 'convert') {
        can(s, a, 'buyer');
        const r = get(s, 'request', b.id);
        requireThat(r.revision === b.revision && r.status === 'approved' && !r.imported, 'Exact current revision must have native approval', 409);
        supplier(s, r.supplier);
        documentHold(s, r.supplier);
        requireThat(r.supplierSnapshot?.id === r.supplier, 'Supplier identity missing; amend the request and renew approval', 409);
        const approval=currentDecision(s, r);
        requireThat(!all(s, 'order').some(o => o.request === r.id && o.revision === r.revision), 'Approved lines already allocated to a PO', 409);
        requireThat(all(s, 'decision').some(d => d.request === r.id && d.revision === r.revision && d.decision === 'approved'), 'Approval decision missing', 409);
        const id = uid();
        const sequence = all(s, 'order').reduce((n, o) => Math.max(n, o.sequence || 0), 0) + 1;
        const o = { id, sequence, documentProfile: poProfileSnapshot(s, r, a), ...(r.poDetails ? { poDetails: structuredClone(r.poDetails) } : {}), location: r.location, costCentre: r.costCentre, approvalActor:approval.actor,approvalVersion:approval.operatorVersion, number: `PO-${String(sequence).padStart(6, '0')}`, request: r.id, policy:r.policy, revision: r.revision, supplier: r.supplier, supplierSnapshot: structuredClone(r.supplierSnapshot), currency: r.currency, lines: r.lines.map((l: Data) => ({ ...l, sourceLine: l.id })), freightMinor: r.freightMinor, taxMinor: r.taxMinor, totalMinor: r.totalMinor, terms: r.terms, needDate: r.needDate, status: 'prepared', generatedAt: new Date().toISOString(), issuedAt: null };
        if(Object.hasOwn(r,'valuePromise')) (o as Data).valuePromise=structuredClone(r.valuePromise);
        put(s, 'order', id, o);
        audit(s, a, op, id, { request: r.id, revision: r.revision });
        return o;
    }
    if (op === 'issue') {
        can(s, a, 'buyer');
        const o = get(s, 'order', b.id), r = get(s, 'request', o.request);
        supplier(s, o.supplier);
        documentHold(s, o.supplier);
        requireThat(o.supplierSnapshot?.id === o.supplier, 'Approved supplier identity is missing; amend the request and renew approval', 409);
        requireThat(o.status === 'prepared' && r.status === 'approved' && r.revision === o.revision && b.revision === o.revision && !o.imported, 'PO document or authority is stale', 409);
        requireThat(policies(s, r).some(p => p.id === r.policy), 'Approval policy changed', 409);
        currentDecision(s, r);
        if (r.amends) {
            const prior = get(s, 'order', r.amends);
            requireThat(prior.status === 'amendment-pending', 'Prior order changed', 409);
            put(s, 'order', prior.id, { ...prior, status: 'amended', amendedBy: o.id, ...(prior.replenishmentStatus === 'held' ? { replenishmentStatus: 'reviewed', replenishmentMinor: 0 } : {}) });
            const groups=new Map<string,Data>();for(const e of all(s,'commitment').filter(e=>e.request===r.id)){const k=e.policy+':'+e.currency;const g=groups.get(k)??{policy:e.policy,currency:e.currency,amount:0};g.amount+=e.amountMinor;groups.set(k,g)}for(const g of groups.values())if(g.amount&&(g.policy!==r.policy||g.currency!==r.currency))ledger(s,a,{...r,policy:g.policy,currency:g.currency},-g.amount,'amendment-policy-release');const target = approvalAmount(r), current = commitment(s, r);
            if (target !== current)
                ledger(s, a, r, target - current, 'amendment-issued-adjustment');
        }
        put(s, 'order', o.id, { ...o, status: 'issued', issuedAt: new Date().toISOString(), issuedBy: a.id, issueReason: text(b.reason, 'Issue confirmation') });
        audit(s, a, op, o.id, { revision: o.revision });
        return get(s, 'order', o.id);
    }
    if (op === 'receipt') return receipt(s, a, b);
    if (op === 'invoice') return invoice(s, a, b);
}
// An issued amendment continues the same request-line purchase. Earlier orders
// remain immutable evidence; their invoice quantities still consume this line.
export function discrepancies(s: State) {
    const invoices = all(s, 'invoice'), orders = all(s, 'order');
    return invoices.flatMap(i => i.allocations.map((x: Data) => {
        const o = get(s, 'order', i.order), l = o.lines.find((l: Data) => l.id === x.line);
        const lineage = orders.filter(p => p.request === o.request && p.issuedAt && p.lines.some((z: Data) => z.id === l.id));
        const current = lineage.reduce((latest, p) => p.revision > latest.revision ? p : latest, o);
        const currentLine = current.lines.find((z: Data) => z.id === l.id);
        const orderIds = new Set(lineage.map(p => p.id));
        const totalInvoiced = invoices.filter(z => orderIds.has(z.order)).flatMap(z => z.allocations).filter((z: Data) => z.line === l.id).reduce((n: number, z: Data) => n + z.q, 0);
        return { invoiceId: i.id, orderId: o.id, lineId: l.id, invoice: i.reference, exception: i.exception ?? (openInvoiceFlags(i).length ? 'Unresolved invoice risk flags' : null), order: o.number, line: l.description, currency: i.currency, invoiceMinor: x.amountMinor, expectedMinor: x.orderedMinor, priceMismatch: x.amountMinor !== x.orderedMinor, closedBalance: linePosition(s, current.id, currentLine).closed > 0 && totalInvoiced > currentLine.q - linePosition(s, current.id, currentLine).closed, quantityMismatch: totalInvoiced > currentLine.q, receiptShortfall: totalInvoiced > linePosition(s, current.id, currentLine).accepted };
    }));
}
