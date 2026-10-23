import type { Bindings } from '../auth.server';
import { currentDecision } from './approval';
import { allowed, date, extended, get, qty, quantity, requirePermission, requireThat, text, uid, put, type Actor, type Data, type State } from './types';
import { load, save } from './store';
import { moneyInput } from './money';
import { requests } from './requests';
import { insertOrderSendRecord, liveOrderLink, orderSendSummary } from './order-send';

/** The capability's creator must still hold current native purchasing authority. */
export async function currentOrderSender(env: Bindings, state: State, event: Data) {
    const principal = await env.DB.prepare("SELECT id,email,version,role FROM oa_operators WHERE id=? AND version=? AND status='active'").bind(event.actor, event.operatorVersion).first<{ id: string; email: string; version: number; role: string }>();
    if (!principal) return false;
    const actor: Actor = { id: principal.id, email: principal.email, version: principal.version, owner: principal.role === 'owner', session: '', dev: false };
    const order = get(state, 'order', event.order), request = get(state, 'request', event.request);
    try {
        const decision = currentDecision(state, request);
        for (const proof of decision.chainProofs ?? [{ actor: decision.actor, version: decision.operatorVersion }]) if (!await env.DB.prepare("SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active'").bind(proof.actor, proof.version).first()) return false;
    } catch { return false; }
    return allowed(state, actor, 'po.issue', order) && allowed(state, actor, 'po.issue', request);
}

export function normalizeOrderResponse(body: Data, order: Data, event: Data) {
    requireThat(body && typeof body === 'object' && !Array.isArray(body), 'Supplier response object required');
    requireThat(['accept', 'change', 'reject'].includes(body.decision), 'Choose accept, accept with changes, or reject');
    requireThat(body.consent === true && body.revision === event.revision, 'Explicit response to this exact approved revision is required', 409);
    requireThat(Number.isSafeInteger(body.version) && body.version === (event.response?.version ?? 0), 'Supplier response changed; reload', 409);
    const promisedDate = body.decision === 'reject' && !body.promisedDate ? null : date(body.promisedDate, 'Promised delivery date');
    requireThat(body.lines === undefined || Array.isArray(body.lines) && body.lines.length <= order.lines.length, 'Use only this purchase order’s lines');
    const seen = new Set<string>();
    const lines = (body.lines ?? []).map((input: Data) => {
        const line = order.lines.find((line: Data) => line.id === input.line);
        requireThat(line && !seen.has(line.id), 'Response line is duplicated or outside this exact order', 409); seen.add(line.id);
        const q = quantity(input.quantity), unitMinor = moneyInput(input, 'unitAmount', 'unitMinor', 'Proposed unit price');
        extended(q, unitMinor);
        return { line: line.id, description: line.description, quantity: qty(q), q, unitMinor, originalQuantity: line.quantity, originalQ: line.q, originalUnitMinor: line.unitMinor };
    }).filter((line: Data) => line.q !== line.originalQ || line.unitMinor !== line.originalUnitMinor);
    requireThat(body.decision === 'change' || lines.length === 0, 'Choose accept with changes to propose quantities or prices', 409);
    requireThat(body.decision !== 'reject' || !promisedDate, 'A rejected order has no delivery promise');
    return { decision: body.decision, promisedDate, lines, name: text(body.name, 'Your name', 200), note: body.note ? text(body.note, 'Response note', 2000) : null };
}

