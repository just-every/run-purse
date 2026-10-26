import {check,same,money} from './restore-validation.mjs';

export function validateCombinedOrder(order,{get,all}) {
    check(Array.isArray(order.sources)&&order.sources.length>0&&new Set(order.sources.map(source=>source.request)).size===order.sources.length&&!order.imported&&!order.adoption,'combination_sources');
    check(order.sources[0].request===order.request&&order.sources[0].revision===order.revision&&typeof order.combinationRoot==='string','combination_primary');
    const selected=new Set();
    for(const source of order.sources) {
        const revision=get('revision',source.request+':'+source.revision);
        check(!revision.imported&&revision.currency===order.currency&&revision.supplier===order.supplier&&(revision.entity??'main')===(order.entity??'main')&&revision.terms===order.terms,'combination_source_identity');
        get('policy',source.policy);
        check(source.location===revision.location&&source.costCentre===revision.costCentre,'combination_scope');
        check(Array.isArray(source.lines)&&source.lines.length>0&&new Set(source.lines).size===source.lines.length,'combination_source_lines');
        for(const id of source.lines) {
            const original=revision.lines.find(line=>line.id===id),line=order.lines.find(line=>line.sourceRequest===source.request&&line.sourceLine===id);
            check(original&&line&&line.id===source.request+':'+id&&line.sourceRevision===source.revision&&!selected.has(line.id),'combination_line_source');selected.add(line.id);
            const expected={...original,id:line.id,sourceRequest:source.request,sourceRevision:source.revision,sourceLine:id,location:original.location??revision.location,costCentre:original.costCentre??revision.costCentre,documentProfile:source.documentProfile};
            check(same(line,expected),'combination_line_snapshot');
        }
        const lines=order.lines.filter(line=>line.sourceRequest===source.request);
        check(['freightMinor','taxMinor','otherChargesMinor','totalMinor'].every(field=>money(source[field]))&&source.totalMinor===lines.reduce((sum,line)=>sum+line.totalMinor,0)+source.freightMinor+source.taxMinor+source.otherChargesMinor,'combination_source_total');
        check(all('decision').some(decision=>decision.request===source.request&&decision.revision===source.revision&&decision.decision==='approved'&&decision.policy===source.policy&&decision.actor===source.approvalActor&&decision.operatorVersion===source.approvalVersion),'combination_source_approval');
        if(source.approvalProofs)for(const [index,proof]of source.approvalProofs.entries())check(all('decision').some(decision=>decision.request===source.request&&decision.revision===source.revision&&decision.chainStep===revision.approvalRoute?.[index]?.id&&decision.actor===proof.actor&&decision.operatorVersion===proof.version&&decision.decision==='approved'),'combination_chain_proof');
        if(source.conversionVariance)check(same(source.conversionVariance,revision.buyerConversion),'combination_conversion_source');
    }
    check(selected.size===order.lines.length&&['freightMinor','taxMinor','otherChargesMinor','totalMinor'].every(field=>order[field]===order.sources.reduce((sum,source)=>sum+source[field],0)),'combination_total');
    check(all('audit').some(event=>event.action==='po-combine'&&event.record===order.id&&same(event.sources,order.sources)),'combination_audit');
    if(order.issuedAt)check(all('audit').some(event=>event.action==='issue'&&event.record===order.id&&event.revision===order.revision&&event.actor===order.issuedBy),'combination_issue_audit');
    if(order.amends) {
        const prior=get('order',order.amends);check(prior.sources&&prior.amendedBy===order.id&&prior.combinationRoot===order.combinationRoot,'combination_amendment');
        check(prior.sources.length===order.sources.length&&prior.sources.every(source=>{const next=order.sources.find(next=>next.request===source.request);return next&&next.revision>source.revision&&same(next.lines,source.lines)&&get('revision',next.request+':'+next.revision).amends===prior.id;}),'combination_amendment_sources');
    }else check(order.combinationRoot===order.id,'combination_root');
    for(const other of all('order')) {
        if(other.id===order.id||other.combinationRoot===order.combinationRoot)continue;
        for(const line of other.lines)check(!order.lines.some(own=>own.sourceRequest===(line.sourceRequest??other.request)&&own.sourceLine===(line.sourceLine??line.id)),'combination_once');
    }
}
