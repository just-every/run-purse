import { nativeActor } from './scim-storage';
import { all, allowed, audit, put, requireThat, uid, type Actor, type Data, type State } from './types';

/** A transfer belongs to one pending request revision and unchanged policy. */
export function currentScimAssignment(s: State, request: Data): Data | undefined {
    return all(s, 'scimApprovalTransfer').filter(t => t.request === request.id && t.requestRevision === request.revision && t.policy === request.policy && t.policyVersion === s.get('policy:' + request.policy)?.revision).sort((a, b) => b.sequence - a.sequence)[0];
}
export function scimAssignmentAllows(s: State, a: Actor, request: Data) {
    const assignment = currentScimAssignment(s, request);
    return Boolean(assignment && assignment.to === a.email && assignment.operator === a.id && assignment.operatorVersion === a.version && a.id !== request.requester && a.email !== request.requesterEmail && allowed(s, a, 'request.approve', request));
}
export function scimApprovalHolder(s: State, request: Data): string | undefined { return currentScimAssignment(s, request)?.to ?? s.get('policy:' + request.policy)?.value.approver; }

/** Plan every transfer before any native session, grant or request is written. */
export function transferScimApprovals(before: State, after: State, user: Data, operators: Data[], config: Data, service: Actor): Data[] {
    const recipients: Data[] = [], target = operators.find(o => o.id === user.id);
    for (const request of all(before, 'request').filter(r => r.status === 'pending' && !r.imported && scimApprovalHolder(before, r) === user.userName)) {
        if (user.active && target && allowed(after, nativeActor(target), 'request.approve', request)) continue;
        const manager = operators.find(o => o.id === user.manager), fallback = operators.find(o => o.id === config.delegate);
        const candidate = [manager, fallback].find(o => o && o.id !== user.id && o.status === 'active' && o.id !== request.requester && o.email !== request.requesterEmail && allowed(after, nativeActor(o), 'request.approve', request));
        requireThat(candidate, 'Pending approvals require an active, scoped manager or owner-named delegate before provisioning can continue', 409);
        const existing = currentScimAssignment(before, request), id = uid();
        const transfer = { request: request.id, requestRevision: request.revision, policy: request.policy, policyVersion: before.get('policy:' + request.policy)!.revision, from: user.userName, to: candidate.email, operator: candidate.id, operatorVersion: candidate.version, sequence: (existing?.sequence ?? 0) + 1, source: user.id, at: new Date().toISOString() };
        put(after, 'scimApprovalTransfer', id, transfer);
        audit(after, service, 'scim-approval-transfer', request.id, { transfer: id, ...transfer });
        recipients.push(candidate);
    }
    return [...new Map(recipients.map(o => [o.id, o])).values()];
}
