import { supplier } from './admin';
import { requireAgentPolicies, purchaseTypes } from './agent-governance';
import { lapsedSupplierDocuments } from './supplier-documents';
import { canonicalValue } from './agent-value-evidence';
import { rejectProtectedInput } from './protected-input';
import { all, audit, date, get, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';

function alternatives(s: State, order: Data) {
    const quotes = all(s, 'quote').filter(q => q.request === order.request && q.revision === order.revision);
    const latest = new Map<string, Data>();
    for (const q of quotes.sort((a,b) => a.sequence - b.sequence)) latest.set(q.supplier, q);
    const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
    return [...latest.values()].filter(q => {
        if (q.supplier === order.supplier || q.currency !== order.currency || q.missing.length || !q.delivery || q.delivery > order.needDate
            || q.delivery < new Date().toISOString().slice(0,10) || q.lines.length !== order.lines.length) return false;
        try { supplier(s,q.supplier); if (lapsedSupplierDocuments(s,q.supplier).length) return false; } catch { return false; }
        return order.lines.every((line: Data) => q.lines.some((offered: Data) => normalize(offered.description) === normalize(line.description)
            && offered.unit === line.unit && offered.q === line.q && offered.category === line.category));
    }).map(q => ({ kind: 'another-supplier', quote: q.id, supplier: q.supplier, supplierName: get(s,'supplier',q.supplier).name,
        currency: q.currency, totalMinor: q.lines.reduce((sum: number,l: Data) => sum+l.totalMinor,0)+q.freightMinor+q.taxMinor,
        delivery: q.delivery, source: q.source, conditions: q.conditions,
        reason: 'Latest exact-revision quote covers the recorded descriptions, units and quantities by the need date. Buyer must verify suitability and amend; no commitment is made.' }))
        .sort((a,b) => a.totalMinor-b.totalMinor || a.delivery.localeCompare(b.delivery));
}

/** Deterministic reading of a dated supplier source; never executes source text. */
export function lateOrderResolution(s: State,a: Actor,op: string,b: Data): Data | undefined {
    if (op === 'late-order-record') return recordPromise(s,a,b);
    if (op !== 'late-order-resolve') return;
    rejectProtectedInput(b);
    const order=get(s,'order',text(b.order,'PO',200)),request=get(s,'request',order.request);
    requirePermission(s,a,'procurement.manage',order);requirePermission(s,a,'procurement.manage',request);
    requireThat(order.status === 'issued' && !order.imported && !order.amendedBy && order.issuedAt && order.revision === b.revision
        && request.revision === order.revision && request.status === 'approved','Use the current issued native approved PO',409);
    const controls=requireAgentPolicies(s,'AGENT-003',purchaseTypes(order));
    const policy=get(s,'orderChasePolicy',order.id);
    requireThat(policy.agent === 'AGENT-003' && policy.enabled && controls.every(c => policy.cadenceDays >= c.cadenceDays && policy.maxChases <= c.maxChases),'Buyer must authorize this agent’s follow-up schedule first',409);
    const reply=get(s,'orderThreadMessage',text(b.message,'Supplier reply',200));
    requireThat(reply.order === order.id && reply.revision === order.revision && reply.supplier === order.supplier
        && reply.direction === 'inbound' && reply.status === 'received' && !reply.erasure && !reply.original?.erasure,
        'Choose an available supplier reply to this exact revision',409);
    requireThat(!all(s,'supplierOrderEvidence').some(e=>e.history.some((entry:Data)=>entry.reply===reply.id)),'This supplier reply was already recorded',409);
    const id='late-resolution:'+uid();
    const matches=[...String(reply.body).matchAll(/\bpromised\s+(?:delivery|date)\s*:\s*(\d{4}-\d{2}-\d{2})\b/gi)];
    requireThat(matches.length === 1,'Supplier must state exactly one “Promised delivery: YYYY-MM-DD”; otherwise a buyer must clarify the source',409);
    const promisedDate=date(matches[0][1],'Supplier-promised date'),at=new Date().toISOString();
    const previous=s.get('supplierOrderEvidence:'+order.id)?.value;



    const delay=promisedDate > order.needDate,proposals=delay?alternatives(s,order):[],noticeId=uid();
    const inputs={order:{id:order.id,request:order.request,revision:order.revision,needDate:order.needDate,currency:order.currency,
        lines:order.lines.map((l: Data)=>({id:l.id,description:l.description,q:l.q,unit:l.unit,unitMinor:l.unitMinor,category:l.category}))},
        reply:{id:reply.id,provider:reply.provider,providerEmailId:reply.providerEmailId,body:reply.body,at:reply.at,senderVerified:false,originalSha256:reply.original.sha256},
        evidenceVersion:previous?.version??0,controls:controls.map(c=>({id:c.id,version:c.version,purchaseType:c.purchaseType})),schedule:{version:policy.version,maxChases:policy.maxChases,cadenceDays:policy.cadenceDays}};
    const refs=[{kind:'order',id:order.id,version:s.get('order:'+order.id)!.revision},{kind:'orderThreadMessage',id:reply.id,version:s.get('orderThreadMessage:'+reply.id)!.revision},
        ...proposals.map(p=>({kind:'quote',id:p.quote,version:s.get('quote:'+p.quote)!.revision}))];
    const message={channel:'in-app',recipient:request.requester,order:order.id,notice:noticeId,
        text:`${order.number}: supplier states delivery ${promisedDate}; need date ${order.needDate}. ${delay?'The stated promise threatens the need date.':'The stated promise is within the need date.'} ${proposals.length?proposals.length+' source-priced alternative(s) await buyer review.':'No suitable complete priced-and-dated alternative is recorded.'}`};
    const proposalId='record-promise:'+id;
    put(s,'proposedAction',proposalId,{run:id,runVersion:1,actor:a.id,action:'late-order-record',input:{id,version:1,confirmed:true},status:'proposed',references:refs});
    const run={id,agent:'AGENT-003',workflow:'late-order-resolution',actor:a.id,request:request.id,order:order.id,version:1,at,
        mode:'deterministic v1',model:'none',provider:'none',inputs,references:refs,
        sources:[{kind:'order',id:order.id,value:inputs.order},{kind:'orderThreadMessage',id:reply.id,value:inputs.reply},
            ...proposals.map(p=>({kind:'quote',id:p.quote,value:{...p,lines:get(s,'quote',p.quote).lines}}))],messages:[],notification:message,proposals:[proposalId],alternatives:proposals,
        outcomes:[{kind:'promise-evidence',status:'proposed',promisedDate,bindingChange:false}],
        missing:delay&&!proposals.length?['No complete current alternative quote with an on-time delivery date is recorded']:[]};
    // A stable source snapshot makes later directory edits incapable of rewriting this run.
    requireThat(canonicalValue(run).length <= 200_000,'Supplier source is too large for a governed record',413);
    put(s,'agentRun',id,run);audit(s,a,'late-order-resolve',order.id,{run:id,reply:reply.id,revision:order.revision,promisedDate,notice:noticeId,proposals:proposals.map(p=>p.quote)});
    return get(s,'agentRun',id);
}

function recordPromise(s: State,a: Actor,b: Data) {
    rejectProtectedInput(b);
    const run=get(s,'agentRun',text(b.id,'Agent run',200));
    requireThat(run.workflow==='late-order-resolution' && run.version===b.version && b.confirmed===true && !run.protectedContextCleanup,'Confirm the exact current source-bound promise action',409);
    const order=get(s,'order',run.order),request=get(s,'request',run.request);
    requirePermission(s,a,'procurement.manage',order);requirePermission(s,a,'procurement.manage',request);
    requireThat(order.status==='issued' && !order.amendedBy && order.revision===run.inputs.order.revision && request.revision===order.revision && request.status==='approved','PO revision changed',409);
    const controls=requireAgentPolicies(s,'AGENT-003',purchaseTypes(order)),policy=get(s,'orderChasePolicy',order.id);
    requireThat(policy.enabled && policy.agent==='AGENT-003' && policy.version===run.inputs.schedule.version && controls.every(c=>policy.cadenceDays>=c.cadenceDays && policy.maxChases<=c.maxChases),'Agent or schedule changed; prepare a new action',409);
    const proposal=get(s,'proposedAction',run.proposals[0]);
    requireThat(proposal.status==='proposed' && proposal.runVersion===run.version && (proposal.actor===a.id||a.owner) && proposal.action==='late-order-record','Promise proposal is stale or outside your authority',409);
    requireThat(run.references.every((ref:Data)=>s.get(ref.kind+':'+ref.id)?.revision===ref.version),'Source facts changed; prepare a new action',409);
    const reply=get(s,'orderThreadMessage',run.inputs.reply.id),previous=s.get('supplierOrderEvidence:'+order.id)?.value;
    requireThat(!reply.erasure && !reply.original.erasure && (previous?.version??0)===run.inputs.evidenceVersion,'Supplier evidence changed or was withdrawn',409);
    const at=new Date().toISOString(),promisedDate=run.outcomes[0].promisedDate;
    const source=`Supplier email ${reply.providerEmailId}; original SHA-256 ${reply.original.sha256}; stated sender is unverified. Promised delivery: ${promisedDate}`;
    const entry={version:(previous?.version??0)+1,promisedDate,acknowledgedAt:previous?.acknowledgedAt??reply.at,source,actor:a.id,agent:'AGENT-003',reply:reply.id,at};
    put(s,'supplierOrderEvidence',order.id,{order:order.id,supplier:order.supplier,...entry,history:[...(previous?.history??[]),entry]});
    put(s,'lateOrderNotice',run.notification.notice,{...run.notification,request:request.id,run:run.id,revision:order.revision,promisedDate,at});
    put(s,'agentRun',run.id,{...run,messages:[run.notification],outcomes:[{kind:'promise-evidence',status:'recorded',version:entry.version,promisedDate,notice:run.notification.notice,bindingChange:false,actor:a.id,at}]});
    put(s,'proposedAction',proposal.id,{...proposal,status:'executed',executedBy:a.id,at});
    audit(s,a,'late-order-record',order.id,{run:run.id,proposal:proposal.id,reply:reply.id,revision:order.revision,promisedDate,notice:run.notification.notice});
    return get(s,'agentRun',run.id);
}
