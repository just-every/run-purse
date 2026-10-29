import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index';
import { orderAdoption, currentOperationalOrder } from './adoption-position';
import { commitment, linePosition } from './orders';
import { ledger, requests } from './requests';
import { currentDecision } from './approval';
import { all, audit, can, allowed, requirePermission, get, put, qty, requireThat, text, uid, type Actor, type Data, type State } from './types';

function sourcePosition(s: State, order: Data) {
    const lineage = new Set(all(s, 'order').filter(candidate=>candidate.request===order.request).map(candidate=>candidate.id));
    const invoices = new Set(all(s,'invoice').filter(invoice=>lineage.has(invoice.order)).map(invoice=>invoice.id));
    return sha256(canonicalJson([...s.values()].filter(row => row.kind === 'order' && row.id === order.id || ['receipt','orderClosure'].includes(row.kind) && row.value.order === order.id || row.kind === 'commitment' && row.value.request === order.request || ['invoice','deposit'].includes(row.kind) && lineage.has(row.value.order) || row.kind === 'payable' && invoices.has(row.value.invoice)).map(row => [row.kind,row.id,row.revision]).sort()));
}
export function adoptionAmendments(s: State, a: Actor, op: string, input: Data): Data | undefined {
    if (!['propose-order-cancellation','propose-adopted-cancellation','replace-adopted-remainder'].includes(op)) return;
    if (op !== 'propose-order-cancellation') can(s, a, 'owner');
    const order = get(s, 'order', input.id), adoption = orderAdoption(s, order), source = get(s, 'request', order.request);
    if (op === 'propose-order-cancellation') {
        requirePermission(s, a, 'po.issue', order); requirePermission(s, a, 'request.edit', source);
        requireThat(!order.imported && !order.adoption && order.status === 'issued' && source.status === 'approved'
            && !order.supplierGroup && !order.recurring && !order.recurringSeries && !order.poDetails?.blanket
            && (!order.purchaseType || order.purchaseType === 'goods') && order.lines.every((line: Data) => !line.service && (!line.supplier || line.supplier === order.supplier))
            && input.revision === order.revision && source.revision === order.revision, 'Choose the exact current native ordinary-goods order for cancellation', 409);
        currentDecision(s, source);
    } else requireThat(adoption && currentOperationalOrder(s, order) && ['adopted','issued'].includes(order.status) && input.revision === order.revision && source.revision === order.revision, 'Choose the current adopted purchase and exact revision', 409);
    const remaining = order.lines.map((line: Data) => ({ line: line.id, q: linePosition(s, order.id, line).outstanding })).filter((line: Data) => line.q > 0);
    requireThat(remaining.length, 'No outstanding supplier quantity remains', 409);
    const reason = text(input.reason, 'Native disposition reason');
    if (op === 'propose-adopted-cancellation' || op === 'propose-order-cancellation') {
        const request = requests(s, a, 'amend', { ...source, id: source.id, revision: source.revision, lines: source.lines, reason })!;
        const cancellation = { order: order.id, number: order.number, lines: remaining, reason, actor: a.id, at: new Date().toISOString() };
        put(s, 'request', request.id, { ...request, cancellation });
        put(s, 'revision', request.id + ':' + request.revision, { ...request, id: request.id + ':' + request.revision, request: request.id, cancellation });
        audit(s, a, op, order.id, { request: request.id, revision: request.revision, reason, lines: remaining });
        return get(s, 'request', request.id);
    }
    requireThat(input.reviewedDisposition === true, 'Review old supplier invoices, received liabilities and unapplied deposits before replacing the remainder', 409);
    requireThat(Array.isArray(input.lines) && input.lines.length === remaining.length && input.lines.every((line: Data, index: number) => line.sourceLine === remaining[index].line), 'Map each remaining source line in source order');
    const request = requests(s, a, 'request', { ...input, id: undefined, lines: input.lines.map((line: Data, index: number) => { const { sourceLine, id, ...values } = line; return { ...values, quantity: qty(remaining[index].q) }; }) })!;
    const adoptedDisposition = { order: order.id, request: order.request, adoption: adoption!.id, number: order.number, fingerprint: sourcePosition(s, order), lines: remaining, reason, actor: a.id, at: new Date().toISOString(), basis: 'Old received goods, invoices and prepaid credits stay with the original supplier and currency; only unreceived supply moves' };
    put(s, 'request', request.id, { ...request, adoptedDisposition });
    put(s, 'revision', request.id + ':1', { ...request, id: request.id + ':1', request: request.id, adoptedDisposition });
    audit(s, a, op, order.id, { request: request.id, revision: 1, reason, lines: remaining });
    return get(s, 'request', request.id);
}

export function checkAdoptedDisposition(s: State, request: Data) {
    if (!request.adoptedDisposition) return;
    const disposition = request.adoptedDisposition, source = get(s, 'order', disposition.order);
    requireThat(currentOperationalOrder(s, source) && ['adopted','issued'].includes(source.status) && disposition.fingerprint === sourcePosition(s, source), 'Original supplier balances changed; create and approve a fresh disposition', 409);
    requireThat(request.lines.length === disposition.lines.length && request.lines.every((line: Data, index: number) => line.q === disposition.lines[index].q), 'Replacement quantities must equal the approved original remainder', 409);
}

/** Invoked only after ordinary current non-self approval and PO issuance checks. */
export function settleAdoptedDisposition(s: State, a: Actor, request: Data, issued: Data) {
    if (!request.cancellation && !request.adoptedDisposition) return;
    const proposal = request.cancellation ?? request.adoptedDisposition, source = get(s, 'order', proposal.order), approval = currentDecision(s, request);
    requirePermission(s, a, 'po.issue', source);
    requireThat(approval.owner || allowed(s, { id:approval.actor, email:approval.email, owner:false, dev:false, session:'', version:approval.operatorVersion }, 'request.approve', source), 'Native approver must also cover the original supplier disposition scope', 409);
    const target = request.cancellation ? issued : source;
    for (const balance of proposal.lines) {
        const line = target.lines.find((line: Data) => line.id === balance.line);
        requireThat(line && linePosition(s, target.id, line).outstanding === balance.q, 'Approved cancellation balance changed; renew native approval', 409);
        const id = uid(); put(s, 'receipt', id, { id, order: target.id, line: line.id, event: 'cancel', q: balance.q, quantity: qty(balance.q), reason: proposal.reason, actor: a.id, at: new Date().toISOString(), approvedDisposition: { request: request.id, revision: request.revision, decision: approval.id } });
    }
    const current = get(s, 'order', target.id);
    put(s, 'order', target.id, { ...current, status: 'cancelled', cancelledByApproval: { request: request.id, revision: request.revision, decision: approval.id }, supplierCancellation: 'Not sent; native approval recorded' });
    const oldRequest = get(s, 'request', target.request), balance = commitment(s, oldRequest);
    if (balance) ledger(s, a, oldRequest, -balance, 'approved-adopted-cancellation');
    audit(s, a, 'approved-adopted-cancellation', target.id, { request: request.id, revision: request.revision, decision: approval.id, reason: proposal.reason, sourceOrder: source.id, supplierMessage: 'not-sent' });
}
