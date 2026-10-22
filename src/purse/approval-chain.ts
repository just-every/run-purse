import { budgetOwnerSteps } from './budget-position';
import { correctApprovalFields, correctionFields, defaultMaterialFields } from './approver-corrections';
import { stepAuthority, stepHolderEmail, validateStepDecision, carryApprovalDecisions } from './approval-chain-authority';
export { carryApprovalDecisions } from './approval-chain-authority';
import { projectApprovalEdit } from './approval-edit-view';
import { remainingValue } from './orders';
import { moneyInput } from './money';
import { all, audit, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';
import { ledger, policies, approvalAmount, reservationAvailable } from './requests';

export const headerFields = correctionFields;
export const materialDefaults = defaultMaterialFields;
export function policyWorkflow(input: Data, previous?: Data) {
    const result: Data = {};
    const reviewer = input.internationalTravelReviewer === undefined ? previous?.internationalTravelReviewer : input.internationalTravelReviewer;
    if (reviewer !== undefined) {
        requireThat(typeof reviewer === 'string', 'Use an international travel reviewer email');
        if (reviewer.trim()) {
            const email = text(reviewer, 'International travel reviewer email', 254).toLowerCase();
            requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Use an international travel reviewer email');
            result.internationalTravelReviewer = email;
        }
    }
    if(input.overBudget!==undefined||previous?.overBudget){const mode=input.overBudget??previous?.overBudget;requireThat(['block','owner'].includes(mode),'Choose block or budget-owner review');result.overBudget=mode;if(mode==='owner'){const email=text(input.budgetOwner??previous?.budgetOwner,'Budget owner email').toLowerCase();requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Use a budget owner email');result.budgetOwner=email;}}
    if (input.approvalSteps !== undefined || previous?.approvalSteps) {
        const steps = input.approvalSteps ?? previous?.approvalSteps;
        requireThat(Array.isArray(steps) && steps.length <= 20, 'Provide at most 20 additional approval steps');
        result.approvalSteps = steps.map((step: Data, index: number) => {
            requireThat(step && typeof step === 'object', 'Invalid approval step');
            const email = text(step.email, 'Step approver email').toLowerCase();
            requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Use an approver email');
            const minMinor = moneyInput(step,'minAmount','minMinor','Approval threshold',{fallback:0});
            requireThat(Number.isSafeInteger(minMinor) && minMinor >= 0 && minMinor <= 1e12, 'Invalid approval threshold');
            const dependsOn = step.dependsOn ?? headerFields;
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
function internationalTravelReview(policy: Data, request: Data) {
    return policy.internationalTravelReviewer && request.purchaseType === 'travel' && request.travel?.destinations?.some((destination: Data) => destination.country !== 'US');
}
export function routeFor(policy: Data, request: Data) {
    const steps=[{ id: 'primary', email: policy.approver, dependsOn: headerFields }, ...(policy.approvalSteps ?? [])
        .filter((step: Data) => request.totalMinor >= step.minMinor && (step.costCentre === '*' || step.costCentre === request.costCentre))]
        .map((step: Data) => ({ id: step.id, email: step.email, dependsOn: step.dependsOn }));
    for(const owner of request.budgetOwnerSteps??[])if(!steps.some(step=>step.id===owner.id))steps.push(owner);
    if(request.budgetOwnerReview&&policy.overBudget==='owner'&&!steps.some(step=>step.id==='budget-owner'))steps.push({id:'budget-owner',email:policy.budgetOwner,dependsOn:['costCentre','project']});
    if (internationalTravelReview(policy, request)) steps.push({ id: 'international-travel-risk', email: policy.internationalTravelReviewer, dependsOn: headerFields });
    return steps;
}
export function stepDecision(s: State, request: Data, step: Data) {
    return all(s,'decision').find(decision => decision.request === request.id && decision.revision === request.revision && decision.chainStep === step.id && decision.decision === 'approved');
}
export function currentStep(s: State, request: Data): Data | undefined {
    return request.approvalRoute?.find((step: Data) => !stepDecision(s,request,step));
}
export function chainHolder(s: State, a: Actor, request: Data) {
    const step = currentStep(s,request);
    return Boolean(step && stepAuthority(s,a,request,step));
}
export function chainHolderEmail(s:State, request:Data) { const step=currentStep(s,request); return step?stepHolderEmail(s,request,step):undefined; }
function currentRoute(s: State, request: Data) {
    const policy = policies(s,request).find(policy => policy.id === request.policy);
    requireThat(policy && request.approvalPolicyVersion === s.get('policy:'+policy.id)?.revision && JSON.stringify(routeFor(policy,request)) === JSON.stringify(request.approvalRoute), 'Approval route or policy changed; renew approval',409);
    return policy;
}
function reserve(s: State, a: Actor, request: Data, policy: Data) {
    const balance = all(s,'commitment').filter(event => event.request === request.id && event.policy === policy.id && event.currency === request.currency).reduce((sum,event)=>sum+event.amountMinor,0);
    const delta = approvalAmount(request,s) - balance;
    const owners=(request.approvalRoute??[]).filter((step:Data)=>step.id==='budget-owner'||step.id.startsWith('budget-owner:'));
    if(owners.some((step:Data)=>!stepDecision(s,request,step)))return;
    requireThat(reservationAvailable(s,request,delta), 'Budget exhausted by existing commitments',409);
    if (delta) ledger(s,a,request,delta,'pending-chain-reservation');
}
function orderedPolicy(policy:Data, request:Data) { return Boolean(internationalTravelReview(policy,request)||policy.approvalSteps||policy.overBudget==='owner'||Object.values(policy.editRules??{}).some((rule:any)=>rule.allowed?.length)); }
export function startChain(s: State, a: Actor, request: Data, policy: Data) {
    if (!orderedPolicy(policy,request)) return;
    const next:Data = {...request,status:'pending',policy:policy.id,approvalPolicyVersion:s.get('policy:'+policy.id)!.revision};
    next.budgetOwnerSteps=budgetOwnerSteps(s,next,approvalAmount(next,s));
    next.budgetOwnerReview=next.budgetOwnerSteps.length>0||!reservationAvailable(s,next,approvalAmount(next,s))&&policy.overBudget==='owner';
    next.approvalRoute=routeFor(policy,next);
    requireThat(!next.approvalRoute.some((step:Data)=>all(s,'scimUser').some(user=>user.userName===step.email&&user.active===false)),'A chain approver was deactivated; select a current approval policy before submission',409);
    reserve(s,a,next,policy);
    put(s,'request',request.id,next);
    put(s,'revision',request.id+':'+request.revision,{...next,request:request.id});
    return projectApprovalEdit(s,a,next);
}
export function chainDecision(s: State, a: Actor, request: Data, input: Data) {
    if (!request.approvalRoute) return;
    const policy = currentRoute(s,request), step = currentStep(s,request);
    requireThat(chainHolder(s,a,request),'You do not hold the current non-self approval step',403);
    requireThat(['approved','returned','rejected'].includes(input.decision),'Choose approve, reject or return');
    const reason = text(input.reason,'Decision reason'), id=uid();
    if (input.decision !== 'approved') {
        const prior=request.amends ? get(s,'order',request.amends) : undefined, balances=new Map<string,number>();
        for(const event of all(s,'commitment').filter(event=>event.request===request.id))balances.set(event.policy,(balances.get(event.policy)??0)+event.amountMinor);
        for(const [id,balance]of balances){const retained=prior?.policy===id ? Math.min(balance,remainingValue(s,prior)) : 0;if(balance!==retained)ledger(s,a,{...request,policy:id},retained-balance,'chain-decision-release');}
    }
    put(s,'decision',id,{request:request.id,revision:request.revision,decision:input.decision,chainStep:step!.id,reason,actor:a.id,email:a.email,owner:a.owner,operatorVersion:a.version,at:new Date().toISOString(),policy:policy.id,policyVersion:request.approvalPolicyVersion,policySnapshot:structuredClone(policy),...stepAuthority(s,a,request,step!)});
    if(input.decision==='approved')reserve(s,a,request,policy);
    const status = input.decision === 'approved' && currentStep(s,request) ? 'pending' : input.decision;
    put(s,'request',request.id,{...request,status});
    audit(s,a,'decision',request.id,{revision:request.revision,decision:input.decision,reason,decisionId:id,chainStep:step!.id,status});
    return get(s,'request',request.id);
}
export function chainApproval(s: State, request: Data) {
    currentRoute(s,request);
    const proofs = request.approvalRoute.map((step: Data) => {
        const decision=stepDecision(s,request,step);
        requireThat(decision,'Every exact approval step must be approved',409);
        validateStepDecision(s,request,step,decision);
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
    const {next,differences}=correctApprovalFields(s,a,request,input.changes,rule);
    const destination=policies(s,next)[0];requireThat(destination&&orderedPolicy(destination,next),'No chain policy covers the edited request',409);
    next.revision++;
    next.policy=destination.id;next.budgetOwnerSteps=budgetOwnerSteps(s,next,approvalAmount(next,s));next.budgetOwnerReview=next.budgetOwnerSteps.length>0||destination.overBudget==='owner'&&!reservationAvailable(s,next,approvalAmount(next,s));next.approvalRoute=routeFor(destination,next);next.approvalPolicyVersion=s.get('policy:'+destination.id)!.revision;
    requireThat(next.approvalRoute.some((step:Data)=>step.id===editing.id&&step.email===editing.email),'Edit would remove your current step; return the request instead',409);
    const material=differences.filter(difference=>rule.material.includes(difference.codingField??difference.field)).map(difference=>difference.codingField??difference.field), selected:Data[]=[],renewed:string[]=[];
    const sameRoute=JSON.stringify(request.approvalRoute)===JSON.stringify(next.approvalRoute)&&request.policy===next.policy;
    for (const step of next.approvalRoute) {
        const before=stepDecision(s,request,step);
        if (before && sameRoute && (!material.length || !step.dependsOn.some((field:string)=>material.includes(field)))) {
            validateStepDecision(s,request,step,before);selected.push(before);
        } else if (before) renewed.push(before.id);
    }
    const carried=carryApprovalDecisions(s,a,request,next,selected);
    const balances=new Map<string,number>();
    for(const event of all(s,'commitment').filter(event=>event.request===request.id))balances.set(event.policy,(balances.get(event.policy)??0)+event.amountMinor);
    requireThat(!request.amends,'Use the ordinary amendment path for an already issued order',409);
    const movedCoding=differences.some(difference=>['costCentre','project'].includes(difference.codingField??difference.field));
    for(const [id,balance]of balances)if((id!==next.policy||movedCoding)&&balance)ledger(s,a,{...request,policy:id},-balance,'approver-edit-reservation-release');
    reserve(s,a,next,destination);
    next.approverEdit={rule:structuredClone(rule),sourcePolicy:structuredClone(policy),actor:a.id,email:a.email,at:new Date().toISOString(),fromRevision:request.revision,toRevision:next.revision,differences,carried,renewed,reason:text(input.reason,'Approver edit reason'),policy:structuredClone(destination)};
    put(s,'request',next.id,next);put(s,'revision',next.id+':'+next.revision,{...next,request:next.id});
    audit(s,a,op,next.id,{revision:next.revision,...next.approverEdit});
    return projectApprovalEdit(s,a,next);
}
