import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentDoorBrowser} from './agent-door-browser.mjs'

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
 const missing=await tool('purse.records.read',{kind:'order',id:randomUUID()})
 assert.equal(missing.result?._meta?.['com.runeditrun/error']?.code,'not_found')
 const audit=await request(new URL('/agents/api/audit',origin).href,{headers:{cookie}})
 assert.equal(audit.status,200)
 const auditText=await audit.text()
 assert.ok(!auditText.includes(marker))
 const rows=JSON.parse(auditText)
 assert.equal(rows.differs_from_policy,0)
 const state=await request(new URL('/api/purse/state',origin).href,{headers:{cookie}})
 assert.equal(state.status,200)
 const native=(await state.json()).data
 assert.ok(native.audit.some(row=>row.action==='decision'&&row.agent?.id&&row.actorLabel?.includes(' for ')))
 assert.ok(native.receipt.some(row=>row.id===receipt.result.structuredContent.id&&row.preparedBy?.agent.id))
 await agentDoorBrowser({request,origin,cookie,order,native})
 console.log('Native agent journey: self-approval refused; receipt replay once; changed arguments and stale position refused; agent and sponsor attribution; zero policy differences')
}
