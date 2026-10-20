import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {harness} from './purse-harness.mjs'
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs'

const day=86400000
async function fixture(t,options={}) {
 const h=await harness(options);t.after(()=>h.close())
 await h.command('business',{name:'Value check-in business',currencies:['USD'],locations:['Denver'],costCentres:['IT'],projects:['Operations'],timezone:'America/Denver'})
 const requester=await h.member('requester@example.test',['requester']),approver=await h.member('approver@example.test',['approver'])
 const supplier=await h.command('supplier',{name:'Software provider',status:'preferred',reason:'Reviewed supplier',contacts:[{name:'Supplier',email:'supplier@example.test'}]})
 await h.command('policy',{name:'IT purchases',currency:'USD',category:'*',project:'*',approver:'approver@example.test',limitMinor:1000000,budgetMinor:10000000})
 const read=async()=>(await h.state()).data
 const tick=async now=>{const response=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+now);assert.equal(response.status,200,await response.text())}
 const policy=async enabled=>{const current=(await read()).valuePolicy.find(p=>p.id==='main');return h.command('value-policy',{enabled,version:current?.version??0,reason:enabled?'Enable value check-ins':'Pause value check-ins'})}
 const purchase=async(title='50-seat software',cookie=requester,promise={kind:'seats',seats:50})=>{
  const request=await h.command('request',{title,supplier:supplier.id,currency:'USD',needDate:'2026-12-20',location:'Denver',costCentre:'IT',terms:'Net 30',valuePromise:promise,lines:[{description:'Software seats',quantity:'50',unitMinor:1000,category:'Software',project:'Operations'}]},cookie)
  await h.command('submit',{id:request.id,revision:request.revision},cookie)
  await h.command('decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Approved exact promised outcome'},approver)
  const decision=(await read()).decision.find(d=>d.request===request.id&&d.revision===request.revision&&d.decision==='approved')
  assert.ok(decision?.at)
  return {...request,approvedAt:Date.parse(decision.at),decision}
 }
 await policy(true)
 return {h,read,tick,policy,purchase,requester,approver,supplier}
}

test('AGENT-005 real scheduled 30/90-day requester check-ins claim once concurrently, retain exact sources and consume paused intervals',async t=>{
 const {h,read,tick,policy,purchase,requester,approver}=await fixture(t)
 const request=await purchase()
 const original=JSON.stringify({seats:Array.from({length:50},(_,index)=>({id:'seat-'+index,active:index<31}))})
 const attachment=await h.command('attachment',{kind:'request',record:request.id,name:'provider-seats.json',mediaType:'application/json',base64:Buffer.from(original).toString('base64')},requester)
 const usage=await h.command('value-seat-import',{request:request.id,revision:request.revision,attachment:attachment.id,provider:'Identity provider export',periodStart:'2026-10-01',periodEnd:'2026-10-20',activeRule:'active-true'},requester)
 const before=h.messages.length
 await tick(request.approvedAt+30*day-1)
 assert.equal(h.messages.length,before,'Nothing is due before the full elapsed interval')
 await Promise.all([tick(request.approvedAt+30*day),tick(request.approvedAt+30*day)])
 assert.equal(h.messages.length,before+1,'Concurrent scheduled invocations submit one message')
 let data=await read(),events=data.valueCheckin.filter(e=>e.request===request.id)
 assert.equal(events.length,1)
 const event=events[0]
 assert.equal(event.approvedDecision,request.decision.id)
 assert.equal(event.approvedAt,request.decision.at)
 assert.equal(event.outcome.status,'accepted','Network edge acceptance is recorded without a delivery claim')
 assert.deepEqual(h.messages.at(-1).to,['requester@example.test'])
 const url=new URL(event.confirmationUrl)
 assert.equal(url.pathname,'/app');assert.equal(url.searchParams.get('valueRequest'),request.id);assert.equal(url.searchParams.get('valueRevision'),String(request.revision))
 assert.ok(h.messages.at(-1).text.includes(url.href))
 assert.equal(event.report.activeSeats,31);assert.equal(event.report.shortfall,19)
 const seatSource=event.sources.find(s=>s.kind==='valueSeatImport'&&s.id===usage.id),bytesSource=event.sources.find(s=>s.kind==='attachment'&&s.id===attachment.id)
 assert.equal(seatSource.value.sha256,createHash('sha256').update(original).digest('hex'))
 assert.equal(Buffer.from(bytesSource.value.base64,'base64').toString(),original)
 for(const source of event.sources) {
  const current=await h.db.prepare("SELECT revision,value FROM p_records WHERE business='main' AND kind=? AND id=?").bind(source.kind,source.id).first()
  assert.equal(source.version,current.revision)
  assert.deepEqual(source.value,JSON.parse(current.value),'Source snapshots preserve exact recorded evidence')
 }
 assert.equal(data.agentRun.find(r=>r.id===event.run).inputs.fingerprint,event.inputs.fingerprint)
 assert.ok(data.proposedAction.some(p=>p.run===event.run&&p.action==='value-confirm'))
 assert.ok(data.audit.some(a=>a.action==='value-checkin'&&a.checkin===event.id&&a.outcome==='accepted'))
 const answer={id:event.run,version:1,request:request.id,revision:request.revision,fingerprint:event.inputs.fingerprint,usefulness:true,notes:'Useful to the requesting team'}
 await h.command('value-confirm',answer,approver,403)
 const confirmation=await h.command('value-confirm',answer,requester)
 assert.equal(confirmation.run,event.run,'The scheduled report supports the same requester confirmation door')
 await policy(false)
 await tick(request.approvedAt+90*day)
 data=await read();events=data.valueCheckin.filter(e=>e.request===request.id)
 assert.equal(events.length,2)
 assert.equal(events.find(e=>e.intervalDays===90).outcome.status,'suppressed')
 assert.equal(h.messages.length,before+1)
 await policy(true)
 await tick(request.approvedAt+91*day)
 assert.equal(h.messages.length,before+1,'Re-enable cannot replay a suppressed or previously accepted interval')
 assert.equal((await read()).valueCheckin.filter(e=>e.request===request.id).length,2)
 const records=(await h.db.prepare('SELECT * FROM p_records').all()).results
 assert.equal(validatePurchasingArchive(records),true,'Scheduled claims, source snapshots and requester confirmations satisfy restore validation')
})

