import { remainingValue } from './orders';
import { moneyInput } from './money';
import { all, allowed, audit, date, get, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';
import { ledger, policies, reserved, approvalAmount } from './requests';

export const headerFields = ['glAccount', 'costCentre', 'location', 'class', 'project', 'needDate', 'shipTo', 'supplier', 'notes'] as const;
export const materialDefaults = ['glAccount', 'costCentre', 'project', 'supplier'];
export function policyWorkflow(input: Data, previous?: Data) {
    const result: Data = {};
    if (input.approvalSteps !== undefined || previous?.approvalSteps) {
        const steps = input.approvalSteps ?? previous?.approvalSteps;
        requireThat(Array.isArray(steps) && steps.length <= 20, 'Provide at most 20 additional approval steps');
        result.approvalSteps = steps.map((step: Data, index: number) => {
            requireThat(step && typeof step === 'object', 'Invalid approval step');
            const email = text(step.email, 'Step approver email').toLowerCase();
            requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Use an approver email');
            const minMinor = moneyInput(step,'minAmount','minMinor','Approval threshold',{fallback:0});
            requireThat(Number.isSafeInteger(minMinor) && minMinor >= 0 && minMinor <= 1e12, 'Invalid approval threshold');
            const dependsOn = step.dependsOn ?? materialDefaults;
            requireThat(Array.isArray(dependsOn) && dependsOn.every((field: string) => headerFields.includes(field as any)), 'Invalid approval dependency');
            return { id: 'step-' + index, email, minMinor, costCentre: step.costCentre ? text(step.costCentre, 'Step department') : '*', dependsOn: [...new Set(dependsOn)] };
        });
    }
    if (input.editRules !== undefined || previous?.editRules) {
        const rules = input.editRules ?? previous?.editRules;
        requireThat(rules && typeof rules === 'object' && !Array.isArray(rules), 'Invalid approver edit rules');
        result.editRules = Object.fromEntries(Object.entries(rules).map(([kind, raw]) => {
            requireThat(['*','goods','software','services','contractors','equipment'].includes(kind), 'Unknown purchase type');
            const rule = raw as Data;
            requireThat(rule && Array.isArray(rule.allowed) && rule.allowed.every((field: string) => headerFields.includes(field as any)), 'Invalid allowed approver field');
            const material = rule.material ?? materialDefaults;
            requireThat(Array.isArray(material) && material.every((field: string) => headerFields.includes(field as any)), 'Invalid material approver field');
            return [kind, { allowed: [...new Set(rule.allowed)], material: [...new Set(material)] }];
        }));
    }
    return result;
}
export function routeFor(policy: Data, request: Data) {
    return [{ id: 'primary', email: policy.approver, dependsOn: materialDefaults }, ...(policy.approvalSteps ?? [])
        .filter((step: Data) => request.totalMinor >= step.minMinor && (step.costCentre === '*' || step.costCentre === request.costCentre))]
        .map((step: Data) => ({ id: step.id, email: step.email, dependsOn: step.dependsOn }));
}
export function stepDecision(s: State, request: Data, step: Data) {
    return all(s,'decision').find(decision => decision.request === request.id && decision.revision === request.revision && decision.chainStep === step.id && decision.decision === 'approved');
}
export function currentStep(s: State, request: Data): Data | undefined {
    return request.approvalRoute?.find((step: Data) => !stepDecision(s,request,step));
}
export function chainHolder(s: State, a: Actor, request: Data) {
    const step = currentStep(s,request);
    return Boolean(step && step.email === a.email && allowed(s,a,'request.approve',request) && a.id !== request.requester && a.email !== request.requesterEmail);
}
function currentRoute(s: State, request: Data) {
    const policy = policies(s,request).find(policy => policy.id === request.policy);
    requireThat(policy && request.approvalPolicyVersion === s.get('policy:'+policy.id)?.revision && JSON.stringify(routeFor(policy,request)) === JSON.stringify(request.approvalRoute), 'Approval route or policy changed; renew approval',409);
    return policy;
}
function reserve(s: State, a: Actor, request: Data, policy: Data) {
    const balance = all(s,'commitment').filter(event => event.request === request.id && event.policy === policy.id && event.currency === request.currency).reduce((sum,event)=>sum+event.amountMinor,0);
    const delta = approvalAmount(request,s) - balance;
    requireThat(reserved(s,policy.id) + delta <= policy.budgetMinor, 'Budget exhausted by existing commitments',409);
    if (delta) ledger(s,a,request,delta,'pending-chain-reservation');
}
export function startChain(s: State, a: Actor, request: Data, policy: Data) {
    if (!policy.approvalSteps) return;
    const next = {...request,status:'pending',policy:policy.id,approvalRoute:routeFor(policy,request),approvalPolicyVersion:s.get('policy:'+policy.id)!.revision};
    reserve(s,a,next,policy);
    put(s,'request',request.id,next);
    put(s,'revision',request.id+':'+request.revision,{...next,request:request.id});
    return next;
}
export function chainDecision(s: State, a: Actor, request: Data, input: Data) {
    if (!request.approvalRoute) return;
    const policy = currentRoute(s,request), step = currentStep(s,request);
    requireThat(chainHolder(s,a,request),'You do not hold the current non-self approval step',403);
    requireThat(['approved','returned','rejected'].includes(input.decision),'Choose approve, reject or return');
    const reason = text(input.reason,'Decision reason'), id=uid();
    if (input.decision === 'approved') reserve(s,a,request,policy);
    else {
        const prior=request.amends ? get(s,'order',request.amends) : undefined, balances=new Map<string,number>();
        for(const event of all(s,'commitment').filter(event=>event.request===request.id))balances.set(event.policy,(balances.get(event.policy)??0)+event.amountMinor);
        for(const [id,balance]of balances){const retained=prior?.policy===id ? Math.min(balance,remainingValue(s,prior)) : 0;if(balance!==retained)ledger(s,a,{...request,policy:id},retained-balance,'chain-decision-release');}
    }
    put(s,'decision',id,{request:request.id,revision:request.revision,decision:input.decision,chainStep:step!.id,reason,actor:a.id,email:a.email,owner:a.owner,operatorVersion:a.version,at:new Date().toISOString(),policy:policy.id,policyVersion:request.approvalPolicyVersion,policySnapshot:structuredClone(policy),delegation:null});
    const status = input.decision === 'approved' && currentStep(s,request) ? 'pending' : input.decision;
    put(s,'request',request.id,{...request,status});
    audit(s,a,'decision',request.id,{revision:request.revision,decision:input.decision,reason,decisionId:id,chainStep:step!.id,status});
    return get(s,'request',request.id);
}
export function chainApproval(s: State, request: Data) {
    currentRoute(s,request);
    const proofs = request.approvalRoute.map((step: Data) => {
        const decision=stepDecision(s,request,step);
        requireThat(decision && decision.email === step.email && decision.policyVersion === request.approvalPolicyVersion && decision.email !== request.requesterEmail && decision.actor !== request.requester,'Every exact approval step must be approved',409);
        requireThat(decision.owner || allowed(s,{id:decision.actor,email:decision.email,owner:false,dev:false,session:'',version:decision.operatorVersion},'request.approve',request),'An earlier approver no longer holds authority',409);
        return decision;
    });
    return {...proofs[proofs.length-1],chainProofs:proofs.map((decision:Data)=>({actor:decision.actor,version:decision.operatorVersion}))};
}
export function approverEdits(s: State, a: Actor, op: string, input: Data): Data | undefined {
    if (op !== 'approver-edit') return;
    const request=get(s,'request',input.id);
    requireThat(request.status==='pending' && request.revision===input.revision && !request.imported,'Exact pending revision required',409);
    requireThat(chainHolder(s,a,request),'Only the current non-self approver may edit this request',403);
    const policy=currentRoute(s,request), editing=currentStep(s,request)!;
    const kind=request.purchaseType ?? request.lines[0].category.toLowerCase(), rule=policy.editRules?.[kind] ?? policy.editRules?.['*'];
    requireThat(rule,'Approver edits are disabled for this purchase type',403);
    const changes=input.changes;
    requireThat(changes && typeof changes==='object' && !Array.isArray(changes) && Object.keys(changes).length,'Provide header or coding changes');
    requireThat(Object.keys(changes).every(field=>rule.allowed.includes(field)),'Field is not allowed for approver editing',403);
    const next=structuredClone(request), differences:Data[]=[];
    for (const [field,value] of Object.entries(changes)) {
        const normalized=field==='needDate'?date(value):text(value,field);
        if (JSON.stringify(request[field])!==JSON.stringify(normalized)) {next[field]=normalized;differences.push({field,before:request[field]??null,after:normalized});}
    }
    requireThat(differences.length,'No fields changed');
    const business=get(s,'business','main');
    requireThat(business.costCentres.includes(next.costCentre) && business.locations.includes(next.location),'Use configured department and location');
    if (Object.hasOwn(changes,'project')) {requireThat(business.projects.includes(next.project),'Use a configured project');next.lines=next.lines.map((line:Data)=>({...line,project:next.project}));}
    // Supplier changes need the ordinary supplier eligibility checks and a new
    // frozen identity; this first native slice refuses that field explicitly.
    requireThat(!Object.hasOwn(changes,'supplier'),'Supplier approver edits require the supplier amendment path',409);
    requirePermission(s,a,'request.approve',next);
    const destination=policies(s,next)[0];requireThat(destination?.approvalSteps,'No chain policy covers the edited request',409);
    next.revision++;
    next.policy=destination.id;next.approvalRoute=routeFor(destination,next);next.approvalPolicyVersion=s.get('policy:'+destination.id)!.revision;
    requireThat(next.approvalRoute.some((step:Data)=>step.id===editing.id&&step.email===editing.email),'Edit would remove your current step; return the request instead',409);
    const material=differences.filter(difference=>rule.material.includes(difference.field)).map(difference=>difference.field), carried:string[]=[],renewed:string[]=[];
    const sameRoute=JSON.stringify(request.approvalRoute)===JSON.stringify(next.approvalRoute)&&request.policy===next.policy;
    for (const step of next.approvalRoute) {
        const before=stepDecision(s,request,step);
        if (before && sameRoute && (!material.length || !step.dependsOn.some((field:string)=>material.includes(field)))) {
            const id=uid();put(s,'decision',id,{...before,id,revision:next.revision,carriedFrom:before.id,carriedBy:a.id,carriedAt:new Date().toISOString(),policyVersion:next.approvalPolicyVersion});carried.push(id);
        } else if (before) renewed.push(before.id);
    }
    const balances=new Map<string,number>();
    for(const event of all(s,'commitment').filter(event=>event.request===request.id))balances.set(event.policy,(balances.get(event.policy)??0)+event.amountMinor);
    requireThat(!request.amends,'Use the ordinary amendment path for an already issued order',409);
    for(const [id,balance]of balances)if(id!==next.policy&&balance)ledger(s,a,{...request,policy:id},-balance,'approver-edit-reservation-release');
    reserve(s,a,next,destination);
    next.approverEdit={rule:structuredClone(rule),sourcePolicy:structuredClone(policy),actor:a.id,email:a.email,at:new Date().toISOString(),fromRevision:request.revision,differences,carried,renewed,reason:text(input.reason,'Approver edit reason'),policy:structuredClone(destination)};
    put(s,'request',next.id,next);put(s,'revision',next.id+':'+next.revision,{...next,request:next.id});
    audit(s,a,op,next.id,{revision:next.revision,...next.approverEdit});
    return next;
}
