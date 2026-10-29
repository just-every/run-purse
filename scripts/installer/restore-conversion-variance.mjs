import { check, same, lineAmounts, purchasing } from './restore-validation.mjs';
import { accessObject, accessText, validateBuyerLimit } from './restore-access.mjs';

const face = record => ({ supplier:record.supplier,supplierSnapshot:record.supplierSnapshot,lines:record.lines.map(({sourceLine,...line})=>line),charges:record.charges??[],freightMinor:record.freightMinor,taxMinor:record.taxMinor,otherChargesMinor:record.otherChargesMinor??0,totalMinor:record.totalMinor });
const legacyFace = record => ({lines:record.lines.map(({sourceLine,...line})=>line),freightMinor:record.freightMinor,taxMinor:record.taxMinor,totalMinor:record.totalMinor});
const immutableLine = ({quantity,q,unitMinor,totalMinor,unit,partNumber,lineTaxMinor,allocations,supplier,supplierSnapshot,...line}) => ({...line,...(allocations?{allocations:allocations.map(({amountMinor,...share})=>share)}:{})});
function percentage(before,after,limit=0) {
    if(after<=before)return true;
    const [coefficient,exponent='0']=String(limit).split('e'),[whole,fraction='']=coefficient.split('.'),power=Number(exponent)-fraction.length;
    const numerator=BigInt(whole+fraction)*(power>0?10n**BigInt(power):1n),denominator=power<0?10n**BigInt(-power):1n;
    return BigInt(after-before)*100n*denominator<=BigInt(before)*numerator;
}
function validateLimit(limit) { if(limit?.unlimited===true){check(Object.keys(limit).length===1,'conversion_limit');return;}validateBuyerLimit(limit); }
function limitProof(limit,before,after) {
    validateLimit(limit);if(limit.unlimited)return;
    const price=(before,after)=>after<=before||(limit.absoluteMinor!==undefined||limit.percent!==undefined)&&(limit.absoluteMinor===undefined||after-before<=limit.absoluteMinor)&&(limit.percent===undefined||percentage(before,after,limit.percent));
    check(price(before.totalMinor,after.totalMinor)&&before.lines.every((line,index)=>price(line.unitMinor,after.lines[index].unitMinor)&&price(line.totalMinor,after.lines[index].totalMinor)&&percentage(line.q,after.lines[index].q,limit.quantityPercent)),'conversion_limit');
}
function evidence(edit,source,current) {
    check(accessObject(edit)&&edit.sourceRequest===current.request&&edit.sourceRevision===source.revision&&!source.imported,'conversion_source');
    check(accessText(edit.actor)&&accessText(edit.email)&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(edit.email)&&accessText(edit.reason)&&Number.isFinite(Date.parse(edit.at)),'conversion_actor');
    const legacy=!Object.hasOwn(edit.before,'supplier'),snapshot=legacy?legacyFace:face;
    check(same(edit.before,snapshot(source))&&same(edit.after,snapshot(current))&&!same(edit.before,edit.after),'conversion_snapshot');
    lineAmounts(edit.before);lineAmounts(edit.after);
    check(edit.before.lines.length===edit.after.lines.length&&edit.before.lines.every((line,index)=>same(immutableLine(line),immutableLine(edit.after.lines[index]))),'conversion_line_identity');
    check(edit.after.lines.every((line,index)=>(same(line.unit,edit.before.lines[index]?.unit)||accessText(line.unit)&&line.unit.length<=200)&&(same(line.partNumber,edit.before.lines[index]?.partNumber)||accessText(line.partNumber)&&line.partNumber.length<=200)),'conversion_unit_sku');
    validateLimit(edit.limit);
    if(edit.withinLimit!==false)limitProof(edit.limit,edit.before,edit.after);
}
export function validatePurchaseCharges(record) {
    if(!Object.hasOwn(record,'charges')){check(!record.otherChargesMinor,'charge_lines');return;}
    check(Array.isArray(record.charges)&&record.charges.length<=30&&new Set(record.charges.map(charge=>charge.id)).size===record.charges.length,'charge_lines');
    for(const charge of record.charges)check(accessObject(charge)&&Object.keys(charge).every(key=>['id','kind','description','amountMinor'].includes(key))&&accessText(charge.id)&&['freight','tax','other'].includes(charge.kind)&&accessText(charge.description)&&charge.description.length<=200&&Number.isSafeInteger(charge.amountMinor)&&charge.amountMinor>=0&&charge.amountMinor<=1e12,'charge_line');
    const sum=kind=>record.charges.filter(charge=>charge.kind===kind).reduce((total,charge)=>total+charge.amountMinor,0);
    check(sum('freight')===record.freightMinor&&sum('tax')===record.taxMinor&&sum('other')===(record.otherChargesMinor??0),'charge_total');
}
export function validateConversionVariance(order,revision,all) {
    const edit=order.conversionVariance,source=all('revision').find(record=>record.request===order.request&&record.revision===edit.sourceRevision);
    check(source,'conversion_source');
    const legacy=!Object.hasOwn(edit,'withinLimit');
    if(legacy){evidence(edit,source,{...order,request:order.request});check(edit.sourceRevision===order.revision,'conversion_source');}
    else {
        check(edit.sourceRevision<order.revision&&same(revision.buyerConversion,Object.fromEntries(Object.entries(edit).filter(([key])=>key!=='approvalRenewed'))),'conversion_request_revision');
        evidence(edit,source,order.supplierGroup?revision:{...order,request:order.request});
        check(order.supplierGroup || same(purchasing({...order,lines:order.lines.map(({sourceLine,...line})=>line)}),purchasing(revision)),'conversion_purchase_identity');
        check(edit.approvalRenewed===(edit.routing!=='carried'),'conversion_renewal');
    }
    check(order.location===revision.location&&order.costCentre===revision.costCentre&&(order.entity??'main')===(revision.entity??'main'),'conversion_scope_identity');
    const audit=all('audit');
    check(audit.some(event=>event.action==='buyer-conversion-edit'&&event.record===order.id&&event.request===order.request&&Object.keys(edit).every(field=>Object.hasOwn(event,field)&&same(event[field],edit[field]))),'conversion_edit_audit');
    check(audit.some(event=>event.action==='convert'&&event.record===order.id&&event.request===order.request&&event.revision===order.revision&&Number.isFinite(Date.parse(event.at))),'conversion_create_audit');
    if(order.issuedAt){
        check(Number.isFinite(Date.parse(order.issuedAt))&&accessText(order.issuedBy)&&accessText(order.issueReason),'conversion_issue');
        const issue=audit.find(event=>event.action==='issue'&&event.record===order.id&&event.revision===order.revision&&event.actor===order.issuedBy&&event.conversionSourceRevision===edit.sourceRevision&&Number.isFinite(Date.parse(event.at)));
        check(issue,'conversion_issue_audit');
        if(!edit.approvalRenewed){check(accessObject(issue.conversionLimit),'conversion_issue_audit');limitProof(issue.conversionLimit,edit.before,edit.after);}
    }
}
export function validateConversionRevisions(all,get) {
    for(const revision of all('revision')) {
        const edit=revision.buyerConversion;
        if(edit&&edit.sourceRevision===revision.revision-1){
            const source=get('revision',revision.request+':'+edit.sourceRevision);
            evidence(edit,source,revision);
            check(['carried','renewal','budget-owner'].includes(edit.routing)&&Array.isArray(edit.carried)&&Array.isArray(edit.renewed),'conversion_route');
            if(edit.routing==='carried'){
                check(edit.withinLimit&&edit.carried.length>0&&!edit.renewed.length,'conversion_carry');
                for(const id of edit.carried){const decision=get('decision',id),before=get('decision',decision.carriedFrom);check(decision.request===revision.request&&decision.revision===revision.revision&&before.revision===source.revision&&before.decision==='approved'&&decision.actor===before.actor&&decision.email===before.email&&decision.carriedBy===edit.actor,'conversion_carry');}
            }else check(!edit.carried.length&&edit.renewed.length>0,'conversion_renewal');
            check(all('audit').some(event=>event.action==='buyer-conversion-revision'&&event.record===revision.request&&event.revision===revision.revision&&event.actor===edit.actor&&same(event.before,edit.before)&&same(event.after,edit.after)&&same(event.limit,edit.limit)),'conversion_revision_audit');
        }
        const date=revision.needDateEdit;
        if(date&&date.fromRevision===revision.revision-1){
            const source=get('revision',revision.request+':'+date.fromRevision);
            check(accessText(date.actor)&&accessText(date.email)&&accessText(date.reason)&&Number.isFinite(Date.parse(date.at))&&Array.isArray(date.carried)&&date.carried.length>0&&Array.isArray(date.differences)&&date.differences.length>0,'date_correction');
            const strip=record=>{const value=purchasing(record);delete value.needDate;value.lines=value.lines.map(({needDate,carriedAccepted,carriedCancelled,carriedAcceptedMinor,carriedCancelledMinor,carriedMilestones,...line})=>line);return value;};
            check(same(strip(source),strip(revision)),'date_nonmaterial');
            for(const difference of date.differences){const before=source.lines.find(line=>line.id===difference.line),after=revision.lines.find(line=>line.id===difference.line);check(before&&after&&difference.field==='needDate'&&difference.before===(before.needDate??source.needDate)&&difference.after===after.needDate,'date_difference');}
            check(all('audit').some(event=>event.action==='need-date-edit'&&event.record===revision.request&&event.revision===revision.revision&&event.actor===date.actor&&same(event.differences,date.differences)),'date_correction_audit');
        }
    }
}

