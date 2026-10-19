/** Quote awards carry source links, never fresh purchasing authority on restore. */
export function validateQuoteAwards(all,get,check) {
 const seen=new Set();
 for(const award of all('quoteAward')){
  const r=get('revision',award.request+':'+award.revision),first=get('quote',award.firstQuote),winner=get('quote',award.awardedQuote);
  const key=award.request+':'+award.revision;
  check(!seen.has(key),'award_duplicate');seen.add(key);
  check(!r.imported&&[first,winner].every(q=>q.request===award.request&&q.revision===(award.rfq?get('rfq',award.rfq).revision:award.revision)&&(q.supplier===r.supplier||award.rfq&&q.id===first.id&&q.supplier===award.firstSupplier)&&q.currency===r.currency),'award_sources');
  check(award.supplier===r.supplier&&award.currency===r.currency&&Number.isSafeInteger(first.sequence)&&(first.sequence<winner.sequence||award.rfq&&first.id===winner.id),'award_chronology');
  if(!award.rfq)check(all('quote').filter(q=>q.request===r.request&&q.revision===r.revision&&(q.supplier===r.supplier||award.rfq&&q.id===first.id&&q.supplier===award.firstSupplier)&&q.currency===r.currency).every(q=>!Number.isSafeInteger(q.sequence)||q.sequence>=first.sequence),'award_baseline');
  check(first.lines.length===r.lines.length&&winner.lines.length===r.lines.length&&Array.isArray(award.lines)&&award.lines.length===r.lines.length,'award_lines');
  for(const field of ['requestLine','firstLine','awardedLine'])check(new Set(award.lines.map(l=>l[field])).size===r.lines.length,'award_mapping');
  for(const l of award.lines){const rl=r.lines.find(x=>x.id===l.requestLine),f=first.lines.find(x=>x.id===l.firstLine),w=winner.lines.find(x=>x.id===l.awardedLine);check(rl&&f&&w&&[f,w].every(x=>x.q===rl.q&&x.description===rl.description&&x.unit===rl.unit&&x.partNumber===rl.partNumber)&&w.unitMinor===rl.unitMinor,'award_price');}
  check(typeof award.actor==='string'&&typeof award.reason==='string'&&award.reason.trim()&&Number.isFinite(Date.parse(award.at)),'award_evidence');
  check(all('audit').some(e=>e.action==='quote-award'&&e.award===award.id&&e.record===award.request),'award_audit');
 }
}
