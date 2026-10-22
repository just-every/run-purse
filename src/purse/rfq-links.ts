import { type Bindings } from '../auth.server';
import { authority, load } from './store';
import { all, get, requireThat, uid, type Actor, type Data } from './types';
import { requirePermission } from './access';
import { sendRfqMail } from './rfq-mail';
export const hashRfqToken = async (token: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(b => b.toString(16).padStart(2, '0')).join('');
export const liveRfqLink = `SELECT l.rfq,l.supplier,l.expires_at,l.generation FROM p_rfq_links l JOIN p_records r ON r.business='main' AND r.kind='rfq' AND r.id=l.rfq WHERE l.hash=? AND l.revoked_at IS NULL AND json_extract(r.value,'$.closedAt') IS NULL AND l.expires_at>? AND json_extract(r.value,'$.deadline')=strftime('%Y-%m-%dT%H:%M:%fZ',l.expires_at/1000.0,'unixepoch')`;
export function insertRfqRecord(db: D1Database, kind: string, value: Data) { return db.prepare("INSERT INTO p_records(business,kind,id,revision,value) VALUES('main',?,?,?,?)").bind(kind, value.id, uid(), JSON.stringify(value)); }

export async function issueRfqLink(env: Bindings, a: Actor, rfqId: string, supplierId: string, reissue: boolean, now = Date.now()) {
    const { state, revision } = await load(env.DB); requirePermission(state, a, 'rfq.manage');
    const rfq = get(state, 'rfq', rfqId), target = rfq.suppliers.find((s: Data) => s.id === supplierId);
    requirePermission(state, a, 'rfq.manage', get(state, 'request', rfq.request));
    requireThat(target, 'Supplier is outside this RFQ', 404);
    requireThat(!target.contactErased,'Nominated contact was erased; create a new RFQ with a current contact',409);
    const deadline = Date.parse(rfq.deadline); requireThat(!rfq.closedAt && now < deadline && deadline <= now + 30 * 86400000, 'RFQ deadline has passed', 410);
    const previous = await env.DB.prepare('SELECT MAX(generation) AS generation FROM p_rfq_links WHERE rfq=? AND supplier=?').bind(rfq.id, supplierId).first<{generation: number | null}>();
    requireThat(reissue || !all(state, 'rfqMailEvent').some(e => e.rfq === rfq.id && e.supplier === supplierId && ['invitation', 'reissue'].includes(e.type)), 'Invitation already attempted; explicitly reissue a new link', 409);
    const generation = (previous?.generation ?? 0) + 1, token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), hash = await hashRfqToken(token);
    const event = { id: uid(), rfq: rfq.id, supplier: supplierId, generation, type: reissue ? 'reissue' : 'invitation', status: 'uncertain', actor: a.id, at: new Date(now).toISOString() };
    const auth = authority(a);
    try { await env.DB.batch([
        env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(...auth.params, revision),
        env.DB.prepare('UPDATE p_rfq_links SET revoked_at=? WHERE rfq=? AND supplier=? AND revoked_at IS NULL').bind(now, rfq.id, supplierId),
        env.DB.prepare('INSERT INTO p_rfq_links(hash,rfq,supplier,expires_at,revoked_at,generation) VALUES(?,?,?,?,NULL,?)').bind(hash, rfq.id, supplierId, deadline, generation),
        insertRfqRecord(env.DB, 'rfqMailEvent', event), insertRfqRecord(env.DB,'audit',{id:uid(),actor:a.id,email:a.email,action:reissue?'rfq-link-reissue':'rfq-invitation',record:rfq.request,rfq:rfq.id,supplier:supplierId,generation,mailEvent:event.id,at:event.at}), env.DB.prepare('DELETE FROM p_guard'),
    ]); } catch (error) { requireThat(!/CHECK constraint|UNIQUE constraint/.test(String(error)), 'RFQ or authority changed; reload', 409); throw error; }
    const url = new URL(`/api/purse/rfq-link/${token}`, env.AUTH_ORIGIN).href;
    const outcome = await sendRfqMail(env, rfq, target, event, url);
    return { event: outcome, url, expiresAt: rfq.deadline };
}
