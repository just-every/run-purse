import { accessGrants, allowed } from './access';
import { all, type Actor, type Data, type State } from './types';

export function unrestrictedAccess(s:State,a:Actor,permission:string) {
 return accessGrants(s,a).some(g=>g.permissions.includes(permission)&&!Object.keys(g.scope).length&&!Object.keys(g.roleScope??{}).length);
}
/** Resolve a historical subject before attaching its revision or policy evidence. */
export function auditEventAllowed(s:State,a:Actor,event:Data,permission='audit.read') {
 if(unrestrictedAccess(s,a,permission))return true;
 if(!allowed(s,a,permission))return false;
 if(['scim-user-create','scim-user-update','scim-user-deactivate'].includes(event.action)){
  const grants=[...(event.grantsBefore??[]),...(event.grantsAfter??[])];
  return grants.length>0&&grants.every((grant:Data)=>allowed(s,a,permission,{scope:grant.scope??{},entity:'main'}));
 }
 if(['member','access-role','buyer-role-limit'].includes(event.action)){
  const snapshots=[event.before,event.after].filter(Boolean);
  if(!snapshots.length)return false;
  return snapshots.every(snapshot=>{
   const grants=snapshot.grants??(snapshot.scope?[{scope:snapshot.scope}]:[]);
   return grants.length>0&&grants.every((g:Data)=>allowed(s,a,permission,{scope:g.scope??{},entity:'main'}));
  });
 }
 const kinds=['comment','travelExpense','request','order','invoice','receipt','rfq','invoiceReading','invoiceSource','apInvoiceEmail','emailIntake','quote','quoteAward','stockroom','supplierIssue','supplierOrderEvidence','orderClosure','orderChaseEvent','orderThreadMessage','orderSupplierResponse','agentRun','valueConfirmation'];
 const subject=event.parentKind ? s.get(event.parentKind+':'+event.record)?.value
  : kinds.map(kind=>s.get(kind+':'+event.record)?.value).find(Boolean);
 if(!subject||!allowed(s,a,permission,subject))return false;
 // A before/after revision may have crossed a scope boundary. Its evidence
 // is private unless both historical versions are within this grant.
 if(['amend','approver-edit'].includes(event.action)&&event.revision){
  const old=s.get('revision:'+event.record+':'+(event.revision-1))?.value;
  const current=s.get('revision:'+event.record+':'+event.revision)?.value;
  if(old&&!allowed(s,a,permission,old)||current&&!allowed(s,a,permission,current))return false;
 }
 return true;
}
