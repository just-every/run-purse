import type { Bindings } from '../auth.server';
import { normalizeInbound, createResendAttachmentFetcher, verifyWebhook, readStream, type InboundMail } from '../inbound-mail.server.mjs';
import { intakeLimits } from './email-intake';
import { load } from './store';
import { retainThreadFile, threadAliasHash, threadInsert } from './order-thread-storage';
import { Fault, get, requireThat, uid, type Data } from './types';

/** Hydrate only the signed provider ID at the fixed origin, using Base's bounded attachment adapter. */
export async function hydrateOrderThreadMail(env: Bindings, emailId: string) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
    try {
        const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers: { authorization: `Bearer ${env.MAIL_API_KEY}`, accept: 'application/json' }, redirect: 'manual', signal: controller.signal });
        requireThat(response.status === 200, 'Inbound provider hydration unavailable', 502);
        const raw = await readStream(response.body, intakeLimits.maxRawBytes);
        const email = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
        const normalized = await normalizeInbound({ provider: 'resend', signedEmailId: emailId, email, fetchAttachment: createResendAttachmentFetcher({ apiKey: env.MAIL_API_KEY, maxAttachmentBytes: intakeLimits.maxAttachmentBytes }) }, intakeLimits);
        return { raw, normalized };
    } finally { clearTimeout(timer); }
}

/** Call only AFTER authenticating the email.received signature and hydrating that exact ID.
 * null means ordinary intake/AP owns the email; a PO alias must never become an intake request.
 * API JSON is retained byte-for-byte, including its historical addressing. The routing hash
 * table is installation authority and is never portable; an archive cannot reactivate it. */
export async function consumeOrderThreadInbound(env: Bindings, emailId: string, source: Uint8Array, normalized: InboundMail): Promise<Data | null> {
    requireThat(/^[a-zA-Z0-9_-]{1,128}$/.test(emailId), 'Invalid signed provider email ID');
    const candidates = normalized.to.map(email => email.toLowerCase()).filter(email => /^po-[a-f0-9]{48}@/.test(email));
    if (!candidates.length) return null;
    const existing = await env.DB.prepare("SELECT status FROM p_order_thread_receipts WHERE provider='resend' AND email_id=?").bind(emailId).first<Data>();
    if (existing) return { received: true, duplicate: true, status: existing.status };
    // One source email cannot be exposed to multiple unrelated POs.
    if (candidates.length !== 1) return { received: true, ignored: true };
    const hash = await threadAliasHash(candidates[0]);
    const route = await env.DB.prepare('SELECT thread,order_id FROM p_order_thread_routes WHERE hash=? AND expires_at>?').bind(hash, Date.now()).first<Data>();
    if (!route) return { received: true, ignored: true };
    const { state } = await load(env.DB), thread = get(state, 'orderThreadMessage', route.thread), order = get(state, 'order', route.order_id);
    // Provider-reported From is a correlation check, never verified supplier identity or authority.
    if (thread.direction !== 'outbound' || thread.order !== order.id || thread.erasure || !['accepted', 'uncertain'].includes(thread.status)
        || order.supplierSnapshot?.contactErased || order.supplierSnapshot?.erasure || thread.recipient !== normalized.from.toLowerCase() || thread.recipient.endsWith('@erased.invalid')) return { received: true, ignored: true };
    requireThat(normalized.subject.length <= 2000 && normalized.attachments.every(file => file.filename.length <= 2000), 'Supplier email metadata too large');
    const id = 'order-thread-inbound:resend:' + emailId, at = new Date().toISOString();
    const claimed = await env.DB.prepare("INSERT OR IGNORE INTO p_order_thread_receipts(provider,email_id,message,thread,status,created_at) VALUES('resend',?,?,?,'claimed',?)").bind(emailId, id, thread.id, at).run();
    if (!claimed.meta.changes) return { received: true, duplicate: true };
    const retained: string[] = []; let persisted = false;
    try {
        const original = await retainThreadFile(env.ORIGINALS, id, 'original', 'provider-email.json', 'application/json', source); retained.push(original.key);
        const files: Data[] = [];
        for (const attachment of normalized.attachments) {
            const file = await retainThreadFile(env.ORIGINALS, id, uid(), attachment.filename || 'attachment', attachment.contentType, attachment.content);
            files.push(file); retained.push(file.key);
        }
        const fresh = await load(env.DB), current = get(fresh.state, 'orderThreadMessage', thread.id), currentOrder = get(fresh.state, 'order', order.id);
        requireThat(!current.erasure && current.recipient === thread.recipient && !currentOrder.supplierSnapshot?.contactErased && !currentOrder.supplierSnapshot?.erasure, 'Supplier contact changed or was erased', 409);
        const event = { id, thread: thread.id, order: order.id, request: thread.request, supplier: thread.supplier, number: thread.number, revision: thread.revision, direction: 'inbound', subject: normalized.subject, body: normalized.text ?? '', sourceText: normalized.text, sourceHtml: normalized.html, provider: 'resend', providerEmailId: emailId, providerSender: normalized.from.toLowerCase(), senderVerified: false, messageId: normalized.messageId, actor: 'supplier-email', email: normalized.from.toLowerCase(), recipient: null, at, status: 'received', originalFormat: 'provider-api-json', original, files };
        await env.DB.batch([
            env.DB.prepare('INSERT INTO p_guard SELECT CASE WHEN (SELECT revision FROM p_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM p_order_thread_routes WHERE hash=? AND thread=? AND expires_at>?) THEN 1 ELSE 0 END').bind(fresh.revision, hash, thread.id, Date.now()),
            threadInsert(env.DB, 'orderThreadMessage', event),
            threadInsert(env.DB, 'audit', { id: uid(), action: 'order-thread-reply-received', record: order.id, message: id, thread: thread.id, actor: 'supplier-email', email: event.email, identityVerified: false, revision: thread.revision, provider: 'resend', providerEmailId: emailId, originalSha256: original.sha256, at }),
            env.DB.prepare("UPDATE p_order_thread_receipts SET status='stored' WHERE provider='resend' AND email_id=? AND message=?").bind(emailId, id),
            env.DB.prepare('DELETE FROM p_guard'),
        ]);
        persisted = true;
        return { received: true };
    } catch {
        if (!persisted) {
            await env.DB.prepare("UPDATE p_order_thread_receipts SET status='uncertain' WHERE provider='resend' AND email_id=? AND message=? AND status='claimed'").bind(emailId, id).run();
            const stored = await env.DB.prepare("SELECT id FROM p_records WHERE business='main' AND kind='orderThreadMessage' AND id=?").bind(id).first();
            if (!stored) await Promise.allSettled(retained.map(key => env.ORIGINALS.delete(key)));
        }
        throw new Fault(502, 'Supplier reply requires owner reconciliation; the durable receipt prevents automatic replay');
    }
}

