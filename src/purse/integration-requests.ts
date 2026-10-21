import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { readStream } from '../inbound-mail.server.mjs';
import { activeIntakeRequester } from './email-intake';
import { guardedBatch } from './integration-tokens';
import { hashRfqToken, insertRfqRecord } from './rfq-links';
import { requests } from './requests';
import { load } from './store';
import { Fault, put, requirePermission, requireThat, uid, type Actor, type Data } from './types';

export const integrationRequestsApi = new Hono<{ Bindings: Bindings }>();
integrationRequestsApi.post('/api/purse/integration/requests', async c => {
    // No native cookie, URL token, agent action or client identity is a grant at this door.
    const env = runtimeBindings(c.env);
    requireThat(new URL(c.req.url).origin === env.AUTH_ORIGIN, 'Invalid host', 403);
    requireThat(!c.req.header('origin') || c.req.header('origin') === env.AUTH_ORIGIN, 'Invalid origin', 403);
    requireThat(c.req.header('sec-fetch-site') !== 'cross-site', 'Invalid origin', 403);
    const bearer = c.req.header('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    requireThat(bearer, 'Integration bearer required', 401);
    const hash = await hashRfqToken(bearer);
    const token = await c.env.DB.prepare('SELECT * FROM p_integration_tokens WHERE hash=? AND revoked_at IS NULL').bind(hash).first<Data>();
    requireThat(token, 'Integration bearer unavailable', 401);
    const { state, revision } = await load(c.env.DB), before = structuredClone(state);
    const requester = await activeIntakeRequester(c.env.DB, state, token.requester_email);
    requireThat(requester && requester.id === token.requester, 'Bound requester is no longer active', 403);
    const key = c.req.header('idempotency-key'); requireThat(key && /^[\x21-\x7e]{1,200}$/.test(key), 'Idempotency-Key required (1–200 visible ASCII characters)');
    const raw = await readStream(c.req.raw.body, 1_600_000);
    let source: string; try { source = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { throw new Fault(400, 'Invalid request UTF-8'); }
    const bodyHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw as BufferSource))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const previous = async () => c.env.DB.prepare('SELECT body_hash,response FROM p_integration_requests WHERE integration=? AND idempotency_key=?').bind(token.id, key).first<Data>();
    const requestFence = (current: {id:string;version:number}, currentRevision: number) => c.env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM p_integration_tokens WHERE id=? AND hash=? AND revoked_at IS NULL) AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(token.id, hash, current.id, current.version, currentRevision);
    const replay = async (receipt: Data) => {
        requireThat(receipt.body_hash === bodyHash, 'Idempotency-Key already used with a different body', 409);
        // Replays return the immutable creation response, under CURRENT native
        // identity and one complete current grant covering that response.
        const fresh = await load(c.env.DB), current = await activeIntakeRequester(c.env.DB, fresh.state, token.requester_email);
        requireThat(current && current.id === token.requester, 'Bound requester is no longer active', 403);
        const response = JSON.parse(receipt.response), principal: Actor = { id:current.id, email:current.email, version:current.version, owner:current.role==='owner', session:'', dev:false };
        requirePermission(fresh.state, principal, 'request.create', response);
        await guardedBatch(c.env.DB, [requestFence(current, fresh.revision), c.env.DB.prepare('DELETE FROM p_guard')]);
        return c.json({request:response, duplicate:true});
    };
    const existing = await previous();
    if (existing) return replay(existing);
    const fence = requestFence(requester, revision);
    let body: Data; try { body = JSON.parse(source); } catch { throw new Fault(400, 'Invalid request JSON'); }
    requireThat(body && typeof body === 'object' && !Array.isArray(body) && !body.id, 'Supply fields for a new purchase request');
    const a: Actor = { id: requester.id, email: requester.email, version: requester.version, owner: requester.role === 'owner', session: '', dev: false };
    const draft = requests(state, a, 'request', body)!;
    const request: Data = { ...draft, integration: { id: token.id, name: token.name, requester: requester.id, requesterEmail: requester.email } };
    requirePermission(state, a, 'request.create', request);
    put(state, 'request', request.id, request); put(state, 'revision', `${request.id}:${request.revision}`, { ...request, request: request.id });
    const queries = [fence];
    for (const [key, row] of state) if (before.get(key)?.revision !== row.revision) queries.push(insertRfqRecord(c.env.DB, row.kind, row.value));
    queries.push(c.env.DB.prepare('INSERT INTO p_integration_requests(integration,idempotency_key,body_hash,response) VALUES(?,?,?,?)').bind(token.id, key, bodyHash, JSON.stringify(request)),
        insertRfqRecord(c.env.DB, 'audit', { id: uid(), actor: `integration:${token.id}`, action: 'integration-request-create', record: request.id, integration: token.id, requester: requester.id, at: new Date().toISOString() }), c.env.DB.prepare('DELETE FROM p_guard'));
    try { await guardedBatch(c.env.DB, queries); }
    catch (error) { const receipt = await previous(); if (receipt) return replay(receipt); throw error; }
    return c.json({ request, duplicate: false });
});
