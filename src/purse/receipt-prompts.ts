import { runtimeBindings, type Bindings } from '../auth.server';
import { operatorMail } from '../mail.server.mjs';
import { receiptAssignment, receiptDay, receiptPrompts } from './receipt-routing';
import { load } from './store';
import { all, key, uid, type Data } from './types';

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
    const member = all(state, 'member').some(row => row.active && row.email.toLowerCase() === event.receiver
        && (!assignment.explicit || row.roles.includes('receiver')));
    if (assignment.explicit && !member) return { ...outcome, code: 'obsolete' };
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
    const id = await eventId(prompt, receiptDay(state, now));
    const event: Data = { id, order: prompt.order, receiver, reason: prompt.reason, at: new Date(now).toISOString(),
        outcome: { recipient: receiver, status: 'uncertain' } };
    // A claimed attempt is consumed even if the worker stops before persisting the mail result.
    const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO p_records(business,kind,id,revision,value)
        SELECT 'main','receiptPromptEvent',?,?,? WHERE (SELECT revision FROM p_meta WHERE id=1)=?`)
        .bind(id, uid(), JSON.stringify(event), revision).run();
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
