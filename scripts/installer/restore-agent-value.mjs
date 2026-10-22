import { erasedOriginal, erasedSourceFact, originalDigest } from '../../src/purse/erasure-journal.mjs';
import { createHash } from 'node:crypto';
import { validateSendResult } from '../../src/modules/mail/src/core/validation.mjs';

const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
 : value && typeof value === 'object' ? '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const equal = (a,b) => canonical(a) === canonical(b);
const nonempty = v => typeof v === 'string' && v.trim().length > 0;
const timestamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const calendar = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;

function deliverySources(records, request, revision, fail) {
 const current=records('order').filter(o=>o.request===request&&o.revision===revision&&o.issuedAt&&!o.imported),orders=new Map(),receipts=new Map(),seen=new Set();
 const visit=(order,line)=>{
  const id=order.id+':'+line.id;if(seen.has(id))return;seen.add(id);orders.set(order.id,order);
  for(const receipt of records('receipt').filter(r=>r.order===order.id&&r.line===line.id&&!r.imported))receipts.set(receipt.id,receipt);
  if(!(line.carriedAccepted>0))return;
  const source=records('revision').find(r=>r.request===request&&r.revision===order.revision),prior=source?.amends&&records('order').find(o=>o.id===source.amends),priorLine=prior?.lines.find(l=>l.id===line.id);
  fail(prior&&prior.request===request&&prior.revision<order.revision&&prior.issuedAt&&!prior.imported&&priorLine,'delivery_lineage');visit(prior,priorLine);
 };
 for(const order of current){orders.set(order.id,order);for(const line of order.lines)visit(order,line);}
 const sources=[...receipts.values()],first=sources.filter(r=>r.event==='receive'&&r.q>0).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id))[0];
 return {orders:[...orders.values()],receipts:sources,delivery:first?{receipt:first.id,order:first.order,at:first.at,date:first.at.slice(0,10)}:null};
}

