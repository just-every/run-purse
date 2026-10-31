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
 const result=await c.tool('purse.agents.advance',args),event=value(result).events[0]
 assert.deepEqual(result.decision.classes.map(row=>row.class),['sensitive','external'])
 assert.equal(event.order,source.order.id);assert.equal(event.sequence,1);assert.equal(event.kind,'chase')
 assert.equal(event.reason,'overdue-delivery');assert.ok(event.preparedBy.agent.id);assert.equal(event.companyDecision.id,result.decision.id)
 const normalize=row=>({kind:row.kind,reason:row.reason,sequence:row.sequence,policyVersion:row.policyVersion,outcome:row.outcome.status})
 assert.deepEqual(normalize(event),normalize(nativeRun.value.events[0]))
 const replayState=(await h.state()).data,mail=h.messages.length
 assert.deepEqual(value(await c.tool('purse.agents.advance',args)).events,[event])
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
