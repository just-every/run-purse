import type { Bindings } from '../auth.server';
import { activeIntakeRequester } from './email-intake';
import { hashRfqToken, insertRfqRecord } from './rfq-links';
import { actor, authority, load, readFence } from './store';
import { all, allowed, Fault, requireThat, text, uid, type Data } from './types';
import { Hono } from 'hono';

export const integrationTokensApi = new Hono<{ Bindings: Bindings }>();
export const tokenScope = 'create-purchase-requests';
export const poReadScope = 'read-purchase-orders';
export function integrationMetadata(row: Data) {
    return { id: row.id, name: row.name, requesterEmail: row.requester_email, scope: row.scope ?? tokenScope, suppliers: JSON.parse(row.suppliers ?? '[]'), expiresAt: row.expires_at ?? null, generation: row.generation, createdAt: row.created_at, rotatedAt: row.rotated_at, revokedAt: row.revoked_at };
}
function secret() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export async function guardedBatch(db: D1Database, queries: D1PreparedStatement[]) {
    try { await db.batch(queries); }
    catch (error) {
        if (/CHECK constraint|UNIQUE constraint/.test(String(error))) throw new Fault(409, 'State or authority changed; reload');
        throw error;
    }
}
integrationTokensApi.get('/api/purse/integration-tokens', async c => {
    const a = await actor(c.req.raw, c.env); requireThat(a.owner, 'Owner capability required', 403);
    const { state, revision } = await load(c.env.DB);
    const members = await c.env.DB.prepare("SELECT id,email,display_name,version,role FROM oa_operators WHERE status='active'").all<Data>();
    const requesters = members.results.filter(m => allowed(state, {id:m.id,email:m.email,version:m.version,owner:m.role==='owner',dev:false,session:''}, 'request.create')).map(m => ({ id: m.id, email: m.email, name: m.display_name }));
    const result = await c.env.DB.prepare('SELECT * FROM p_integration_tokens ORDER BY created_at DESC,id').all<Data>();
    await readFence(c.env.DB, a, revision);
    return c.json({ tokens: result.results.map(integrationMetadata), requesters, suppliers: all(state, 'supplier').map(s => ({id:s.id,name:s.name})) });
});
integrationTokensApi.post('/api/purse/integration-tokens', async c => {
    const a = await actor(c.req.raw, c.env); requireThat(a.owner, 'Owner capability required', 403);
    const { state, revision } = await load(c.env.DB), b = await c.req.json();
    const scope = b.scope ?? tokenScope;
    requireThat([tokenScope, poReadScope].includes(scope), 'Unknown integration scope');
    requireThat(scope !== poReadScope || Array.isArray(b.suppliers), 'Map one or more existing suppliers');
    const suppliers = scope === poReadScope ? [...new Set(b.suppliers as unknown[])] : [];
    requireThat(scope !== poReadScope || (suppliers.length > 0 && suppliers.length <= 100 && suppliers.every(id => typeof id === 'string' && state.has('supplier:' + id))), 'Map one or more existing suppliers');
    const days = b.expiresDays === undefined ? 7 : Number(b.expiresDays);
    requireThat(scope !== poReadScope || Number.isInteger(days) && days >= 1 && days <= 30, 'Expiry must be 1–30 days');
    const requester = scope === poReadScope ? {id:a.id,email:a.email,version:a.version} : await activeIntakeRequester(c.env.DB, state, text(b.requesterEmail, 'Requester email', 254));
    requireThat(requester, 'Bind to one active native requester', 409);
    const token = secret(), hash = await hashRfqToken(token), at = new Date().toISOString();
    const row = { id: uid(), name: text(b.name, 'Integration name', 100), requester: requester.id, requester_email: requester.email, generation: 1, created_at: at, rotated_at: null, revoked_at: null, scope, suppliers: JSON.stringify(suppliers), expires_at: scope === poReadScope ? new Date(Date.now() + days * 86400000).toISOString() : null };
    const auth = authority(a, true);
    await guardedBatch(c.env.DB, [
        c.env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END`).bind(...auth.params, revision, requester.id, requester.version),
        c.env.DB.prepare('INSERT INTO p_integration_tokens(id,hash,name,requester,requester_email,created_at,scope,suppliers,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(row.id, hash, row.name, row.requester, row.requester_email, at, scope, row.suppliers, row.expires_at),
        insertRfqRecord(c.env.DB, 'audit', { id: uid(), actor: a.id, email: a.email, action: 'integration-token-create', record: row.id, name: row.name, requester: row.requester, requesterEmail: row.requester_email, scope, suppliers, expiresAt: row.expires_at, at }),
        c.env.DB.prepare('DELETE FROM p_guard'),
    ]);
    return c.json({ token, integration: integrationMetadata(row) });
});
integrationTokensApi.post('/api/purse/integration-tokens/:id/:action', async c => {
    const a = await actor(c.req.raw, c.env); requireThat(a.owner, 'Owner capability required', 403);
    const action = c.req.param('action'); requireThat(['rotate', 'revoke', 'delete'].includes(action), 'Unknown token action', 404);
    const row = await c.env.DB.prepare('SELECT * FROM p_integration_tokens WHERE id=?').bind(c.req.param('id')).first<Data>();
    requireThat(row && (action === 'delete' || !row.revoked_at), 'Integration is unavailable', 409);
    const token = action === 'rotate' ? secret() : undefined, at = new Date().toISOString(), auth = authority(a, true);
    const next: Data = { ...row, ...(token ? { generation: row.generation + 1, rotated_at: at } : action === 'revoke' ? { revoked_at: at } : {}) };
    // Remove replay authority with the credential, retaining purchasing lineage and audit history.
    const mutation = action === 'delete' ? [
        c.env.DB.prepare('DELETE FROM p_integration_requests WHERE integration=?').bind(row.id),
        c.env.DB.prepare('DELETE FROM p_integration_tokens WHERE id=?').bind(row.id),
    ] : [token
        ? c.env.DB.prepare('UPDATE p_integration_tokens SET hash=?,generation=?,rotated_at=? WHERE id=?').bind(await hashRfqToken(token), next.generation, at, row.id)
        : c.env.DB.prepare('UPDATE p_integration_tokens SET revoked_at=? WHERE id=?').bind(at, row.id)];
    await guardedBatch(c.env.DB, [
        c.env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND EXISTS(SELECT 1 FROM p_integration_tokens WHERE id=? AND generation=? AND revoked_at IS ?) THEN 1 ELSE 0 END`).bind(...auth.params, row.id, row.generation, row.revoked_at),
        ...mutation,
        insertRfqRecord(c.env.DB, 'audit', { id: uid(), actor: a.id, email: a.email, action: 'integration-token-' + action, record: row.id, generation: next.generation, at }),
        c.env.DB.prepare('DELETE FROM p_guard'),
    ]);
    return c.json({ ...(token ? { token } : {}), ...(action === 'delete' ? { deleted: true } : {}), integration: integrationMetadata(next) });
});
