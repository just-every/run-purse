import { savingsReport } from './savings-report';
import { linePosition } from './orders';
import { all, get, key, requireThat, type Data, type State } from './types';

export const valueMode = 'deterministic v1';
export function canonicalValue(value: any): string {
    if (Array.isArray(value)) return '[' + value.map(canonicalValue).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonicalValue(value[k])).join(',') + '}';
    return JSON.stringify(value);
}
export async function valueDigest(value: Uint8Array | string): Promise<string> {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export function approvedValueRequest(s: State, request: Data, revision: number) {
    requireThat(!request.imported && request.revision === revision && request.status === 'approved', 'Current exact approved request revision required', 409);
    const approved = get(s, 'revision', `${request.id}:${revision}`);
    requireThat(approved.valuePromise && canonicalValue(approved.valuePromise) === canonicalValue(request.valuePromise), 'This approved revision has no matching value promise', 409);
    requireThat(all(s, 'decision').some(d => d.request === request.id && d.revision === revision && d.decision === 'approved'), 'Native exact-revision approval required', 409);
    return approved;
}
export function parseSeatOriginal(attachment: Data): { seats: { id: string; active: boolean }[]; bytes: Uint8Array } {
    let bytes: Uint8Array, parsed: any;
    try {
        bytes = Uint8Array.from(atob(attachment.base64), x => x.charCodeAt(0));
        parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch { requireThat(false, 'Seat original must be valid UTF-8 JSON'); }
    requireThat(parsed && typeof parsed === 'object' && Array.isArray(parsed.seats) && parsed.seats.length <= 100000, 'Seat original must contain seats: [{id, active}]');
    const ids = new Set<string>();
    for (const seat of parsed.seats) {
        requireThat(seat && typeof seat.id === 'string' && seat.id.trim().length > 0 && seat.id.length <= 200 && typeof seat.active === 'boolean', 'Every seat requires an ID and boolean active value');
        requireThat(!ids.has(seat.id), 'Seat IDs must be distinct'); ids.add(seat.id);
    }
    return { seats: parsed.seats, bytes: bytes! };
}

/** No source prose is interpreted; facts derive only from typed native fields. */
export async function buildValueSnapshot(s: State, request: Data, revision: number): Promise<Data> {
    const approved = approvedValueRequest(s, request, revision), selected = new Map<string, Data>();
    const add = (kind: string, id: string) => {
        const row = s.get(key(kind, id)); requireThat(row, 'Value source missing', 409);
        const value = get(s, kind, id);
        if (kind === 'attachment') {
            const fields = ['id', 'kind', 'record', 'name', 'mediaType', 'size', 'actor', 'at'];
            selected.set(key(kind, id), { kind, id, version: row.revision, fields, value: Object.fromEntries(fields.map(k => [k, value[k]])) });
        } else selected.set(key(kind, id), { kind, id, version: row.revision, value: structuredClone(value) });
    };
    add('request', request.id); add('revision', `${request.id}:${revision}`);
    if (s.has('valuePolicy:main')) add('valuePolicy', 'main');
    for (const d of all(s, 'decision').filter(d => d.request === request.id && d.revision <= revision)) add('decision', d.id);
    const orders = all(s, 'order').filter(o => o.request === request.id && o.revision === revision && o.issuedAt && !o.imported), orderIds = new Set(orders.map(o => o.id));
    for (const order of orders) add('order', order.id);
    const receipts = all(s, 'receipt').filter(r => orderIds.has(r.order) && !r.imported);
    for (const receipt of receipts) add('receipt', receipt.id);
    const issues = all(s, 'supplierIssue').filter(i => orderIds.has(i.order));
    for (const issue of issues) add('supplierIssue', issue.id);
    const usage = all(s, 'valueSeatImport').filter(u => u.request === request.id && u.revision === revision).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    for (const source of usage) { add('valueSeatImport', source.id); add('attachment', source.attachment); }
    const promise = structuredClone(approved.valuePromise), latest = usage.at(-1);
    let assessment: Data;
    if (promise.kind === 'seats') assessment = latest ? {
        kind: 'seats', status: 'evidence', promisedSeats: promise.seats, activeSeats: latest.activeSeats,
        shortfall: Math.max(0, promise.seats - latest.activeSeats), usage: latest.id,
        statement: `${promise.seats} promised seats; ${latest.activeSeats} provider-reported active seats; ${Math.max(0, promise.seats - latest.activeSeats)} seat shortfall`,
        basis: 'Provider-reported imported JSON; active === true; unverified',
    } : { kind: 'seats', status: 'no-evidence', promisedSeats: promise.seats, activeSeats: null, shortfall: null, statement: 'no evidence yet' };
    else if (promise.kind === 'need-date') {
        const accepted = receipts.filter(r => r.event === 'receive');
        const positions = orders.flatMap(o => o.lines.map((line: Data) => ({ order: o.id, line: line.id, requiredQ: line.q,
            acceptedQ: (line.carriedAccepted ?? 0) + receipts.filter(r => r.order === o.id && r.line === line.id).reduce((n, r) => n + (r.event === 'receive' ? r.q : r.event === 'return' ? -r.q : 0), 0) })));
        assessment = { kind: 'need-date', status: accepted.length ? 'evidence' : 'no-evidence', needDate: promise.needDate,
            statement: accepted.length ? 'Recorded receipt evidence against the promised need date; requester confirms usefulness' : 'no evidence yet',
            receipts: accepted.map(r => ({ id: r.id, at: r.at, onTime: r.at.slice(0, 10) <= promise.needDate })), positions,
            // Receipt reasons may describe milestones; they are never scored as service completion.
            complete: positions.length ? positions.every(p => p.acceptedQ >= p.requiredQ) : null };
    } else {
        const data: Data = {};
        for (const kind of ['quote', 'revision', 'quoteAward', 'agreementAward', 'decision', 'order', 'payable', 'invoice']) data[kind] = all(s, kind);
        data.order = data.order.map((o: Data) => ({ ...o, positions: o.lines.map((line: Data) => ({ line: line.id, ...linePosition(s, o.id, line) })) }));
        const savings = savingsReport(data), rows = savings.realizedRows.filter(r => r.request === request.id && r.revision === revision), negotiated = savings.rows.filter(r => r.request === request.id && r.revision === revision);
        // Use the established report arithmetic; source originals retain their existing private doors.
        for (const award of [...all(s, 'quoteAward'), ...all(s, 'agreementAward')].filter(a => a.request === request.id && a.revision <= revision)) {
            add('revision', `${request.id}:${award.revision}`);
            add(award.firstQuote ? 'quoteAward' : 'agreementAward', award.id);
            if (award.firstQuote) { add('quote', award.firstQuote); add('quote', award.awardedQuote); }
        }
        // Preserve monetary source versions without disclosing private invoice/remit prose.
        const family = new Set(data.order.filter((o: Data) => o.request === request.id).map((o: Data) => o.id));
        for (const order of all(s, 'order').filter(o => family.has(o.id) && o.issuedAt && !o.imported)) add('order', order.id);
        for (const receipt of all(s, 'receipt').filter(r => family.has(r.order) && !r.imported)) add('receipt', receipt.id);
        for (const invoice of data.invoice.filter((i: Data) => family.has(i.order))) {
            const fields = ['id', 'order', 'currency', 'totalMinor', 'allocations', 'exception', 'flags', 'riskReviews', 'at'];
            selected.set(key('invoice', invoice.id), { kind: 'invoice', id: invoice.id, version: s.get(key('invoice', invoice.id))!.revision,
                fields, value: Object.fromEntries(fields.filter(k => invoice[k] !== undefined).map(k => [k, k === 'flags' ? invoice.flags.map((f: Data) => ({ id: f.id, code: f.code })) : k === 'riskReviews' ? invoice.riskReviews.map((r: Data) => ({ flag: r.flag, actor: r.actor, at: r.at })) : structuredClone(invoice[k])])) });
            for (const payable of data.payable.filter((p: Data) => p.invoice === invoice.id)) {
                const fields = ['id', 'invoice', 'version', 'approvedAt'];
                selected.set(key('payable', payable.id), { kind: 'payable', id: payable.id, version: s.get(key('payable', payable.id))!.revision,
                    fields, value: Object.fromEntries(fields.filter(k => payable[k] !== undefined).map(k => [k, structuredClone(payable[k])])) });
            }
        }
        assessment = { kind: 'quoted-saving', status: rows.length ? 'evidence' : 'no-evidence', promisedMinor: promise.amountMinor, currency: promise.currency,
            realizedMinor: rows.reduce((n, r) => n + r.savingsMinor, 0), negotiatedMinor: negotiated.reduce((n, r) => n + r.savingsMinor, 0),
            rows, statement: rows.length ? 'Existing source-backed invoice savings; cash-planning approval is not payment approval' : 'no evidence yet' };
    }
    const sources = [...selected.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
    const inputs = { request: request.id, revision, requester: request.requester, promise, sources, assessment, mode: valueMode, model: 'none', provider: 'none' };
    return { ...inputs, references: sources.map(({ kind, id, version }) => ({ kind, id, version })), fingerprint: await valueDigest(canonicalValue(inputs)),
        issues: issues.map(i => ({ id: i.id, status: i.status })), freeText: 'Source text and requester notes are unscored data' };
}
