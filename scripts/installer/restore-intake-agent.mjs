import { createHash } from 'node:crypto';
import { erasedSourceFact } from '../../src/purse/erasure-journal.mjs';
import { containsProtectedInput } from '../../src/purse/protected-context-fields.mjs';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const kinds = new Set(['intakeForm','business','catalogue','supplier','revision','request','decision','agentPolicy','policy']);

/** Source records and reviewed drafts are history. Native execution consent is never imported. */
export function validateIntakeAgent(all, get, check) {
 for (const run of all('agentRun').filter(row => row.agent === 'AGENT-001')) {
  check(run.workflow === 'requirements-intake' && run.mode === 'deterministic v1' && run.model === 'none' && run.provider === 'none'
   && run.version === 1 && typeof run.actor === 'string' && Number.isSafeInteger(run.operatorVersion) && Number.isFinite(Date.parse(run.at))
   && !containsProtectedInput(run), 'intake_agent_execution');
  check(run.sourceValuesErased ? erasedSourceFact(all,'agentRun',run.id,run)
   : run.inputDigest === digest({actor:run.actor,operatorVersion:run.operatorVersion,inputs:run.inputs,sources:run.sources,references:run.references}) && run.outputDigest === digest(run.output), 'intake_agent_digest');
  check(run.inputs.intakeForm === get('intakeForm',run.inputs.intakeForm).id && typeof run.inputs.need === 'string'
   && typeof run.inputs.quantity === 'string' && typeof run.inputs.needDate === 'string' && typeof run.inputs.terms === 'string', 'intake_agent_inputs');
  if(run.inputs.previous)check(get('agentRun',run.inputs.previous).agent==='AGENT-001' && get('agentRun',run.inputs.previous).actor===run.actor,'intake_agent_followup');
  check(Array.isArray(run.sources) && Array.isArray(run.references) && run.references.length > 0 && new Set(run.references.map(ref=>ref.kind+':'+ref.id)).size===run.references.length, 'intake_agent_references');
  for(const reference of run.references)check(kinds.has(reference.kind) && typeof reference.version==='string' && get(reference.kind,reference.id),'intake_agent_reference');
  for(const source of run.sources)check(source.value && run.references.some(ref=>ref.kind===source.kind&&ref.id===source.id&&ref.version===source.version),'intake_agent_source');
  for(const control of run.inputs.governance) {
   const policy=get('agentPolicy',control.id),entry=policy.history[control.version-1];
   check(entry?.enabled && entry.agent==='AGENT-001' && entry.purchaseType===control.purchaseType,'intake_agent_controls');
  }
  check(same(run.messages,[]) && same(run.outcomes,[{status:'suggestions-only',submitted:false,reserved:false,approval:false,outbound:false}]),'intake_agent_nonbinding');
  check(Array.isArray(run.output.candidates) && Array.isArray(run.output.missing) && Array.isArray(run.output.route.steps),'intake_agent_output');
  for(const candidate of run.output.candidates) {
   check(get('catalogue',candidate.id) && Number.isSafeInteger(candidate.unitMinor) && candidate.sources.some(ref=>ref.kind==='catalogue'&&ref.id===candidate.id),'intake_agent_candidate');
   for(const reference of [...candidate.sources,...candidate.codingSources])check(run.references.some(ref=>same(ref,reference)),'intake_agent_citation');
   check(Object.keys(candidate.coding).every(key=>['costCentre','project','glAccount'].includes(key)),'intake_agent_safe_coding');
   if(Object.keys(candidate.coding).length)check(candidate.codingSources.some(ref=>ref.kind==='revision'&&run.sources.some(source=>source.kind==='revision'&&source.id===ref.id&&same(source.value.coding,candidate.coding))),'intake_agent_coding_source');
  }
  if(run.output.fields) {
   check(run.output.fields.intakeForm===run.inputs.intakeForm && run.output.fields.lines.length===1 && run.output.fields.lines[0].catalogue===run.output.item
    && run.output.candidates.some(candidate=>candidate.id===run.output.item&&(candidate.unitMinor/100).toFixed(2)===run.output.fields.lines[0].unitAmount)
    && !['status','decision','revision','requester','policy'].some(key=>Object.hasOwn(run.output.fields,key)),'intake_agent_draft_fields');
  }
 }
 for(const review of all('intakeAgentReview')) {
  const run=get('agentRun',review.run),draft=get('intakeDraft',review.draft);
  check(review.id===run.id && run.agent==='AGENT-001' && review.actor===run.actor && draft.requester===review.actor && review.consent===true
   && run.output.missing.length===0 && Number.isFinite(Date.parse(review.at)) && all('audit').some(event=>event.action==='intake-agent-draft'&&event.run===run.id&&event.record===draft.id&&event.consent===true),'intake_agent_review');
 }
}
