import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {agentDoorHarness} from './purse-harness.mjs'
import {VERSION} from '../src/modules/agent-door/conformance/protocol.mjs'
import {accessToken,autonomousPolicy,heldPolicy} from '../src/modules/agent-door/conformance/crypto.mjs'

// One native transport journey: no protocol-client request wrapper or retry,
// admission mock, clock override, lowered capacity or database counter writes.
test('native MCP capacity and signed-in purchasing continuity',{timeout:180_000},async()=>{
const {h,c}=await agentDoorHarness()
try {
 await h.command('business',{name:'Synthetic capacity workshop',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Workshop']})
 const supplier=await h.command('supplier',{name:'Synthetic capacity supplier',status:'active',reason:'Reviewed native source',contacts:[]})
 const draft=await h.command('request',{title:'Synthetic capacity purchase',supplier:supplier.id,currency:'USD',needDate:'2026-12-15',location:'Denver',costCentre:'Operations',lines:[{description:'Safety gloves',quantity:'2',unitMinor:1500,category:'Safety',project:'Workshop'}],freightMinor:0,taxMinor:0,terms:'Native purchasing witness'})
 for(const [phase,policy]of [['autonomous',autonomousPolicy()],['held',heldPolicy()]]) {
  await c.adopt(policy)
  const current=(await h.state()).data.request.find(row=>row.id===draft.id)
  const witness=await c.witness()
  assert.ok((await h.state()).data.request.some(row=>row.id===draft.id&&row.totalMinor===3000))
  const before=(await h.state()).data
  const method=['tools','list'].join('/'),discover=['server','discover'].join('/')
  const principal={...c,agentId:randomUUID()}
  const token=await accessToken(principal)
  let sequence=0
  const raw=async(rpcMethod,bearer=token)=>{
   const id=++sequence
   const response=await fetch(h.origin+'/mcp',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(25_000),headers:{origin:h.origin,authorization:'Bearer '+bearer,'content-type':['application','json'].join('/'),'MCP-Protocol-Version':VERSION,'Mcp-Method':rpcMethod},body:JSON.stringify({jsonrpc:'2.0',id,method:rpcMethod,params:{_meta:{'io.modelcontextprotocol/protocolVersion':VERSION}}})})
   const body=await response.json()
   assert.equal(body.id,id)
   return {status:response.status,retryAfter:response.headers.get('retry-after'),body}
  }
  const discovery=await raw(discover)
  assert.equal(discovery.status,200)
  const limit=discovery.body.result._meta['com.runeditrun/limits'].requestsPerMinute
  assert.ok(Number.isSafeInteger(limit)&&limit>0,'Discovery must advertise a positive request capacity')
  assert.ok(limit<10_000,'The native burst must remain bounded')
  // Begin only when a full bounded burst fits in this real capacity window.
  // This wait does not reset, advance or recover the installation's counter.
  const windowMs=60_000,minimumRemaining=45_000,remaining=windowMs-Date.now()%windowMs
  if(remaining<minimumRemaining)await delay(remaining+25)
  const start=Date.now(),answers=Array(limit+1)
  let next=0
  await Promise.all(Array.from({length:Math.min(16,answers.length)},async()=>{
   while(next<answers.length) {
    const index=next++
    assert.ok(Date.now()-start<25_000,'Capacity burst exceeded its bounded execution time')
    answers[index]=await raw(method)
   }
  }))
  const end=Date.now()
  assert.equal(Math.floor(end/windowMs),Math.floor(start/windowMs),'Every burst request must reach the same real capacity window')
  const admitted=answers.filter(answer=>answer.status===200),limited=answers.filter(answer=>answer.status===429)
  assert.equal(admitted.length,limit,'The advertised per-agent capacity must be served')
  assert.equal(limited.length,1,'The first request above capacity must be refused')
  for(const answer of admitted) {
   assert.equal(answer.body.error,undefined)
   assert.ok(answer.body.result.tools.some(tool=>tool.name==='purse.workspace.snapshot'),'Authenticated listing must expose the native purchasing tool')
  }
  for(const answer of limited) {
   assert.equal(answer.body.error.data.code,'rate_limited')
   assert.ok(answer.retryAfter!==null&&/^\d+(?:\.\d+)?$/.test(answer.retryAfter)&&Number(answer.retryAfter)>0,'HTTP 429 must carry a positive numeric Retry-After')
  }
  // A replacement credential for the same agent cannot reset capacity.
  const replacement=await raw(method,await accessToken(principal))
  assert.equal(replacement.status,429)
  assert.equal(replacement.body.error.data.code,'rate_limited')
  assert.ok(replacement.retryAfter!==null&&/^\d+(?:\.\d+)?$/.test(replacement.retryAfter)&&Number(replacement.retryAfter)>0)
  // Invalid credentials must still be refused before any private listing.
  const unauthenticated=await raw(method,'synthetic-purse-invalid')
  assert.equal(unauthenticated.status,401)
  assert.equal(unauthenticated.body.result,undefined)
  // A different agent remains admitted; the same signed-in person can still
  // read and edit the purchase while the burst agent remains rate limited.
  assert.deepEqual(await c.witness(),witness)
  const person=await fetch(h.origin+'/api/purse/state',{headers:{cookie:h.owner}})
  assert.equal(person.status,200)
  assert.deepEqual((await person.json()).data,before,'Read-only capacity refusals must preserve the entire native purchasing state')
  const command=await fetch(h.origin+'/api/purse/command/amend',{method:'POST',headers:{origin:h.origin,cookie:h.owner,'content-type':['application','json'].join('/')},body:JSON.stringify({...current,title:'Human reviewed capacity purchase',reason:'Signed-in person retains the native purchasing door'})})
  assert.equal(command.status,200)
  const amended=await command.json()
  assert.equal(amended.id,draft.id)
  assert.equal(amended.revision,current.revision+1)
  assert.equal(amended.title,'Human reviewed capacity purchase')
  assert.equal(amended.totalMinor,3000)
  const after=(await h.state()).data
  const visible=after.request.find(row=>row.id===draft.id)
  for(const [field,value] of Object.entries(amended))assert.deepEqual(visible[field],value,'Signed-in state must expose the saved '+field)
  for(const kind of ['decision','order','commitment','receipt','invoice','orderSend'])assert.deepEqual(after[kind]??[],before[kind]??[])
  const stillLimited=await raw(method)
  assert.equal(Math.floor(Date.now()/windowMs),Math.floor(start/windowMs),'Person proof must remain within the exhausted agent window')
  assert.equal(stillLimited.status,429)
  assert.equal(stillLimited.body.error.data.code,'rate_limited')
  assert.ok(stillLimited.retryAfter!==null&&/^\d+(?:\.\d+)?$/.test(stillLimited.retryAfter)&&Number(stillLimited.retryAfter)>0)
  assert.equal(h.messages.length,0,'Capacity and native person actions must not send mail')
  assert.ok(c.points.every(point=>point.ok),JSON.stringify(c.points.filter(point=>!point.ok)))
  console.log('PROBE BASE-AGENT-011 1 '+phase+': authenticated raw MCP listing burst -> '+admitted.length+' admitted, '+limited.length+' HTTP 429 rate_limited, Retry-After='+limited[0].retryAfter+'; advertised capacity='+limit+'; one real window='+Math.floor(start/windowMs)+'; durationMs='+(end-start))
  console.log('PROBE BASE-AGENT-011 1 '+phase+' isolation: same-agent replacement token remains limited; invalid bearer refused; native purchasing witness unchanged; second agent and signed-in person read succeed; person amendment advances one revision; no commitment, invoice or outbound effect')
 }
} finally {await h.close()}
})
