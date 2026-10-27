import { currentScimAssignment, scimAssignmentAllows, carryScimAssignments } from './scim-approvals';
import { all, allowed, get, put, requireThat, uid, type Actor, type Data, type State } from './types';

export function stepAuthority(s:State,a:Actor,request:Data,step:Data): Data | undefined {
    if (step.emails) {
        for (const email of step.emails) { const proof = stepAuthority(s,a,request,{...step,emails:undefined,email}); if (proof) return {...proof, authorityEmail:email}; }
        return;
    }
    if(!allowed(s,a,'request.approve',request)||a.id===request.requester||a.email===request.requesterEmail)return;
    const assignment=currentScimAssignment(s,request,step.id);
    if(assignment)return scimAssignmentAllows(s,a,request,step.id)?{scimTransfer:assignment.id,delegation:null}:undefined;
    const delegation=all(s,'delegation').find(d=>d.policy===request.policy&&d.from===step.email&&d.delegate===a.email&&d.active&&Date.parse(d.expires)>Date.now());
    if(a.email===step.email||delegation)return {delegation:delegation?.id??null};
}
export function stepHolderEmail(s:State,request:Data,step:Data) {
    return currentScimAssignment(s,request,step.id)?.to ?? all(s,'delegation').find(d=>d.policy===request.policy&&d.from===step.email&&d.active&&Date.parse(d.expires)>Date.now())?.delegate ?? step.email;
}
export function validateStepDecision(s:State,request:Data,step:Data,decision:Data) {
    requireThat(decision.policyVersion===request.approvalPolicyVersion&&decision.email!==request.requesterEmail&&decision.actor!==request.requester,'Every exact approval step must be approved',409);
    const authorityStep = step.emails ? {...step,emails:undefined,email:decision.authorityEmail} : step;
    requireThat(!step.emails || step.emails.includes(decision.authorityEmail), 'Pool authority changed; renew approval',409);
    const actor={id:decision.actor,email:decision.email,owner:decision.owner===true,dev:false,session:'',version:decision.operatorVersion};
    requireThat(stepAuthority(s,actor,request,authorityStep),'An earlier approver no longer holds authority',409);
    if(decision.scimTransfer)requireThat(currentScimAssignment(s,request,step.id)?.id===decision.scimTransfer,'Approval transfer changed; renew approval',409);
    else if(decision.delegation) {
        const delegation=get(s,'delegation',decision.delegation);
        requireThat(delegation.active&&delegation.from===authorityStep.email&&delegation.delegate===decision.email&&Date.parse(delegation.expires)>Date.now(),'Delegation expired or revoked; renew authority',409);
    } else requireThat(decision.email===authorityStep.email,'Designated approver changed; renew authority',409);
}
/** Exact-revision carry is shared by corrections and non-material PO changes. */
export function carryApprovalDecisions(s:State,a:Actor,previous:Data,next:Data,selected?:Data[]) {
    const transfers=carryScimAssignments(s,a,previous,next), carried:string[]=[];
    for(const before of selected??all(s,'decision').filter(d=>d.request===previous.id&&d.revision===previous.revision&&d.decision==='approved')) {
        const id=uid();put(s,'decision',id,{...before,id,revision:next.revision,carriedFrom:before.id,carriedBy:a.id,carriedAt:new Date().toISOString(),policyVersion:next.approvalPolicyVersion??before.policyVersion,...(before.scimTransfer?{scimTransfer:transfers.get(before.scimTransfer)??before.scimTransfer}:{})});carried.push(id);
    }
    return carried;
}
