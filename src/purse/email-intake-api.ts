import { Hono } from 'hono';
import { normalizeInbound, createResendAttachmentFetcher, verifyWebhook, readStream } from '../inbound-mail.server.mjs';
import { runtimeBindings, type Bindings } from '../auth.server';
import { actor, load, readFence } from './store';
import { activeIntakeRequester, intakeAdminAllowed, intakeLimits, intakeScope, providerSenderLabel, queueIntakeLink, sendEmailIntakeLinks, unrestrictedIntakeAdmin } from './email-intake';
import { apFileKey, apInvoiceEmail } from './invoice-inbox';
import { embeddedInvoicePdfs } from './invoice-xml';
import { Fault, get, put, requireThat, uid, type Data } from './types';
import { requirePermission } from './access';

export const emailIntakeApi = new Hono<{ Bindings: Bindings }>();
export async function intakeSha256(bytes: Uint8Array) {
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
async function retain(env: Bindings, key: string, id: string, name: string, mediaType: string, bytes: Uint8Array) {
    const file = { id, name, mediaType, key, size: bytes.length, sha256: await intakeSha256(bytes) };
    await env.ORIGINALS.put(file.key, bytes, { httpMetadata: { contentType: mediaType } });
    return file;
}
async function hydrate(env: Bindings, id: string) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
    try {
        const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, { method: 'GET', headers: { authorization: `Bearer ${env.MAIL_API_KEY}`, accept: 'application/json' }, redirect: 'manual', signal: controller.signal });
        requireThat(response.status === 200, 'Inbound provider hydration unavailable', 502);
        const raw = await readStream(response.body, intakeLimits.maxRawBytes);
        const email = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
        const normalized = await normalizeInbound({ provider: 'resend', signedEmailId: id, email, fetchAttachment: createResendAttachmentFetcher({ apiKey: env.MAIL_API_KEY, maxAttachmentBytes: intakeLimits.maxAttachmentBytes }) }, intakeLimits);
        return { raw, normalized };
    } finally { clearTimeout(timer); }
}

