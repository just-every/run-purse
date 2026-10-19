import test from 'node:test'
import assert from 'node:assert/strict'
import {harness} from './purse-harness.mjs'

test('SUPPLIER-005 supplier scorecards drill to delivery, quality, distinct invoice exceptions, acknowledgments, spend and reasoned issues', async t => {
  const h = await harness()
  t.after(() => h.close())
  const {command: cmd, state, send} = h
  await cmd('business', {name:'Summit field services',currencies:['USD','EUR'],locations:['Denver'],costCentres:['Operations'],projects:['Equipment']})
  const requester = await h.member('requester@example.test',['requester'])
  const approver = await h.member('approver@example.test',['approver'])
  const buyer = await h.member('buyer@example.test',['buyer'])
  const receiver = await h.member('receiver@example.test',['receiver'])
  const buyerId = (await state(buyer)).actor.id
  const supplier = await cmd('supplier',{name:'Summit Field Equipment',status:'preferred',reason:'Approved equipment distributor'},buyer)
  const other = await cmd('supplier',{name:'Alternative Field Equipment',status:'active',reason:'Approved alternative'},buyer)
  for (const currency of ['USD','EUR']) await cmd('policy',{name:`${currency} equipment budget`,currency,category:'Equipment',project:'Equipment',approver:'approver@example.test',limitMinor:1000000,budgetMinor:1000000})
  const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0,10)
  const purchase = async ({title,currency='USD',lines,issue=true,freightMinor=0,taxMinor=0}) => {
    const r = await cmd('request',{title,supplier:supplier.id,currency,needDate:day(7),location:'Denver',costCentre:'Operations',terms:'Supplier quotation; net 30',freightMinor,taxMinor,
      lines:lines.map(line=>({...line,category:'Equipment',project:'Equipment'}))},requester)
    await cmd('submit',{id:r.id,revision:r.revision},requester)
    await cmd('decision',{id:r.id,revision:r.revision,decision:'approved',reason:'Equipment budget reviewed'},approver)
    const o = await cmd('convert',{id:r.id,revision:r.revision},buyer)
    return issue ? cmd('issue',{id:o.id,revision:o.revision,reason:'PO issued through existing supplier channel'},buyer) : o
  }
  const late = await purchase({title:'Repair kits and meters',lines:[{description:'Repair kit',quantity:'4',unitMinor:5000},{description:'Meter',quantity:'2',unitMinor:2500}],freightMinor:800,taxMinor:1200})
  const timely = await purchase({title:'Safety equipment',lines:[{description:'Safety pack',quantity:'2',unitMinor:8000}]})
  const unknown = await purchase({title:'Spare parts without delivery confirmation',lines:[{description:'Spare part',quantity:'1',unitMinor:1000}]})
  const euro = await purchase({title:'European tooling',currency:'EUR',lines:[{description:'Metric tooling',quantity:'1',unitMinor:7000}]})
  const prepared = await purchase({title:'Prepared document awaiting issuance',lines:[{description:'Additional kit',quantity:'1',unitMinor:5000}],issue:false})
  const initial = {order:late.id,version:0,promisedDate:day(-1),source:'Supplier email confirming delivery yesterday'}
  const first = await cmd('supplier-order-evidence',initial,buyer)
  assert.equal(first.acknowledgedAt,null,'Recording a promise must not fabricate an acknowledgment')
  const acknowledgedAt = new Date().toISOString()
  const current = await cmd('supplier-order-evidence',{...initial,version:first.version,acknowledgedAt,source:'Supplier email and telephone acknowledgment recorded by buyer',actor:'forged'},buyer)
  assert.equal(current.history.length,2)
  assert.equal(current.history[0].source,initial.source)
  assert.equal(current.history[0].acknowledgedAt,null)
  assert.equal(current.actor,buyerId)
  assert.equal(current.acknowledgedAt,acknowledgedAt)
  await cmd('supplier-order-evidence',{order:timely.id,version:0,promisedDate:day(1),acknowledgedAt:'',source:'Supplier confirmed tomorrow; acknowledgment time not retained'},buyer)
  const receive = (o,line,quantity,event='receive',reason='Delivery inspected and accepted') => cmd('receipt',{order:o.id,line:o.lines[line].id,quantity,event,reason},receiver)
  const lateReceipt = await receive(late,0,'2')
  const lateMeter = await receive(late,1,'1')
  const rejection = await receive(late,0,'1','reject','One repair kit damaged on arrival')
  const returned = await receive(late,0,'1','return','Accepted kit returned for a defective connector')
  const timelyReceipt = await receive(timely,0,'2')
  const unknownReceipt = await receive(unknown,0,'1')
  const exceptionInput = {order:late.id,reference:'SUMMIT-1042',source:'Supplier invoice PDF; two allocation discrepancies',allocations:[{line:late.lines[0].id,quantity:'2',amountMinor:10500},{line:late.lines[1].id,quantity:'1',amountMinor:2600}]}
  const exceptionInvoice = await cmd('invoice',exceptionInput,buyer)
  assert.equal((await cmd('invoice',exceptionInput,buyer)).id,exceptionInvoice.id)
  const matchedInvoice = await cmd('invoice',{order:timely.id,reference:'SUMMIT-1043',source:'Supplier invoice PDF matching accepted safety packs',allocations:[{line:timely.lines[0].id,quantity:'2',amountMinor:16000}]},buyer)
  const issueRecords = []
  for (const [category,description] of [['late','Repair kits arrived after the supplier promise'],['damaged','Repair kit connector damaged'],['wrong-item','Meter packaging carried the wrong model number'],['billing','Invoice contains two price discrepancies']]) {
    issueRecords.push(await cmd('supplier-issue',{supplier:supplier.id,order:late.id,category,description,actor:'forged'},buyer))
  }
  const resolved = await cmd('resolve-supplier-issue',{id:issueRecords[1].id,reason:'Supplier accepted the return and confirmed a replacement',actor:'forged'},buyer)
  assert.equal(resolved.status,'resolved')
  assert.equal(resolved.resolution.actor,buyerId)
  assert.ok(resolved.resolution.at)
  assert.equal(resolved.resolution.reason,'Supplier accepted the return and confirmed a replacement')

  const data = (await state(buyer)).data
  const card = data.supplierScorecards.find(s=>s.supplier===supplier.id)
  assert.ok(card)
  assert.equal(card.delivery.onTime,1)
  assert.equal(card.delivery.late,2)
  assert.equal(card.delivery.unknownPromise,1)
  assert.equal(card.delivery.measured,3)
  assert.equal(card.delivery.rate,1/3)
  assert.deepEqual(new Set(card.delivery.rows.map(r=>r.receiptId)),new Set([lateReceipt.id,lateMeter.id,timelyReceipt.id,unknownReceipt.id]))
  assert.equal(card.delivery.rows.find(r=>r.receiptId===unknownReceipt.id).onTime,null)
  assert.equal(card.delivery.rows.find(r=>r.receiptId===lateReceipt.id).evidenceVersion,current.version)
  assert.equal(card.quality.rejected,1)
  assert.equal(card.quality.returned,1)
  assert.equal(card.quality.rejectedQ,1000)
  assert.equal(card.quality.returnedQ,1000)
  assert.deepEqual(new Set(card.quality.rows.map(r=>r.receiptId)),new Set([rejection.id,returned.id]))
  assert.equal(card.invoiceAccuracy.total,2)
  assert.equal(card.invoiceAccuracy.exceptions,1,'Several exceptions on one invoice count as one exception invoice')
  assert.equal(card.invoiceAccuracy.matched,1)
  assert.equal(card.invoiceAccuracy.rate,0.5)
  const exception = card.invoiceAccuracy.rows.find(r=>r.invoiceId===exceptionInvoice.id)
  assert.equal(exception.orderId,late.id)
  assert.equal(exception.allocations.length,2)
  assert.ok(exception.allocations.every(r=>r.invoiceId===exceptionInvoice.id&&r.priceMismatch))
  assert.equal(card.invoiceAccuracy.rows.find(r=>r.invoiceId===matchedInvoice.id).exception,false)
  assert.equal(card.acknowledgment.known,1)
  assert.equal(card.acknowledgment.unknown,3)
  const ack = card.acknowledgment.rows.find(r=>r.orderId===late.id)
  assert.equal(ack.elapsedMs,Date.parse(acknowledgedAt)-Date.parse(late.issuedAt))
  assert.equal(card.acknowledgment.averageMs,ack.elapsedMs)
  assert.equal(ack.evidenceId,late.id)
  assert.equal(card.spend.find(s=>s.currency==='USD').orderedCommittedMinor,44000)
  assert.equal(card.spend.find(s=>s.currency==='USD').invoicedEvidenceMinor,29100)
  assert.equal(card.spend.find(s=>s.currency==='EUR').orderedCommittedMinor,7000)
  assert.equal(card.spend.find(s=>s.currency==='EUR').invoicedEvidenceMinor,0)
  assert.equal(card.spend.find(s=>s.currency==='USD').orders.find(o=>o.orderId===prepared.id).included,false)
  assert.deepEqual(new Set(card.spend.find(s=>s.currency==='USD').invoices.map(i=>i.invoiceId)),new Set([exceptionInvoice.id,matchedInvoice.id]))
  assert.equal(card.issues.open,3)
  assert.equal(card.issues.resolved,1)
  assert.ok(card.issues.rows.every(i=>i.orderId===late.id&&i.actor===buyerId))
  assert.equal(card.issues.rows.find(i=>i.issueId===resolved.id).resolution.reason,resolved.resolution.reason)
  assert.equal(card.orders.find(o=>o.orderId===late.id).evidence.history.length,2)
  assert.ok(card.orders.some(o=>o.orderId===euro.id))
  const empty = data.supplierScorecards.find(s=>s.supplier===other.id)
  assert.equal(empty.delivery.rate,null)
  assert.equal(empty.invoiceAccuracy.rate,null)
  assert.equal(empty.acknowledgment.averageMs,null)
  for (const cookie of [requester,receiver,approver]) {
    const scoped = (await state(cookie)).data
    for (const kind of ['supplierScorecards','supplierOrderEvidence','supplierIssue']) assert.equal(scoped[kind]?.length ?? 0,0)
  }
  assert.equal((await send('/api/purse/state')).status,401)

  const before = (await state()).data
  const denied = async (op,input,cookie,status) => cmd(op,input,cookie,status)
  for (const op of ['supplier-order-evidence','supplier-issue','resolve-supplier-issue']) {
    const input = op==='supplier-order-evidence' ? {...initial,version:current.version} : op==='supplier-issue' ? {supplier:supplier.id,order:late.id,category:'late',description:'Late delivery'} : {id:issueRecords[0].id,reason:'Reviewed'}
    await denied(op,{...input,actor:'owner',role:'buyer'},requester,403)
    assert.equal((await send('/api/purse/command/'+op,input)).status,401)
  }
  await denied('supplier-order-evidence',initial,buyer,409)
  await denied('supplier-order-evidence',{...initial,order:prepared.id},buyer,409)
  await denied('supplier-order-evidence',{...initial,version:current.version,promisedDate:'2026-02-30'},buyer,400)
  await denied('supplier-order-evidence',{...initial,version:current.version,source:' '},buyer,400)
  for (const invalid of ['2026-02-30T12:00:00Z','yesterday',new Date(Date.parse(late.issuedAt)-1).toISOString(),new Date(Date.now()+86400000).toISOString()]) {
    await denied('supplier-order-evidence',{...initial,version:current.version,acknowledgedAt:invalid},buyer,400)
  }
  await denied('supplier-issue',{supplier:other.id,order:late.id,category:'late',description:'Wrong supplier'},buyer,409)
  await denied('supplier-issue',{supplier:supplier.id,order:prepared.id,category:'late',description:'Not issued'},buyer,409)
  await denied('supplier-issue',{supplier:supplier.id,order:late.id,category:'other',description:'Unsupported category'},buyer,400)
  await denied('supplier-issue',{supplier:supplier.id,order:late.id,category:'late',description:' '},buyer,400)
  await denied('resolve-supplier-issue',{id:issueRecords[0].id,reason:' '},buyer,400)
  await denied('resolve-supplier-issue',{id:resolved.id,reason:'Repeated resolution'},buyer,409)
  assert.deepEqual((await state()).data,before,'Unauthorized, invalid and stale mutations must leave all domain state unchanged')
  const events = before.audit.filter(e=>['supplier-order-evidence','supplier-issue','resolve-supplier-issue'].includes(e.action))
  assert.equal(events.length,8)
  assert.ok(events.every(e=>e.actor===buyerId&&e.at))
})
