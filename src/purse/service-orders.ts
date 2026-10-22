import { all, audit, extended, get, minor, put, qty, requireThat, text, uid, type Actor, type Data, type State } from './types';
import { moneyInput } from './money';
import { mayReceive, receiptVersion } from './receipt-routing';
import { commitment, remainingValue } from './orders';
import { ledger, reservationAvailable } from './requests';

export function serviceTerms(input: unknown, totalMinor: number): Data | null {
    if (input == null) return null;
    requireThat(typeof input === 'object' && !Array.isArray(input), 'Service receiving terms must be an object');
    const b = input as Data;
    requireThat(totalMinor > 0, 'Service line value must be positive');
    requireThat(['amount', 'percentage', 'milestone'].includes(b.mode), 'Choose amount, percentage or named milestone service receiving');
    if (b.mode !== 'milestone') return { mode: b.mode };
    requireThat(Array.isArray(b.milestones) && b.milestones.length > 0 && b.milestones.length <= 100, 'Provide 1–100 valued milestones');
    const milestones = b.milestones.map((m: Data) => ({ id: text(m.id ?? uid(), 'Milestone id', 200), name: text(m.name, 'Milestone name'), valueMinor: moneyInput(m, 'valueAmount', 'valueMinor', 'Milestone value') }));
    requireThat(new Set(milestones.map((m: Data) => m.id)).size === milestones.length && milestones.every((m: Data) => m.valueMinor > 0), 'Milestones need distinct identities and positive values');
    requireThat(milestones.reduce((n: number, m: Data) => n + m.valueMinor, 0) === totalMinor, 'Milestone values must equal the service line value');
    return { mode: b.mode, milestones };
}

export function servicePosition(s: State, o: Data, line: Data) {
    const events = all(s, 'receipt').filter(e => e.order === o.id && e.line === line.id);
    const acceptedMinor = (line.carriedAcceptedMinor ?? 0) + events.reduce((n, e) => n + (e.event === 'receive' ? e.valueMinor ?? extended(e.q, line.unitMinor) : e.event === 'return' ? -(e.valueMinor ?? extended(e.q, line.unitMinor)) : 0), 0);
    const cancelledMinor = (line.carriedCancelledMinor ?? 0) + events.filter(e => e.event === 'cancel').reduce((n, e) => n + (e.valueMinor ?? extended(e.q, line.unitMinor)), 0);
    const closedQ = all(s, 'orderClosure').filter(c => c.order === o.id && c.active).flatMap(c => c.lines).filter((l: Data) => l.line === line.id).reduce((n: number, l: Data) => n + l.q, 0);
    const closedMinor = line.q ? Number(BigInt(line.totalMinor) * BigInt(closedQ) / BigInt(line.q)) : 0;
    return { acceptedMinor, cancelledMinor, closedMinor, outstandingMinor: Math.max(0, line.totalMinor - acceptedMinor - cancelledMinor - closedMinor) };
}

/** Value receipts remain source facts; percentage is cumulative, amount is incremental. */
export function serviceReceipt(s: State, a: Actor, b: Data) {
    const o = get(s, 'order', b.order), line = o.lines.find((l: Data) => l.id === b.line);
    requireThat(mayReceive(s, a, o), 'Receipt outside your receiver assignment', 403);
    requireThat(o.status === 'issued' && !o.imported && line?.service, 'Choose a current issued service line', 409);
    requireThat(b.receiptVersion === receiptVersion(s, o), 'Receipt position changed; reload before confirming', 409);
    requireThat(line.totalMinor > 0, 'Service line value must be positive', 409);
    requireThat(o.replenishmentStatus !== 'held', 'Replenishment is held; amend and renew approval', 409);
    const position = servicePosition(s, o, line), mode = line.service.mode;
    const event = b.event ?? 'receive';
    requireThat(['receive', 'return'].includes(event), 'Choose service acceptance or return');
    requireThat(event !== 'return' || mode !== 'milestone', 'Named milestones retain their acceptance; amend the approved schedule for corrections',409);
    let valueMinor: number, milestone: string | undefined, percentage: string | undefined;
    if (event === 'return' || mode === 'amount') valueMinor = moneyInput(b, 'valueAmount', 'valueMinor', 'Received service value');
    else if (mode === 'percentage') {
        requireThat(typeof b.percentage === 'string' && /^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(b.percentage), 'Percentage must be 0–100 with up to two decimal places');
        const basisPoints = Math.round(Number(b.percentage) * 100);
        const cumulative = Number((BigInt(line.totalMinor) * BigInt(basisPoints) + 5000n) / 10000n);
        valueMinor = cumulative - position.acceptedMinor; percentage = b.percentage;
    } else {
        const m = line.service.milestones.find((m: Data) => m.id === b.milestone);
        requireThat(m, 'Choose an approved named milestone');
        const completed = all(s, 'receipt').some(e => e.order === o.id && e.line === line.id && e.milestone === m.id) || (line.carriedMilestones ?? []).includes(m.id);
        requireThat(!completed, 'This milestone was already accepted', 409);
        valueMinor = m.valueMinor; milestone = m.id;
    }
    requireThat(valueMinor > 0 && valueMinor <= (event === 'return' ? position.acceptedMinor : position.outstandingMinor), 'Service value exceeds accepted or outstanding value, or does not advance completion', 409);
    // Quantities support existing receiving displays; valueMinor is the matching authority.
    const q = Math.max(1, Number((BigInt(valueMinor) * BigInt(line.q) + BigInt(line.totalMinor) / 2n) / BigInt(line.totalMinor)));
    const id = uid(), record = { order: o.id, line: line.id, event, q, quantity: qty(q), valueMinor: minor(valueMinor), mode, serviceSequence: all(s, 'receipt').filter(e => e.order === o.id && e.line === line.id).length + 1, ...(percentage ? { percentage } : {}), ...(milestone ? { milestone } : {}), reason: text(b.reason, 'Service acceptance evidence'), actor: a.id, at: new Date().toISOString() };
    put(s, 'receipt', id, record);
    const request = get(s, 'request', o.request), delta = remainingValue(s, o) - commitment(s, request);
    if (delta > 0 && !reservationAvailable(s, request, delta)) {
        put(s, 'order', o.id, { ...o, replenishmentStatus: 'held', replenishmentMinor: delta, replenishmentReason: 'Returned service value needs renewed budget authority' });
        put(s, 'receipt', id, { ...record, replenishmentStatus: 'held', replenishmentMinor: delta, replenishmentReason: 'Returned service value needs renewed budget authority' });
    } else if (delta) ledger(s, a, request, delta, event === 'return' ? 'return-reservation' : 'service-receipt-release');
    audit(s, a, 'service-receipt', o.id, { receipt: id, line: line.id, valueMinor, mode, event, ownerOverride: a.owner });
    return get(s, 'receipt', id);
}

/** First fitting evidence consumes received value. An oversized exception cannot block a smaller valid bill. */
export function serviceInvoiceMatches(s: State, current: Data, line: Data) {
    const lineage = new Set(all(s, 'order').filter(o => o.request === current.request && o.issuedAt).map(o => o.id));
    const invoices = all(s, 'invoice').filter(i => lineage.has(i.order)).sort((a, b) => (a.entrySequence ?? 0) - (b.entrySequence ?? 0) || a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    let available = servicePosition(s, current, line).acceptedMinor;
    const matched = new Set<string>();
    for (const i of invoices) for (const allocation of i.allocations.filter((x: Data) => x.line === line.id)) {
        if (allocation.amountMinor <= available) { available -= allocation.amountMinor; matched.add(i.id); }
    }
    return matched;
}
