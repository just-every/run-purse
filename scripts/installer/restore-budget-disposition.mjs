/** Financial movement is portable chronology, never restored owner authority. */
export function validateBudgetDispositions(all,get,check,same) {
 for(const kind of ['request','revision','order'])for(const record of all(kind))if(record.budgetDisposition) {
  const d=record.budgetDisposition,source=get('order',d.order),request=get('request',d.request);
  check(source.request===request.id && (record.request??record.id)===request.id && d.currency===source.currency && d.amountMinor===source.totalMinor && Number.isSafeInteger(d.sourceRevision) && d.sourceRevision<record.revision,'budget_disposition_source');
  check(typeof d.id==='string' && typeof d.actor==='string' && Number.isSafeInteger(d.operatorVersion) && d.operatorVersion>0 && Number.isFinite(Date.parse(d.at)) && typeof d.reason==='string' && d.reason.trim() && /^[a-f0-9]{64}$/.test(d.sourceFingerprint) && /^[a-f0-9]{64}$/.test(d.review),'budget_disposition_review');
  for(const side of ['source','destination']) {
   check(Array.isArray(d[side]) && d[side].length>0 && new Set(d[side].map(row=>row.policy)).size===d[side].length && d[side].reduce((sum,row)=>sum+row.amountMinor,0)===d.amountMinor,'budget_disposition_shares');
   for(const share of d[side])check(get('policy',share.policy).currency===d.currency && typeof share.policyVersion==='string' && Number.isSafeInteger(share.amountMinor) && share.amountMinor>0,'budget_disposition_share');
  }
  check(d.source.every(row=>!d.destination.some(target=>row.policy===target.policy)) && Array.isArray(d.owners) && d.owners.length===d.destination.length && d.owners.every((owner,index)=>owner.policy===d.destination[index].policy && typeof owner.email==='string'),'budget_disposition_owners');
  check(all('audit').some(event=>event.action==='budget-disposition-review' && event.record===request.id && event.disposition?.id===d.id && same(event.disposition,d)),'budget_disposition_audit');
  const movement=all('commitment').filter(event=>event.disposition===d.id);
  if(movement.length) {
   check(movement.length===2 && ['budget-period-release','budget-period-commit'].every(type=>movement.some(event=>event.kind===type)) && movement.reduce((sum,event)=>sum+event.amountMinor,0)===0,'budget_disposition_once');
   for(const event of movement){const sign=event.kind==='budget-period-release'?-1:1;check(event.amountMinor===sign*d.amountMinor && same(event.budgetAllocations,d[sign<0?'source':'destination'].map(share=>({policy:share.policy,amountMinor:sign*share.amountMinor}))),'budget_disposition_movement');}
  }
 }
}
