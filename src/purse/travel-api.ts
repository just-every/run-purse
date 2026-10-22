import { Hono } from 'hono';
import type { Bindings } from '../auth.server';
import { actor, load, readFence, save } from './store';
import { travelCommands, visibleTravel } from './travel';
import { travelExpenses } from './travel-expenses';
import { travelPerDiem } from './travel-rates';
import { requirePermission, requireThat } from './types';

export const travelApi = new Hono<{ Bindings: Bindings }>();
travelApi.get('/api/purse/travel', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB);
    requirePermission(state, a, 'request.read');
    const visible = visibleTravel(state, a);
    // The ordinary state projection supplies request permissions and chains;
    // this endpoint is deliberately limited to report provenance.
    await readFence(c.env.DB, a, revision);
    return c.json(visible);
});
travelApi.post('/api/purse/travel/per-diem', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB);
    requirePermission(state, a, 'request.create');
    const input = await c.req.json(), result = travelPerDiem(input.destination ?? {}, input.departureDate, input.returnDate);
    await readFence(c.env.DB, a, revision); return c.json(result);
});
travelApi.post('/api/purse/travel/:operation', async c => {
    const operation = c.req.param('operation');
    requireThat(['request', 'amend', 'submit', 'decision', 'expense-return'].includes(operation), 'Unknown travel action', 404);
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB), before = structuredClone(state);
    requireThat(Number(c.req.header('content-length') ?? 0) <= 1600000, 'Request too large', 413);
    const input = await c.req.json();
    const result = travelCommands(state, a, 'travel-' + operation, input) ?? await travelExpenses(state, a, 'travel-' + operation, input);
    requireThat(result, 'Unknown travel action', 404);
    await save(c.env.DB, a, before, state, revision); return c.json(result);
});
