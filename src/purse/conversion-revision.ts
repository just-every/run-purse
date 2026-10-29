import { hasSupplierGroups } from './po-supplier-groups';
import { carryApprovalDecisions, routeFor, startChain } from './approval-chain';
import { currentDecision } from './approval';
import { budgetOwnerSteps } from './budget-position';
import { approvalAmount, ledger, policies, reservationAvailable } from './requests';
import { all, audit, get, put, requirePermission, requireThat, type Actor, type Data, type State } from './types';

/** Publish the buyer's exact face as a request revision. Original decisions and
 * snapshots remain append-only; a carry explicitly cites its original proof. */
export function reviseForConversion(s: State, a: Actor, previous: Data, edit: Data) {
    const next: Data = { ...structuredClone(previous), ...structuredClone(edit.face), revision: previous.revision+1 };
    delete next.approverEdit;
    delete next.needDateEdit;
    delete next.budgetOwnerReview;
    requirePermission(s,a,'po.convert',next);
    const candidate = policies(s,next).find(policy => policy.id === previous.policy) ?? policies(s,next)[0];
    requireThat(candidate,'No current approval policy covers the edited purchase; choose a policy before conversion',409);
    next.policy = candidate.id;
    const balance = all(s,'commitment').filter(event => event.request === previous.id && event.policy === next.policy && event.currency === next.currency).reduce((sum,event)=>sum+event.amountMinor,0);
    const grouped=hasSupplierGroups(next);
    const inBudget = reservationAvailable(s,next,Math.max(0,approvalAmount(next,s)-balance)) && (!grouped || !budgetOwnerSteps(s,next,approvalAmount(next,s)).length);
    const sameRoute=!previous.approvalRoute||JSON.stringify(routeFor(candidate,next))===JSON.stringify(previous.approvalRoute);
    const carry = edit.variance.withinLimit && candidate.id === previous.policy && sameRoute && inBudget;
    next.buyerConversion = { ...structuredClone(edit.variance), carried: [], renewed: [], routing: carry ? 'carried' : !inBudget ? 'budget-owner' : 'renewal' };
    if (carry) {
        next.buyerConversion.carried = carryApprovalDecisions(s,a,previous,next);
        next.status = 'approved';
        put(s,'request',next.id,next);
        const delta = approvalAmount(next,s)-balance;
        if(delta||grouped) ledger(s,a,next,delta,'buyer-conversion-reservation');
    } else {
        requireThat(inBudget || candidate.overBudget==='owner' || budgetOwnerSteps(s,next,approvalAmount(next,s)).length,'Edited purchase exceeds the budget and budget-owner review is not configured',409);
        next.status='pending';
        next.buyerConversion.renewed = all(s,'decision').filter(decision=>decision.request===previous.id&&decision.revision===previous.revision&&decision.decision==='approved').map(decision=>decision.id);
        for(const eventPolicy of new Set(all(s,'commitment').filter(event=>event.request===previous.id).map(event=>event.policy))) {
            const reserved = all(s,'commitment').filter(event=>event.request===previous.id&&event.policy===eventPolicy).reduce((sum,event)=>sum+event.amountMinor,0);
            if(reserved)ledger(s,a,{...previous,policy:eventPolicy},-reserved,'buyer-conversion-renewal-release');
        }
        delete next.approvalRoute; delete next.approvalPolicyVersion;
        if (!inBudget) next.budgetOwnerReview=true;
        put(s,'request',next.id,next);
        startChain(s,a,next,candidate);
    }
    const saved=get(s,'request',next.id);
    put(s,'revision',next.id+':'+next.revision,{...saved,request:next.id});
    audit(s,a,'buyer-conversion-revision',next.id,{revision:next.revision,...saved.buyerConversion});
    if (carry) currentDecision(s,saved);
    return saved;
}
