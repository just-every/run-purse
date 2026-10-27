import { all, get, requireThat, type Data, type State } from './types';

/** Returning financial evidence cannot revive a departed approver's authority.
 * Check the retained native approval, rather than authorizing a new purchase. */
export function retainedTravelApproval(s: State, request: Data) {
    const frozen = get(s, 'revision', request.id + ':' + request.revision), reference = request.travel?.approvalReference;
    requireThat(request.purchaseType === 'travel' && !request.imported && request.status === 'approved' && reference &&
        frozen.status === 'approved' && !frozen.imported && frozen.travel?.approvalReference === reference &&
        frozen.travel.approvedAt === request.travel.approvedAt && frozen.policy === request.policy && frozen.currency === request.currency && frozen.totalMinor === request.totalMinor,
        'Retained native approved trip required', 409);
    const events = all(s, 'audit').filter(event => event.record === request.id && event.revision === request.revision);
    requireThat(events.some(event => event.action === 'travel-approved' && event.approvalReference === reference), 'Native travel approval evidence missing', 409);
    const decisions = all(s, 'decision').filter(decision => decision.request === request.id && decision.revision === request.revision && (!request.approvalRoute || decision.approvalAttempt === request.approvalAttempt));
    const valid = (decision: Data) => decision.decision === 'approved' && decision.policy === request.policy &&
        decision.actor !== request.requester && decision.email !== request.requesterEmail && decision.email !== request.travel.travelerEmail &&
        Number.isSafeInteger(decision.operatorVersion) && decision.policySnapshot &&
        (!request.approvalRoute || decision.policyVersion === request.approvalPolicyVersion) &&
        events.some(event => event.action === 'decision' && event.decisionId === decision.id && event.actor === decision.actor && event.decision === 'approved');
    requireThat(!decisions.some(decision => decision.decision !== 'approved') && (frozen.approvalRoute?.length
        ? frozen.approvalRoute.every((step: Data) => decisions.some(decision => decision.chainStep === step.id && valid(decision)))
        : decisions.some(valid)), 'Retained independent native trip decisions required', 409);
    return frozen;
}
