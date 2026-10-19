import { deploymentHealth } from '../base/deployment-health';
import { Hono } from 'hono';
import { operatorAuth, runtimeBindings, type Bindings } from '../auth.server';
import { administration } from './admin';
import { catalogueGrants } from './catalogue-access';
import { catalogue } from './catalogue';
import { catalogueRequests } from './catalogue-requests';
import { suppliers } from './suppliers';
import { supplierPerformance } from './supplier-performance';
import { requests } from './requests';
import { orders } from './orders';
import { stockroom } from './stockroom';
import { orderClosure } from './order-closure';
import { preparation, actionInput } from './agents';
import { imports } from './imports';
import { importJobs } from './import-custody';
import { actor, load, save, authority, readFence } from './store';
import { accounting, download, visible } from './documents';
import { Fault, can, get, put, requireThat, audit, type State, type Actor, type Data } from './types';
export const api = new Hono<{
    Bindings: Bindings;
}>();
api.get('/health', c => c.json({ status: 'ok', ...deploymentHealth(c.env) }));
api.use('/api/purse/*', async (c, next) => { c.header('cache-control', 'no-store'); c.header('x-content-type-options', 'nosniff'); await next(); });
api.onError((e, c) => c.json({ error: e.message }, e instanceof Fault ? e.status as 400 : 400));
export async function command(s: State, a: Actor, op: string, b: Data): Promise<Data> { if (op === 'execute-action') {
    const p = actionInput(s, a, b);
    const result = await command(s, a, p.action, p.input);
    put(s, 'proposedAction', p.id, { ...p, status: 'executed', executedBy: a.id, at: new Date().toISOString() });
    audit(s, a, op, p.id);
    return result;
} const result = await suppliers(s, a, op, b) ?? supplierPerformance(s, a, op, b) ?? catalogueGrants(s, a, op, b) ?? catalogue(s, a, op, b) ?? administration(s, a, op, b) ?? catalogueRequests(s, a, op, b) ?? requests(s, a, op, b) ?? orders(s, a, op, b) ?? orderClosure(s, a, op, b) ?? stockroom(s, a, op, b) ?? preparation(s, a, op, b); requireThat(result, 'Unknown action', 404); return result; }
api.get('/api/purse/state', async (c) => { const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB); const result = visible(state, a);if(a.owner) result.data.importJobs = await importJobs(c.env.DB, a); await readFence(c.env.DB, a, revision); return c.json(result); });
api.post('/api/purse/command/:op', async (c) => { const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB), before = structuredClone(state); const length = Number(c.req.header('content-length') ?? 0); requireThat(length <= 1600000, 'Request too large', 413); const body = await c.req.json(); const result = await command(state, a, c.req.param('op'), body); await save(c.env.DB, a, before, state, revision); return c.json(result); });
api.post('/api/purse/invite', async (c) => { const a = await actor(c.req.raw, c.env), { state } = await load(c.env.DB); can(state, a, 'owner'); const b = await c.req.json(), m = get(state, 'member', b.email); requireThat(m.active, 'Member is inactive'); return c.json(await operatorAuth(runtimeBindings(c.env)).invite(c.req.raw, { email: m.email, displayName: m.name, role: 'member', returnTo: '/app' })); });
api.post('/api/purse/import/:op', async (c) => { const a = await actor(c.req.raw, c.env), { state } = await load(c.env.DB); return c.json(await imports(c.env.DB, state, a, c.req.param('op'), await c.req.json())); });
api.get('/api/purse/download/:kind/:id', async (c) => { const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB); const result = download(state, a, c.req.param('kind'), c.req.param('id')); await readFence(c.env.DB, a, revision); return result; });
api.get('/api/purse/accounting', async (c) => { const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB); const result = accounting(state, a); await readFence(c.env.DB, a, revision); return result; });
