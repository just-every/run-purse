import { all, allowed, type Actor, type Data, type State } from './types';
/** Purchase visibility does not grant a policy snapshot used by hidden records. */
export function projectApprovalEdit(s:State,a:Actor,value:Data,permission='request.read'):Data {
 const edit=value.approverEdit??(value.action==='approver-edit'?value:undefined);if(!edit)return value;
 const prior=s.get('revision:'+(value.request??value.id??value.record)+':'+edit.fromRevision)?.value;
 if(prior&&!allowed(s,a,permission,prior)){const hidden={actor:edit.actor,at:edit.at,fromRevision:edit.fromRevision,differences:[],carried:[],renewed:[],snapshotBasis:'Previous revision outside your current scope; change details withheld'};return value.approverEdit?{...value,approverEdit:hidden}:{...value,...hidden,policy:null,sourcePolicy:null};}
 const visible=(policy:Data)=>policy&&['request','revision','decision','commitment'].flatMap(kind=>all(s,kind)).filter(record=>record.policy===policy.id).every(record=>allowed(s,a,permission,record));
 const projected={...edit,policy:visible(edit.policy)?edit.policy:null,sourcePolicy:visible(edit.sourcePolicy)?edit.sourcePolicy:null};
 if(!projected.policy||!projected.sourcePolicy)projected.snapshotBasis='Whole-policy snapshot outside your purchase scope';
 return value.approverEdit?{...value,approverEdit:projected}:projected;
}
