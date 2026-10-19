import { canonicalSupplier } from './supplier-identity';
import { discrepancies } from './orders';
import { all, audit, can, date, get, key, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

function issuedOrder(s: State, id: string) {
    const order = get(s, 'order', id);
    requireThat(order.issuedAt && !order.imported, 'A natively issued PO is required', 409);
    return order;
}

function acknowledgment(value: unknown, issuedAt: string, now: number): string | null {
    if (value == null || value === '') return null;
    const input = text(value, 'Acknowledgment timestamp', 50);
    requireThat(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input), 'Use an ISO acknowledgment timestamp with a time zone');
    date(input.slice(0, 10));
    requireThat(Number(input.slice(11, 13)) < 24 && Number(input.slice(14, 16)) < 60 && Number(input.slice(17, 19)) < 60, 'Use a valid acknowledgment time');
    const timestamp = Date.parse(input);
    requireThat(Number.isFinite(timestamp) && timestamp >= Date.parse(issuedAt) && timestamp <= now, 'Acknowledgment must be between PO issuance and now');
    return new Date(timestamp).toISOString();
}

/** Buyer-entered communication evidence records facts; issuing a PO never acknowledges it. */
export function supplierPerformance(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (!['supplier-order-evidence', 'supplier-issue', 'resolve-supplier-issue'].includes(op)) return;
    can(s, a, 'buyer');
    if (op === 'supplier-order-evidence') {
        const order = issuedOrder(s, b.order);
        const previous = s.has(key('supplierOrderEvidence', order.id)) ? get(s, 'supplierOrderEvidence', order.id) : undefined;
        requireThat(b.version === (previous?.version ?? 0), 'Supplier order evidence changed; reload', 409);
        const now = Date.now();
        const entry = { version: (previous?.version ?? 0) + 1, promisedDate: date(b.promisedDate, 'Supplier-promised date'),
            acknowledgedAt: acknowledgment(b.acknowledgedAt, order.issuedAt, now), source: text(b.source, 'Supplier communication source'),
            actor: a.id, at: new Date(now).toISOString() };
        put(s, 'supplierOrderEvidence', order.id, { order: order.id, supplier: order.supplier, ...entry, history: [...(previous?.history ?? []), entry] });
        audit(s, a, op, order.id, { evidence: order.id, version: entry.version, source: entry.source });
        return get(s, 'supplierOrderEvidence', order.id);
    }
    if (op === 'supplier-issue') {
        const supplier = get(s, 'supplier', b.supplier), order = issuedOrder(s, b.order);
        requireThat(canonicalSupplier(s, order.supplier) === canonicalSupplier(s, supplier.id), 'PO belongs to another supplier', 409);
        requireThat(['late', 'damaged', 'wrong-item', 'billing'].includes(b.category), 'Choose late, damaged, wrong item or billing');
        const issue = { supplier: order.supplier, order: order.id, category: b.category,
            description: text(b.description, 'Issue description'), status: 'open', actor: a.id, at: new Date().toISOString() };
        const id = uid();
        put(s, 'supplierIssue', id, issue);
        audit(s, a, op, id, { supplier: supplier.id, order: order.id, category: issue.category });
        return get(s, 'supplierIssue', id);
    }
    const issue = get(s, 'supplierIssue', b.id);
    requireThat(issue.status === 'open', 'Supplier issue is already resolved', 409);
    const resolution = { reason: text(b.reason, 'Resolution reason'), actor: a.id, at: new Date().toISOString() };
    put(s, 'supplierIssue', issue.id, { ...issue, status: 'resolved', resolution });
    audit(s, a, op, issue.id, { supplier: issue.supplier, order: issue.order, reason: resolution.reason });
    return get(s, 'supplierIssue', issue.id);
}

const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;
const total = (rows: Data[], field: string) => rows.reduce((sum, row) => sum + row[field], 0);

