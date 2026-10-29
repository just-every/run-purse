import { notificationInserts } from './notifications';
import type { Bindings } from '../auth.server';
import { operatorMail } from '../mail.server.mjs';
import { agentPolicies, purchaseTypes, requireAgentPolicies } from './agent-governance';
import { agentRecordInsert, chaseInputs, chaseRun } from './agent-chase-record';
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
    requireThat(b.agent === undefined || b.agent === null || b.agent === 'AGENT-003', 'Choose the native late-order agent or the ordinary chase schedule');
    if (b.agent === 'AGENT-003') {
        const controls = requireAgentPolicies(s, 'AGENT-003', purchaseTypes(order));
        requireThat(controls.every(control => b.cadenceDays >= control.cadenceDays && b.maxChases <= control.maxChases), 'The PO schedule exceeds the owner’s agent cadence or count limits', 409);
    }
    const escalateTo = text(b.escalateTo, 'Escalation email', 254).toLowerCase();
    requireThat(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(escalateTo), 'Use a valid escalation email');
    const escalateToOwner = a.owner && escalateTo === a.email.toLowerCase();
    requireThat(escalateToOwner || buyer(s, escalateTo, order), 'Escalation requires an active buyer in this PO scope or the configuring owner');
    const { history = [], ...snapshot } = previous ?? {};
    put(s, 'orderChasePolicy', order.id, { order: order.id, version: (previous?.version ?? 0) + 1,
        enabled: b.enabled, cadenceDays: b.cadenceDays, maxChases: b.maxChases, escalateTo, escalateToOwner,
        agent: b.agent ?? null, actor: a.id, email: a.email, owner: a.owner, operatorVersion: a.version, at: new Date().toISOString(),
        history: previous ? [...structuredClone(history), structuredClone(snapshot)] : [] });
    audit(s, a, op, order.id, { version: (previous?.version ?? 0) + 1, enabled: b.enabled, escalateTo });
    return get(s, 'orderChasePolicy', order.id);
}

function eligible(s: State, order: Data, now: number): boolean {
    if (order.imported || !order.issuedAt || order.status !== 'issued' || order.amendedBy
        || !order.lines.some((line: Data) => linePosition(s, order.id, line).outstanding > 0)) return false;
    if (all(s,'orderSend').some(event => event.order === order.id && event.revision === order.revision && event.response?.decision === 'reject')) return false;
    try {
        const currentSupplier = canonicalSupplier(s, order.supplier);
        supplier(s, currentSupplier);
        return !lapsedSupplierDocuments(s, currentSupplier, now).length;
    } catch (error) { if (error instanceof Fault && [404, 409].includes(error.status)) return false; throw error; }
}

function due(s: State, order: Data, policy: Data, now: number): { reason: string; evidence: Data | null; supplierAcknowledgment: Data | null } | null {
    const evidence = all(s, 'supplierOrderEvidence').find(row => row.order === order.id) ?? null;
    const sent = all(s, 'orderSend').find(row => row.order === order.id && row.revision === order.revision && row.acknowledgment?.revision === order.revision);
    const supplierAcknowledgment = sent ? { send: sent.id, revision: sent.revision, pdfSha256: sent.pdf.sha256, at: sent.acknowledgment.at } : null;
    const parts = calendar.formatToParts(now), part = (name: string) => parts.find(p => p.type === name)!.value;
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    const deliveryDate = evidence?.promisedDate || order.needDate;
    const overdue = Boolean(deliveryDate && today > deliveryDate);
    const unacknowledged = !supplierAcknowledgment && !evidence?.acknowledgedAt && now >= Date.parse(order.issuedAt) + policy.cadenceDays * dayMs;
    if (!overdue && !unacknowledged) return null;
    return { reason: overdue && unacknowledged ? 'unacknowledged-and-overdue-delivery' : overdue ? 'overdue-delivery' : 'unacknowledged',
        supplierAcknowledgment, evidence: evidence ? { id: evidence.id, version: evidence.version, acknowledgedAt: evidence.acknowledgedAt,
            promisedDate: evidence.promisedDate, source: evidence.source, actor: evidence.actor, at: evidence.at } : null };
}

