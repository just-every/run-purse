import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { requirePermission } from './access';
import { actor, authority, load, readFence } from './store';
import { get, requireThat, uid } from './types';
import { insertOrderSendRecord, orderSendSummary, sendOrderChange } from './order-send';
import { supplierOrderChange } from './order-send-public';

export const orderSendApi = new Hono<{ Bindings: Bindings }>();
orderSendApi.post('/api/purse/order-send', async c => {
    const a = await actor(c.req.raw, c.env);
    requireThat(Number(c.req.header('content-length') ?? 0) <= 8192, 'Send request too large', 413);
    return c.json(await sendOrderChange(runtimeBindings(c.env), a, await c.req.json()));
});
orderSendApi.get('/api/purse/order-send/:order', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB), order = get(state, 'order', c.req.param('order'));
    requirePermission(state, a, 'po.read', order);
    const event = state.get('orderSend:order-send:' + order.id)?.value;
    await readFence(c.env.DB, a, revision);
    return c.json({ event: event ? orderSendSummary(event) : null });
});
orderSendApi.post('/api/purse/order-send/:order/revoke', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB), order = get(state, 'order', c.req.param('order'));
    requirePermission(state, a, 'po.issue', order);
    const event = get(state, 'orderSend', 'order-send:' + order.id), auth = authority(a), at = new Date().toISOString();
    await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(...auth.params, revision),
        c.env.DB.prepare('UPDATE p_order_send_links SET revoked_at=? WHERE send=? AND revoked_at IS NULL').bind(Date.now(), event.id),
        c.env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.revokedAt',?) WHERE business='main' AND kind='orderSend' AND id=?").bind(uid(), at, event.id),
        insertOrderSendRecord(c.env.DB, 'audit', { id: uid(), actor: a.id, email: a.email, action: 'order-change-link-revoked', record: order.id, send: event.id, at }),
        c.env.DB.prepare('DELETE FROM p_guard'),
    ]);
    return c.json({ revokedAt: at });
});
orderSendApi.all('/api/purse/order-link/:token', c => supplierOrderChange(c.req.raw, runtimeBindings(c.env), c.req.param('token')));
orderSendApi.all('/api/purse/order-link/:token/pdf', c => supplierOrderChange(c.req.raw, runtimeBindings(c.env), c.req.param('token'), 'pdf'));
orderSendApi.all('/api/purse/order-link/:token/original/:index', c => supplierOrderChange(c.req.raw, runtimeBindings(c.env), c.req.param('token'), 'original', c.req.param('index')));
