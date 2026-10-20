import { runtimeBindings, type Bindings } from '../auth.server';
import { operatorMail } from '../mail.server.mjs';
import { buildValueSnapshot, valueDelivery } from './agent-value';
import { load } from './store';
import { all, key, uid, type Data, type State } from './types';

const day = 86400000;
const nativeRequester = "EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND lower(email)=? AND status='active' AND (?=1 OR (role='owner' AND ?=1)))";

function approved(s: State, request: Data) {
    if (request.imported || !request.valuePromise || request.status !== 'approved') return;
    const source = s.get(key('revision', `${request.id}:${request.revision}`))?.value;
    if (!source || source.imported || JSON.stringify(source.valuePromise) !== JSON.stringify(request.valuePromise)) return;
    return all(s, 'decision').find(d => !d.imported && d.request === request.id && d.revision === request.revision
        && d.decision === 'approved' && Number.isFinite(Date.parse(d.at)));
}

function membership(s: State, request: Data) {
    return all(s, 'member').some(m => m.active === true && m.email.toLowerCase() === request.requesterEmail.toLowerCase()
        && Array.isArray(m.roles) && m.roles.includes('requester'));
}

function message(env: Bindings, request: Data, intervalDays: number, confirmationUrl: string) {
    return { from: env.MAIL_FROM ?? '', to: [request.requesterEmail.toLowerCase()],
        subject: `Usefulness check-in: ${request.title}`,
        text: `${intervalDays}-day requester check-in after the first recorded delivery for approved request revision ${request.revision}.\nPlease confirm whether this purchase was useful and review the exact evidence: ${confirmationUrl}\nDeterministic v1, model/provider: none. Missing evidence remains unknown; this request does not establish realized savings.`,
        html: '', headers: {} };
}

function companion(event: Data) {
    return { id: event.run, workflow: 'value-realization', actor: event.requester, request: event.request,
        revision: event.revision, inputs: event.inputs, sources: event.sources, report: event.report,
        references: event.references, fingerprint: event.inputs.fingerprint, version: 1,
        mode: event.mode, model: event.model, provider: event.provider, at: event.at,
        messages: [event.message], proposals: [`${event.run}:confirm`], outcomes: [event.outcome], checkin: event.id };
}

async function send(env: Bindings, event: Data, now: number): Promise<Data> {
    const suppressed = { recipient: event.requesterEmail, status: 'suppressed' };
    const fresh = await load(env.DB), request = fresh.state.get(key('request', event.request))?.value;
    const decision = request && approved(fresh.state, request);
    const delivery = request && valueDelivery(fresh.state, request, request.revision);
    if (!request || !decision || request.revision !== event.revision || decision.id !== event.approvedDecision
        || decision.at !== event.approvedAt || now < Date.parse(event.dueAt)) return { ...suppressed, code: 'obsolete' };
    if (!delivery || delivery.receipt !== event.deliveryReceipt || delivery.at !== event.deliveredAt || delivery.order !== event.order
        || event.dueAt !== new Date(Date.parse(delivery.at) + event.intervalDays * day).toISOString()) return { ...suppressed, code: 'delivery-changed' };
    const policy = fresh.state.get(key('valuePolicy', 'main'))?.value;
    if (!policy?.enabled || policy.version !== event.policyVersion) return { ...suppressed, code: 'paused-or-policy-changed' };
    const member = membership(fresh.state, request);
    if (request.requester !== event.requester || request.requesterEmail.toLowerCase() !== event.requesterEmail
        || (!member && request.requesterOwner !== true)) return { ...suppressed, code: 'requester-capability-revoked' };
    const snapshot = await buildValueSnapshot(fresh.state, request, event.revision);
    if (snapshot.fingerprint !== event.inputs.fingerprint) return { ...suppressed, code: 'evidence-changed' };
    const sender = operatorMail(env);
    if (!sender || !env.MAIL_FROM) return { ...suppressed, status: 'unavailable' };
    // The domain revision covers the current request, exact decision, policy and membership.
    // Owner self-requests require the same current native identity and current owner role.
    const permitted = await env.DB.prepare(`SELECT 1 AS ok WHERE (SELECT revision FROM p_meta WHERE id=1)=? AND ${nativeRequester}`)
        .bind(fresh.revision, event.requester, event.requesterEmail, member ? 1 : 0, request.requesterOwner === true ? 1 : 0).first<{ ok: number }>();
    if (!permitted?.ok) return { ...suppressed, code: 'current-authority-changed' };
    try {
        const result = await sender.send(event.message);
        const status = result.status === 'development' ? 'suppressed'
            : ['accepted', 'uncertain'].includes(result.status) ? result.status : 'unavailable';
        return { recipient: event.requesterEmail, status, delivery: result };
    } catch { return { recipient: event.requesterEmail, status: 'uncertain' }; }
}

