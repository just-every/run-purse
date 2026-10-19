import { rfqQuotation } from './rfq-quotes';
import { themeFrame } from '../base/theme-frame';
import { fontHead } from '../base/font-head';
import branding from '../branding.json';
import type { Bindings } from '../auth.server';
import { load } from './store';
import { normalizeRfqResponse } from './rfq-pricing';
import { hashRfqToken, insertRfqRecord, liveRfqLink } from './rfq-links';
import { rfqResponses } from './rfq';
import { Fault, get, requireThat, text, uid, type Data } from './types';
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
async function page(body: string, status = 200) {
    const frame = await themeFrame({ href: '/rer-theme.css', productName: branding.name, accentColor: branding.primaryColor });
    return new Response(`<!doctype html><html lang="en"${frame.htmlClass}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Supplier quotation</title>${fontHead}${frame.head}</head><body><main>${frame.brand}${body}</main></body></html>`, { status, headers: {
        'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'strict-origin', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow',
        'content-security-policy': `default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; ${frame.policy}`,
    } });
}
const gone = () => page('<h1>This quotation link is unavailable</h1><p>Ask your purchasing contact for a new link.</p>', 410);
const input = (label: string, name: string, value = '', type = 'text') => `<label>${escape(label)}<input name="${escape(name)}" aria-label="${escape(label)}" type="${type}" value="${escape(value)}" required></label>`;
async function boundedBody(request: Request) {
    requireThat(request.body, 'Response body required');
    const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 1500000) { await reader.cancel(); throw new Fault(413, 'Response is too large'); } chunks.push(next.value); } } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
}
function encode(bytes: Uint8Array) { let result = ''; for (let i = 0; i < bytes.length; i += 32768) result += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(result); }
async function responseInput(request: Request, rfq: Data) {
    const bytes = await boundedBody(request), contentType = request.headers.get('content-type') ?? '';
    if (/^application\/json\b/i.test(contentType)) { try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Fault(400, 'Invalid response JSON'); } }
    requireThat(/^multipart\/form-data\s*;/i.test(contentType), 'Use the quotation form or JSON');
    let form: FormData; try { form = await new Response(bytes, { headers: { 'content-type': contentType } }).formData(); } catch { throw new Fault(400, 'Invalid quotation form'); }
    const files = [];
    for (const file of form.getAll('files')) if (file instanceof File && file.size) files.push({ name: file.name, mediaType: file.type || 'application/octet-stream', base64: encode(new Uint8Array(await file.arrayBuffer())) });
    return { currency: form.get('currency'), freightAmount: form.get('freightAmount'), taxAmount: form.get('taxAmount'), leadTime: form.get('leadTime'), validity: form.get('validity'), conditions: form.get('conditions'),
        answers: rfq.questions.map((_: string, i: number) => form.get('answer:' + i)), files,
        lines: rfq.lines.map((l: Data, i: number) => ({ requestLine: l.id, description: l.description, quantity: l.quantity, unit: l.unit, partNumber: l.partNumber, unitAmount: form.get('price:' + i) })) };
}
async function originals(input: unknown) {
    requireThat(Array.isArray(input) && input.length <= 3, 'Provide up to three original files'); let total = 0;
    const result = [];
    for (const file of input) {
        requireThat(file && typeof file.base64 === 'string' && file.base64.length <= 1400000, 'Invalid original file');
        let binary: string; try { binary = atob(file.base64); } catch { throw new Fault(400, 'Invalid file bytes'); }
        total += binary.length; requireThat(binary.length > 0 && total <= 1000000, 'Original files must total at most 1 MB');
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0)), sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
        result.push({ id: uid(), name: text(file.name, 'Original filename', 200), mediaType: text(file.mediaType, 'Original media type', 150), base64: file.base64, size: binary.length, sha256 });
    }
    return result;
}

