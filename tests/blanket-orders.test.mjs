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

test('PO-005 real release authority, structured service value matching and consented recurring Cron pause at agreement boundaries',async t=>{
 const h=await harness();t.after(()=>h.close());const cmd=h.command;
 await cmd('business',{name:'synthetic-purse-1',currencies:['USD'],locations:['synthetic-purse-2'],costCentres:['synthetic-purse-3'],projects:['synthetic-purse-4']});
 const requester=await h.member('synthetic-purse-5@example.test',['requester']),approver=await h.member('synthetic-purse-6@example.test',['approver']),buyer=await h.member('synthetic-purse-7@example.test',['buyer']),receiver=await h.member('synthetic-purse-8@example.test',['receiver']);
 const supplier=await cmd('supplier',{name:'synthetic-purse-9',status:'preferred',reason:'synthetic-purse-10',contacts:[{name:'synthetic-purse-11',email:'synthetic-purse-12@example.test'}]});
 await cmd('policy',{name:'synthetic-purse-13',currency:'USD',category:'*',project:'*',approver:'synthetic-purse-6@example.test',limitMinor:100000000,budgetMinor:100000000});
 const input={title:'synthetic-purse-14',supplier:supplier.id,currency:'USD',needDate:'2027-12-31',location:'synthetic-purse-2',costCentre:'synthetic-purse-3',terms:'synthetic-purse-15',lines:[{description:'synthetic-purse-16',quantity:'1',unitMinor:1000000,category:'synthetic-purse-17',project:'synthetic-purse-4'}]};
 const make=async overrides=>{const r=await cmd('request',{...input,...overrides},requester);await cmd('submit',{id:r.id,revision:r.revision},requester);await cmd('decision',{id:r.id,revision:r.revision,decision:'approved',reason:'synthetic-purse-18'},approver);const o=await cmd('convert',{id:r.id,revision:r.revision},buyer);return await cmd('issue',{id:o.id,revision:o.revision,reason:'synthetic-purse-19'},buyer);};
 const state=async cookie=>(await h.state(cookie??buyer)).data;
 const blanket=await make({poDetails:{blanket:{validFrom:'2026-01-01',validThrough:'2027-12-31'}},lines:[{...input.lines[0],quantity:'24',unitMinor:100000}]});
 const release=await cmd('blanket-release',{order:blanket.id,revision:1,reference:'synthetic-purse-20',amountMinor:600000,needDate:'2026-12-01',reason:'synthetic-purse-21'},buyer);
 assert.equal((await state()).order.find(o=>o.id===blanket.id).releasePosition.availableMinor,1800000);
 const committed=() => state().then(s=>s.commitment.filter(c=>c.request===blanket.request).reduce((n,c)=>n+c.amountMinor,0));
 assert.equal(await committed(),2400000,'Release earmark retains the whole uninvoiced commitment');
 await cmd('blanket-release',{order:blanket.id,revision:1,reference:'synthetic-purse-22',amountMinor:1800001,needDate:'2026-12-01',reason:'synthetic-purse-23'},buyer,409);
 await cmd('blanket-release',{order:blanket.id,revision:1,reference:'synthetic-purse-24',amountMinor:1,needDate:'2026-12-01',reason:'synthetic-purse-25'},requester,403);
 const body={order:blanket.id,release:release.id,reference:'synthetic-purse-26',source:'synthetic-purse-27',invoiceDate:'2026-11-01',allocations:[{line:blanket.lines[0].id,quantity:'6',amountMinor:600000}]};
 const bill=await cmd('invoice',body,buyer);assert.equal((await cmd('invoice',body,buyer)).id,bill.id);assert.equal(await committed(),1800000);assert.equal(bill.flags.length,0);
 const over=await cmd('invoice',{...body,reference:'synthetic-purse-28',invoiceDate:'2026-11-02',allocations:[{line:blanket.lines[0].id,quantity:'0.001',amountMinor:1}]},buyer);assert.ok(over.flags.some(f=>f.code==='release-balance'));
 await cmd('payable-terms',{invoice:over.id,version:0,invoiceDate:over.invoiceDate,term:'Net 30',reason:'synthetic-purse-29'},buyer);await cmd('approve-payable',{invoice:over.id,version:1,reason:'synthetic-purse-30'},buyer,409);
 const service=await make({lines:[{...input.lines[0],service:{mode:'percentage'}}]});
 const invoice=async(reference,amount,date)=>cmd('invoice',{order:service.id,reference,source:'synthetic-purse-31',invoiceDate:date,allocations:[{line:service.lines[0].id,quantity:'1',amountMinor:amount}]},buyer);
 const excessive=await invoice('synthetic-purse-32',600000,'2026-11-03'),matching=await invoice('synthetic-purse-33',400000,'2026-11-04');
 let current=(await state(receiver)).order.find(o=>o.id===service.id);
 await cmd('service-receipt',{order:service.id,line:service.lines[0].id,receiptVersion:current.receiptVersion,percentage:'40',reason:'synthetic-purse-34'},receiver);
 await cmd('service-receipt',{order:service.id,line:service.lines[0].id,receiptVersion:current.receiptVersion,percentage:'50',reason:'synthetic-purse-35'},receiver,409);
 const matches=(await state()).discrepancies;assert.equal(matches.find(d=>d.invoiceId===excessive.id).exception,'Invoice exceeds received service value');assert.equal(matches.find(d=>d.invoiceId===matching.id).receiptShortfall,false);assert.equal(matches.find(d=>d.invoiceId===matching.id).priceMismatch,false);
 for(const bill of [excessive,matching])await cmd('payable-terms',{invoice:bill.id,version:0,invoiceDate:bill.invoiceDate,term:'Net 30',reason:'synthetic-purse-36'},buyer);
 await cmd('approve-payable',{invoice:excessive.id,version:1,reason:'synthetic-purse-37'},buyer,409);await cmd('approve-payable',{invoice:matching.id,version:1,reason:'synthetic-purse-38'},buyer);
 for(const mode of ['amount','milestone']){
  const o=await make({lines:[{...input.lines[0],service:mode==='amount'?{mode}:{mode,milestones:[{id:'synthetic-purse-39',name:'synthetic-purse-40',valueMinor:400000},{id:'synthetic-purse-41',name:'synthetic-purse-42',valueMinor:600000}]}}]});
  const position=(await state(receiver)).order.find(p=>p.id===o.id),b={order:o.id,line:o.lines[0].id,receiptVersion:position.receiptVersion,reason:'synthetic-purse-43',...(mode==='amount'?{valueMinor:400000}:{milestone:'synthetic-purse-39'})};
  const receipt=await cmd('service-receipt',b,receiver);assert.equal(receipt.valueMinor,400000);
  if(mode==='milestone')await cmd('service-receipt',{...b,receiptVersion:(await state(receiver)).order.find(p=>p.id===o.id).receiptVersion},receiver,409);
  await cmd('receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'1',reason:'synthetic-purse-44'},receiver,409);
 }
 const template=await make({lines:[{...input.lines[0],unitMinor:10000}]});
 const issued=new Date(template.issuedAt),first=new Date(Date.UTC(issued.getUTCFullYear(),issued.getUTCMonth()+1,Math.min(issued.getUTCDate(),28))),second=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,first.getUTCDate()));
 const day=d=>d.toISOString().slice(0,10),end=new Date(issued.getTime()+42*86400000);
 const agreement=await cmd('agreement',{version:0,confirmed:true,name:'synthetic-purse-45',reference:'synthetic-purse-46',supplier:supplier.id,currency:'USD',parties:'synthetic-purse-47',startDate:day(issued),endDate:day(end),autoRenew:false,noticeDays:0,remindersEnabled:false,reminderDays:[1],paymentTerms:'synthetic-purse-48',valueMinor:1000000,reason:'synthetic-purse-49'});
 const series=await cmd('recurring-series',{order:template.id,agreement:agreement.id,nextDate:day(first),endDate:day(second),maxOrders:2,reason:'synthetic-purse-50'});
 await cmd('recurring-authorize',{id:series.id,version:1,reason:'synthetic-purse-51'},requester,403);
 await cmd('recurring-authorize',{id:series.id,version:1,reason:'synthetic-purse-52'},approver);
 const tick=async d=>{const response=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+d.getTime());assert.equal(response.status,200,await response.text());};
 await Promise.all([tick(new Date(first.getTime()+12*3600000)),tick(new Date(first.getTime()+12*3600000))]);
 let data=await state();const generated=data.recurringEvent.filter(e=>e.series===series.id&&e.status==='generated');assert.equal(generated.length,1,'Concurrent real Cron creates one order and one reservation');const child=data.order.find(o=>o.id===generated[0].order);assert.equal(child.totalMinor,10000);assert.notEqual(child.request,template.request);assert.notEqual(child.lines[0].id,template.lines[0].id);assert.equal(data.commitment.filter(c=>c.request===child.request).reduce((n,c)=>n+c.amountMinor,0),10000);
 const pdf=await h.send('/api/purse/download/order/'+child.id,undefined,buyer);assert.match(pdf.value,/Scheduled recurring purchase/);assert.match(pdf.value,new RegExp(template.number));
 await tick(new Date(second.getTime()+12*3600000));data=await state();const paused=data.recurringSeries.find(s=>s.id===series.id);assert.equal(paused.status,'paused');assert.match(paused.pauseReason,new RegExp(day(end)));assert.equal(data.recurringEvent.filter(e=>e.series===series.id&&e.status==='generated').length,1);
 await cmd('recurring-disposition',{id:series.id,version:paused.version,disposition:'continue',reason:'synthetic-purse-53'});await tick(new Date(second.getTime()+12*3600000));assert.equal((await state()).recurringSeries.find(s=>s.id===series.id).status,'paused','Owner continue never bypasses agreement renewal checks');
 // Each renewal condition is exercised through the same owner/approver/real-Cron doors.
 const pauseCase=async(kind,agreementFields={},orderFields={})=>{
  const order=await make({lines:[{...input.lines[0],unitMinor:10000}],...orderFields});
  const linked=await cmd('agreement',{version:0,confirmed:true,name:'synthetic-purse-60-'+kind,reference:'synthetic-purse-61-'+kind,supplier:supplier.id,currency:'USD',parties:'synthetic-purse-62',startDate:day(issued),endDate:day(new Date(second.getTime()+365*86400000)),autoRenew:false,noticeDays:0,remindersEnabled:false,reminderDays:[1],paymentTerms:'synthetic-purse-63',valueMinor:1000000,reason:'synthetic-purse-64',...agreementFields});
  const series=await cmd('recurring-series',{order:order.id,agreement:linked.id,nextDate:day(first),endDate:day(second),maxOrders:2,reason:'synthetic-purse-65'});await cmd('recurring-authorize',{id:series.id,version:1,reason:'synthetic-purse-66'},approver);
  return {order,series};
 };
 for(const [kind,fields,pattern]of [['notice',{endDate:day(new Date(first.getTime()+30*86400000)),noticeDays:40},/notice period/],['value',{valueMinor:10000},/agreement value/]]){
  const {series}=await pauseCase(kind,fields);await tick(new Date(first.getTime()+12*3600000));const paused=(await state()).recurringSeries.find(s=>s.id===series.id);assert.equal(paused.status,'paused');assert.match(paused.pauseReason,pattern);
 }
 const blocked=await pauseCase('blocked');await cmd('supplier',{...supplier,status:'blocked',reason:'synthetic-purse-67'},buyer);await tick(new Date(first.getTime()+12*3600000));assert.match((await state()).recurringSeries.find(s=>s.id===blocked.series.id).pauseReason,/blocked/i);await cmd('supplier',{...supplier,status:'preferred',reason:'synthetic-purse-68'},buyer);
 await cmd('policy',{name:'synthetic-purse-69',currency:'USD',category:'synthetic-purse-70',project:'*',approver:'synthetic-purse-6@example.test',limitMinor:10000,budgetMinor:20000});
 const limitedLine={...input.lines[0],unitMinor:10000,category:'synthetic-purse-70'};const budget=await pauseCase('budget',{}, {lines:[limitedLine]});await make({lines:[limitedLine]});await tick(new Date(first.getTime()+12*3600000));assert.match((await state()).recurringSeries.find(s=>s.id===budget.series.id).pauseReason,/remaining budget/);
 const lapsed=await pauseCase('lapsed');const file=await cmd('attachment',{kind:'supplier',record:supplier.id,privateSupplierDocument:true,name:'synthetic-purse-71.txt',mediaType:'text/plain',base64:Buffer.from('synthetic-purse-72').toString('base64')},buyer);await cmd('supplier-document',{supplier:supplier.id,type:'insurance',attachment:file.id,expires:day(new Date(first.getTime()-86400000)),required:true,reminderDays:[1],refreshEveryDays:365,version:0},buyer);await tick(new Date(first.getTime()+12*3600000));assert.match((await state()).recurringSeries.find(s=>s.id===lapsed.series.id).pauseReason,/lapsed/);
 const unauthorized=await h.send('/api/purse/command/service-receipt',{order:service.id,line:service.lines[0].id,percentage:'100',reason:'synthetic-purse-54'});assert.equal(unauthorized.status,401);
 const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(rows),true);
 const broken=structuredClone(rows),row=broken.find(r=>r.kind==='receipt'&&JSON.parse(r.value).valueMinor===400000),value=JSON.parse(row.value);value.valueMinor=900000;row.value=JSON.stringify(value);assert.throws(()=>validatePurchasingArchive(broken));
});
