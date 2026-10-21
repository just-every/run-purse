import { mayReceive, receiptVersion } from './receipt-routing';
import { audit, requirePermission, get, put, requireThat, text, quantity, uid, type Actor, type Data, type State } from './types';
import { linePosition, commitment, remainingValue } from './orders';
import { ledger, reservationAvailable } from './requests';

export function receipt(s: State, a: Actor, b: Data) {
    const o = get(s, 'order', b.order);
    requireThat(mayReceive(s,a,o), 'Receipt outside your receiver assignment',403);
    if(b.receiptVersion !== undefined) requireThat(b.receiptVersion === receiptVersion(s,o), 'Receipt position changed; reload before confirming',409);
    requireThat(o.status === 'issued' && !o.imported, 'Only a natively issued PO can be received', 409);
    const l = o.lines.find((l: Data) => l.id === b.line);
    requireThat(l, 'PO line not found', 404);
    const q = quantity(b.quantity), position = linePosition(s, o.id, l), event = b.event;
    requireThat(['receive', 'return', 'reject', 'cancel'].includes(event), 'Choose a receipt event');
    requireThat(event === 'return' ? q <= position.accepted : q <= position.outstanding, 'Quantity exceeds received or outstanding quantity', 409);
    requireThat(event !== 'receive' || o.replenishmentStatus !== 'held', 'Replenishment is held for review; amend the request and obtain new approval before receiving replacements', 409);
    if (event === 'cancel') requirePermission(s, a, 'procurement.manage', o);
    const id = uid();
    const record = { order: o.id, line: l.id, event, q, quantity: b.quantity,
        reason: text(b.reason, 'Receipt reason or milestone'), actor: a.id, at: new Date().toISOString() };
    put(s, 'receipt', id, record);
    const r = get(s, 'request', o.request), target = remainingValue(s, o), current = commitment(s, r), delta = target - current;
    const held = delta > 0 && (o.replenishmentStatus === 'held' || !reservationAvailable(s, r, delta));
    if (held) {
        const reason = 'Replenishment held for review: current purchasing policy or available budget does not authorize the reservation. Amend the request and obtain new approval.';
        put(s, 'receipt', id, { ...record, replenishmentStatus: 'held', replenishmentMinor: delta, replenishmentReason: reason });
        put(s, 'order', o.id, { ...o, replenishmentStatus: 'held', replenishmentMinor: delta, replenishmentReason: reason });
    } else {
        if (delta) ledger(s, a, r, delta, event === 'return' ? 'return-reservation' : `${event}-release`);
        if (o.replenishmentStatus === 'held') put(s, 'order', o.id, { ...o, replenishmentStatus: 'cancelled', replenishmentMinor: 0 });
    }
    audit(s, a, 'receipt', o.id, { event, line: l.id, quantity: b.quantity, ownerOverride: a.owner, replenishmentStatus: held ? 'held' : 'authorized' });
    return get(s, 'receipt', id);
}
