import { all, allowed, type Actor, type Data, type State } from './types';

/** A purchase read never grants a snapshot covering other private purchases. */
export function mayReadPolicySnapshot(s: State, a: Actor, policy: Data | undefined, permission = 'request.read') {
    return Boolean(policy && (a.owner || ['request', 'revision', 'decision', 'commitment'].flatMap(kind => all(s, kind))
        .filter(record => record.policy === policy.id).every(record => allowed(s, a, permission, record))));
}
function editSource(s: State, value: Data) {
    const edit = value.approverEdit ?? (value.action === 'approver-edit' ? value : undefined);
    const request = value.request ?? (value.action === 'approver-edit' ? value.record : value.id);
    return { edit, request, prior: edit ? s.get('revision:' + request + ':' + edit.fromRevision)?.value : undefined };
}
/** ct 22 Oct: edited-field values alone follow requester and earlier approvers. */
export function editRecipient(s: State, a: Actor, value: Data) {
    const { edit, request, prior } = editSource(s, value);
    return Boolean(edit && prior && (prior.requester === a.id || prior.requesterEmail === a.email
        || all(s, 'decision').some(decision => decision.request === request && decision.revision <= edit.fromRevision
            && decision.decision === 'approved' && (decision.actor === a.id || decision.email === a.email))));
}
export function projectApprovalEdit(s: State, a: Actor, value: Data, permission = 'request.read'): Data {
    const { edit, prior } = editSource(s, value);
    if (!edit) return value;
    const outside = prior && !allowed(s, a, permission, prior);
    const participant = permission === 'request.read' && editRecipient(s, a, value);
    const projected = { ...edit,
        differences: outside && !participant ? [] : edit.differences,
        carried: outside && !participant ? [] : edit.carried,
        renewed: outside && !participant ? [] : edit.renewed,
        policy: mayReadPolicySnapshot(s, a, edit.policy, permission) ? edit.policy : null,
        sourcePolicy: mayReadPolicySnapshot(s, a, edit.sourcePolicy, permission) ? edit.sourcePolicy : null };
    if (!projected.policy || !projected.sourcePolicy) projected.snapshotBasis = 'Whole-policy snapshot outside your purchase scope';
    if (outside && !participant) projected.snapshotBasis = 'Previous revision outside your current scope; change details withheld';
    return value.approverEdit ? { ...value, approverEdit: projected } : projected;
}
export function approvalEditNotices(s: State, a: Actor) {
    return all(s, 'revision').filter(revision => revision.approverEdit && editRecipient(s, a, revision)).map(revision => {
        const edit = revision.approverEdit;
        return { request: revision.request, revision: revision.revision, fromRevision: edit.fromRevision,
            actor: edit.actor, at: edit.at, differences: edit.differences.map(({field,before,after}:Data)=>({field,before,after})),
            basis: 'Edited fields shared with the requester and earlier approvers; other purchase access follows current grants' };
    });
}
