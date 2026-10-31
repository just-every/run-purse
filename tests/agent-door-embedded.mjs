import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

const value=answer=>{assert.equal(answer.result?.isError,false);return answer.result.structuredContent}
const code=answer=>answer.result?._meta?.['com.runeditrun/error']?.code
const nonReport=data=>Object.fromEntries(['request','revision','decision','order','quoteAward','commitment','orderSend','rfqMailEvent'].map(kind=>[kind,data[kind]??[]]))

export async function embeddedNativeJourney({tool,request,origin,cookie}) {
 const native=async(path,body)=>{
  const response=await request(origin+path,{headers:{origin,cookie,...(body?{'content-type':['application','json'].join('/')}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})})
  assert.equal(response.status,200,path);return response.json()
 }
 const before=(await native('/api/purse/state')).data
 const args={question:'Show committed spend by supplier all recorded dates',idempotency_key:randomUUID()}
 const embedded=await native('/api/purse/command/spend-question',args)
 const mcp=value(await tool('purse.spend.answer',{...args,idempotency_key:randomUUID()}))
 const report=await native('/api/purse/spend-report?groupBy=supplier')
 assert.equal(embedded.status,'answered');assert.ok(embedded.report.rows.length>0)
 assert.deepEqual(embedded.figures,mcp.figures)
 assert.deepEqual(embedded.figures,report.totals.map(row=>({currency:row.currency,amountMinor:row.committedMinor,metric:'committed'})))
 assert.deepEqual(await native('/api/purse/command/spend-question',args),embedded)
 const target=before.request.find(row=>!row.imported&&row.lines.length)
 const codingArgs={kind:'request',id:target.id,idempotency_key:randomUUID()}
 const coding=await native('/api/purse/command/coding-agent-run',codingArgs)
 const codingMcp=value(await tool('purse.coding.prepare',{...codingArgs,idempotency_key:randomUUID()}))
 assert.deepEqual(coding.suggestions,codingMcp.suggestions);assert.deepEqual(coding.flags,codingMcp.flags)
 assert.equal(coding.target,target.id);assert.equal(coding.model,'none');assert.equal(coding.provider,'none')
 assert.deepEqual(await native('/api/purse/command/coding-agent-run',codingArgs),coding)
 for(const [run,name] of [[embedded,'purse.spend.answer'],[coding,'purse.coding.prepare']]) {
  assert.ok(run.preparedBy.agent.id);assert.ok(run.companyDecision.id)
  let cursor='',found=false
  for(;;) {
   const audit=await native('/agents/api/audit?agent='+encodeURIComponent(run.preparedBy.agent.id)+(cursor?'&after='+encodeURIComponent(cursor):''))
   found ||= audit.rows.some(row=>row.id===run.companyDecision.id&&row.tool===name&&row.door==='embedded'&&row.outcome==='done'&&row.sponsor.id===run.preparedBy.for.id)
   if(!audit.cursor||audit.cursor===cursor)break
   cursor=audit.cursor
  }
  assert.ok(found)
 }
 const after=(await native('/api/purse/state')).data
 assert.deepEqual(nonReport(after),nonReport(before))
 assert.ok(after.audit.some(row=>row.action==='spend-question'&&row.agent?.id===embedded.preparedBy.agent.id))
 assert.ok(after.audit.some(row=>row.action==='coding-agent-run'&&row.agent?.id===coding.preparedBy.agent.id))
 console.log('PROBE BASE-AGENT-002 embedded: native spend and coding HTTP -> same registry tools and source results as MCP; attributed embedded audit; replay once; no purchasing or supplier send')
 return {spend:embedded,coding}
}

