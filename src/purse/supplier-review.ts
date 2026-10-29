import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index';
import { proposedSupplier, proposalChoices, mayReadProposal } from './supplier-proposals';
import { all, audit, can, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

function affectedRequests(s: State, id: string) {
    return all(s,'request').filter(r=>r.supplier===id);
}
/** Bind the supplier, every affected request and exact ledger events, including changes after approval. */
function reviewBasis(s: State, proposal: Data) {
    const requests = affectedRequests(s,proposal.id), ids = new Set(requests.map(r=>r.id));
    const rows = [...s.values()].filter(row=>
        row.kind==='supplierProposal' && row.id===proposal.id || row.kind==='supplier' && row.id===proposal.id ||
        ['request','order','commitment','decision'].includes(row.kind) && (ids.has(row.id) || ids.has(row.value.request)));
    return sha256(canonicalJson(rows.sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id)).map(row=>[row.kind,row.id,row.revision])));
}
export function proposalView(s: State, a: Actor, proposal: Data) {
    requireThat(mayReadProposal(s,a,proposal),'Proposal outside your scope',403);
    return {...proposal, reviewReason:proposal.review?s.get('supplierProposalReview:'+proposal.review)?.value.reason:undefined, statusSince:proposal.review?s.get('supplierProposalReview:'+proposal.review)?.value.at:proposal.at, basis:reviewBasis(s,proposal), holder:proposal.status==='pending'?'Native owner review':'Review complete',
        mayReject:a.owner && proposal.requester!==a.id && proposal.requesterEmail!==a.email && !proposal.erasure && proposal.status==='pending',
        activationHold:'Onboarding and verified-bank prerequisites remain unproved. Activation is unavailable.'};
}
export function supplierReview(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if(op==='supplier-proposal-choices')return proposalChoices(s,a,b);
    if(op==='supplier-propose')return proposalView(s,a,get(s,'supplierProposal',proposedSupplier(s,a,b)));
    if(op!=='supplier-proposal-reject')return;
    can(s,a,'owner');
    const proposal = get(s,'supplierProposal',b.id), value=get(s,'supplier',proposal.supplier);
    requireThat(proposal.requester!==a.id && proposal.requesterEmail!==a.email,'The proposer cannot decide their own supplier review',403);
    requireThat(proposal.status==='pending' && !proposal.erasure && value.status==='proposed' && !value.mergedInto,'Proposal is no longer pending review',409);
    requireThat(b.version===(proposal.version??1) && b.basis===reviewBasis(s,proposal),'Supplier review changed; reload and review again',409);
    const reason=text(b.reason,'Rejection reason'), requests=affectedRequests(s,proposal.id);
    requireThat(requests.every(r=>!r.imported && !r.adoption && !r.amends &&
        !all(s,'order').some(o=>o.request===r.id && (o.issuedAt || o.imported || o.adoption || !['prepared','superseded'].includes(o.status)))),
        'Only wholly unissued native requests may be returned by supplier rejection',409);
    const at=new Date().toISOString(), review=uid(), releases:string[]=[];
    for(const request of requests) {
        // Reverse outstanding recorded allocations; current policies cannot redirect old reservations.
        const groups=new Map<string,Data>();
        for(const event of all(s,'commitment').filter(e=>e.request===request.id)) {
            const key=event.policy+':'+event.currency;
            const group=groups.get(key)??{policy:event.policy,currency:event.currency,amountMinor:0,shares:new Map<string,number>()};
            group.amountMinor+=event.amountMinor;
            for(const share of event.budgetAllocations??[{policy:event.policy,amountMinor:event.amountMinor}])
                group.shares.set(share.policy,(group.shares.get(share.policy)??0)+share.amountMinor);
            groups.set(key,group);
        }
        for(const group of groups.values()) {
            requireThat(Number.isSafeInteger(group.amountMinor) && group.amountMinor>=0,'Reservation evidence is inconsistent',409);
            requireThat([...group.shares.values()].every(n=>Number.isSafeInteger(n)&&Number(n)>=0),'Reservation allocations are inconsistent',409);
            if(!group.amountMinor)continue;
            const id=uid();releases.push(id);
            put(s,'commitment',id,{request:request.id,revision:request.revision,policy:group.policy,currency:group.currency,
                amountMinor:-group.amountMinor,budgetAllocations:[...group.shares].map(([policy,amountMinor])=>({policy,amountMinor:-Number(amountMinor)})),
                kind:'supplier-rejection-release',review,actor:a.id,at});
        }
        put(s,'request',request.id,{...request,status:'returned',supplierRejection:{review,reason,at}});
        for(const order of all(s,'order').filter(o=>o.request===request.id&&o.status==='prepared'))put(s,'order',order.id,{...order,status:'superseded'});
        audit(s,a,'supplier-rejection-return',request.id,{review,reason,revision:request.revision});
    }
    const decision={id:review,proposal:proposal.id,supplier:proposal.supplier,decision:'rejected',reason,actor:a.id,operatorVersion:a.version,at,
        basis:b.basis,proposalVersion:proposal.version??1,requests:requests.map(r=>({id:r.id,revision:r.revision})),releases};
    put(s,'supplierProposalReview',review,decision);
    put(s,'supplierProposal',proposal.id,{...proposal,status:'rejected',version:(proposal.version??1)+1,review});
    put(s,'supplier',value.id,{...value,status:'rejected',requestedStatus:'rejected',reason});
    audit(s,a,op,proposal.id,{review,reason,decision:'rejected'});
    return proposalView(s,a,get(s,'supplierProposal',proposal.id));
}
