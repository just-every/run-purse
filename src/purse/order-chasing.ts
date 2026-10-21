import type { Bindings } from '../auth.server';
import { operatorMail } from '../mail.server.mjs';
import { supplier } from './admin';
import { linePosition } from './orders';
import { load } from './store';
import { canonicalSupplier } from './supplier-identity';
import { lapsedSupplierDocuments } from './supplier-documents';
import { all, allowed, audit, Fault, get, key, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';

const dayMs = 86400000;
const calendar = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const buyer = (s: State, email: string, order: Data) => allowed(s, { id: '', email, owner: false, dev: false, session: '', version: 0 }, 'procurement.manage', order);

/** Configuration records the buyer's decision; it never supplies a synthetic cron identity. */
export function orderChasing(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op !== 'order-chase-policy') return;
    requirePermission(s, a, 'procurement.manage');
    const order = get(s, 'order', text(b.order, 'PO', 200));
    requirePermission(s, a, 'procurement.manage', order);
    requireThat(!order.imported && order.issuedAt && ['issued', 'closed'].includes(order.status) && !order.amendedBy, 'Choose a current natively issued PO', 409);
    const previous = s.has(key('orderChasePolicy', order.id)) ? get(s, 'orderChasePolicy', order.id) : undefined;
    requireThat(b.version === (previous?.version ?? 0), 'PO chase policy changed; reload', 409);
    requireThat(typeof b.enabled === 'boolean', 'Enabled must be true or false');
    requireThat(Number.isSafeInteger(b.cadenceDays) && b.cadenceDays >= 1 && b.cadenceDays <= 30, 'Chase cadence must be 1–30 whole days');
    requireThat(Number.isSafeInteger(b.maxChases) && b.maxChases >= 1 && b.maxChases <= 20, 'Chase limit must be 1–20 whole attempts');
    const escalateTo = text(b.escalateTo, 'Escalation email', 254).toLowerCase();
    requireThat(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(escalateTo), 'Use a valid escalation email');
    const escalateToOwner = a.owner && escalateTo === a.email.toLowerCase();
    requireThat(escalateToOwner || buyer(s, escalateTo, order), 'Escalation requires an active buyer in this PO scope or the configuring owner');
    const { history = [], ...snapshot } = previous ?? {};
    put(s, 'orderChasePolicy', order.id, { order: order.id, version: (previous?.version ?? 0) + 1,
        enabled: b.enabled, cadenceDays: b.cadenceDays, maxChases: b.maxChases, escalateTo, escalateToOwner,
        actor: a.id, email: a.email, owner: a.owner, at: new Date().toISOString(),
        history: previous ? [...structuredClone(history), structuredClone(snapshot)] : [] });
    audit(s, a, op, order.id, { version: (previous?.version ?? 0) + 1, enabled: b.enabled, escalateTo });
    return get(s, 'orderChasePolicy', order.id);
}

function eligible(s: State, order: Data, now: number): boolean {
    if (order.imported || !order.issuedAt || order.status !== 'issued' || order.amendedBy
        || !order.lines.some((line: Data) => linePosition(s, order.id, line).outstanding > 0)) return false;
    try {
        const currentSupplier = canonicalSupplier(s, order.supplier);
        supplier(s, currentSupplier);
        return !lapsedSupplierDocuments(s, currentSupplier, now).length;
    } catch (error) { if (error instanceof Fault && [404, 409].includes(error.status)) return false; throw error; }
}

