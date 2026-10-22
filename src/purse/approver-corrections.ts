import { supplier } from './admin';
import { date, get, requireThat, requirePermission, text, type Actor, type Data, type State } from './types';

export const correctionFields = ['glAccount', 'costCentre', 'location', 'class', 'project', 'needDate', 'shipTo', 'supplier', 'notes'] as const;
export const defaultMaterialFields = ['glAccount', 'costCentre', 'project', 'supplier'];
export function supplierIdentity(value: Data) {
    return { id:value.id, name:value.name, address:value.address||'', remitTo:value.remitTo||'', postalState:value.postalState||'', contacts:structuredClone(value.contacts), contractRef:value.contractRef };
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
            if(JSON.stringify(before[field])===JSON.stringify(normalized))continue;
            target[field]=normalized;
            if(field==='supplier')target.supplierSnapshot=supplierIdentity(supplier(s,normalized));
            differences.push({field:line?'lines.'+line.id+'.'+field:field, ...(line?{line:line.id,lineDescription:line.description,codingField:field}:{}),before:before[field]??null,after:normalized});
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
    for(const line of next.lines) {
        requireThat(!line.supplier||line.supplier===next.supplier,'A line supplier must match the request supplier; return this request and create separate requests for different suppliers',409);
        if(line.catalogue)requireThat(get(s,'catalogue',line.catalogue).supplier===(line.supplier??next.supplier),'Catalogue supplier must match; return the request to change its catalogue item',409);
    }
    requirePermission(s,a,'request.approve',next);
    return {next,differences};
}
