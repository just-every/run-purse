import { Hono, type Context } from 'hono';
import { travelerReferences } from './travel-reference';
import { travelOwnerFence, travelReleasePolicy } from './travel-release';
import type { Bindings } from '../auth.server';
import { actor, load, readFence, save } from './store';
import { travelCommands, visibleTravel } from './travel';
import { travelExpenses } from './travel-expenses';
import { travelPerDiem } from './travel-rates';
import { requirePermission, requireThat } from './types';

export const travelApi = new Hono<{ Bindings: Bindings }>();
travelApi.get('/api/purse/travel/references', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB);
    const travelReference = travelerReferences(state, a);
    await readFence(c.env.DB, a, revision); return c.json({ travelReference });
});
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
async function mutation(c: Context<{ Bindings: Bindings }>, operation: string) {
    requireThat(['request', 'amend', 'submit', 'decision', 'expense-return', 'release-policy'].includes(operation), 'Unknown travel action', 404);
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB), before = structuredClone(state);
    requireThat(Number(c.req.header('content-length') ?? 0) <= 1600000, 'Request too large', 413);
    const input = await c.req.json();
    const result = operation === 'release-policy' ? travelReleasePolicy(state, a, input) : travelCommands(state, a, 'travel-' + operation, input) ?? await travelExpenses(state, a, 'travel-' + operation, input);
    requireThat(result, 'Unknown travel action', 404);
    await save(c.env.DB, a, before, state, revision, ['release-policy', 'expense-return'].includes(operation) ? travelOwnerFence(c.env.DB, a) : undefined); return c.json(result);
}
// These exact routes precede the shared generic command transport. Owner writes
// must always retain the native-owner/version guard, including UI submissions.
travelApi.post('/api/purse/command/travel-release-policy', c => mutation(c, 'release-policy'));
travelApi.post('/api/purse/command/travel-expense-return', c => mutation(c, 'expense-return'));
travelApi.post('/api/purse/travel/:operation', c => mutation(c, c.req.param('operation')));