async function attempt(env: Bindings, requestId: string, requestRevision: number, intervalDays: number, now: number) {
    const { state, revision } = await load(env.DB), request = state.get(key('request', requestId))?.value;
    if (!request || request.revision !== requestRevision) return;
    const decision = approved(state, request);
    const delivery = valueDelivery(state, request, request.revision);
    if (!decision || !delivery || now < Date.parse(delivery.at) + intervalDays * day) return;
    const id = `${request.id}:${request.revision}:${intervalDays}`;
    if (state.has(key('valueCheckin', id))) return;
    const inputs = await buildValueSnapshot(state, request, request.revision);
    const url = new URL('/app', env.AUTH_ORIGIN);
    url.searchParams.set('valueRequest', request.id);
    url.searchParams.set('valueRevision', String(request.revision));
    const event: Data = { id, request: request.id, revision: request.revision, intervalDays,
        approvedDecision: decision.id, approvedAt: decision.at, deliveryReceipt: delivery.receipt, deliveredAt: delivery.at, order: delivery.order,
        dueAt: new Date(Date.parse(delivery.at) + intervalDays * day).toISOString(),
        policyVersion: state.get(key('valuePolicy', 'main'))?.value.version ?? null,
        requester: request.requester, requesterEmail: request.requesterEmail.toLowerCase(), at: new Date(now).toISOString(),
        run: `value-checkin:${id}`, inputs, sources: inputs.sources, report: inputs.assessment, references: inputs.references,
        mode: inputs.mode, model: 'none', provider: 'none', confirmationUrl: url.href,
        outcome: { recipient: request.requesterEmail.toLowerCase(), status: 'uncertain' } };
    event.message = { ...message(env, request, intervalDays, url.href), deliveryId: `value-checkin:${id}` };
    const claimVersion = uid();
    const insert = (kind: string, recordId: string, value: Data) => env.DB.prepare(`INSERT OR IGNORE INTO p_records(business,kind,id,revision,value)
        SELECT 'main',?,?,?,? WHERE EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='valueCheckin' AND id=? AND revision=?)`)
        .bind(kind, recordId, uid(), JSON.stringify(value), id, claimVersion);
    const audit: Data = { id: event.run, actor: 'system', email: '', action: 'value-checkin', record: request.id,
        at: event.at, revision: request.revision, checkin: id, intervalDays, outcome: 'uncertain' };
    // All provenance is durable before mail. An interrupted claim is consumed forever.
    const claimed = await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO p_records(business,kind,id,revision,value)
            SELECT 'main','valueCheckin',?,?,? WHERE (SELECT revision FROM p_meta WHERE id=1)=?`)
            .bind(id, claimVersion, JSON.stringify(event), revision),
        insert('agentRun', event.run, companion(event)),
        insert('proposedAction', `${event.run}:confirm`, { id: `${event.run}:confirm`, run: event.run, runVersion: 1,
            actor: event.requester, action: 'value-confirm', input: { id: event.run, version: 1, request: request.id,
                revision: request.revision, fingerprint: inputs.fingerprint }, status: 'proposed', references: inputs.references }),
        insert('audit', audit.id, audit),
    ]);
    if (!claimed[0].meta.changes) return;
    event.outcome = await send(env, event, now);
    audit.outcome = event.outcome.status;
    const update = (kind: string, recordId: string, value: Data) => env.DB.prepare("UPDATE p_records SET revision=?,value=? WHERE business='main' AND kind=? AND id=?")
        .bind(uid(), JSON.stringify(value), kind, recordId);
    await env.DB.batch([update('valueCheckin', id, event),
        // A requester may confirm while the mail edge is pending; preserve appended confirmation outcomes.
        env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.outcomes[0]',json(?)) WHERE business='main' AND kind='agentRun' AND id=?")
            .bind(uid(), JSON.stringify(event.outcome), event.run),
        update('audit', audit.id, audit)]);
    return event;
}

/** Exact elapsed UTC durations from the approved revision's first native delivery; each interval is consumed once, including while paused. */
export async function runValueCheckins(original: Bindings, now = Date.now()): Promise<{ events: Data[] }> {
    const env = runtimeBindings(original), initial = await load(env.DB), events: Data[] = [];
    for (const request of all(initial.state, 'request')) {
        for (const intervalDays of [30, 90]) {
            const event = await attempt(env, request.id, request.revision, intervalDays, now);
            if (event) events.push(event);
        }
    }
    return { events };
}
