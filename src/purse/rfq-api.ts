import { rfqOriginalBytes } from './rfq-originals';
import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { actor, load, readFence } from './store';
import { get, requireThat } from './types';
import { requirePermission } from './access';
import { issueRfqLink } from './rfq-links';
import { supplierRfq } from './rfq-public';
export { runRfqReminders } from './rfq-mail';
export const rfqApi = new Hono<{ Bindings: Bindings }>();
rfqApi.all('/api/purse/rfq-link/:token', c => supplierRfq(c.req.raw, runtimeBindings(c.env), c.req.param('token')));
for (const operation of ['send', 'reissue']) rfqApi.post('/api/purse/rfq/' + operation, async c => {
    const a = await actor(c.req.raw, c.env), body = await c.req.json();
    return c.json(await issueRfqLink(runtimeBindings(c.env), a, body.rfq, body.supplier, operation === 'reissue'));
});
rfqApi.get('/api/purse/rfq-original/:response/:file', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB); requirePermission(state, a, 'rfq.read');
    const response = get(state, 'rfqResponse', c.req.param('response')), rfq = get(state, 'rfq', response.rfq);
    requirePermission(state, a, 'rfq.read', get(state, 'request', rfq.request));
    const file = response.files.find((f: any) => f.id === c.req.param('file'));
    requireThat(file, 'Original file not found', 404);
    requireThat(!file.erasure, 'Original removed by personal-data erasure; financial lineage retained', 410);
    const bytes = await rfqOriginalBytes(runtimeBindings(c.env), file); await readFence(c.env.DB, a, revision);
    return new Response(bytes, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
});
