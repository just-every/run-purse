import { receivedDates } from './received-dates';
import { operationalOrder, orderAdoption } from './adoption-position';
import { mayReceive, receiptVersion } from './receipt-routing';
import { audit, requirePermission, get, put, requireThat, text, quantity, uid, type Actor, type Data, type State } from './types';
import { linePosition, commitment, remainingValue } from './orders';
import { ledger, reservationAvailable } from './requests';

export function receipt(s: State, a: Actor, b: Data) {
    const o = get(s, 'order', b.order);
    requireThat(mayReceive(s,a,o), 'Receipt outside your receiver assignment',403);
    if(b.receiptVersion !== undefined) requireThat(b.receiptVersion === receiptVersion(s,o), 'Receipt position changed; reload before confirming',409);
    requireThat(['issued', 'adopted'].includes(o.status) && operationalOrder(s, o), 'Only an issued or explicitly adopted PO can be received', 409);
    const l = o.lines.find((l: Data) => l.id === b.line);
    requireThat(l, 'PO line not found', 404);
    requireThat(!l.service, 'Record structured service value through service receiving', 409);
    const q = quantity(b.quantity), position = linePosition(s, o.id, l), event = b.event;
    requireThat(['receive', 'return', 'reject', 'cancel'].includes(event), 'Choose a receipt event');
    requireThat(event === 'return' ? q <= position.accepted : q <= position.outstanding, 'Quantity exceeds received or outstanding quantity', 409);
    requireThat(event !== 'receive' || o.replenishmentStatus !== 'held', 'Replenishment is held for review; amend the request and obtain new approval before receiving replacements', 409);
    if (event === 'cancel' && orderAdoption(s, o)) requireThat(false, 'An adopted PO cancellation needs a native approved amendment; record physical receiving separately', 409);
    if (event === 'cancel') requirePermission(s, a, 'procurement.manage', o);
    const id = uid();
    const record = { order: o.id, line: l.id, event, q, quantity: b.quantity,
        reason: text(b.reason, 'Receipt reason or milestone'), actor: a.id, ...receivedDates(s, o, b.effectiveDate) };
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
    audit(s, a, 'receipt', o.id, { event, line: l.id, quantity: b.quantity, effectiveDate: record.effectiveDate, recordedDate: record.recordedDate, ownerOverride: a.owner, replenishmentStatus: held ? 'held' : 'authorized' });
    return get(s, 'receipt', id);
}

/** Corrections are signed deltas against one retained native receive event.
 * They are physical evidence only and never invoice or payment approval. */
export function correctReceipt(s: State, a: Actor, b: Data) {
    const original = get(s, 'receipt', text(b.receipt, 'Original receipt', 200)), o = get(s, 'order', original.order);
    requireThat(mayReceive(s, a, o), 'Receipt outside your receiver assignment', 403);
    requireThat(['issued', 'adopted'].includes(o.status) && operationalOrder(s, o) && !o.amendedBy,
        'Correct the current issued PO receipt only', 409);
    const line = o.lines.find((l: Data) => l.id === original.line);
    requireThat(line && !line.service && original.event === 'receive' && !original.imported && !original.correctionOf,
        'Choose an original native goods receipt', 409);
    requireThat(b.receiptVersion === receiptVersion(s, o), 'Receipt position changed; reload before correcting', 409);
    const corrections = [...s.values()].filter(r => r.kind === 'receipt' && r.value.correctionOf === original.id).map(r => r.value);
    const beforeQ = original.q + corrections.reduce((n, r) => n + r.correctionDelta, 0);
    requireThat(b.expectedQ === beforeQ, 'Original receipt correction changed; reload', 409);
    const correctedQ = b.quantity === '0' ? 0 : quantity(b.quantity), delta = correctedQ - beforeQ;
    const position = linePosition(s, o.id, line);
    // Returns remain separate evidence: bound the corrected net position, not
    // the gross quantity on the original delivery.
    requireThat(delta !== 0 && position.accepted + delta >= 0 && position.outstanding - delta >= 0,
        'Correction exceeds current received or outstanding quantity, or changes nothing', 409);
    const attempt = text(b.attempt, 'Correction capture identifier', 100);
    requireThat(![...s.values()].some(r => r.kind === 'receipt' && r.value.correctionAttempt === attempt),
        'Receipt correction capture already recorded', 409);
    const id = uid(), record = { order: o.id, line: line.id, event: delta > 0 ? 'receive' : 'return',
        q: Math.abs(delta), quantity: String(Math.abs(delta) / 1000), correctionOf: original.id,
        correctionAttempt: attempt, correctionSequence: corrections.length + 1, correctionBeforeQ: beforeQ, correctedQ, correctionDelta: delta,
        reason: text(b.reason, 'Receiver correction reason'), actor: a.id, at: new Date().toISOString() };
    put(s, 'receipt', id, record);
    const request = get(s, 'request', o.request), difference = remainingValue(s, o) - commitment(s, request);
    const held = difference > 0 && (o.replenishmentStatus === 'held' || !reservationAvailable(s, request, difference));
    if (held) {
        const reason = 'Receipt correction replenishment held; amend the request and obtain renewed approval.';
        put(s, 'receipt', id, { ...record, replenishmentStatus: 'held', replenishmentMinor: difference, replenishmentReason: reason });
        put(s, 'order', o.id, { ...o, replenishmentStatus: 'held', replenishmentMinor: difference, replenishmentReason: reason });
    } else if (difference) ledger(s, a, request, difference, 'receipt-correction');
    audit(s, a, 'receipt-correction', o.id, { receipt: id, originalReceipt: original.id, line: line.id,
        beforeQ, correctedQ, delta, reason: record.reason, replenishmentStatus: held ? 'held' : 'authorized' });
    return get(s, 'receipt', id);
}
