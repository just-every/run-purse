import assert from 'node:assert/strict'
import {randomUUID,webcrypto} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {harness} from './purse-harness.mjs'
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs'
import {reauthenticateErasure} from './erasure-flow.mjs'
import {createProtocol,errorCode} from '../src/modules/agent-door/conformance/protocol.mjs'
import {signJws} from '../src/modules/agent-door/conformance/crypto.mjs'

const address=n=>['synthetic-purse-'+n,'example.test'].join('@')
const content=answer=>{assert.equal(answer.result?.isError,false,errorCode(answer));return answer.result.structuredContent}
const handle=answer=>answer.result._meta['com.runeditrun/approval']
const tables={agent_door_calls:['outcome'],agent_door_approvals:['saved','result','approvals'],agent_door_reviews:['saved'],agent_door_audit:['row','evidence'],agent_door_events:['event']}

// Retained preparation custody through native invitations, signed policy, MCP,
// current owner review and current person reads. No sponsor or consent removal.
export async function agentDoorErasure(visit) {
 const clock=new Date().toISOString(),h=await harness({worker:'tests/agent-door-worker.ts',clock})
 try {
  await h.command('business',{name:'Synthetic erasure workshop',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Workshop']})
  const contact={name:'Mary',email:address(9601)}
  const other={name:'Stan',email:address(9602)}
  const supplier=await h.command('supplier',{name:'Synthetic erasure supplier',status:'active',reason:'Owner reviewed',contacts:[contact,other]})
  const sponsorAddress=address(9603),owner=(await h.state()).actor
  const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
  const kid=randomUUID(),issuer='https://synthetic-purse-96.invalid',installationId=randomUUID(),business='synthetic-purse-96'
  const publicKey=await webcrypto.subtle.exportKey('jwk',pair.publicKey),keys={[kid]:{...publicKey,kid,alg:'ES256',use:'sig'}}
  await h.configureMail({RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify(keys),RER_BUSINESS_TRUST:JSON.stringify({v:1,issuer,audience:h.origin,subject:installationId,email:owner.email,keys})})
  const roster=[{email:sponsorAddress,name:'Live preparation sponsor',role:'member',invite:1}]
  const settings=async(rev,team)=>{
   const signed=await signJws(pair.privateKey,kid,'rer-business-settings+jwt',{v:1,iss:issuer,aud:h.origin,sub:installationId,business,email:owner.email,owner_id:owner.id,jti:randomUUID(),iat:Math.floor(Date.parse(clock)/1000),exp:Math.floor(Date.parse(clock)/1000)+3600,rev,values:{},logo:null,team})
   assert.equal((await h.send('/api/rer/business-settings',{settings:signed})).status,200)
  }
  await settings(1,roster)
  const sponsor=await h.member(sponsorAddress,['requester']),sponsorId=(await h.state(sponsor)).actor.id
  await settings(2,roster.map(row=>({...row,id:sponsorId})))
  const surface=JSON.parse(await readFile('agent-surface.json','utf8'))
  const protocol=agentId=>createProtocol({fetch:(url,init)=>h.mf.dispatchFetch(url,init),origin:h.origin,surface,signer:{issuer,installationId,kid,privateKey:pair.privateKey},person:{email:sponsorAddress,cookie:sponsor,sub:sponsorId},business,consent:randomUUID(),agentId,seq:0,revision:0,points:[],now:()=>Date.parse(clock)})
  const c=protocol(randomUUID()),autoClient=protocol(randomUUID()),reviewClient=protocol(randomUUID()),unrelated=protocol(randomUUID()),cappedClient=protocol(randomUUID())
  const policy={schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'all',class:'*',do:'autonomous'},{id:'cap-fallback',class:'*',agent:cappedClient.agentId,do:'blocked'},{id:'capped-preparation',class:'standard',seed:'purse',agent:cappedClient.agentId,max_per_day:1,do:'autonomous'},{id:'review-other',class:'*',agent:unrelated.agentId,do:'review'},{id:'review-preparation',class:'*',agent:reviewClient.agentId,do:'review'},{id:'approve-preparation',class:'*',agent:c.agentId,do:'approval',approver:['sponsor'],wait:'PT1H'}],reviewers:['sponsor'],spend:{none:true}}
  const input=(person,label)=>({workflow:'intake',draft:label+' '+person.name+' '+person.email,fields:{contact:person.name,reply:person.email,action:'Reach '+person.email,kind:'Contact '+person.name,logo:'Private note '+person.email,class:'Contact '+person.name,[person.name+' note']:'Private note '+person.email},references:[{kind:'supplier',id:supplier.id}],idempotency_key:randomUUID()})
  const call=args=>c.tool('purse.preparations.create',args)
  const state=async()=>(await h.state()).data
  await c.adopt(policy)
  const autoArgs=input(contact,'Autonomous retained draft'),auto=content(await autoClient.tool('purse.preparations.create',autoArgs))
  const otherArgs=input(other,'Unrelated retained draft'),untouched=content(await unrelated.tool('purse.preparations.create',otherArgs))
  const reviewArgs=input(contact,'Review retained draft'),reviewAnswer=await reviewClient.tool('purse.preparations.create',reviewArgs),review=content(reviewAnswer)
  const reviewId=(await h.send('/agents/api/reviews',undefined,sponsor)).value.reviews.find(row=>row.decision_id===reviewAnswer.decision.id).id
  const approvedArgs=input(contact,'Human approved retained draft'),approvedPending=await call(approvedArgs)
  assert.equal((await c.decideApproval(approvedPending)).body.approval.state,'executed')
  const approved=content(await call(approvedArgs))
  const pendingArgs=input(contact,'Pending retained draft'),pending=await call(pendingArgs)
  const hiddenArgs={...input(contact,'Saved input only'),draft:'Neutral saved display'},hidden=await call(hiddenArgs)
  const pendingId=handle(pending).id,approvedId=handle(approvedPending).id,hiddenId=handle(hidden).id
  const approvalPath='/agents/api/approvals/'+pendingId
  const oldApproval=(await h.send(approvalPath,undefined,sponsor)).value.approval
  assert.equal(oldApproval.state,'pending')
  const baseline=await state(),ids=[auto.id,review.id,approved.id]
  assert.equal(baseline.agentRun.length,4)
  for(const id of ids)assert.ok(baseline.agentRun.find(row=>row.id===id).draft.includes(contact.email))
  const unrelatedBefore=baseline.agentRun.find(row=>row.id===untouched.id)
  assert.equal(unrelatedBefore.draft,untouched.draft)
  const chronology=(await h.send('/agents/api/audit',undefined,h.owner)).value.rows
  const identity=rows=>rows.map(({id,at,agent,sponsor,tool,classes,revision,rules,decision,outcome,idempotency_key,approval,review})=>({id,at,agent,sponsor,tool,classes,revision,rules,decision,outcome,idempotency_key,approval,review}))
  for(const [client,args,decision,outcome]of [[autoClient,autoArgs,'autonomous','done'],[reviewClient,reviewArgs,'review','done'],[c,approvedArgs,'approval','pending'],[c,pendingArgs,'approval','pending']]) {
   const row=chronology.find(row=>row.idempotency_key===args.idempotency_key&&row.outcome===outcome)
   assert.ok(row,'Native call has a durable audit row')
   assert.equal(row.agent.id,client.agentId);assert.equal(row.sponsor.id,sponsorId)
   assert.equal(row.consent,client.consent);assert.equal(row.client_id,'rer-agent-conformance')
   assert.equal(row.tool,'purse.preparations.create');assert.equal(row.door,'mcp')
   assert.equal(row.idempotency_key,args.idempotency_key);assert.equal(row.revision,c.revision)
   assert.equal(row.decision,decision);assert.equal(row.outcome,outcome)
   assert.deepEqual(row.classes,[{class:'standard',facts:{measure:1}}])
   assert.equal(row.rules[0].do,decision);assert.ok(row.operation_id);assert.ok(row.agent.name);assert.ok(row.sponsor.name)
   assert.ok(Array.isArray(row.scopes)&&row.scopes.includes('purchasing:write'))
   if(decision==='review')assert.equal(row.review.id,reviewId)
   if(decision==='approval')assert.ok(row.approval.id)
  }
  const chronologyBefore=identity(chronology)
  const reads=async()=>{
   const paths=['/agents/api/audit','/agents/api/reviews','/agents/api/approvals',approvalPath,'/agents/api/approvals/'+approvedId,'/agents/api/approvals/'+hiddenId,'/agents', '/agents/approvals/'+pendingId, '/agents/approvals/'+approvedId]
   return Promise.all(paths.map(async path=>{const response=await h.send(path,undefined,path.includes('audit')?h.owner:sponsor);assert.equal(response.status,200,path);return {path,value:response.value}}))
  }
  assert.ok(JSON.stringify(await reads()).includes(contact.email),'The live display must contain the target before erasure')
  const browser={h,sponsor,contact,other,pendingId,approvedId,reviewId}
  if(visit)await visit({...browser,stage:'before'})
  const preview=async(person=contact)=>{
   const revision=(await h.send('/api/purse/erasure',undefined,h.owner)).value.revision
   const answer=await h.send('/api/purse/erasure/preview',{revision,kind:'contact',id:supplier.id,email:person.email},h.owner)
   assert.equal(answer.status,200,JSON.stringify(answer.value));return answer.value
  }
  const execute=(reviewed,person=contact)=>h.send('/api/purse/erasure/execute',{revision:reviewed.revision,kind:'contact',id:supplier.id,email:person.email,review:reviewed.review,fingerprint:reviewed.fingerprint,consent:true},h.owner)
  await reauthenticateErasure(h)
  const stale=await preview()
  // A replay changes only retained door history, not the native revision.
  await call(pendingArgs)
  assert.equal((await h.send('/api/purse/erasure',undefined,h.owner)).value.revision,stale.revision)
  assert.equal((await execute(stale)).status,409,'Changed retained artifacts require a fresh owner review')
  const reviewed=await preview()
  for(const kind of ['agent_door_calls','agent_door_approvals','agent_door_reviews'])assert.ok(reviewed.fields.some(field=>field.kind===kind),'Owner inventory omits '+kind)
  assert.ok(reviewed.fields.some(field=>field.kind==='agent_door_approvals'&&field.id===hiddenId&&field.path.includes('args')),'Saved input omitted from review')
  assert.ok(!JSON.stringify(reviewed.fields).includes(contact.email),'Inventory lists paths without private before values')
  assert.equal((await h.send('/api/purse/erasure/execute',{revision:reviewed.revision,kind:'contact',id:supplier.id,email:contact.email,review:reviewed.review,fingerprint:reviewed.fingerprint,consent:true},sponsor)).status,403)
  const finalReview=await preview(),erased=await execute(finalReview)
  assert.equal(erased.status,200,JSON.stringify(erased.value));assert.equal(erased.value.phase,'complete')
  const receipt=erased.value
  assert.ok(receipt.installationFields.some(row=>row.store==='agent retained artifacts'))
  const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results
  assert.equal(validatePurchasingArchive(rows),true,'Anonymous native history remains a valid archive source')
  const after=await state()
  for(const personValue of Object.values(contact))assert.ok(!JSON.stringify(after).includes(personValue),personValue)
  assert.equal(after.agentRun.length,baseline.agentRun.length)
  assert.deepEqual(after.agentRun.find(row=>row.id===untouched.id),unrelatedBefore)
  assert.deepEqual(after.supplier.find(row=>row.id===supplier.id).contacts[1],other)
  const displayed=JSON.stringify(await reads())
  for(const personValue of Object.values(contact))assert.ok(!displayed.includes(personValue),'Current display resurrected '+personValue)
  for(const [table,columns]of Object.entries(tables)) {
   const rows=(await h.db.prepare('SELECT '+columns.join(',')+' FROM '+table).all()).results
   for(const personValue of Object.values(contact))assert.ok(!JSON.stringify(rows).includes(personValue),table+' retained '+personValue)
  }
  const afterChronology=(await h.send('/agents/api/audit',undefined,h.owner)).value
  assert.equal(afterChronology.differs_from_policy,0)
  assert.deepEqual(identity(afterChronology.rows.filter(row=>chronology.some(prior=>prior.id===row.id))),chronologyBefore,'Anonymous decision chronology must survive')
  const staleClick=await h.send(approvalPath+'/approve',{revision:oldApproval.revision,summary_sha256:oldApproval.summary_sha256},sponsor)
  assert.equal(staleClick.status,409)
  const current=(await h.send(approvalPath,undefined,sponsor)).value.approval
  assert.equal(current.state,'expired')
  assert.equal((await h.send(approvalPath+'/approve',{revision:current.revision,summary_sha256:current.summary_sha256},sponsor)).status,409)
  if(visit)await visit({...browser,stage:'after'})
  assert.equal((await h.send('/agents/api/reviews/'+reviewId+'/reviewed',{},sponsor)).status,200)
  // Keep the signed policy revision, sponsor, client and consent active. Old
  // claims survive: scrubbing never makes a key available for new execution.
  for(const [client,args,expectedId]of [[autoClient,autoArgs,auto.id],[reviewClient,reviewArgs,review.id],[c,approvedArgs,approved.id],[c,pendingArgs,null],[c,hiddenArgs,null]]) {
   const replay=await client.tool('purse.preparations.create',args)
   if(expectedId)assert.equal(content(replay).id,expectedId)
   else assert.ok(errorCode(replay),'An erased pending call must refuse')
   for(const personValue of Object.values(contact))assert.ok(!JSON.stringify(replay).includes(personValue),'MCP replay resurrected '+personValue)
  }
  assert.equal((await state()).agentRun.length,4,'Replay or stale approval created another preparation')
  const liveArgs=input(other,'Fresh live sponsor preparation')
  assert.equal((await c.decideApproval(await call(liveArgs))).body.approval.state,'executed')
  assert.equal(content(await call(liveArgs)).draft,liveArgs.draft)
  assert.equal((await state()).agentRun.length,5)
  console.log('PROBE BLOCKING-A Mary: owner preview and execute -> 200 and complete; saved approval summaries remain readable; erased pending consent refuses')
  // A contact name can overlap a protocol class label. Erasure must leave the
  // signed policy and consumed daily allowance intact across fresh MCP calls.
  const allowedArgs=input(other,'Consume the daily allowance')
  const allowed=content(await cappedClient.tool('purse.preparations.create',allowedArgs))
  assert.equal(allowed.draft,allowedArgs.draft)
  assert.equal((await state()).agentRun.length,6)
  const cappedArgs=input(other,'Daily allowance already consumed')
  const capped=await cappedClient.tool('purse.preparations.create',cappedArgs)
  assert.equal(errorCode(capped),'policy_blocked')
  assert.equal(capped.decision.revision,c.revision)
  const usageBefore=(await h.db.prepare('SELECT * FROM agent_door_usage ORDER BY rowid').all()).results
  assert.ok(usageBefore.some(row=>row.agent===cappedClient.agentId))
  const preparationsBefore=(await state()).agentRun.length
  const stanReview=await preview(other),stanErased=await execute(stanReview,other)
  assert.equal(stanErased.status,200,JSON.stringify(stanErased.value))
  assert.equal(stanErased.value.phase,'complete')
  assert.deepEqual((await h.db.prepare('SELECT * FROM agent_door_usage ORDER BY rowid').all()).results,usageBefore,'Erasure preserves consumed policy allowances')
  const afterCap=await cappedClient.tool('purse.preparations.create',input(other,'Fresh attempt after contact erasure'))
  assert.equal(errorCode(afterCap),'policy_blocked','Erasing Stan must not reset the daily standard allowance')
  assert.equal(afterCap.decision.revision,c.revision)
  assert.equal((await state()).agentRun.length,preparationsBefore,'A cap refusal must have no native preparation effect')
  for(const {value} of await reads())assert.ok(!JSON.stringify(value).includes(other.email),'Stan remains in retained displays')
  console.log('PROBE BLOCKING-B Stan: capped MCP preparation refused before and after owner erasure under the same policy revision; usage unchanged; no extra preparation')
  const agents=(await h.send('/agents/api/agents',undefined,h.owner)).value
  assert.ok(!JSON.stringify(agents).includes('"revoked":true'))
  console.log('PROBE BASE-AGENT-009 retained-artifact-custody: native owner erasure -> reviewed input, outcome and display copies scrubbed; old claims inert; live sponsor creates once')
  return {preparationsBefore:4,preparationsAfterErasure:4,preparationsAfterFreshApproval:5,retainedFields:receipt.fields.length+receipt.agentArtifactFields.length,affected:receipt.affected.length}
 } finally {await h.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await agentDoorErasure()))
