import { all, date, extended, get, requireThat, type Data, type State } from './types';
import { receiptDay } from './receipt-routing';

/** The approved PO total is the blanket cap; invoices consume it across revisions. */
export function blanketTerms(input: unknown): Data | null {
    if (input == null) return null;
    requireThat(typeof input === 'object' && !Array.isArray(input), 'Blanket validity must be an object');
    const b = input as Data, validFrom = date(b.validFrom, 'Blanket valid from'), validThrough = date(b.validThrough, 'Blanket valid through');
    requireThat(validFrom <= validThrough, 'Blanket valid from must precede valid through');
    return { validFrom, validThrough };
}
export function blanketBilled(s: State, r: Data): number {
    const request = r.request ?? r.id;
    const ids = new Set(all(s, 'order').filter(o => o.request === request && o.currency === r.currency).map(o => o.id));
    return all(s, 'invoice').filter(i => ids.has(i.order) && i.currency === r.currency).reduce((n, i) => n + i.totalMinor, 0);
}
export function blanketRemaining(s: State, r: Data, cancelled?: (line: Data) => number) {
    const base = r.lines.reduce((n: number, l: Data) => n + l.totalMinor, 0);
    const cancelledMinor = r.lines.reduce((n: number, l: Data) => n + extended(cancelled ? cancelled(l) : l.carriedCancelled ?? 0, l.unitMinor), 0);
    const active = base ? Number((BigInt(r.totalMinor) * BigInt(Math.max(0, base - cancelledMinor)) + BigInt(base) / 2n) / BigInt(base)) : r.totalMinor;
    return Math.max(0, active - blanketBilled(s, r));
}
export function requireBlanketValidity(s: State, r: Data) {
    const terms = r.poDetails?.blanket;
    if (!terms) return;
    const today = receiptDay(s, Date.now());
    requireThat(today >= terms.validFrom && today <= terms.validThrough, 'Blanket PO is outside its inclusive validity period; amend and renew approval', 409);
}
export function blanketPosition(s: State, o: Data) {
    if (!o.poDetails?.blanket) return undefined;
    const current = all(s, 'order').filter(p => p.request === o.request && p.currency === o.currency && p.issuedAt).sort((a,b) => b.revision - a.revision)[0] ?? o;
    const billedMinor = blanketBilled(s, current);
    return { ...current.poDetails.blanket, currentOrder: current.id, capMinor: current.totalMinor, billedMinor,
        remainingMinor: Math.max(0, current.totalMinor - billedMinor), overCapMinor: Math.max(0, billedMinor - current.totalMinor) };
}