/** Every aggregate is accompanied by the exact rows that make up its denominator. */
export function supplierScorecards(s: State, a: Actor): Data[] {
    can(s, a, 'buyer');
    const orders = all(s, 'order').filter(o => !o.imported), receipts = all(s, 'receipt').filter(r => !r.imported);
    const invoices = all(s, 'invoice').filter(i => !i.imported), evidence = all(s, 'supplierOrderEvidence');
    const issues = all(s, 'supplierIssue'), matches = discrepancies(s);
    return all(s, 'supplier').filter(supplier => !supplier.mergedInto).map(supplier => {
        const supplierOrders = orders.filter(o => canonicalSupplier(s, o.supplier) === supplier.id);
        const issued = supplierOrders.filter(o => o.issuedAt), orderIds = new Set(issued.map(o => o.id));
        const orderRows = supplierOrders.map(o => ({ orderId: o.id, number: o.number, requestId: o.request, revision: o.revision,
            status: o.status, issuedAt: o.issuedAt, currency: o.currency, totalMinor: o.totalMinor,
            evidence: evidence.find(e => e.order === o.id) ?? null }));
        const supplierReceipts = receipts.filter(r => orderIds.has(r.order));
        const receiptRow = (r: Data) => {
            const o = issued.find(o => o.id === r.order)!, e = evidence.find(e => e.order === o.id);
            return { receiptId: r.id, orderId: o.id, orderNumber: o.number, lineId: r.line, event: r.event, q: r.q,
                quantity: r.quantity, at: r.at, actor: r.actor, reason: r.reason,
                evidenceId: e?.id ?? null, evidenceVersion: e?.version ?? null, promisedDate: e?.promisedDate ?? null };
        };
        const deliveryRows = supplierReceipts.filter(r => r.event === 'receive').map(r => {
            const row = receiptRow(r);
            // Receipt timestamps are server-recorded UTC; compare their calendar date with the supplier's date-only promise.
            return { ...row, onTime: row.promisedDate ? row.at.slice(0, 10) <= row.promisedDate : null };
        });
        const onTime = deliveryRows.filter(r => r.onTime === true).length, late = deliveryRows.filter(r => r.onTime === false).length;
        const qualityRows = supplierReceipts.filter(r => ['reject', 'return'].includes(r.event)).map(receiptRow);
        const rejected = qualityRows.filter(r => r.event === 'reject'), returned = qualityRows.filter(r => r.event === 'return');
        const invoiceRows = invoices.filter(i => orderIds.has(i.order)).map(i => {
            const allocations = matches.filter(m => m.invoiceId === i.id);
            return { invoiceId: i.id, orderId: i.order, reference: i.reference, source: i.source, currency: i.currency,
                amountMinor: i.totalMinor, at: i.at, actor: i.actor, allocations: allocations.map(l => ({ ...l, quantity: i.allocations.find((a: Data) => a.line === l.lineId)?.quantity })),
                exception: i.status === 'exception' || allocations.some(x => x.exception || x.priceMismatch || x.quantityMismatch || x.receiptShortfall || x.closedBalance) };
        });
        const exceptions = invoiceRows.filter(i => i.exception).length;
        const acknowledgmentRows = issued.map(o => {
            const e = evidence.find(e => e.order === o.id), acknowledgedAt = e?.acknowledgedAt ?? null;
            return { orderId: o.id, orderNumber: o.number, issuedAt: o.issuedAt, acknowledgedAt,
                elapsedMs: acknowledgedAt ? Date.parse(acknowledgedAt) - Date.parse(o.issuedAt) : null,
                evidenceId: e?.id ?? null, evidenceVersion: e?.version ?? null, source: e?.source ?? null };
        });
        const knownAcknowledgments = acknowledgmentRows.filter(r => r.elapsedMs !== null);
        const currencies = new Set([...supplierOrders.map(o => o.currency), ...invoiceRows.map(i => i.currency)]);
        const spend = [...currencies].sort().map(currency => {
            const currencyOrders = supplierOrders.filter(o => o.currency === currency).map(o => ({ orderId: o.id, number: o.number,
                amountMinor: o.totalMinor, included: Boolean(o.issuedAt && o.status !== 'amended'),
                excludedReason: !o.issuedAt ? 'Not issued' : o.status === 'amended' ? 'Superseded by an issued amendment' : null }));
            const currencyInvoices = invoiceRows.filter(i => i.currency === currency);
            return { currency, orderedCommittedMinor: total(currencyOrders.filter(o => o.included), 'amountMinor'),
                invoicedEvidenceMinor: total(currencyInvoices, 'amountMinor'), orders: currencyOrders, invoices: currencyInvoices };
        });
        const issueRows: Data[] = issues.filter(i => canonicalSupplier(s, i.supplier) === supplier.id).map(i => ({ ...i, issueId: i.id, orderId: i.order }));
        return { supplier: supplier.id, supplierName: supplier.name, orders: orderRows,
            delivery: { onTime, late, unknownPromise: deliveryRows.length - onTime - late, measured: onTime + late, rate: rate(onTime, onTime + late),
                basis: 'Accepted receipt events against the current recorded supplier promise, using the UTC receipt date; unknown promises excluded', rows: deliveryRows },
            quality: { rejected: rejected.length, returned: returned.length, rejectedQ: total(rejected, 'q'), returnedQ: total(returned, 'q'), rows: qualityRows },
            invoiceAccuracy: { total: invoiceRows.length, exceptions, matched: invoiceRows.length - exceptions, rate: rate(invoiceRows.length - exceptions, invoiceRows.length), rows: invoiceRows },
            acknowledgment: { known: knownAcknowledgments.length, unknown: acknowledgmentRows.length - knownAcknowledgments.length,
                averageMs: knownAcknowledgments.length ? total(knownAcknowledgments, 'elapsedMs') / knownAcknowledgments.length : null,
                basis: 'Elapsed time from recorded issuance to buyer-evidenced supplier acknowledgment; unknown acknowledgments excluded', rows: acknowledgmentRows },
            spend, spendBasis: 'Current issued PO face totals exclude superseded amendments. Invoiced totals are evidence, without bill approval or payment.',
            issues: { open: issueRows.filter(i => i.status === 'open').length, resolved: issueRows.filter(i => i.status === 'resolved').length, rows: issueRows } };
    });
}
