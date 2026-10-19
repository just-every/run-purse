import test from 'node:test'
import assert from 'node:assert/strict'
import {harness} from './purse-harness.mjs'
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs'

test('RECEIVE-001 responsible receivers, due email prompts, automatic invoice holds, partial/full receipts, reassignment and PO-010 closure use current authority',async t=>{
 const h=await harness();t.after(()=>h.close());const cmd=h.command;
 await cmd('business',{name:'Canyon Building Services',currencies:['USD'],locations:['Denver','Austin'],costCentres:['Facilities'],projects:['Office'],timezone:'America/Los_Angeles'});
 const requester=await h.member('requester@example.test',['requester']),approver=await h.member('approver@example.test',['approver']),buyer=await h.member('buyer@example.test',['buyer']),facilities=await h.member('facilities@example.test',['receiver']),it=await h.member('it@example.test',['receiver']),stranger=await h.member('stranger@example.test',['requester']);
 const supplier=await cmd('supplier',{name:'Canyon maintenance',status:'preferred',reason:'Established contractor',contacts:[{name:'Jordan',email:'desk@canyon.example.test'}]},buyer);
 await cmd('policy',{name:'Facilities budget',currency:'USD',category:'*',project:'*',approver:'approver@example.test',limitMinor:1000000,budgetMinor:5000000});
 const purchase=async(title,needDate='2026-12-20',location='Denver',category='Building services')=>{const r=await cmd('request',{title,supplier:supplier.id,currency:'USD',needDate,location,costCentre:'Facilities',terms:'Net 30',lines:[{description:'Maintenance visits',quantity:'10',unitMinor:10000,category,project:'Office'}]},requester);await cmd('submit',{id:r.id,revision:1},requester);await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Facilities spend authorized'},approver);const o=await cmd('convert',{id:r.id,revision:1},buyer);return cmd('issue',{id:o.id,revision:1,reason:'Contractor issued approved order'},buyer)};
 const tick=async date=>{const r=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+Date.parse(date));assert.equal(r.status,200,await r.text())};
 await cmd('receipt-rule',{version:0,location:'Denver',purchaseType:'*',receiver:'it@example.test',reason:'Location receiving'},buyer);
 const typeRule=await cmd('receipt-rule',{version:0,location:'*',purchaseType:'Building services',receiver:'facilities@example.test',reason:'Facilities owns services'},buyer);
 const o=await purchase('Annual building maintenance');
 const read=async(cookie=buyer)=>(await h.state(cookie)).data;
 assert.equal((await read()).order.find(x=>x.id===o.id).receiverAssignment.email,'facilities@example.test','Type outranks location');
 const i=await cmd('invoice',{order:o.id,reference:'MAINT-1',source:'Supplier original invoice',allocations:[{line:o.lines[0].id,quantity:'10',amountMinor:100000}]},buyer);
 assert.equal((await read()).invoice.find(x=>x.id===i.id).receiptMatch,'Held for receipt');
 await cmd('payable-terms',{invoice:i.id,version:0,invoiceDate:'2026-10-19',term:'Net 30',reason:'Dated source'},buyer);await cmd('approve-payable',{invoice:i.id,version:1,reason:'Too early'},buyer,409);
 const before=(await read()).receipt;
 for(const cookie of [requester,it,stranger])await cmd('receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'1',reason:'Wrong receiver'},cookie,403);
 await cmd('receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'1',reason:'Signed out'},'',401);assert.deepEqual((await read()).receipt,before);
 const n=h.messages.length;await Promise.all([tick('2026-10-20T12:00:00Z'),tick('2026-10-20T12:00:00Z')]);
 assert.equal(h.messages.length,n+1);assert.deepEqual(h.messages.at(-1).to,['facilities@example.test']);assert.match(h.messages.at(-1).text,/\/app\?receipt=/);assert.ok(!h.messages.at(-1).text.includes(supplier.name));assert.ok(!h.messages.at(-1).text.includes('1000.00'));assert.equal((await read()).receiptPromptEvent.find(e=>e.order===o.id).outcome.status,'accepted');
 const prior=(await read()).order.find(x=>x.id===o.id).receiptVersion;
 await cmd('receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'4',receiptVersion:prior,reason:'Four maintenance milestones complete'},facilities);
 assert.equal((await read()).invoice.find(x=>x.id===i.id).receiptMatch,'Held for receipt');
 await cmd('receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'6',receiptVersion:prior,reason:'Stale full confirmation'},facilities,409);
 const poRule=await cmd('reassign-receipt',{order:o.id,version:0,receiver:'it@example.test',reason:'IT covers remaining delivery'},facilities);
 await cmd('receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'6',reason:'Former receiver'},facilities,403);
 await tick('2026-10-20T13:00:00Z');assert.deepEqual(h.messages.at(-1).to,['it@example.test'],'Reassignment notifies the current receiver');
 await cmd('receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'6',receiptVersion:(await read()).order.find(x=>x.id===o.id).receiptVersion,reason:'Remaining delivery confirmed'},it);
 assert.equal((await read()).invoice.find(x=>x.id===i.id).receiptMatch,'Ready for matching');assert.ok((await read()).discrepancies.filter(d=>d.invoiceId===i.id).every(d=>!d.receiptShortfall));
 await cmd('approve-payable',{invoice:i.id,version:1,reason:'Released into ordinary matching'},buyer);
 const afterReceive=h.messages.length;await tick('2026-10-21T12:00:00Z');assert.equal(h.messages.length,afterReceive,'Full receipt stops prompts');
 // Date-only triggers use the installation zone, across a DST boundary.
 const due=await purchase('Due-day Los Angeles receipt','2026-11-01','Austin','Equipment');
 const beforeDue=h.messages.length;await tick('2026-11-01T06:30:00Z');assert.equal(h.messages.length,beforeDue,'Still October in installation zone');await tick('2026-11-01T08:30:00Z');assert.equal(h.messages.length,beforeDue+1);assert.deepEqual(h.messages.at(-1).to,['requester@example.test']);
 assert.equal((await read(requester)).order.find(x=>x.id===due.id).mayReceive,true);assert.equal((await read(stranger)).order.length,0);
 const beforeOwn=(await read()).totals.USD,requesterActor=(await h.state(requester)).actor.id;const ownReceipt=await cmd('receipt',{order:due.id,line:due.lines[0].id,event:'receive',quantity:'1',reason:'Requester accepted their unassigned equipment delivery'},requester);assert.equal(ownReceipt.actor,requesterActor);assert.equal((await read()).order.find(x=>x.id===due.id).positions[0].accepted,1000);assert.equal((await read()).totals.USD,beforeOwn-10000,'Default requester receipt releases its real reservation');
 await cmd('close-order',{id:due.id,version:0,reason:'Contractor canceled remaining delivery'},buyer);const closed=h.messages.length;await tick('2026-11-02T12:00:00Z');assert.equal(h.messages.length,closed,'PO-010 closed balance stops active receiver prompts');
 await cmd('reopen-order',{id:due.id,version:1,reason:'Delivery agreed again'},buyer);await tick('2026-11-03T12:00:00Z');assert.equal(h.messages.length,closed+1);
 const specific=await cmd('receipt-rule',{version:0,location:'Denver',purchaseType:'Building services',receiver:'it@example.test',reason:'Combined scope outranks category'},buyer);const next=await purchase('Scoped facilities work');assert.equal((await read()).order.find(x=>x.id===next.id).receiverAssignment.email,'it@example.test');
 const override=await cmd('receipt-rule',{order:next.id,version:0,receiver:'facilities@example.test',reason:'PO assignment outranks every rule'},buyer);assert.equal((await read()).order.find(x=>x.id===next.id).receiverAssignment.email,'facilities@example.test');
 await cmd('receipt-rule',{...override,version:0,reason:'Stale'},buyer,409);await cmd('receipt-rule',{...override,receiver:'requester@example.test',reason:'Not a receiver'},buyer,400);await cmd('receipt-rule',{...override,reason:'Wrong role'},requester,403);
 await cmd('member',{email:'facilities@example.test',name:'Facilities',roles:['receiver'],active:false});await cmd('receipt',{order:next.id,line:next.lines[0].id,event:'receive',quantity:'1',reason:'Deactivated'},facilities,403);const inactive=h.messages.length;await tick('2026-11-04T12:00:00Z');assert.ok(!h.messages.slice(inactive).some(m=>m.to.includes('facilities@example.test')));
 await cmd('receipt',{order:next.id,line:next.lines[0].id,event:'receive',quantity:'1',reason:'Owner override records physical delivery'});assert.ok((await read()).audit.some(e=>e.action==='receipt'&&e.record===next.id&&e.ownerOverride));
 const audit=await h.send('/api/purse/audit.csv');assert.equal(audit.status,401);const csv=await h.send('/api/purse/audit.csv',undefined,h.owner);assert.match(csv.value,/IT covers remaining delivery/);
 const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(rows),true,'RECEIVE-001 retained assignments, history and outcomes validate for archive restore');
});
