import type { Bindings } from '../auth.server';
import { poHtml } from './po-content';
import { orderBytes } from './order-send-document';
import { hashOrderToken, insertOrderSendRecord, liveOrderLink } from './order-send';
import { load } from './store';
import { get, requireThat, text, uid, type Data } from './types';

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const headers = { 'cache-control': 'no-store', 'referrer-policy': 'strict-origin', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" };
function page(body: string, status = 200) {
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Supplier change order</title><style>body{font:16px Arial;margin:24px auto;padding:0 20px;max-width:900px;overflow-wrap:anywhere}p{white-space:pre-wrap}img{max-width:160px;max-height:90px}label{display:block;margin:16px 0}input:not([type=checkbox]){box-sizing:border-box;max-width:100%;font:inherit;padding:8px}button{font:inherit;padding:12px}section{margin:24px 0}</style></head><body><main>${body}</main></body></html>`, { status, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
}
const gone = () => page('<h1>This change-order link is unavailable</h1><p>The link expired, was withdrawn, or a newer revision replaced this order. Contact the buyer.</p>', 410);
async function acknowledgmentInput(request: Request) {
    requireThat(request.body, 'Acknowledgment body required');
    const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; requireThat(size <= 8192, 'Acknowledgment is too large', 413); chunks.push(value); } }
    finally { await reader.cancel(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = new TextDecoder().decode(bytes);
    if (request.headers.get('content-type')?.startsWith('application/json')) { try { return JSON.parse(body); } catch { requireThat(false, 'Invalid acknowledgment JSON'); } }
    requireThat(request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'), 'Use the acknowledgment form or JSON');
    const form = new URLSearchParams(body);
    return { revision: Number(form.get('revision')), name: form.get('name'), consent: form.get('consent') === 'yes', decision: form.get('decision') };
}
export async function supplierOrderChange(request: Request, env: Bindings, token: string, resource?: string, fileIndex?: string) {
    if (new URL(request.url).origin !== env.AUTH_ORIGIN) return page('<h1>Invalid host</h1>', 403);
    if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token)) return gone();
    if (!['GET', 'POST'].includes(request.method) || resource && request.method !== 'GET') return page('<h1>Method not allowed</h1>', 405);
    if (request.method === 'POST' && (request.headers.get('origin') !== env.AUTH_ORIGIN || request.headers.get('sec-fetch-site') === 'cross-site')) return page('<h1>Invalid origin</h1>', 403);
    const hash = await hashOrderToken(token), now = Date.now();
    const link = await env.DB.prepare(liveOrderLink).bind(hash, now).first<{ send: string; order_id: string; expires_at: number }>();
    if (!link) return gone();
    const { state, revision } = await load(env.DB), event = get(state, 'orderSend', link.send);
    // Reloaded state is fenced against link revocation and erasure before bytes leave.
    if (event.erasure || !event.pdf.base64) return gone();
    const live = async () => Boolean(await env.DB.prepare(liveOrderLink).bind(hash, Date.now()).first());
    if (request.method === 'GET') {
        if (!await live()) return gone();
        if (resource) {
            const file = resource === 'pdf' ? event.pdf : /^\d+$/.test(fileIndex ?? '') ? event.content.attachments[Number(fileIndex)] : null;
            requireThat(file && !file.erasure && file.base64, 'Original file not found', 404);
            return new Response(orderBytes(file.base64), { headers: { ...headers, 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"` } });
        }
        const content = { ...event.content, attachments: [] }, html = poHtml(content), face = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
        return page(`<h1>${escape(event.changeLabel)} · approved revision ${event.revision}</h1><p>This private link grants access only to this exact order. It expires ${escape(event.expiresAt)}. Acknowledgment records the link holder's stated name; it does not verify their identity or change this purchase.</p><p><a href="${escape(new URL(request.url).pathname)}/pdf">Download exact change-order PDF</a></p>${event.content.attachments.map((file: Data, index: number) => `<p><a href="${escape(new URL(request.url).pathname)}/original/${index}">Download original: ${escape(file.name)}</a></p>`).join('')}${face}${event.acknowledgment ? `<section><h2>Revision ${event.revision} acknowledged</h2><p>${escape(event.acknowledgment.name)} · ${escape(event.acknowledgment.at)}</p></section>` : `<section><h2>Acknowledge this exact revision</h2><form method="post"><input type="hidden" name="revision" value="${event.revision}"><input type="hidden" name="decision" value="acknowledge"><label>Your name<input name="name" required maxlength="200" autocomplete="name"></label><label><input type="checkbox" name="consent" value="yes" required> I acknowledge ${escape(event.changeLabel)}, ${escape(event.number)}, approved revision ${event.revision}, including its attached terms.</label><button>Acknowledge revision ${event.revision}</button></form><p>To request a change or reject the order, contact the buyer. This acknowledgment form cannot record proposed commercial changes.</p></section>`}`);
    }
    const body = await acknowledgmentInput(request);
    requireThat(body.decision === 'acknowledge', 'Only acknowledgment is supported here. Contact the buyer to propose changes or reject this order.', 409);
    requireThat(body.consent === true && body.revision === event.revision, 'Explicit acknowledgment of this exact approved revision is required', 409);
    requireThat(!event.acknowledgment, 'This exact revision has already been acknowledged', 409);
    const acknowledgment = { id: event.id, send: event.id, order: event.order, request: event.request, revision: event.revision, changeLabel: event.changeLabel, pdfSha256: event.pdf.sha256, name: text(body.name, 'Your name', 200), actor: 'supplier-link', identityVerified: false, at: new Date().toISOString() };
    try { await env.DB.batch([
        env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN EXISTS(${liveOrderLink}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(hash, Date.now(), revision),
        insertOrderSendRecord(env.DB, 'orderAcknowledgment', acknowledgment),
        env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.acknowledgment',json(?)) WHERE business='main' AND kind='orderSend' AND id=?").bind(uid(), JSON.stringify(acknowledgment), event.id),
        insertOrderSendRecord(env.DB, 'audit', { id: uid(), action: 'order-change-acknowledged', record: event.order, send: event.id, actor: 'supplier-link', name: acknowledgment.name, identityVerified: false, revision: event.revision, pdfSha256: event.pdf.sha256, at: acknowledgment.at }),
        env.DB.prepare('DELETE FROM p_guard'),
    ]); } catch (error) { requireThat(!/CHECK constraint|UNIQUE constraint/.test(String(error)), 'Order, link or acknowledgment changed; reload', 409); throw error; }
    return page(`<h1>${escape(event.changeLabel)} acknowledged</h1><p>${escape(event.number)} · approved revision ${event.revision}. Your acknowledgment of this exact PDF and its terms is recorded.</p><p><a href="">View acknowledged revision</a></p>`);
}