/** Optional whole-request hook, invoked with request.clone() before ordinary intake claims.
 * Integrators sharing intake hydration should call consumeOrderThreadInbound instead. */
export async function orderThreadInbound(request: Request, env: Bindings): Promise<Response | null> {
    requireThat(env.EMAIL_INTAKE_WEBHOOK_SECRET && env.MAIL_API_KEY, 'Signed inbound email is not configured', 503);
    const raw = await readStream(request.body, 65_536);
    requireThat(await verifyWebhook({ provider: 'resend', rawBody: raw, headers: request.headers, key: env.EMAIL_INTAKE_WEBHOOK_SECRET, now: Date.now() }), 'Invalid inbound webhook signature', 401);
    let event: Data;
    try { event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { throw new Fault(400, 'Invalid inbound event'); }
    requireThat(event?.type === 'email.received' && /^[a-zA-Z0-9_-]{1,128}$/.test(event.data?.email_id ?? ''), 'Expected an email.received event');
    // Do not refetch provider bytes for a durable receipt redelivered under a new signature.
    const previous = await env.DB.prepare("SELECT status FROM p_order_thread_receipts WHERE provider='resend' AND email_id=?").bind(event.data.email_id).first<Data>();
    if (previous) return Response.json({ received: true, duplicate: true, status: previous.status }, { status: 202 });
    const intake = await env.DB.prepare("SELECT 1 AS found FROM p_email_intake_receipts WHERE provider='resend' AND email_id=?").bind(event.data.email_id).first();
    if (intake) return null;
    const source = await hydrateOrderThreadMail(env, event.data.email_id);
    const result = await consumeOrderThreadInbound(env, event.data.email_id, source.raw, source.normalized);
    return result ? Response.json(result, { status: 202 }) : null;
}