/** Supplier input is evidence. Only the authenticated adoption door can create a draft. */
export async function recordOrderResponse(env: Bindings, state: State, revision: number, event: Data, hash: string, body: Data) {
    const order = get(state, 'order', event.order), normalized = normalizeOrderResponse(body, order, event), at = new Date().toISOString();
    const version = (event.response?.version ?? 0) + 1;
    const response: Data = { id: event.id + ':' + version, send: event.id, order: event.order, request: event.request, revision: event.revision, pdfSha256: event.pdf.sha256, version, ...normalized, actor: 'supplier-link', identityVerified: false, at };
    const acknowledgment = event.acknowledgment ?? { id: event.id, send: event.id, order: event.order, request: event.request, revision: event.revision, changeLabel: event.changeLabel, pdfSha256: event.pdf.sha256, name: response.name, actor: 'supplier-link', identityVerified: false, at };
    const decision = currentDecision(state, get(state, 'request', event.request));
    const proofs = decision.chainProofs ?? [{ actor: decision.actor, version: decision.operatorVersion }];
    const previous = state.get('supplierOrderEvidence:' + event.order)?.value;
    const entry = { version: (previous?.version ?? 0) + 1, promisedDate: response.promisedDate, acknowledgedAt: at, source: 'Supplier response ' + response.id + ' · approved revision ' + event.revision + ' · stated identity unverified', response: response.id, revision: event.revision, actor: 'supplier-link', at };
    const evidence = { id: order.id, order: order.id, supplier: order.supplier, ...entry, history: [...(previous?.history ?? []), entry] };
    try { await env.DB.batch([
        env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN EXISTS(${liveOrderLink}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(hash, Date.now(), revision),
        env.DB.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(event.actor, event.operatorVersion),
        ...proofs.map((proof: Data) => env.DB.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(proof.actor, proof.version)),
        insertOrderSendRecord(env.DB, 'orderSupplierResponse', response),
        ...(!event.acknowledgment ? [insertOrderSendRecord(env.DB, 'orderAcknowledgment', acknowledgment), insertOrderSendRecord(env.DB, 'audit', { id: uid(), action: 'order-acknowledged', record: event.order, send: event.id, actor: 'supplier-link', name: acknowledgment.name, identityVerified: false, revision: event.revision, pdfSha256: event.pdf.sha256, at })] : []),
        ...(response.promisedDate ? [env.DB.prepare("INSERT INTO p_records(business,kind,id,revision,value) VALUES('main','supplierOrderEvidence',?,?,?) ON CONFLICT(business,kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value").bind(order.id, uid(), JSON.stringify(evidence))] : []),
        env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.response',json(?),'$.acknowledgment',json(?)) WHERE business='main' AND kind='orderSend' AND id=?").bind(uid(), JSON.stringify(response), JSON.stringify(acknowledgment), event.id),
        insertOrderSendRecord(env.DB, 'audit', { id: uid(), action: 'order-supplier-response', record: event.order, send: event.id, response: response.id, decision: response.decision, promisedDate: response.promisedDate, actor: 'supplier-link', name: response.name, identityVerified: false, revision: event.revision, pdfSha256: event.pdf.sha256, at }),
        env.DB.prepare('DELETE FROM p_guard'),
    ]); } catch (error) { requireThat(!/CHECK constraint|UNIQUE constraint/.test(String(error)), 'Order, authority, link or response changed; reload', 409); throw error; }
    return response;
}

export async function adoptOrderResponse(env: Bindings, actor: Actor, orderId: string, body: Data) {
    const { state, revision } = await load(env.DB), before = new Map(state), order = get(state, 'order', orderId), request = get(state, 'request', order.request);
    requirePermission(state, actor, 'po.issue', order); requirePermission(state, actor, 'request.edit', request);
    const event = get(state, 'orderSend', 'order-send:' + order.id), response = event.response;
    requireThat(!event.erasure && !event.revokedAt && Date.parse(event.expiresAt) > Date.now() && order.status === 'issued' && !order.imported && !order.adoption && request.status === 'approved' && request.revision === order.revision && body.revision === order.revision, 'Current native exact approved purchase and live response required', 409);
    currentDecision(state, request);
    requireThat(body.consent === true && response && response.decision === 'change' && body.response === response.id && !event.responseAdoptions?.some((entry: Data) => entry.response === response.id), 'Choose the exact unadopted supplier change proposal', 409);
    requireThat(body.adoptDeliveryDate === undefined || typeof body.adoptDeliveryDate === 'boolean', 'Delivery-date adoption must be explicit');
    requireThat(response.lines.length || body.adoptDeliveryDate === true && response.promisedDate !== request.needDate, 'Choose a proposed price, quantity or delivery-date change for the amendment', 409);
    const reason = text(body.reason, 'Amendment reason');
    const lines = order.lines.map((line: Data) => {
        const proposed = response.lines.find((input: Data) => input.line === line.id);
        return { ...line, ...(proposed ? { quantity: proposed.quantity, unitMinor: proposed.unitMinor } : {}) };
    });
    const draft = requests(state, actor, 'amend', { ...request, lines, reason, needDate: body.adoptDeliveryDate === true ? response.promisedDate : request.needDate });
    requireThat(draft, 'Amendment draft was not created', 409);
    const adoption = { response: response.id, request: draft.id, revision: draft.revision, actor: actor.id, email: actor.email, reason, at: new Date().toISOString() };
    put(state, 'orderSend', event.id, { ...event, responseAdoptions: [...(event.responseAdoptions ?? []), adoption] });
    put(state, 'audit', uid(), { action: 'order-response-adopted', record: order.id, send: event.id, response: response.id, request: draft.id, revision: order.revision, amendmentRevision: draft.revision, actor: actor.id, email: actor.email, reason, at: adoption.at });
    await save(env.DB, actor, before, state, revision);
    return { draft, adoption, event: orderSendSummary(get(state, 'orderSend', event.id)) };
}