export async function embeddedPolicyProof({c,h,reader,readerToken}) {
 const owner=['owner','example.test'].join('@')
 await h.command('policy',{name:'Embedded assistant authority',currency:'USD',category:'Safety',project:'Workshop',approver:owner,limitMinor:1000000,budgetMinor:10000000})
 const supplier=(await h.state()).data.supplier[0]
 const draft=await h.command('request',{title:'Independent assistant source',supplier:supplier.id,currency:'USD',needDate:'2026-12-15',location:'Denver',costCentre:'Operations',lines:[{description:'Exact native item',quantity:'2',unitMinor:10000,category:'Safety',project:'Workshop'}],freightMinor:0,taxMinor:0,terms:'Native report source'},reader)
 await h.command('submit',{id:draft.id,revision:draft.revision},reader)
 await h.command('decision',{id:draft.id,revision:draft.revision,decision:'approved',reason:'Independent native approval'})
 const order=await h.command('convert',{id:draft.id,revision:draft.revision})
 await h.command('issue',{id:order.id,revision:order.revision,reason:'Exact report source'})
 for(const agent of ['AGENT-011','AGENT-008'])await h.command('agent-policy',{agent,purchaseType:'*',version:0,enabled:true,cadenceDays:1,maxChases:2,reason:'Enable exact native source report'})
 const policy=disposition=>({schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'all',class:'*',do:disposition,...(disposition==='approval'?{approver:['sponsor'],wait:'PT1H'}:{})}],...(disposition==='review'?{reviewers:['sponsor']} : {}),spend:{none:true}})
 await c.adopt(policy('autonomous'))
 const result=await embeddedNativeJourney({tool:c.tool,request:(url,init)=>h.mf.dispatchFetch(url,init),origin:h.origin,cookie:h.owner})
 assert.deepEqual(result.spend.figures,[{currency:'USD',amountMinor:20000,metric:'committed'}])
 for(const disposition of ['review','approval','blocked']) {
  await c.adopt(policy(disposition))
  const args={question:'Show committed spend by supplier all recorded dates',idempotency_key:randomUUID()},before=(await h.state()).data
  const response=await h.send('/api/purse/command/spend-question',args,h.owner)
  if(disposition==='blocked') {
   assert.equal(response.status,409);assert.equal(response.value.code,'policy_blocked')
   assert.deepEqual((await h.state()).data,before);continue
  }
  if(disposition==='approval') {
   assert.equal(response.status,409);assert.equal(response.value.code,'approval_required')
   assert.deepEqual((await h.state()).data,before)
   const pending=await h.send('/agents/api/approvals/'+response.value.approval.id,undefined,h.owner)
   const approval=pending.value.approval
   const approved=await h.send('/agents/api/approvals/'+approval.id+'/approve',{revision:approval.revision,summary_sha256:approval.summary_sha256},h.owner)
   assert.equal(approved.status,200);assert.equal(approved.value.approval.state,'executed')
  } else assert.equal(response.status,200)
  const replay=await h.send('/api/purse/command/spend-question',args,h.owner)
  assert.equal(replay.status,200)
  assert.equal((await h.state()).data.agentRun.length,before.agentRun.length+1)
 }
 await c.adopt(policy('approval'))
 const before=(await h.state()).data,pending=(await c.personJson('/agents/api/approvals')).approvals.length
 const foreign=before.request.find(row=>row.requesterEmail===owner)
 assert.ok(foreign)
 const denied=await h.send('/api/purse/command/coding-agent-run',{kind:'request',id:foreign.id},h.owner)
 assert.equal(denied.status,409)
 assert.equal(code(await c.tool('purse.coding.prepare',{kind:'request',id:foreign.id,idempotency_key:randomUUID()},{token:readerToken})),'permission_denied')
 assert.deepEqual((await h.state()).data,before)
 // The owner call above may retain its authorized pending input; the foreign
 // requester call cannot retain another approval or expose that request.
 assert.equal((await c.personJson('/agents/api/approvals')).approvals.length,pending+1)
 await h.command('agent-pause',{agent:'AGENT-011',reason:'Immediate native pause'})
 const paused=await h.send('/api/purse/command/spend-question',{question:'Show committed spend all recorded dates'},h.owner)
 assert.equal(paused.status,409);assert.equal(paused.value.code,'native_conflict')
 await c.adopt(policy('autonomous'),{revoked:{agents:[result.spend.preparedBy.agent.id],consents:[]}})
 const revoked=await h.send('/api/purse/command/spend-question',{question:'Show committed spend all recorded dates'},h.owner)
 assert.equal(revoked.status,409);assert.equal(revoked.value.code,'unauthenticated')
 console.log('PROBE BASE-AGENT-002 embedded policy: native HTTP -> autonomous, review, held approval and blocked; current-source denial, pause and revoked embedded identity refuse without purchasing effects')
}
