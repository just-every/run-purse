import { runtimeBindings, type Bindings } from '../auth.server';
import { operatorMail } from '../mail.server.mjs';
import { activeReceiver, receiptAssignment, receiptDay, receiptPrompts, receiptRecipient } from './receipt-routing';
import { load } from './store';
import { captureNotifications } from './notifications';
import { allowed, key, uid, type Data } from './types';

const activeRecipient = "EXISTS(SELECT 1 FROM oa_operators WHERE lower(email)=? AND status='active' AND (?=1 OR role='owner'))";

async function eventId(prompt: Data, day: string): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify([prompt.order, prompt.receiver.toLowerCase(), prompt.reason, day]));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return `${day}:${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Recheck the current assignment and outstanding receipt immediately before the external effect. */
async function send(env: Bindings, event: Data, now: number): Promise<Data> {
    const outcome: Data = { recipient: event.receiver, status: 'suppressed' };
    const { state, revision } = await load(env.DB);
    const prompt = receiptPrompts(state, now).find(row => row.order === event.order && row.reason === event.reason
        && row.receiver.toLowerCase() === event.receiver);
    const order = state.get(key('order', event.order));
    if (!prompt || !order) return { ...outcome, code: 'obsolete' };
    const assignment = receiptAssignment(state, { ...order.value, id: order.id });
    if (assignment.email.toLowerCase() !== event.receiver) return { ...outcome, code: 'obsolete' };
    const scopedOrder = { ...order.value, id: order.id };
    if (!receiptRecipient(state, event.receiver, scopedOrder)) return { ...outcome, code: 'obsolete' };
    const recipient = { id: '', email: event.receiver, owner: false, dev: false, session: '', version: 0 };
    const member = activeReceiver(state,event.receiver,scopedOrder) || !assignment.explicit && allowed(state,recipient,'request.edit',scopedOrder);
    const sender = operatorMail(env);
    if (!sender || !env.MAIL_FROM) return { ...outcome, status: 'unavailable' };
    const url = new URL('/app', env.AUTH_ORIGIN);
    url.searchParams.set('receipt', event.order);
    // The domain fence covers assignment rules, membership, receipts, invoices and PO changes.
    const authorized = await env.DB.prepare(`SELECT 1 AS ok WHERE (SELECT revision FROM p_meta WHERE id=1)=? AND ${activeRecipient}`)
        .bind(revision, event.receiver, member ? 1 : 0).first<{ ok: number }>();
    if (!authorized?.ok) return { ...outcome, code: 'authority-changed' };
    try {
        const result = await sender.send({ deliveryId: `receipt-prompt:${event.id}`, from: env.MAIL_FROM, to: [event.receiver],
            subject: `Receipt requested: ${prompt.number}`,
            text: `PO: ${prompt.number}\nDue date: ${prompt.needDate}\nSign in to record a partial or full receipt: ${url.href}`,
            html: '', headers: {} });
        const status = result.status === 'development' ? 'suppressed'
            : ['accepted', 'uncertain'].includes(result.status) ? result.status : 'unavailable';
        return { ...outcome, status, delivery: result };
    } catch { return { ...outcome, status: 'uncertain' }; }
}

async function attempt(env: Bindings, candidate: Data, now: number): Promise<Data | undefined> {
    const { state, revision } = await load(env.DB);
    const receiver = candidate.receiver.toLowerCase();
    const prompt = receiptPrompts(state, now).find(row => row.order === candidate.order && row.reason === candidate.reason
        && row.receiver.toLowerCase() === receiver);
    if (!prompt) return;
    const order = state.get(key('order', prompt.order));
    if (!order) return;
    const scopedOrder = { ...order.value, id: order.id };
    const assignment = receiptAssignment(state, scopedOrder);
    const recipient = { id: '', email: receiver, owner: false, dev: false, session: '', version: 0 };
    const member = activeReceiver(state, receiver, scopedOrder) || !assignment.explicit && allowed(state, recipient, 'request.edit', scopedOrder);
    const id = await eventId(prompt, receiptDay(state, now));
    const event: Data = { id, order: prompt.order, receiver, reason: prompt.reason, at: new Date(now).toISOString(),
        outcome: { recipient: receiver, status: 'uncertain' } };
    // A claimed attempt is consumed even if the worker stops before persisting the mail result.
    const next = structuredClone(state);
    next.set('receiptPromptEvent:' + id, { business: 'main', kind: 'receiptPromptEvent', id, revision: uid(), value: event });
    await captureNotifications(env.DB, state, next);
    const statements = [env.DB.prepare(`INSERT OR IGNORE INTO p_records(business,kind,id,revision,value)
        SELECT 'main','receiptPromptEvent',?,?,? WHERE (SELECT revision FROM p_meta WHERE id=1)=? AND ${activeRecipient}`)
        .bind(id, uid(), JSON.stringify(event), revision, receiver, member ? 1 : 0)];
    for (const row of next.values()) if (row.kind === 'notification' && !state.has('notification:' + row.id)) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO p_records(business,kind,id,revision,value) SELECT 'main','notification',?,?,? WHERE EXISTS(SELECT 1 FROM p_records WHERE kind='receiptPromptEvent' AND id=?) AND (SELECT revision FROM p_meta WHERE id=1)=? AND ${activeRecipient}`).bind(row.id,row.revision,JSON.stringify(row.value),id,revision + 1,receiver,member ? 1 : 0));
    const [inserted] = await env.DB.batch(statements);
    if (!inserted.meta.changes) return;
    event.outcome = await send(env, event, now);
    await env.DB.prepare("UPDATE p_records SET revision=?,value=? WHERE business='main' AND kind='receiptPromptEvent' AND id=?")
        .bind(uid(), JSON.stringify(event), id).run();
    return event;
}

/** Daily per-order/receiver/reason claims prevent duplicate sends from concurrent cron invocations. */
export async function runReceiptPrompts(original: Bindings, now = Date.now()): Promise<{ events: Data[] }> {
    const env = runtimeBindings(original), { state } = await load(env.DB), events: Data[] = [];
    for (const prompt of receiptPrompts(state, now)) {
        const event = await attempt(env, prompt, now);
        if (event) events.push(event);
    }
    return { events };
}
