import { validateSendResult } from '../../src/modules/mail/src/core/validation.mjs';
import { containsProtectedInput } from '../../src/purse/protected-context-fields.mjs';

const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
 : value && typeof value === 'object' ? '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
const equal = (a,b) => canonical(a) === canonical(b);
const text = value => typeof value === 'string' && value.trim().length > 0;
const instant = value => text(value) && Number.isFinite(Date.parse(value));
const positive = value => Number.isSafeInteger(value) && value > 0;

/** Claimed sends and human dispositions are historical custody, never live grants. */
export function validateRecurringNotices(all,get,check) {
 const fail = (value,code) => check(value,'recurring_notice_'+code);
 const audit = (action,predicate) => all('audit').some(row=>row.action===action&&predicate(row));
 const shape = (value,fields) => fail(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>fields.split(',').includes(key)),'fields');
 for(const send of all('recurringNoticeSend')) {
  shape(send,'id,scenario,hash,draftHash,recipient,actor,email,operatorVersion,owner,reason,at,status,outcomeAt,delivery,reasonCode,noticeDeadlines,deliveryVisibility,noticeEffectiveness,erasure');
  fail(!containsProtectedInput(send),'protected');
  const scenario=get('recurringScenario',send.scenario),draft=get('recurringScenarioDraft',send.scenario);
  fail(scenario.snapshot.recordedForecast&&send.id==='recurring-notice:'+scenario.id&&send.hash===scenario.hash&&send.draftHash===draft.draftHash,'source');
  fail(text(send.recipient)&&/^[^\s@<>(),:;"\\]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(send.recipient)&&send.recipient===send.recipient.toLowerCase()&&text(send.actor)&&text(send.email)&&positive(send.operatorVersion)&&send.owner===true&&text(send.reason)&&instant(send.at)&&Date.parse(send.at)>=Date.parse(draft.at),'custody');
  const deadlines=scenario.snapshot.agreements.map(row=>({agreement:row.id,name:scenario.snapshot.sources.find(source=>source.kind==='agreement'&&source.id===row.id).value.name,date:row.noticeDeadline}));
  fail(equal(send.noticeDeadlines,deadlines)&&equal(send.deliveryVisibility,{mailbox:'unknown'})&&send.noticeEffectiveness==='not-verified','notice_terms');
  fail(['uncertain','accepted','rejected','rate_limited','suppressed','unavailable'].includes(send.status),'status');
  fail(!['accepted','rejected','rate_limited','suppressed'].includes(send.status)||send.delivery!=null,'delivery_required');
  fail(send.reasonCode==null||text(send.reasonCode),'reason_code');
  if(send.delivery!=null){
   try{validateSendResult(send.delivery,send.delivery.provider);}catch{fail(false,'delivery');}
   fail(send.status===(send.delivery.status==='development'?'suppressed':send.delivery.status),'delivery_status');
  }
  fail(audit('recurring-notice-claimed',row=>row.record===scenario.id&&row.send===send.id&&row.hash===send.hash&&row.draftHash===send.draftHash&&row.recipient===send.recipient&&row.actor===send.actor&&row.email===send.email&&row.at===send.at),'claim_audit');
  if(send.outcomeAt!==undefined){
   fail(instant(send.outcomeAt)&&Date.parse(send.outcomeAt)>=Date.parse(send.at),'outcome_time');
   fail(audit('recurring-notice-outcome',row=>row.record===scenario.id&&row.send===send.id&&row.hash===send.hash&&row.draftHash===send.draftHash&&row.status===send.status&&row.at===send.outcomeAt),'outcome_audit');
  }else fail(send.status==='uncertain'&&send.delivery===undefined&&send.reasonCode===undefined,'unsettled_claim');
 }
 const versions=new Map(),decisions=new Set();
 for(const row of [...all('agreementDisposition')].sort((a,b)=>a.agreement.localeCompare(b.agreement)||a.version-b.version)) {
  shape(row,'id,agreement,agreementVersion,scenario,hash,disposition,reason,actor,at,send,version');
  fail(!containsProtectedInput(row),'disposition_protected');
  const agreement=get('agreement',row.agreement),scenario=get('recurringScenario',row.scenario),send=get('recurringNoticeSend',row.send),terms=scenario.snapshot.sources.find(source=>source.kind==='agreement'&&source.id===agreement.id)?.value;
  const decision=row.agreement+':'+row.scenario;fail(!decisions.has(decision),'disposition_duplicate');decisions.add(decision);
  const version=(versions.get(row.agreement)??0)+1;versions.set(row.agreement,version);
  fail(positive(row.version)&&row.version===version&&row.id===row.agreement+':'+row.version&&positive(row.agreementVersion)&&terms&&row.agreementVersion===terms.version&&agreement.history.some(h=>h.version===row.agreementVersion),'disposition_version');
  fail(scenario.choices.kind==='cancel'&&row.hash===scenario.hash&&scenario.choices.agreementIds.includes(row.agreement)&&send.scenario===scenario.id&&send.hash===row.hash&&send.outcomeAt&&['accepted','suppressed'].includes(send.status),'disposition_source');
  fail(['cancellation','non-renewal'].includes(row.disposition)&&text(row.reason)&&text(row.actor)&&instant(row.at)&&Date.parse(row.at)>=Date.parse(send.outcomeAt),'disposition_custody');
  const resulting=agreement.history.find(h=>h.version===row.agreementVersion+1);
  fail(resulting&&resulting.autoRenew===false&&resulting.confirmedBy===row.actor&&resulting.reason===row.reason&&Date.parse(resulting.at)>=Date.parse(row.at),'disposition_terms');
  fail(audit('agreement-disposition',event=>event.record===row.agreement&&event.disposition===row.id&&event.scenario===scenario.id&&event.hash===row.hash&&event.send===send.id&&event.reason===row.reason&&event.actor===row.actor&&instant(event.at)&&Date.parse(event.at)>=Date.parse(row.at)),'disposition_audit');
 }
}