export async function supplierRfq(request: Request, env: Bindings, token: string) {
    if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token)) return gone();
    if (new URL(request.url).origin !== env.AUTH_ORIGIN) return page('<h1>Invalid host</h1>', 403);
    if (!['GET', 'POST'].includes(request.method)) return page('<h1>Method not allowed</h1>', 405);
    if (request.method === 'POST' && (request.headers.get('origin') !== env.AUTH_ORIGIN || request.headers.get('sec-fetch-site') === 'cross-site')) return page('<h1>Invalid origin</h1>', 403);
    const hash = await hashRfqToken(token), link = await env.DB.prepare(liveRfqLink).bind(hash, Date.now()).first<{ rfq: string; supplier: string; expires_at: number }>();
    if (!link) return gone();
    const { state, revision } = await load(env.DB), rfq = get(state, 'rfq', link.rfq);
    const zone=get(state,'business','main').timezone||'America/New_York', deadlineLabel=new Intl.DateTimeFormat('en-US',{timeZone:zone,dateStyle:'full',timeStyle:'long'}).format(new Date(rfq.deadline))+' ('+zone+')';
    if (request.method === 'GET') return page(`<h1>Request for quotation</h1><p>${escape(rfq.scope)}</p><p>Response deadline: ${escape(deadlineLabel)}. You may submit revised quotations until this deadline. Each submission is retained; the latest is used for comparison.</p><form method="post" enctype="multipart/form-data">${rfq.lines.map((l: Data, i: number) => `<fieldset><legend>${escape(l.description)}</legend><p>${escape(l.quantity)} ${escape(l.unit)} · ${escape(l.partNumber)}</p>${input('Unit price ' + (i + 1), 'price:' + i)}</fieldset>`).join('')}${input('Quote currency', 'currency')}${input('Freight', 'freightAmount')}${input('Supplied tax', 'taxAmount')}${input('Lead time', 'leadTime')}${input('Validity', 'validity')}<label>Conditions<textarea name="conditions" aria-label="Conditions"></textarea></label>${rfq.questions.map((q: string, i: number) => input(q, 'answer:' + i)).join('')}<label>Original quote files (up to three, 1 MB total)<input name="files" aria-label="Original quote files" type="file" multiple></label><button type="submit">Submit supplier quotation</button></form><p>Submitting records your offer only. Purchasing approval remains with the buyer.</p>`);
    try {
        const body = await responseInput(request, rfq), normalized = normalizeRfqResponse(state, rfq, body);
        requireThat(Array.isArray(body.answers) && body.answers.length === rfq.questions.length, 'Answer every RFQ question');
        const answers = body.answers.map((answer: unknown) => text(answer, 'Question answer'));
        const files = await originals(body.files ?? []), id = uid(), now = Date.now();
        const response: Data = { id, rfq: rfq.id, request: rfq.request, revision: rfq.revision, supplier: link.supplier, offerSequence: rfqResponses(state,rfq.id).length+1, sequence: rfqResponses(state, rfq.id, link.supplier).length + 1, ...normalized, answers, files, actor: 'supplier-link', at: new Date(now).toISOString() };
        const quote=rfqQuotation(state,rfq,response);response.quote=quote.id;
        await env.DB.batch([
            env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN EXISTS(${liveRfqLink}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(hash, now, revision),
            insertRfqRecord(env.DB, 'rfqResponse', response),insertRfqRecord(env.DB,'quote',quote),
            insertRfqRecord(env.DB, 'audit', { id: uid(), actor: 'supplier-link', action: 'rfq-response', record: rfq.request, rfq: rfq.id, response: id, supplier: link.supplier, at: response.at }),
            env.DB.prepare('DELETE FROM p_guard'),
        ]);
        return page('<h1>Quotation recorded</h1><p>Your quotation and original files have been retained. You may use this link to submit a revised quotation before the deadline. The buyer will review your latest response.</p><p><a href="">Prepare a revised quotation</a></p>');
    } catch (error) {
        if (/CHECK constraint/.test(String(error))) return page('<h1>Quotation could not be recorded</h1><p>The link or RFQ changed. Reload before submitting again.</p><p><a href="">Return to quotation form</a></p>', 409);
        if (error instanceof Fault) return page(`<h1>Quotation could not be recorded</h1><p>${escape(error.message)}</p><p><a href="">Return to quotation form</a></p>`, error.status);
        throw error;
    }
}
