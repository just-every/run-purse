import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index';
import { all, audit, can, date, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';
import { requestBudgetShares } from './budget-allocations';
import { periodBudgetPosition } from './budget-position';
import { requests, policies } from './requests';

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
function eligible(s: State, order: Data) {
 const lineage = all(s,'order').filter(row=>row.request===order.request), ids=new Set(lineage.map(row=>row.id));
 requireThat(order.issuedAt && ['issued','amendment-pending'].includes(order.status) && !order.supplierGroup && !order.imported && !order.adoption && !order.poDetails?.blanket
  && lineage.every(row=>!row.adoption && !row.imported && row.lines.every((line:Data)=>!line.service && !(line.carriedAccepted||line.carriedCancelled)))
  && !all(s,'receipt').some(row=>ids.has(row.order)) && !all(s,'orderClosure').some(row=>ids.has(row.order))
  && !all(s,'invoice').some(row=>ids.has(row.order)) && !all(s,'deposit').some(row=>ids.has(row.order))
  && ![...s.values()].some(row=>/card/i.test(row.kind) && (ids.has(row.value.order)||row.value.request===order.request)),
  'Only wholly unreceived, unbilled native goods orders without deposits or card history can move budget periods',409);
 return lineage;
}
function sourceFacts(s: State, order: Data) {
 eligible(s,order);
 return sha256(canonicalJson({order:order.id,revision:order.revision,request:order.request,lines:order.lines,currency:order.currency,totalMinor:order.totalMinor,
  commitments:all(s,'commitment').filter(row=>row.request===order.request).sort((a,b)=>a.id.localeCompare(b.id))}));
}
function owners(s: State, shares: Data[]) {
 return shares.map(share=>{
  const policy=get(s,'policy',share.policy), assignment=s.get('budgetAssignment:'+policy.id)?.value;
  const email=assignment?.ownerEmail ?? policy.budgetOwner;
  requireThat(email && get(s,'member',email).active, 'Every destination budget needs a current named member owner',409);
  return {policy:policy.id,email};
 });
}
function bindings(s: State, shares: Data[]) {
 return shares.map(share=>({ ...share,policyVersion:s.get('policy:'+share.policy)!.revision,
  assignmentVersion:s.get('budgetAssignment:'+share.policy)?.revision ?? null }));
}
function balances(s: State, request: string) {
 const result=new Map<string,number>();
 for(const event of all(s,'commitment').filter(row=>row.request===request)) {
  for(const share of event.budgetAllocations ?? [{policy:event.policy,amountMinor:event.amountMinor}]) result.set(share.policy,(result.get(share.policy)??0)+share.amountMinor);
 }
 return [...result].filter(([,amount])=>amount!==0).map(([policy,amountMinor])=>({policy,amountMinor})).sort((a,b)=>a.policy.localeCompare(b.policy));
}
function plan(s: State, a: Actor, input: Data) {
 can(s,a,'owner');
 const order=get(s,'order',input.id), source=get(s,'request',order.request);
 requireThat(input.revision===source.revision, 'Purchase changed; review the current revision',409);
 const sourceFingerprint=sourceFacts(s,order), needDate=date(input.needDate,'Destination need date');
 const destination:Data={...order,id:source.id,needDate,policy:null};
 const policy=policies(s,destination)[0];requireThat(policy?.budgetPeriod,'Choose a dated destination budget',409);destination.policy=policy.id;
 const sourceShares=balances(s,source.id), destinationShares=requestBudgetShares(s,destination,order.totalMinor).sort((a,b)=>a.policy.localeCompare(b.policy));
 requireThat(sourceShares.reduce((sum,row)=>sum+row.amountMinor,0)===order.totalMinor && sourceShares.every(row=>row.amountMinor>0),'Original commitment must equal the whole unreceived order',409);
 requireThat(sourceShares.every(row=>get(s,'policy',row.policy).budgetPeriod) && sourceShares.every(row=>!destinationShares.some(to=>to.policy===row.policy)), 'Choose a different period for every allocation',409);
 const ownerSteps=owners(s,destinationShares);
 for(const share of destinationShares)requireThat(periodBudgetPosition(s,get(s,'policy',share.policy)).availableMinor>=share.amountMinor,'Destination allocation budget is exhausted; no capacity is transferred',409);
 const result={order:order.id,request:source.id,sourceRevision:source.revision,needDate,currency:order.currency,amountMinor:order.totalMinor,
  sourceFingerprint,source:bindings(s,sourceShares),destination:bindings(s,destinationShares),owners:ownerSteps,policy:policy.id};
 return {...result,review:sha256(canonicalJson({result,actor:a.id,version:a.version,session:a.session}))};
}
export function budgetDisposition(s: State, a: Actor, op: string, input: Data): Data | undefined {
 if(!['budget-disposition-preview','budget-disposition-amend'].includes(op))return;
 const reviewed=plan(s,a,input);
 if(op==='budget-disposition-preview')return reviewed;
 requireThat(input.consent===true && input.review===reviewed.review, 'Review the exact current source and destination allocations again',409);
 const order=get(s,'order',reviewed.order), old=get(s,'request',order.request);
 const next=requests(s,a,'amend',{...old,...order,id:old.id,revision:old.revision,needDate:reviewed.needDate,lines:order.lines,reason:text(input.reason,'Budget disposition reason')})!;
 const disposition={...reviewed,id:uid(),actor:a.id,operatorVersion:a.version,at:new Date().toISOString(),reason:text(input.reason,'Budget disposition reason')};
 put(s,'request',next.id,{...next,budgetDisposition:disposition});
 put(s,'revision',next.id+':'+next.revision,{...next,request:next.id,budgetDisposition:disposition});
 // Installation authority is saved separately and is deliberately absent from archives.
 put(s,'nativeBudgetAuthority',disposition.id,{actor:a.id,operatorVersion:a.version});
 audit(s,a,'budget-disposition-review',next.id,{revision:next.revision,disposition});
 return get(s,'request',next.id);
}
export function checkBudgetDisposition(s: State, request: Data) {
 if(!request.amends)return;
 const disposition=request.budgetDisposition;
 const settled:Data[]=disposition ? all(s,'commitment').filter(event=>event.disposition===disposition.id) : [];
 if(settled?.length===2 && settled.some(event=>event.kind==='budget-period-commit') && settled.some(event=>event.kind==='budget-period-release'))return;
 const prior=get(s,'order',request.amends), proposed={...request,policy:request.policy??policies(s,request)[0]?.id};
 if(!request.budgetDisposition && !s.get('policy:'+prior.policy)?.value.budgetPeriod && !s.get('policy:'+proposed.policy)?.value.budgetPeriod)return;
 const current=requestBudgetShares(s,proposed,request.totalMinor).sort((a,b)=>a.policy.localeCompare(b.policy));
 const original=requestBudgetShares(s,prior,prior.totalMinor,new Set(all(s,'commitment').filter(row=>row.request===request.id&&row.revision===prior.revision&&row.amountMinor>0).flatMap(row=>(row.budgetAllocations??[{policy:row.policy}]).map((share:Data)=>share.policy)))).sort((a,b)=>a.policy.localeCompare(b.policy));
 if(same(current.map(row=>row.policy),original.map(row=>row.policy)) && !request.budgetDisposition)return;
 requireThat(disposition && disposition.order===prior.id, 'Cross-period budget amendments require an explicit remaining-balance disposition',409);
 const authority=s.get('nativeBudgetAuthority:'+disposition.id)?.value;
 requireThat(authority?.actor===disposition.actor && authority?.operatorVersion===disposition.operatorVersion,'Budget disposition consent ended or was not restored; obtain a fresh owner review',409);
 requireThat(disposition.sourceFingerprint===sourceFacts(s,prior) && request.needDate===disposition.needDate && request.currency===prior.currency && request.totalMinor===prior.totalMinor
  && same(request.lines.map((line:Data)=>{const {carriedAccepted,carriedCancelled,sourceLine,...rest}=line;return rest;}),prior.lines.map((line:Data)=>{const {carriedAccepted,carriedCancelled,sourceLine,...rest}=line;return rest;}))
  && request.freightMinor===prior.freightMinor && request.taxMinor===prior.taxMinor && same(request.charges??null,prior.charges??null) && same(request.customFields??null,prior.customFields??null)
  && ['glAccount','class','entity','intakeForm','intakeFormVersion','answers','poDetails'].every(field=>same(request[field]??null,prior[field]??null))
  && request.supplier===prior.supplier && request.terms===prior.terms && request.location===prior.location && request.costCentre===prior.costCentre,
  'Reviewed source balances or purchasing terms changed; create a fresh budget disposition',409);
 requireThat(same(bindings(s,balances(s,request.id)),disposition.source) && same(bindings(s,current),disposition.destination) && same(owners(s,current),disposition.owners), 'Source or destination budget policy changed; review and renew approval',409);
 for(const share of current)requireThat(periodBudgetPosition(s,get(s,'policy',share.policy)).availableMinor>=share.amountMinor,'Destination allocation budget is exhausted; no capacity is transferred',409);
}
export function dispositionOwnerSteps(s: State, request: Data) {
 checkBudgetDisposition(s,request);
 return [...request.budgetDisposition.owners].sort((a:Data,b:Data)=>a.email.localeCompare(b.email)||a.policy.localeCompare(b.policy)).map((owner:Data)=>({id:owner.policy===request.policy?'budget-owner':'budget-owner:'+owner.policy,email:owner.email,dependsOn:['costCentre','project','location','glAccount'],budgetPolicy:owner.policy,reason:'Reviewed destination commitment'}));
}
export function settleBudgetDisposition(s: State, a: Actor, request: Data) {
 const disposition=request.budgetDisposition;
 if(!disposition)return false;
 requireThat(!all(s,'commitment').some(event=>event.disposition===disposition.id),'Budget disposition already issued',409);
 checkBudgetDisposition(s,request);
 const at=new Date().toISOString();
 for(const [kind,shares,sign] of [['budget-period-release',disposition.source,-1],['budget-period-commit',disposition.destination,1]] as const) {
  const id=uid();put(s,'commitment',id,{request:request.id,revision:request.revision,policy:kind==='budget-period-release'?get(s,'order',disposition.order).policy:request.policy,
   currency:request.currency,amountMinor:sign*disposition.amountMinor,budgetAllocations:shares.map((share:Data)=>({policy:share.policy,amountMinor:sign*share.amountMinor})),kind,actor:a.id,at,disposition:disposition.id});
 }
 audit(s,a,'budget-disposition-issued',request.id,{revision:request.revision,disposition:disposition.id,source:disposition.source,destination:disposition.destination,amountMinor:disposition.amountMinor});
 return true;
}
