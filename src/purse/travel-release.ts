import { retainedTravelApproval } from './travel-approval-evidence';
import { travelRequest } from './travel';
import { all, audit, get, put, requireThat, text, type Actor, type Data, type State } from './types';

export const travelZone = (s: State): string | undefined => s.get('business:main')?.value.timezone || undefined;
export function releaseTimezone(s: State, input: unknown) {
    const timezone = typeof input === 'string' && input.trim() ? input.trim() : travelZone(s);
    requireThat(timezone, 'Choose a release timezone because the business has none', 409);
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
    catch { requireThat(false, 'Choose a valid IANA release timezone'); }
    return timezone;
}
export function releaseDay(timezone: string, now: number) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = (name: string) => parts.find(value => value.type === name)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}
export const releaseCalendarCurrent = (s: State, consent: Data) =>
    (Object.hasOwn(consent, 'businessTimezone') ? consent.businessTimezone : consent.timezone) === (travelZone(s) ?? null);
export function releaseDate(returnDate: string, days: number) {
    const date = new Date(returnDate + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
export function travelReservation(s: State, request: Data) {
    return all(s, 'commitment').filter(event => event.request === request.id && event.currency === request.currency && event.policy === request.policy).reduce((sum, event) => sum + event.amountMinor, 0);
}
export function travelReleasePolicy(s: State, a: Actor, input: Data) {
    requireThat(a.owner, 'Current native owner required to configure timed travel release', 403);
    const request = travelRequest(s, input.id), previous = s.get('travelReleasePolicy:' + request.id)?.value;
    requireThat(input.revision === request.revision && input.version === (previous?.version ?? 0), 'Stale travel revision or release policy', 409);
    requireThat(input.enabled === true || input.enabled === false, 'Choose whether timed release is enabled');
    requireThat(!request.travel.closedAt && !request.imported, 'Open native trip required', 409);
    requireThat(!all(s, 'travelRelease').some(event => event.request === request.id && event.revision === request.revision), 'This revision’s reservation was already released', 409);
    const reason = text(input.reason, 'Release policy reason'), version = (previous?.version ?? 0) + 1, at = new Date().toISOString();
    let details: Data = {};
    if (input.enabled) {
        retainedTravelApproval(s, request);
        requireThat(Number.isSafeInteger(input.days) && input.days >= 1 && input.days <= 3650, 'Use 1–3650 calendar days after return');
        requireThat(input.confirmed === true && input.acceptLateActual === true, 'Confirm this exact trip revision and that a late expense report can consume budget after funds were freed');
        requireThat(travelReservation(s, request) === request.totalMinor, 'Exact approved reservation required', 409);
        details = { businessTimezone: travelZone(s) ?? null, ruleVersion: s.get('travelReleaseRule:main')?.value.version ?? 0, days: input.days, returnDate: request.travel.returnDate, dueDate: releaseDate(request.travel.returnDate, input.days), timezone: releaseTimezone(s, input.timezone), approvalReference: request.travel.approvalReference, owner: a.id, ownerVersion: a.version, confirmed: true, acceptLateActual: true };
    }
    const record = { id: request.id, request: request.id, revision: request.revision, version, status: input.enabled ? 'armed' : 'off', source: 'override', ...details, reason, at };
    put(s, 'travelReleasePolicy', request.id, record);
    audit(s, a, 'travel-release-policy', request.id, { ...record, policyVersion: version });
    return get(s, 'travelReleasePolicy', request.id);
}
export function travelOwnerFence(db: D1Database, a: Actor) {
    return { statements: [db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active') THEN 1 ELSE 0 END").bind(a.id, a.version)] };
}
