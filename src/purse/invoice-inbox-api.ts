import { Hono } from 'hono';
import type { Bindings } from '../auth.server';
import { intakeSha256 } from './email-intake-api';
import { apFileKey, apScope, projectInvoiceInbox } from './invoice-inbox';
import { actor, load, readFence } from './store';
import { get, requireThat, type Data } from './types';
import { requirePermission } from './access';

export const invoiceInboxApi = new Hono<{ Bindings: Bindings }>();
invoiceInboxApi.get('/api/purse/invoice-inbox/:id', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB);
    requirePermission(state, a, 'invoice.read');
    const capture = get(state, 'apInvoiceEmail', c.req.param('id')); apScope(state, a, capture);
    await readFence(c.env.DB, a, revision); return c.json(projectInvoiceInbox(state, a, capture));
});
invoiceInboxApi.get('/api/purse/invoice-inbox/:id/files/:file', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB);
    requirePermission(state, a, 'invoice.read');
    const capture = get(state, 'apInvoiceEmail', c.req.param('id')); apScope(state, a, capture);
    const file = [capture.original, ...capture.files, ...(capture.embedded ?? [])].find((f: Data) => f.id === c.req.param('file'));
    requireThat(file, 'AP email file not found', 404);
    requireThat(!file.erasure, 'Original removed by personal-data erasure; financial lineage retained', 410);
    requireThat(file.key === apFileKey(capture.id, file.id), 'Invalid AP email custody', 409);
    const original = await c.env.ORIGINALS.get(file.key); requireThat(original, 'AP email original unavailable', 409);
    const bytes = new Uint8Array(await original.arrayBuffer());
    requireThat(bytes.length === file.size && await intakeSha256(bytes) === file.sha256, 'AP email custody mismatch', 409);
    await readFence(c.env.DB, a, revision);
    return new Response(bytes, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'", 'referrer-policy': 'no-referrer' } });
});
