import { all, get, requirePermission, requireThat, allowed, accessGrants, type Actor, type Data, type State } from './types';

export function assignedAgreementOwner(s:State,a:Actor,agreement:Data) {
    return a.id===agreement.owner && (a.owner || all(s,'member').some(m=>m.active && m.email.toLowerCase()===a.email.toLowerCase() && m.email.toLowerCase()===agreement.ownerEmail?.toLowerCase() && accessGrants(s,a).length>0));
}
export function scenarioBudgetOwners(s:State,input:Data,commitmentRows:Data[]) {
    const result:Data[]=[];
    for(const assumption of input.assumptions.filter((r:Data)=>r.order)) {
        const order=get(s,'order',assumption.order),request=get(s,'request',order.request),baseline=commitmentRows.find(r=>r.request===request.id)?.amountMinor??0;
        if(baseline===assumption.proposedCommitmentMinor)continue;
        const portions=new Map<string,number>();
        for(const event of all(s,'commitment').filter(r=>r.request===request.id))for(const share of event.budgetAllocations??[{policy:event.policy??request.policy,amountMinor:event.amountMinor}])portions.set(share.policy,(portions.get(share.policy)??0)+share.amountMinor);
        for(const [policyId,amount] of portions) {
            if(amount<=0)continue;
            const policy=get(s,'policy',policyId);
            requireThat(policy.active,'Changed commitments require an active budget policy',409);
            if(!result.some(r=>r.policy===policy.id&&r.order===order.id))result.push({policy:policy.id,order:order.id,ownerEmail:policy.budgetOwner??policy.approver,name:policy.name});
        }
    }
    return result.sort((a,b)=>a.policy.localeCompare(b.policy)||a.order.localeCompare(b.order));
}
export function scenarioConsentAuthority(s:State,a:Actor,scenario:Data,role:string,agreementId?:string,policyId?:string) {
    if(role==='owner') {
        const agreement=get(s,'agreement',agreementId!);
        requireThat(scenario.choices.agreementIds.includes(agreement.id)&&assignedAgreementOwner(s,a,agreement),'Exact current assigned agreement owner required',403);return;
    }
    if(role==='budget') {
        const rows=(scenario.snapshot.budgetOwners??[]).filter((r:Data)=>r.policy===policyId);
        requireThat(rows.length>0,'Choose an affected commitment budget',403);
        const policy=get(s,'policy',policyId!);
        requireThat(policy.active&&(policy.budgetOwner??policy.approver).toLowerCase()===a.email.toLowerCase(),'Current department budget owner required',403);
        for(const row of rows)requirePermission(s,a,'request.approve',get(s,'order',row.order));return;
    }
    requireThat(role==='finance' && !scenario.snapshot.agreements.some((r:Data)=>r.owner===a.id) && !(scenario.snapshot.budgetOwners??[]).some((r:Data)=>r.ownerEmail.toLowerCase()===a.email.toLowerCase()),'Finance consent must be independent of affected agreement and budget owners',403);
    requireThat(!accessGrants(s,a).some(g=>g.role==='auditor')&&allowed(s,a,'payable.approve')&&allowed(s,a,'cash.read'),'Current finance approval capability required',403);
    for(const assumption of scenario.choices.assumptions.filter((r:Data)=>r.order)) {
        const order=get(s,'order',assumption.order);requirePermission(s,a,'payable.approve',order);requirePermission(s,a,'cash.read',order);
    }
}
export function scenarioApprovals(s:State,scenario:Data) {
    const consents=all(s,'recurringScenarioConsent').filter(c=>c.scenario===scenario.id&&c.hash===scenario.hash);
    requireThat(consents.some(c=>c.role==='finance')&&scenario.choices.agreementIds.every((id:string)=>consents.some(c=>c.role==='owner'&&c.agreement===id)) && (scenario.snapshot.budgetOwners??[]).every((r:Data)=>consents.some(c=>c.role==='budget'&&c.policy===r.policy)), 'Independent finance, every agreement owner and each changed commitment budget owner must approve this hash',409);
    for(const c of consents)scenarioConsentAuthority(s,{id:c.actor,email:c.email,owner:c.nativeOwner,version:c.operatorVersion,session:'',dev:false},scenario,c.role,c.agreement,c.policy);
    return consents;
}
