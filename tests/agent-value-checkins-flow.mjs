
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {harness} from './purse-harness.mjs'

const day=86400000
async function fixture(t,options={}) {
 const h=await harness(options);t.after(()=>h.close())
 await h.command('business',{name:'Value check-in business',currencies:['USD'],locations:['Denver'],costCentres:['IT'],projects:['Operations'],timezone:'America/Denver'})
 const requester=await h.member('requester@example.test',['requester']),approver=await h.member('approver@example.test',['approver'])
 const supplier=await h.command('supplier',{name:'Software provider',status:'preferred',reason:'Reviewed supplier',contacts:[{name:'Supplier',email:'supplier@example.test'}]})
 await h.command('policy',{name:'IT purchases',currency:'USD',category:'*',project:'*',approver:'approver@example.test',limitMinor:1000000,budgetMinor:10000000})
 const read=async()=>(await h.state()).data
 const tick=async now=>{const response=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+now);assert.equal(response.status,200,await response.text())}
 const policy=async(enabled,purchaseTypes)=>{const current=(await read()).valuePolicy.find(p=>p.id==='main');return h.command('value-policy',{enabled,purchaseTypes,version:current?.version??0,reason:enabled?'Enable value check-ins':'Pause value check-ins'})}
 const purchase=async(title='50-seat software',cookie=requester,promise={kind:'seats',seats:50},deliver=true)=>{
  const request=await h.command('request',{title,supplier:supplier.id,currency:'USD',needDate:'2026-12-20',location:'Denver',costCentre:'IT',terms:'Net 30',valuePromise:promise,lines:[{description:'Software seats',quantity:'50',unitMinor:1000,category:'Software',project:'Operations'}]},cookie)
  await h.command('submit',{id:request.id,revision:request.revision},cookie)
  await h.command('decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Approved exact promised outcome'},approver)
  const decision=(await read()).decision.find(d=>d.request===request.id&&d.revision===request.revision&&d.decision==='approved')
  assert.ok(decision?.at)
  if(!deliver)return {...request,approvedAt:Date.parse(decision.at),decision}
  const converted=await h.command('convert',{id:request.id,revision:request.revision})
  const order=await h.command('issue',{id:converted.id,revision:converted.revision,reason:'Issue approved software order'})
  const first=await h.command('receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:'25',reason:'First software seats delivered'},cookie)
  const second=await h.command('receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:'25',reason:'Remaining software seats delivered'},cookie)
  const receipt=[first,second].sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id))[0]
  return {...request,approvedAt:Date.parse(decision.at),decision,deliveredAt:Date.parse(receipt.at),receipt,order:order.id}
 }
 await policy(true)
 return {h,read,tick,policy,purchase,requester,approver,supplier}
}

