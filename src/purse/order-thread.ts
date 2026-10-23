import type { Bindings } from '../auth.server';
import { operatorMail } from '../mail.server.mjs';
import { currentDecision } from './approval';
import { supplier } from './admin';
import { canonicalSupplier } from './supplier-identity';
import { lapsedSupplierDocuments } from './supplier-documents';
import { authority, load, readFence } from './store';
import { threadAliasHash, threadInsert } from './order-thread-storage';
import { all, allowed, get, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';

const address = /^[^\s@<>(),:;"\\]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
/** Thread visibility is deliberately narrower than general PO visibility. */
export function requireOrderThreadRead(state: State, actor: Actor, order: Data) {
    const request = get(state, 'request', order.request);
    const requester = request.requester === actor.id || request.requesterEmail?.toLowerCase() === actor.email.toLowerCase();
    requireThat(allowed(state, actor, 'procurement.manage', order) || requester && allowed(state, actor, 'po.read', order), 'Buyer or this PO requester required', 403);
}
export function orderThreadMessageSummary(message: Data) {
    const { id, thread, order, request, supplier, number, revision, direction, subject, body, actor, email, recipient, at, status, outcomeAt, reason, provider, providerEmailId, providerSender, senderVerified, messageId, replyExpiresAt, replyRevokedAt, erasure, original, files = [] } = message;
    const metadata = (file: Data) => ({ id: file.id, name: file.name, mediaType: file.mediaType, size: file.size, sha256: file.sha256, erasure: file.erasure });
    return { id, thread, order, request, supplier, number, revision, direction, subject, body, actor, email, recipient, at, status, outcomeAt, reason, provider, providerEmailId, providerSender, senderVerified, messageId, replyExpiresAt, replyRevokedAt, erasure: Boolean(erasure), original: original ? metadata(original) : null, files: files.map(metadata) };
}
/** One projection powers the PO and its requester-visible chase history. */
export function orderThreadMessages(state: State, actor: Actor, order: Data) {
    requireOrderThreadRead(state, actor, order);
    return all(state, 'orderThreadMessage').filter(message => message.order === order.id).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).map(orderThreadMessageSummary);
}
export function orderThreadFollowup(state: State, actor: Actor, order: Data) {
    const messages = orderThreadMessages(state, actor, order);
    return { messages, chases: all(state, 'orderChaseEvent').filter(event => event.order === order.id).map(event => ({ id: event.id, order: event.order, at: event.at, kind: event.kind, sequence: event.sequence, reason: event.reason, actor: event.actor, revision: event.revision, outcome: event.outcome })) };
}
function sendEligibility(state: State, actor: Actor, body: Data) {
    const order = get(state, 'order', text(body.order, 'Purchase order', 200)), request = get(state, 'request', order.request);
    requirePermission(state, actor, 'procurement.manage', order);
    requirePermission(state, actor, 'po.issue', order);
    requireThat(order.status === 'issued' && order.issuedAt && !order.imported && !order.adoption && !order.amendedBy && request.status === 'approved' && request.revision === order.revision && body.revision === order.revision, 'Exact current issued native approved PO required', 409);
    requireThat(!order.supplierSnapshot?.contactErased && !order.supplierSnapshot?.erasure, 'PO supplier contact was erased', 409);
    const currentSupplier = canonicalSupplier(state, order.supplier); supplier(state, currentSupplier);
    requireThat(!lapsedSupplierDocuments(state, currentSupplier).length, 'Required supplier document has lapsed', 409);
    return { order, decision: currentDecision(state, request) };
}
/** Explicit buyer command; a durable idempotency claim precedes the sole provider call. */
export async function sendOrderThreadMessage(env: Bindings, actor: Actor, body: Data) {
    requireThat(body.consent === true, 'Explicit consent to this exact PO, message and supplier contact is required');
    const attempt = text(body.attempt, 'Message attempt', 80);
    requireThat(/^[a-zA-Z0-9_-]{1,80}$/.test(attempt), 'Invalid message attempt');
    const { state, revision } = await load(env.DB), { order, decision } = sendEligibility(state, actor, body);
    const id = `order-thread:${order.id}:${attempt}`;
    requireThat(!state.has('orderThreadMessage:' + id), 'This message attempt is already claimed; inspect its outcome before composing another message', 409);
    const recipient = text(body.recipient, 'Supplier contact email', 254).toLowerCase();
    requireThat(address.test(recipient), 'Use one supplier contact email');
    requireThat(!recipient.endsWith('@erased.invalid'), 'Supplier contact was erased', 409);
    const content = text(body.body, 'Supplier message', 20_000), reason = text(body.reason, 'Send reason');
    // A configured inbound address establishes the receiving domain; never infer it from MAIL_FROM.
    const configured = state.get('emailIntakeConfig:main')?.value.address;
    requireThat(typeof configured === 'string' && address.test(configured) && env.MAIL_PROVIDER === 'resend' && env.MAIL_FROM && env.MAIL_API_KEY && env.EMAIL_INTAKE_WEBHOOK_SECRET, 'Configure Resend sending and the signed email intake receiving domain before supplier messaging', 409);
    const domain = configured.slice(configured.lastIndexOf('@') + 1).toLowerCase();
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map(n => n.toString(16).padStart(2, '0')).join('');
    const replyTo = `po-${token}@${domain}`, hash = await threadAliasHash(replyTo), now = Date.now();
    const event: Data = { id, thread: id, order: order.id, request: order.request, supplier: order.supplier, number: order.number, revision: order.revision, direction: 'outbound', subject: `PO question: ${order.number}`, body: content, recipient, actor: actor.id, email: actor.email, reason, at: new Date(now).toISOString(), status: 'uncertain', files: [], replyExpiresAt: new Date(now + 30 * 86400000).toISOString() };
    const auth = authority(actor), proofs = decision.chainProofs ?? [{ actor: decision.actor, version: decision.operatorVersion }];
    try { await env.DB.batch([
        env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(...auth.params, revision),
        ...proofs.map((proof: Data) => env.DB.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(proof.actor, proof.version)),
        threadInsert(env.DB, 'orderThreadMessage', event),
        env.DB.prepare('INSERT INTO p_order_thread_routes(hash,thread,order_id,expires_at) VALUES(?,?,?,?)').bind(hash, id, order.id, now + 30 * 86400000),
        threadInsert(env.DB, 'audit', { id: uid(), action: 'order-thread-send-claimed', record: order.id, message: id, actor: actor.id, email: actor.email, revision: order.revision, recipient, reason, at: event.at }),
        env.DB.prepare('DELETE FROM p_guard'),
    ]); } catch (error) { requireThat(!/CHECK constraint|UNIQUE constraint/.test(String(error)), 'PO, authority or message claim changed; reload', 409); throw error; }
    let outcome: Data;
    try {
        const fresh = await load(env.DB); sendEligibility(fresh.state, actor, body);
        requireThat(!get(fresh.state, 'orderThreadMessage', id).erasure, 'Message was erased', 409);
        const permission = await env.DB.prepare(`SELECT 1 AS ok WHERE (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=?`).bind(...auth.params, fresh.revision).first();
        requireThat(permission, 'Authority changed', 409);
        const sender = operatorMail(env); requireThat(sender, 'Mail unavailable', 409);
        const message = { deliveryId: id, from: env.MAIL_FROM!, to: [recipient], replyTo, subject: event.subject, text: `${content}\n\nRegarding ${order.number}, issued revision ${order.revision}. Reply to this email to add your response and attachments to this PO. The buyer and requester can read this correspondence. Reply routing expires ${event.replyExpiresAt}.`, html: '', headers: {} };
        const delivery = await sender.send(message);
        outcome = { delivery, status: delivery.status === 'development' ? 'suppressed' : delivery.status };
    } catch { outcome = { status: 'uncertain', outcomeReason: 'provider-outcome-unknown-or-authority-changed' }; }
    const at = new Date().toISOString();
    await env.DB.batch([
        env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.status',?,'$.delivery',json(?),'$.outcomeAt',?,'$.outcomeReason',?) WHERE business='main' AND kind='orderThreadMessage' AND id=? AND json_extract(value,'$.erasure') IS NULL").bind(uid(),outcome.status,JSON.stringify(outcome.delivery??null),at,outcome.outcomeReason??null,id),
        env.DB.prepare("INSERT INTO p_records(business,kind,id,revision,value) SELECT 'main','audit',?,?,json_object('id',?,'action','order-thread-send-outcome','record',json_extract(value,'$.order'),'message',id,'actor',json_extract(value,'$.actor'),'email',json_extract(value,'$.email'),'revision',json_extract(value,'$.revision'),'status',?,'at',?) FROM p_records WHERE business='main' AND kind='orderThreadMessage' AND id=?").bind('outcome:' + id, uid(), 'outcome:' + id, outcome.status, at, id),
    ]);
    // Return current data: an in-flight erasure must not leak the earlier body/contact.
    const latest = await load(env.DB); requireOrderThreadRead(latest.state, actor, get(latest.state, 'order', order.id));
    await readFence(env.DB, actor, latest.revision);
    return orderThreadMessageSummary(get(latest.state, 'orderThreadMessage', id));
}
