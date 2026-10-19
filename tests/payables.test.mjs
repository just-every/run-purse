import test from 'node:test'
import assert from 'node:assert/strict'
import {harness} from './purse-harness.mjs'
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs'

test('AP-003 terms, ordered due bills, expiring discount and weekly cash obligations through native HTTP',async t=>{
 const h=await harness();t.after(()=>h.close());const {command:cmd,state}=h;
 await cmd('business',{name:'Front Range Field Services',currencies:['USD','CAD'],locations:['Denver'],costCentres:['Operations'],projects:['Equipment']});
 const requester=await h.member('requester@example.test',['requester']),buyer=await h.member('buyer@example.test',['buyer']),approver=await h.member('approver@example.test',['approver']),receiver=await h.member('receiver@example.test',['receiver']);
 const supplier=await cmd('supplier',{name:'Prairie Equipment Supply',status:'preferred',reason:'Approved equipment vendor'},buyer);
 for(const currency of ['USD','CAD'])await cmd('policy',{name:currency+' Equipment',currency,category:'Equipment',project:'Equipment',approver:'approver@example.test',limitMinor:10000000,budgetMinor:10000000});
 const purchase=async(currency='USD',amount=100000)=>{
  const r=await cmd('request',{title:'Replacement safety equipment',supplier:supplier.id,currency,needDate:'2026-11-18',location:'Denver',costCentre:'Operations',terms:'Confirmed supplier terms',lines:[{description:'Field safety kit',quantity:'10',unitMinor:amount/10,category:'Equipment',project:'Equipment'}]},requester);
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
 const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(rows),true,'AP-003 planning evidence survives portable graph validation');
 assert.ok((await state()).data.audit.some(a=>a.action==='approve-payable'&&a.record===i.id&&a.approvedMinor===60000));
});
