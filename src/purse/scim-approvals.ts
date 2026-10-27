import { nativeActor } from './scim-storage';
import { all, allowed, audit, put, uid, type Actor, type Data, type State } from './types';

/** A transfer belongs to one pending request revision and unchanged policy. */
function pendingChainStep(s:State,request:Data) { return request.approvalRoute?.find((step:Data)=>!all(s,'decision').some(d=>d.request===request.id&&d.revision===request.revision&&d.chainStep===step.id&&d.approvalAttempt===request.approvalAttempt&&d.decision==='approved')); }
export function currentScimAssignment(s: State, request: Data, chainStep?:string): Data | undefined {
    const step=chainStep??pendingChainStep(s,request)?.id;
    return all(s, 'scimApprovalTransfer').filter(t => t.request === request.id && t.requestRevision === request.revision && t.policy === request.policy && (request.approvalRoute ? t.chainStep===step : !t.chainStep) && t.policyVersion === s.get('policy:' + request.policy)?.revision).sort((a, b) => b.sequence - a.sequence)[0];
}
export function scimAssignmentAllows(s: State, a: Actor, request: Data, chainStep?:string) {
    const assignment = currentScimAssignment(s, request, chainStep);
    return Boolean(assignment && !assignment.held && assignment.to === a.email && assignment.operator === a.id && assignment.operatorVersion === a.version && a.id !== request.requester && a.email !== request.requesterEmail && allowed(s, a, 'request.approve', request));
}
export function scimApprovalHolder(s: State, request: Data, chainStep?:string): string | undefined { return currentScimAssignment(s, request,chainStep)?.to ?? (request.approvalRoute?(chainStep?request.approvalRoute.find((step:Data)=>step.id===chainStep):pendingChainStep(s,request))?.email:s.get('policy:' + request.policy)?.value.approver); }

/** Plan every transfer before any native session, grant or request is written. */
export function transferScimApprovals(before: State, after: State, user: Data, operators: Data[], config: Data, service: Actor): Data[] {
    const recipients: Data[] = [], target = operators.find(o => o.id === user.id);
    const pending=all(before,'request').filter(r=>r.status==='pending'&&!r.imported).flatMap(request=>request.approvalRoute?request.approvalRoute.filter((step:Data)=>!all(before,'decision').some(d=>d.request===request.id&&d.revision===request.revision&&d.chainStep===step.id&&d.approvalAttempt===request.approvalAttempt&&d.decision==='approved')).map((step:Data)=>({request,chainStep:step.id})):[{request,chainStep:undefined}]).filter(({request,chainStep})=>{const step=request.approvalRoute?.find((step:Data)=>step.id===chainStep);return scimApprovalHolder(before,request,chainStep)===user.userName || !currentScimAssignment(before,request,chainStep) && step?.emails?.includes(user.userName);});
    for (const {request,chainStep} of pending) {
        const step=request.approvalRoute?.find((step:Data)=>step.id===chainStep);
        // A departing pool member leaves authority with eligible peers.
        if(step?.emails && !currentScimAssignment(before,request,chainStep) && operators.some(operator=>operator.email!==user.userName && step.emails.includes(operator.email) && operator.status==='active' && operator.id!==request.requester && operator.email!==request.requesterEmail && allowed(after,nativeActor(operator),'request.approve',request))) continue;
        if (user.active && target && allowed(after, nativeActor(target), 'request.approve', request)) continue;
        const manager = operators.find(o => o.id === user.manager), fallback = operators.find(o => o.id === config.delegate);
        const owner = operators.filter(o => o.role === 'owner' && o.status === 'active').sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))[0];
        const candidate = [manager, fallback].find(o => o && o.id !== user.id && o.status === 'active' && o.id !== request.requester && o.email !== request.requesterEmail && allowed(after, nativeActor(o), 'request.approve', request));
        const recipient = candidate ?? owner;
        // Native ownership is an installation invariant. A self-interested owner
        // receives custody in a held queue, never decision authority.
        if (!recipient) throw new Error('Installation has no active native owner');
        const held = !candidate && (recipient.id === request.requester || recipient.email === request.requesterEmail);
        const existing = currentScimAssignment(before, request,chainStep), id = uid();
        const transfer = { ...(chainStep?{chainStep}:{}), request: request.id, requestRevision: request.revision, policy: request.policy, policyVersion: before.get('policy:' + request.policy)!.revision, from: user.userName, to: recipient.email, operator: recipient.id, operatorVersion: recipient.version, ...(held ? { held: true } : {}), sequence: (existing?.sequence ?? 0) + 1, source: user.id, at: new Date().toISOString() };
        put(after, 'scimApprovalTransfer', id, transfer);
        audit(after, service, 'scim-approval-transfer', request.id, { transfer: id, ...transfer });
        recipients.push(recipient);
    }
    return [...new Map(recipients.map(o => [o.id, o])).values()];
}

/** Retain exact transfer custody when an edit keeps the named step and policy. */
export function carryScimAssignments(s:State,a:Actor,previous:Data,next:Data) {
    const ids=new Map<string,string>();
    if(previous.policy!==next.policy||previous.approvalPolicyVersion!==next.approvalPolicyVersion)return ids;
    const assignments=all(s,'scimApprovalTransfer').filter(t=>t.request===previous.id&&t.requestRevision===previous.revision&&t.policy===previous.policy);
    for(const before of assignments.filter(t=>!assignments.some(other=>other.chainStep===t.chainStep&&other.sequence>t.sequence))) {
        if(next.approvalRoute&&!next.approvalRoute.some((step:Data)=>step.id===before.chainStep))continue;
        const id=uid(), source=assignments.filter(t=>t.chainStep===before.chainStep).sort((x,y)=>x.sequence-y.sequence)[0];
        const {id:oldId,reassignedBy,...fields}=before;
        const transfer={...fields,from:source.from,requestRevision:next.revision,sequence:1,carriedFrom:oldId,carriedBy:a.id,at:new Date().toISOString()};
        put(s,'scimApprovalTransfer',id,transfer);audit(s,a,'scim-approval-transfer',next.id,{transfer:id,...transfer});ids.set(oldId,id);
    }
    return ids;
}
