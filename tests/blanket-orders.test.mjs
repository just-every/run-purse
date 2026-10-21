import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './purse-harness.mjs';
import {pdfContent} from './pdf-content.mjs';
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs';

test('PO-005 blanket invoice draw-down preserves approved caps, validity, commitments, current amendments and source-exact archives',async t=>{
 const h=await harness();t.after(()=>h.close());const cmd=h.command;
 await cmd('business',{name:'Canyon Field Services',currencies:['USD','CAD'],locations:['Denver'],costCentres:['Operations'],projects:['Maintenance']});
 const requester=await h.member('requester@example.test',['requester']),approver=await h.member('approver@example.test',['approver']),buyer=await h.member('buyer@example.test',['buyer']);
 const supplier=await cmd('supplier',{name:'Front Range Maintenance',status:'preferred',reason:'Annual supply agreement',contacts:[{name:'Jordan',email:'sales@example.test'}]});
 await cmd('policy',{name:'Annual maintenance authority',currency:'USD',category:'*',project:'*',approver:'approver@example.test',limitMinor:10000000,budgetMinor:10000000});
 const input={title:'Annual maintenance blanket',supplier:supplier.id,currency:'USD',needDate:'2026-12-31',location:'Denver',costCentre:'Operations',terms:'Net 30',poDetails:{blanket:{validFrom:'2026-01-01',validThrough:'2026-12-31'}},lines:[{description:'Maintenance supply units',quantity:'24',unitMinor:100000,category:'Maintenance',project:'Maintenance'}]};
 const r=await cmd('request',input,requester);
 async function issue(request){await cmd('submit',{id:request.id,revision:request.revision},requester);await cmd('decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Annual cap reviewed'},approver);const order=await cmd('convert',{id:request.id,revision:request.revision},buyer);await cmd('issue',{id:order.id,revision:order.revision,reason:'Approved document issued through existing channel'},buyer);return order;}
 const o=await issue(r);assert.equal(o.totalMinor,2400000);
 const state=async()=> (await h.state(buyer)).data;
 const balance=async()=> (await state()).order.find(p=>p.id===o.id).blanketPosition;
 const committed=async()=> (await state()).commitment.filter(e=>e.request===r.id).reduce((n,e)=>n+e.amountMinor,0);
 const invoices=[];
 for(const [index,q]of ['6','5','4'].entries()){
  const body={order:o.id,reference:'FR-'+index,source:'Original monthly maintenance invoice '+index,invoiceDate:'2026-10-'+(21+index),allocations:[{line:o.lines[0].id,quantity:q,amountMinor:Number(q)*100000}]};
  const i=await cmd('invoice',body,buyer);invoices.push(i);assert.deepEqual(i.flags,[]);assert.equal((await cmd('invoice',body,buyer)).id,i.id);
  assert.equal(await committed(),2400000-invoices.reduce((n,i)=>n+i.totalMinor,0),'PO-005 idempotent evidence releases the cap only once');
 }
 assert.deepEqual(await balance(),{validFrom:'2026-01-01',validThrough:'2026-12-31',currentOrder:o.id,capMinor:2400000,billedMinor:1500000,remainingMinor:900000,overCapMinor:0});
 await cmd('receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'15',reason:'Maintenance units accepted'});
 assert.equal(await committed(),900000,'PO-005 receipt cannot release already drawn invoice value twice');
 const report=await h.send('/api/purse/spend-report',undefined,buyer);assert.equal(report.status,200);assert.equal(report.value.totals.find(t=>t.currency==='USD').committedMinor,900000);assert.equal(report.value.totals.find(t=>t.currency==='USD').actualMinor,1500000);
 for(const invoice of invoices){await cmd('payable-terms',{invoice:invoice.id,version:0,invoiceDate:invoice.invoiceDate,term:'Net 30',reason:'Supplier original terms'},buyer);await cmd('approve-payable',{invoice:invoice.id,version:1,reason:'Receipt and invoice checked'},buyer);}
 assert.equal((await state()).cashRequirements.commitments.find(p=>p.order===o.id).amountMinor,900000);
 const before=await state();await cmd('amend',{...input,id:r.id,revision:1,currency:'CAD',reason:'Different currency'},buyer,409);await cmd('request',{...input,poDetails:{blanket:{validFrom:'2026-12-31',validThrough:'2026-01-01'}}},requester,400);await cmd('issue',{id:o.id,revision:1,reason:'Wrong actor'},requester,403);assert.deepEqual(await state(),before);
 const amendment=await cmd('amend',{...input,id:r.id,revision:1,reason:'Renew cap for extra units',lines:[{...r.lines[0],quantity:'30'}],poDetails:{blanket:{validFrom:'2026-01-01',validThrough:'2027-01-31'}}},buyer);const next=await issue(amendment);
 assert.equal(await committed(),1500000,'PO-005 new cap replaces prior face instead of summing faces');assert.equal((await balance()).capMinor,3000000);assert.equal((await balance()).billedMinor,1500000);
 const pdf=await h.mf.dispatchFetch(h.origin+'/api/purse/order-pdf/'+next.id,{headers:{cookie:buyer}});assert.equal(pdf.status,200);const content=await pdfContent(new Uint8Array(await pdf.arrayBuffer()));for(const text of ['Blanket purchase order','USD 30000.00','2027-01-31','Change order 1','quantity: 24 to 30','Canyon Field Services','FOB destination'])assert.ok(content.text.includes(text),text);
 const old=await h.send('/api/purse/download/order/'+o.id,undefined,buyer);assert.match(old.value,/USD 24000.00/);assert.doesNotMatch(old.value,/2027-01-31/);
 const over=await cmd('invoice',{order:next.id,reference:'FR-OVER',source:'Invoice beyond amended blanket',invoiceDate:'2026-10-25',allocations:[{line:next.lines[0].id,quantity:'16',amountMinor:1600000}]},buyer);assert.ok(over.flags.some(f=>f.code==='po-balance'));assert.equal(over.balance.faceMinor,3000000);assert.equal(over.balance.billedMinor,1500000);assert.equal((await balance()).overCapMinor,100000);
 await cmd('payable-terms',{invoice:over.id,version:0,invoiceDate:over.invoiceDate,term:'Net 30',reason:'Source date'},buyer);await cmd('approve-payable',{invoice:over.id,version:1,reason:'Must remain held'},buyer,409);
 const outside=await cmd('invoice',{order:next.id,reference:'FR-LATE',source:'Out of period evidence',invoiceDate:'2027-02-01',allocations:[{line:next.lines[0].id,quantity:'1',amountMinor:100000}]},buyer);assert.ok(outside.flags.some(f=>f.code==='blanket-validity'));
 const expired=await cmd('request',{...input,title:'Expired cap',poDetails:{blanket:{validFrom:'2000-01-01',validThrough:'2000-12-31'}}},requester);await cmd('submit',{id:expired.id,revision:1},requester);await cmd('decision',{id:expired.id,revision:1,decision:'approved',reason:'Historical terms'},approver);const prepared=await cmd('convert',{id:expired.id,revision:1},buyer);await cmd('issue',{id:prepared.id,revision:1,reason:'Expired validity'},buyer,409);
 // PO-005 current amendment validity has inclusive edges; each boundary invoice consumes current authority exactly once.
 const priorBoundary=await balance(),priorCommitted=await committed();const boundaryInvoices=[];
 for(const [reference,invoiceDate]of [['FROM','2026-01-01'],['THROUGH','2027-01-31'],['BEFORE','2025-12-31']]){
  const body={order:next.id,reference:'BOUNDARY-'+reference,source:'Supplier boundary invoice '+reference,invoiceDate,allocations:[{line:next.lines[0].id,quantity:'0.001',amountMinor:100}]};
  const invoice=await cmd('invoice',body,buyer);boundaryInvoices.push(invoice);
  assert.equal(invoice.flags.some(f=>f.code==='blanket-validity'),reference==='BEFORE','PO-005 inclusive current amended validity '+reference);
  assert.equal((await cmd('invoice',body,buyer)).id,invoice.id,'PO-005 boundary replay never draws twice');
 }
 assert.equal((await balance()).billedMinor,priorBoundary.billedMinor+300);assert.equal(await committed(),priorCommitted);
 const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(rows),true,'PO-005 native cap, invoice sources and approved history validate for portable restore');
 const corrupt=structuredClone(rows),row=corrupt.find(row=>row.kind==='order'&&row.id===next.id),value=JSON.parse(row.value);value.poDetails.blanket.validThrough='2027-02-30';row.value=JSON.stringify(value);assert.throws(()=>validatePurchasingArchive(corrupt));
});
