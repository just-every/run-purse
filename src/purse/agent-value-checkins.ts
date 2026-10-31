import {companyConfigured,scheduledInvocation,type CompanyEffect} from '../agent-door/scheduled-identity.server';
import {valueDigest,canonicalValue} from './agent-value-evidence';
import { runtimeBindings, type Bindings } from '../auth.server';
import { operatorMail } from '../mail.server.mjs';
import { buildValueSnapshot, valueDelivery, valuePolicyAllows } from './agent-value';
import { load } from './store';
import { all, allowed, key, uid, requireThat, type Data, type State } from './types';

const day = 86400000;
const nativeRequester = "EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND lower(email)=? AND version=? AND status='active' AND (?=1 OR (role='owner' AND ?=1)))";

function approved(s: State, request: Data) {
    if (request.imported || !request.valuePromise || request.status !== 'approved') return;
    const source = s.get(key('revision', `${request.id}:${request.revision}`))?.value;
    if (!source || source.imported || JSON.stringify(source.valuePromise) !== JSON.stringify(request.valuePromise)) return;
    return all(s, 'decision').find(d => !d.imported && d.request === request.id && d.revision === request.revision
        && d.decision === 'approved' && Number.isFinite(Date.parse(d.at)));
}

function membership(s: State, request: Data) {
    return allowed(s, {id:request.requester,email:request.requesterEmail,owner:false,session:'',dev:false,version:0}, 'request.edit', request);
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

async function send(env: Bindings, event: Data, now: number, company?:CompanyEffect): Promise<Data> {
    const suppressed = { recipient: event.requesterEmail, status: 'suppressed' };
    const fresh = await load(env.DB), request = fresh.state.get(key('request', event.request))?.value;
    const decision = request && approved(fresh.state, request);
    const delivery = request && valueDelivery(fresh.state, request, request.revision);
    if (!request || !decision || request.revision !== event.revision || decision.id !== event.approvedDecision
        || decision.at !== event.approvedAt || now < Date.parse(event.dueAt)) return { ...suppressed, code: 'obsolete' };
    if (!delivery || delivery.receipt !== event.deliveryReceipt || delivery.at !== event.deliveredAt || delivery.order !== event.order
        || event.dueAt !== new Date(Date.parse(delivery.at) + event.intervalDays * day).toISOString()) return { ...suppressed, code: 'delivery-changed' };
    const policy = fresh.state.get(key('valuePolicy', 'main'))?.value;
    if (!valuePolicyAllows(fresh.state, request) || policy?.version !== event.policyVersion) return { ...suppressed, code: 'paused-or-policy-changed' };
    const member = membership(fresh.state, request);
    const native = await env.DB.prepare("SELECT version FROM oa_operators WHERE id=? AND lower(email)=? AND status='active'").bind(event.requester,event.requesterEmail).first<{version:number}>();
    if (request.requester !== event.requester || request.requesterEmail.toLowerCase() !== event.requesterEmail
        || !native || (!member && request.requesterOwner !== true)) return { ...suppressed, code: 'requester-capability-revoked' };
    const snapshot = await buildValueSnapshot(fresh.state, request, event.revision);
    if (snapshot.fingerprint !== event.inputs.fingerprint) return { ...suppressed, code: 'evidence-changed' };
    const sender = operatorMail(env);
    if (!sender || !env.MAIL_FROM) return { ...suppressed, status: 'unavailable' };
    // The domain revision covers the current request, exact decision, policy and membership.
    // Owner self-requests require the same current native identity and current owner role.
    const permitted = await env.DB.prepare(`SELECT 1 AS ok WHERE (SELECT revision FROM p_meta WHERE id=1)=? AND ${nativeRequester}${company ? ' AND '+company.sql : ''}`)
        .bind(fresh.revision, event.requester, event.requesterEmail, native.version, member ? 1 : 0, request.requesterOwner === true ? 1 : 0,...(company?.params??[])).first<{ ok: number }>();
    if (!permitted?.ok || company && !await company.live()) return { ...suppressed, code: 'current-authority-changed' };
    try {
        const result = await sender.send(event.message);
        const status = result.status === 'development' ? 'suppressed'
            : ['accepted', 'uncertain'].includes(result.status) ? result.status : 'unavailable';
        return { recipient: event.requesterEmail, status, delivery: result };
    } catch { return { recipient: event.requesterEmail, status: 'uncertain' }; }
}

export async function valueCheckinPlan(env: Bindings, requestId: string, requestRevision: number, intervalDays: number, now: number) {
    const { state, revision } = await load(env.DB), request = state.get(key('request', requestId))?.value;
    if (!request || request.revision !== requestRevision) return;
    const decision = approved(state, request);
    const delivery = valueDelivery(state, request, request.revision);
    if (!decision || !delivery || now < Date.parse(delivery.at) + intervalDays * day) return;
    const id = `${request.id}:${request.revision}:${intervalDays}`;
    if (state.has(key('valueCheckin', id))) return;
    const inputs = await buildValueSnapshot(state, request, request.revision);
    const policy=state.get(key('valuePolicy','main'))?.value;
    const sourceVersion=await valueDigest(canonicalValue({fingerprint:inputs.fingerprint,policyVersion:policy?.version,decision:decision.id,delivery}));
    return {state,revision,request,decision,delivery,id,inputs,sourceVersion,sponsor:request.requester,policy};
}

export async function runValueCheckinAttempt(env: Bindings, requestId: string, requestRevision: number, intervalDays: number, now: number, company?:CompanyEffect,expectedSourceVersion?:string) {
    const plan=await valueCheckinPlan(env,requestId,requestRevision,intervalDays,now);
    if(company&&expectedSourceVersion)requireThat(plan&&plan.sourceVersion===expectedSourceVersion,'Scheduled sources changed before their claim',409);
    if(!plan)return;
    const {state,revision,request,decision,delivery,id,inputs}=plan;
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
    if(company)Object.assign(event,company.record(event));
    const claimVersion = uid(),auditVersion=uid();
    const insert = (kind: string, recordId: string, value: Data, version=uid()) => env.DB.prepare(`INSERT OR IGNORE INTO p_records(business,kind,id,revision,value)
        SELECT 'main',?,?,?,? WHERE EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='valueCheckin' AND id=? AND revision=?)`)
        .bind(kind, recordId, version, JSON.stringify(company?(kind==='audit'?company.audit(value):company.record(value)):value), id, claimVersion);
    const audit: Data = (company?.audit??((row:Data)=>row))({ id: event.run, actor: 'system', email: '', action: 'value-checkin', record: request.id,
        at: event.at, revision: request.revision, checkin: id, intervalDays, outcome: 'uncertain' });
    // All provenance is durable before mail. An interrupted claim is consumed forever.
    const claimed = await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO p_records(business,kind,id,revision,value)
            SELECT 'main','valueCheckin',?,?,? WHERE (SELECT revision FROM p_meta WHERE id=1)=?${company ? ' AND '+company.sql : ''}`)
            .bind(id, claimVersion, JSON.stringify(event), revision,...(company?.params??[])),
        insert('agentRun', event.run, companion(event)),
        insert('proposedAction', `${event.run}:confirm`, { id: `${event.run}:confirm`, run: event.run, runVersion: 1,
            actor: event.requester, action: 'value-confirm', input: { id: event.run, version: 1, request: request.id,
                revision: request.revision, fingerprint: inputs.fingerprint }, status: 'proposed', references: inputs.references }),
        insert('audit', audit.id, audit,auditVersion),
    ]);
    if (!claimed[0].meta.changes) {if(company)requireThat(false,'Native scheduled claim changed; reload',409);return;}
    event.outcome = await send(env, event, now, company);
    audit.outcome = event.outcome.status;
    const update = (kind: string, recordId: string, value: Data, expected:string) => env.DB.prepare("UPDATE p_records SET revision=?,value=? WHERE business='main' AND kind=? AND id=? AND revision=?")
        .bind(uid(), JSON.stringify(value), kind, recordId,expected);
    await env.DB.batch([update('valueCheckin', id, event,claimVersion),
        // A requester may confirm while the mail edge is pending; preserve appended confirmation outcomes.
        env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.outcomes[0]',json(?)) WHERE business='main' AND kind='agentRun' AND id=? AND json_extract(value,'$.actor')=? AND json_extract(value,'$.inputs.fingerprint')=? AND json_extract(value,'$.sourceValuesErased') IS NOT 1 AND json_extract(value,'$.protectedContextCleanup.authorityInvalidated') IS NOT 1")
            .bind(uid(), JSON.stringify(event.outcome), event.run,event.requester,inputs.fingerprint),
        update('audit', audit.id, audit,auditVersion)]);
    return (await load(env.DB)).state.get(key('valueCheckin',id))?.value;
}

/** Exact elapsed UTC durations from the approved revision's first native delivery; each interval is consumed once, including while paused. */
export async function runValueCheckins(original: Bindings, now = Date.now()): Promise<{ events: Data[] }> {
    const env = runtimeBindings(original), initial = await load(env.DB), events: Data[] = [];
    for (const request of all(initial.state, 'request')) {
        for (const intervalDays of [30, 90]) {
            if(await companyConfigured(env)) {
                const plan=await valueCheckinPlan(env,request.id,request.revision,intervalDays,now);
                if(!plan)continue;
                const key='value-checkin:'+plan.id;
                const consumed=await env.DB.prepare("SELECT 1 AS ok FROM agent_door_audit WHERE json_extract(row,'$.door')='embedded' AND json_extract(row,'$.idempotency_key')=? AND json_extract(row,'$.code') IN ('agents_paused','policy_blocked') LIMIT 1").bind(key).first();
                if(consumed)continue;
                const answer=await scheduledInvocation(env,'purse.agents.advance',{job:'value',id:request.id,version:request.revision,tick:now,sourceVersion:plan.sourceVersion,intervalDays},plan.sponsor,'AGENT-005','Purse scheduled value check-in',key);
                if(answer.outcome==='done')events.push(...((answer.result as Data).events??[]));
                continue;
            }
            const event = await runValueCheckinAttempt(env, request.id, request.revision, intervalDays, now);
            if (event) events.push(event);
        }
    }
    return { events };
}
