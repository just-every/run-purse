import {createHash} from 'node:crypto';
import {containsProtectedInput} from '../../src/purse/protected-context-fields.mjs';
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function validateRecurringDiscovery(all,get,check) {
 for(const run of all('agentRun').filter(run=>run.workflow==='recurring-discovery')) {
  check(!containsProtectedInput(run)&&day(run.from)&&day(run.to)&&run.from<=run.to&&run.mode==='deterministic v1'&&run.model==='none'&&run.provider==='none'&&run.version===1&&Array.isArray(run.actions)&&!run.actions.length&&Array.isArray(run.missing)&&!run.missing.length,'discovery_run');
  check(run.inputs?.from===run.from&&run.inputs?.to===run.to&&Number.isSafeInteger(run.inputs.limit)&&run.inputs.limit>=1&&run.inputs.limit<=200&&Array.isArray(run.references),'discovery_inputs');
  if(run.protectedContextCleanup?.authorityInvalidated===true){check(run.protectedContextCleanup.status==='quarantined','discovery_quarantine');continue;}
  check(Array.isArray(run.proposals)&&run.proposals.length<=run.inputs.limit,'discovery_proposals');
  const references=new Map();
  for(const proposal of run.proposals) {
   const {id,...candidate}=proposal;
   check(['consolidate','renegotiate','cancellation-review'].includes(proposal.kind)&&proposal.conditional===true&&proposal.reviewRequired===true&&Array.isArray(proposal.agreementIds)&&proposal.agreementIds.length&&proposal.agreementIds.every(id=>get('agreement',id))&&Array.isArray(proposal.sources)&&proposal.sources.length<=2000&&proposal.baseline?.futureForecast==='unknown','discovery_proposal');
   check(id===createHash('sha256').update(canonical({from:run.from,to:run.to,...candidate})).digest('hex'),'discovery_digest');
   for(const source of proposal.sources) {
    check(['agreement','supplier','recurringSeries','agreementAward','order','request','valueSeatImport','supplierIssue'].includes(source.kind)&&typeof source.revision==='string'&&source.revision.length&&source.value&&get(source.kind,source.id),'discovery_source');
    references.set(source.kind+':'+source.id,{kind:source.kind,id:source.id,version:source.revision});
   }
  }
  const expected=[...references.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
  check(canonical(run.references)===canonical(expected)&&all('audit').some(event=>event.action==='recurring-scenario-discover'&&event.run===run.id&&event.actor===run.actor&&event.from===run.from&&event.to===run.to),'discovery_custody');
 }
}
