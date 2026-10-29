
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {harness} from './purse-harness.mjs'

export async function order_chasingFlow(){
{
 // PO-003 overdue and unacknowledged POs chase on cadence, escalate once, share real evidence and stop on close or current holds
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const h=await harness();t.after(()=>h.close())
 const {command:cmd,state,send}=h
 const day=offset=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10)
 await cmd('business',{name:'Summit field services',currencies:['USD','AUD'],locations:['Denver'],costCentres:['Operations'],projects:['Site']})
 const buyer=await h.member('buyer@example.test',['buyer']),requester=await h.member('requester@example.test',['requester']),other=await h.member('other@example.test',['requester']),approver=await h.member('approver@example.test',['approver'])
 const supplier=await cmd('supplier',{name:'Summit industrial equipment',status:'preferred',reason:'Approved site supplier',contacts:[{name:'Casey',email:'orders@summit.example.test'}]},buyer)
 await cmd('policy',{name:'Site equipment',currency:'USD',category:'Equipment',project:'Site',approver:'approver@example.test',limitMinor:1000000,budgetMinor:5000000})
 const purchase=async title=>{
  const r=await cmd('request',{title,supplier:supplier.id,currency:'USD',needDate:day(20),location:'Denver',costCentre:'Operations',terms:'Supplier quote; Net 30',lines:[{description:'Lifting harness',quantity:'4',unitMinor:12500,category:'Equipment',project:'Site'}]},requester)
  await cmd('submit',{id:r.id,revision:1},requester);await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Site safety equipment'},approver)
  const o=await cmd('convert',{id:r.id,revision:1},buyer);return cmd('issue',{id:o.id,revision:1,reason:'Approved document issued through existing supplier channel'},buyer)
 }
 const order=await purchase('Replacement lifting harnesses')
 let policy=await cmd('order-chase-policy',{order:order.id,version:0,enabled:true,cadenceDays:1,maxChases:2,escalateTo:'buyer@example.test'},buyer)
 const tick=async days=>{const response=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+new Date(day(days)+'T17:00:00Z').getTime());assert.equal(response.status,200,await response.text())}
 const initial=h.messages.length
 await tick(0);assert.equal(h.messages.length,initial)
 await cmd('supplier',{...supplier,contacts:[{name:'New order desk',email:'newdesk@summit.example.test'}]},buyer)
 await Promise.all([tick(2),tick(2)])
 assert.equal(h.messages.length,initial+1)
 assert.deepEqual(h.messages.at(-1).to,['orders@summit.example.test'],'Chases retain the approved PO contact after a directory edit')
 let events=(await state(requester)).data.orderChaseEvent.filter(e=>e.order===order.id)
 assert.equal(events.length,1);assert.equal(events[0].reason,'unacknowledged');assert.equal(events[0].outcome.status,'accepted')
 assert.equal((await state(other)).data.orderChaseEvent.length,0)
 await tick(2);assert.equal(h.messages.length,initial+1)
 await tick(3);assert.equal(h.messages.length,initial+3)
 events=(await state(requester)).data.orderChaseEvent.filter(e=>e.order===order.id)
 assert.equal(events.filter(e=>e.kind==='chase').length,2)
 assert.equal(events.filter(e=>e.kind==='escalation').length,1)
 assert.deepEqual(h.messages.at(-1).to,['buyer@example.test'])
 assert.ok(h.messages.at(-1).subject.includes(order.number))
 await tick(7);assert.equal(h.messages.length,initial+3)

 policy=await cmd('order-chase-policy',{order:order.id,version:policy.version,enabled:true,cadenceDays:1,maxChases:3,escalateTo:'buyer@example.test'},buyer)
 let evidence=await cmd('supplier-order-evidence',{order:order.id,version:0,promisedDate:day(20),acknowledgedAt:new Date().toISOString(),source:'Supplier email S-842: order acknowledged, delivery confirmed in twenty days'},buyer)
 await tick(8);assert.equal(h.messages.length,initial+3,'Acknowledged supply not overdue is not chased')
 evidence=await cmd('supplier-order-evidence',{order:order.id,version:evidence.version,promisedDate:day(7),acknowledgedAt:evidence.acknowledgedAt,source:'Supplier reply S-842-2: revised delivery promise recorded by buyer'},buyer)
 await tick(8);assert.equal(h.messages.length,initial+4)
 const requesterState=(await state(requester)).data
 const replies=requesterState.orderChaseEvidence.find(e=>e.order===order.id)
 assert.equal(replies.history.length,2);assert.equal(replies.source,evidence.source)
 assert.equal((await state(other)).data.orderChaseEvidence.length,0)
 assert.equal(requesterState.orderChaseEvent.at(-1).reason,'overdue-delivery')
 await cmd('close-order',{id:order.id,version:0,reason:'Supplier wrote off the remaining harness shipment'},buyer)
 const beforeCloseTick=h.messages.length
 await tick(10);assert.equal(h.messages.length,beforeCloseTick,'PO-010 closed balances stop an active PO-003 chase')
 await cmd('reopen-order',{id:order.id,version:1,reason:'Supplier can now fulfil the outstanding shipment'},buyer)
 await cmd('supplier',{...supplier,status:'blocked',reason:'Supplier safety review pending'},buyer)
 await tick(11);assert.equal(h.messages.length,beforeCloseTick)
 await cmd('supplier',{...supplier,status:'preferred',reason:'Supplier safety review cleared'},buyer)
 const file=await cmd('attachment',{kind:'supplier',record:supplier.id,privateSupplierDocument:true,name:'expired-coi.txt',mediaType:'text/plain',base64:Buffer.from('Original expired COI').toString('base64')},buyer)
 const document=await cmd('supplier-document',{supplier:supplier.id,type:'insurance',attachment:file.id,expires:day(-1),required:true,reminderDays:[],version:0},buyer)
 await tick(12);assert.equal(h.messages.length,beforeCloseTick,'Current required-document holds suspend supplier chases')
 await cmd('review-supplier-document',{id:document.id,version:document.version,attachment:file.id,expires:day(365)},buyer)
 await tick(12);assert.equal(h.messages.length,beforeCloseTick+1)
 await cmd('receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:'4',reason:'Remaining shipment received in full'})
 const afterReceiving=h.messages.length
 await tick(14);assert.equal(h.messages.length,afterReceiving,'PO-003 zero outstanding balance suppresses the next due chase and escalation')

 const mapping={columns:{},decimal:'.',date:'YYYY-MM-DD',statuses:{active:'active',approved:'historical-approved',issued:'historical-issued',received:'historical-received'}}
 const csv=await readFile('public/fixtures/procurify-shape.csv','utf8')
 const preview=await send('/api/purse/import/preview',{filename:'historical.csv',csv,mapping},h.owner);assert.equal(preview.status,200,JSON.stringify(preview.value))
 const committed=await send('/api/purse/import/commit',{filename:'historical.csv',csv,mapping,fingerprint:preview.value.plan.fingerprint},h.owner);assert.equal(committed.status,200,JSON.stringify(committed.value))
 const adopted=(await state()).data.order.find(o=>o.imported);assert.ok(adopted)
 await cmd('order-chase-policy',{order:adopted.id,version:0,enabled:true,cadenceDays:1,maxChases:1,escalateTo:'buyer@example.test'},buyer,409)
 const untouched=(await state()).data
 await cmd('order-chase-policy',{order:order.id,version:policy.version,enabled:false,cadenceDays:1,maxChases:3,escalateTo:'buyer@example.test'},requester,403)
 await cmd('order-chase-policy',{order:order.id,version:0,enabled:false,cadenceDays:1,maxChases:3,escalateTo:'buyer@example.test'},buyer,409)
 await cmd('order-chase-policy',{order:order.id,version:policy.version,enabled:true,cadenceDays:1,maxChases:3,escalateTo:'other@example.test'},buyer,400)
 assert.deepEqual((await state()).data,untouched)
 assert.equal((await send('/api/purse/order-chases',{},requester)).status,403)
 assert.equal((await send('/api/purse/order-chases',{})).status,401)

 } finally {for(const close of cleanups.reverse())await close();}
}
}
