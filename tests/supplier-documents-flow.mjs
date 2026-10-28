
import assert from 'node:assert/strict'
import {harness} from './purse-harness.mjs'

export async function supplier_documentsFlow(){
{
 // SUPPLIER-004 dated evidence, clock-driven supplier/owner reminders, lapse holds and reviewed replacement
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 let rejectMail=false
 const h=await harness({mail:()=>rejectMail?Response.json({message:'Recipient rejected'},{status:422}):Response.json({id:crypto.randomUUID()})});t.after(()=>h.close())
 const {command:cmd,state,send}=h
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(Date.now())
 const today=['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-')
 const day=offset=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10)
 await cmd('business',{name:'Summit civil works',currencies:['USD'],locations:['Denver'],costCentres:['Field'],projects:['Site']})
 const buyer=await h.member('buyer@example.test',['buyer']),requester=await h.member('requester@example.test',['requester']),approver=await h.member('approver@example.test',['approver']),receiver=await h.member('receiver@example.test',['receiver'])
 const supplier=await cmd('supplier',{name:'Summit lifting equipment',status:'preferred',reason:'Approved lifting provider',contacts:[{name:'Casey',email:'compliance@summit.example.test'}]},buyer)
 await cmd('policy',{name:'Field budget',currency:'USD',category:'Equipment',project:'Site',approver:'approver@example.test',limitMinor:1000000,budgetMinor:1000000})
 const purchase=async()=>{
  const r=await cmd('request',{title:'Site lifting harnesses',supplier:supplier.id,currency:'USD',needDate:day(30),location:'Denver',costCentre:'Field',terms:'Net 30',lines:[{description:'Harness',quantity:'2',unitMinor:12500,category:'Equipment',project:'Site'}]},requester)
  await cmd('submit',{id:r.id,revision:r.revision},requester);await cmd('decision',{id:r.id,revision:r.revision,decision:'approved',reason:'Safety equipment reviewed'},approver);return r
 }
 const issuedRequest=await purchase(),issued=await cmd('convert',{id:issuedRequest.id,revision:1},buyer);await cmd('issue',{id:issued.id,revision:1,reason:'Approved document issued'},buyer)
 const preparedRequest=await purchase(),prepared=await cmd('convert',{id:preparedRequest.id,revision:1},buyer)
 const file=await cmd('attachment',{kind:'supplier',record:supplier.id,privateSupplierDocument:true,name:'certificate-of-insurance.pdf',mediaType:'application/pdf',base64:Buffer.from('%PDF-1.4\nCOI policy C-842 original bytes').toString('base64')},buyer)
 let doc=await cmd('supplier-document',{supplier:supplier.id,type:'insurance',attachment:file.id,expires:day(-1),required:true,reminderDays:[7,0],refreshEveryDays:365,version:0},buyer)
 assert.equal(doc.version,1);assert.equal(doc.attachment,file.id)
 const before=(await state(buyer)).data
 assert.equal(before.supplierDocument.find(d=>d.id===doc.id).compliance.lapsed,true)
 const tick=async offset=>{const response=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+new Date(day(offset)+'T17:00:00Z').getTime());assert.equal(response.status,200,await response.text())}
 const mailBefore=h.messages.length
 await tick(-10);assert.equal(h.messages.length,mailBefore)
 await tick(-7);assert.equal(h.messages.length,mailBefore+2)
 const reminders=h.messages.slice(mailBefore)
 assert.ok(reminders.some(m=>m.to.includes('compliance@summit.example.test')))
 assert.ok(reminders.some(m=>m.to.includes('owner@example.test')))
 assert.ok(reminders.every(m=>m.text.includes(doc.expires)&&m.subject.includes(supplier.name)))
 await tick(-7);assert.equal(h.messages.length,mailBefore+2,'One persisted attempt per scheduled reminder')
 await tick(0);assert.equal(h.messages.length,mailBefore+4)
 let remindersState=(await state(buyer)).data.supplierDocumentReminder
 assert.equal(remindersState.length,2);assert.ok(remindersState.every(r=>r.outcomes.length===2&&r.outcomes.every(o=>o.status==='accepted'&&o.providerMessageId)))
 await cmd('convert',{id:(await purchase()).id,revision:1},buyer,409)
 await cmd('issue',{id:prepared.id,revision:1,reason:'Cannot bypass expired COI'},buyer,409)
 await cmd('receipt',{order:issued.id,line:issued.lines[0].id,event:'receive',quantity:'1',reason:'Existing issued supply accepted'},receiver)
 await cmd('invoice',{order:issued.id,reference:'S-842',source:'Supplier original invoice',allocations:[{line:issued.lines[0].id,quantity:'1',amountMinor:12500}]},buyer)
 const refreshMail=[...h.messages].reverse().find(m=>m.to.includes('compliance@summit.example.test'))
 const refreshUrl=refreshMail.text.match(/http:\/\/[^\s]+\/api\/purse\/supplier-refresh\/[A-Za-z0-9_-]+/)[0]
 const publicGet=await fetch(refreshUrl)
 assert.equal(publicGet.status,200)
 const publicPage=await publicGet.text()
 assert.ok(!publicPage.includes(supplier.name)&&!publicPage.includes(file.id)&&!publicPage.includes('certificate-of-insurance.pdf'))
 assert.equal(publicGet.headers.get('referrer-policy'),'strict-origin')
 const payload=()=>{const form=new FormData();form.set('file',new File(['Renewed COI policy C-842; expiry '+day(365)],'renewed-coi.txt',{type:'text/plain'}));return form}
 assert.equal((await fetch(refreshUrl,{method:'POST',headers:{origin:'https://attacker.example.test'},body:payload()})).status,403)
 const uploads=await Promise.all([1,2].map(()=>fetch(refreshUrl,{method:'POST',headers:{origin:h.origin},body:payload()})))
 assert.deepEqual(uploads.map(r=>r.status).sort(),[200,410],(await Promise.all(uploads.map(r=>r.text()))).join('\n'))
 assert.equal((await fetch(refreshUrl)).status,410)
 const pending=(await state(buyer)).data.supplierDocumentSubmission.find(p=>p.document===doc.id)
 assert.equal(pending.status,'pending')
 assert.equal((await state(buyer)).data.supplierDocument.find(d=>d.id===doc.id).compliance.lapsed,true,'An unreviewed supplier upload cannot lift a hold')
 await cmd('issue',{id:prepared.id,revision:1,reason:'Pending upload cannot release hold'},buyer,409)
 const replacedFile={id:pending.attachment}
 assert.equal((await send('/api/purse/download/attachment/'+replacedFile.id,undefined,requester)).status,403)
 assert.ok(!(await state(requester)).data.attachment.some(f=>f.id===replacedFile.id||f.id===file.id))
 assert.ok(!(await state(requester)).data.supplierDocumentSubmission.length)
 doc=await cmd('review-supplier-document',{id:doc.id,version:doc.version,attachment:replacedFile.id,submission:pending.id,expires:day(365)},buyer)
 assert.equal((await state(buyer)).data.supplierDocumentSubmission.find(p=>p.id===pending.id).status,'reviewed')
 assert.equal(doc.history.length,1);assert.equal(doc.history[0].attachment,file.id)
 assert.equal((await state(buyer)).data.supplierDocument.find(d=>d.id===doc.id).compliance.lapsed,false)
 assert.equal((await state(buyer)).data.supplier.find(s=>s.id===supplier.id).status,'preferred')
 assert.equal((await cmd('issue',{id:prepared.id,revision:1,reason:'COI refreshed and reviewed'},buyer)).status,'issued')
 const download=await send('/api/purse/download/attachment/'+file.id,undefined,buyer)
 assert.match(download.value,/COI policy C-842 original bytes/)
 for(const type of ['w9','license','security-review','agreement'])await cmd('supplier-document',{supplier:supplier.id,type,attachment:replacedFile.id,expires:day(90),required:false,reminderDays:[30],...(type==='w9'?{refreshEveryDays:1}:{}),version:0},buyer)
 assert.equal((await state(buyer)).data.supplierDocument.length,5)
 const cycleBefore=h.messages.length
 await tick(2);assert.equal(h.messages.length,cycleBefore+2)
 assert.ok((await state(buyer)).data.supplierDocumentReminder.some(r=>r.reason==='cycle'&&r.outcomes.length===2))
 await tick(2);assert.equal(h.messages.length,cycleBefore+2)
 assert.equal((await state(requester)).data.supplierDocument.length,0)
 rejectMail=true
 const failureDoc=await cmd('supplier-document',{supplier:supplier.id,type:'license',attachment:replacedFile.id,expires:day(-2),required:false,reminderDays:[0],version:0},buyer)
 await tick(0)
 assert.ok((await state(buyer)).data.supplierDocumentReminder.find(r=>r.document===failureDoc.id).outcomes.every(o=>o.status==='rejected'))
 const failedMailCount=h.messages.length
 await tick(0);assert.equal(h.messages.length,failedMailCount,'Rejected provider submissions remain recorded without hidden retries')
 rejectMail=false
 const manual=await send('/api/purse/supplier-document-refresh',{id:doc.id},buyer)
 assert.equal(manual.status,200)
 const manualUrl=manual.value.reminders[0].refreshUrl
 assert.equal((await fetch(manualUrl)).status,200)
 assert.ok(!JSON.stringify((await state()).data).includes(manualUrl.split('/').at(-1)))
 doc=await cmd('review-supplier-document',{id:doc.id,version:doc.version,attachment:replacedFile.id,expires:day(366)},buyer)
 assert.equal((await fetch(manualUrl)).status,410,'Review invalidates older document-version links')
 const alias=await cmd('supplier',{name:'Summit regional hoist subsidiary',status:'active',reason:'Approved regional legal entity'},buyer)
 const aliasFile=await cmd('attachment',{kind:'supplier',record:alias.id,privateSupplierDocument:true,name:'regional-license.txt',mediaType:'text/plain',base64:Buffer.from('Expired regional operating license').toString('base64')},buyer)
 await cmd('supplier-document',{supplier:alias.id,type:'license',attachment:aliasFile.id,expires:day(-1),required:true,reminderDays:[],version:0},buyer)
 const merge=await cmd('preview-supplier-merge',{source:alias.id,target:supplier.id},buyer)
 await cmd('merge-suppliers',{source:alias.id,target:supplier.id,fingerprint:merge.fingerprint,reason:'Reviewed subsidiary registration and consolidated supplier history'},buyer)
 await cmd('convert',{id:(await purchase()).id,revision:1},buyer,409)
 const pristine=(await state()).data
 for(const cookie of [requester,approver,receiver])await cmd('supplier-document',{supplier:supplier.id,type:'license',attachment:file.id,expires:day(30),required:true,reminderDays:[7],version:0},cookie,403)
 await cmd('review-supplier-document',{id:doc.id,version:1,attachment:file.id,expires:day(30)},buyer,409)
 await cmd('review-supplier-document',{id:doc.id,version:doc.version,attachment:file.id,expires:'2026-02-30'},buyer,400)
 assert.deepEqual((await state()).data,pristine)
 assert.equal((await send('/api/purse/supplier-document-refresh',{id:doc.id},requester)).status,403)
 assert.equal((await send('/api/purse/supplier-reminders',{},requester)).status,403)
 assert.equal((await send('/api/purse/supplier-reminders',{})).status,401)

 } finally {for(const close of cleanups.reverse())await close();}
}
}
