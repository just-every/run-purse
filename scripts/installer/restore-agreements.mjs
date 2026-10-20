export function validateAgreements(all,get,check,same) {
 const str=v=>typeof v==='string'&&v.trim().length>0;
 const timestamp=v=>str(v)&&Number.isFinite(Date.parse(v));
 const day=v=>str(v)&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 const deadline=(end,days)=>new Date(Date.parse(end)-days*86400000).toISOString().slice(0,10);
 function ref(v,signature=false){if(v===null)return;check(v&&str(v.provider)&&str(v.reference)&&str(v.url),'agreement_reference');let url;try{url=new URL(v.url)}catch{}check(url?.protocol==='https:'&&!url.username&&!url.password,'agreement_reference_url');if(signature)check(['not-recorded','draft','sent','signed','declined','void'].includes(v.status)&&str(v.source)&&v.provenance==='owner-recorded; not provider-verified','agreement_signature');}
 for(const a of all('agreement')){
  check(int(a.version,1,1000000)&&Array.isArray(a.history)&&a.history.length===a.version&&timestamp(a.createdAt)&&a.createdAt===a.history[0]?.at,'agreement_history');
  for(const [i,h]of a.history.entries()){
   get('supplier',h.supplier);check(get('business','main').currencies.includes(h.currency),'agreement_currency');
   check(h.version===i+1&&['name','reference','parties','paymentTerms','owner','ownerEmail','reason','confirmedBy'].every(k=>str(h[k]))&&h.owner===h.confirmedBy&&timestamp(h.at),'agreement_terms');
   check(day(h.startDate)&&day(h.endDate)&&h.startDate<=h.endDate&&int(h.noticeDays,0,3650),'agreement_term_dates');
   check(h.noticeDeadline===deadline(h.endDate,h.noticeDays)&&typeof h.autoRenew==='boolean'&&typeof h.remindersEnabled==='boolean','agreement_notice');
   check(Array.isArray(h.reminderDays)&&h.reminderDays.length>0&&h.reminderDays.length<=12&&h.reminderDays.every(n=>int(n,1,365))&&new Set(h.reminderDays).size===h.reminderDays.length,'agreement_intervals');
   ref(h.clm);ref(h.signature,true);
  }
  check(same(Object.fromEntries(Object.keys(a.history.at(-1)).map(k=>[k,a[k]])),a.history.at(-1)),'agreement_current_history');
 }
 for(const l of all('agreementInvoice')){
  const a=get('agreement',l.agreement),i=get('invoice',l.invoice),o=get('order',l.order);
  check(l.id===l.invoice&&i.order===o.id&&o.issuedAt&&!o.imported&&i.supplier===l.supplier&&i.currency===l.currency&&l.currency===a.currency&&l.amountMinor===i.allocations.reduce((n,r)=>n+r.amountMinor,0),'agreement_invoice_source');
  const canonical=id=>{const seen=new Set();let s=get('supplier',id);while(s.mergedInto){check(!seen.has(s.id),'agreement_supplier_cycle');seen.add(s.id);s=get('supplier',s.mergedInto)}return s.id};
  check(int(l.agreementVersion,1,a.version)&&canonical(l.supplier)===canonical(a.history[l.agreementVersion-1].supplier)&&str(l.actor)&&str(l.reason)&&timestamp(l.at),'agreement_attribution');
 }
 for(const e of all('agreementReminder')){
  const a=get('agreement',e.agreement);check(int(e.agreementVersion,1,a.version),'agreement_reminder_revision');const h=a.history[e.agreementVersion-1];
  check(e.id===`${a.id}:${e.noticeDeadline}:${e.offset}`&&e.noticeDeadline===h.noticeDeadline&&h.reminderDays.includes(e.offset)&&h.autoRenew&&h.remindersEnabled&&e.owner===h.owner&&e.ownerEmail===h.ownerEmail&&timestamp(e.at),'agreement_reminder');
  check(e.outcome?.recipient===e.ownerEmail&&['uncertain','suppressed','unavailable','accepted','rejected'].includes(e.outcome.status),'agreement_reminder_outcome');
  check(Array.isArray(e.spend?.rows)&&Array.isArray(e.spend?.totals),'agreement_reminder_spend');
  check(new Set(e.spend.rows.map(r=>r.id)).size===e.spend.rows.length,'agreement_reminder_spend_duplicates');
  for(const row of e.spend.rows){const l=get('agreementInvoice',row.id),i=get('invoice',l.invoice),o=get('order',l.order);check(l.agreement===e.agreement&&same(row,{...l,reference:i.reference,number:o.number,source:i.source,url:'/app?agreement='+encodeURIComponent(e.agreement)}),'agreement_reminder_source');}
  const totals=[...new Set(e.spend.rows.map(r=>r.currency))].map(currency=>({currency,amountMinor:e.spend.rows.filter(r=>r.currency===currency).reduce((n,r)=>n+r.amountMinor,0)}));check(same(e.spend.totals,totals),'agreement_reminder_totals');
 }
}