function due(s: State, order: Data, policy: Data, now: number): { reason: string; evidence: Data | null } | null {
    const evidence = all(s, 'supplierOrderEvidence').find(row => row.order === order.id) ?? null;
    const parts = calendar.formatToParts(now), part = (name: string) => parts.find(p => p.type === name)!.value;
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    const deliveryDate = evidence?.promisedDate || order.needDate;
    const overdue = Boolean(deliveryDate && today > deliveryDate);
    const unacknowledged = !evidence?.acknowledgedAt && now >= Date.parse(order.issuedAt) + policy.cadenceDays * dayMs;
    if (!overdue && !unacknowledged) return null;
    return { reason: overdue && unacknowledged ? 'unacknowledged-and-overdue-delivery' : overdue ? 'overdue-delivery' : 'unacknowledged',
        evidence: evidence ? { id: evidence.id, version: evidence.version, acknowledgedAt: evidence.acknowledgedAt,
            promisedDate: evidence.promisedDate, source: evidence.source, actor: evidence.actor, at: evidence.at } : null };
}

function communication(order: Data, evidence: Data | null): string {
    const acknowledgment = evidence?.acknowledgedAt ? `Acknowledgment recorded by a buyer: ${evidence.acknowledgedAt}.` : 'No supplier acknowledgment has been recorded by a buyer.';
    return `${acknowledgment} ${evidence?.promisedDate ? `Buyer-recorded supplier promise: ${evidence.promisedDate}.` : `PO need date: ${order.needDate}.`}`;
}

type RecipientFence = { sql: string; params: (string | number)[] };
async function escalationAuthority(env: Bindings, state: State, policy: Data, order: Data): Promise<RecipientFence | undefined> {
    const native = await env.DB.prepare("SELECT id,email,version,role FROM oa_operators WHERE lower(email)=? AND status='active'").bind(policy.escalateTo).first<{id: string; email: string; version: number; role: string}>();
    if (!native) return;
    if (policy.escalateToOwner) {
        if (policy.owner !== true || policy.actor !== native.id || policy.email.toLowerCase() !== policy.escalateTo || native.role !== 'owner') return;
    } else if (!buyer(state, native.email, order)) return;
    return {
        sql: `EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND lower(email)=? AND version=? AND status='active'${policy.escalateToOwner ? " AND role='owner'" : ''})`,
        params: [native.id, policy.escalateTo, native.version],
    };
}

async function send(env: Bindings, event: Data, order: Data, policy: Data, authorized: boolean, now: number): Promise<Data> {
    const outcome: Data = { recipient: event.outcome.recipient, status: 'unavailable', at: new Date(now).toISOString() };
    if (!authorized || !outcome.recipient || !env.MAIL_FROM) return outcome;
    if (event.kind === 'escalation') {
        // The claim itself advanced the revision. Read current grants and the
        // actual PO again, then fence that snapshot and native recipient just
        // before mail. Revoked or moved grants never receive an old alert.
        const { state, revision } = await load(env.DB), currentPolicy = state.get(key('orderChasePolicy', policy.order))?.value;
        const currentOrder = state.get(key('order', order.id))?.value;
        if (!currentPolicy?.enabled || currentPolicy.version !== policy.version || !currentOrder || !eligible(state, currentOrder, now) || !due(state, currentOrder, currentPolicy, now)) return outcome;
        const recipient = await escalationAuthority(env, state, currentPolicy, currentOrder);
        if (!recipient) return outcome;
        const current = await env.DB.prepare(`SELECT 1 AS ok WHERE (SELECT revision FROM p_meta WHERE id=1)=? AND ${recipient.sql}`).bind(revision, ...recipient.params).first<{ok: number}>();
        if (!current?.ok) return outcome;
    }
    try {
        const sender = operatorMail(env);
        if (!sender) return outcome;
        const context = communication(order, event.evidence);
        const body = event.kind === 'chase'
            ? `Please confirm acknowledgment and current delivery timing for ${order.number}. ${context} Scheduled chase ${event.sequence} of ${policy.maxChases}.`
            : `${order.number} reached its configured limit of ${policy.maxChases} scheduled chase attempts. ${context} Mail acceptance does not establish delivery. Review the PO in Purse: ${new URL('/app', env.AUTH_ORIGIN).href}`;
        const result = await sender.send({ deliveryId: `order-chase:${event.id}`, from: env.MAIL_FROM, to: [outcome.recipient],
            subject: `${event.kind === 'chase' ? 'PO follow-up' : 'PO chase escalation'}: ${order.number}`, text: body, html: '', headers: {} });
        return { ...outcome, ...result };
    } catch { return { ...outcome, status: 'uncertain' }; }
}

