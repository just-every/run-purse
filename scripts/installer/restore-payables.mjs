const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
const add = (d,n) => new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const terms = ['Net 15','Net 30','Net 60','2/10 Net 30','Due on receipt'];
export function validatePayables(all,get,check) {
 for (const p of all('payable')) {
  const i=get('invoice',p.invoice);check(p.id===i.id && (!i.imported || i.adoptedVia && i.sourceConfirmation==='confirmed') && (!i.supplierSubmission || i.sourceConfirmation==='confirmed') && Array.isArray(p.history) && p.history.length>0,'payable_link');
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
  const o=get('order',e.order);check(e.id===o.id && (o.issuedAt || o.adoption) && Array.isArray(e.history) && e.history.length===e.version && e.version>0,'cash_expectation');
  for(const [index,h] of e.history.entries())check(h.version===index+1 && validDate(h.expectedDate) && typeof h.reason==='string' && h.reason.trim() && typeof h.actor==='string' && Number.isFinite(Date.parse(h.at)),'cash_expectation_history');
  check(['expectedDate','reason','actor','at','version'].every(k=>e[k]===e.history.at(-1)[k]),'cash_expectation_snapshot');
 }
}

// Rule history is portable evidence. Its native execution grant is deliberately absent.
export function validateMatching(all,get,check) {
 for(const rule of all('matchingRule')) {
  check(Array.isArray(rule.history)&&rule.history.length===rule.version&&rule.version>0,'matching_rule_history');
  for(const [index,h] of rule.history.entries()) {
   check(h.version===index+1&&typeof h.enabled==='boolean'&&typeof h.supplier==='string'&&typeof h.category==='string'&&(h.supplier!=='*'||h.category!=='*')&&typeof h.currency==='string'&&h.receiptRequired===true&&typeof h.actor==='string'&&Number.isSafeInteger(h.operatorVersion)&&h.operatorVersion>0&&h.reason?.trim()&&Number.isFinite(Date.parse(h.at)),'matching_rule');
   for(const field of ['priceBps','quantityBps','priceMinor','quantityMinor'])check(Number.isSafeInteger(h[field])&&h[field]>=0&&h[field]<=(field.endsWith('Bps')?10000:1e12),'matching_tolerance');
   if(h.supplier!=='*')get('supplier',h.supplier);
   check(all('audit').some(e=>e.action==='matching-rule'&&e.record===rule.id&&e.snapshot?.version===h.version&&e.actor===h.actor),'matching_rule_audit');
  }
  check(Object.keys(rule.history.at(-1)).every(key=>JSON.stringify(rule[key])===JSON.stringify(rule.history.at(-1)[key])),'matching_rule_snapshot');
 }
 for(const invoice of all('invoice')) {
  const approval=invoice.paymentApproval;if(approval?.kind!=='native-matching')continue;
  const order=get('order',invoice.order),reading=get('invoiceReading',approval.reading);
  check(approval.invoice===invoice.id&&approval.order===order.id&&approval.revision===order.revision&&approval.amountMinor===invoice.totalMinor&&approval.currency===invoice.currency&&approval.documentSha256===invoice.document?.sha256&&reading.status==='confirmed'&&reading.invoice===invoice.id&&invoice.confirmedReading===reading.id&&invoice.sourceConfirmation==='confirmed'&&approval.match==='three-way'&&Date.parse(approval.at)>=Date.parse(reading.confirmedAt)&&approval.lines.length===invoice.allocations.length,'matching_approval');
  for(const line of approval.lines) {
   const rule=get('matchingRule',line.rule),snapshot=rule.history.find(h=>h.version===line.ruleVersion),allocation=invoice.allocations.find(l=>l.line===line.line),sourceLine=order.lines.find(l=>l.id===line.line);
   check(snapshot?.enabled&&JSON.stringify(snapshot)===JSON.stringify(line.ruleSnapshot)&&snapshot.currency===invoice.currency&&(snapshot.supplier==='*'||snapshot.supplier===order.supplier)&&(snapshot.category==='*'||snapshot.category===sourceLine?.category)&&line.q===allocation?.q&&line.acceptedQ>=line.q&&line.billedMinor===reading.amounts.lines[invoice.allocations.indexOf(allocation)].amountMinor,'matching_approval_rule');
   const delta=Math.abs(line.billedMinor-line.expectedMinor);
   check(line.expectedMinor===Number((BigInt(line.q)*BigInt(sourceLine.unitMinor)+500n)/1000n)&&delta<=snapshot.priceMinor&&BigInt(delta)*10000n<=BigInt(line.expectedMinor)*BigInt(snapshot.priceBps),'matching_approval_tolerance');
  }
  check(all('audit').some(e=>e.action==='invoice-matched-approved'&&e.record===invoice.id&&e.documentSha256===approval.documentSha256&&e.at===approval.at),'matching_approval_audit');
 }
}
