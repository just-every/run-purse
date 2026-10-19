import { themeFrame } from '../base/theme-frame';
import { fontHead } from '../base/font-head';
import branding from '../branding.json';
import { runtimeBindings, type Bindings } from '../auth.server';
import { load } from './store';
import { Fault, get, requireThat, text, uid, type Data } from './types';

const privateHeaders = {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin', 'x-robots-tag': 'noindex, nofollow',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

async function page(body: string, status = 200, extraHeaders: Record<string, string> = {}): Promise<Response> {
    const frame = await themeFrame({ href: '/rer-theme.css', productName: branding.name, accentColor: branding.primaryColor });
    return new Response(`<!doctype html><html lang="en"${frame.htmlClass}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Document upload</title>${fontHead}${frame.head}</head><body><main>${frame.brand}${body}</main></body></html>`, { status, headers: { ...privateHeaders, ...extraHeaders, 'content-security-policy': `default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; ${frame.policy}` } });
}

const gone = () => page('<h1>This upload link is unavailable</h1><p>Ask your purchasing contact for a new link.</p>', 410);
const invalidUpload = (status = 400) => page('<h1>Upload could not be accepted</h1><p>Choose one nonempty file of up to 1 MB and submit it again.</p>', status);
const hashToken = async (token: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const randomToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Both the public read and the transaction guard bind the capability to the accepted document version.
const liveLink = `SELECT l.document, l.supplier, l.document_version, l.expires_at
    FROM p_supplier_document_links l JOIN p_records d
      ON d.business='main' AND d.kind='supplierDocument' AND d.id=l.document
    WHERE l.hash=? AND l.consumed_at IS NULL AND l.expires_at>?
      AND json_extract(d.value,'$.version')=l.document_version
      AND json_extract(d.value,'$.supplier')=l.supplier`;

export async function createSupplierRefresh(original: Bindings, documentId: string, now = Date.now()): Promise<{ url: string; expiresAt: string }> {
    const env = runtimeBindings(original), { state } = await load(env.DB);
    const document = get(state, 'supplierDocument', text(documentId, 'Supplier document', 200));
    get(state, 'supplier', document.supplier);
    const token = randomToken(), hash = await hashToken(token), expiresAt = now + 7 * 86400000;
    const inserted = await env.DB.prepare(`INSERT INTO p_supplier_document_links(hash,document,supplier,document_version,expires_at,consumed_at)
        SELECT ?,?,?,?,?,NULL FROM p_records WHERE business='main' AND kind='supplierDocument' AND id=?
        AND json_extract(value,'$.version')=? AND json_extract(value,'$.supplier')=?`)
        .bind(hash, document.id, document.supplier, document.version, expiresAt, document.id, document.version, document.supplier).run();
    requireThat(inserted.meta.changes === 1, 'Supplier document changed; reload', 409);
    return { url: new URL(`/api/purse/supplier-refresh/${token}`, env.AUTH_ORIGIN).href, expiresAt: new Date(expiresAt).toISOString() };
}

async function uploadForm(request: Request): Promise<FormData> {
    const length = request.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) throw new Fault(400, 'Invalid upload');
    if (length !== null && Number(length) > 1100000) throw new Fault(413, 'Upload too large');
    const contentType = request.headers.get('content-type') ?? '';
    if (!/^multipart\/form-data\s*;/i.test(contentType) || !request.body) throw new Fault(400, 'Invalid upload');
    const reader = request.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 1100000) {
                await reader.cancel();
                throw new Fault(413, 'Upload too large');
            }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return await new Response(bytes, { headers: { 'content-type': contentType } }).formData(); }
    catch { throw new Fault(400, 'Invalid upload'); }
}

function base64(bytes: Uint8Array): string {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(binary);
}

/** The scoped bearer link authorizes only a private upload awaiting a buyer's review. */
export async function supplierRefresh(request: Request, original: Bindings, token: string): Promise<Response> {
    // A 32-byte token has exactly 43 canonical, unpadded base64url characters.
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token)) return gone();
    const env = runtimeBindings(original);
    if (new URL(request.url).origin !== env.AUTH_ORIGIN) return page('<h1>Request could not be accepted</h1>', 403);
    if (!['GET', 'POST'].includes(request.method)) return page('<h1>Method not allowed</h1>', 405, { allow: 'GET, POST' });
    const hash = await hashToken(token), link = await env.DB.prepare(liveLink).bind(hash, Date.now()).first<{ document: string; supplier: string; document_version: number; expires_at: number }>();
    if (!link) return gone();
    if (request.method === 'GET') return page('<h1>Upload a refreshed document</h1><p>Choose one file of up to 1 MB. Your purchasing team will review it before accepting the document.</p><form method="post" enctype="multipart/form-data"><label for="file">Document</label><input id="file" name="file" type="file" required><button type="submit">Submit document</button></form>');
    if (request.headers.get('origin') !== env.AUTH_ORIGIN) return page('<h1>Request could not be accepted</h1>', 403);
    let form: FormData;
    try { form = await uploadForm(request); }
    catch (error) { if (error instanceof Fault) return invalidUpload(error.status); throw error; }
    const files = form.getAll('file');
    if ([...form.keys()].length !== 1 || files.length !== 1 || !(files[0] instanceof File)) return invalidUpload();
    const file = files[0];
    if (!file.size || file.size > 1000000 || !file.name.trim() || file.name.length > 200 || file.type.length > 150) return invalidUpload(file.size > 1000000 ? 413 : 400);
    const encoded = base64(new Uint8Array(await file.arrayBuffer()));
    const now = Date.now(), at = new Date(now).toISOString(), attachmentId = uid(), submissionId = uid(), auditId = uid();
    const attachment = { id: attachmentId, kind: 'supplier', record: link.supplier, privateSupplierDocument: true,
        name: file.name.trim(), mediaType: file.type || 'application/octet-stream', base64: encoded, size: file.size, actor: 'supplier-link', at };
    const submission = { id: submissionId, document: link.document, attachment: attachmentId, submittedAt: at, status: 'pending' };
    const audit = { id: auditId, actor: 'supplier-link', action: 'attachment', record: link.supplier, attachment: attachmentId, at };
    const insert = (kind: string, id: string, value: Data) => env.DB.prepare("INSERT INTO p_records(business,kind,id,revision,value) VALUES('main',?,?,?,?)").bind(kind, id, uid(), JSON.stringify(value));
    try {
        await env.DB.batch([
            env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN EXISTS(${liveLink}) THEN 1 ELSE 0 END`).bind(hash, now),
            env.DB.prepare('UPDATE p_supplier_document_links SET consumed_at=? WHERE hash=? AND consumed_at IS NULL').bind(now, hash),
            insert('attachment', attachmentId, attachment), insert('supplierDocumentSubmission', submissionId, submission), insert('audit', auditId, audit),
            env.DB.prepare('DELETE FROM p_guard'),
        ]);
    } catch (error) {
        if (/CHECK constraint failed:\s*(?:ok\s*=\s*1\b|p_guard\b)/i.test(String(error))) return gone();
        throw error;
    }
    return page('<h1>Document submitted</h1><p>Your document is pending buyer review. Your purchasing team will confirm acceptance.</p>');
}
