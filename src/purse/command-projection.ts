import { mayReadPolicySnapshot, projectApprovalEdit } from './approval-edit-view';
import { projectValueRecord } from './agent-value';
import { type Actor, type Data, type State } from './types';

/** Mutation responses have the same historical-evidence scope as state reads. */
export function projectCommandResult(s: State, a: Actor, result: Data): Data {
    let projected = projectApprovalEdit(s, a, result);
    if (projected.policySnapshot && !mayReadPolicySnapshot(s, a, projected.policySnapshot))
        projected = { ...projected, policySnapshot: null, snapshotBasis: 'Whole-policy snapshot outside your purchase scope' };
    if (projected.inputs?.sources && !['AGENT-008', 'AGENT-004'].includes(projected.agent)) projected = projectValueRecord(s, a, projected);
    for (const field of ['request', 'order', 'result']) if (projected[field] && typeof projected[field] === 'object' && !Array.isArray(projected[field]))
        projected = { ...projected, [field]: projectCommandResult(s, a, projected[field]) };
    if(Array.isArray(projected.supplierOrders))projected={...projected,supplierOrders:projected.supplierOrders.map((order:Data)=>projectCommandResult(s,a,order))};
    return projected;
}
