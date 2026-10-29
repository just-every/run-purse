
import assert from 'node:assert/strict'
import {harness} from './purse-harness.mjs'

export async function performance_reportFlow(){
{
 // REPORT-003 public performance measures drill to exact events and approved quote/invoice savings, never unsigned discounts
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const h=await harness();t.after(()=>h.close());const cmd=h.command;
 await cmd('business',{name:'Canyon Field Services',currencies:['USD','CAD'],locations:['Denver'],costCentres:['Operations'],projects:['Safety']});
 const requester=await h.member('requester@example.test',['requester']),approver=await h.member('approver@example.test',['approver']),buyer=await h.member('buyer@example.test',['buyer']);
 const supplier=await cmd('supplier',{name:'Canyon Equipment',status:'preferred',reason:'Recorded supplier',contacts:[{name:'Sales',email:'sales@canyon.example.test'}],contractRef:'Safety-2026'});
 for(const currency of ['USD','CAD'])await cmd('policy',{name:currency+' authority',currency,category:'*',project:'*',approver:'approver@example.test',limitMinor:3000000,budgetMinor:9000000});
 async function report(cookie=buyer){const r=await h.send('/api/purse/performance-report',undefined,cookie);assert.equal(r.status,200,JSON.stringify(r.value));return r.value}
 assert.equal((await report()).requestToPo.averageMs,null);
 const draft={title:'Ten safety sets',supplier:supplier.id,currency:'USD',needDate:'2026-11-30',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Safety set',quantity:'10',unitMinor:90000,category:'Equipment',project:'Safety'}]};
 const request=await cmd('request',draft,requester);
 async function quotes(r,input){const first=await cmd('quote',{...input,request:r.id,source:'First signed supplier offer',freightMinor:0,taxMinor:0,lines:input.lines.map(l=>({...l,unitMinor:100000}))},requester);const winner=await cmd('quote',{...input,request:r.id,source:'Negotiated supplier offer',freightMinor:0,taxMinor:0},requester);return {first,winner}}
 const {first,winner}=await quotes(request,draft),awardInput={request:request.id,revision:1,firstQuote:first.id,awardedQuote:winner.id,reason:'Buyer accepted negotiated supplier price',lines:[{requestLine:request.lines[0].id,firstLine:first.lines[0].id,awardedLine:winner.lines[0].id}]};
 await cmd('quote-award',awardInput,requester,403);
 await cmd('quote-award',{...awardInput,lines:[{...awardInput.lines[0],requestLine:'unrelated'}]},buyer,400);
 const award=await cmd('quote-award',awardInput,buyer);await cmd('quote-award',awardInput,buyer,409);
 assert.equal((await report()).savings.totals.length,0,'buyer award alone is not purchasing approval');
 await cmd('submit',{id:request.id,revision:1},requester);await cmd('decision',{id:request.id,revision:1,decision:'approved',reason:'Budget and terms checked'},approver);
 let r=await report();assert.equal(r.savings.totals[0].negotiatedMinor,100000);assert.equal(r.savings.totals[0].realizedMinor,0);assert.equal(r.savings.rows[0].award,award.id);assert.equal(r.savings.rows[0].firstQuote,first.id);assert.equal(r.savings.rows[0].awardedQuote,winner.id);
 const order=await cmd('convert',{id:request.id,revision:1},buyer);await cmd('issue',{id:order.id,revision:1,reason:'Issued in existing supplier channel'},buyer);
 await cmd('supplier-order-evidence',{order:order.id,version:0,promisedDate:'2027-01-01',source:'Supplier confirmation email'},buyer);
 const receipt=await cmd('receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:'6',reason:'Six sets accepted'});
 const invoice=await cmd('invoice',{order:order.id,reference:'CE-100',source:'Supplier original invoice',allocations:[{line:order.lines[0].id,quantity:'6',amountMinor:540000}]},buyer);
 assert.equal((await report()).savings.totals[0].realizedMinor,0,'unapproved invoice evidence does not realize savings');
 await cmd('payable-terms',{invoice:invoice.id,version:0,invoiceDate:'2026-10-19',term:'Net 30',reason:'Supplier terms'},buyer);
 await cmd('approve-payable',{invoice:invoice.id,version:1,reason:'Cash planning checked'},buyer);
 r=await report();assert.deepEqual(r.savings.totals,[{currency:'USD',negotiatedMinor:100000,realizedMinor:60000}]);
 assert.equal(r.savings.realizedRows[0].invoice,invoice.id);assert.equal(r.savings.realizedRows[0].order,order.id);assert.equal(r.savings.realizedRows[0].quantity,6);
 assert.equal(r.requestToPo.denominator,1);assert.equal(r.approvalCycle.denominator,1);const state=(await h.state()).data;
 const creation=state.audit.find(e=>e.action==='request'&&e.record===request.id),issued=state.order.find(o=>o.id===order.id),submit=state.audit.find(e=>e.action==='submit'&&e.record===request.id),decision=state.decision.find(d=>d.request===request.id);
 assert.equal(r.requestToPo.averageMs,Date.parse(issued.issuedAt)-Date.parse(creation.at));assert.equal(r.approvalCycle.averageMs,Date.parse(decision.at)-Date.parse(submit.at));
 assert.equal(r.onTimeDelivery.numerator,1);assert.equal(r.onTimeDelivery.denominator,1);assert.equal(r.onTimeDelivery.rows[0].receiptId,receipt.id);assert.equal(r.invoiceExceptionRate.rate,0);
 assert.equal(r.poCoverage.totals[0].numeratorMinor,540000);assert.equal(r.poCoverage.totals[0].denominatorMinor,540000);assert.equal(r.offContract.totals[0].numeratorMinor,0);assert.equal(r.unapprovedSpend.totals[0].numeratorMinor,0);
 // Quotes without a buyer award do not count, even after request approval.
 const unsigned=await cmd('request',{...draft,title:'Unawarded discount'},requester);await quotes(unsigned,draft);await cmd('submit',{id:unsigned.id,revision:1},requester);await cmd('decision',{id:unsigned.id,revision:1,decision:'approved',reason:'Purchase only'},approver);
 assert.deepEqual((await report()).savings.totals,r.savings.totals);
 const offContract=await cmd('supplier',{name:'Canadian supplier',status:'active',reason:'Spot order'});
 const cadDraft={...draft,title:'Canadian spot purchase',supplier:offContract.id,currency:'CAD'},cad=await cmd('request',cadDraft,requester);await cmd('submit',{id:cad.id,revision:1},requester);await cmd('decision',{id:cad.id,revision:1,decision:'approved',reason:'Approved CAD'},approver);const co=await cmd('convert',{id:cad.id,revision:1},buyer);await cmd('issue',{id:co.id,revision:1,reason:'Issued CAD'},buyer);
 await cmd('receipt',{order:co.id,line:co.lines[0].id,event:'receive',quantity:'1',reason:'One received without a recorded promise'});
 const exception=await cmd('invoice',{order:co.id,reference:'CAD-1',source:'Price and receipt exception',allocations:[{line:co.lines[0].id,quantity:'2',amountMinor:190000}]},buyer);
 r=await report();assert.equal(r.invoiceExceptionRate.numerator,1);assert.equal(r.invoiceExceptionRate.denominator,2);assert.equal(r.invoiceExceptionRate.rows.find(i=>i.invoiceId===exception.id).exception,true);assert.equal(r.onTimeDelivery.unknownPromise,1);
 assert.deepEqual(r.poCoverage.totals.map(g=>[g.currency,g.numeratorMinor]),[['CAD',190000],['USD',540000]]);assert.equal(r.offContract.totals.find(g=>g.currency==='CAD').numeratorMinor,190000);
 for(const key of ['poCoverage','offContract','unapprovedSpend'])for(const g of r[key].totals){assert.equal(g.denominatorMinor,g.rows.reduce((n,x)=>n+x.amountMinor,0));assert.ok(g.rows.every(x=>state.order.some(o=>o.id===x.orderId)||x.orderId===co.id));}
 await cmd('receipt',{order:order.id,line:order.lines[0].id,event:'return',quantity:'1',reason:'One set returned'});assert.equal((await report()).savings.totals[0].realizedMinor,50000,'returned quantities do not remain realized');
 assert.equal((await h.send('/api/purse/performance-report',undefined,'')).status,401);assert.equal((await h.send('/api/purse/performance-report',undefined,requester)).status,403);

 } finally {for(const close of cleanups.reverse())await close();}
}
}
