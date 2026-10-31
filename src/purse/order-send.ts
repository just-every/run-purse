import type { Bindings } from '../auth.server';
import { generationSendConsent } from './po-generation';
import { poGenerationAuthority, poGenerationNativeGuards } from './po-generation-authority';
import { requirePermission } from './access';
import { currentDecision } from './approval';
import { supplier } from './admin';
import { lapsedSupplierDocuments } from './supplier-documents';
import { authority, load } from './store';
import { freezeOrderSend, orderDigest } from './order-send-document';
import { deliverOrderChange } from './order-send-mail';
import { all, get, requireThat, text, uid, type Actor, type Data } from './types';

export const insertOrderSendRecord = (db: D1Database, kind: string, value: Data) => db.prepare("INSERT INTO p_records(business,kind,id,revision,value) VALUES('main',?,?,?,?)").bind(kind, value.id, uid(), JSON.stringify(value));
export const hashOrderToken = (token: string) => orderDigest(new TextEncoder().encode(token));
export const liveOrderLink = `SELECT l.send,l.order_id,l.expires_at FROM p_order_send_links l JOIN p_records e ON e.business='main' AND e.kind='orderSend' AND e.id=l.send JOIN p_records o ON o.business='main' AND o.kind='order' AND o.id=l.order_id JOIN p_records r ON r.business='main' AND r.kind='request' AND r.id=json_extract(o.value,'$.request') WHERE l.hash=? AND l.revoked_at IS NULL AND l.expires_at>? AND json_extract(e.value,'$.status') IN ('accepted','uncertain','suppressed') AND json_extract(e.value,'$.erasure') IS NULL AND (json_extract(o.value,'$.status')='issued' OR (json_extract(o.value,'$.status')='cancelled' AND json_extract(o.value,'$.cancellation') IS NOT NULL)) AND json_extract(r.value,'$.status')='approved' AND json_extract(r.value,'$.revision')=json_extract(o.value,'$.revision') AND EXISTS(SELECT 1 FROM oa_operators sender WHERE sender.id=json_extract(e.value,'$.actor') AND sender.version=json_extract(e.value,'$.operatorVersion') AND sender.status='active' AND (json_extract(e.value,'$.standingConsent') IS NULL OR sender.role='owner'))`;
export function orderSendSummary(event: Data) {
    const { id, order, number, revision, changeLabel, recipient, actor, email, reason, at, expiresAt, status, outcomeAt, acknowledgment, response, responseAdoptions, mode, standingConsent, revokedAt, invoiceSubmission, invoiceConsent, invoiceApprovalRule } = event;
    return { id, order, number, revision, changeLabel, recipient, actor, email, reason, at, expiresAt, status, outcomeAt, acknowledgment, response, responseAdoptions, mode, standingConsent, revokedAt, invoiceSubmission:invoiceSubmission===true, invoiceConsent, invoiceApprovalRule, deliveryVisibility: { mailbox: 'unknown', bounce: 'not-qualified', opened: 'not-tracked' }, pdfSha256: event.pdf?.sha256, erasure: Boolean(event.erasure) };
}
export async function sendOrderChange(env: Bindings, actor: Actor, body: Data, standing?: {policy:string;version:number}) {
    requireThat(body.consent === true, 'Explicit consent to send this exact revision and contact is required');
    const { state, revision } = await load(env.DB), order = get(state, 'order', text(body.order, 'Purchase order', 200)), request = get(state, 'request', order.request);
    requirePermission(state, actor, 'po.issue', order); requirePermission(state, actor, 'po.issue', request);
    const cancellation = Boolean(order.cancellation && order.cancelledByApproval?.request === order.request && order.cancelledByApproval?.revision === order.revision);
    requireThat((order.status === 'issued' || cancellation && order.status === 'cancelled') && order.issuedAt && !order.imported && !order.adoption && request.status === 'approved' && request.revision === order.revision && body.revision === order.revision, 'Exact current issued native approved amendment required', 409);
    let standingProofs: Awaited<ReturnType<typeof poGenerationAuthority>>['proofs']=[];
    if(standing) {
        const policy=get(state,'poGenerationPolicy',standing.policy);
        requireThat(policy.version===standing.version&&policy.actor===actor.id&&policy.operatorVersion===actor.version,'Standing sending authority changed; renew consent',409);
        generationSendConsent(state,request,policy);
        const generated=get(state,'poGenerationEvent',request.id+':'+request.revision);
        requireThat(generated.status==='generated'&&generated.order===order.id&&!order.supplierGroup&&!order.recurring&&order.supplier===request.supplier&&generated.policy===policy.id&&generated.policyVersion===policy.version
            &&order.generation?.event===generated.id&&body.recipient===policy.sendRecipient,'Only the exact standing-consented generated order may send',409);
        standingProofs=(await poGenerationAuthority(env,state,policy,request)).proofs;
    }
    const source = get(state, 'revision', order.request + ':' + order.revision);
    const mode = source.amends || order.cancellation ? 'change' : 'initial';
    requireThat(body.mode === undefined || body.mode === mode, 'Choose this exact initial order or approved change revision', 409);
    const decision = currentDecision(state, request);
    supplier(state, order.supplier);
    requireThat(!lapsedSupplierDocuments(state, order.supplier).length, 'Required supplier document has lapsed', 409);
    const recipient = text(body.recipient, 'Supplier contact email', 254).toLowerCase();
    requireThat(/^[^\s@<>(),:;"\\]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(recipient), 'Use one supplier contact email');
    requireThat(!order.supplierSnapshot?.contactErased && !order.supplierSnapshot?.erasure, 'Supplier contact was erased; renew the purchase with a current contact', 409);
    requireThat(!all(state, 'orderSend').some(event => event.order === order.id), 'This exact order version already has a send attempt. An uncertain outcome must be investigated; it is never automatically retried.', 409);
    // No claim or capability is created when the owner has not configured mail.
    requireThat(env.MAIL_PROVIDER && env.MAIL_FROM, 'Configure the existing RER native mail sender before sending a supplier purchase order', 409);
    const reason = text(body.reason, 'Send reason'), frozen = await freezeOrderSend(state, order), now = Date.now(), id = 'order-send:' + order.id;
    const changeLabel = frozen.content.sections.find(section => /^Change order \d+$/.test(section.heading))?.heading ?? (order.cancellation ? 'Approved cancellation' : 'Purchase order');
    const expires = body.expiresAt == null ? now + 7 * 86400000 : Date.parse(body.expiresAt);
    requireThat(Number.isFinite(expires) && expires > now && expires <= now + 7 * 86400000, 'Supplier link expiry must be in the next seven days');
    const event: Data = { id, mode, operatorVersion: actor.version, owner: actor.owner, order: order.id, request: order.request, supplier: order.supplier, number: order.number, revision: order.revision, changeLabel, recipient, actor: actor.id, email: actor.email, reason, at: new Date(now).toISOString(), expiresAt: new Date(expires).toISOString(), status: 'uncertain', ...(standing?{standingConsent:standing}:{}), ...frozen };
    const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), hash = await hashOrderToken(token), auth = standing
        ? {sql:"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND role='owner')",params:[actor.id,actor.version]}
        : authority(actor);
    const proofs = decision.chainProofs ?? [{ actor: decision.actor, version: decision.operatorVersion }];
    try { await env.DB.batch([
        env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(...auth.params, revision),
        ...poGenerationNativeGuards(env.DB,standingProofs),
        ...proofs.map((proof: Data) => env.DB.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(proof.actor, proof.version)),
        insertOrderSendRecord(env.DB, 'orderSend', event),
        env.DB.prepare('INSERT INTO p_order_send_links(hash,send,order_id,expires_at) VALUES(?,?,?,?)').bind(hash, id, order.id, Date.parse(event.expiresAt)),
        insertOrderSendRecord(env.DB, 'audit', { id: uid(), action: mode === 'initial' ? 'order-send-claimed' : 'order-change-send-claimed', record: order.id, send: id, actor: actor.id, email: actor.email, revision: order.revision, recipient, reason, pdfSha256: event.pdf.sha256, contentSha256: event.contentSha256, ...(standing?{standingConsent:standing}:{}), at: event.at }),
        env.DB.prepare('DELETE FROM p_guard'),
    ]); } catch (error) { requireThat(!/CHECK constraint|UNIQUE constraint/.test(String(error)), 'Order, authority or send claim changed; reload', 409); throw error; }
    const outcome = await deliverOrderChange(env, event, new URL('/api/purse/order-link/' + token, env.AUTH_ORIGIN).href);
    const settled: Data = { ...event, ...outcome, outcomeAt: new Date().toISOString() };
    // Do not overwrite an erasure or any concurrent acknowledgment with our old snapshot.
    await env.DB.batch([
        env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.status',?,'$.delivery',json(?),'$.outcomeAt',?,'$.reasonCode',?) WHERE business='main' AND kind='orderSend' AND id=? AND json_extract(value,'$.erasure') IS NULL").bind(uid(),outcome.status,JSON.stringify(outcome.delivery??null),settled.outcomeAt,'reason' in outcome?outcome.reason:null,id),
        insertOrderSendRecord(env.DB, 'audit', { id: uid(), action: mode === 'initial' ? 'order-send-outcome' : 'order-change-send-outcome', record: order.id, send: id, actor: actor.id, email: actor.email, revision: order.revision, status: settled.status, pdfSha256: event.pdf.sha256, at: settled.outcomeAt }),
    ]);
    return orderSendSummary(settled);
}
