import { mayReadPolicySnapshot, projectApprovalEdit } from './approval-edit-view';
import { projectValueRecord } from './agent-value';
import { type Actor, type Data, type State } from './types';

/** Mutation responses have the same historical-evidence scope as state reads. */
export function projectCommandResult(s: State, a: Actor, result: Data): Data {
    let projected = projectApprovalEdit(s, a, result);
    if (projected.policySnapshot && !mayReadPolicySnapshot(s, a, projected.policySnapshot))
        projected = { ...projected, policySnapshot: null, snapshotBasis: 'Whole-policy snapshot outside your purchase scope' };
    if (projected.inputs?.sources && projected.agent !== 'AGENT-008') projected = projectValueRecord(s, a, projected);
    for (const field of ['request', 'order', 'result']) if (projected[field] && typeof projected[field] === 'object' && !Array.isArray(projected[field]))
        projected = { ...projected, [field]: projectCommandResult(s, a, projected[field]) };
    return projected;
}
