import { depositsJourney } from './deposits.test.mjs';
import { supplierCreditsJourney } from './supplier-credits.test.mjs';
import test from 'node:test'
import assert from 'node:assert/strict'
import {harness} from './purse-harness.mjs'
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs'

test('AP-003 terms, ordered due bills, expiring discount and weekly cash obligations through native HTTP',async t=>{
 const h=await harness();t.after(()=>h.close());const {command:cmd,state}=h;
 await cmd('business',{name:'Front Range Field Services',currencies:['USD','CAD'],locations:['Denver','Boulder'],costCentres:['Operations','IT'],projects:['Equipment']});
 const requester=await h.member('requester@example.test',['requester']),buyer=await h.member('buyer@example.test',['buyer']),approver=await h.member('approver@example.test',['approver']),receiver=await h.member('receiver@example.test',['receiver']);
 const supplier=await cmd('supplier',{name:'Prairie Equipment Supply',status:'preferred',reason:'Approved equipment vendor'},buyer);
 for(const currency of ['USD','CAD'])await cmd('policy',{name:currency+' Equipment',currency,category:'Equipment',project:'Equipment',approver:'approver@example.test',limitMinor:10000000,budgetMinor:10000000});
 const purchase=async(currency='USD',amount=100000,scope={})=>{
  const r=await cmd('request',{title:'Replacement safety equipment',supplier:supplier.id,currency,needDate:'2026-11-18',location:'Denver',costCentre:'Operations',terms:'Confirmed supplier terms',lines:[{description:'Field safety kit',quantity:'10',unitMinor:amount/10,category:'Equipment',project:'Equipment'}],...scope},requester);
  await cmd('submit',{id:r.id,revision:1},requester);await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Equipment budget approved'},approver);
  const o=await cmd('convert',{id:r.id,revision:1},buyer);await cmd('issue',{id:o.id,revision:1,reason:'Approved supplier document'},buyer);return o;
 };
 const o=await purchase(),i=await cmd('invoice',{order:o.id,reference:'PES-6031',source:'Original supplier PDF',allocations:[{line:o.lines[0].id,quantity:'6',amountMinor:60000}]},buyer);
 let p=await cmd('payable-terms',{invoice:i.id,version:0,invoiceDate:'2026-10-31',term:'2/10 Net 30',reason:'Signed supplier invoice terms'},buyer);
 assert.equal(p.dueDate,'2026-11-30');assert.equal(p.discountDate,'2026-11-10');
 const before=(await state()).data;
 await cmd('approve-payable',{invoice:i.id,version:p.version,reason:'Not received'},buyer,409);assert.deepEqual((await state()).data,before);
 await cmd('payable-terms',{invoice:i.id,version:0,invoiceDate:'2026-10-31',term:'Net 30',reason:'Stale'},buyer,409);
 await cmd('payable-terms',{invoice:i.id,version:p.version,invoiceDate:'2026-02-30',term:'Net 30',reason:'Invalid'},buyer,400);
 await cmd('payable-terms',{invoice:i.id,version:p.version,invoiceDate:'2026-10-31',term:'Net 90',reason:'Unsupported'},buyer,400);
 await cmd('receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'10',reason:'Ten safety kits accepted'},receiver);
 assert.equal((await state()).data.totals.USD,0,'Receiving ledger is unchanged by cash planning');
 p=await cmd('approve-payable',{invoice:i.id,version:p.version,reason:'Invoice and received quantities checked'},buyer);
 await cmd('approve-payable',{invoice:i.id,version:p.version,reason:'Repeat'},buyer,409);
 await cmd('payable-terms',{invoice:i.id,version:p.version,invoiceDate:'2026-11-01',term:'Net 60',reason:'Cannot rewrite approval'},buyer,409);
 let cash=(await state(buyer)).data.cashRequirements;
 assert.equal(cash.bills[0].amountMinor,60000);assert.equal(cash.bills[0].discountMinor,1200);assert.equal(cash.bills[0].week,'2026-11-30');assert.equal(cash.commitments[0].amountMinor,40000,'Received but uninvoiced liability stays in the forecast');
 assert.equal(cash.commitments[0].week,'2026-11-16');assert.equal(cash.commitments[0].basis,'PO need date');
 await cmd('cash-expectation',{order:o.id,version:0,expectedDate:'2026-11-30',reason:'Supplier billing schedule confirmed'},buyer);
 cash=(await state(buyer)).data.cashRequirements;assert.deepEqual(cash.weeks,[{week:'2026-11-30',currency:'USD',billsMinor:60000,commitmentsMinor:40000,totalMinor:100000}]);
 const termCases=[['Net 15','2026-11-15'],['Net 30','2026-11-30'],['Net 60','2026-12-30'],['Due on receipt','2026-10-31']];
 for(const [term,dueDate] of termCases){
  const order=await purchase('USD',10000),invoice=await cmd('invoice',{order:order.id,reference:term,source:'Original '+term,allocations:[{line:order.lines[0].id,quantity:'10',amountMinor:10000}]},buyer);
  for(const flag of invoice.flags??[])await cmd('invoice-risk-review',{invoice:invoice.id,flag:flag.id,version:(await state(buyer)).data.invoice.find(i=>i.id===invoice.id).riskVersion,reason:'Distinct approved PO and original supplier reference for this term case'},buyer);
  await cmd('receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:'10',reason:'Accepted'},receiver);
  const terms=await cmd('payable-terms',{invoice:invoice.id,version:0,invoiceDate:'2026-10-31',term,reason:'Supplier invoice'},buyer);assert.equal(terms.dueDate,dueDate);assert.equal(terms.discountDate,null);
  await cmd('approve-payable',{invoice:invoice.id,version:1,reason:'Reviewed exact evidence'},buyer);
 }
 const foreign=await purchase('CAD',55000);cash=(await state(buyer)).data.cashRequirements;
 assert.deepEqual(cash.bills.map(b=>b.reference),['Due on receipt','Net 15','Net 30','PES-6031','Net 60']);
 assert.equal(cash.weeks.find(w=>w.currency==='CAD').totalMinor,55000);assert.equal(cash.commitments.find(c=>c.order===foreign.id).amountMinor,55000);
 assert.equal((await state(requester)).data.cashRequirements,null);assert.deepEqual((await state(requester)).data.payable,[]);
 const deniedBefore=(await state()).data;
 for(const [op,body] of [['payable-terms',{invoice:i.id,version:p.version,invoiceDate:'2026-10-31',term:'Net 30',reason:'Forged'}],['approve-payable',{invoice:i.id,version:1,reason:'Forged'}],['cash-expectation',{order:o.id,version:1,expectedDate:'2026-12-01',reason:'Forged'}]]){
  await cmd(op,body,requester,403);await cmd(op,body,'',401);
  const denied=await h.send('/api/purse/command/'+op,{...body,actor:'owner',roles:['buyer']},receiver);assert.equal(denied.status,403);
 }
 assert.deepEqual((await state()).data,deniedBefore);
 // AP/finance authority reaches native invoice-source, risk and planning doors within the same grant scope.
 const ap=await h.member('synthetic-ap@example.test',['ap-clerk']),finance=await h.member('synthetic-finance@example.test',['finance-viewer']);
 for(const [email,role]of [['synthetic-ap@example.test','ap-clerk'],['synthetic-finance@example.test','finance-viewer']])await cmd('member',{email,name:email,grants:[{role,scope:{departments:['Operations'],locations:['Denver'],projects:['Equipment'],entities:['main']}}]});
 const scopedOrder=await purchase('USD',12340),outsideOrder=await purchase('USD',43210,{costCentre:'IT',location:'Boulder'});
 await cmd('receipt',{order:scopedOrder.id,line:scopedOrder.lines[0].id,event:'receive',quantity:'10',reason:'Scoped AP received goods'},receiver);
 const originalText=['Supplier: Prairie Equipment Supply','Invoice number: SYNTHETIC-AP-READ','Invoice date: 2026-10-19','Payment terms: Net 30','PO number: '+scopedOrder.number,'Currency: USD','Remit to: Prairie Equipment Supply, 100 Main Street, Denver CO 80202','Item: Field safety kit','Quantity: 10','Unit price: 12.34','Line amount: 123.40','Subtotal: 123.40','Freight: 0.00','Tax: 0.00','Total: 123.40'].join('\n');
 const document={name:'synthetic-ap-invoice.txt',mediaType:'text/plain',base64:Buffer.from(originalText).toString('base64')};
 const source=await cmd('invoice-source',{order:scopedOrder.id,document},ap),reading=await cmd('invoice-extract',{source:source.id},ap);assert.equal(reading.status,'review');
 const confirm={id:reading.id,version:reading.version,reviewed:true,reason:'AP checked the source original',lines:[{id:reading.lines[0].id,orderLine:scopedOrder.lines[0].id}]};
 await cmd('invoice-reading-confirm',{...confirm,reviewed:false},ap,400);await cmd('invoice-reading-confirm',{...confirm,version:0},ap,409);
 await cmd('invoice-reading-edit',{id:reading.id,version:reading.version,changes:[{field:'remitTo',value:'Account: 123456789012'}]},ap,400);
 const confirmed=await cmd('invoice-reading-confirm',confirm,ap),scopedInvoice=(await state(ap)).data.invoice.find(invoice=>invoice.id===confirmed.invoice);
 assert.equal(scopedInvoice.document.sha256,reading.sourceDescriptor.sha256);assert.match(scopedInvoice.remitPostal.value,/100 Main Street/);assert.equal(scopedInvoice.remitPostal.verified,false);
 const remitFlag=scopedInvoice.flags.find(flag=>flag.code==='remit-details-changed');assert.ok(remitFlag);
 const scopedTerms=await cmd('payable-terms',{invoice:scopedInvoice.id,version:0,invoiceDate:'2026-10-19',term:'Net 30',reason:'Scoped AP source terms'},ap);
 await cmd('approve-payable',{invoice:scopedInvoice.id,version:scopedTerms.version,reason:'Unresolved remit hold'},ap,409);
 await cmd('invoice-risk-review',{invoice:scopedInvoice.id,flag:remitFlag.id,version:scopedInvoice.riskVersion,reason:''},ap,400);
 await cmd('invoice-risk-review',{invoice:scopedInvoice.id,flag:remitFlag.id,version:scopedInvoice.riskVersion,reason:'AP reviewed the changed postal payee against the original'},ap);
 await cmd('approve-payable',{invoice:scopedInvoice.id,version:scopedTerms.version,reason:'AP reviewed risk and received quantities'},ap);
 await cmd('cash-expectation',{order:scopedOrder.id,version:0,expectedDate:'2026-11-30',reason:'AP confirmed expected billing'},ap);
 const outsideInvoice=await cmd('invoice',{order:outsideOrder.id,reference:'SYNTHETIC-IT-INVOICE',source:'IT supplier source',allocations:[{line:outsideOrder.lines[0].id,quantity:'10',amountMinor:43210}]},buyer);
 const outsideSource=await cmd('invoice-source',{order:outsideOrder.id,document:{...document,name:'synthetic-it-source.txt',base64:Buffer.from('Private IT invoice source').toString('base64')}},buyer);
 for(const session of [ap,finance]){
  const visible=(await state(session)).data;assert.ok(visible.invoice.some(invoice=>invoice.id===scopedInvoice.id));assert.ok(!visible.invoice.some(invoice=>invoice.id===outsideInvoice.id));assert.ok(!visible.invoiceSource.some(item=>item.id===outsideSource.id));assert.ok(!JSON.stringify(visible.cashRequirements).includes(outsideOrder.id));assert.ok(visible.cashRequirements.bills.some(bill=>bill.invoice===scopedInvoice.id));
  const original=await h.send('/api/purse/download/attachment/'+source.attachment,undefined,session);assert.equal(original.status,200);assert.equal(original.value,originalText);
  assert.equal((await h.send('/api/purse/download/attachment/'+outsideSource.attachment,undefined,session)).status,403);
 }
 assert.equal((await h.send('/api/purse/download/attachment/'+source.attachment,undefined,receiver)).status,403);
 for(const [op,body]of [['invoice-source',{order:scopedOrder.id,document}],['invoice-extract',{source:source.id}],['invoice-risk-review',{invoice:scopedInvoice.id,flag:remitFlag.id,version:2,reason:'Finance cannot write'}],['payable-terms',{invoice:scopedInvoice.id,version:2,invoiceDate:'2026-10-19',term:'Net 30',reason:'Finance cannot write'}],['approve-payable',{invoice:scopedInvoice.id,version:2,reason:'Finance cannot write'}],['cash-expectation',{order:scopedOrder.id,version:1,expectedDate:'2026-12-01',reason:'Finance cannot write'}]])await cmd(op,body,finance,403);
 for(const [op,body]of [['invoice',{order:outsideOrder.id,reference:'SYNTHETIC-OUTSIDE',source:'Out of scope',allocations:[{line:outsideOrder.lines[0].id,quantity:'1',amountMinor:4321}]}],['invoice-source',{order:outsideOrder.id,document}],['invoice-extract',{source:outsideSource.id}],['invoice-risk-review',{invoice:outsideInvoice.id,flag:'synthetic-flag',version:1,reason:'Out of scope'}],['payable-terms',{invoice:outsideInvoice.id,version:0,invoiceDate:'2026-10-19',term:'Net 30',reason:'Out of scope'}],['approve-payable',{invoice:outsideInvoice.id,version:1,reason:'Out of scope'}],['cash-expectation',{order:outsideOrder.id,version:0,expectedDate:'2026-12-01',reason:'Out of scope'}]])await cmd(op,body,ap,403);
 const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(rows),true,'AP-003 planning evidence survives portable graph validation');
 assert.ok((await state()).data.audit.some(a=>a.action==='approve-payable'&&a.record===i.id&&a.approvedMinor===60000));
 await supplierCreditsJourney(t);
 await depositsJourney(t);
});
