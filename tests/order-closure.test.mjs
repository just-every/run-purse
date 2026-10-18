import test from 'node:test'
import assert from 'node:assert/strict'
import {harness} from './purse-harness.mjs'

test('PO-010 buyer closes whole, line and partial balances, invoices become exceptions, and reopen checks authority and budget',async t=>{
 const h=await harness();t.after(()=>h.close());const {command:cmd,state,send}=h;
 await cmd('business',{name:'Summit office',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Office']});
 const requester=await h.member('requester@example.test',['requester']),approver=await h.member('approver@example.test',['approver']),buyer=await h.member('buyer@example.test',['buyer']),receiver=await h.member('receiver@example.test',['receiver']);
 const supplier=await cmd('supplier',{name:'Summit Office Supply',status:'preferred',reason:'Office supplier'},buyer);
 const policy=await cmd('policy',{name:'Office budget',currency:'USD',category:'Office',project:'Office',approver:'approver@example.test',limitMinor:10000,budgetMinor:10000});
 const draft={title:'Office chairs',supplier:supplier.id,currency:'USD',needDate:'2026-01-01',location:'Denver',costCentre:'Operations',lines:[{description:'Chair',quantity:'10',unitMinor:1000,category:'Office',project:'Office'}],terms:'Net 30'};
 const purchase=async input=>{const r=await cmd('request',{...draft,...input},requester);await cmd('submit',{id:r.id,revision:1},requester);await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Office budget reviewed'},approver);const o=await cmd('convert',{id:r.id,revision:1},buyer);await cmd('issue',{id:o.id,revision:1,reason:'Existing supplier channel'},buyer);return {r,o}};
 const {r,o}=await purchase({});const line=o.lines[0].id;
 await cmd('receipt',{order:o.id,line,event:'receive',quantity:'8',reason:'Eight chairs accepted'},receiver);
 assert.equal((await state()).data.totals.USD,2000);
 const before=(await state()).data, outboxBefore=h.messages.length;
 await cmd('close-order',{id:o.id,version:0,reason:'Short shipment written off'},requester,403);
 await cmd('close-order',{id:o.id,version:0,reason:''},buyer,400);
 assert.deepEqual((await state()).data,before);
 await cmd('close-order',{id:o.id,version:0,reason:'Short shipment written off'},buyer);
 let data=(await state()).data;assert.equal(data.totals.USD,0);assert.equal(data.order.find(z=>z.id===o.id).status,'closed');assert.equal(data.order.find(z=>z.id===o.id).positions[0].outstanding,0);assert.equal(data.order.find(z=>z.id===o.id).positions[0].closed,2000);
 await cmd('receipt',{order:o.id,line,event:'receive',quantity:'1',reason:'Closed balance'},receiver,409);
 const invoice=await cmd('invoice',{order:o.id,reference:'SUMMIT-10',source:'Supplier PDF',allocations:[{line,quantity:'10',amountMinor:10000}]},buyer);assert.equal(invoice.status,'exception');assert.match(invoice.exception,/closed PO balance/);assert.equal((await state()).data.discrepancies.find(d=>d.invoiceId===invoice.id).closedBalance,true);
 await cmd('reopen-order',{id:o.id,version:0,reason:'Stale'},buyer,409);
 await cmd('member',{email:'approver@example.test',name:'Departed approver',roles:[],active:false});
 await cmd('reopen-order',{id:o.id,version:1,reason:'No current authority'},buyer,409);
 await cmd('member',{email:'approver@example.test',name:'Approver',roles:['approver'],active:true});
 const other=await purchase({title:'Budget used elsewhere'});
 const closedState=(await state()).data;
 await cmd('reopen-order',{id:o.id,version:1,reason:'No budget'},buyer,409);assert.deepEqual((await state()).data,closedState);
 await cmd('close-order',{id:other.o.id,version:0,reason:'Free the other reservation'},buyer);
 const outcomes=await Promise.all([1,2].map(()=>send('/api/purse/command/reopen-order',{id:o.id,version:1,reason:'Supplier will complete'},buyer)));assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,409]);
 data=(await state()).data;assert.equal(data.totals.USD,2000);assert.equal(data.order.find(z=>z.id===o.id).status,'issued');assert.equal(data.commitment.filter(e=>e.request===r.id&&e.kind==='reopen-reservation').length,1);
 await cmd('close-order',{id:o.id,version:2,line,quantity:'1',reason:'Close part of the line'},buyer);assert.equal((await state()).data.totals.USD,1000);
 await cmd('close-order',{id:o.id,version:3,line,reason:'Close the rest of the line'},buyer);assert.equal((await state()).data.totals.USD,0);
 await cmd('reopen-order',{id:o.id,version:4,reason:'Reopen both balances'},buyer);assert.equal((await state()).data.totals.USD,2000);
 const events=(await state()).data.audit.filter(e=>e.record===o.id&&['close-order','reopen-order'].includes(e.action));assert.equal(events.length,5);assert.ok(events.every(e=>e.actor&&e.at&&e.reason));
 assert.equal(h.messages.length,outboxBefore,'Closure and reopen send no supplier messages');
});