/** Claiming the deterministic event consumes the attempt, even if a worker stops before saving its outcome. */
async function attempt(env: Bindings, policyId: string, escalation: boolean, now: number): Promise<Data | undefined> {
    const { state, revision } = await load(env.DB), policyRow = state.get(key('orderChasePolicy', policyId));
    if (!policyRow) return;
    const policy = policyRow.value, orderRow = state.get(key('order', policy.order));
    if (!policy.enabled || !orderRow || Date.parse(policy.at) > now) return;
    const order: Data = { ...orderRow.value, id: orderRow.id };
    if (!eligible(state, order, now)) return;
    const current = due(state, order, policy, now);
    if (!current || current.evidence && Date.parse(current.evidence.at) > now) return;
    const events = all(state, 'orderChaseEvent').filter(event => event.order === order.id && event.policyVersion === policy.version);
    const chases = events.filter(event => event.kind === 'chase').sort((left, right) => left.sequence - right.sequence);
    const last = chases.at(-1), count = last?.sequence ?? 0;
    if (escalation ? count < policy.maxChases || events.some(event => event.kind === 'escalation')
        : count >= policy.maxChases || last && now - Date.parse(last.at) < policy.cadenceDays * dayMs) return;
    const sequence = escalation ? policy.maxChases + 1 : count + 1, kind = escalation ? 'escalation' : 'chase';
    const recipient = escalation ? await escalationAuthority(env, state, policy, order) : undefined;
    const authorized = !escalation || Boolean(recipient);
    const id = `${order.id}:${policy.version}:${escalation ? 'escalation' : `chase:${sequence}`}`;
    const event: Data = { id, order: order.id, policyVersion: policy.version, sequence, kind, reason: current.reason,
        at: new Date(now).toISOString(), evidence: current.evidence,
        outcome: { recipient: escalation ? policy.escalateTo : order.supplierSnapshot?.contacts?.[0]?.email ?? '', status: 'unknown' } };
    // The state revision also fences receipts, closures, evidence, supplier merges and compliance edits.
    const recipientFence = recipient ? ` AND ${recipient.sql}` : '';
    const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO p_records(business,kind,id,revision,value)
        SELECT 'main','orderChaseEvent',?,?,? WHERE (SELECT revision FROM p_meta WHERE id=1)=?
        AND EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='orderChasePolicy' AND id=? AND revision=?)
        AND EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='order' AND id=? AND revision=?)${recipientFence}`)
        .bind(id, uid(), JSON.stringify(event), revision, policyId, policyRow.revision, order.id, orderRow.revision,
            ...(recipient?.params ?? [])).run();
    if (!inserted.meta.changes) return;
    event.outcome = await send(env, event, order, policy, authorized, now);
    await env.DB.prepare("UPDATE p_records SET revision=?,value=? WHERE business='main' AND kind='orderChaseEvent' AND id=?")
        .bind(uid(), JSON.stringify(event), id).run();
    return event;
}

/** Called by the hourly scheduler; no event ID is sent twice and policy versions have independent limits. */
export async function runOrderChases(env: Bindings, now = Date.now()): Promise<{ events: Data[] }> {
    const { state } = await load(env.DB), events: Data[] = [];
    for (const policy of all(state, 'orderChasePolicy').filter(row => row.enabled)) {
        const chase = await attempt(env, policy.id, false, now);
        if (chase) events.push(chase);
        const escalation = await attempt(env, policy.id, true, now);
        if (escalation) events.push(escalation);
    }
    return { events };
}
