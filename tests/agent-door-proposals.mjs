import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

const code=answer=>answer.result?._meta?.['com.runeditrun/error']?.code
const value=answer=>{assert.equal(answer.result?.isError,false,code(answer));return answer.result.structuredContent}

export async function proposalNativeJourney({tool,request,origin,cookie}) {
 const state=async()=>{const response=await request(origin+'/api/purse/state',{headers:{cookie}});assert.equal(response.status,200);return (await response.json()).data}
 const initial=await state(),business=initial.business[0],supplier=initial.supplier.find(row=>['active','preferred'].includes(row.status))
 const own=value(await tool('purse.requests.create',{title:'Exact native proposed submission',supplier:supplier.id,currency:'USD',needDate:'2026-12-15',location:business.locations[0],costCentre:business.costCentres[0],lines:[{description:'Source-backed item',quantity:'2.5',unitMinor:1234,category:'Safety',project:business.projects[0]}],freightMinor:0,taxMinor:0,terms:'Exact nonbinding preparation',idempotency_key:randomUUID()}))
 const run=value(await tool('purse.preparations.create',{workflow:'intake',draft:'Reviewed native proposed actions',references:[],idempotency_key:randomUUID()}))
 const propose=async(action,input)=>value(await tool('purse.preparations.propose',{run:run.id,action,input,idempotency_key:randomUUID()}))
 const execute=async(proposal)=>{
  const args={id:proposal.id,idempotency_key:randomUUID()},answer=await tool('purse.preparations.execute',args),result=value(answer)
  const before=await state();assert.deepEqual(value(await tool('purse.preparations.execute',args)),result);assert.deepEqual(await state(),before)
  return {answer,result,args}
 }
 const submission=await propose('submit',{id:own.id,revision:own.revision}),submitted=await execute(submission)
 assert.equal(submitted.result.status,'pending');assert.equal(submitted.result.totalMinor,3085)
 const self=await propose('decision',{id:own.id,revision:own.revision,decision:'approved',reason:'Forbidden self-approval'})
 const before=await state()
 assert.equal(code(await tool('purse.preparations.execute',{id:self.id,idempotency_key:randomUUID()})),'permission_denied')
 assert.deepEqual(await state(),before)
 const pending=value(await tool('purse.requests.awaiting_decision',{})).records[0]
 assert.ok(pending)
 const decision=await propose('decision',{id:pending.id,revision:pending.revision,decision:'approved',reason:'Independent designated native approval'})
 const approved=await execute(decision)
 assert.equal(approved.result.status,'approved')
 assert.deepEqual(approved.answer.decision.classes.map(row=>row.class),['money','commitment'])
 assert.equal(approved.answer.decision.classes[0].facts.measure,pending.totalMinor)
 const conversion=await execute(await propose('convert',{id:pending.id,revision:pending.revision}))
 assert.equal(conversion.result.status,'prepared')
 const issuance=await execute(await propose('issue',{id:conversion.result.id,revision:pending.revision,reason:'Separate native issuance'}))
 assert.equal(issuance.result.status,'issued')
 const order=issuance.result,position=value(await tool('purse.orders.position',{id:order.id}))
 const receipt=await execute(await propose('receipt',{order:order.id,line:order.lines[0].id,quantity:'1',event:'receive',reason:'One physically received item',receiptVersion:position.receiptVersion}))
 assert.equal(receipt.result.q,1000)
 const after=await state()
 assert.equal(after.proposedAction.find(row=>row.id===submission.id).status,'executed')
 assert.ok(after.audit.some(row=>row.action==='execute-action'&&row.agent?.id===submitted.result.preparedBy.agent.id))
 assert.ok(after.audit.some(row=>row.action==='receipt'&&row.agent?.id===receipt.result.preparedBy.agent.id))
 assert.deepEqual(after.orderSend,initial.orderSend)
 console.log('PROBE BASE-AGENT-002 proposals: MCP -> native submit, independent decision, conversion, separate issuance and receipt once; self-approval refused without state change; no supplier send')
 return {run,pending,propose,execute}
}

