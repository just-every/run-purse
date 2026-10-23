import {createHash} from 'node:crypto';
import {containsProtectedInput} from '../../src/purse/protected-context-fields.mjs';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Restore execution evidence, never consent to execute in the destination installation. */
export function validateQuoteAgents(all, get, check) {
 for (const consent of all('quoteAgentConsent')) {
  const rfq=get('rfq',consent.rfq);get('revision',consent.request+':'+consent.revision);
  check(consent.id===rfq.id&&consent.request===rfq.request&&consent.revision===rfq.revision&&consent.agent==='AGENT-002'
   &&consent.outbound==='buyer-native-invitations-only'&&typeof consent.rfqVersion==='string'
   &&typeof consent.actor==='string'&&Number.isFinite(Date.parse(consent.at))&&!containsProtectedInput(consent),'quote_agent_consent');
  check(consent.suppliers.length===rfq.suppliers.length&&consent.suppliers.every((supplier,i)=>supplier.id===rfq.suppliers[i].id&&supplier.email===rfq.suppliers[i].email)
   &&consent.deadline===rfq.deadline&&consent.lines.length===rfq.lines.length,'quote_agent_consent_sources');
 }
 for (const run of all('agentRun').filter(run=>run.agent==='AGENT-002')) {
  const rfq=get('rfq',run.rfq),consent=get('quoteAgentConsent',run.rfq);
  check(run.request===rfq.request&&run.revision===rfq.revision&&run.version===1&&run.mode==='deterministic v1'&&run.provider==='none'&&run.model==='none'
   &&run.algorithm==='native-source-bound-quote-normalization-v1'&&!containsProtectedInput(run),'quote_agent_execution');
  check(run.inputDigest===digest(run.inputs)&&run.outputDigest===digest({comparison:run.comparison,recommendations:run.recommendations,messages:run.messages,outcomes:run.outcomes}),'quote_agent_digest');
  check(run.inputs.consent.id===consent.id&&run.inputs.consent.rfqVersion===consent.rfqVersion
   &&Array.isArray(run.inputs.latestResponses)&&new Set(run.inputs.latestResponses).size===run.inputs.latestResponses.length,'quote_agent_inputs');
  const at=Date.parse(run.at);check(Number.isFinite(at),'quote_agent_time');
  for(const id of run.inputs.latestResponses){const response=get('rfqResponse',id);check(response.rfq===rfq.id&&Date.parse(response.at)<=at
   &&!all('rfqResponse').some(other=>other.rfq===rfq.id&&other.supplier===response.supplier&&other.sequence>response.sequence&&Date.parse(other.at)<=at),'quote_agent_latest');}
  for (const row of run.comparison) {
   const response=get('rfqResponse',row.response);check(run.inputs.latestResponses.includes(response.id)&&row.supplier===response.supplier
    &&row.currency===response.currency&&row.totalMinor===response.totalMinor&&row.freightMinor===response.freightMinor&&row.taxMinor===response.taxMinor
    &&row.eligible===(row.flags.length===0)&&row.lines.length===response.lines.length,'quote_agent_comparison');
   for(const original of row.originals){const file=response.files.find(file=>file.id===original.source.file);check(file&&file.sha256===original.source.sha256&&file.size===original.source.size
    &&original.source.response===response.id&&original.source.url===`/api/purse/rfq-original/${response.id}/${file.id}`,'quote_agent_original');}
  }
  for(const recommendation of run.recommendations){const first=get('rfqResponse',recommendation.firstResponse);check(first.rfq===rfq.id&&first.currency===recommendation.currency
   &&!all('rfqResponse').some(response=>response.rfq===rfq.id&&response.currency===first.currency&&response.offerSequence<first.offerSequence),'quote_agent_baseline');
   check(recommendation.binding===false&&(!recommendation.response||run.comparison.some(row=>row.response===recommendation.response&&row.eligible&&row.currency===recommendation.currency)),'quote_agent_nonbinding_recommendation');}
  for(const proposal of run.proposals){const action=get('proposedAction',proposal.id);check(action.run===run.id&&action.action==='quote-agent-review'&&action.input.id===run.id&&action.input.proposal===action.id,'quote_agent_proposal');}
  check(run.messages.every(message=>message.direction==='draft-only'&&['specification-answer-draft','buyer-escalation'].includes(message.status)),'quote_agent_draft_only');
 }
 for(const review of all('quoteAgentReview')){const run=get('agentRun',review.run);check(run.agent==='AGENT-002'&&review.rfq===run.rfq&&review.request===run.request&&review.revision===run.revision
  &&review.outcome==='reviewed-without-award'&&typeof review.actor==='string'&&Number.isFinite(Date.parse(review.at)),'quote_agent_review');}
}