function communication(order: Data, evidence: Data | null, supplierAcknowledgment: Data | null): string {
    const acknowledgment = supplierAcknowledgment ? `Supplier-link acknowledgment of approved revision ${supplierAcknowledgment.revision}: ${supplierAcknowledgment.at}; stated identity is unverified.` : evidence?.acknowledgedAt ? `Acknowledgment recorded by a buyer: ${evidence.acknowledgedAt}.` : 'No supplier acknowledgment has been recorded by a buyer.';
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

function message(env: Bindings, event: Data, order: Data, policy: Data) {
    const context = communication(order, event.evidence, event.supplierAcknowledgment ?? null);
    return { deliveryId: `order-chase:${event.id}`, from: env.MAIL_FROM ?? '', to: [event.outcome.recipient],
        subject: `${event.kind === 'chase' ? 'PO follow-up' : 'PO chase escalation'}: ${order.number}`,
        text: event.kind === 'chase'
            ? `Please confirm acknowledgment and current delivery timing for ${order.number}. ${context} Scheduled chase ${event.sequence} of ${policy.maxChases}.`
            : `${order.number} reached its configured limit of ${policy.maxChases} scheduled chase attempts. ${context} Mail acceptance does not establish delivery. Review the PO in Purse: ${new URL('/app', env.AUTH_ORIGIN).href}`,
        html: '', headers: {} };
}

async function policyAuthority(env: Bindings, state: State, policy: Data, order: Data): Promise<RecipientFence | undefined> {
    if (!Number.isSafeInteger(policy.operatorVersion)) return;
    if (!policy.owner && !buyer(state, policy.email, order)) return;
    const sql = `EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND lower(email)=? AND version=? AND status='active'${policy.owner ? " AND role='owner'" : ''})`;
    const params = [policy.actor, policy.email.toLowerCase(), policy.operatorVersion];
    if (!await env.DB.prepare(`SELECT 1 AS ok WHERE ${sql}`).bind(...params).first()) return;
    return { sql, params };
}
function governance(s: State, policy: Data, order: Data) {
    if (policy.agent !== 'AGENT-003') return [];
    const controls = agentPolicies(s, 'AGENT-003', purchaseTypes(order));
    return controls?.every(control => policy.cadenceDays >= control.cadenceDays && policy.maxChases <= control.maxChases) ? controls : undefined;
}

/** The claim is durable; every effect then rechecks pause, native identity, grants and source facts. */
async function send(env: Bindings, event: Data, order: Data, policy: Data, now: number): Promise<Data> {
    const outcome: Data = { recipient: event.outcome.recipient, status: 'unavailable', at: new Date(now).toISOString() };
    if (!outcome.recipient || !env.MAIL_FROM) return outcome;
    const fresh = await load(env.DB), currentPolicy = fresh.state.get(key('orderChasePolicy', order.id))?.value;
    const currentOrder = fresh.state.get(key('order', order.id))?.value;
    if (!currentPolicy?.enabled || currentPolicy.version !== policy.version || !currentOrder
        || !eligible(fresh.state, currentOrder, now) || !governance(fresh.state, currentPolicy, currentOrder)) return outcome;
    const currentDue = due(fresh.state, currentOrder, currentPolicy, now);
    if (!currentDue || currentDue.reason !== event.reason || JSON.stringify(currentDue.evidence) !== JSON.stringify(event.evidence)
        || JSON.stringify(currentDue.supplierAcknowledgment) !== JSON.stringify(event.supplierAcknowledgment)) return outcome;
    const principal = await policyAuthority(env, fresh.state, currentPolicy, currentOrder);
    if (!principal) return outcome;
    const recipient = event.kind === 'escalation' ? await escalationAuthority(env, fresh.state, currentPolicy, currentOrder) : undefined;
    if (event.kind === 'escalation' && !recipient) return outcome;
    const permitted = await env.DB.prepare(`SELECT 1 AS ok WHERE (SELECT revision FROM p_meta WHERE id=1)=? AND ${principal.sql}${recipient ? ' AND '+recipient.sql : ''}`)
        .bind(fresh.revision, ...principal.params, ...(recipient?.params ?? [])).first();
    if (!permitted) return outcome;
    try {
        const sender = operatorMail(env);
        if (!sender) return outcome;
        return { ...outcome, ...await sender.send(event.message) };
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
    const controls = governance(state, policy, order), principal = await policyAuthority(env, state, policy, order);
    if (!controls || !principal) return;
    const current = due(state, order, policy, now);
    if (!current || current.evidence && Date.parse(current.evidence.at) > now) return;
    const events = all(state, 'orderChaseEvent').filter(event => event.order === order.id && event.policyVersion === policy.version);
    const chases = events.filter(event => event.kind === 'chase').sort((left, right) => left.sequence - right.sequence);
    const last = chases.at(-1), count = last?.sequence ?? 0;
    if (escalation ? count < policy.maxChases || events.some(event => event.kind === 'escalation')
        : count >= policy.maxChases || last && now - Date.parse(last.at) < policy.cadenceDays * dayMs) return;
    const sequence = escalation ? policy.maxChases + 1 : count + 1, kind = escalation ? 'escalation' : 'chase';
    const recipient = escalation ? await escalationAuthority(env, state, policy, order) : undefined;
    if (escalation && !recipient) return;
    const id = `${order.id}:${policy.version}:${escalation ? 'escalation' : `chase:${sequence}`}`;
    const event: Data = { id, order: order.id, policyVersion: policy.version, sequence, kind, reason: current.reason,
        at: new Date(now).toISOString(), startedAt: new Date().toISOString(), actor: policy.actor, request: order.request, revision: order.revision, agent: policy.agent ?? null, evidence: current.evidence, supplierAcknowledgment: current.supplierAcknowledgment,
        outcome: { recipient: escalation ? policy.escalateTo : order.supplierSnapshot?.contacts?.[0]?.email ?? '', status: 'unknown' } };
    event.message = message(env, event, order, policy);
    event.mailProvider = env.MAIL_PROVIDER ?? 'none';
    if (policy.agent === 'AGENT-003') {
        event.inputs = chaseInputs(state, order, policy, controls, event);
        event.sources = [{ kind: 'order', id: order.id, version: orderRow.revision, value: event.inputs.order },
            ...(current.evidence ? [{ kind: 'supplierOrderEvidence', id: current.evidence.id, version: current.evidence.version, value: current.evidence }] : []),
            ...(current.supplierAcknowledgment ? [{ kind: 'orderAcknowledgment', id: current.supplierAcknowledgment.send, value: current.supplierAcknowledgment }] : [])];
        event.references = [{ kind: 'order', id: order.id, version: orderRow.revision }];
    }
    const claimVersion = uid(), runVersion = uid();
    const conditionalInsert = (kind: string, recordId: string, value: Data) => env.DB.prepare(`INSERT OR IGNORE INTO p_records(business,kind,id,revision,value)
        SELECT 'main',?,?,?,? WHERE EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='orderChaseEvent' AND id=? AND revision=?)`)
        .bind(kind, recordId, uid(), JSON.stringify(value), id, claimVersion);
    const claimed = await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO p_records(business,kind,id,revision,value)
        SELECT 'main','orderChaseEvent',?,?,? WHERE (SELECT revision FROM p_meta WHERE id=1)=?
        AND EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='orderChasePolicy' AND id=? AND revision=?)
        AND EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='order' AND id=? AND revision=?) AND ${principal.sql}${recipient ? ' AND '+recipient.sql : ''}`)
            .bind(id, claimVersion, JSON.stringify(event), revision, policyId, policyRow.revision, order.id, orderRow.revision,
                ...principal.params, ...(recipient?.params ?? [])),
        ...(policy.agent === 'AGENT-003' ? [agentRecordInsert(env.DB, event, policy, claimVersion, runVersion)] : []),
        conditionalInsert('audit', 'chase-claim:'+id, { id: 'chase-claim:'+id, actor: policy.actor, email: policy.email,
            action: 'order-chase-claimed', record: order.id, revision: order.revision, chase: id, agent: policy.agent ?? null,
            policyVersion: policy.version, kind, sequence, at: event.startedAt }),
    ]);
    if (!claimed[0].meta.changes) return;
    event.outcome = await send(env, event, order, policy, now);
    // An erasure/cleanup while mail is in flight changes these row revisions.
    // Never replace that newer source record with a pre-erasure snapshot.
    const outcomeVersion=uid();
    const notificationRows=await notificationInserts(env.DB,(await load(env.DB)).state,[{kind:'orderChaseEvent',value:event}],{kind:'orderChaseEvent',id,revision:outcomeVersion});
    await env.DB.batch([
        env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.outcome',json(?)) WHERE business='main' AND kind='orderChaseEvent' AND id=? AND revision=?")
            .bind(outcomeVersion, JSON.stringify(event.outcome), id, claimVersion),
        ...(policy.agent === 'AGENT-003' ? [env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.outcomes[0]',json(?)) WHERE business='main' AND kind='agentRun' AND id=? AND revision=?")
            .bind(uid(), JSON.stringify(event.outcome), chaseRun(event, policy).id, runVersion)] : []),
        env.DB.prepare("INSERT OR IGNORE INTO p_records(business,kind,id,revision,value) VALUES('main','audit',?,?,?)")
            .bind('chase-outcome:'+id, uid(), JSON.stringify({ id: 'chase-outcome:'+id, actor: 'scheduled', email: '', action: 'order-chase-outcome',
                record: order.id, revision: order.revision, chase: id, claim: 'chase-claim:'+id, status: event.outcome.status, at: new Date().toISOString() })),
        ...notificationRows,
    ]);
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
