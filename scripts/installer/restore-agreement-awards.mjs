/** Exact confirmed source versions and line schedules survive without granting authority. */
export function validateAgreementAwards(all,get,check,same) {
 const seen=new Set(all('quoteAward').map(a=>a.request+':'+a.revision));
 const money=v=>Number.isSafeInteger(v)&&v>=0&&v<=1e12;
 const extended=(q,cost)=>Number((BigInt(q)*BigInt(cost)+500n)/1000n);
 const canonical=id=>{const seen=new Set();let s=get('supplier',id);while(s.mergedInto){check(!seen.has(s.id),'agreement_award_supplier_cycle');seen.add(s.id);s=get('supplier',s.mergedInto)}return s.id};
 for(const award of all('agreementAward')){
  const key=award.request+':'+award.revision;
  check(!seen.has(key),'agreement_award_duplicate');seen.add(key);
  const r=get('revision',key),a=get('agreement',award.agreement),h=a.history.find(h=>h.version===award.agreementVersion);
  check(Number.isSafeInteger(award.agreementVersion)&&h&&h.confirmedBy&&money(h.firstOfferMinor)&&money(h.valueMinor)&&typeof h.firstOfferSource==='string'&&h.firstOfferSource.trim()&&typeof h.awardSource==='string'&&h.awardSource.trim(),'agreement_award_confirmed_source');
  check(!r.imported&&r.supplier===award.supplier&&r.currency===award.currency&&h.currency===r.currency&&canonical(h.supplier)===canonical(r.supplier),'agreement_award_source');
  check(award.firstOfferSource===h.firstOfferSource&&award.awardSource===h.awardSource&&same(award.reading,h.reading??null),'agreement_award_exact_source');
  check(Array.isArray(h.priceLines)&&h.priceLines.length===r.lines.length&&Array.isArray(award.lines)&&award.lines.length===r.lines.length&&new Set(award.lines.map(l=>l.requestLine)).size===r.lines.length&&new Set(award.lines.map(l=>l.agreementLine)).size===h.priceLines.length,'agreement_award_mapping');
  for(const l of award.lines){const line=r.lines.find(x=>x.id===l.requestLine),price=Number.isSafeInteger(l.agreementLine)&&l.agreementLine>=0?h.priceLines[l.agreementLine]:null;check(line&&price&&l.q===line.q&&l.description===line.description&&l.unit===line.unit&&l.partNumber===line.partNumber&&price.q===line.q&&price.description===line.description&&price.unit===line.unit&&(price.partNumber??'')===(line.partNumber??'')&&money(l.firstUnitMinor)&&money(l.awardedUnitMinor)&&l.firstUnitMinor===price.firstUnitMinor&&l.awardedUnitMinor===price.awardedUnitMinor&&l.awardedUnitMinor===line.unitMinor,'agreement_award_price');}
  check(award.lines.reduce((n,l)=>n+extended(l.q,l.firstUnitMinor),0)===h.firstOfferMinor&&award.lines.reduce((n,l)=>n+extended(l.q,l.awardedUnitMinor),0)===h.valueMinor,'agreement_award_totals');
  check(typeof award.actor==='string'&&award.actor.trim()&&typeof award.reason==='string'&&award.reason.trim()&&typeof award.at==='string'&&Number.isFinite(Date.parse(award.at)),'agreement_award_evidence');
  check(all('audit').some(e=>e.action==='agreement-award'&&e.award===award.id&&e.record===award.request&&e.agreement===a.id&&e.agreementVersion===h.version),'agreement_award_audit');
 }
}
