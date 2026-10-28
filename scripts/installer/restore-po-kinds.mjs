const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const money=v=>Number.isSafeInteger(v)&&v>=0&&v<=1e12;
const nonempty=v=>typeof v==='string'&&v.trim().length>0;
const at=v=>nonempty(v)&&Number.isFinite(Date.parse(v));
export function validatePoKinds(all,get,check,same) {
 for(const kind of ['request','revision','order'])for(const r of all(kind))for(const line of r.lines)if(line.service){
  check(['amount','percentage','milestone'].includes(line.service.mode)&&line.totalMinor>0,'service_terms');
  check(money(line.carriedAcceptedMinor??0)&&money(line.carriedCancelledMinor??0)&&(line.carriedAcceptedMinor??0)+(line.carriedCancelledMinor??0)<=line.totalMinor,'service_carry');
  if(line.service.mode==='milestone'){
   const milestones=line.service.milestones;
   check(Array.isArray(milestones)&&milestones.length>0&&milestones.length<=100&&new Set(milestones.map(m=>m.id)).size===milestones.length,'service_milestones');
   check(milestones.every(m=>nonempty(m.id)&&nonempty(m.name)&&money(m.valueMinor)&&m.valueMinor>0)&&milestones.reduce((n,m)=>n+m.valueMinor,0)===line.totalMinor,'service_milestone_value');
  }
 }
 for(const order of all('order'))for(const line of order.lines.filter(l=>l.service)){
  let accepted=line.carriedAcceptedMinor??0;
  const milestones=new Set(line.carriedMilestones??[]);
  const receipts=all('receipt').filter(r=>r.order===order.id&&r.line===line.id).sort((a,b)=>a.serviceSequence-b.serviceSequence);
  for(const [index,r]of receipts.entries()){
   check(r.serviceSequence===index+1&&r.mode===line.service.mode&&money(r.valueMinor)&&r.valueMinor>0&&['receive','return','reject'].includes(r.event),'service_receipt');
   const q=Math.max(1,Number((BigInt(r.valueMinor)*BigInt(line.q)+BigInt(line.totalMinor)/2n)/BigInt(line.totalMinor)));
   check(q===r.q,'service_receipt_quantity');
   if(r.event==='reject')check(r.valueMinor<=line.totalMinor-accepted-(line.carriedCancelledMinor??0),'service_rejection');
   else if(r.event==='return')check(r.valueMinor<=accepted&&r.mode!=='milestone','service_return');
   else if(r.mode==='percentage'){
    check(typeof r.percentage==='string'&&/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(r.percentage),'service_percentage');
    check(Number((BigInt(line.totalMinor)*BigInt(Math.round(Number(r.percentage)*100))+5000n)/10000n)===accepted+r.valueMinor,'service_percentage_value');
   }else if(r.mode==='milestone'){
    const m=line.service.milestones.find(m=>m.id===r.milestone);
    check(m&&!milestones.has(m.id)&&m.valueMinor===r.valueMinor,'service_milestone_receipt');milestones.add(m.id);
   }
   accepted+=r.event==='return'?-r.valueMinor:r.event==='receive'?r.valueMinor:0;check(accepted>=0&&accepted<=line.totalMinor-(line.carriedCancelledMinor??0),'service_receipt_value');
  }
  const revision=get('revision',order.request+':'+order.revision);
  if(revision.amends){
   const prior=get('order',revision.amends),old=prior.lines.find(l=>l.id===line.id);
   check(old?.service,'service_amendment_basis');
   const oldAccepted=(old.carriedAcceptedMinor??0)+all('receipt').filter(r=>r.order===prior.id&&r.line===old.id).reduce((n,r)=>n+(r.event==='receive'?r.valueMinor:r.event==='return'?-r.valueMinor:0),0);
   check(line.carriedAcceptedMinor===oldAccepted,'service_amendment_carry');
  }
 }
 for(const release of all('blanketRelease')){
  const order=get('order',release.order);
  check(order.issuedAt&&!order.imported&&order.poDetails?.blanket&&release.request===order.request&&release.revision===order.revision&&release.currency===order.currency,'release_source');
  check(money(release.amountMinor)&&release.amountMinor>0&&nonempty(release.reference)&&validDate(release.needDate)&&release.needDate>=order.poDetails.blanket.validFrom&&release.needDate<=order.poDetails.blanket.validThrough&&nonempty(release.reason)&&nonempty(release.actor)&&at(release.at)&&typeof release.closed==='boolean','release_value');
  check(all('audit').some(a=>a.action==='blanket-release'&&a.release===release.id&&a.record===order.id&&a.amountMinor===release.amountMinor&&a.actor===release.actor),'release_audit');
  if(release.closed)check(nonempty(release.closeReason)&&at(release.closedAt)&&all('audit').some(a=>a.action==='close-blanket-release'&&a.release===release.id&&a.reason===release.closeReason),'release_closure');
 }
 for(const i of all('invoice'))if(i.release){const release=get('blanketRelease',i.release);check(get('order',i.order).request===release.request&&i.currency===release.currency,'invoice_release');}
 for(const series of all('recurringSeries')){
  const order=get('order',series.order),request=get('request',series.request);get('agreement',series.agreement);
  check(order.issuedAt&&!order.imported&&order.request===series.request&&order.revision===series.sourceRevision&&request.revision>=series.sourceRevision&&!order.poDetails?.blanket,'recurring_source');
  check(nonempty(series.owner)&&nonempty(series.ownerEmail)&&Number.isSafeInteger(series.ownerVersion)&&series.ownerVersion>0&&validDate(series.firstDate)&&validDate(series.nextDate)&&validDate(series.endDate)&&series.firstDate<=series.endDate,'recurring_schedule');
  check(Number.isSafeInteger(series.maxOrders)&&series.maxOrders>0&&series.maxOrders<=120&&Number.isSafeInteger(series.generatedCount)&&series.generatedCount>=0&&series.generatedCount<=series.maxOrders&&['pending','active','paused','ended'].includes(series.status),'recurring_status');
  check(all('audit').some(a=>a.action==='recurring-series'&&a.series===series.id&&a.record===series.order&&a.maxOrders===series.maxOrders),'recurring_consent');
  if(series.authorization){const a=series.authorization;check(nonempty(a.actor)&&a.actor!==get('revision',series.request+':'+series.sourceRevision).requester&&nonempty(a.policyVersion)&&at(a.at)&&nonempty(a.reason)&&all('audit').some(e=>e.action==='recurring-authorize'&&e.series===series.id&&e.actor===a.actor&&e.reason===a.reason),'recurring_approval');}
  const generated=all('recurringEvent').filter(e=>e.series===series.id&&e.status==='generated');check(generated.length===series.generatedCount,'recurring_count');
  check(new Set(generated.map(e=>e.scheduledFor)).size===generated.length,'recurring_once');
 }
 for(const event of all('recurringEvent')){
  const series=get('recurringSeries',event.series);get('agreement',event.agreement);
  check(validDate(event.scheduledFor)&&at(event.at)&&['generated','paused'].includes(event.status)&&event.sourceOrder===series.order,'recurring_event');
  if(event.status==='generated'){
   const order=get('order',event.order),request=get('request',event.request),source=get('order',series.order),authorization=series.authorization;
   check(authorization&&order.request===request.id&&order.recurring?.series===series.id&&order.recurring.scheduledFor===event.scheduledFor&&order.recurring.sourceOrder===source.id&&order.totalMinor===source.totalMinor&&order.currency===source.currency&&same(order.documentProfile,source.documentProfile),'recurring_order');
   check(all('decision').some(d=>d.request===request.id&&d.revision===1&&d.actor===authorization.actor&&d.operatorVersion===authorization.operatorVersion&&d.recurring?.series===series.id&&d.recurring.authorizationVersion===authorization.seriesVersion),'recurring_decision');
   check(all('audit').some(a=>a.action==='recurring-generated'&&a.record===order.id&&a.series===series.id&&a.scheduledFor===event.scheduledFor),'recurring_generation_audit');
  }else check(nonempty(event.reason),'recurring_pause');
 }
}
