import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {localCompanyPolicy} from './agent-door-source-agents.mjs'

const value=answer=>{assert.equal(answer.result?.isError,false,answer.result?._meta?.['com.runeditrun/error']?.code);return answer.result.structuredContent}
const code=answer=>answer.result?._meta?.['com.runeditrun/error']?.code
const automatic={schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'all',class:'*',do:'autonomous'}],spend:{none:true}}

export async function scheduledChasePolicyProof({c,h,reader,readerToken}) {
 await c.adopt(automatic)
 await h.command('agent-policy',{agent:'AGENT-003',purchaseType:'*',version:0,enabled:true,cadenceDays:1,maxChases:2,reason:'Native owner enables bounded follow-up'})
 const supplier=(await h.state()).data.supplier[0]
 const create=async()=>{
  const draft=await h.command('request',{title:'Due source-exact follow-up',supplier:supplier.id,currency:'USD',needDate:new Date(Date.now()-172800000).toISOString().slice(0,10),location:'Denver',costCentre:'Operations',lines:[{description:'Synthetic scheduled item',quantity:'1',unitMinor:1000,category:'Safety',project:'Workshop'}],freightMinor:0,taxMinor:0,terms:'Approved native source'},reader)
  await h.command('submit',{id:draft.id,revision:draft.revision},reader);await h.command('decision',{id:draft.id,revision:draft.revision,decision:'approved',reason:'Independent current approval'})
  const order=await h.command('convert',{id:draft.id,revision:draft.revision,issue:true})
  const policy=await h.command('order-chase-policy',{order:order.id,version:0,agent:'AGENT-003',enabled:true,cadenceDays:1,maxChases:2,escalateTo:['owner','example.test'].join('@')})
  const response=await h.send('/api/purse/agent-schedule/plan',{id:order.id,version:policy.version},h.owner)
  assert.equal(response.status,200);return {order,policy,args:response.value.args}
 }
 const native=await create(),start=h.messages.length
 const nativeRun=await h.send('/api/purse/agent-schedule/run',{id:native.order.id},h.owner)
 assert.equal(nativeRun.status,200);assert.equal(nativeRun.value.events.length,1);assert.equal(h.messages.length,start+1)
 const source=await create(),args={...source.args,idempotency_key:randomUUID()},before=(await h.state()).data
 const future=await c.tool('purse.agents.advance',{...args,tick:Date.now()+86400000})
 assert.equal(code(future),'native_conflict');assert.deepEqual((await h.state()).data,before)
 assert.equal(code(await c.tool('purse.agents.advance',args,{token:readerToken})),'permission_denied')
 const started=Date.now(),backdated={...args,tick:args.tick-365*86400000}
 const result=await c.tool('purse.agents.advance',backdated),event=value(result).events[0]
 assert.ok(Date.parse(event.at)>=started&&Date.parse(event.at)<=Date.now(),'Transport input cannot backdate native mail or audit evidence')
 assert.deepEqual(result.decision.classes.map(row=>row.class),['sensitive','external'])
 assert.equal(event.order,source.order.id);assert.equal(event.sequence,1);assert.equal(event.kind,'chase')
 assert.equal(event.reason,'overdue-delivery');assert.ok(event.preparedBy.agent.id);assert.equal(event.companyDecision.id,result.decision.id)
 const normalize=row=>({kind:row.kind,reason:row.reason,sequence:row.sequence,policyVersion:row.policyVersion,outcome:row.outcome.status})
 assert.deepEqual(normalize(event),normalize(nativeRun.value.events[0]))
 const replayState=(await h.state()).data,mail=h.messages.length
 assert.deepEqual(value(await c.tool('purse.agents.advance',backdated)).events,[event])
 assert.deepEqual((await h.state()).data,replayState);assert.equal(h.messages.length,mail)
 const pendingSource=await create()
 await c.adopt({...automatic,rules:[{id:'all',class:'*',do:'approval',approver:['sponsor'],wait:'PT1H'}]})
 const pending=await c.tool('purse.agents.advance',{...pendingSource.args,idempotency_key:randomUUID()}),quiet=h.messages.length
 assert.ok(pending.result?._meta?.['com.runeditrun/approval'])
 await h.command('order-chase-policy',{...pendingSource.policy,version:pendingSource.policy.version,enabled:false})
 assert.equal((await c.decideApproval(pending)).body.approval.state,'refused');assert.equal(h.messages.length,quiet)
 await c.adopt({...automatic,rules:[{id:'all',class:'*',do:'blocked'}]})
 const blockedSource=await create(),blockedBefore=(await h.state()).data
 assert.equal(code(await c.tool('purse.agents.advance',{...blockedSource.args,idempotency_key:randomUUID()})),'policy_blocked')
 assert.deepEqual((await h.state()).data,blockedBefore);assert.equal(h.messages.length,quiet)
 await c.adopt(automatic)
 console.log('PROBE BASE-AGENT-002 scheduled chase: native HTTP and MCP -> matching one claimed attempt and network-edge acceptance; replay sends once; future clock, foreign sponsor, blocked policy and stale approval refuse')
}