function validateAssessment(input, fail) {
 const records=kind=>input.sources.filter(s=>s.kind===kind).map(s=>s.value), assessment=input.assessment;
 const source=(kind,id)=>{const value=records(kind).find(r=>r.id===id);fail(value,'assessment_link');return value;};
 const orders=records('order'),receipts=records('receipt');
 const accepted=(order,line)=>(line.carriedAccepted??0)+receipts.filter(r=>r.order===order.id&&r.line===line.id).reduce((n,r)=>n+(r.event==='receive'?r.q:r.event==='return'?-r.q:0),0);
 const delivery=deliverySources(records,input.request,input.revision,fail).delivery;
 if(input.promise.kind==='seats')fail(equal(assessment.delivery,delivery),'assessment_delivery');
 if(input.promise.kind==='need-date'){
  const received=receipts.filter(r=>r.event==='receive'),positions=orders.filter(o=>o.revision===input.revision).flatMap(o=>o.lines.map(l=>({order:o.id,line:l.id,requiredQ:l.q,acceptedQ:accepted(o,l)})));
  fail(assessment.needDate===input.promise.needDate&&assessment.status===(received.length?'evidence':'no-evidence')&&equal(assessment.receipts,received.map(r=>({id:r.id,at:r.at,onTime:r.at.slice(0,10)<=input.promise.needDate})))&&equal(assessment.positions,positions)&&assessment.complete===(positions.length?positions.every(p=>p.acceptedQ>=p.requiredQ):null),'assessment_need_date');
 }
 if(input.promise.kind!=='quoted-saving')return;
 const extended=(q,cost)=>Number((BigInt(q)*BigInt(cost)+500n)/1000n),approved=new Set(records('decision').filter(d=>d.decision==='approved').map(d=>d.revision));
 const awards=[...records('quoteAward'),...records('agreementAward')].map(a=>{
  const revision=source('revision',a.request+':'+a.revision),first=a.firstQuote?source('quote',a.firstQuote):null,winner=a.awardedQuote?source('quote',a.awardedQuote):null;
  return {...a,lines:a.lines.map(m=>{const line=revision.lines.find(l=>l.id===m.requestLine),baseline=first?.lines.find(l=>l.id===m.firstLine),won=winner?.lines.find(l=>l.id===m.awardedLine);fail(line,'assessment_line');return {...line,firstUnitMinor:baseline?.unitMinor??m.firstUnitMinor,firstMinor:baseline?.totalMinor??extended(line.q,m.firstUnitMinor),awardedMinor:won?.totalMinor??extended(line.q,m.awardedUnitMinor)};})};
 });
 const latest=awards.filter(a=>approved.has(a.revision)).sort((a,b)=>b.revision-a.revision)[0];
 const negotiated=latest?.revision===input.revision?latest.lines.reduce((n,l)=>n+l.firstMinor-l.awardedMinor,0):0;
 const byRevision=new Map(awards.map(a=>[a.revision,a])),planned=new Set(records('payable').filter(p=>p.approvedAt).map(p=>p.invoice)),used=new Map(),expected=[];
 const current=[...orders].filter(o=>o.issuedAt).sort((a,b)=>b.revision-a.revision)[0];
 for(const invoice of [...records('invoice')].sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id))){
  const order=orders.find(o=>o.id===invoice.order),award=order&&byRevision.get(order.revision);
  if(!order?.issuedAt||order.imported||!planned.has(invoice.id)||invoice.exception||(invoice.flags??[]).some(f=>!(invoice.riskReviews??[]).some(r=>r.flag===f.id))||!award||!approved.has(award.revision))continue;
  for(const allocation of invoice.allocations){
   const line=order.lines.find(l=>l.id===allocation.line),baseline=award.lines.find(l=>l.id===allocation.line),currentLine=current?.lines.find(l=>l.id===allocation.line);
   if(!line||!baseline)continue;
   const prior=used.get(line.id)??0,q=Math.max(0,Math.min(allocation.q,(currentLine?accepted(current,currentLine):0)-prior));used.set(line.id,prior+q);
   if(!q||order.revision!==input.revision)continue;
   const billedMinor=Number((BigInt(allocation.amountMinor)*BigInt(q)+BigInt(allocation.q)/2n)/BigInt(allocation.q)),firstMinor=extended(q,baseline.firstUnitMinor);
   expected.push({invoice:invoice.id,order:order.id,award:award.id,line:line.id,quantity:q/1000,firstMinor,billedMinor,savingsMinor:firstMinor-billedMinor});
  }
 }
 const fields=['invoice','order','award','line','quantity','firstMinor','billedMinor','savingsMinor'];
 fail(assessment.negotiatedMinor===negotiated&&assessment.realizedMinor===expected.reduce((n,r)=>n+r.savingsMinor,0)&&assessment.status===(expected.length?'evidence':'no-evidence')&&equal(assessment.rows.map(r=>Object.fromEntries(fields.map(k=>[k,r[k]]))),expected),'assessment_saving_arithmetic');
}