test('AGENT-005 scheduled check-ins reject current revoked/inactive requester authority and never retry uncertain mail or stale revisions',async t=>{
 let uncertain=false
 const {h,read,tick,policy,purchase,requester}=await fixture(t,{mail:()=>uncertain?new Response('Unavailable',{status:503}):Response.json({id:crypto.randomUUID()})})
 const revoked=await purchase('Revoked requester purchase')
 await h.command('member',{email:'requester@example.test',name:'Requester',roles:['buyer'],active:true})
 const before=h.messages.length
 await tick(revoked.approvedAt+30*day)
 assert.equal(h.messages.length,before)
 assert.equal((await read()).valueCheckin.find(e=>e.request===revoked.id).outcome.status,'suppressed')
 await h.command('member',{email:'requester@example.test',name:'Requester',roles:['requester'],active:true})
 const inactive=await purchase('Inactive native requester purchase')
 assert.equal((await h.send('/auth/operator/status',{operatorId:inactive.requester,status:'inactive'},h.owner)).status,200)
 await tick(inactive.approvedAt+30*day)
 assert.equal(h.messages.length,before,'Active purchasing membership cannot bypass inactive native identity')
 assert.equal((await read()).valueCheckin.find(e=>e.request===inactive.id).outcome.status,'suppressed')
 const other=await h.member('other@example.test',['requester'])
 const unknown=await purchase('Uncertain mail submission',other)
 uncertain=true
 await tick(unknown.approvedAt+30*day)
 const sent=h.messages.length
 assert.equal(sent,before+2,'One new member invitation and one check-in reach the network edge')
 assert.equal((await read()).valueCheckin.find(e=>e.request===unknown.id).outcome.status,'uncertain')
 uncertain=false
 await policy(false);await policy(true)
 await Promise.all([tick(unknown.approvedAt+31*day),tick(unknown.approvedAt+31*day)])
 assert.equal(h.messages.length,sent,'Uncertain claims cannot retry even after pause/re-enable')
 const stale=await purchase('Amended value promise',other)
 await h.command('request',{...stale,id:stale.id,revision:stale.revision,title:'New unapproved promise',valuePromise:{kind:'seats',seats:60},reason:'Changed promised outcome'},other)
 await tick(stale.approvedAt+30*day)
 assert.equal(h.messages.length,sent)
 assert.ok(!(await read()).valueCheckin.some(e=>e.request===stale.id),'An old approved revision cannot authorize a current amended draft')
 const self=await purchase('Owner requested for themselves',h.owner)
 await tick(self.approvedAt+30*day)
 assert.equal(h.messages.length,sent+1,'Exact current native owners may check in on their own purchases')
 assert.deepEqual(h.messages.at(-1).to,['owner@example.test'])
})
