import type { Bindings } from '../auth.server';
import { currentDecision } from './approval';
import { currentOrderSender } from './order-response';
import { hashOrderToken, liveOrderLink } from './order-send';
import { load } from './store';
import { captureSupplierInvoice, requireSupplierInvoiceOrder, supplierInvoiceLines, supplierInvoiceStatuses } from './supplier-invoice';
import { Fault, get, requireThat, type Data, type State } from './types';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" };
const page = (body: string, status = 200) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Supplier invoice submission</title><style>body{font:16px Arial;margin:24px auto;padding:0 20px;max-width:900px;overflow-wrap:anywhere}label{display:block;margin:16px 0}input{box-sizing:border-box;max-width:100%;font:inherit;padding:8px}button{font:inherit;padding:12px}fieldset{min-width:0;margin:16px 0}section{margin:24px 0}</style></head><body><main>${body}</main></body></html>`, { status, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
const json = (body: Data, status = 200) => Response.json(body, { status, headers });
const gone = () => page('<h1>This purchase-order link is unavailable</h1><p>The link expired, was withdrawn, or a newer revision replaced this order. Contact the buyer.</p>', 410);

// The ordinary order link also supports cancellations; invoice authority never does.
export const liveSupplierInvoiceLink = liveOrderLink + ` AND json_extract(o.value,'$.status')='issued' AND json_extract(e.value,'$.revision')=json_extract(o.value,'$.revision') AND json_extract(e.value,'$.acknowledgment.revision')=json_extract(o.value,'$.revision') AND json_extract(e.value,'$.acknowledgment.pdfSha256')=json_extract(e.value,'$.pdf.sha256') AND json_extract(e.value,'$.supplier')=json_extract(o.value,'$.supplier') AND json_extract(r.value,'$.currency')=json_extract(o.value,'$.currency')`;

async function input(request: Request) {
    requireThat(request.body, 'Invoice submission body required');
    const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; requireThat(size <= 1500000, 'Invoice submission exceeds the 1 MB original limit', 413); chunks.push(value); } } finally { await reader.cancel(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.startsWith('application/json')) { try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Fault(400, 'Invalid invoice JSON'); } }
    requireThat(contentType.startsWith('multipart/form-data;'), 'Submit the invoice form with its original PDF');
    const form = await new Response(bytes, { headers: { 'content-type': contentType } }).formData();
    const lineIds = form.getAll('line');
    const allowed = new Set(['revision', 'consent', 'reference', 'invoiceDate', 'freightAmount', 'taxAmount', 'document', 'line', ...lineIds.flatMap(line => ['quantity:' + line, 'unitAmount:' + line])]);
    requireThat([...form.keys()].every(key => allowed.has(key)) && [...allowed].every(key => key === 'line' || form.getAll(key).length <= 1), 'Invoice form contains unsupported or repeated fields');
    const document = form.get('document'); requireThat(document && typeof document !== 'string' && document.size <= 1000000, 'Attach the original invoice PDF (up to 1 MB)');
    return { revision: Number(form.get('revision')), consent: form.get('consent') === 'yes', reference: form.get('reference'), invoiceDate: form.get('invoiceDate'), freightAmount: form.get('freightAmount'), taxAmount: form.get('taxAmount'), lines: lineIds.filter(line => form.get('quantity:' + line) !== '0' && form.get('quantity:' + line) !== '').map(line => ({ line, quantity: form.get('quantity:' + line), unitAmount: form.get('unitAmount:' + line) })), document: { name: document.name, mediaType: document.type, base64: Buffer.from(await document.arrayBuffer()).toString('base64') } };
}

function operatorProofs(state: State, event: Data) {
    const decision = currentDecision(state, get(state, 'request', event.request));
    return [{ actor: event.actor, version: event.operatorVersion }, ...(decision.chainProofs ?? [{ actor: decision.actor, version: decision.operatorVersion }])];
}
function activeProof() { return "EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active')"; }
async function live(env: Bindings, state: State, event: Data, hash: string, revision: number) {
    const proofs = operatorProofs(state, event);
    return Boolean(await env.DB.prepare(liveSupplierInvoiceLink + ' AND (SELECT revision FROM p_meta WHERE id=1)=? AND ' + proofs.map(() => activeProof()).join(' AND ')).bind(hash, Date.now(), revision, ...proofs.flatMap(proof => [proof.actor, proof.version])).first());
}
async function commit(env: Bindings, before: State, state: State, event: Data, hash: string, revision: number) {
    const fence = () => env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN EXISTS(${liveSupplierInvoiceLink}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(hash, Date.now(), revision);
    const proofs = operatorProofs(state, event);
    const writes = [...state].filter(([key, row]) => row.revision !== before.get(key)?.revision).map(([, row]) => env.DB.prepare("INSERT INTO p_records(business,kind,id,revision,value) VALUES('main',?,?,?,?) ON CONFLICT(business,kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value").bind(row.kind, row.id, row.revision, JSON.stringify(row.value)));
    try { await env.DB.batch([fence(), ...proofs.map(proof => env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN ${activeProof()} THEN 1 ELSE 0 END`).bind(proof.actor, proof.version)), ...writes, env.DB.prepare('DELETE FROM p_guard')]); }
    catch (error) { requireThat(!/CHECK constraint|UNIQUE constraint/.test(String(error)), 'Order, link, authority or invoice changed; reload', 409); throw error; }
}