export async function proposalPolicyProof({c,h,reader,readerToken}) {
 const supplier=(await h.state()).data.supplier[0]
 for(let index=0;index<2;index++) {
  const draft=await h.command('request',{title:'Independent proposal source '+index,supplier:supplier.id,currency:'USD',needDate:'2026-12-15',location:'Denver',costCentre:'Operations',lines:[{description:'Exact proposal item',quantity:'2',unitMinor:10000,category:'Safety',project:'Workshop'}],freightMinor:0,taxMinor:0,terms:'Native independently approved source'},reader)
  await h.command('submit',{id:draft.id,revision:draft.revision},reader)
 }
 const automatic={schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'all',class:'*',do:'autonomous'}],spend:{none:true}}
 await c.adopt(automatic)
 const context={tool:c.tool,request:(url,init)=>h.mf.dispatchFetch(url,init),origin:h.origin,cookie:h.owner}
 const proof=await proposalNativeJourney(context)
 const candidate=value(await c.tool('purse.requests.awaiting_decision',{})).records[0]
 assert.ok(candidate)
 await h.command('decision',{id:candidate.id,revision:candidate.revision,decision:'approved',reason:'Independent combined-conversion review'})
 const combined=await proof.propose('convert',{id:candidate.id,revision:candidate.revision,issue:true})
 const before=(await h.state()).data
 await c.adopt({...automatic,rules:[{id:'standard',class:'standard',do:'autonomous'},{id:'other',class:'*',do:'blocked'}]})
 const args={id:combined.id,idempotency_key:randomUUID()},blocked=await c.tool('purse.preparations.execute',args)
 assert.equal(code(blocked),'policy_blocked');assert.deepEqual(blocked.decision.classes.map(row=>row.class),['money','commitment'])
 assert.deepEqual((await h.state()).data,before)
 assert.equal(code(await c.tool('purse.preparations.execute',args,{token:readerToken})),'permission_denied')
 await c.adopt(automatic)
 const issued=await proof.execute(combined)
 assert.equal(issued.result.status,'issued')
 // A buyer price correction in the stored action is the issued amount: a company cap of $100 refuses $110.
 const owner=['owner','example.test'].join('@')
 const corrected=async(category,project)=>{
  const draft=await h.command('request',{title:'Priced '+project,supplier:supplier.id,currency:'USD',needDate:'2026-12-15',location:'Denver',costCentre:'Operations',lines:[{description:'Corrected item',quantity:'1',unitMinor:10000,category,project}],freightMinor:0,taxMinor:0,terms:'Native price correction'},reader)
  await h.command('submit',{id:draft.id,revision:draft.revision},reader)
  const approved=await h.command('decision',{id:draft.id,revision:draft.revision,decision:'approved',reason:'Independent approval of $100'})
  return proof.propose('convert',{id:approved.id,revision:approved.revision,issue:true,conversionEdits:{lines:[{id:approved.lines[0].id,unitMinor:11000}],reason:'Supplier price correction to $110'}})
 }
 const cap=max=>({...automatic,rules:[{id:'standard',class:'standard',do:'autonomous'},{id:'money',class:'money',max:{amount:max,currency:'USD'},do:'autonomous'},{id:'commitment',class:'commitment',max:{amount:max,currency:'USD'},do:'autonomous'},{id:'other',class:'*',do:'blocked'}]})
 const raise=await corrected('Safety','Workshop'),orders=(await h.state()).data.order.length
 await c.adopt(cap(10000))
 const refused=await c.tool('purse.preparations.execute',{id:raise.id,idempotency_key:randomUUID()})
 assert.equal(code(refused),'policy_blocked');assert.deepEqual(refused.decision.classes.map(row=>[row.class,row.facts.measure]),[['money',11000],['commitment',11000]])
 assert.equal((await h.state()).data.order.length,orders)
 await c.adopt(cap(11000))
 const paid=await proof.execute(raise)
 assert.equal(paid.result.status,'issued');assert.equal(paid.result.totalMinor,11000)
 // A correction that needs renewed approval commits the pending revision on both doors, never a server error.
 await h.command('policy',{name:'Correction needs budget owner',currency:'USD',category:'Tooling',project:'Workshop',approver:owner,limitMinor:1000000,budgetMinor:10500,overBudget:'owner',budgetOwner:owner})
 const routed=await corrected('Tooling','Workshop'),request=routed.input.id
 await c.adopt(automatic)
 const renewal=await proof.execute(routed)
 assert.equal(renewal.result.conversionRouted,true);assert.equal(renewal.result.status,'pending');assert.equal(renewal.result.revision,routed.input.revision+1)
 const after=(await h.state()).data
 assert.equal(after.order.filter(row=>row.request===request).length,0)
 assert.equal(after.request.find(row=>row.id===request).revision,renewal.result.revision)
 console.log('PROBE BASE-AGENT-002 proposal policy: stored combined conversion and issue -> money and commitment classes; blocked policy and wrong sponsor refuse without native effects')
}