export async function scheduledNativeChaseJourney() {
 const {agentGovernanceFixture}=await import('./agent-governance-fixture.mjs')
 const f=await agentGovernanceFixture({worker:'tests/agent-door-worker.ts'})
 try {
  const {h}=f
  await f.cmd('agent-policy',f.controls);await f.cmd('order-chase-policy',f.schedule,f.buyer)
  await localCompanyPolicy(h)
  const tick=Date.parse(f.order.issuedAt)+86400000,mail=h.messages.length
  const response=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+tick)
  assert.equal(response.status,200);await response.text()
  const data=(await h.state()).data,event=data.orderChaseEvent.find(row=>row.order===f.order.id)
  assert.ok(event);assert.equal(h.messages.length,mail+1);assert.ok(event.preparedBy.agent.id)
  const audit=await h.send('/agents/api/audit?agent='+encodeURIComponent(event.preparedBy.agent.id),undefined,h.owner)
  assert.equal(audit.status,200);assert.ok(audit.value.rows.some(row=>row.tool==='purse.agents.advance'&&row.door==='embedded'&&row.id===event.companyDecision.id))
  const repeat=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+tick)
  assert.equal(repeat.status,200);await repeat.text();assert.equal(h.messages.length,mail+1)
  await localCompanyPolicy(h,'blocked')
  const blocked=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+(tick+86400000))
  assert.equal(blocked.status,200);await blocked.text();assert.equal(h.messages.length,mail+1)
  console.log('PROBE BASE-AGENT-002 native Cron: due configured supplier follow-up -> embedded shared tool and attributed native audit; repeated tick sends once; blocked company policy sends nothing')
 }finally{await f.close()}
}

const valueMail=(h,title)=>h.messages.filter(message=>message.subject===('Usefulness check-in: '+title))
const day=86400000
const tick=async(h,now)=>{const response=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+now);assert.equal(response.status,200,await response.text())}
const nativeCommercial=async h=>(await h.db.prepare("SELECT kind,id,revision,value FROM p_records WHERE business='main' AND kind IN ('request','decision','order','commitment','recurringScenario','recurringScenarioConsent','recurringScenarioDraft') ORDER BY kind,id").all()).results
async function recordedAdmission(h,event) {
 const prepared=event.companyPreparedBy??event.preparedBy
 assert.ok(prepared.agent.id);assert.ok(event.companyDecision.id)
 const audit=await h.send('/agents/api/audit?agent='+encodeURIComponent(prepared.agent.id),undefined,h.owner)
 assert.equal(audit.status,200)
 assert.ok(audit.value.rows.some(row=>row.id===event.companyDecision.id&&row.tool==='purse.agents.advance'&&row.door==='embedded'&&row.outcome==='done'))
}

