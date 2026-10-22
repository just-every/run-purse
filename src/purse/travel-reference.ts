import { all, requireThat, type Actor, type State } from './types';

export function activeTraveler(s: State, a: Actor) {
    return a.owner || all(s, 'member').some(member => member.email === a.email && member.active === true);
}
/** This exact-email grant is only a booking reference. It grants no request,
 * itinerary, policy, budget, decision or original-document read permission. */
export function travelerReferences(s: State, a: Actor) {
    requireThat(activeTraveler(s, a), 'Current active workspace membership required', 403);
    return all(s, 'request').filter(request => request.purchaseType === 'travel' && !request.imported && request.travel?.travelerEmail === a.email && request.travel.approvalReference)
        .map(request => ({ approvalReference: request.travel.approvalReference, revision: request.revision, status: request.travel.closedAt ? 'expense-report-closed' : request.status }));
}
