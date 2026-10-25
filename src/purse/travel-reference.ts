import { all, requireThat, type Actor, type State } from './types';

export function activeTraveler(s: State, a: Actor) {
    return a.owner || all(s, 'member').some(member => member.email === a.email && member.active === true);
}
/** Exact native traveler identity grants only approved booking terms. */
export function travelerReferences(s: State, a: Actor) {
    requireThat(activeTraveler(s, a), 'Current active workspace membership required', 403);
    return all(s, 'request').filter(request => request.purchaseType === 'travel' && !request.imported && request.travel?.travelerEmail === a.email && request.travel.approvalReference)
        .map(request => ({ approvalReference: request.travel.approvalReference, revision: request.revision, status: request.travel.closedAt ? 'expense-report-closed' : request.status, destinations: request.travel.destinations, departureDate: request.travel.departureDate, returnDate: request.travel.returnDate, costs: request.travel.costs, currency: request.currency }));
}
