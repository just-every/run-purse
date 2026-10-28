import { adoptionDeposits, operationalOrder } from './adoption-position';
import { publicInvoice } from './invoice-status';
import { invoiceEvidence, storeInvoiceOriginal } from './invoice-evidence';
import { canonicalSupplier } from './supplier-identity';
import { moneyInput } from './money';
import { createHash } from 'node:crypto';
import { all, audit, get, put, requireThat, text, minor, quantity, extended, uid, type Actor, type Data, type State } from './types';
import { linePosition, commitment, remainingValue } from './orders';
import { ledger } from './requests';
import { allowed, requirePermission } from './access';

export const invoiceCreditApplied = (s: State, id: string) => all(s, 'supplierCreditApplication').filter(row => row.invoice === id).reduce((n, row) => n + row.amountMinor, 0);
export function creditInvoiceVersion(s: State, invoice: Data) {
    return createHash('sha256').update(JSON.stringify([s.get('invoice:' + invoice.id)?.revision, s.get('payable:' + invoice.id)?.revision,
        all(s, 'supplierCreditApplication').filter(row => row.invoice === invoice.id).map(row => row.id).sort()])).digest('hex');
}

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
        evidenceHash: i.evidenceHash ?? null, depositAppliedMinor: i.depositAppliedMinor ?? 0, release: i.release ?? null, allocations: i.allocations.map((x: Data) => [x.line, x.q, x.amountMinor])
            .sort((a: any[], b: any[]) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) });
}

export function invoice(s: State, a: Actor, b: Data, confirmation?: { reading: string }) {
    return captureInvoice(s, { kind: 'native', actor: a }, b, confirmation);
}

/** The supplier capability is checked and atomically fenced by its HTTP door.
 * It records evidence without impersonating an authenticated native operator. */
