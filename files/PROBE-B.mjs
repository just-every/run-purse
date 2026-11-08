import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {pathToFileURL} from 'node:url'
const repo=process.argv[2]
const {agentDoorHarness}=await import(pathToFileURL(repo+'/tests/purse-harness.mjs'))
const {reauthenticateErasure}=await import(pathToFileURL(repo+'/tests/erasure-flow.mjs'))
const {errorCode}=await import(pathToFileURL(repo+'/src/modules/agent-door/conformance/protocol.mjs'))
const {h,c}=await agentDoorHarness()
try {
 await h.command('business',{name:'Synthetic workshop',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Workshop']})
 const email=['synthetic-purse-9604','example.test'].join('@')
 const supplier=await h.command('supplier',{name:'Synthetic supplier',status:'active',reason:'Owner reviewed',contacts:[{name:'Stan',email}]})
 const policy={schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'fallback',class:'*',do:'blocked'},{id:'daily',class:'standard',seed:'purse',max_per_day:1,do:'autonomous'}],spend:{none:true}}
 await c.adopt(policy)
 const input=()=>({workflow:'intake',draft:'Reach Stan '+email,fields:{contact:'Stan'},references:[{kind:'supplier',id:supplier.id}],idempotency_key:randomUUID()})
 const first=await c.tool('purse.preparations.create',input())
 assert.equal(first.result.isError,false)
 const denied=await c.tool('purse.preparations.create',input())
 assert.equal(errorCode(denied),'policy_blocked')
 await reauthenticateErasure(h)
 const revision=(await h.send('/api/purse/erasure',undefined,h.owner)).value.revision
 const preview=await h.send('/api/purse/erasure/preview',{revision,kind:'contact',id:supplier.id,email},h.owner)
 assert.equal(preview.status,200,JSON.stringify(preview.value))
 const p=preview.value
 const erased=await h.send('/api/purse/erasure/execute',{...p.subject,revision,review:p.review,fingerprint:p.fingerprint,consent:true},h.owner)
 assert.equal(erased.status,200,JSON.stringify(erased.value))
 const usage=(await h.db.prepare('SELECT classes FROM agent_door_usage').all()).results
 const answer=await c.tool('purse.preparations.create',input())
 const count=(await h.state()).data.agentRun.length
 console.log(JSON.stringify({before:'policy_blocked',after:errorCode(answer),disposition:answer.decision?.disposition,usage,preparations:count,revision:answer.decision?.revision}))
 assert.equal(errorCode(answer),'policy_blocked','Erasing Stan must preserve the consumed daily allowance')
} finally {await h.close()}
