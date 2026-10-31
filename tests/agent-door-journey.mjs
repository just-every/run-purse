import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentDoorBrowser,agentPendingBrowser,agentSponsorBrowser} from './agent-door-browser.mjs'
import {sponsorIdentity} from './initialize-agent-door-sponsor.mjs'

export async function afterStep({phase,step,tool,request,origin,cookie}) {
 if(phase!=='held'||step.id!=='snapshot')return
 const pending=await tool('purse.records.list',{kind:'supplier'})
 const approval=pending.result?._meta?.['com.runeditrun/approval']
 assert.ok(approval?.id)
 await agentPendingBrowser({request,origin,cookie,approval})
}

// Real native persistence, policy and audit; no application or auth stand-ins.
export default async function({tool,request,origin,cookie,email}) {
 const marker='synthetic-structured-protected-value-'+randomUUID()
 const before=await tool('purse.workspace.snapshot',{})
 for(const name of ['tin','bank_account','BANK-ROUTING','client_secret','apiKey','access_token','refreshToken','supplierMatchingKey']) {
  const answer=await tool('purse.preparations.create',{workflow:'intake',draft:'Safe source draft',fields:{source:[{[name]:marker}]},references:[],idempotency_key:randomUUID()})
  assert.equal(answer.result?._meta?.['com.runeditrun/error']?.code,'protected_input')
 }
 const after=await tool('purse.workspace.snapshot',{})
 assert.deepEqual(after.result.structuredContent,before.result.structuredContent)
 const key=randomUUID(),args={workflow:'intake',draft:'Source-bound native replay witness',fields:{},references:[],idempotency_key:key}
 const created=await tool('purse.preparations.create',args)
 assert.equal(created.result?.isError,false)
 const beforeReplay=await tool('purse.workspace.snapshot',{})
 const replay=await tool('purse.preparations.create',args)
 assert.deepEqual(replay.result.structuredContent,created.result.structuredContent)
 const conflict=await tool('purse.preparations.create',{...args,draft:'Changed proposed effect'})
 assert.equal(conflict.result?._meta?.['com.runeditrun/error']?.code,'idempotency_conflict')
 const afterReplay=await tool('purse.workspace.snapshot',{})
 assert.deepEqual(afterReplay.result.structuredContent,beforeReplay.result.structuredContent)
 const record=created.result.structuredContent
 const edit={id:record.id,version:record.version,draft:'Reviewed source draft'}
 const edited=await tool('purse.preparations.edit',{...edit,idempotency_key:randomUUID()})
 assert.equal(edited.result?.isError,false)
 const beforeStale=await tool('purse.workspace.snapshot',{})
 const stale=await tool('purse.preparations.edit',{...edit,idempotency_key:randomUUID()})
 assert.equal(stale.result?._meta?.['com.runeditrun/error']?.code,'native_conflict')
 const afterStale=await tool('purse.workspace.snapshot',{})
 assert.deepEqual(afterStale.result.structuredContent,beforeStale.result.structuredContent)
 const requests=await tool('purse.records.list',{kind:'request'})
 const own=requests.result.structuredContent.records.find(record=>record.requesterEmail===email&&record.status==='pending')
 assert.ok(own)
 const beforeSelf=await tool('purse.workspace.snapshot',{})
 const self=await tool('purse.requests.decide',{id:own.id,revision:own.revision,decision:'approved',reason:'A sponsor cannot approve their own purchase',idempotency_key:randomUUID()})
 assert.equal(self.result?._meta?.['com.runeditrun/error']?.code,'permission_denied')
 assert.deepEqual((await tool('purse.workspace.snapshot',{})).result.structuredContent,beforeSelf.result.structuredContent)
 const pending=await tool('purse.requests.awaiting_decision',{})
 const candidate=pending.result.structuredContent.records[0]
 assert.ok(candidate)
 const approved=await tool('purse.requests.decide',{id:candidate.id,revision:candidate.revision,decision:'approved',reason:'Independent native purchase review',idempotency_key:randomUUID()})
 assert.equal(approved.result?.isError,false)
 const converted=await tool('purse.orders.convert',{id:candidate.id,revision:candidate.revision,issue:true,role:'owner',classes:['standard'],idempotency_key:randomUUID()})
 assert.equal(converted.result?.isError,false)
 assert.equal(converted.result.structuredContent.status,'prepared','An extra issue flag cannot issue an order')
 const issueArgs={id:converted.result.structuredContent.id,revision:candidate.revision,reason:'Issue the independently approved native order',idempotency_key:randomUUID()}
 const issued=await tool('purse.orders.issue',issueArgs)
 assert.equal(issued.result?.isError,false)
 const issueWitness=await tool('purse.workspace.snapshot',{})
 assert.deepEqual((await tool('purse.orders.issue',issueArgs)).result.structuredContent,issued.result.structuredContent)
 assert.deepEqual((await tool('purse.workspace.snapshot',{})).result.structuredContent,issueWitness.result.structuredContent)
 const order=issued.result.structuredContent
 assert.ok(order)
 assert.match(order.preparedBy.label,/ for /)
 assert.equal(order.preparedBy.for.id,own.requester)
 const position=(await tool('purse.orders.position',{id:order.id})).result.structuredContent
 const receiptArgs={order:order.id,line:order.lines[0].id,quantity:'1',event:'receive',reason:'Remaining physical pair delivered',receiptVersion:position.receiptVersion,idempotency_key:randomUUID()}
 const receipt=await tool('purse.receipts.record',receiptArgs)
 assert.equal(receipt.result?.isError,false)
 const received=await tool('purse.workspace.snapshot',{})
 const repeated=await tool('purse.receipts.record',receiptArgs)
 assert.deepEqual(repeated.result.structuredContent,receipt.result.structuredContent)
 assert.deepEqual((await tool('purse.workspace.snapshot',{})).result.structuredContent,received.result.structuredContent)
 const changed=await tool('purse.receipts.record',{...receiptArgs,reason:'Different evidence'})
 assert.equal(changed.result?._meta?.['com.runeditrun/error']?.code,'idempotency_conflict')
 const staleReceipt=await tool('purse.receipts.record',{...receiptArgs,idempotency_key:randomUUID()})
 assert.equal(staleReceipt.result?._meta?.['com.runeditrun/error']?.code,'native_conflict')
 assert.deepEqual((await tool('purse.workspace.snapshot',{})).result.structuredContent,received.result.structuredContent)
 const invoiceArgs={order:order.id,reference:'Evidence-'+randomUUID(),source:'Supplier original for delivered pair',allocations:[{line:order.lines[0].id,quantity:'1',amountMinor:1500}],idempotency_key:randomUUID()}
 const invoice=await tool('purse.invoices.capture',invoiceArgs)
 assert.equal(invoice.result?.isError,false)
 const invoiced=await tool('purse.workspace.snapshot',{})
 assert.deepEqual((await tool('purse.invoices.capture',invoiceArgs)).result.structuredContent,invoice.result.structuredContent)
 const changedInvoice=await tool('purse.invoices.capture',{...invoiceArgs,reference:'Different source reference'})
 assert.equal(changedInvoice.result?._meta?.['com.runeditrun/error']?.code,'idempotency_conflict')
 assert.deepEqual((await tool('purse.workspace.snapshot',{})).result.structuredContent,invoiced.result.structuredContent)
 const groupedRecords=(await tool('purse.records.list',{kind:'order'})).result.structuredContent.records
 const grouped=groupedRecords.filter(record=>record.supplierGroup&&record.status==='prepared')
 assert.ok(grouped.length>1)
 const groupIssueArgs={id:grouped[0].id,revision:grouped[0].revision,reason:'Issue the exact complete native supplier allocation',idempotency_key:randomUUID()}
 const groupIssue=await tool('purse.orders.issue',groupIssueArgs)
 assert.equal(groupIssue.result?.isError,false)
 const groupValue=grouped.reduce((sum,row)=>sum+row.totalMinor,0)
 assert.equal(groupIssue.decision.classes.find(item=>item.class==='commitment').facts.measure,groupValue)
 assert.equal(groupIssue.decision.classes.find(item=>item.class==='money').facts.measure,groupValue)
 const groupWitness=await tool('purse.workspace.snapshot',{})
 assert.deepEqual((await tool('purse.orders.issue',groupIssueArgs)).result.structuredContent,groupIssue.result.structuredContent)
 assert.deepEqual((await tool('purse.workspace.snapshot',{})).result.structuredContent,groupWitness.result.structuredContent)
 const issuedGroups=(await tool('purse.records.list',{kind:'order'})).result.structuredContent.records.filter(row=>row.supplierGroup?.key===grouped[0].supplierGroup.key)
 assert.ok(issuedGroups.every(row=>row.status==='issued'&&row.preparedBy?.agent.id))
 const missing=await tool('purse.records.read',{kind:'order',id:randomUUID()})
 assert.equal(missing.result?._meta?.['com.runeditrun/error']?.code,'not_found')
 const admissionRows=[]
 let cursor=null,differs=0
 do {
  const audit=await request(new URL('/agents/api/audit'+(cursor?'?after='+encodeURIComponent(cursor):''),origin).href,{headers:{cookie}})
  assert.equal(audit.status,200)
  const auditText=await audit.text()
  assert.ok(!auditText.includes(marker))
  const page=JSON.parse(auditText)
  admissionRows.push(...page.rows)
  differs+=page.differs_from_policy
  if(!page.rows.length||page.cursor===cursor)break
  cursor=page.cursor
 } while(cursor)
 assert.equal(differs,0)
 const state=await request(new URL('/api/purse/state',origin).href,{headers:{cookie}})
 assert.equal(state.status,200)
 const native=(await state.json()).data
 assert.ok(native.audit.some(row=>row.action==='decision'&&row.agent?.id&&row.actorLabel?.includes(' for ')))
 assert.ok(native.receipt.some(row=>row.id===receipt.result.structuredContent.id&&row.preparedBy?.agent.id))
 const effect=native.receipt.find(row=>row.id===receipt.result.structuredContent.id)
 const admission=admissionRows.find(row=>row.id===effect.companyDecision.id)
 assert.equal(admission.sponsor.id,effect.preparedBy.for.id)
 assert.equal(admission.agent.id,effect.preparedBy.agent.id)
 assert.ok(Number.isInteger(admission.revision))
 // The second active sponsor's native view matches the agent door's sponsor
 // boundary: only its own preparation, while the owner's native authority sees both.
 const colleague=sponsorIdentity(origin,'colleague')
 const prepared=await request(new URL('/api/purse/command/prepare',origin).href,{method:'POST',headers:{origin,cookie:colleague.cookie,'content-type':'application/json'},body:JSON.stringify({workflow:'intake',draft:'Second sponsor preparation '+randomUUID(),fields:{need:'Safety glasses'},references:[]})})
 assert.equal(prepared.status,200)
 const preparation=await prepared.json()
 const agentRuns=async session=>{
  const response=await request(new URL('/api/purse/state',origin).href,{headers:{cookie:session}})
  assert.equal(response.status,200)
  return (await response.json()).data.agentRun.filter(run=>run.mode==='human-preparation').map(run=>run.id).sort()
 }
 const listed=(await tool('purse.records.list',{kind:'agentRun'})).result.structuredContent.records.filter(run=>run.mode==='human-preparation')
 assert.deepEqual(listed.map(run=>run.id).sort(),await agentRuns(cookie))
 const hidden=listed.filter(run=>run.actor!==colleague.id)
 assert.ok(hidden.length>0&&listed.some(run=>run.id===preparation.id))
 assert.deepEqual(await agentRuns(colleague.cookie),[preparation.id])
 const download=await request(new URL('/api/purse/download/agentRun/'+encodeURIComponent(hidden[0].id),origin).href,{headers:{cookie:colleague.cookie}})
 assert.ok([403,404].includes(download.status))
 await agentSponsorBrowser({request,origin,cookie:colleague.cookie,own:preparation,hidden})
 await agentDoorBrowser({request,origin,cookie,order,native})
 console.log('Native agent journey: self-approval refused; receipt replay once; changed arguments and stale position refused; agent and sponsor attribution; second sponsor sees only its own preparation; zero policy differences')
}
