import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

// Real native persistence, policy and audit; no application or auth stand-ins.
export default async function({tool,request,origin,cookie}) {
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
 const audit=await request(new URL('/agents/api/audit',origin).href,{headers:{cookie}})
 assert.equal(audit.status,200)
 assert.ok(!(await audit.text()).includes(marker))
}