export type InvoiceCaptureAuthority = { kind: 'native'; actor: Actor } | { kind: 'supplier-link'; event: Data };
export function captureInvoice(s: State, authority: InvoiceCaptureAuthority, b: Data, confirmation?: { reading: string }): Data {
    const a = authority.kind === 'native' ? authority.actor : null;
    if (a) requirePermission(s, a, 'invoice.capture');
    const o = get(s, 'order', b.order);
    if (a) requirePermission(s, a, 'invoice.capture', o);
    else {
        const event = authority.kind === 'supplier-link' ? authority.event : null;
        const request = get(s, 'request', o.request);
        requireThat(event && event.order === o.id && event.supplier === o.supplier && event.revision === o.revision && event.acknowledgment?.revision === o.revision && !event.erasure && !event.revokedAt && Date.parse(event.expiresAt) > Date.now() && o.status === 'issued' && o.issuedAt && !o.imported && !o.adoption && request.status === 'approved' && request.revision === o.revision && !o.poDetails?.blanket && !confirmation, 'Current acknowledged exact native order link required', 409);
    }
    const actorId = a?.id ?? 'supplier-link';
    const result = (value: Data) => a ? scopedInvoice(s, a, value) : value;
    const recordAudit = (action: string, record: string, detail: Data = {}) => {
        if (a) audit(s, a, action, record, detail);
        else put(s, 'audit', uid(), { actor: actorId, action, record, ...detail, send: authority.kind === 'supplier-link' ? authority.event.id : undefined, identityVerified: false, at: new Date().toISOString() });
    };
    const storeOriginal = (value: Data) => {
        if (a) return storeInvoiceOriginal(s, a, value, b);
        if (!b.document) return;
        const id = uid();
        put(s, 'attachment', id, { kind: 'invoice', record: value.id, ...value.document, base64: b.document.base64, actor: actorId, at: new Date().toISOString() });
        recordAudit('attachment', value.id, { attachment: id });
    };
    requireThat(operationalOrder(s, o), 'Issued or explicitly adopted PO required', 409);
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
    const identityPrior = all(s, 'invoice').find(i => canonicalSupplier(s, get(s, 'order', i.order).supplier) === canonicalSupplier(s, o.supplier) && i.reference === reference);
    const grossMinor = candidate.totalMinor;
    const depositAppliedMinor = b.depositAppliedAmount !== undefined || b.depositAppliedMinor !== undefined ? moneyInput(b, 'depositAppliedAmount', 'depositAppliedMinor', 'Deposit credit') : 0;
    if (depositAppliedMinor) {
        const deposits = adoptionDeposits(s, o);
        requireThat(deposits.sources.length && depositAppliedMinor <= deposits.unappliedMinor + (identityPrior?.depositAppliedMinor ?? 0) && depositAppliedMinor <= grossMinor, 'Deposit credit exceeds the imported unapplied balance or invoice amount', 409);
        Object.assign(candidate, { grossMinor, depositAppliedMinor, totalMinor: grossMinor - depositAppliedMinor });
    }
    const priorSource = confirmation ? all(s, 'invoice').find(i => (i.imported || i.supplierSubmission && i.sourceConfirmation === 'pending') && i.order === o.id && i.reference === reference) : undefined;
    if (priorSource) { candidate.id = priorSource.id; if (priorSource.imported) candidate.imported = true; }
    Object.assign(candidate, invoiceEvidence(s, o, candidate, b));
    const existing = all(s, 'invoice').filter(i => canonicalSupplier(s, get(s, 'order', i.order).supplier) === canonicalSupplier(s, o.supplier) && i.reference === reference);
    if (existing.length) {
        if (priorSource && existing.length === 1) {
            const reading = get(s, 'invoiceReading', confirmation!.reading);
            requireThat(reading.status === 'review' && reading.order === o.id && reading.sourceDescriptor.sha256 === candidate.document?.sha256, 'Historical evidence requires the current source-bound reading', 409);
            if (priorSource.supplierSubmission) {
                requireThat(reading.source === priorSource.supplierSource && priorSource.invoiceDate === candidate.invoiceDate && priorSource.document?.sha256 === candidate.document?.sha256, 'Confirm the exact supplier submission original and date; reconcile conflicting evidence separately', 409);
                candidate.source = priorSource.source;
                const retained = priorSource.flags ?? [];
                candidate.flags = [...retained, ...candidate.flags.filter((flag: Data) => !retained.some((old: Data) => old.code === flag.code && old.relatedInvoice === flag.relatedInvoice && old.documentHash === flag.documentHash))];
                candidate.riskReviews = priorSource.riskReviews ?? [];
                candidate.riskVersion = (priorSource.riskVersion ?? 1) + 1;
            }
            requireThat(priorSource.totalMinor === candidate.totalMinor && JSON.stringify(priorSource.allocations.map((x: Data) => [x.line,x.q,x.amountMinor])) === JSON.stringify(candidate.allocations.map((x: Data) => [x.line,x.q,x.amountMinor])) && (!priorSource.document || priorSource.document.sha256 === candidate.document?.sha256), 'Confirmed source conflicts with the imported invoice balances or original; reconcile instead of overwriting', 409);
            const at = new Date().toISOString();
            put(s, 'invoice', priorSource.id, { ...priorSource, ...candidate, sourceConfirmation: 'confirmed', confirmedReading: reading.id, confirmedAt: at, confirmedBy: actorId, sourceOriginalDate: priorSource.invoiceDate, at: priorSource.at });
            if (!priorSource.document) storeOriginal(get(s, 'invoice', priorSource.id));
            recordAudit(priorSource.supplierSubmission ? 'confirm-supplier-invoice' : 'confirm-imported-invoice', priorSource.id, { reading: reading.id, source: reading.source, ...(priorSource.imported ? { historicalApproval: 'Imported evidence only' } : {}) });
            return result(get(s, 'invoice', priorSource.id));
        }
        requireThat(existing.length === 1 && evidence(existing[0]) === evidence(candidate),
            'Invoice reference already exists for this supplier with different evidence or allocations; review the existing invoice before correction', 409);
        return result(existing[0]);
    }
    requireThat(['issued', 'adopted', 'closed', 'cancelled'].includes(o.status), 'Issued PO required for new invoice evidence', 409);
    const closedBalance = allocations.some((x: Data) => {
        const l = o.lines.find((l: Data) => l.id === x.line);
        const billed = all(s, 'invoice').filter(i => get(s, 'order', i.order).request === o.request).flatMap(i => i.allocations).filter((z: Data) => z.line === l.id).reduce((n: number, z: Data) => n + z.q, 0);
        return linePosition(s, o.id, l).closed > 0 && billed + x.q > l.q - linePosition(s, o.id, l).closed;
    });
    const id = uid();
    put(s, 'invoice', id, { ...candidate, id, entrySequence: all(s,'invoice').reduce((n,i)=>Math.max(n,i.entrySequence??0),0)+1, ...(closedBalance ? { status: 'exception', exception: 'Invoice exceeds the closed PO balance' } : {}), totalMinor: candidate.totalMinor, actor: actorId, at: new Date().toISOString() });
    storeOriginal(get(s, 'invoice', id));
    if(o.poDetails?.blanket) {
        const r=get(s,'request',o.request), target=remainingValue(s,o), current=commitment(s,r);
        if(target<current && a) ledger(s,a,r,target-current,'blanket-invoice-drawdown');
    }
    recordAudit('invoice', id, { flags: candidate.flags.map((f: Data) => f.code) });
    return result(get(s, 'invoice', id));
}
