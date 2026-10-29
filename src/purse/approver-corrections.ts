import { supplier } from './admin';
import { hasSupplierGroups, requireGroupable } from './po-supplier-groups';
import { lapsedSupplierDocuments } from './supplier-documents';
import { date, get, requireThat, requirePermission, text, type Actor, type Data, type State } from './types';

export const correctionFields = ['glAccount', 'costCentre', 'location', 'class', 'project', 'needDate', 'shipTo', 'supplier', 'notes'] as const;
export const defaultMaterialFields = ['glAccount', 'costCentre', 'project', 'supplier'];
export function supplierIdentity(value: Data) {
    return { id:value.id, name:value.name, address:value.address||'', remitTo:value.remitTo||'', postalState:value.postalState||'', contacts:structuredClone(value.contacts), contractRef:value.contractRef };
}
function purchasableIdentity(s: State, id: string) {
    const value=supplier(s,id);
    requireThat(['active','preferred'].includes(value.status),'Choose an active purchasable supplier',409);
    requireThat(!lapsedSupplierDocuments(s,id).length,'Required supplier document has lapsed; refresh and review it before correcting the supplier',409);
    return supplierIdentity(value);
}
/** Only values of existing fields change. Line identity, supply and money stay exact. */
export function correctApprovalFields(s: State, a: Actor, request: Data, changes: Data, rule: Data) {
    requireThat(changes && typeof changes==='object' && !Array.isArray(changes) && Object.keys(changes).length,'Provide header or coding changes');
    const next=structuredClone(request), differences:Data[]=[], business=get(s,'business','main');
    const correct=(target:Data, before:Data, fields:Data, line?:Data)=>{
        requireThat(fields && typeof fields==='object' && !Array.isArray(fields),'Provide coding changes');
        for(const [field,value] of Object.entries(fields)) {
            requireThat(correctionFields.includes(field as any) && rule.allowed.includes(field),'Field is not allowed for approver editing',403);
            const normalized=field==='needDate'?date(value):text(value,field);
            if(field==='costCentre')requireThat(business.costCentres.includes(normalized),'Use a configured department');
            if(field==='location')requireThat(business.locations.includes(normalized),'Use a configured location');
            if(field==='project')requireThat(business.projects.includes(normalized),'Use a configured project');
            const original=field==='supplier'&&line?(before.supplier??request.supplier):before[field];
            const current=field==='supplier'&&line?(target.supplier??next.supplier):target[field];
            if(JSON.stringify(current)===JSON.stringify(normalized))continue;
            target[field]=normalized;
            if(field==='supplier')target.supplierSnapshot=purchasableIdentity(s,normalized);
            if(JSON.stringify(original)===JSON.stringify(normalized))continue;
            differences.push({field:line?'lines.'+line.id+'.'+field:field, ...(line?{line:line.id,lineDescription:line.description,codingField:field}:{}),before:original??null,after:normalized});
        }
    };
    const {lines,...header}=changes; correct(next,request,header);
    if(Object.hasOwn(header,'supplier'))next.lines=next.lines.map((line:Data)=>line.supplier===request.supplier?{...line,supplier:next.supplier,supplierSnapshot:structuredClone(next.supplierSnapshot)}:line);
    if(Object.hasOwn(header,'notes'))next.poDetails={...next.poDetails,notes:next.notes};
    if(Object.hasOwn(header,'shipTo'))next.lines=next.lines.map((line:Data)=>line.shipTo?line:{...line,shipTo:next.shipTo});
    if(Object.hasOwn(header,'project'))next.lines=next.lines.map((line:Data)=>({...line,project:next.project}));
    if(lines!==undefined) {
        requireThat(Array.isArray(lines) && lines.length>0 && lines.length<=request.lines.length && new Set(lines.map((line:Data)=>line?.id)).size===lines.length,'Choose unique existing request lines');
        for(const patch of lines) {
            requireThat(patch && typeof patch==='object' && !Array.isArray(patch),'Provide line coding changes');
            const before=request.lines.find((line:Data)=>line.id===patch.id), target=next.lines.find((line:Data)=>line.id===patch.id);
            requireThat(before && target,'Line is outside this request',403);
            const {id,...fields}=patch; requireThat(Object.keys(fields).length,'Provide line coding changes'); correct(target,before,fields,before);
        }
    }
    requireThat(differences.length,'No fields changed');
    const supplierChanged=differences.some(difference=>(difference.codingField??difference.field)==='supplier');
    if(supplierChanged && next.lines.some((line:Data)=>line.supplier && line.supplier!==next.supplier)) {
        requireGroupable(s,request);
        const destinations=[...new Set<string>(next.lines.map((line:Data)=>line.supplier??next.supplier))];
        // A sole line destination also supplies the document header.
        if(destinations.length===1 && destinations[0]!==next.supplier) {
            next.supplier=destinations[0];next.supplierSnapshot=purchasableIdentity(s,next.supplier);
            const prior=differences.find(difference=>difference.field==='supplier');
            if(prior)prior.after=next.supplier;
            else differences.push({field:'supplier',before:request.supplier,after:next.supplier});
        }
    }
    if(hasSupplierGroups(next)) {
        requireGroupable(s,request);
        next.lines=next.lines.map((line:Data)=>{
            const id=line.supplier??next.supplier,identity=purchasableIdentity(s,id);
            return {...line,supplier:id,supplierSnapshot:structuredClone(line.supplierSnapshot??(id===next.supplier?next.supplierSnapshot:identity))};
        });
    }
    for(const line of next.lines) {
        if(line.catalogue)requireThat(get(s,'catalogue',line.catalogue).supplier===(line.supplier??next.supplier),'Catalogue supplier must match; return the request to change its catalogue item',409);
    }
    requirePermission(s,a,'request.approve',next);
    return {next,differences};
}