export async function supplierOrderInvoice(request: Request, env: Bindings, token: string) {
    const wantsJson = request.headers.get('accept')?.includes('application/json');
    try {
        requireThat(new URL(request.url).origin === env.AUTH_ORIGIN, 'Invalid host', 403);
        if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token)) return gone();
        requireThat(['GET', 'POST'].includes(request.method), 'Method not allowed', 405);
        if (request.method === 'POST') requireThat(request.headers.get('origin') === env.AUTH_ORIGIN && request.headers.get('sec-fetch-site') !== 'cross-site', 'Invalid origin', 403);
        const hash = await hashOrderToken(token), link = await env.DB.prepare(liveSupplierInvoiceLink).bind(hash, Date.now()).first<{ send: string }>();
        if (!link) return gone();
        const { state, revision } = await load(env.DB), before = new Map(state), event = get(state, 'orderSend', link.send);
        const order = requireSupplierInvoiceOrder(state, event);
        if (!await currentOrderSender(env, state, event)) return gone();
        if (request.method === 'POST') {
            const submission = await captureSupplierInvoice(state, event, await input(request));
            await commit(env, before, state, event, hash, revision);
            const status = supplierInvoiceStatuses(state, event).find(value => value.reference === get(state, 'invoice', submission.invoice).reference)!;
            return wantsJson ? json({ invoice: status }) : page(`<h1>Invoice received</h1><p>${escape(status.reference)} · ${escape(status.currency)} ${(status.amountMinor / 100).toFixed(2)} · ${escape(status.invoiceDate)}</p><p>The buyer must confirm the private original. Receipt of this submission does not establish matching, payment approval or supplier identity.</p><p><a href="">View your submissions and remaining quantity</a></p>`);
        }
        const lines = supplierInvoiceLines(state, order), invoices = supplierInvoiceStatuses(state, event);
        if (!await live(env, state, event, hash, revision)) return gone();
        if (wantsJson) return json({ order: { number: order.number, revision: order.revision, currency: order.currency }, lines, invoices });
        return page(`<h1>Submit an invoice</h1><p>${escape(order.number)} · approved revision ${order.revision} · ${escape(order.currency)}</p><p>Prefilled quantities are accepted goods less quantities already billed, capped by the uncancelled, open ordered balance. Keep the actual invoice quantity if it exceeds that balance; the buyer will receive an exception. The private original requires buyer review. Link-holder identity is unverified.</p><form method="post" enctype="multipart/form-data"><input type="hidden" name="revision" value="${order.revision}"><label>Invoice number<input name="reference" required maxlength="200"></label><label>Invoice date<input name="invoiceDate" type="date" required></label>${lines.map((line: Data) => `<fieldset><legend>${escape(line.description)}</legend><p>Remaining accepted quantity: ${escape(line.quantity)}${line.unit ? ' ' + escape(line.unit) : ''}. Previously billed: ${line.billedQ / 1000}.</p><input name="line" type="hidden" value="${escape(line.line)}"><label>Invoice quantity<input name="quantity:${escape(line.line)}" value="${escape(line.quantity)}" required inputmode="decimal" maxlength="20"></label><label>Invoice unit price (${escape(order.currency)})<input name="unitAmount:${escape(line.line)}" value="${(line.unitMinor / 100).toFixed(2)}" required inputmode="decimal" maxlength="20"></label></fieldset>`).join('')}<label>Freight (${escape(order.currency)})<input name="freightAmount" value="0.00" required inputmode="decimal"></label><label>Tax (${escape(order.currency)})<input name="taxAmount" value="0.00" required inputmode="decimal"></label><label>Original invoice PDF (up to 1 MB)<input type="file" name="document" accept="application/pdf" required></label><label><input name="consent" type="checkbox" value="yes" required> Submit this invoice as evidence against ${escape(order.number)}, approved revision ${order.revision}.</label><button>Submit invoice</button></form><section><h2>Your invoice submissions</h2>${invoices.length ? invoices.map(invoice => `<article><h3>${escape(invoice.reference)}</h3><p>${escape(invoice.currency)} ${(invoice.amountMinor / 100).toFixed(2)} · ${escape(invoice.invoiceDate)} · ${escape(invoice.status)}</p></article>`).join('') : '<p>No invoices have been submitted through this link.</p>'}</section>`);
    } catch (error) {
        if (!(error instanceof Fault)) throw error;
        return wantsJson ? json({ error: error.message }, error.status) : page(`<h1>Invoice submission unavailable</h1><p>${escape(error.message)}</p>`, error.status);
    }
}
