import { createHash } from 'node:crypto';
import { containsProtectedInput } from '../../src/purse/protected-context-fields.mjs';

const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
 : value && typeof value === 'object' ? '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
const equal = (a, b) => canonical(a) === canonical(b);
const str = (v, max = 2000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const integer = v => Number.isSafeInteger(v);
const money = v => integer(v) && v >= 0;
const inputMoney = v => money(v) && v <= 1e12;
const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const instant = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const pick = (v, fields) => Object.fromEntries(fields.split(',').filter(k => v[k] !== undefined).map(k => [k, v[k]]));
const fields = {
 agreement: 'version,name,reference,supplier,currency,valueMinor,firstOfferMinor,startDate,endDate,autoRenew,noticeDays,noticeDeadline,owner,priceHistory',
 supplier: 'name,mergedInto', recurringSeries: 'order,request,agreement,status,version,nextDate,endDate,maxOrders,generatedCount',
 order: 'number,request,revision,status,currency,totalMinor,issuedAt,needDate,supplier,amendedBy,lines', request: 'title,revision,status,valuePromise',
 orderClosure: 'order,active,lines', cashExpectation: 'order,version,expectedDate',
 commitment: 'request,revision,currency,amountMinor,event,at', invoice: 'reference,order,currency,totalMinor,hasSourcePayment,flags,riskReviews,allocations,pantry', payable: 'invoice,version,approvedAt,approvedMinor,invoiceDate,term,dueDate,discountDate,discountPercent',
 valueSeatImport: 'request,revision,provider,periodStart,periodEnd,activeRule,sha256,seatCount,activeSeats,provenance',
 valueConfirmation: 'request,revision,usefulness,at,run,runVersion', supplierIssue: 'supplier,order,category,status,at',
 supplierOrderEvidence: 'order,supplier,version,promisedDate,acknowledgedAt', receipt: 'order,line,event,q,quantity,at,valueMinor,mode,percentage,milestone',
};
const evidenceKinds = ['valueSeatImport', 'valueConfirmation', 'supplierIssue', 'supplierOrderEvidence', 'receipt'];
const priceFields = 'version,valueMinor,firstOfferMinor,startDate,endDate,noticeDays,noticeDeadline,at,priceLines';
const priceLineFields = 'description,quantity,q,unit,partNumber,firstUnitMinor,awardedUnitMinor';

/** Historical signatures are custody receipts only. No archived actor, consent
 * or authorityProof may grant a current session or bypass live operator guards.
 * Forecast rows and receipt positions are recomputed from captured primitives,
 * never from today's changed books or a fabricated annual renewal assumption.
 */
export function validateRecurringScenarios(all, get, check) {
 const fail = (ok, label) => check(ok, 'recurring_scenario_' + label);
 const object = (v, label) => { fail(v && typeof v === 'object' && !Array.isArray(v), label); return v; };
 const shape = (v, allowed, label) => { object(v, label); fail(Object.keys(v).every(k => allowed.split(',').includes(k)), label + '_fields'); };
 const array = (v, max, label) => { fail(Array.isArray(v) && v.length <= max, label); return v; };
 const sum = values => { fail(values.every(integer), 'sum_input'); const n = values.reduce((a, b) => a + b, 0); fail(integer(n), 'sum_overflow'); return n; };
 const audit = (action, predicate) => all('audit').some(row => row.action === action && predicate(row));
 const weekday = value => { const d = new Date(value + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };
 for (const scenario of all('recurringScenario')) {
  shape(scenario, 'id,choices,snapshot,hash,mode,model,provider,label,preparedBy,at,status', 'record');
  fail(!containsProtectedInput(scenario), 'protected_context');
  fail(str(scenario.id, 200) && /^[a-f0-9]{64}$/.test(scenario.hash) && scenario.mode === 'deterministic v1' && scenario.model === 'none' && scenario.provider === 'none' && scenario.status === 'proposed' && str(scenario.preparedBy, 200) && instant(scenario.at), 'identity');
  const c = object(scenario.choices, 'choices'), s = object(scenario.snapshot, 'snapshot');
  shape(c, 'kind,agreementIds,from,to,reason,operationalRisk,assumptions,evidence', 'choices');
  fail(['consolidate', 'renegotiate', 'cancel'].includes(c.kind) && day(c.from) && day(c.to) && c.from <= c.to && str(c.reason) && str(c.operationalRisk), 'choice_terms');
  array(c.agreementIds, 20, 'agreements'); fail(c.agreementIds.length > 0 && c.agreementIds.every(id => str(id, 200)) && new Set(c.agreementIds).size === c.agreementIds.length && equal(c.agreementIds, [...c.agreementIds].sort()), 'agreement_ids');
  fail(c.kind !== 'consolidate' || c.agreementIds.length > 1, 'consolidation');
  array(c.assumptions, 100, 'assumptions'); fail(c.assumptions.length > 0, 'assumptions_empty');
  for (const a of c.assumptions) {
   shape(a, 'agreement,order,proposedMinor,proposedCommitmentMinor,expectedDate,reason', 'assumption');
   fail(c.agreementIds.includes(a.agreement) && str(a.reason), 'assumption_agreement');
   if (a.order === null) fail(a.proposedMinor === null && a.proposedCommitmentMinor === null && a.expectedDate === null, 'unknown_forecast');
   else fail(str(a.order, 200) && inputMoney(a.proposedMinor) && inputMoney(a.proposedCommitmentMinor) && day(a.expectedDate) && a.expectedDate >= c.from && a.expectedDate <= c.to, 'assumption_amount');
  }
  fail(equal(c.assumptions, [...c.assumptions].sort((a,b) => a.agreement.localeCompare(b.agreement) || String(a.order).localeCompare(String(b.order)))), 'assumption_order');
  const linked = c.assumptions.filter(a => a.order), unknown = c.assumptions.filter(a => a.order === null);
  fail(new Set(linked.map(a => a.order)).size === linked.length && c.agreementIds.every(id => c.assumptions.some(a => a.agreement === id) && (!unknown.some(a => a.agreement === id) || c.assumptions.filter(a => a.agreement === id).length === 1)), 'assumption_coverage');
  array(c.evidence, 100, 'evidence');
  for (const ref of c.evidence) { shape(ref, 'kind,id', 'evidence'); fail(evidenceKinds.includes(ref.kind) && str(ref.id, 200), 'evidence_kind'); }
  fail(new Set(c.evidence.map(r => r.kind + ':' + r.id)).size === c.evidence.length && equal(c.evidence, [...c.evidence].sort((a,b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))), 'evidence_order');
  shape(s, 'currency,sources,overlaps,agreements,baseline,proposed,effect,unknownForecastAgreements,basis', 'snapshot');
  fail(str(s.currency, 20) && str(s.basis) && get('business', 'main').currencies.includes(s.currency), 'currency');
  array(s.sources, 100000, 'sources');
  const byKey = new Map();
  for (const ref of s.sources) {
   shape(ref, 'kind,id,revision,value', 'source');
   fail(Object.hasOwn(fields, ref.kind) && str(ref.id, 200) && str(ref.revision, 200), 'source_reference');
   const key = ref.kind + ':' + ref.id; fail(!byKey.has(key), 'source_duplicate'); byKey.set(key, ref);
   const original = get(ref.kind, ref.id); fail(!original.imported, 'native_source');
   shape(ref.value, fields[ref.kind], 'source_' + ref.kind);
   if(ref.kind==='order')fail(str(ref.value.number,200),'order_number');
   if(ref.kind==='request')fail(str(ref.value.title),'request_title');
   if(ref.kind==='invoice')fail(str(ref.value.reference),'invoice_reference');
   const nested = ref.kind === 'agreement' ? ['priceHistory'] : ['order','orderClosure'].includes(ref.kind) ? ['lines'] : ref.kind === 'request' ? ['valuePromise'] : ref.kind === 'invoice' ? ['flags','riskReviews','allocations','pantry'] : [];
   fail(Object.entries(ref.value).every(([k,v]) => nested.includes(k) || v === null || ['string','number','boolean'].includes(typeof v)), 'source_scalars');
   if (ref.kind === 'order') for (const line of array(ref.value.lines, 100, 'order_lines')) {
    shape(line, 'id,q,unitMinor,totalMinor,carriedAccepted,carriedCancelled,carriedAcceptedMinor,carriedCancelledMinor,service,position', 'order_line'); fail(str(line.id, 200) && integer(line.q) && line.q > 0 && money(line.unitMinor) && money(line.totalMinor), 'order_line_value');
    for(const field of ['carriedAccepted','carriedCancelled','carriedAcceptedMinor','carriedCancelledMinor'])fail(line[field]===undefined||money(line[field]),'carried_position');
    if(line.service){shape(line.service,'mode','service');fail(['amount','percentage','milestone'].includes(line.service.mode),'service_mode');}
    shape(line.position,'accepted,cancelled,closed,outstanding,acceptedMinor,cancelledMinor,closedMinor,outstandingMinor','line_position');fail(Object.values(line.position).every(integer),'position_values');
   }
   if(ref.kind==='orderClosure'){fail(typeof ref.value.active==='boolean','closure_active');for(const line of array(ref.value.lines,100,'closure_lines')){shape(line,'line,q','closure_line');fail(str(line.line,200)&&money(line.q),'closure_value');}}
   if(ref.kind==='cashExpectation')fail(day(ref.value.expectedDate),'expectation_date');
   if(ref.kind==='receipt')fail(str(ref.value.order,200)&&str(ref.value.line,200)&&['receive','return','cancel','reject'].includes(ref.value.event)&&money(ref.value.q)&&instant(ref.value.at)&&(ref.value.valueMinor===undefined||money(ref.value.valueMinor)),'receipt_inputs');
   if(ref.kind==='invoice'){
    const v=ref.value;fail(typeof v.hasSourcePayment==='boolean','invoice_payment_marker');
    for(const row of array(v.flags,10000,'invoice_flags')){shape(row,'id,code','invoice_flag');fail(str(row.id,200)&&str(row.code,200),'invoice_flag_value');}
    for(const row of array(v.riskReviews,10000,'invoice_reviews')){shape(row,'flag','invoice_review');fail(str(row.flag,200),'invoice_review_value');}
    for(const row of array(v.allocations,10000,'invoice_allocations')){shape(row,'line,q,amountMinor','invoice_allocation');fail(str(row.line,200)&&money(row.q)&&money(row.amountMinor),'invoice_allocation_value');}
    if(v.pantry){shape(v.pantry,'status,openMinor,dueDate,discountDate','invoice_pantry');fail(['draft','posted','void'].includes(v.pantry.status)&&money(v.pantry.openMinor)&&day(v.pantry.dueDate)&&(v.pantry.discountDate==null||day(v.pantry.discountDate)),'invoice_pantry_value');}
   }
   if (ref.kind === 'request' && ref.value.valuePromise != null) {
    const p = ref.value.valuePromise; shape(p, 'kind,seats,needDate,amountMinor,currency', 'promise');
    fail(p.kind === 'seats' && integer(p.seats) && p.seats > 0 || p.kind === 'need-date' && day(p.needDate) || p.kind === 'quoted-saving' && inputMoney(p.amountMinor) && p.currency === s.currency, 'promise_value');
   }
   if (ref.kind === 'agreement') {
    const v = ref.value, history = array(v.priceHistory, 1000000, 'price_history');
    fail(integer(v.version) && v.version > 0 && history.length === v.version && v.currency === s.currency && c.agreementIds.includes(ref.id), 'agreement_version');
    const retained = original.history?.find(h => h.version === v.version); fail(retained, 'retained_agreement_version');
    fail(equal(pick(v, fields.agreement.replace(',priceHistory','')), pick(retained, fields.agreement.replace(',priceHistory',''))), 'agreement_retained_terms');
    for (const [index, h] of history.entries()) {
     shape(h, priceFields, 'price_history'); fail(h.version === index + 1 && day(h.startDate) && day(h.endDate) && day(h.noticeDeadline) && instant(h.at), 'price_history_terms');
     for (const line of array(h.priceLines, 100, 'price_lines')) { shape(line, priceLineFields, 'price_line'); fail(str(line.description) && str(line.unit) && typeof line.quantity === 'string' && integer(line.q) && line.q > 0 && inputMoney(line.firstUnitMinor) && inputMoney(line.awardedUnitMinor) && (line.partNumber == null || str(line.partNumber)), 'price_line_value'); }
     const actual = original.history[index]; fail(actual && equal(h, { ...pick(actual, priceFields.replace(',priceLines','')), priceLines: (actual.priceLines ?? []).map(l => pick(l, priceLineFields)) }), 'price_history_retained');
    }
   }
   if (['commitment','receipt','valueSeatImport','valueConfirmation'].includes(ref.kind)) fail(equal(ref.value, pick(original, fields[ref.kind])), 'immutable_source_value');
  }
  fail(equal(s.sources, [...s.sources].sort((a,b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))), 'source_order');
  const cited = (kind,id) => { const ref = byKey.get(kind + ':' + id); fail(ref, 'cited_' + kind); return ref.value; };
  const family = id => { const seen = new Set(); let current = id; while (true) { fail(!seen.has(current), 'supplier_cycle'); seen.add(current); const row = cited('supplier', current); if (!row.mergedInto) return current; current = row.mergedInto; } };
  const agreements = c.agreementIds.map(id => ({ id, ...cited('agreement',id) }));
  for (const a of agreements) { family(a.supplier); fail(str(a.owner, 200), 'agreement_owner'); }
  const requestIds = new Set(linked.map(a => cited('order', a.order).request)); fail(requestIds.size === linked.length, 'request_lineage');
  const orders = s.sources.filter(r => r.kind === 'order'), orderIds = new Set(orders.map(r => r.id));
  for (const ref of orders) { fail(requestIds.has(ref.value.request) && cited('request',ref.value.request) && ref.value.currency === s.currency, 'order_graph'); const actual = get('order',ref.id); fail(actual.request === ref.value.request && actual.revision === ref.value.revision && !all('orderAdoption').some(a=>a.order===ref.id||a.request===actual.request), 'retained_order_identity'); }
  for(const receipt of all('receipt').filter(r=>orderIds.has(r.order)&&Date.parse(r.at)<=Date.parse(scenario.at)))cited('receipt',receipt.id);
  for(const closure of all('orderClosure').filter(r=>orderIds.has(r.order)&&Date.parse(r.at)<=Date.parse(scenario.at)))cited('orderClosure',closure.id);
  for (const a of linked) {
   const order = cited('order',a.order), agreement = cited('agreement',a.agreement);
   fail(order.issuedAt && !order.amendedBy && ['issued','amendment-pending','cancelled'].includes(order.status) && family(order.supplier) === family(agreement.supplier), 'issued_agreement_order');
   fail(s.sources.some(r => r.kind === 'recurringSeries' && r.value.agreement === a.agreement && (r.value.order === a.order || r.value.request === order.request || get('order',a.order).recurring?.series === r.id)), 'recurring_link');
  }
  for (const ref of s.sources) {
   const v = ref.value;
   if (['request','commitment'].includes(ref.kind)) fail(requestIds.has(ref.kind === 'request' ? ref.id : v.request), 'request_source_graph');
   if (ref.kind === 'invoice') fail(orderIds.has(v.order) && v.currency === s.currency, 'invoice_graph');
   if (ref.kind === 'payable') cited('invoice',v.invoice);
   if (ref.kind === 'recurringSeries') fail(c.agreementIds.includes(v.agreement) && requestIds.has(v.request), 'series_graph');
   if (['receipt','orderClosure','cashExpectation'].includes(ref.kind))fail(orderIds.has(v.order),'position_source_graph');
   if(ref.kind==='receipt')fail(cited('order',v.order).lines.some(l=>l.id===v.line),'receipt_line');
   if(ref.kind==='orderClosure')fail(v.lines.every(l=>cited('order',v.order).lines.some(line=>line.id===l.line)),'closure_line_graph');
   if(ref.kind==='cashExpectation'){const actual=get('cashExpectation',ref.id),retained=actual.history?.find(h=>h.version===v.version);fail(ref.id===v.order&&retained&&retained.expectedDate===v.expectedDate,'expectation_history');}
   if (evidenceKinds.includes(ref.kind)&&ref.kind!=='receipt') fail(c.evidence.some(e => e.kind === ref.kind && e.id === ref.id), 'selected_evidence');
  }
  for (const ref of c.evidence) { const v = cited(ref.kind,ref.id); const request = v.request ?? get('order',v.order).request; fail(requestIds.has(request), 'evidence_graph'); }
  array(s.agreements, 20, 'agreement_summary');
  fail(equal(s.agreements, agreements.map(a => ({id:a.id,owner:a.owner,noticeDeadline:a.noticeDeadline,noticeDueInPeriod:a.noticeDeadline >= c.from && a.noticeDeadline <= c.to,noticeBeforeScenario:a.noticeDeadline < c.from}))), 'notice_summary');
  const overlaps = [];
  for (let l=0;l<agreements.length;l++) for (let r=l+1;r<agreements.length;r++) {
   const a=agreements[l],b=agreements[r],from=[a.startDate,b.startDate,c.from].sort().at(-1),to=[a.endDate,b.endDate,c.to].sort()[0];
   if(from<=to)overlaps.push({agreements:[a.id,b.id],from,to,sameSupplierFamily:family(a.supplier)===family(b.supplier),basis:'Calendar overlap only; functional overlap is the human scenario assumption'});
  }
  fail(equal(s.overlaps,overlaps) && equal(s.unknownForecastAgreements,unknown.map(a=>a.agreement)), 'overlap_unknown');
  const baseline = s.baseline, proposed = s.proposed;
  shape(baseline, 'bills,forecast,commitmentRows,billsMinor,forecastMinor,commitmentsMinor,cashMinor', 'baseline');
  shape(proposed, 'billsMinor,forecastMinor,commitmentsMinor,cashMinor', 'proposed'); shape(s.effect,'cashMinor,commitmentsMinor','effect');
  array(baseline.bills,100000,'bills'); array(baseline.forecast,100,'forecast'); array(baseline.commitmentRows,100,'commitment_rows');
  const eligible=s.sources.filter(r=>r.kind==='payable'&&r.value.approvedAt).filter(r=>{const invoice=cited('invoice',r.value.invoice);return !invoice.flags.some(f=>!invoice.riskReviews.some(review=>review.flag===f.id));});
  const expectedBills=eligible.map(r=>{const p=r.value,i=cited('invoice',p.invoice),dueDate=i.pantry?.dueDate??p.dueDate,amountMinor=i.pantry?.status==='posted'?i.pantry.openMinor:p.approvedMinor;return {invoice:p.invoice,order:i.order,amountMinor,dueDate,week:weekday(dueDate),hasSourcePayment:i.hasSourcePayment};}).filter(r=>!r.hasSourcePayment&&r.amountMinor>0&&r.dueDate>=c.from&&r.dueDate<=c.to).map(({hasSourcePayment,...row})=>row);
  fail(equal([...baseline.bills].sort((a,b)=>a.invoice.localeCompare(b.invoice)),expectedBills.sort((a,b)=>a.invoice.localeCompare(b.invoice))),'bill_recomputation');
  const billIds = new Set();
  for (const bill of baseline.bills) {
   shape(bill,'invoice,order,amountMinor,dueDate,week','bill'); fail(!billIds.has(bill.invoice),'bill_duplicate');billIds.add(bill.invoice);
   const invoice = cited('invoice',bill.invoice); fail(invoice.order===bill.order && money(bill.amountMinor) && day(bill.dueDate) && bill.dueDate>=c.from && bill.dueDate<=c.to && bill.week===weekday(bill.dueDate),'bill_value');
   fail(s.sources.some(r=>r.kind==='payable'&&r.value.invoice===bill.invoice&&r.value.approvedAt&&r.value.approvedMinor>=bill.amountMinor),'bill_approval');
  }
  fail(baseline.forecast.length===linked.length,'forecast_coverage');
  const extended=(q,unit)=>Number((BigInt(q)*BigInt(unit)+500n)/1000n);
  for(const ref of orders)for(const line of ref.value.lines){
   const events=s.sources.filter(r=>r.kind==='receipt'&&r.value.order===ref.id&&r.value.line===line.id).map(r=>r.value);
   const closed=sum(s.sources.filter(r=>r.kind==='orderClosure'&&r.value.order===ref.id&&r.value.active).flatMap(r=>r.value.lines).filter(r=>r.line===line.id).map(r=>r.q));
   let position;
   if(line.service){const acceptedMinor=(line.carriedAcceptedMinor??0)+sum(events.map(r=>r.event==='receive'?(r.valueMinor??extended(r.q,line.unitMinor)):r.event==='return'?-(r.valueMinor??extended(r.q,line.unitMinor)):0));const cancelledMinor=(line.carriedCancelledMinor??0)+sum(events.filter(r=>r.event==='cancel').map(r=>r.valueMinor??extended(r.q,line.unitMinor)));const closedMinor=line.q?Number(BigInt(line.totalMinor)*BigInt(closed)/BigInt(line.q)):0,outstandingMinor=Math.max(0,line.totalMinor-acceptedMinor-cancelledMinor-closedMinor),q=n=>line.totalMinor?Number(BigInt(n)*BigInt(line.q)/BigInt(line.totalMinor)):0;position={acceptedMinor,cancelledMinor,closedMinor,outstandingMinor,accepted:q(acceptedMinor),cancelled:q(cancelledMinor),closed:q(closedMinor),outstanding:q(outstandingMinor)};}
   else{const accepted=(line.carriedAccepted??0)+sum(events.map(r=>r.event==='receive'?r.q:r.event==='return'?-r.q:0)),cancelled=(line.carriedCancelled??0)+sum(events.filter(r=>r.event==='cancel').map(r=>r.q));position={accepted,cancelled,closed,outstanding:line.q-accepted-cancelled-closed};}
   fail(equal(line.position,position),'position_recomputation');
  }
  for(const [i,row] of baseline.forecast.entries()) {
   shape(row,'agreement,order,amountMinor,expectedDate,week,basis,calculation','forecast');
   fail(row.agreement===linked[i].agreement&&row.order===linked[i].order&&money(row.amountMinor)&&row.amountMinor>0&&day(row.expectedDate)&&row.expectedDate>=c.from&&row.expectedDate<=c.to&&row.week===weekday(row.expectedDate)&&['Recorded forecast','PO need date'].includes(row.basis),'forecast_value');
   shape(row.calculation,'baseMinor,activeLineMinor,liabilityMinor,approvedBilledMinor,depositMinor','forecast_calculation');
   const order=cited('order',row.order),baseMinor=sum(order.lines.map(l=>l.totalMinor)),activeLineMinor=sum(order.lines.map(l=>extended(Math.max(0,l.q-l.position.cancelled-l.position.closed),l.unitMinor))),liabilityMinor=baseMinor?Number((BigInt(order.totalMinor)*BigInt(activeLineMinor)+BigInt(baseMinor)/2n)/BigInt(baseMinor)):0;
   const approvedBilledMinor=sum(eligible.filter(r=>{const invoice=cited('invoice',r.value.invoice),o=cited('order',invoice.order);return o.request===order.request&&o.issuedAt;}).map(r=>r.value.approvedMinor));
   const expectation=s.sources.find(r=>r.kind==='cashExpectation'&&r.value.order===row.order);
   fail(equal(row.calculation,{baseMinor,activeLineMinor,liabilityMinor,approvedBilledMinor,depositMinor:0})&&row.amountMinor===Math.max(0,liabilityMinor-approvedBilledMinor)&&row.expectedDate===(expectation?.value.expectedDate??order.needDate)&&row.basis===(expectation?'Recorded forecast':'PO need date'),'forecast_recomputation');
  }
  const commitmentRows=[...requestIds].map(request=>({request,amountMinor:sum(s.sources.filter(r=>r.kind==='commitment'&&r.value.request===request&&r.value.currency===s.currency).map(r=>r.value.amountMinor))}));
  fail(equal(baseline.commitmentRows,commitmentRows)&&commitmentRows.every(r=>money(r.amountMinor)),'commitment_arithmetic');
  const billsMinor=sum(baseline.bills.map(r=>r.amountMinor)),forecastMinor=sum(baseline.forecast.map(r=>r.amountMinor)),commitmentsMinor=sum(commitmentRows.map(r=>r.amountMinor));
  fail(equal(pick(baseline,'billsMinor,forecastMinor,commitmentsMinor,cashMinor'),{billsMinor,forecastMinor,commitmentsMinor,cashMinor:sum([billsMinor,forecastMinor])}),'baseline_arithmetic');
  const proposedForecast=sum(linked.map(a=>a.proposedMinor)),proposedCommitment=sum(linked.map(a=>a.proposedCommitmentMinor));
  fail(equal(proposed,{billsMinor,forecastMinor:proposedForecast,commitmentsMinor:proposedCommitment,cashMinor:sum([billsMinor,proposedForecast])})&&equal(s.effect,{cashMinor:proposedForecast-forecastMinor,commitmentsMinor:proposedCommitment-commitmentsMinor}),'proposed_arithmetic');
  fail(scenario.hash===createHash('sha256').update(canonical({choices:c,snapshot:s})).digest('hex'),'hash');
  fail(audit('recurring-scenario-prepare',a=>a.record===scenario.id&&a.hash===scenario.hash&&a.actor===scenario.preparedBy&&equal(a.agreements,c.agreementIds)),'prepare_audit');
 }
 for(const consent of all('recurringScenarioConsent')) {
  shape(consent,'id,scenario,hash,role,agreement,actor,email,nativeOwner,operatorVersion,reason,at','consent');
  fail(!containsProtectedInput(consent),'consent_protected');
  const scenario=get('recurringScenario',consent.scenario);
  fail(consent.hash===scenario.hash&&['finance','owner'].includes(consent.role)&&str(consent.actor,200)&&str(consent.email,254)&&typeof consent.nativeOwner==='boolean'&&integer(consent.operatorVersion)&&consent.operatorVersion>0&&str(consent.reason)&&instant(consent.at)&&Date.parse(consent.at)>=Date.parse(scenario.at),'consent_signature');
  fail(consent.id===scenario.id+':'+consent.role+':'+(consent.agreement??'finance'),'consent_identity');
  if(consent.role==='owner')fail(consent.nativeOwner&&scenario.snapshot.agreements.some(a=>a.id===consent.agreement&&a.owner===consent.actor),'owner_signature');
  else fail(consent.agreement===null&&!scenario.snapshot.agreements.some(a=>a.owner===consent.actor),'independent_finance');
  fail(audit('recurring-scenario-approve',a=>a.record===scenario.id&&a.hash===scenario.hash&&a.consent===consent.id&&a.actor===consent.actor&&a.role===consent.role&&a.agreement===consent.agreement),'consent_audit');
 }
 for(const draft of all('recurringScenarioDraft')) {
  shape(draft,'id,scenario,hash,kind,binding,sent,actor,at,authorityProofs,text','draft');fail(!containsProtectedInput(draft),'draft_protected');
  const scenario=get('recurringScenario',draft.scenario),c=scenario.choices,s=scenario.snapshot;
  fail(draft.id===scenario.id&&draft.hash===scenario.hash&&draft.binding===false&&draft.sent===false&&str(draft.actor,200)&&instant(draft.at)&&draft.kind===(c.kind==='cancel'?'cancellation-brief':'negotiation-brief'),'draft_identity');
  const consents=all('recurringScenarioConsent').filter(r=>r.scenario===scenario.id&&r.hash===scenario.hash);
  fail(consents.some(r=>r.role==='finance')&&c.agreementIds.every(id=>consents.some(r=>r.role==='owner'&&r.agreement===id))&&consents.every(r=>Date.parse(r.at)<=Date.parse(draft.at)),'draft_consents');
  array(draft.authorityProofs,21,'draft_signatures');for(const p of draft.authorityProofs)shape(p,'actor,operatorVersion,owner','draft_signature');
  const signatures=consents.map(r=>({actor:r.actor,operatorVersion:r.operatorVersion,owner:r.nativeOwner}));
  fail(equal([...draft.authorityProofs].sort((a,b)=>canonical(a).localeCompare(canonical(b))),signatures.sort((a,b)=>canonical(a).localeCompare(canonical(b)))),'draft_signatures');
  const agreementLabel=id=>{const terms=s.sources.find(r=>r.kind==='agreement'&&r.id===id).value;return `${terms.name} (${terms.reference})`;};
  const absolute=BigInt(Math.abs(s.effect.cashMinor)),cashText=`${s.currency} ${s.effect.cashMinor<0?'-':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`;
  const body=['NONBINDING DRAFT — human review and separate sending required.',`Scenario ${scenario.hash}`,`Action: ${c.kind}`,...s.agreements.map(r=>`${agreementLabel(r.id)}: notice deadline ${r.noticeDeadline}.`),`Assumption reason: ${c.reason}`,`Operational risk: ${c.operationalRisk}`,`Hypothetical cash change: ${cashText}. Unknown forecasts: ${s.unknownForecastAgreements.map(agreementLabel).join(', ')||'none'}.`,'No commitment, forecast, agreement, purchase order, supplier communication or cancellation has been changed.'].join('\n');
  fail(draft.text===body&&audit('recurring-scenario-draft',a=>a.record===scenario.id&&a.hash===scenario.hash&&a.kind===draft.kind&&a.actor===draft.actor),'draft_body_audit');
 }
}
