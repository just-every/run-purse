import { runtimeBindings, type Bindings } from '../auth.server';
import { load } from './store';
import { receiptDay } from './receipt-routing';
import { retainedTravelApproval } from './travel-approval-evidence';
import { releaseDate, travelReservation, travelZone } from './travel-release';
import { ledger } from './requests';
import { all, audit, Fault, get, put, requireThat, type Actor, type Data, type State } from './types';

const system: Actor = { id: 'system', email: '', owner: false, version: 0, session: '', dev: false };
function exactConsent(s: State, policy: Data) {
    const request = get(s, 'request', policy.request);
    requireThat(request.revision === policy.revision && request.travel?.approvalReference === policy.approvalReference && request.travel.returnDate === policy.returnDate && !request.travel.closedAt, 'Trip revision or report status changed; renew owner consent', 409);
    requireThat(policy.confirmed && policy.acceptLateActual && policy.timezone === travelZone(s) && policy.dueDate === releaseDate(policy.returnDate, policy.days), 'Business calendar or consent changed; renew owner consent', 409);
    retainedTravelApproval(s, request);
    requireThat(travelReservation(s, request) === request.totalMinor && !s.has('travelRelease:' + request.id + ':' + request.revision), 'Reservation changed; review before release', 409);
    return request;
}
/** The real Cron owns timing. Each release claims the exact domain revision
 * and consenting native owner's active version in the same atomic D1 batch. */
export async function runTravelReleases(original: Bindings, now = Date.now()) {
    const env = runtimeBindings(original), initial = await load(env.DB), events: Data[] = [];
    for (const candidate of all(initial.state, 'travelReleasePolicy').filter(policy => policy.status === 'armed')) {
        const { state, revision } = await load(env.DB), policy = state.get('travelReleasePolicy:' + candidate.id)?.value;
        if (!policy || policy.status !== 'armed') continue;
        const before = structuredClone(state), at = new Date(now).toISOString(); let outcome: Data;
        try {
            const request = exactConsent(state, policy);
            const owner = await env.DB.prepare("SELECT 1 AS ok FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active'").bind(policy.owner, policy.ownerVersion).first();
            requireThat(owner, 'Native owner changed; renew timed release consent', 409);
            if (receiptDay(state, now) < policy.dueDate) continue;
            const id = request.id + ':' + request.revision;
            outcome = { id, request: request.id, revision: request.revision, policy: request.policy, currency: request.currency, amountMinor: request.totalMinor, approvalReference: policy.approvalReference, policyVersion: policy.version, dueDate: policy.dueDate, days: policy.days, returnDate: policy.returnDate, timezone: policy.timezone, owner: policy.owner, ownerVersion: policy.ownerVersion, at, status: 'released' };
            ledger(state, system, request, -outcome.amountMinor, 'travel-timed-release');
            put(state, 'travelRelease', id, outcome);
            put(state, 'travelReleasePolicy', policy.id, { ...policy, version: policy.version + 1, status: 'released', releasedAt: at, release: id });
            const { id: releaseId, ...detail } = outcome;
            audit(state, system, 'travel-timed-release', request.id, { ...detail, release: releaseId });
        } catch (error) {
            if (!(error instanceof Fault)) throw error;
            outcome = { status: 'paused', request: policy.request, revision: policy.revision, reason: error.message, at };
            put(state, 'travelReleasePolicy', policy.id, { ...policy, version: policy.version + 1, status: 'paused', pauseReason: error.message, pausedAt: at });
            audit(state, system, 'travel-release-paused', policy.request, { ...outcome, policyVersion: policy.version });
        }
        const statements = [env.DB.prepare('INSERT INTO p_guard SELECT CASE WHEN (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END').bind(revision)];
        if (outcome.status === 'released') statements.push(env.DB.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active') THEN 1 ELSE 0 END").bind(policy.owner, policy.ownerVersion));
        for (const [key, row] of state) if (before.get(key)?.revision !== row.revision) statements.push(env.DB.prepare('INSERT INTO p_records(business,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(business,kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value').bind(row.business, row.kind, row.id, row.revision, JSON.stringify(row.value)));
        statements.push(env.DB.prepare('DELETE FROM p_guard'));
        try { await env.DB.batch(statements); events.push(outcome); } catch (error) { if (!String(error).includes('CHECK constraint')) throw error; }
    }
    return { events };
}
