import { retainedTravelApproval } from './travel-approval-evidence';
import { releaseCalendarCurrent, releaseDate, releaseTimezone, travelReservation, travelZone } from './travel-release';
import { all, audit, Fault, get, put, requireThat, text, type Actor, type Data, type State } from './types';

const system: Actor = { id: 'system', email: '', owner: false, version: 0, session: '', dev: false };
export function pauseTravelReleasePolicies(s: State, reason: string, now = Date.now()) {
    const at = new Date(now).toISOString();
    for (const policy of all(s, 'travelReleasePolicy').filter(row => row.status === 'armed')) {
        put(s, 'travelReleasePolicy', policy.id, { ...policy, version: policy.version + 1, status: 'paused', pauseReason: reason, pausedAt: at });
        audit(s, system, 'travel-release-paused', policy.request, { revision: policy.revision, policyVersion: policy.version, reason, at });
    }
}
export function pauseTravelReleaseRule(s: State, reason: string, now = Date.now()) {
    const rule = s.get('travelReleaseRule:main')?.value;
    if (rule?.status === 'armed') {
        put(s, 'travelReleaseRule', 'main', { ...rule, status: 'paused', pauseReason: reason, pausedAt: new Date(now).toISOString() });
        audit(s, system, 'travel-release-rule-paused', 'main', { ruleVersion: rule.version, reason });
    }
    pauseTravelReleasePolicies(s, reason, now);
}
/** Consent is business-wide; each derived record still binds the exact approved
 * revision and reservation. Paused records only rearm on explicit consent. */
export function materializeTravelReleasePolicies(s: State, now = Date.now(), reconsent = false) {
    const rule = s.get('travelReleaseRule:main')?.value;
    if (!rule || rule.status !== 'armed') return;
    if (!releaseCalendarCurrent(s, rule)) {
        pauseTravelReleaseRule(s, 'Business calendar changed; renew timed release rule consent', now); return;
    }
    for (const request of all(s, 'request').filter(row => row.purchaseType === 'travel' && row.status === 'approved' && !row.imported && !row.travel?.closedAt)) {
        const previous = s.get('travelReleasePolicy:' + request.id)?.value;
        if (s.has('travelRelease:' + request.id + ':' + request.revision)) continue;
        if (previous && previous.revision === request.revision && (previous.source !== 'rule' || previous.status === 'released' || previous.status === 'closed' || !reconsent)) continue;
        try {
            retainedTravelApproval(s, request);
            requireThat(travelReservation(s, request) === request.totalMinor, 'Exact approved reservation required', 409);
        } catch (error) { if (error instanceof Fault) continue; throw error; }
        const policy = { id: request.id, request: request.id, revision: request.revision, version: (previous?.version ?? 0) + 1,
            source: 'rule', rule: 'main', ruleVersion: rule.version, status: 'armed', days: rule.days, timezone: rule.timezone,
            businessTimezone: rule.businessTimezone, owner: rule.owner, ownerVersion: rule.ownerVersion, confirmed: true, acceptLateActual: true,
            returnDate: request.travel.returnDate, dueDate: releaseDate(request.travel.returnDate, rule.days), approvalReference: request.travel.approvalReference,
            reason: rule.reason, at: new Date(now).toISOString() };
        put(s, 'travelReleasePolicy', request.id, policy);
        audit(s, system, 'travel-release-rule-applied', request.id, { ...policy, policyVersion: policy.version });
    }
}
export function travelReleaseRule(s: State, a: Actor, input: Data) {
    requireThat(a.owner, 'Current native owner required to configure the travel release rule', 403);
    const previous = s.get('travelReleaseRule:main')?.value;
    requireThat(input.version === (previous?.version ?? 0), 'Travel release rule changed; reload before consent', 409);
    requireThat(input.enabled === true || input.enabled === false, 'Choose whether the travel release rule is enabled');
    const reason = text(input.reason, 'Release rule reason'), version = (previous?.version ?? 0) + 1;
    let details: Data = {};
    if (input.enabled) {
        requireThat(Number.isSafeInteger(input.days) && input.days >= 1 && input.days <= 3650, 'Use 1–3650 calendar days after return');
        details = { days: input.days, timezone: releaseTimezone(s, input.timezone), businessTimezone: travelZone(s) ?? null };
        if (input.consent === true) requireThat(input.confirmed === true && input.acceptLateActual === true, 'Confirm the business release rule and the consequence of late actual spend');
    }
    const at = new Date().toISOString(), status = !input.enabled ? 'off' : input.consent === true ? 'armed' : 'paused';
    const entry = { version, status, ...details, owner: a.id, ownerVersion: a.version, confirmed: status === 'armed', acceptLateActual: status === 'armed', reason, at };
    pauseTravelReleasePolicies(s, 'Travel release rule changed; renew timed release consent');
    put(s, 'travelReleaseRule', 'main', { ...entry, history: [...(previous?.history ?? []), entry] });
    audit(s, a, 'travel-release-rule', 'main', { ...entry, ruleVersion: version });
    if (status === 'armed') materializeTravelReleasePolicies(s, Date.now(), true);
    return get(s, 'travelReleaseRule', 'main');
}
