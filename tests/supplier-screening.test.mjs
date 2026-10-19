import test from 'node:test'
import assert from 'node:assert/strict'
import {harness,ofacCsv} from './purse-harness.mjs'

test('SUPPLIER-007 screens new suppliers and identity edits, holds matches and retains dated review evidence', async t => {
 let unavailable=false,malformed=false;const fetched=[]
 const h=await harness({ofac:()=>{fetched.push('CSL');return new Response(unavailable?'Unavailable':malformed?'broken':ofacCsv,{status:unavailable?503:200,headers:{'last-modified':'Sun, 18 Oct 2026 12:00:00 GMT'}})}})
 t.after(()=>h.close());const {command:cmd,state,send}=h
 await cmd('business',{name:'Denver operations',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Office']})
 const buyer=await h.member('buyer@example.test',['buyer']),requester=await h.member('requester@example.test',['requester']),approver=await h.member('approver@example.test',['approver'])
 const input={name:'Restricted Test Trading',address:'9 Safe Avenue, Denver',status:'active',reason:'Proposed office supplier',contacts:[]}
 await cmd('supplier',input,requester,403);assert.equal((await send('/api/purse/command/supplier',input)).status,401);assert.equal(fetched.length,0)
 let supplier=await cmd('supplier',input,buyer);assert.equal(supplier.status,'pending_review');assert.equal(supplier.requestedStatus,'active')
 const screening=supplier.screenings.at(-1);assert.equal(screening.matches[0].id,'901');assert.equal(screening.sources.length,1);assert.ok(screening.sources.every(s=>s.sourceDate&&s.sha256.length===64))
 const draft={title:'Office supplies',supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Stationery',quantity:'2',unitMinor:500,category:'Office',project:'Office'}]}
 await cmd('request',draft,requester,409)
 supplier=await cmd('supplier',{...supplier,status:'preferred',screenings:[],reason:'Try to bypass screening'},buyer);assert.equal(supplier.status,'pending_review');assert.equal(supplier.screenings.length,1)
 await cmd('review-screening',{id:supplier.id,screening:screening.id,decision:'clear',reason:'Name-only false positive verified'},buyer,403)
 supplier=await cmd('review-screening',{id:supplier.id,screening:screening.id,decision:'clear',reason:'Independent identity evidence reviewed'})
 assert.equal(supplier.status,'preferred');assert.equal(supplier.screenings[0].review.reason,'Independent identity evidence reviewed')
 await cmd('review-screening',{id:supplier.id,screening:screening.id,decision:'clear',reason:'Replay'},h.owner,409)
 const request=await cmd('request',draft,requester)
 await cmd('policy',{name:'Office approval',currency:'USD',category:'Office',project:'Office',approver:'approver@example.test',limitMinor:100000,budgetMinor:100000})
 await cmd('submit',{id:request.id,revision:1},requester)
 supplier=await cmd('supplier',{...supplier,name:'Blocked Alias Test'},buyer);assert.equal(supplier.status,'pending_review');assert.equal(supplier.screenings.length,2)
 await cmd('decision',{id:request.id,revision:1,decision:'approved',reason:'Still held'},approver,409)
 supplier=await cmd('review-screening',{id:supplier.id,screening:supplier.screenings.at(-1).id,decision:'clear',reason:'Alias false positive checked'})
 await cmd('decision',{id:request.id,revision:1,decision:'approved',reason:'Identity reviewed'},approver)
 supplier=await cmd('supplier',{...supplier,address:'123 Test Street, Denver, CO 80202, United States'},buyer);assert.equal(supplier.status,'pending_review');assert.deepEqual(supplier.screenings.at(-1).matches[0].basis,['name','address'])
 await cmd('convert',{id:request.id,revision:1},buyer,409)
 supplier=await cmd('supplier',{...supplier,name:'Safe Office Supply',address:'88 Clear Lane, Denver'},buyer);assert.equal(supplier.status,'preferred');assert.equal(supplier.screenings.at(-1).status,'clear');assert.equal(supplier.screenings.length,4)
 const order=await cmd('convert',{id:request.id,revision:1},buyer)
 supplier=await cmd('supplier',{...supplier,name:'Trading, Restricted Test'},buyer);assert.equal(supplier.status,'pending_review')
 await cmd('issue',{id:order.id,revision:order.revision,reason:'Held'},buyer,409)
 supplier=await cmd('review-screening',{id:supplier.id,screening:supplier.screenings.at(-1).id,decision:'confirmed',reason:'Confirmed designated entity'})
 assert.equal(supplier.status,'blocked');await cmd('supplier',{...supplier,status:'active'},buyer).then(s=>assert.equal(s.status,'blocked'))
 supplier=await cmd('screen-supplier',{id:supplier.id},buyer);assert.equal(supplier.status,'pending_review');assert.equal(supplier.screenings.length,6)
 const before=(await state()).data
 unavailable=true;await cmd('supplier',{...input,name:'Unavailable list supplier'},buyer,503);assert.deepEqual((await state()).data,before)
 unavailable=false;malformed=true;await cmd('supplier',{...input,name:'Malformed list supplier'},buyer,503);assert.deepEqual((await state()).data,before)
 malformed=false
 const mapping={columns:{},decimal:'.',date:'YYYY-MM-DD',statuses:{active:'active'}}
 const csv='kind,sourceId,name,status\nsupplier,imported,Restricted Test Trading,active\n'
 const preview=await send('/api/purse/import/preview',{csv,mapping},h.owner);assert.equal(preview.status,200)
 const committed=await send('/api/purse/import/commit',{csv,mapping,fingerprint:preview.value.plan.fingerprint},h.owner);assert.equal(committed.status,200)
 const imported=(await state()).data.supplier.find(s=>s.imported);assert.equal(imported.status,'pending_review')
 await cmd('request',{...draft,supplier:imported.id},requester,409)
 const screened=await cmd('screen-supplier',{id:imported.id},buyer);assert.equal(screened.status,'pending_review');assert.equal(screened.screenings[0].matches[0].id,'901')
 assert.ok(before.audit.some(e=>e.action==='review-screening'&&e.record===supplier.id&&e.reason==='Confirmed designated entity'))
})
