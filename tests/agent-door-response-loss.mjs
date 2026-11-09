import assert from 'node:assert/strict'
import {createHash,randomUUID,webcrypto} from 'node:crypto'
import {request as httpRequest} from 'node:http'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {harness} from './purse-harness.mjs'
import {responseLossRelay} from './agent-door-response-loss-relay.mjs'
import {createProtocol,VERSION} from '../src/modules/agent-door/conformance/protocol.mjs'
import {accessToken,autonomousPolicy,heldPolicy,signJws} from '../src/modules/agent-door/conformance/crypto.mjs'

const tool='purse.preparations.create'
const method=['tools','call'].join('/'),contentType=['application','json'].join('/')
const decisionKey='com.runeditrun/decision',reviewKey='com.runeditrun/review'
const address=['synthetic-purse-9701','example.test'].join('@')

// Raw HTTP client: no protocol wrapper, retry or application error conversion.
// A timeout is a test failure, never accepted as the simulated response loss.
async function lostCall(url,headers,body) {
 return new Promise((resolve,reject)=>{
  let parsed,receivedBytes=0,status
  const request=httpRequest(url,{method:'POST',headers,timeout:25_000},response=>{
   status=response.statusCode
   const chunks=[]
   response.on('data',chunk=>{receivedBytes+=chunk.length;chunks.push(chunk)})
   response.once('error',failure=>resolve({failure,status,receivedBytes,parsed}))
   response.once('end',()=>{
    try {parsed=JSON.parse(Buffer.concat(chunks).toString())} catch {}
    resolve({status,receivedBytes,parsed})
   })
  })
  request.once('timeout',()=>{request.destroy();reject(new Error('Response-loss client timed out'))})
  request.once('error',failure=>resolve({failure,status,receivedBytes,parsed}))
  request.end(body)
 })
}

