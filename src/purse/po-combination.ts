import { supplier } from './admin';
import { currentDecision } from './approval';
import { conversionEdits, currentConversionLimit, conversionFace } from './conversion-variance';
import { reviseForConversion } from './conversion-revision';
import { lapsedSupplierDocuments } from './supplier-documents';
import { poProfileSnapshot } from './po-profiles';
import { policies } from './requests';
import { allocatedSourceLine, combinationShares, orderSources, requireCurrentCombination } from './po-combination-sources';
import { all, audit, get, minor, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';

function eligible(s: State,a: Actor,request: Data) {
    requirePermission(s,a,'po.convert',request);
    requireThat(request.status==='approved' && !request.imported && !request.adoption && request.purchaseType!=='travel' && !request.poDetails?.blanket,'Choose current native approved ordinary request lines',409);
    supplier(s,request.supplier);
    requireThat(!lapsedSupplierDocuments(s,request.supplier).length,'Required supplier document has lapsed',409);
    requireThat(request.supplierSnapshot?.id===request.supplier,'Approved supplier identity is missing',409);
    currentDecision(s,request);
}
export function issueCombinedOrder(s: State,a: Actor,b: Data) {
    const order=get(s,'order',b.id);
    requireThat(order.sources && order.status==='prepared' && b.revision===order.revision,'Combined PO document or authority is stale',409);
    requireCurrentCombination(s,order);
    requirePermission(s,a,'po.issue',order);
    supplier(s,order.supplier);
    requireThat(!lapsedSupplierDocuments(s,order.supplier).length,'Required supplier document has lapsed',409);
    for(const source of order.sources) {
        const request=get(s,'request',source.request);eligible(s,a,request);requirePermission(s,a,'po.issue',request);
        currentDecision(s,request);
        if(source.conversionVariance && !source.conversionVariance.approvalRenewed)currentConversionLimit(s,a,get(s,'revision',request.id+':'+source.conversionVariance.sourceRevision),conversionFace(request));
        requireThat(policies(s,request).some(policy=>policy.id===request.policy),'Approval policy changed',409);
    }
    if(order.amends){const prior=get(s,'order',order.amends);requireThat(prior.status==='amendment-pending'&&!prior.amendedBy,'Prior combined PO changed',409);put(s,'order',prior.id,{...prior,status:'amended',amendedBy:order.id});}
    put(s,'order',order.id,{...order,status:'issued',issuedAt:new Date().toISOString(),issuedBy:a.id,issueReason:text(b.reason,'Issue confirmation')});
    audit(s,a,'issue',order.id,{revision:order.revision,sources:order.sources.map((source:Data)=>({request:source.request,revision:source.revision}))});
    return get(s,'order',order.id);
}
export function poCombination(s: State,a: Actor,op: string,b: Data): Data | undefined {
    if(op!=='po-combine')return;
    requireThat(Array.isArray(b.entries) && b.entries.length>0 && b.entries.length<=500,'Select approved source request lines');
    const prior=b.amends?get(s,'order',text(b.amends,'Combined amendment source',200)):undefined;
    if(prior){requireThat(prior.sources&&prior.status==='amendment-pending'&&!prior.amendedBy,'Choose the current combined PO awaiting amendment',409);requirePermission(s,a,'po.convert',prior);}
    const grouped=new Map<string,{request:Data;ids:Set<string>}>();
    for(const entry of b.entries) {
        const request=get(s,'request',text(entry.request,'Source request',200));eligible(s,a,request);
        requireThat(entry.revision===request.revision,'Source request revision changed; reload',409);
        requireThat(typeof entry.line==='string' && request.lines.some((line:Data)=>line.id===entry.line),'Choose an approved source line');
        const group=grouped.get(request.id)??{request,ids:new Set<string>()};
        requireThat(!group.ids.has(entry.line) && (!allocatedSourceLine(s,request.id,entry.line)||prior?.sources.some((source:Data)=>source.request===request.id&&source.lines.includes(entry.line))),'Approved source line already allocated to a PO',409);
        group.ids.add(entry.line);grouped.set(request.id,group);
    }
    const groups=[...grouped.values()],first=groups[0].request;
    if(prior)requireThat(groups.length===prior.sources.length&&prior.sources.every((source:Data)=>{const group=grouped.get(source.request);return group&&group.request.amends===prior.id&&group.request.revision>source.revision&&source.lines.length===group.ids.size&&source.lines.every((id:string)=>group.ids.has(id));}),'A combined amendment needs every original source line with renewed exact approval',409);
    else requireThat(groups.every(({request})=>!request.amends),'Recombine approved amendment sources with their original combined PO',409);
    requireThat(groups.every(({request})=>request.supplier===first.supplier && request.currency===first.currency && (request.entity??'main')===(first.entity??'main')),'Combined lines must share supplier, entity and currency',409);
    requireThat(groups.every(({request})=>request.terms===first.terms),'Combined requests require matching approved payment terms',409);
    const edits=b.conversionEdits;
    requireThat(!prior||edits===undefined,'Post-issue combined corrections require source amendments and renewed approval',409);
    if(edits!==undefined)requireThat(edits && Array.isArray(edits.lines) && Object.keys(edits).every(field=>['lines','supplier','charges','reason'].includes(field)),'Provide combined line corrections and optional charges');
    const editKeys=new Set<string>();
    for(const edit of edits?.lines??[]) {
        const group=grouped.get(edit.request),key=JSON.stringify([edit.request,edit.id]);
        requireThat(group?.ids.has(edit.id) && !editKeys.has(key),'Edit each selected source line once');editKeys.add(key);
    }
    const selected=groups.flatMap(({request,ids})=>request.lines.filter((line:Data)=>ids.has(line.id)));
    const added=edits?.charges??[];
    requireThat(Array.isArray(added),'Charges must be a list');
    const totals=added.map((charge:Data)=>minor(charge.amountMinor,'Charge amount'));
    const assigned=totals.map((total:number)=>combinationShares(total,selected));
    let offset=0;const revised:Data[]=[];
    for(const group of groups) {
        let request=group.request;
        const lines=(edits?.lines??[]).filter((edit:Data)=>edit.request===request.id).map(({request:_,...edit}:Data)=>edit);
        const chosen=request.lines.filter((line:Data)=>group.ids.has(line.id));
        const charges=added.map((charge:Data,index:number)=>({...charge,amountMinor:assigned[index].slice(offset,offset+chosen.length).reduce((sum:number,value:number)=>sum+value,0)}));offset+=chosen.length;
        if(edits) {
            requireThat(!request.lines.some((line:Data)=>allocatedSourceLine(s,request.id,line.id)),'Correct already allocated sources through a combined amendment',409);
            const currentCharges=request.charges??[...(request.freightMinor?[{kind:'freight',description:'Approved freight',amountMinor:request.freightMinor}]:[]),...(request.taxMinor?[{kind:'tax',description:'Approved tax',amountMinor:request.taxMinor}]:[])];
            const edit=conversionEdits(s,a,request,{lines,...(edits.supplier?{supplier:edits.supplier}:{}),...(charges.length?{charges:[...currentCharges,...charges]}:{}),reason:edits.reason});
            if(edit){
                const extraTax=charges.filter((charge:Data)=>charge.kind==='tax').reduce((sum:number,charge:Data)=>sum+charge.amountMinor,0);
                if(extraTax){const selectedLines=edit.face.lines.filter((line:Data)=>group.ids.has(line.id)),taxShares=combinationShares(extraTax,selectedLines);let index=0;edit.face.lines=edit.face.lines.map((line:Data)=>({...line,lineTaxMinor:(request.lines.find((original:Data)=>original.id===line.id).lineTaxMinor??0)+(group.ids.has(line.id)?taxShares[index++]:0)}));edit.variance.after=conversionFace({...request,...edit.face});}
                request=reviseForConversion(s,a,request,edit);
            }
        }
        revised.push({...group,request,original:group.request,addedCharges:charges});
    }
    if(revised.some(group=>group.request.status!=='approved'))return {conversionRouted:true,requests:revised.map(group=>({id:group.request.id,revision:group.request.revision,status:group.request.status}))};
    const destination=revised[0].request.supplier;
    requireThat(revised.every(group=>group.request.supplier===destination),'A combined PO requires one supplier',409);
    const orderLines:Data[]=[],sources:Data[]=[];
    for(const {request,ids,original,addedCharges} of revised) {
        const selected=request.lines.filter((line:Data)=>ids.has(line.id));
        requireThat(selected.every((line:Data)=>!line.supplier||line.supplier===destination),'Align selected line suppliers before combination',409);
        
        const originalCharges=original.charges??[...(original.freightMinor?[{id:uid(),kind:'freight',description:'Approved freight',amountMinor:original.freightMinor}]:[]),...(original.taxMinor?[{id:uid(),kind:'tax',description:'Approved tax',amountMinor:original.taxMinor}]:[])];
        const charges=[...originalCharges.map((charge:Data)=>({...charge,amountMinor:combinationShares(charge.amountMinor,charge.kind==='tax'?original.lines.map((line:Data)=>({...line,totalMinor:line.lineTaxMinor??0})):original.lines).reduce((sum:number,value:number,index:number)=>sum+(ids.has(original.lines[index].id)?value:0),0)})),...addedCharges.map((charge:Data)=>({...charge,id:uid()}))];
        const sumCharges=(kind:string)=>charges.filter((charge:Data)=>charge.kind===kind).reduce((sum:number,charge:Data)=>sum+charge.amountMinor,0);
        const freightMinor=sumCharges('freight'),taxMinor=sumCharges('tax'),otherChargesMinor=sumCharges('other');
        const profile=poProfileSnapshot(s,request,a),approval=currentDecision(s,request);
        sources.push({request:request.id,revision:request.revision,lines:selected.map((line:Data)=>line.id),policy:request.policy,location:request.location,costCentre:request.costCentre,entity:request.entity??'main',freightMinor,taxMinor,otherChargesMinor,charges,totalMinor:selected.reduce((sum:number,line:Data)=>sum+line.totalMinor,0)+freightMinor+taxMinor+otherChargesMinor,documentProfile:profile,approvalActor:approval.actor,approvalVersion:approval.operatorVersion,...(approval.chainProofs?{approvalProofs:approval.chainProofs}:{}),...(request.buyerConversion?{conversionVariance:{...structuredClone(request.buyerConversion),approvalRenewed:request.buyerConversion.routing!=='carried'}}:{})});
        for(const line of selected)orderLines.push({...structuredClone(line),id:request.id+':'+line.id,sourceRequest:request.id,sourceRevision:request.revision,sourceLine:line.id,location:line.location??request.location,costCentre:line.costCentre??request.costCentre,documentProfile:profile});
    }
    const primary=revised[0].request,id=uid();let sequence=all(s,'order').reduce((max,order)=>Math.max(max,order.sequence??0),0)+1;
    while(all(s,'order').some(order=>order.number===`PO-${String(sequence).padStart(6,'0')}`))sequence++;
    const sum=(field:string)=>minor(sources.reduce((total,source)=>total+source[field],0),'Combined total');
    const order:Data={id,sequence,number:`PO-${String(sequence).padStart(6,'0')}`,request:primary.id,revision:primary.revision,policy:primary.policy,sources,entity:primary.entity??'main',location:primary.location,costCentre:primary.costCentre,supplier:destination,...(prior?{amends:prior.id,combinationRoot:prior.combinationRoot??prior.id}:{}),supplierSnapshot:structuredClone(primary.supplierSnapshot),currency:primary.currency,terms:primary.terms,needDate:primary.needDate,lines:orderLines,charges:sources.flatMap(source=>source.charges),freightMinor:sum('freightMinor'),taxMinor:sum('taxMinor'),otherChargesMinor:sum('otherChargesMinor'),totalMinor:sum('totalMinor'),approvalActor:sources[0].approvalActor,approvalVersion:sources[0].approvalVersion,documentProfile:sources[0].documentProfile,status:'prepared',generatedAt:new Date().toISOString(),issuedAt:null};
    if(!prior)order.combinationRoot=id;
    requirePermission(s,a,'po.convert',order);put(s,'order',id,order);audit(s,a,op,id,{sources:orderSources(order)});
    if(b.issue===true)return issueCombinedOrder(s,a,{id,revision:order.revision,reason:edits?.reason??'Issue combined approved lines'});
    return order;
}
/** The scheduler supplies its freshly authenticated standing-rule principal. No edits are accepted here. */
export function combineApprovedDaily(s: State,a: Actor,requests: Data[]) {
    const order=poCombination(s,a,'po-combine',{entries:requests.flatMap(request=>request.lines.filter((line:Data)=>!allocatedSourceLine(s,request.id,line.id)).map((line:Data)=>({request:request.id,revision:request.revision,line:line.id}))),issue:true});
    requireThat(order&&!order.conversionRouted,'Daily combination did not produce an issued PO',409);return order;
}
