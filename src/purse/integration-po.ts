import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { guardedBatch, poReadScope } from './integration-tokens';
import { hashRfqToken, insertRfqRecord } from './rfq-links';
import { load } from './store';
import { all, extended, requireThat, uid, type Data } from './types';

export const integrationPoApi = new Hono<{ Bindings: Bindings }>();

/** Explicit financial projection. Never spread source, request, approval or supplier records. */
function orderData(order: Data, invoices: Data[]) {
    return {
        id: order.id, number: order.number, revision: order.revision, 
        supplier: order.supplier, currency: order.currency, status: order.status,
        needDate: order.needDate ?? null, issuedAt: order.issuedAt ?? null,
        totalMinor: order.totalMinor, freightMinor: order.freightMinor ?? 0, taxMinor: order.taxMinor ?? 0,
        otherMinor: order.otherChargesMinor ?? 0,
        lines: order.lines.map((line: Data) => ({
            id: line.id, description: line.description, partNumber: line.partNumber ?? null,
            quantity: line.quantity, unit: line.unit ?? null, unitMinor: line.unitMinor,
            amountMinor: line.totalMinor ?? extended(line.q, line.unitMinor), taxMinor: line.lineTaxMinor ?? 0,
        })),
        bills: invoices.map(invoice => ({
            id: invoice.id, reference: invoice.reference, currency: invoice.currency,
            totalMinor: invoice.totalMinor, status: invoice.status ?? 'captured',
            invoiceDate: invoice.invoiceDate ?? null, dueDate: invoice.dueDate ?? null,
            paymentStatus: 'unknown', paymentStatusReason: 'Payment status return is not built (AP-001/AP-002)',
        })),
    };
}

integrationPoApi.get('/api/purse/integration/orders/:id', async c => {
    const env = runtimeBindings(c.env);
    requireThat(new URL(c.req.url).origin === env.AUTH_ORIGIN, 'Invalid host', 403);
    requireThat(!c.req.header('origin') || c.req.header('origin') === env.AUTH_ORIGIN, 'Invalid origin', 403);
    requireThat(c.req.header('sec-fetch-site') !== 'cross-site', 'Invalid origin', 403);
    const bearer = c.req.header('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    requireThat(bearer, 'Integration bearer required', 401);
    const hash = await hashRfqToken(bearer), now = Date.now(), at = new Date(now).toISOString();
    const token = await c.env.DB.prepare('SELECT * FROM p_integration_tokens WHERE hash=? AND revoked_at IS NULL').bind(hash).first<Data>();
    requireThat(token, 'Integration bearer unavailable', 401);
    requireThat(token.scope === poReadScope, 'Integration scope refused', 403);
    requireThat(token.expires_at > at, 'Integration bearer expired', 401);
    // A durable atomic per-token window also bounds rejected record probes and concurrent callers.
    const window = Math.floor(now / 60000);
    const counted = await c.env.DB.prepare(`UPDATE p_integration_tokens SET
        read_count=CASE WHEN read_window=? THEN read_count+1 ELSE 1 END,read_window=?
        WHERE id=? AND hash=? AND revoked_at IS NULL AND expires_at>?
        AND (read_window<>? OR read_count<60) RETURNING id`).bind(window, window, token.id, hash, at, window).first();
    requireThat(counted, 'Read rate limit exceeded or token ended', 429);
    const {state, revision} = await load(c.env.DB);
    const order = all(state, 'order').find(order => order.id === c.req.param('id'));
    requireThat(order && JSON.parse(token.suppliers).includes(order.supplier), 'Purchase order unavailable in token scope', 404);
    const result = orderData(order, all(state, 'invoice').filter(invoice => invoice.order === order.id && invoice.supplier === order.supplier));
    // Revocation/rotation/expiry and source revision are checked in the same transaction as the read audit.
    await guardedBatch(c.env.DB, [
        c.env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM p_integration_tokens
            WHERE id=? AND hash=? AND scope=? AND revoked_at IS NULL AND expires_at>?)
            AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(token.id, hash, poReadScope, new Date().toISOString(), revision),
        insertRfqRecord(c.env.DB, 'audit', {id:uid(),actor:`integration:${token.id}`,action:'integration-po-read',record:order.id,integration:token.id,name:token.name,door:'read-purchase-order',status:200,at}),
        c.env.DB.prepare('DELETE FROM p_guard'),
    ]);
    return c.json({order:result});
});
