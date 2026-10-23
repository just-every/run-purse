import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { actor, authority, load, readFence } from './store';
import { orderThreadFollowup, requireOrderThreadRead, sendOrderThreadMessage } from './order-thread';
import { threadDigest, threadFileKey, threadInsert } from './order-thread-storage';
import { get, requirePermission, requireThat, uid, type Data } from './types';

export const orderThreadApi = new Hono<{ Bindings: Bindings }>();
orderThreadApi.post('/api/purse/order-thread', async c => {
    const a = await actor(c.req.raw, c.env);
    requireThat(Number(c.req.header('content-length') ?? 0) <= 32_768, 'Supplier message request too large', 413);
    return c.json(await sendOrderThreadMessage(runtimeBindings(c.env), a, await c.req.json()));
});
orderThreadApi.get('/api/purse/order-thread/:order', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB), order = get(state, 'order', c.req.param('order'));
    const result = orderThreadFollowup(state, a, order); await readFence(c.env.DB, a, revision);
    return c.json(result);
});
orderThreadApi.get('/api/purse/order-thread/:order/messages/:message/files/:file', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB), order = get(state, 'order', c.req.param('order'));
    requireOrderThreadRead(state, a, order);
    const message = get(state, 'orderThreadMessage', c.req.param('message'));
    requireThat(message.order === order.id, 'Supplier message belongs to another PO', 403);
    // The raw provider source contains envelope/header details; buyers alone read it.
    if (c.req.param('file') === 'original') requirePermission(state, a, 'procurement.manage', order);
    const file = [message.original, ...(message.files ?? [])].filter(Boolean).find((file: Data) => file.id === c.req.param('file'));
    requireThat(file, 'Supplier message file not found', 404);
    requireThat(!message.erasure && !file.erasure, 'Original removed by personal-data erasure', 410);
    requireThat(file.key === threadFileKey(message.id, file.id), 'Invalid supplier source custody', 409);
    const source = await c.env.ORIGINALS.get(file.key); requireThat(source, 'Supplier source unavailable', 409);
    const bytes = new Uint8Array(await source.arrayBuffer());
    requireThat(bytes.length === file.size && await threadDigest(bytes) === file.sha256, 'Supplier source custody mismatch', 409);
    await readFence(c.env.DB, a, revision);
    return new Response(bytes, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'", 'referrer-policy': 'no-referrer' } });
});
orderThreadApi.post('/api/purse/order-thread/:order/messages/:message/revoke', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB), order = get(state, 'order', c.req.param('order'));
    requirePermission(state, a, 'procurement.manage', order);
    const message = get(state, 'orderThreadMessage', c.req.param('message')); requireThat(message.order === order.id && message.direction === 'outbound', 'Choose an outbound message on this PO', 409);
    const auth = authority(a), at = new Date().toISOString();
    await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(...auth.params, revision),
        c.env.DB.prepare('DELETE FROM p_order_thread_routes WHERE thread=?').bind(message.id),
        c.env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.replyRevokedAt',?) WHERE business='main' AND kind='orderThreadMessage' AND id=?").bind(uid(), at, message.id),
        threadInsert(c.env.DB, 'audit', { id: uid(), action: 'order-thread-reply-route-revoked', record: order.id, message: message.id, actor: a.id, email: a.email, revision: message.revision, at }),
        c.env.DB.prepare('DELETE FROM p_guard'),
    ]);
    return c.json({ revokedAt: at });
});
