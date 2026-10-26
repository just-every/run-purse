import {erasedSourceFact} from '../../src/purse/erasure-journal.mjs';
import {recordedRenewalForecast} from '../../src/purse/recurring-forecast.mjs';
import {createHash} from 'node:crypto';
import {containsProtectedInput} from '../../src/purse/protected-context-fields.mjs';
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const text=value=>typeof value==='string'&&value.trim().length>0;
const positive=value=>Number.isSafeInteger(value)&&value>0;
const equal=(a,b)=>canonical(a)===canonical(b);
export function validateRecurringDiscovery(all,get,check) {
 for(const run of all('agentRun').filter(run=>run.workflow==='recurring-discovery')) {
  check(!containsProtectedInput(run)&&day(run.from)&&day(run.to)&&run.from<=run.to&&run.mode==='deterministic v1'&&run.model==='none'&&run.provider==='none'&&run.version===1&&Array.isArray(run.actions)&&!run.actions.length&&Array.isArray(run.missing)&&!run.missing.length,'discovery_run');
  check(run.inputs?.from===run.from&&run.inputs?.to===run.to&&Number.isSafeInteger(run.inputs.limit)&&run.inputs.limit>=1&&run.inputs.limit<=200&&Array.isArray(run.references),'discovery_inputs');
  if(run.protectedContextCleanup?.authorityInvalidated===true){check(run.protectedContextCleanup.status==='quarantined','discovery_quarantine');continue;}
  check(Array.isArray(run.proposals)&&run.proposals.length<=run.inputs.limit,'discovery_proposals');
  const references=new Map();
  for(const proposal of run.proposals) {
   const {id,...candidate}=proposal;
   const recorded=Object.hasOwn(proposal.baseline??{},'recordedForecast');
   check(['consolidate','renegotiate','cancellation-review'].includes(proposal.kind)&&proposal.conditional===true&&proposal.reviewRequired===true&&Array.isArray(proposal.agreementIds)&&proposal.agreementIds.length&&proposal.agreementIds.every(id=>get('agreement',id))&&Array.isArray(proposal.sources)&&proposal.sources.length<=2000&&(proposal.baseline?.recordedForecast?['unknown','recorded-terms'].includes(proposal.baseline.futureForecast):proposal.baseline?.futureForecast==='unknown'),'discovery_proposal');
   check(run.sourceValuesErased?erasedSourceFact(all,'agentRun',run.id,run):id===createHash('sha256').update(canonical({from:run.from,to:run.to,...candidate})).digest('hex'),'discovery_digest');
   for(const source of proposal.sources) {
    check(['agreement','supplier','recurringSeries','agreementAward','order','request','valueSeatImport','supplierIssue'].includes(source.kind)&&typeof source.revision==='string'&&source.revision.length&&source.value&&get(source.kind,source.id),'discovery_source');
    if(recorded&&source.kind==='agreement'){
     const original=get('agreement',source.id),history=original.history.find(row=>row.version===source.value.version),value=source.value;
     const fields='name,reference,version,supplier,currency,startDate,endDate,noticeDeadline,noticeDays,autoRenew,owner,ownerEmail,valueMinor,renewalTermMonths,renewalIncreaseCapBps';
     const pick=(row,keys)=>Object.fromEntries(keys.split(',').filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));
     check(history&&Object.keys(value).every(key=>[...fields.split(','),'priceHistory'].includes(key))&&equal(pick(value,fields),pick(history,fields))&&Array.isArray(value.priceHistory)&&value.priceHistory.length===value.version,'discovery_recorded_terms');
     for(const [index,row] of value.priceHistory.entries())check(equal(row,{...pick(original.history[index],'version,currency,valueMinor,startDate,endDate,noticeDeadline,renewalTermMonths,renewalIncreaseCapBps,at'),priceLines:(original.history[index].priceLines??[]).map(line=>pick(line,'description,partNumber,unit,q,awardedUnitMinor'))}),'discovery_price_history');
    }
    references.set(source.kind+':'+source.id,{kind:source.kind,id:source.id,version:source.revision});
   }
   if(recorded){
    const agreements=proposal.agreementIds.map(id=>{const source=proposal.sources.find(row=>row.kind==='agreement'&&row.id===id);check(source,'discovery_agreement_source');return {id,...source.value};});
    let forecast;try{forecast=recordedRenewalForecast(agreements,run.from,run.to);}catch{check(false,'discovery_forecast_inputs');}
    check(equal(proposal.baseline.recordedForecast,forecast)&&proposal.baseline.futureForecast===(forecast.unknownAgreementIds.length?'unknown':'recorded-terms'),'discovery_forecast');
    check(equal(proposal.baseline.noticeDeadlines,agreements.map(agreement=>({agreement:agreement.id,name:agreement.name,reference:agreement.reference,date:agreement.noticeDeadline,dueInPeriod:agreement.noticeDeadline>=run.from&&agreement.noticeDeadline<=run.to,alreadyBeforePeriod:agreement.noticeDeadline<run.from}))),'discovery_notice_terms');
   }
  }
  const expected=[...references.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
  check(canonical(run.references)===canonical(expected)&&all('audit').some(event=>event.action==='recurring-scenario-discover'&&event.run===run.id&&event.actor===run.actor&&event.from===run.from&&event.to===run.to),'discovery_custody');
  if(run.scheduled===true){
   check(positive(run.operatorVersion)&&run.proposals.length===1&&Array.isArray(run.messages)&&run.messages.length===0&&Array.isArray(run.outcomes),'discovery_schedule');
   const proposal=run.proposals[0],window=run.noticeWindow,terms=proposal.sources.find(source=>source.kind==='agreement'&&source.id===window?.agreement)?.value;
   const agreement=terms&&get('agreement',window.agreement),history=agreement?.history.find(row=>row.version===terms.version);
   check(window&&Object.keys(window).every(key=>['agreement','from','to'].includes(key))&&history&&proposal.agreementIds.includes(window.agreement)&&day(window.from)&&window.to===history.noticeDeadline&&window.from===new Date(Date.parse(history.noticeDeadline)-Math.max(...history.reminderDays)*86400000).toISOString().slice(0,10)&&run.from===history.startDate&&run.to===history.endDate,'discovery_schedule_window');
   check(text(run.at)&&Number.isFinite(Date.parse(run.at))&&run.id==='recurring-discovery:'+digest({window,sourceHash:proposal.id}),'discovery_schedule_identity');
   const notices=all('recurringDiscoveryNotice').filter(notice=>notice.run===run.id);
   check(notices.length>0&&equal([...run.outcomes].sort((a,b)=>a.notice.localeCompare(b.notice)),notices.map(notice=>({notice:notice.id,recipient:notice.recipient,status:'proposed'})).sort((a,b)=>a.notice.localeCompare(b.notice))),'discovery_schedule_outcomes');
  }
 }
 for(const notice of all('recurringDiscoveryNotice')){
  check(!containsProtectedInput(notice)&&Object.keys(notice).every(key=>['id','run','proposal','preparedBy','preparerVersion','recipient','recipientEmail','recipientVersion','role','agreementIds','sourceHash','from','to','noticeWindow','noticeDeadlines','at','mode','model','provider','status','sourceValuesErased'].includes(key)),'discovery_notice_fields');
  const run=get('agentRun',notice.run),proposal=run.proposals?.find(row=>row.id===notice.proposal);
  check(run.workflow==='recurring-discovery'&&run.scheduled===true&&proposal&&notice.sourceHash===proposal.id&&notice.from===run.from&&notice.to===run.to&&Number.isFinite(Date.parse(notice.at))&&Date.parse(notice.at)>=Date.parse(run.at)&&equal(notice.noticeWindow,run.noticeWindow)&&equal(notice.noticeDeadlines,proposal.baseline.noticeDeadlines),'discovery_notice_source');
  check(text(notice.preparedBy)&&positive(notice.preparerVersion)&&all('audit').some(row=>row.action==='recurring-discovery-notice'&&row.record===notice.id&&row.run===run.id&&row.actor===notice.preparedBy&&row.recipient===notice.recipient&&row.at===notice.at),'discovery_notice_authority_custody');
  check(text(notice.recipient)&&text(notice.recipientEmail)&&notice.recipientEmail===notice.recipientEmail.toLowerCase()&&positive(notice.recipientVersion)&&['owner','finance'].includes(notice.role)&&notice.mode==='deterministic v1'&&notice.model==='none'&&notice.provider==='none'&&notice.status==='proposed','discovery_notice_custody');
  check(notice.sourceValuesErased?erasedSourceFact(all,'recurringDiscoveryNotice',notice.id,notice):notice.id===digest({window:run.noticeWindow,sourceHash:proposal.id,recipient:notice.recipient,role:notice.role}),'discovery_notice_identity');
  const owned=proposal.sources.filter(source=>source.kind==='agreement'&&source.value.owner===notice.recipient).map(source=>source.id).sort();
  check(Array.isArray(notice.agreementIds)&&equal(notice.agreementIds,notice.role==='owner'?owned:proposal.agreementIds)&&(notice.role==='owner'?owned.length>0:owned.length===0),'discovery_notice_recipient');
 }
}