/** Only the configured provider endpoint authenticates this public door. From grants no session. */
emailIntakeApi.post('/api/purse/email-intake/inbound', async c => {
    const env = runtimeBindings(c.env);
    requireThat(env.EMAIL_INTAKE_WEBHOOK_SECRET && env.MAIL_API_KEY, 'Email intake provider is not configured', 503);
    const raw = await readStream(c.req.raw.body, 65_536);
    const verified = await verifyWebhook({ provider: 'resend', rawBody: raw, headers: c.req.raw.headers, key: env.EMAIL_INTAKE_WEBHOOK_SECRET, now: Date.now() });
    requireThat(verified, 'Invalid inbound webhook signature', 401);
    let event: Data;
    try { event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
    catch { throw new Fault(400, 'Invalid inbound event'); }
    requireThat(event?.type === 'email.received' && /^[a-zA-Z0-9_-]{1,128}$/.test(event.data?.email_id ?? ''), 'Expected an email.received event');
    const emailId = event.data.email_id, id = uid();
    // Provider identity, not Svix delivery identity: a redelivery with a new signature is still one email.
    const receipt = await env.DB.prepare("INSERT OR IGNORE INTO p_email_intake_receipts(provider,email_id,intake_id,status,created_at) VALUES('resend',?,?,'claimed',?)").bind(emailId, id, new Date().toISOString()).run();
    if (!receipt.meta.changes) return c.json({ received: true, duplicate: true }, 202);
    const retained: string[] = [];
    let persisted = false;
    try {
        const { raw: source, normalized } = await hydrate(env, emailId);
        const { state, revision } = await load(env.DB), before = new Set(state.keys());
        const recipients = normalized.to.map((email: string) => email.toLowerCase());
        const requestAddress = state.get('emailIntakeConfig:main')?.value.address, apAddress = state.get('invoiceInboxConfig:main')?.value.address;
        // The AP address takes supplier invoice mail only; it never becomes a purchase request, even when the request address is also a recipient.
        const ap = Boolean(apAddress && recipients.includes(apAddress));
        requireThat(ap || requestAddress && recipients.includes(requestAddress), 'Email was not addressed to this business request or AP address');
        requireThat(normalized.subject.length <= 2000 && normalized.attachments.every((file: Data) => file.filename.length <= 2000), 'Email subject or attachment name is too large');
        const from = normalized.from.toLowerCase(), requester = ap ? null : await activeIntakeRequester(env.DB, state, from);
        const custody = (file: string) => ap ? apFileKey(id, file) : `intake/${id}/${file}`;
        const original = await retain(env, custody('original'), 'original', 'provider-email.json', 'application/json', source); retained.push(original.key);
        const files: Data[] = [];
        for (const attachment of normalized.attachments) {
            const fileId = uid(), file = await retain(env, custody(fileId), fileId, attachment.filename || 'attachment', attachment.contentType, attachment.content);
            files.push(file); retained.push(file.key);
        }
        if (ap) {
            const embedded: Data[] = [];
            let decoded = normalized.attachments.reduce((n: number, file: Data) => n + file.content.length, 0);
            for (const [index, attachment] of normalized.attachments.entries()) for (const pdf of embeddedInvoicePdfs(attachment.content)) {
                // The XML original keeps every embedded byte; a separate copy is kept only within the transport limits.
                if (pdf.bytes.length > intakeLimits.maxAttachmentBytes || decoded + pdf.bytes.length > intakeLimits.maxTotalAttachmentBytes) continue;
                decoded += pdf.bytes.length;
                const fileId = uid(), file = await retain(env, custody(fileId), fileId, pdf.name, pdf.mediaType, pdf.bytes);
                embedded.push({ ...file, embeddedIn: files[index].id, path: pdf.path }); retained.push(file.key);
            }
            const capture = apInvoiceEmail(state, { id, emailId, from, normalized, original, files, embedded });
            put(state, 'apInvoiceEmail', id, capture);
            put(state, 'audit', uid(), { actor: 'invoice-inbox', action: 'invoice-inbox-received', record: id, provider: 'resend', providerEmailId: emailId, status: capture.status, supplier: capture.supplier, match: capture.match, at: capture.receivedAt });
        } else {
            const intake = { id, provider: 'resend', providerEmailId: emailId, providerSender: from, providerSenderLabel, senderVerified: false, to: normalized.to, subject: normalized.subject, title: normalized.subject, body: normalized.text ?? '', sourceText: normalized.text, sourceHtml: normalized.html, messageId: normalized.messageId, originalFormat: 'provider-api-json', original, files, status: requester ? 'draft' : 'held', holdReason: requester ? null : 'Sender has no active native requester membership', requester: requester?.id ?? null, requesterEmail: requester?.email ?? null, requesterVersion: requester?.version ?? null, version: 1, receivedAt: new Date().toISOString() };
            put(state, 'emailIntake', id, intake);
            if (requester) queueIntakeLink(state, intake);
            const auditId = uid(); put(state, 'audit', auditId, { actor: 'email-intake', action: 'email-intake-received', record: id, provider: 'resend', providerEmailId: emailId, status: intake.status, at: intake.receivedAt });
        }
        const queries = [env.DB.prepare('INSERT INTO p_guard SELECT CASE WHEN (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END').bind(revision)];
        if (requester) queries.push(env.DB.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(requester.id, requester.version));
        for (const [key, row] of state) if (!before.has(key)) queries.push(env.DB.prepare('INSERT INTO p_records(business,kind,id,revision,value) VALUES(?,?,?,?,?)').bind(row.business, row.kind, row.id, row.revision, JSON.stringify(row.value)));
        queries.push(env.DB.prepare("UPDATE p_email_intake_receipts SET status='stored' WHERE provider='resend' AND email_id=? AND intake_id=?").bind(emailId, id), env.DB.prepare('DELETE FROM p_guard'));
        await env.DB.batch(queries); persisted = true;
        await sendEmailIntakeLinks(env);
        return c.json({ received: true }, 202);
    } catch {
        if (!persisted) {
            // Failed/interrupted claims remain visible to the owner for reconciliation, never automatic resend/re-ingest.
            await env.DB.prepare("UPDATE p_email_intake_receipts SET status='uncertain' WHERE provider='resend' AND email_id=? AND intake_id=? AND status='claimed'").bind(emailId, id).run();
            const stored = await env.DB.prepare("SELECT id FROM p_records WHERE business='main' AND kind='emailIntake' AND id=?").bind(id).first();
            if (!stored) await Promise.allSettled(retained.map(key => env.ORIGINALS.delete(key)));
        }
        throw new Fault(502, 'Inbound email needs owner reconciliation; the provider receipt is retained');
    }
});

emailIntakeApi.get('/api/purse/email-intake/:id', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB);
    const intake = get(state, 'emailIntake', c.req.param('id')); intakeScope(state, a, intake);
    await readFence(c.env.DB, a, revision); return c.json(intake);
});
emailIntakeApi.get('/api/purse/email-intake/:id/files/:file', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB);
    const intake = get(state, 'emailIntake', c.req.param('id')); intakeScope(state, a, intake);
    const file = [intake.original, ...intake.files].find((f: Data) => f.id === c.req.param('file'));
    requireThat(file, 'Email source file not found', 404);
    requireThat(file.key === `intake/${intake.id}/${file.id}`, 'Invalid email source custody', 409);
    const original = await c.env.ORIGINALS.get(file.key); requireThat(original, 'Email source unavailable', 409);
    const bytes = new Uint8Array(await original.arrayBuffer());
    requireThat(bytes.length === file.size && await intakeSha256(bytes) === file.sha256, 'Email source custody mismatch', 409);
    await readFence(c.env.DB, a, revision);
    return new Response(bytes, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'", 'referrer-policy': 'no-referrer' } });
});

emailIntakeApi.get('/api/purse/email-intake-receipts', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB); requirePermission(state, a, 'intake.admin');
    const receipts = await c.env.DB.prepare('SELECT provider,email_id,intake_id,status,created_at FROM p_email_intake_receipts ORDER BY created_at DESC LIMIT 200').all<Data>();
    const globalAdmin = unrestrictedIntakeAdmin(state, a);
    const visible = receipts.results.filter(receipt => {
        const intake = state.get('emailIntake:' + receipt.intake_id)?.value;
        return intake ? intakeAdminAllowed(state, a, intake) : globalAdmin;
    });
    await readFence(c.env.DB, a, revision); return c.json({ receipts: visible });
});