// Native synchronous preparation recovery under two independent signed policies.
// Each fresh installation has an invited, confirmed requester and one effect.
export async function agentDoorResponseLoss(visit) {
 const receipts=[]
 for(const [phase,policy]of [['autonomous',autonomousPolicy()],['held',heldPolicy()]]) {
  const clock=new Date().toISOString(),h=await harness({worker:'tests/agent-door-worker.ts',clock})
  let relay
  try {
   await h.command('business',{name:'Synthetic response loss workshop',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Workshop']})
   const owner=(await h.state()).actor
   const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
   const issuer='https://synthetic-purse-response-loss.invalid',installationId=randomUUID(),kid=randomUUID(),business=randomUUID()
   const publicKey=await webcrypto.subtle.exportKey('jwk',pair.publicKey),keys={[kid]:{...publicKey,kid,alg:'ES256',use:'sig'}}
   await h.configureMail({RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify(keys),RER_BUSINESS_TRUST:JSON.stringify({v:1,issuer,audience:h.origin,subject:installationId,email:owner.email,keys})})
   const roster=[{email:address,name:'Response loss requester',role:'member',invite:1}]
   const settings=async(rev,team)=>{
    const iat=Math.floor(Date.parse(clock)/1000)
    const signed=await signJws(pair.privateKey,kid,'rer-business-settings+jwt',{v:1,iss:issuer,aud:h.origin,sub:installationId,business,email:owner.email,owner_id:owner.id,jti:randomUUID(),iat,exp:iat+3600,rev,values:{},logo:null,team})
    assert.equal((await h.send('/api/rer/business-settings',{settings:signed})).status,200)
   }
   await settings(1,roster)
   const sponsor=await h.member(address,['requester']),sponsorId=(await h.state(sponsor)).actor.id
   await settings(2,roster.map(person=>({...person,id:sponsorId})))
   const c=createProtocol({fetch:(url,init)=>fetch(url,init),origin:h.origin,surface:JSON.parse(await readFile('agent-surface.json','utf8')),signer:{issuer,installationId,kid,privateKey:pair.privateKey},person:{email:address,cookie:sponsor,sub:sponsorId},business,consent:randomUUID(),agentId:randomUUID(),seq:0,revision:0,points:[],now:()=>Date.parse(clock)})
   await c.adopt(policy)
   const disposition=phase==='held'?'review':'autonomous'
   const args={workflow:'intake',draft:'Synthetic '+phase+' response loss preparation',fields:{need:'Safety supplies'},references:[],idempotency_key:randomUUID()}
   const params={name:tool,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':VERSION}}
   const rpc=id=>JSON.stringify({jsonrpc:'2.0',id,method,params})
   const headers={host:new URL(h.origin).host,origin:h.origin,authorization:'Bearer '+await accessToken(c),accept:contentType+', '+['text','event-stream'].join('/'),'content-type':contentType,'MCP-Protocol-Version':VERSION,'Mcp-Method':method,'Mcp-Name':tool}
   const originalId='lost-'+randomUUID(),body=rpc(originalId)
   const before=(await h.state(sponsor)).data
   assert.equal(before.agentRun.length,0)
   const mailCount=h.messages.length
   relay=await responseLossRelay(h.origin)
   const loss=await lostCall(relay.url,headers,body),edge=await relay.completed
   assert.equal(edge.failure,undefined,'Relay must complete the actual Worker request')
   assert.equal(edge.forwarded,1);assert.equal(edge.status,200)
   assert.equal(edge.workerCompleted,true);assert.ok(edge.responseBytes>0)
   assert.equal(edge.requestSha256,createHash('sha256').update(body).digest('hex'))
   assert.equal(edge.downstreamBytes,0)
   assert.ok(loss.failure instanceof Error,'The caller must observe transport failure')
   assert.equal(loss.failure.code,'ECONNRESET')
   assert.equal(loss.status,undefined);assert.equal(loss.receivedBytes,0)
   assert.equal(loss.parsed,undefined,'The lost call must expose no parsed tool outcome')
   // The edge is one-use: an accidental second submission must never reach
   // the Worker. Recovery uses the canonical door below instead.
   const reusedRelay=await fetch(relay.url,{method:'POST',headers,body,signal:AbortSignal.timeout(25_000)})
   assert.equal(reusedRelay.status,410,'The response-loss relay must reject reuse')
   assert.equal(await reusedRelay.text(),'')
   await relay.close();relay=undefined
   const native=(await h.state(sponsor)).data
   assert.equal(native.agentRun.length,1,'Read the persisted effect before any retry')
   const preparation=native.agentRun[0]
   assert.equal(preparation.draft,args.draft);assert.equal(preparation.actor,sponsorId)
   assert.equal(preparation.preparedBy.agent.id,c.agentId)
   assert.equal(preparation.preparedBy.for.id,sponsorId)
   const auditRead=async()=>{
    const read=await h.send('/agents/api/audit',undefined,h.owner)
    assert.equal(read.status,200);assert.equal(read.value.differs_from_policy,0)
    return read.value.rows.filter(row=>row.idempotency_key===args.idempotency_key)
   }
   const originalRows=await auditRead()
   assert.equal(originalRows.length,1)
   const original=originalRows[0]
   assert.equal(original.outcome,'done');assert.equal(original.replay_of,null)
   const attributed=row=>{
    assert.equal(row.tool,tool);assert.equal(row.door,'mcp')
    assert.equal(row.agent.id,c.agentId);assert.equal(row.sponsor.id,sponsorId)
    assert.equal(row.consent,c.consent);assert.equal(row.client_id,'rer-agent-conformance')
    assert.equal(row.revision,c.revision);assert.equal(row.decision,disposition)
    assert.deepEqual(row.classes,[{class:'standard',facts:{measure:1}}])
    assert.ok(row.rules.some(rule=>rule.do===disposition));assert.equal(row.code,null)
   }
   attributed(original)
   assert.equal(preparation.companyDecision.id,original.operation_id)
   const ownerNative=(await h.state()).data
   const nativeAudit=ownerNative.audit.filter(row=>row.action==='prepare'&&row.record===preparation.id)
   assert.equal(nativeAudit.length,1)
   assert.equal(nativeAudit[0].actor,sponsorId);assert.equal(nativeAudit[0].agent.id,c.agentId)
   const reviewRead=async()=>{
    const read=await h.send('/agents/api/reviews',undefined,sponsor)
    assert.equal(read.status,200);return read.value.reviews
   }
   const reviews=await reviewRead(),review=reviews[0]
   if(phase==='held') {
    assert.equal(reviews.length,1);assert.equal(review.id,original.review.id)
    assert.equal(review.decision_id,original.id);assert.equal(review.state,'open')
   } else {assert.deepEqual(reviews,[]);assert.equal(original.review,null)}
   const retainedCall=()=>h.db.prepare('SELECT * FROM agent_door_calls WHERE decision_id=?').bind(original.id).first()
   const retained=await retainedCall()
   assert.ok(retained,'The completed call must be durable before its response is retried')
   assert.equal(retained.state,'done')
   assert.equal(retained.agent,c.agentId);assert.equal(retained.key,args.idempotency_key)
   const saved=JSON.parse(retained.outcome)
   assert.equal(saved.outcome,'done');assert.equal(saved.result.id,preparation.id)
   const retryIds=['retry-'+randomUUID(),'repeat-'+randomUUID()]
   for(const id of retryIds) {
    assert.notEqual(id,originalId)
    const response=await fetch(h.origin+'/mcp',{method:'POST',headers,body:rpc(id),signal:AbortSignal.timeout(25_000)})
    assert.equal(response.status,200)
    const answer=await response.json()
    assert.equal(answer.jsonrpc,'2.0');assert.equal(answer.id,id)
    assert.equal(answer.error,undefined);assert.equal(answer.result.isError,false)
    assert.equal(answer.result.resultType,'complete')
    assert.deepEqual(answer.result.structuredContent,saved.result,'Return the original retained structured result')
    for(const [field,value]of Object.entries(saved.result))assert.deepEqual(preparation[field],value,'Independent native record differs at '+field)
    assert.equal(answer.result._meta[decisionKey].disposition,disposition)
    assert.equal(answer.result._meta[decisionKey].revision,c.revision)
    if(review)assert.deepEqual(answer.result._meta[reviewKey],{id:review.id})
    else assert.equal(answer.result._meta[reviewKey],undefined)
    const rows=await auditRead(),replayed=rows.find(row=>row.id===answer.result._meta[decisionKey].id)
    assert.ok(replayed);assert.equal(replayed.outcome,'replayed')
    assert.equal(replayed.replay_of,original.id);assert.equal(replayed.operation_id,original.operation_id)
    assert.notEqual(replayed.id,original.id);attributed(replayed)
    assert.deepEqual(replayed.review,original.review)
    assert.deepEqual((await h.state(sponsor)).data,native,'A retry cannot add a native effect or audit')
    assert.deepEqual((await h.state()).data,ownerNative)
    assert.deepEqual(await reviewRead(),reviews,'A replay cannot replace or duplicate the original review')
    assert.deepEqual(await retainedCall(),retained,'A replay cannot replace the completed call or refresh its retention start')
   }
   const rows=await auditRead()
   assert.equal(rows.length,3);assert.equal(rows.filter(row=>row.outcome==='done').length,1)
   assert.equal(rows.filter(row=>row.outcome==='replayed').length,2)
   for(const kind of ['request','decision','order','commitment','invoice','orderSend'])assert.deepEqual(native[kind]??[],before[kind]??[])
   assert.equal(h.messages.length,mailCount,'Response recovery must not send mail')
   assert.ok(c.points.every(point=>point.ok))
   if(visit)await visit({h,sponsor,phase,preparation,original,review,rows})
   receipts.push({phase,disposition,policyRevision:c.revision,preparations:1,nativePreparationAudit:1,completedCalls:1,replayedCalls:2,reviewCount:reviews.length,reviewState:review?.state??null,relay:edge,clientFailure:loss.failure.code,parsedOutcome:false,relayReuseRejected:true,originalCallUnchanged:true,newRpcIds:true,equalStructuredResults:true})
   console.log('PROBE BASE-AGENT-012 2 '+phase+': authenticated raw MCP write -> Worker complete, response dropped, ECONNRESET without parsed outcome; native preparation and attributed audit retained; two canonical retries return their new IDs, equal original content, one effect and original review handle')
  } finally {
   try {await relay?.close()} finally {await h.close()}
  }
 }
 return receipts
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await agentDoorResponseLoss()))
