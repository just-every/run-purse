import {createHash} from 'node:crypto';

/** Restore source custody and review history, never owner authority. */
export function validateAgreementReadings(all,get,check,same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)) {
 const names=['parties','currency','valueMinor','firstOfferMinor','startDate','endDate','autoRenew','noticeDays','paymentTerms'];
 const str=v=>typeof v==='string'&&v.trim().length>0;
 const timestamp=v=>str(v)&&Number.isFinite(Date.parse(v));
 const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 function field(f,name,attachment){
  check(f&&Number.isFinite(f.confidence)&&f.confidence>=0&&f.confidence<=1,'agreement_reading_field');
  if(f.value===null)check(f.confidence===0,'agreement_reading_missing');
  else{
   check(f.source&&f.confidence>0,'agreement_reading_source');
   if(['valueMinor','firstOfferMinor'].includes(name))check(integer(f.value,0,1e12),'agreement_reading_money');
   else if(name==='noticeDays')check(integer(f.value,0,3650),'agreement_reading_notice');
   else if(name==='autoRenew')check(typeof f.value==='boolean','agreement_reading_renewal');
   else if(['startDate','endDate'].includes(name))check(day(f.value),'agreement_reading_date');
   else check(str(f.value)&&f.value.length<=2000&&(name!=='currency'||/^[A-Z]{3}$/.test(f.value)),'agreement_reading_text');
  }
  if(f.source){
   const source=f.source;check(source.attachment===attachment,'agreement_reading_field_attachment');
   if(source.method==='explicit agreement term label')check(integer(source.page,1,50)&&integer(source.line,1,500000)&&str(source.excerpt)&&source.excerpt.length<=500000,'agreement_reading_page');
   else check(source.method==='human correction'&&(source.page===null||integer(source.page,1,50))&&str(source.actor)&&timestamp(source.at)&&Object.hasOwn(source,'original'),'agreement_reading_correction_source');
  }
 }
 for(const r of all('agreementReading')){
  const agreement=get('agreement',r.agreement), attachment=get('attachment',r.attachment), source=r.sourceDescriptor;
  check(attachment.kind==='agreement'&&attachment.record===agreement.id&&integer(r.agreementVersion,1,agreement.version)&&str(r.attachmentRevision),'agreement_reading_link');
  check(source&&source.attachment===attachment.id&&source.attachmentRevision===r.attachmentRevision&&source.sha256===createHash('sha256').update(Buffer.from(attachment.base64,'base64')).digest('hex')&&source.size===attachment.size&&source.name===attachment.name&&source.mediaType===attachment.mediaType&&source.url==='/api/purse/download/attachment/'+attachment.id,'agreement_reading_digest');
  function snapshot(v){
   check(v&&v.id===r.id&&v.agreement===r.agreement&&v.agreementVersion===r.agreementVersion&&v.attachment===r.attachment&&v.attachmentRevision===r.attachmentRevision&&same(v.sourceDescriptor,source),'agreement_reading_snapshot_source');
   check(integer(v.version,1,1000000)&&['review','unsupported','confirmed'].includes(v.status)&&str(v.actor)&&timestamp(v.at)&&str(v.parser)&&Array.isArray(v.warnings)&&v.warnings.every(str),'agreement_reading');
   for(const name of names)field(v[name],name,r.attachment);
   if(v.status==='unsupported')check(str(v.reason),'agreement_reading_unsupported');
  }
  snapshot(r);
  const history=all('agreementReadingEvent').filter(e=>e.reading===r.id).sort((a,b)=>a.version-b.version);
  check(history.length===r.version&&history[0]?.action==='agreement-extract','agreement_reading_history');
  let previous;
  for(const [i,e]of history.entries()){
   check(e.version===i+1&&e.agreement===r.agreement&&e.agreementVersion===r.agreementVersion&&e.attachment===r.attachment&&str(e.actor)&&timestamp(e.at)&&['agreement-extract','agreement-reading-edit','agreement-reading-confirm'].includes(e.action),'agreement_reading_event');
   snapshot(e.snapshot);check(e.snapshot.version===e.version,'agreement_reading_event_version');
   if(i===0)check(e.action==='agreement-extract'&&['review','unsupported'].includes(e.snapshot.status)&&e.actor===r.actor,'agreement_reading_extraction');
   else{
    check(previous.status==='review'&&e.action!=='agreement-extract','agreement_reading_transition');
    const expected=structuredClone(previous);expected.version++;
    if(e.action==='agreement-reading-edit'){
     check(Array.isArray(e.changes)&&e.changes.length>0&&e.changes.length<=names.length&&new Set(e.changes.map(c=>c.field)).size===e.changes.length,'agreement_reading_corrections');
     for(const c of e.changes){
      check(names.includes(c.field)&&same(c.before,previous[c.field]),'agreement_reading_correction_before');field(c.after,c.field,r.attachment);
      check(c.after.source?.method==='human correction'&&c.after.source.actor===e.actor&&same(c.after.source.original,c.before.source)&&c.after.source.page===(c.before.source?.page??null)&&c.after.confidence===(c.after.value===null?0:1),'agreement_reading_correction_history');
      expected[c.field]=c.after;
     }
    }else{
     check(e.action==='agreement-reading-confirm'&&str(e.reason)&&e.snapshot.confirmedBy===e.actor&&timestamp(e.snapshot.confirmedAt)&&e.snapshot.confirmedAgreementVersion===r.agreementVersion+1,'agreement_reading_confirmation_event');
     Object.assign(expected,{status:'confirmed',confirmedBy:e.actor,confirmedAt:e.snapshot.confirmedAt,confirmedAgreementVersion:r.agreementVersion+1});
    }
    check(same(expected,e.snapshot),'agreement_reading_event_replay');
   }
   previous=e.snapshot;
  }
  check(same(previous,r),'agreement_reading_current_history');
  if(r.status==='confirmed'){
   const revision=agreement.history[r.confirmedAgreementVersion-1], reference=revision?.reading;
   check(reference&&reference.id===r.id&&reference.version===r.version&&reference.attachment===r.attachment&&reference.sha256===source.sha256&&reference.agreementVersion===r.agreementVersion&&revision.confirmedBy===r.confirmedBy,'agreement_reading_confirmation');
   for(const name of names)check((revision[name]??null)===r[name].value,'agreement_reading_confirmed_field');
  }
 }
 for(const e of all('agreementReadingEvent'))get('agreementReading',e.reading);
 for(const a of all('agreement'))for(const h of a.history)if(h.reading){const r=get('agreementReading',h.reading.id);check(r.agreement===a.id&&r.status==='confirmed'&&r.confirmedAgreementVersion<=h.version&&same(h.reading,a.history[r.confirmedAgreementVersion-1].reading)&&names.every(name=>(h[name]??null)===r[name].value),'agreement_reading_agreement_reference');}
}