/** Restored grouped documents remain exact history; they confer no restored authority. */
export function validateSupplierGroups(order,revision,all) {
    const group=order.supplierGroup;
    check(group && group.key===order.request+':'+order.revision && !revision.amends && !revision.imported && !revision.adoption && !revision.recurringSeries && !revision.poDetails?.blanket && !revision.poDetails?.depositTerms && (!revision.purchaseType || revision.purchaseType==='goods') && revision.lines.every(line=>!line.service&&!line.carriedAccepted&&!line.carriedCancelled),'supplier_group_source');
    const ids=[...new Set(revision.lines.map(line=>line.supplier??revision.supplier))];
    check(ids.length>1&&group.count===ids.length&&ids[group.index]===order.supplier&&group.requestTotalMinor===revision.totalMinor,'supplier_group_identity');
    const siblings=all('order').filter(other=>other.request===order.request&&other.supplierGroup?.key===group.key);
    check(siblings.length===ids.length&&new Set(siblings.map(other=>other.supplier)).size===ids.length&&siblings.reduce((sum,other)=>sum+other.totalMinor,0)===revision.totalMinor,'supplier_group_total');
    const selected=revision.lines.map((line,index)=>({line,index})).filter(({line})=>(line.supplier??revision.supplier)===order.supplier);
    check(same(order.lines.map(({sourceLine,...line})=>line),selected.map(({line})=>line))&&same(order.supplierSnapshot,selected[0].line.supplierSnapshot??revision.supplierSnapshot),'supplier_group_lines');
    for(const field of ['currency','terms','needDate','poDetails'])check(same(order[field],revision[field]),'supplier_group_terms');
    const apportion=(amount,weights)=>{const total=weights.reduce((sum,weight)=>sum+BigInt(weight),0n),denominator=total||BigInt(weights.length),parts=weights.map((weight,index)=>{const numerator=BigInt(amount)*(total?BigInt(weight):1n);return {index,value:Number(numerator/denominator),remainder:numerator%denominator};});let left=amount-parts.reduce((sum,part)=>sum+part.value,0);for(const part of [...parts].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1)){if(!left)break;part.value++;left--;}return parts.map(part=>part.value);};
    const charges=revision.charges??[...(revision.freightMinor?[{id:'freight',kind:'freight',description:'Freight',amountMinor:revision.freightMinor}]:[]),...(revision.taxMinor?[{id:'tax',kind:'tax',description:'Supplied tax',amountMinor:revision.taxMinor}]:[])];
    const remainingTax=revision.lines.map(line=>line.lineTaxMinor??0);
    const expected=charges.map(charge=>{const values=apportion(charge.amountMinor,charge.kind==='tax'?remainingTax:revision.lines.map(line=>line.totalMinor));if(charge.kind==='tax')values.forEach((value,index)=>{remainingTax[index]-=value;});return {...charge,amountMinor:selected.reduce((sum,{index})=>sum+values[index],0)};});
    check(same(order.charges,expected),'supplier_group_charges');
    const lineAmounts=revision.lines.map(line=>line.totalMinor),taxLeft=revision.lines.map(line=>line.lineTaxMinor??0);
    for(const charge of charges){const values=apportion(charge.amountMinor,charge.kind==='tax'?taxLeft:revision.lines.map(line=>line.totalMinor));values.forEach((value,index)=>{lineAmounts[index]+=value;if(charge.kind==='tax')taxLeft[index]-=value;});}
    check(same(group.lineExposure,selected.map(({line,index})=>({line:line.id,baseMinor:line.totalMinor,amountMinor:lineAmounts[index]}))),'supplier_group_budget');
    check(!all('order').some(other=>other.request===order.request&&other.supplierGroup?.key!==group.key),'supplier_group_once');
}
