const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
const add = (d,n) => new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const terms = ['Net 15','Net 30','Net 60','2/10 Net 30','Due on receipt'];
export function validatePayables(all,get,check) {
 for (const p of all('payable')) {
  const i=get('invoice',p.invoice);check(p.id===i.id && !i.imported && Array.isArray(p.history) && p.history.length>0,'payable_link');
  for(const [index,h] of p.history.entries()) {
   check(h.version===index+1 && validDate(h.invoiceDate) && terms.includes(h.term),'payable_terms');
   check(h.dueDate===add(h.invoiceDate,h.term==='Due on receipt'?0:h.term==='Net 15'?15:h.term==='Net 60'?60:30) && h.discountDate===(h.term==='2/10 Net 30'?add(h.invoiceDate,10):null) && h.discountPercent===(h.term==='2/10 Net 30'?2:0),'payable_dates');
   check(typeof h.actor==='string' && typeof h.reason==='string' && h.reason.trim() && Number.isFinite(Date.parse(h.at)),'payable_history');
  }
  const last=p.history.at(-1);check(['invoiceDate','term','dueDate','discountDate','discountPercent','reason','actor','at'].every(k=>p[k]===last[k]),'payable_snapshot');
  check(p.version===p.history.length+(p.approvedAt?1:0),'payable_version');
  if(p.approvedAt)check(Number.isFinite(Date.parse(p.approvedAt)) && typeof p.approvedBy==='string' && typeof p.approvalReason==='string' && p.approvalReason.trim() && p.approvedMinor===i.totalMinor,'payable_approval');
 }
 for(const e of all('cashExpectation')) {
  const o=get('order',e.order);check(e.id===o.id && o.issuedAt && !o.imported && Array.isArray(e.history) && e.history.length===e.version && e.version>0,'cash_expectation');
  for(const [index,h] of e.history.entries())check(h.version===index+1 && validDate(h.expectedDate) && typeof h.reason==='string' && h.reason.trim() && typeof h.actor==='string' && Number.isFinite(Date.parse(h.at)),'cash_expectation_history');
  check(['expectedDate','reason','actor','at','version'].every(k=>e[k]===e.history.at(-1)[k]),'cash_expectation_snapshot');
 }
}