export async function scheduledValueAndRecurringJourney() {
 const {recurringScenarioFixture}=await import('./recurring-scenario-fixture.mjs')
 const f=await recurringScenarioFixture({worker:'tests/agent-door-worker.ts'})
 try {
  const {h}=f;await localCompanyPolicy(h)
  const before=await nativeCommercial(h),data=(await h.state()).data,delivery=data.receipt.find(row=>row.order===f.orders[0].id)
  const due=Date.parse(delivery.at)+30*day,mail=valueMail(h,f.requests[0].title).length
  await Promise.all([tick(h,due),tick(h,due)])
  const after=(await h.state()).data,event=after.valueCheckin.find(row=>row.request===f.requests[0].id&&row.intervalDays===30)
  assert.ok(event);assert.equal(event.outcome.status,'accepted');assert.equal(event.report.promisedSeats,50);assert.equal(event.report.activeSeats,31);assert.equal(event.report.shortfall,19)
  assert.equal(after.valueCheckin.filter(row=>row.request===f.requests[0].id&&row.intervalDays===30).length,1)
  const sent=valueMail(h,f.requests[0].title).length;assert.ok(sent>mail);await tick(h,due);assert.equal(valueMail(h,f.requests[0].title).length,sent)
  await recordedAdmission(h,event);assert.deepEqual(await nativeCommercial(h),before)
  await localCompanyPolicy(h,'blocked');await tick(h,Date.parse(delivery.at)+90*day)
  assert.equal(valueMail(h,f.requests[0].title).length,sent);await localCompanyPolicy(h);await tick(h,Date.parse(delivery.at)+91*day);assert.equal(valueMail(h,f.requests[0].title).length,sent,'A denied native interval cannot backfill later')
  await tick(h,Date.parse(f.agreements[0].noticeDeadline+'T12:00:00Z')-6*day)
  const notices=(await h.state()).data.recurringDiscoveryNotice
  assert.ok(notices.length,'The recorded renewal window produces real in-app proposals')
  for(const notice of notices)await recordedAdmission(h,notice)
  const ids=notices.map(row=>row.id).sort();await tick(h,due)
  assert.deepEqual((await h.state()).data.recurringDiscoveryNotice.map(row=>row.id).sort(),ids)
  assert.deepEqual(await nativeCommercial(h),before)
  console.log('PROBE BASE-AGENT-002 scheduled value and recurring: native Cron -> attributed shared admissions, 50 promised, 31 active, 19 shortfall, nonempty source-bound in-app proposals; concurrent and repeated ticks claim once; blocked intervals do not backfill; purchasing unchanged')
 }finally{await f.close()}
}

export async function scheduledErasureJourney() {
 const {recurringScenarioFixture}=await import('./recurring-scenario-fixture.mjs')
 const {reauthenticateErasure}=await import('./erasure-flow.mjs')
 let enter,release
 const entered=new Promise(resolve=>{enter=resolve}),blocked=new Promise(resolve=>{release=resolve})
 let held=false,work
 const f=await recurringScenarioFixture({worker:'tests/agent-door-worker.ts',mail:async message=>{
  if(!held&&message.subject.startsWith('Usefulness check-in')){held=true;enter();await blocked}
  return Response.json({id:randomUUID()})
 }})
 try {
  const {h}=f;await localCompanyPolicy(h)
  const before=(await h.state()).data,request=before.request.find(row=>row.id===f.requests[0].id),delivery=before.receipt.find(row=>row.order===f.orders[0].id),due=Date.parse(delivery.at)+30*day
  work=tick(h,due)
  let timer
  try {await Promise.race([entered,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Scheduled mail did not reach the network edge')),20000)})])}finally{clearTimeout(timer)}
  await h.command('member',{email:request.requesterEmail,name:request.requesterEmail,roles:['requester'],active:false})
  await reauthenticateErasure(h)
  const meta=await h.send('/api/purse/erasure',undefined,h.owner)
  const preview=await h.send('/api/purse/erasure/preview',{kind:'member',id:request.requesterEmail,revision:meta.value.revision},h.owner)
  assert.equal(preview.status,200,JSON.stringify(preview.value));const p=preview.value
  const erased=await h.send('/api/purse/erasure/execute',{...p.subject,revision:p.revision,review:p.review,fingerprint:p.fingerprint,consent:true},h.owner)
  assert.equal(erased.status,200,JSON.stringify(erased.value));release();await work
  const state=(await h.state()).data,audit=await h.send('/agents/api/audit',undefined,h.owner),serialized=JSON.stringify({state,audit:audit.value})
  const retained=[];const locate=(value,path)=>{if(typeof value==='string'&&value.includes(request.requesterEmail))retained.push(path);else if(Array.isArray(value))value.forEach((child,i)=>locate(child,path+'.'+i));else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value))locate(child,path+'.'+key)};locate({state,audit:audit.value},'retained')
  assert.ok(!serialized.includes(request.requesterEmail),'Late completion must not restore erased email: '+retained.join(', '))
  assert.ok(!serialized.includes(request.requester),'Late completion must not restore retired native identity')
  const sent=h.messages.length;await tick(h,due);assert.equal(h.messages.length,sent)
  assert.equal((await h.send('/api/purse/state',undefined,f.requester)).status,401)
  assert.ok(state.valueCheckin.some(row=>row.request===request.id),'Erasure preserves the non-authorizing once-only claim')
  console.log('PROBE BASE-AGENT-002 in-flight erasure: native Cron mail held at network edge, then native erasure -> late completion restores no person or authority; old session refuses; repeated tick sends nothing')
 }finally{release();if(work)await work;await f.close()}
}