/** Portable facts and historical authority receipts never create a current principal or grant. */
export function validateAgentValue(all, get, check, rows) {
 const revisions = new Map(rows.map(r => [r.kind + ':' + r.id, r.revision]));
 const fail = (ok, label) => check(ok, 'agent_value_' + label);
 const audit = (action, predicate) => all('audit').some(a => a.action === action && predicate(a));
 const approved = (request, revision) => {
  const source = get('revision', request + ':' + revision);
  fail(!source.imported && source.valuePromise && all('decision').some(d => d.request === request && d.revision === revision && d.decision === 'approved'), 'approved_promise');
  return source;
 };
 for (const source of [...all('request'), ...all('revision')]) if (source.valuePromise != null) {
  const p = source.valuePromise;
  fail(p && ['seats','need-date','quoted-saving'].includes(p.kind), 'promise_kind');
  if (p.kind === 'seats') fail(Number.isSafeInteger(p.seats) && p.seats > 0 && p.seats <= 1000000 && Object.keys(p).length === 2, 'promise_seats');
  if (p.kind === 'need-date') fail(calendar(p.needDate) && p.needDate === source.needDate && Object.keys(p).length === 2, 'promise_date');
  if (p.kind === 'quoted-saving') fail(Number.isSafeInteger(p.amountMinor) && p.amountMinor >= 0 && p.amountMinor <= 1e12 && p.currency === source.currency && Object.keys(p).length === 3, 'promise_saving');
  if (source.request === undefined) fail(equal(p,get('revision',source.id+':'+source.revision).valuePromise), 'promise_revision');
 }
 for (const policy of all('valuePolicy')) {
  fail(policy.id === 'main' && typeof policy.enabled === 'boolean' && Number.isSafeInteger(policy.version) && policy.version > 0 && Array.isArray(policy.history) && policy.history.length === policy.version, 'policy');
  for (const [index, h] of policy.history.entries()) {
   fail(h.version === index + 1 && typeof h.enabled === 'boolean' && nonempty(h.actor) && Number.isSafeInteger(h.operatorVersion) && h.operatorVersion > 0 && timestamp(h.at) && nonempty(h.reason), 'policy_history');
   fail(audit('value-policy',a => a.record === policy.id && a.version === h.version && a.actor === h.actor && a.enabled === h.enabled && a.reason === h.reason), 'policy_audit');
  }
  fail(Object.keys(policy.history.at(-1)).every(k => equal(policy[k],policy.history.at(-1)[k])), 'policy_current');
 }
 for (const usage of all('valueSeatImport')) {
  approved(usage.request,usage.revision);
  const attachment = get('attachment',usage.attachment);
  const delivered=get('receipt',usage.deliveryReceipt),order=get('order',delivered.order);
  const ancestry=deliverySources(all,usage.request,usage.revision,fail);
  fail(ancestry.delivery&&ancestry.receipts.some(r=>r.id===delivered.id)&&!delivered.imported&&delivered.event==='receive'&&delivered.q>0&&order.issuedAt&&!order.imported&&order.request===usage.request&&order.revision<=usage.revision&&usage.deliveryAt===delivered.at&&Date.parse(usage.at)>=Date.parse(delivered.at)&&usage.periodEnd>=ancestry.delivery.date,'usage_delivery');
  fail(attachment.kind === 'request' && attachment.record === usage.request && usage.attachmentVersion === revisions.get('attachment:'+attachment.id), 'usage_scope');
  const bytes = Buffer.from(attachment.base64,'base64'); let original;
  const erased=erasedOriginal(all,attachment);
  if(erased)fail(erasedSourceFact(all,'valueSeatImport',usage.id,usage),'usage_erasure_fact');
  try { if(!erased)original = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { fail(false,'usage_json'); }
  fail(erased || original && Array.isArray(original.seats) && original.seats.length <= 100000 && original.seats.every(s => nonempty(s.id) && s.id.length <= 200 && typeof s.active === 'boolean') && new Set(original.seats.map(s=>s.id)).size === original.seats.length, 'usage_seats');
  fail(usage.sha256 === originalDigest(all,attachment) && usage.originalLocation === '/api/purse/download/attachment/'+attachment.id && usage.activeRule === 'active-true' && usage.provenance === 'provider-reported, unverified', 'usage_original');
  fail((erased || usage.activeSeats === original.seats.filter(s=>s.active === true).length && usage.seatCount === original.seats.length) && nonempty(usage.provider) && calendar(usage.periodStart) && calendar(usage.periodEnd) && usage.periodStart <= usage.periodEnd, 'usage_count');
  fail(nonempty(usage.actor) && Number.isSafeInteger(usage.operatorVersion) && usage.operatorVersion > 0 && timestamp(usage.at) && audit('value-seat-import',a => a.record === usage.request && a.usage === usage.id && a.actor === usage.actor && a.attachment === attachment.id && a.sha256 === usage.sha256 && a.revision === usage.revision), 'usage_audit');
 }
 const snapshot = (input, references) => {
  fail(input && Array.isArray(input.sources) && Array.isArray(references) && input.mode === 'deterministic v1' && input.model === 'none' && input.provider === 'none', 'snapshot');
  const source = approved(input.request,input.revision), request = get('request',input.request);
  fail(input.requester === request.requester && equal(input.promise,source.valuePromise), 'snapshot_promise');
  const keys = input.sources.map(s=>s.kind+':'+s.id);
  fail(new Set(keys).size === keys.length && keys.includes('revision:'+source.id) && keys.includes('request:'+request.id), 'snapshot_sources');
  fail(equal(references,input.sources.map(({kind,id,version})=>({kind,id,version}))), 'snapshot_references');
  for (const ref of input.sources) {
   const current = get(ref.kind,ref.id);
   fail(nonempty(ref.version) && ref.value?.id === current.id, 'source_version');
   let candidate = current;
   if (ref.fields) {
    const allowed = ref.kind === 'invoice' ? ['id','order','currency','totalMinor','allocations','exception','flags','riskReviews','at'] : ref.kind === 'payable' ? ['id','invoice','version','approvedAt'] : ref.kind === 'attachment' ? ['id','kind','record','name','mediaType','size','actor','at'] : ref.kind === 'quote' ? ['id','request','revision','supplier','currency','lines'] : ref.kind === 'agreementAward' ? ['id','request','revision','supplier','currency','agreement','agreementVersion','lines'] : [];
    fail(equal(ref.fields,allowed), 'source_private_fields');
    candidate = Object.fromEntries(allowed.filter(k => current[k] !== undefined).map(k=>[k,ref.kind === 'invoice' && k === 'flags' ? current.flags.map(f=>({id:f.id,code:f.code})) : ref.kind === 'invoice' && k === 'riskReviews' ? current.riskReviews.map(r=>({flag:r.flag,actor:r.actor,at:r.at})) : current[k]]));
   }
   if (ref.version === revisions.get(ref.kind+':'+ref.id) || ['attachment','receipt','revision','decision','valueSeatImport','quoteAward','agreementAward','quote'].includes(ref.kind)) fail(equal(ref.value,candidate), 'source_exact');
   fail(['request','revision','valuePolicy','decision','order','receipt','supplierIssue','valueSeatImport','attachment','quoteAward','agreementAward','quote','invoice','payable'].includes(ref.kind), 'source_kind');
   if (ref.kind === 'request') fail(ref.id === input.request && ref.value.revision === input.revision && ref.value.requester === input.requester && equal(ref.value.valuePromise,input.promise) && ref.value.status === 'approved', 'source_request');
   if (ref.kind === 'revision') fail(ref.value.request === input.request && ref.value.revision <= input.revision, 'source_revision');
   if (ref.kind === 'decision') fail(ref.value.request === input.request && ref.value.revision <= input.revision, 'source_decision');
   if (ref.kind === 'order') fail(ref.value.request === input.request && ref.value.revision <= input.revision && ref.value.issuedAt && !ref.value.imported, 'source_order');
   if (['receipt','supplierIssue'].includes(ref.kind)) fail(input.sources.some(s=>s.kind === 'order' && s.id === ref.value.order), 'source_order_link');
   if (ref.kind === 'valueSeatImport') fail(ref.value.request === input.request && ref.value.revision === input.revision && keys.includes('attachment:'+ref.value.attachment), 'source_usage_link');
   if (['quote','quoteAward','agreementAward'].includes(ref.kind)) fail(ref.value.request === input.request && ref.value.revision <= input.revision, 'source_award_scope');
   if (ref.kind === 'invoice') fail(input.sources.some(s=>s.kind === 'order' && s.id === ref.value.order), 'source_invoice_scope');
   if (ref.kind === 'payable') fail(input.sources.some(s=>s.kind === 'invoice' && s.id === ref.value.invoice), 'source_payable_scope');
   if (ref.kind === 'valuePolicy') fail(current.history.some(h=>h.version === ref.value.version && h.enabled === ref.value.enabled), 'source_policy_history');
  }
  const fingerprintInput = Object.fromEntries(['request','revision','requester','promise','sources','assessment','mode','model','provider'].map(k=>[k,input[k]]));
  fail((input.fingerprint === digest(canonical(fingerprintInput)) || erasedSourceFact(all,'valueSnapshot',input.fingerprint,fingerprintInput)), 'fingerprint');
  const assessment = input.assessment;
  fail(assessment && assessment.kind === input.promise.kind && ['evidence','no-evidence'].includes(assessment.status) && (assessment.status !== 'no-evidence' || assessment.statement === 'no evidence yet'), 'assessment');
  validateAssessment(input,fail);
  if (input.promise.kind === 'seats') {
   const usages = input.sources.filter(s=>s.kind === 'valueSeatImport').map(s=>s.value).sort((a,b)=>a.periodEnd.localeCompare(b.periodEnd)||a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
   const delivery=input.assessment.delivery;
   const latest = delivery ? usages.filter(u=>u.periodEnd>=delivery.date&&input.sources.some(s=>s.kind==='receipt'&&s.id===u.deliveryReceipt&&s.value.event==='receive'&&s.value.q>0&&s.value.at===u.deliveryAt&&Date.parse(u.at)>=Date.parse(u.deliveryAt))).at(-1) : undefined;
   fail(assessment.promisedSeats === input.promise.seats && (latest ? assessment.status === 'evidence' && assessment.usage === latest.id && assessment.activeSeats === latest.activeSeats && assessment.shortfall === Math.max(0,input.promise.seats-latest.activeSeats) : assessment.status === 'no-evidence' && assessment.activeSeats === null && assessment.shortfall === null && assessment.statement === 'no evidence yet'), 'assessment_seats');
  }
  if (input.promise.kind === 'quoted-saving') {
   fail(assessment.currency === input.promise.currency && assessment.promisedMinor === input.promise.amountMinor && Array.isArray(assessment.rows) && Number.isSafeInteger(assessment.negotiatedMinor) && assessment.realizedMinor === assessment.rows.reduce((n,r)=>n+r.savingsMinor,0), 'assessment_saving');
   for (const row of assessment.rows) {
    const invoice=get('invoice',row.invoice),order=get('order',row.order),award=get(row.agreement ? 'agreementAward':'quoteAward',row.award);
    fail(row.request === input.request && row.revision === input.revision && order.request === input.request && order.revision === input.revision && invoice.order === order.id && award.request === input.request && award.revision === input.revision && row.currency === input.promise.currency && row.savingsMinor === row.firstMinor-row.billedMinor, 'assessment_saving_source');
    fail(keys.includes('invoice:'+invoice.id) && all('payable').some(p=>p.invoice === invoice.id && keys.includes('payable:'+p.id)) && input.sources.some(s=>s.kind === 'decision' && s.value.decision === 'approved'), 'assessment_saving_authority');
   }
  }
 };
 const runs = all('agentRun').filter(r=>r.workflow === 'value-realization');
 for (const run of runs) {
  snapshot(run.inputs,run.references);
  fail(run.request === run.inputs.request && run.revision === run.inputs.revision && run.version === 1 && nonempty(run.actor) && timestamp(run.at) && run.mode === run.inputs.mode && run.model === 'none' && run.provider === 'none' && equal(run.sources,run.inputs.sources) && equal(run.report,run.inputs.assessment) && Array.isArray(run.messages) && Array.isArray(run.proposals) && run.proposals.length === 1 && Array.isArray(run.outcomes), 'run');
  const proposal = get('proposedAction',run.proposals[0]);
  fail(proposal.run === run.id && proposal.runVersion === run.version && proposal.actor === run.inputs.requester && proposal.action === 'value-confirm' && ['proposed','executed'].includes(proposal.status) && equal(proposal.references,run.references) && equal(proposal.input,{id:run.id,version:run.version,request:run.request,revision:run.revision,fingerprint:run.inputs.fingerprint}), 'proposal');
  if (!run.checkin) fail(run.authority?.actor === run.actor && Number.isSafeInteger(run.authority.operatorVersion) && run.authority.operatorVersion > 0 && Array.isArray(run.authority.roles) && audit('value-report',a=>a.run === run.id && a.actor === run.actor && a.record === run.request && a.revision === run.revision && a.fingerprint === run.inputs.fingerprint && a.proposal === proposal.id), 'run_authority');
 }
 const used = new Set();
 for (const c of all('valueConfirmation')) {
  const run=get('agentRun',c.run),request=get('request',c.request),proposal=get('proposedAction',c.proposal),identity=c.run+':'+c.runVersion;
  fail(!used.has(identity),'confirmation_duplicate');used.add(identity);
  fail(run.workflow === 'value-realization' && run.version === c.runVersion && c.request === run.request && c.revision === run.revision && c.requester === request.requester && c.actor === request.requester && c.role === 'requester' && Number.isSafeInteger(c.operatorVersion) && c.operatorVersion > 0 && timestamp(c.at), 'confirmation_authority');
  fail(c.fingerprint === run.inputs.fingerprint && equal(c.inputs,run.inputs) && equal(c.references,run.references) && typeof c.usefulness === 'boolean' && typeof c.notes === 'string' && c.notes.length <= 2000 && c.mode === 'deterministic v1' && c.model === 'none' && c.provider === 'none', 'confirmation_evidence');
  fail(proposal.status === 'executed' && proposal.executedBy === c.actor && proposal.confirmation === c.id && proposal.run === run.id && run.outcomes.some(o=>o.status === 'confirmed' && o.confirmation === c.id && o.actor === c.actor && o.at === c.at), 'confirmation_proposal');
  fail(audit('value-confirm',a=>a.confirmation === c.id && a.run === run.id && a.record === c.request && a.actor === c.actor && a.revision === c.revision && a.fingerprint === c.fingerprint && a.usefulness === c.usefulness), 'confirmation_audit');
 }
 for (const p of all('proposedAction').filter(p=>p.action === 'value-confirm')) {
  const run=get('agentRun',p.run);
  fail(run.workflow === 'value-realization' && run.proposals.includes(p.id) && (p.status === 'executed' ? all('valueConfirmation').some(c=>c.proposal === p.id) : !all('valueConfirmation').some(c=>c.proposal === p.id)), 'proposal_confirmation');
 }
 for (const event of all('valueCheckin')) {
  const run=get('agentRun',event.run),source=approved(event.request,event.revision),decision=get('decision',event.approvedDecision),request=get('request',event.request);
  fail([30,90].includes(event.intervalDays) && event.id === event.request+':'+event.revision+':'+event.intervalDays && decision.request === event.request && decision.revision === event.revision && decision.decision === 'approved' && decision.at === event.approvedAt && event.dueAt === new Date(Date.parse(event.deliveredAt)+event.intervalDays*86400000).toISOString() && timestamp(event.at) && Date.parse(event.at)>=Date.parse(event.dueAt), 'checkin_interval');
  const delivery=deliverySources(all,event.request,event.revision,fail).delivery;
  fail(delivery&&event.deliveryReceipt===delivery.receipt&&event.deliveredAt===delivery.at&&event.order===delivery.order&&event.inputs.sources.some(s=>s.kind==='receipt'&&s.id===delivery.receipt),'checkin_delivery');
  fail(event.requester === request.requester && event.requesterEmail === request.requesterEmail.toLowerCase() && source.valuePromise && run.checkin === event.id && run.actor === event.requester && equal(event.inputs,run.inputs) && equal(event.sources,run.sources) && equal(event.report,run.report) && equal(event.references,run.references) && event.mode === run.mode && event.model === 'none' && event.provider === 'none', 'checkin_sources');
  let url;try {url=new URL(event.confirmationUrl);}catch{fail(false,'checkin_url');}
  fail(url.pathname === '/app' && url.searchParams.get('valueRequest') === event.request && url.searchParams.get('valueRevision') === String(event.revision) && !url.username && !url.password && equal(event.message.to,[event.requesterEmail]) && typeof event.message.text === 'string' && event.message.text.includes(event.confirmationUrl) && run.messages.some(m=>equal(m,event.message)), 'checkin_message');
  fail(['accepted','suppressed','unavailable','uncertain'].includes(event.outcome?.status) && event.outcome.recipient === event.requesterEmail && run.outcomes.some(o=>equal(o,event.outcome)), 'checkin_outcome');
  if(event.outcome.delivery)try{validateSendResult(event.outcome.delivery,event.outcome.delivery.provider);}catch{fail(false,'checkin_delivery');}
  if(event.policyVersion !== null)fail(get('valuePolicy','main').history.some(h=>h.version === event.policyVersion),'checkin_policy');
  fail(audit('value-checkin',a=>a.checkin === event.id && a.record === event.request && a.revision === event.revision && a.intervalDays === event.intervalDays && a.outcome === event.outcome.status), 'checkin_audit');
 }
}