export async function agent_value_checkinsFlow(){
{
 // AGENT-005 real scheduled 30/90-day requester check-ins claim once concurrently, retain exact sources and consume paused intervals
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const {h,read,tick,policy,purchase,requester,approver}=await fixture(t)
 const undelivered=await purchase('Awaiting delivery',requester,{kind:'seats',seats:50},false),quiet=h.messages.length
 await tick(undelivered.approvedAt+90*day)
 assert.equal(h.messages.length,quiet,'Approval alone cannot trigger an after-delivery check-in')
 assert.ok(!(await read()).valueCheckin.some(e=>e.request===undelivered.id),'No delivery means no durable check-in claim')
 const request=await purchase()
 await policy(true,[' Software '])
 const original=JSON.stringify({seats:Array.from({length:50},(_,index)=>({id:'seat-'+index,active:index<31}))})
 const attachment=await h.command('attachment',{kind:'request',record:request.id,name:'provider-seats.json',mediaType:'application/json',base64:Buffer.from(original).toString('base64')},requester)
 const usageDate=request.receipt.at.slice(0,10)
 const usage=await h.command('value-seat-import',{request:request.id,revision:request.revision,attachment:attachment.id,provider:'Identity provider export',periodStart:usageDate,periodEnd:usageDate,activeRule:'active-true'},requester)
 const before=h.messages.length
 await tick(request.deliveredAt+30*day-1)
 assert.equal(h.messages.length,before,'Nothing is due before the full elapsed interval')
 await Promise.all([tick(request.deliveredAt+30*day),tick(request.deliveredAt+30*day)])
 assert.equal(h.messages.length,before+1,'Concurrent scheduled invocations submit one message')
 let data=await read(),events=data.valueCheckin.filter(e=>e.request===request.id)
 assert.equal(events.length,1)
 const event=events[0]
 assert.equal(event.approvedDecision,request.decision.id)
 assert.equal(event.approvedAt,request.decision.at)
 assert.equal(event.deliveryReceipt,request.receipt.id)
 assert.equal(event.deliveredAt,request.receipt.at)
 assert.equal(event.order,request.order)
 assert.equal(event.outcome.status,'accepted','Network edge acceptance is recorded without a delivery claim')
 assert.deepEqual(h.messages.at(-1).to,['requester@example.test'])
 const url=new URL(event.confirmationUrl)
 assert.equal(url.pathname,'/app');assert.equal(url.searchParams.get('valueRequest'),request.id);assert.equal(url.searchParams.get('valueRevision'),String(request.revision))
 assert.ok(h.messages.at(-1).text.includes(url.href))
 assert.equal(event.report.activeSeats,31);assert.equal(event.report.shortfall,19)
 const seatSource=event.sources.find(s=>s.kind==='valueSeatImport'&&s.id===usage.id),bytesSource=event.sources.find(s=>s.kind==='attachment'&&s.id===attachment.id)
 assert.equal(seatSource.value.sha256,createHash('sha256').update(original).digest('hex'))
 assert.ok(bytesSource)
 const run=data.agentRun.find(r=>r.id===event.run)
 assert.ok(!JSON.stringify(event.inputs).includes('"base64"'),'Check-in inputs retain attachment descriptors without original bytes')
 assert.ok(!JSON.stringify(run.inputs).includes('"base64"'),'Report inputs retain attachment descriptors without original bytes')
 const originalUrl=h.origin+'/api/purse/download/attachment/'+attachment.id
 assert.equal((await h.mf.dispatchFetch(originalUrl)).status,401,'Original bytes require a native session')
 const downloaded=await h.mf.dispatchFetch(originalUrl,{headers:{cookie:requester}})
 assert.equal(downloaded.status,200)
 const downloadedBytes=Buffer.from(await downloaded.arrayBuffer())
 assert.deepEqual(downloadedBytes,Buffer.from(original),'Native requester download preserves exact provider original bytes')
 assert.equal(createHash('sha256').update(downloadedBytes).digest('hex'),seatSource.value.sha256)
 for(const source of event.sources) {
  const current=await h.db.prepare("SELECT revision,value FROM p_records WHERE business='main' AND kind=? AND id=?").bind(source.kind,source.id).first()
  assert.equal(source.version,current.revision)
  const value=JSON.parse(current.value),expected=source.fields?Object.fromEntries(source.fields.filter(field=>Object.hasOwn(value,field)).map(field=>[field,value[field]])):value
  assert.deepEqual(source.value,expected,'Source snapshots preserve exact recorded evidence within their declared field projection')
 }
 assert.equal(run.inputs.fingerprint,event.inputs.fingerprint)
 assert.ok(data.proposedAction.some(p=>p.run===event.run&&p.action==='value-confirm'))
 assert.ok(data.audit.some(a=>a.action==='value-checkin'&&a.checkin===event.id&&a.outcome==='accepted'))
 const answer={id:event.run,version:1,request:request.id,revision:request.revision,fingerprint:event.inputs.fingerprint,usefulness:true,notes:'Useful to the requesting team'}
 await h.command('value-confirm',answer,approver,403)
 const confirmation=await h.command('value-confirm',answer,requester)
 assert.equal(confirmation.run,event.run,'The scheduled report supports the same requester confirmation door')
 await policy(true,['Hardware'])
 await tick(request.deliveredAt+90*day)
 data=await read();events=data.valueCheckin.filter(e=>e.request===request.id)
 assert.equal(events.length,2)
 assert.equal(events.find(e=>e.intervalDays===90).outcome.status,'suppressed')
 assert.equal(events.find(e=>e.intervalDays===90).outcome.code,'paused-or-policy-changed','An enabled policy for another type blocks the actual final send')
 assert.equal(h.messages.length,before+1)
 await policy(true,['Software'])
 await tick(request.deliveredAt+91*day)
 assert.equal(h.messages.length,before+1,'Re-enable cannot replay a suppressed or previously accepted interval')
 assert.equal((await read()).valueCheckin.filter(e=>e.request===request.id).length,2)
 const paused=await purchase('Owner-paused final check-in');await policy(false);const pausedBefore=h.messages.length;await tick(paused.deliveredAt+30*day);assert.equal(h.messages.length,pausedBefore);assert.equal((await read()).valueCheckin.find(e=>e.request===paused.id).outcome.status,'suppressed','Global pause still blocks the actual final send');await policy(true,['Software']);await tick(paused.deliveredAt+31*day);assert.equal(h.messages.length,pausedBefore,'Global pause also consumes the interval without replay')

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // AGENT-005 scheduled check-ins reject current revoked/inactive requester authority and never retry uncertain mail or stale revisions
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 let uncertain=false
 const {h,read,tick,policy,purchase,requester}=await fixture(t,{mail:()=>uncertain?new Response('Unavailable',{status:503}):Response.json({id:crypto.randomUUID()})})
 const revoked=await purchase('Revoked requester purchase')
 await h.command('member',{email:'requester@example.test',name:'Requester',roles:['finance-viewer'],active:true})
 const before=h.messages.length
 await tick(revoked.deliveredAt+30*day)
 assert.equal(h.messages.length,before)
 assert.equal((await read()).valueCheckin.find(e=>e.request===revoked.id).outcome.status,'suppressed')
 await h.command('member',{email:'requester@example.test',name:'Requester',roles:['requester'],active:true})
 const inactive=await purchase('Inactive native requester purchase')
 assert.equal((await h.send('/auth/operator/status',{operatorId:inactive.requester,status:'inactive'},h.owner)).status,200)
 await tick(inactive.deliveredAt+30*day)
 assert.equal(h.messages.length,before,'Active purchasing membership cannot bypass inactive native identity')
 assert.equal((await read()).valueCheckin.find(e=>e.request===inactive.id).outcome.status,'suppressed')
 const other=await h.member('other@example.test',['requester'])
 const unknown=await purchase('Uncertain mail submission',other)
 uncertain=true
 await tick(unknown.deliveredAt+30*day)
 const sent=h.messages.length
 assert.equal(sent,before+2,'One new member invitation and one check-in reach the network edge')
 assert.equal((await read()).valueCheckin.find(e=>e.request===unknown.id).outcome.status,'uncertain')
 uncertain=false
 await policy(false);await policy(true)
 await Promise.all([tick(unknown.deliveredAt+31*day),tick(unknown.deliveredAt+31*day)])
 assert.equal(h.messages.length,sent,'Uncertain claims cannot retry even after pause/re-enable')
 const stale=await purchase('Amended value promise',other)
 await h.command('request',{...stale,id:stale.id,revision:stale.revision,title:'New unapproved promise',valuePromise:{kind:'seats',seats:60},reason:'Changed promised outcome'},other)
 await tick(stale.deliveredAt+30*day)
 assert.equal(h.messages.length,sent)
 assert.ok(!(await read()).valueCheckin.some(e=>e.request===stale.id),'An old approved revision cannot authorize a current amended draft')
 const self=await purchase('Owner requested for themselves',h.owner)
 await tick(self.deliveredAt+30*day)
 assert.equal(h.messages.length,sent+1,'Exact current native owners may check in on their own purchases')
 assert.deepEqual(h.messages.at(-1).to,['owner@example.test'])

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // AGENT-006 public Cron proposes in the recorded notice window once per source, honoring purchase types and current finance grants without sending
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const {recurringScenarioFixture}=await import('./recurring-scenario-fixture.mjs')
 const f=await recurringScenarioFixture({mixedTypes:true});t.after(()=>f.close())
 const {h}=f,read=async()=>(await h.state()).data
 const valuePolicy=(await read()).valuePolicy.find(row=>row.id==='main');await h.command('value-policy',{version:valuePolicy.version,enabled:false,reason:'Keep this scheduled research flow independent of requester mail'})
 const rows=async kind=>(await h.db.prepare("SELECT id,value FROM p_records WHERE business='main' AND kind=?").bind(kind).all()).results.map(row=>({id:row.id,...JSON.parse(row.value)}))
 const tick=async now=>{const response=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+now);assert.equal(response.status,200,await response.text())}
 const configure=async enabled=>{const policy=(await read()).agentPolicy.find(row=>row.agent==='AGENT-006'&&row.purchaseType==='software');return h.command('agent-policy',{...policy,enabled,reason:enabled?'Enable scheduled recurring research':'Pause scheduled recurring research'})}
 const start=Date.parse(f.agreements[0].noticeDeadline+'T12:00:00Z')-7*day
 const before=await read(),mailBefore=h.messages.length
 const financialRows=async()=>(await h.db.prepare("SELECT kind,id,revision,value FROM p_records WHERE business='main' AND kind IN ('order','commitment','decision','recurringScenario','recurringScenarioConsent','recurringScenarioDraft') ORDER BY kind,id").all()).results
 const purchasingBefore=await financialRows()
 await tick(start-day)
 assert.equal((await rows('recurringDiscoveryNotice')).length,0,'No proposal notice precedes the recorded lead days')
 await configure(false);await tick(start)
 assert.equal((await rows('recurringDiscoveryNotice')).length,0,'Pause prevents scheduled proposals and notices')
 await configure(true)
 await h.command('member',{email:'synthetic-purse-903@example.test',name:'Finance reader',roles:['finance-viewer'],active:true})
 await Promise.all([tick(start),tick(start)])
 let notices=await rows('recurringDiscoveryNotice'),runs=(await rows('agentRun')).filter(row=>row.scheduled&&row.workflow==='recurring-discovery')
 assert.ok(notices.length);assert.ok(runs.length)
 assert.equal(new Set(runs.map(run=>run.proposals[0].id)).size,runs.length,'Agreements sharing a notice window notify each exact source proposal once')
 assert.ok(notices.every(notice=>notice.role==='owner'),'Finance read access alone cannot receive an approval proposal')
 assert.ok(runs.every(run=>run.proposals.every(proposal=>!proposal.agreementIds.includes(f.agreements[1].id))),'An enabled Software type cannot research a Hardware commitment')
 for(const run of runs){
  assert.equal(run.model,'none');assert.equal(run.provider,'none');assert.deepEqual(run.actions,[]);assert.deepEqual(run.messages,[])
  for(const proposal of run.proposals){
   const {id,...candidate}=proposal
   const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value)
   assert.equal(id,createHash('sha256').update(canonical({from:run.from,to:run.to,...candidate})).digest('hex'),'The exact cited source facts recompute the proposal identity')
   assert.ok(proposal.conditional&&proposal.reviewRequired)
   assert.ok(!JSON.stringify(proposal).includes('Ignore prior rules'),'Retained source text cannot become agent instructions')
  }
 }
 const originalIds=notices.map(notice=>notice.id).sort(),runIds=runs.map(run=>run.id).sort()
 await tick(start+day)
 assert.deepEqual((await rows('recurringDiscoveryNotice')).map(notice=>notice.id).sort(),originalIds,'Same source within the same window cannot repeat a notice')
 assert.deepEqual((await rows('agentRun')).filter(row=>row.scheduled).map(run=>run.id).sort(),runIds,'Repeated ticks cannot repeat proposal runs')
 await h.command('member',{email:'synthetic-purse-903@example.test',name:'Finance approver',roles:['buyer'],active:true})
 await tick(start+day)
 const newlyAuthorized=await rows('recurringDiscoveryNotice')
 assert.ok(newlyAuthorized.some(notice=>notice.role==='finance'&&notice.recipientEmail==='synthetic-purse-903@example.test'),'New current finance capability can receive the existing proposal inside its window')
 assert.deepEqual(newlyAuthorized.filter(notice=>notice.role==='owner').map(notice=>notice.id).sort(),originalIds,'New finance eligibility cannot repeat owner notices')
 assert.deepEqual((await rows('agentRun')).filter(row=>row.scheduled).map(run=>run.id).sort(),runIds,'New recipients reuse the same source proposal runs')
 f.agreements[0]=await h.command('agreement',{...f.agreements[0],confirmed:true,ownerMember:'synthetic-purse-901@example.test',renewalTermMonths:12,reason:'Owner confirms assigned owner and recorded renewal term'})
 await tick(start+day)
 notices=await rows('recurringDiscoveryNotice')
 const added=notices.filter(notice=>!originalIds.includes(notice.id))
 assert.ok(added.some(notice=>notice.role==='owner'&&notice.recipientEmail==='synthetic-purse-901@example.test'),'An exact active assigned agreement member receives an in-app proposal')
 assert.ok(added.some(notice=>notice.role==='finance'&&notice.recipientEmail==='synthetic-purse-903@example.test'),'Changed source creates a fresh proposal for currently authorized finance')
 const beforeRevocation=notices.map(notice=>notice.id)
 await h.command('member',{email:'synthetic-purse-903@example.test',name:'Scoped finance approver',grants:[{role:'buyer',scope:{departments:['Finance']}}],active:true})
 f.agreements[0]=await h.command('agreement',{...f.agreements[0],confirmed:true,renewalTermMonths:24,reason:'Owner confirms another recorded renewal term'})
 await tick(start+day)
 notices=await rows('recurringDiscoveryNotice')
 assert.ok(notices.some(notice=>!beforeRevocation.includes(notice.id)))
 assert.ok(notices.filter(notice=>!beforeRevocation.includes(notice.id)).every(notice=>notice.recipientEmail!=='synthetic-purse-903@example.test'),'A current out-of-scope finance grant cannot receive new proposal details')
 assert.equal((await h.state(f.finance)).data.recurringDiscoveryNotice.length,0,'Revoked source scope also hides earlier retained notices from that member')
 const currentIds=notices.map(notice=>notice.id).sort()
 f.agreements[0]=await h.command('agreement',{...f.agreements[0],confirmed:true,renewalTermMonths:36,reason:'Owner confirms later term outside the notice window'})
 await tick(start-day)
 assert.deepEqual((await rows('recurringDiscoveryNotice')).map(notice=>notice.id).sort(),currentIds,'A changed source outside the notice window cannot notify')
 assert.equal(h.messages.length,mailBefore,'Research never sends supplier or finance mail')
 const after=await read()
 assert.deepEqual(await financialRows(),purchasingBefore,'Scheduled research changes no durable purchasing field or revision')
 for(const kind of ['commitment','decision','recurringScenario','recurringScenarioConsent','recurringScenarioDraft'])assert.deepEqual(after[kind],before[kind],'Scheduled research cannot execute '+kind)

 } finally {for(const close of cleanups.reverse())await close();}
}
}
