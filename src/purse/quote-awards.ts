import { requirePermission } from './access';
import { all, audit, can, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

/** A recorded buyer decision, never a supplier signature or message. */
export function quoteAwards(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op !== 'quote-award') return;
    requirePermission(s,a,'rfq.manage',get(s,'request',b.request));
    requirePermission(s,a,'request.edit',get(s,'request',b.request));
    const request = get(s, 'request', b.request);
    requireThat(!request.imported && request.revision === b.revision && request.status === 'draft', 'Award the current native draft before submission', 409);
    requireThat(![...all(s, 'quoteAward'),...all(s,'agreementAward')].some(q => q.request === request.id && q.revision === request.revision), 'This revision already has an immutable award', 409);
    const first = get(s, 'quote', b.firstQuote), winner = get(s, 'quote', b.awardedQuote);
    requireThat(first.id !== winner.id && [first, winner].every(q => q.request === request.id && q.revision === request.revision && q.supplier === request.supplier && q.currency === request.currency), 'Use two quotes for this exact revision, supplier and currency', 409);
    const offers = all(s, 'quote').filter(q => q.request === request.id && q.revision === request.revision && q.supplier === request.supplier && q.currency === request.currency);
    requireThat(Number.isSafeInteger(first.sequence) && first.sequence < winner.sequence && offers.every(q => !Number.isSafeInteger(q.sequence) || q.sequence >= first.sequence), 'Baseline must be the first recorded offer, before the winning quote', 409);
    requireThat(first.lines.length === request.lines.length && winner.lines.length === request.lines.length, 'Quotes must cover every request line');
    // Explicit mapping avoids guessing which differently-priced lines correspond.
    requireThat(Array.isArray(b.lines) && b.lines.length === request.lines.length, 'Map every request line');
    for (const field of ['requestLine', 'firstLine', 'awardedLine']) requireThat(new Set(b.lines.map((l: Data) => l[field])).size === b.lines.length, 'Map each line once');
    const lines = b.lines.map((mapping: Data) => {
        const r = request.lines.find((l: Data) => l.id === mapping.requestLine), f = first.lines.find((l: Data) => l.id === mapping.firstLine), w = winner.lines.find((l: Data) => l.id === mapping.awardedLine);
        requireThat(r && f && w && [f, w].every(l => l.q === r.q && l.description === r.description && l.unit === r.unit && l.partNumber === r.partNumber) && r.unitMinor === w.unitMinor, 'Mapped item, unit, SKU, quantity and awarded request price must agree');
        return { requestLine: r.id, firstLine: f.id, awardedLine: w.id };
    });
    const id = uid(), value = { id, request: request.id, revision: request.revision, firstQuote: first.id, awardedQuote: winner.id,
        supplier: request.supplier, currency: request.currency, lines, reason: text(b.reason, 'Award reason'), actor: a.id, at: new Date().toISOString() };
    put(s, 'quoteAward', id, value);
    audit(s, a, op, request.id, { award: id, revision: request.revision, reason: value.reason });
    return value;
}
