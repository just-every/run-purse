import {createHash} from 'node:crypto';
/** Validate portable evidence only. No RFQ bearer capability is restored. */
export function validateRfqs(all,get,check) {
 const timestamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 const strings=(v,max)=>Array.isArray(v)&&v.length<=max&&v.every(x=>typeof x==='string'&&x.trim()&&x.length<=2000);
 for(const rfq of all('rfq')){
  if(rfq.closedAt)check(timestamp(rfq.closedAt)&&Date.parse(rfq.closedAt)>=Date.parse(rfq.deadline),'rfq_closed_deadline');
  const revision=get('revision',rfq.request+':'+rfq.revision);get('request',rfq.request);
  check(!revision.imported&&typeof rfq.scope==='string'&&rfq.scope.trim()&&rfq.scope.length<=2000&&timestamp(rfq.at)&&timestamp(rfq.deadline)&&timestamp(rfq.reminderAt)&&Date.parse(rfq.at)<Date.parse(rfq.reminderAt)&&Date.parse(rfq.reminderAt)<=Date.parse(rfq.deadline)-3600000&&Date.parse(rfq.deadline)-Date.parse(rfq.at)<=30*86400000,'rfq_scope_deadline');
  check(typeof rfq.actor==='string'&&strings(rfq.questions,30)&&Array.isArray(rfq.suppliers)&&rfq.suppliers.length>0&&rfq.suppliers.length<=50&&new Set(rfq.suppliers.map(s=>s.id)).size===rfq.suppliers.length,'rfq_configuration');
  for(const supplier of rfq.suppliers){get('supplier',supplier.id);check(typeof supplier.name==='string'&&typeof supplier.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplier.email),'rfq_recipient');}
  check(Array.isArray(rfq.lines)&&rfq.lines.length===revision.lines.length,'rfq_lines');
  for(const line of rfq.lines){const source=revision.lines.find(l=>l.id===line.id);check(source&&['description','quantity','q','unit','partNumber'].every(k=>line[k]===source[k]),'rfq_requirement');}
 }
 for(const response of all('rfqResponse')){
  const rfq=get('rfq',response.rfq);
  check(response.request===rfq.request&&response.revision===rfq.revision&&rfq.suppliers.some(s=>s.id===response.supplier)&&timestamp(response.at)&&Date.parse(response.at)<Date.parse(rfq.deadline)&&response.actor==='supplier-link'&&Number.isSafeInteger(response.sequence)&&response.sequence>0&&Number.isSafeInteger(response.offerSequence)&&response.offerSequence>0,'rfq_response_source');
  check(/^[A-Z]{3}$/.test(response.currency)&&['freightMinor','taxMinor','totalMinor'].every(k=>Number.isSafeInteger(response[k])&&response[k]>=0&&response[k]<=1e12)&&strings(response.answers,30)&&response.answers.length===rfq.questions.length&&typeof response.leadTime==='string'&&response.leadTime.trim()&&typeof response.validity==='string'&&response.validity.trim(),'rfq_response_terms');
  check(Array.isArray(response.lines)&&response.lines.length===rfq.lines.length&&new Set(response.lines.map(l=>l.sourceLine)).size===rfq.lines.length,'rfq_response_lines');
  for(const line of response.lines){const source=rfq.lines.find(l=>l.id===line.sourceLine);check(source&&['description','quantity','q','unit','partNumber'].every(k=>line[k]===source[k])&&typeof line.id==='string'&&Number.isSafeInteger(line.unitMinor)&&line.unitMinor>=0&&line.unitMinor<=1e12&&line.totalMinor===Number((BigInt(line.q)*BigInt(line.unitMinor)+500n)/1000n),'rfq_response_price');}
  check(response.totalMinor===response.lines.reduce((n,l)=>n+l.totalMinor,0)+response.freightMinor+response.taxMinor,'rfq_response_total');
  const offers=all('rfqResponse').filter(r=>r.rfq===rfq.id).sort((a,b)=>a.offerSequence-b.offerSequence);check(offers.every((r,i)=>r.offerSequence===i+1),'rfq_offer_history');
  const quote=get('quote',response.quote);check(quote.sourceResponse===response.id&&quote.rfq===rfq.id&&quote.supplier===response.supplier&&quote.revision===rfq.revision,'rfq_response_quote');
  const siblings=all('rfqResponse').filter(r=>r.rfq===rfq.id&&r.supplier===response.supplier).sort((a,b)=>a.sequence-b.sequence);check(siblings.every((r,i)=>r.sequence===i+1),'rfq_response_history');
  check(Array.isArray(response.files)&&response.files.length<=3&&response.files.reduce((n,f)=>n+f.size,0)<=1000000,'rfq_response_files');
  for(const file of response.files){const bytes=Buffer.from(file.base64,'base64');check(typeof file.id==='string'&&typeof file.name==='string'&&file.name.trim()&&file.name.length<=200&&typeof file.mediaType==='string'&&file.mediaType.length<=150&&file.size>0&&bytes.length===file.size&&createHash('sha256').update(bytes).digest('hex')===file.sha256,'rfq_original');}
  check(all('audit').some(e=>e.action==='rfq-response'&&e.response===response.id&&e.rfq===rfq.id&&e.supplier===response.supplier),'rfq_response_audit');
 }
 for(const event of all('rfqMailEvent')){const rfq=get('rfq',event.rfq);check(rfq.suppliers.some(s=>s.id===event.supplier)&&timestamp(event.at)&&['invitation','reissue','reminder','nonresponse'].includes(event.type)&&['uncertain','unavailable','sent','suppressed','recorded','accepted','rejected','delivered'].includes(event.status),'rfq_mail_event');if(event.type==='reminder')check(Date.parse(event.at)>=Date.parse(rfq.reminderAt)&&Date.parse(event.at)<Date.parse(rfq.deadline),'rfq_reminder_before_deadline');if(event.type==='nonresponse')check(Date.parse(event.at)>=Date.parse(rfq.deadline),'rfq_nonresponse_deadline');}
 for(const award of all('quoteAward').filter(a=>a.rfq)){
  const rfq=get('rfq',award.rfq),first=get('rfqResponse',award.firstResponse),winner=get('rfqResponse',award.awardedResponse),firstQuote=get('quote',award.firstQuote),winnerQuote=get('quote',award.awardedQuote),revision=get('revision',award.request+':'+award.revision);
  check(award.request===rfq.request&&award.revision===rfq.revision+1&&[first,winner].every(r=>r.rfq===rfq.id)&&winner.supplier===award.supplier&&first.supplier===award.firstSupplier&&first.currency===winner.currency&&first.currency===award.currency&&revision.rfqAward===award.id,'rfq_award_sources');
  for(const [quote,response]of [[firstQuote,first],[winnerQuote,winner]]){check(quote.id===response.quote&&quote.revision===rfq.revision&&quote.rfq===rfq.id&&quote.sourceResponse===response.id&&quote.sourceSupplier===response.supplier&&quote.supplier===response.supplier&&quote.freightMinor===response.freightMinor&&quote.taxMinor===response.taxMinor&&quote.lines.length===response.lines.length,'rfq_quote_source');for(const l of quote.lines){const original=response.lines.find(x=>x.sourceLine===l.sourceLine);check(original&&['description','quantity','q','unit','partNumber','unitMinor','totalMinor'].every(k=>original[k]===l[k]),'rfq_quote_price');}}
  check(!all('rfqResponse').some(r=>r.rfq===rfq.id&&r.currency===first.currency&&r.offerSequence<first.offerSequence),'rfq_award_baseline');
  check(!all('rfqResponse').some(r=>r.rfq===rfq.id&&r.supplier===winner.supplier&&r.sequence>winner.sequence&&Date.parse(r.at)<=Date.parse(award.at)),'rfq_award_exact_version');
 }
}
