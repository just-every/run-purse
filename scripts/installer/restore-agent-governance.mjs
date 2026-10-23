const positive = value => Number.isSafeInteger(value) && value > 0;
const text = value => typeof value === 'string' && value.trim().length > 0;
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

/** Restored settings preserve history, never native identity authority. */
export function validateAgentGovernance(all,get,check) {
 for(const policy of all('agentPolicy')) {
  check(['AGENT-003','AGENT-006'].includes(policy.agent) && text(policy.purchaseType)
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
