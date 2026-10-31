const positive = value => Number.isSafeInteger(value) && value > 0;
const text = value => typeof value === 'string' && value.trim().length > 0;
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const same=(a,b)=>canonical(a)===canonical(b);

/** Restored settings preserve history, never native identity authority. */
export function validateAgentGovernance(all,get,check) {
 for(const policy of all('agentPolicy')) {
  check(['AGENT-001','AGENT-004','AGENT-002','AGENT-003','AGENT-006','AGENT-011','AGENT-008'].includes(policy.agent) && text(policy.purchaseType)
   && policy.purchaseType === policy.purchaseType.trim().toLowerCase()
   && policy.id === JSON.stringify([policy.agent,policy.purchaseType]),'agent_policy_identity');
  check(positive(policy.version) && Array.isArray(policy.history) && policy.history.length === policy.version,'agent_policy_history');
  for(const [index,entry] of policy.history.entries()) {
   check(entry.version === index+1 && entry.id === policy.id && entry.agent === policy.agent && entry.purchaseType === policy.purchaseType
    && typeof entry.enabled === 'boolean' && positive(entry.cadenceDays) && entry.cadenceDays <= 30
    && positive(entry.maxChases) && entry.maxChases <= 20 && text(entry.actor) && Number.isSafeInteger(entry.operatorVersion)
    && text(entry.reason) && Number.isFinite(Date.parse(entry.at)),'agent_policy_entry');
  }
  const {history,...current}=policy;
  check(same(current,history.at(-1)),'agent_policy_current');
 }
 for(const run of all('agentRun').filter(row=>row.workflow==='late-order-resolution')) {
  const order=get('order',run.order),reply=get('orderThreadMessage',run.inputs.reply.id),proposal=get('proposedAction',run.proposals[0]);
  check(run.agent==='AGENT-003' && run.mode==='deterministic v1' && run.model==='none' && run.provider==='none' && run.version===1 && run.request===order.request && reply.order===order.id && reply.direction==='inbound' && run.inputs.reply.body===reply.body && run.inputs.reply.originalSha256===reply.original.sha256 && proposal.action==='late-order-record' && proposal.run===run.id && proposal.runVersion===run.version && same(proposal.references,run.references),'late_resolution_source');
  check(Array.isArray(run.alternatives) && Array.isArray(run.outcomes) && run.outcomes.length===1 && run.outcomes[0].bindingChange===false,'late_resolution_record');
  for(const p of run.alternatives){const q=get('quote',p.quote);check(q.request===order.request && q.revision===order.revision && p.supplier===q.supplier && p.currency===q.currency && p.delivery===q.delivery && p.source===q.source && p.totalMinor===q.lines.reduce((n,l)=>n+l.totalMinor,0)+q.freightMinor+q.taxMinor,'late_resolution_alternative');}
  if(run.outcomes[0].status==='recorded'){const notice=get('lateOrderNotice',run.outcomes[0].notice),evidence=get('supplierOrderEvidence',order.id);check(proposal.status==='executed' && notice.run===run.id && notice.order===order.id && evidence.history.some(e=>e.reply===reply.id && e.promisedDate===run.outcomes[0].promisedDate) && same(run.messages,[run.notification]),'late_resolution_outcome');}
  else check(run.outcomes[0].status==='proposed' && proposal.status==='proposed' && same(run.messages,[]),'late_resolution_proposal');
 }
 for(const notice of all('lateOrderNotice'))check(get('agentRun',notice.run).order===notice.order && get('order',notice.order).request===notice.request,'late_notice_lineage');
 for(const run of all('agentRun').filter(row=>row.workflow==='late-order')) {
  const event=get('orderChaseEvent',run.chase),order=get('order',run.order);
  check(run.agent === 'AGENT-003' && event.agent === run.agent && run.id === 'late-follow-up:'+event.id
   && run.order === event.order && run.request === order.request && run.actor === event.actor
   && run.mode === 'deterministic v1' && run.model === 'none' && run.provider === 'none'
   && same(run.inputs,event.inputs) && same(run.sources,event.sources) && same(run.references,event.references)
   && same(run.messages,[event.message]) && same(run.outcomes,[event.outcome]) && same(run.proposals,[]),'agent_chase_record');
  for(const control of run.inputs.governance) {
   const policy=get('agentPolicy',control.id),entry=policy.history[control.version-1];
   check(entry?.enabled && entry.agent === run.agent && control.purchaseType === entry.purchaseType
    && control.cadenceDays === entry.cadenceDays && control.maxChases === entry.maxChases,'agent_chase_controls');
  }
 }
}
