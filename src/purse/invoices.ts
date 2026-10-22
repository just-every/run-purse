import { publicInvoice } from './invoice-status';
import { invoiceEvidence, storeInvoiceOriginal } from './invoice-evidence';
import { canonicalSupplier } from './supplier-identity';
import { moneyInput } from './money';
import { all, audit, get, put, requireThat, text, minor, quantity, extended, uid, type Actor, type Data, type State } from './types';
import { linePosition, commitment, remainingValue } from './orders';
import { ledger } from './requests';
import { allowed, requirePermission } from './access';

export function scopedInvoice(s: State, a: Actor, value: Data) {
    const projected = publicInvoice(value);
    return { ...projected, flags: projected.flags?.map((flag: Data) => !flag.relatedInvoice
        || s.has('invoice:' + flag.relatedInvoice) && allowed(s, a, 'invoice.read', get(s, 'invoice', flag.relatedInvoice))
        ? flag : { ...flag, relatedInvoice: undefined }) };
}

// Receipt positions and formatting are not invoice identity. Compare the
// submitted evidence and normalized allocations, independently of line order.
function evidence(i: Data) {
    return JSON.stringify({ order: i.order, currency: i.currency, source: i.source,
        evidenceHash: i.evidenceHash ?? null, release: i.release ?? null, allocations: i.allocations.map((x: Data) => [x.line, x.q, x.amountMinor])
            .sort((a: any[], b: any[]) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) });
}

export function invoice(s: State, a: Actor, b: Data) {
    requirePermission(s, a, 'invoice.capture');
    const o = get(s, 'order', b.order);
    requirePermission(s, a, 'invoice.capture', o);
    requireThat(o.issuedAt && !o.imported, 'Issued PO required', 409);
    const reference = text(b.reference, 'Invoice reference'), source = text(b.source, 'Invoice evidence source');
    requireThat(Array.isArray(b.allocations) && b.allocations.length > 0, 'Allocate invoice lines');
    const seen = new Set();
    const allocations = b.allocations.map((x: Data) => {
        const l = o.lines.find((l: Data) => l.id === x.line);
        requireThat(l && !seen.has(l.id), 'Use each PO line once');
        seen.add(l.id);
        const q = quantity(x.quantity);
        return { line: l.id, quantity: x.quantity, q, amountMinor: moneyInput(x, 'amount', 'amountMinor', 'Invoice amount'),
            orderedMinor: extended(q, l.unitMinor), receivedQ: linePosition(s, o.id, l).accepted };
    });
    const candidate: Data = { ...(b.release ? { release: text(b.release, 'Blanket release') } : {}), order: o.id, supplier: o.supplier, reference, source, currency: o.currency, allocations, totalMinor: minor(allocations.reduce((n: number, x: Data) => n + x.amountMinor, 0), 'Invoice total') };
    Object.assign(candidate, invoiceEvidence(s, o, candidate, b));
    const existing = all(s, 'invoice').filter(i => canonicalSupplier(s, get(s, 'order', i.order).supplier) === canonicalSupplier(s, o.supplier) && i.reference === reference);
    if (existing.length) {
        requireThat(existing.length === 1 && evidence(existing[0]) === evidence(candidate),
            'Invoice reference already exists for this supplier with different evidence or allocations; review the existing invoice before correction', 409);
        return scopedInvoice(s, a, existing[0]);
    }
    requireThat(['issued', 'closed'].includes(o.status), 'Issued PO required for new invoice evidence', 409);
    const closedBalance = allocations.some((x: Data) => {
        const l = o.lines.find((l: Data) => l.id === x.line);
        const billed = all(s, 'invoice').filter(i => get(s, 'order', i.order).request === o.request).flatMap(i => i.allocations).filter((z: Data) => z.line === l.id).reduce((n: number, z: Data) => n + z.q, 0);
        return linePosition(s, o.id, l).closed > 0 && billed + x.q > l.q - linePosition(s, o.id, l).closed;
    });
    const id = uid();
    put(s, 'invoice', id, { ...candidate, id, entrySequence: all(s,'invoice').reduce((n,i)=>Math.max(n,i.entrySequence??0),0)+1, ...(closedBalance ? { status: 'exception', exception: 'Invoice exceeds the closed PO balance' } : {}), totalMinor: minor(allocations.reduce((n: number, x: Data) => n + x.amountMinor, 0), 'Invoice total'), actor: a.id, at: new Date().toISOString() });
    storeInvoiceOriginal(s, a, get(s, 'invoice', id), b);
    if(o.poDetails?.blanket) {
        const r=get(s,'request',o.request), target=remainingValue(s,o), current=commitment(s,r);
        if(target<current) ledger(s,a,r,target-current,'blanket-invoice-drawdown');
    }
    audit(s, a, 'invoice', id, { flags: candidate.flags.map((f: Data) => f.code) });
    return scopedInvoice(s, a, get(s, 'invoice', id));
}
