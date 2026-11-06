import assert from 'node:assert/strict'
import {randomUUID,webcrypto} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {harness} from './purse-harness.mjs'
import {withAgentBrowser} from './agent-door-browser-session.mjs'
import {createProtocol,errorCode} from '../src/modules/agent-door/conformance/protocol.mjs'
import {signJws,accessToken} from '../src/modules/agent-door/conformance/crypto.mjs'

// Freeze the run's starting instant so midnight cannot split cap admission.
// Start at real time because the native SQL authority fence also checks expiry.
const clock=new Date().toISOString()
const address=number=>['synthetic-purse-'+number,'example.test'].join('@')
const value=answer=>{assert.equal(answer.result?.isError,false,errorCode(answer));return answer.result.structuredContent}
const effects=state=>Object.fromEntries(['request','revision','decision','commitment','policy','budget','periodBudgets','totals','order','orderSend'].map(kind=>[kind,state[kind]??[]]))
const total=rows=>rows.reduce((sum,row)=>sum+row.amountMinor,0)

// One native money journey: real invitations, signed company policy, MCP,
// person approval pages and independently reconciled purchasing and usage.
const h=await harness({worker:'tests/agent-door-worker.ts',clock})
try {
 await h.command('business',{name:'Synthetic policy workshop',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Workshop']})
 const supplier=await h.command('supplier',{name:'Synthetic policy supplier',status:'active',reason:'Reviewed supplier',contacts:[]})
 const requesterEmail=address(8301),approverEmail=address(8302)
 const ownerId=(await h.state()).actor.id
 const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),kid=randomUUID()
 const publicKey=await webcrypto.subtle.exportKey('jwk',pair.publicKey),publicKeys={[kid]:{...publicKey,kid,alg:'ES256',use:'sig'}}
 const issuer='https://synthetic-purse-83.invalid',installationId=randomUUID(),business='synthetic-purse-83'
 // The bootstrap owner's existing native address is supplied by the harness.
 const ownerAddress=(await h.state()).actor.email
 await h.configureMail({RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify(publicKeys),RER_BUSINESS_TRUST:JSON.stringify({v:1,issuer,audience:h.origin,subject:installationId,email:ownerAddress,keys:publicKeys})})
 const iat=Math.floor(Date.parse(clock)/1000)
 const roster=[{email:requesterEmail,name:'Policy requester',role:'member',invite:1},{email:approverEmail,name:'Designated policy approver',role:'member',invite:1}]
 const settings=async(rev,team)=>{
  const signed=await signJws(pair.privateKey,kid,'rer-business-settings+jwt',{v:1,iss:issuer,aud:h.origin,sub:installationId,business,email:ownerAddress,owner_id:ownerId,jti:randomUUID(),iat,exp:iat+3600,rev,values:{},logo:null,team})
  const response=await h.send('/api/rer/business-settings',{settings:signed})
  assert.equal(response.status,200);assert.ok(response.value.team.every(row=>row.state!=='conflict'))
 }
 // Signed roster admission creates native invitations; confirmations create
 // real sessions. A later roster revision binds their stable Business IDs.
 await settings(1,roster)
 const requester=await h.member(requesterEmail,['requester']),approver=await h.member(approverEmail,['approver'])
 const requesterId=(await h.state(requester)).actor.id,approverId=(await h.state(approver)).actor.id
 assert.notEqual(requesterId,approverId)
 await settings(2,roster.map(row=>({...row,id:row.email===requesterEmail?requesterId:approverId})))
 const nativePolicy=await h.command('policy',{name:'Independent native authority',currency:'USD',category:'*',project:'*',approver:approverEmail,limitMinor:3000000,budgetMinor:10000000})
 const request=(url,init)=>h.mf.dispatchFetch(url,init)
 const c=createProtocol({fetch:request,origin:h.origin,surface:JSON.parse(await readFile('agent-surface.json','utf8')),signer:{issuer,installationId,kid,privateKey:pair.privateKey},person:{email:approverEmail,cookie:approver,sub:approverId},business,consent:randomUUID(),agentId:randomUUID(),seq:0,revision:0,points:[],now:()=>Date.parse(clock)})
 const secondAgent=randomUUID(),agentIds=[c.agentId,secondAgent]
 const personRule='money-person',smallRule='money-small',blockedRule='money-blocked'
 const policy=cap=>({schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[
  {id:'all',class:'*',do:'autonomous'},
  {id:blockedRule,class:'money',do:'blocked'},
  {id:personRule,class:'money',max:{amount:1000000,currency:'USD'},do:'approval',approver:['person:'+approverId],wait:'PT1H'},
  {id:smallRule,class:'money',seed:'purse',max:{amount:50000,currency:'USD'},...(cap?{max_per_day:{amount:cap,currency:'USD'}}:{}),do:'autonomous'},
 ],spend:{none:true}})
 await c.adopt(policy())
 const state=async()=>(await h.state()).data
 const create=async amount=>{
  const draft=await h.command('request',{title:'Policy purchase '+amount,supplier:supplier.id,currency:'USD',needDate:'2026-12-15',location:'Denver',costCentre:'Operations',lines:[{description:'Reviewed equipment',quantity:'1',unitMinor:amount,category:'Equipment',project:'Workshop'}],freightMinor:0,taxMinor:0,terms:'Recorded supplier terms'},requester)
  const pending=await h.command('submit',{id:draft.id,revision:draft.revision},requester)
  assert.equal(pending.status,'pending');assert.equal(pending.policy,nativePolicy.id);assert.equal(pending.totalMinor,amount)
  return pending
 }
 const args=record=>({id:record.id,revision:record.revision,decision:'approved',reason:'Exact native purchase decision',idempotency_key:randomUUID()})
 const call=input=>c.tool('purse.requests.decide',input)
 const classification=(answer,amount,disposition,rule)=>{
  assert.ok(answer.decision,JSON.stringify({status:answer.status,body:answer.body}))
  assert.equal(answer.decision.disposition,disposition);assert.equal(answer.decision.revision,c.revision)
  assert.deepEqual(answer.decision.classes,[
   {class:'money',facts:{measure:amount,currency:'USD',counterparty:'known'},rule,do:disposition},
   {class:'commitment',facts:{measure:amount,currency:'USD',counterparty:'known'},rule:'all',do:'autonomous'},
  ])
 }
 const usage=async(expected,expectedAgents=expected.map(()=>c.agentId))=>{
  const rows=(await h.db.prepare('SELECT seed,agent,classes,at FROM agent_door_usage ORDER BY rowid').all()).results
  assert.equal(rows.length,expected.length)
  assert.ok(rows.every(row=>row.seed==='purse'&&row.at===Date.parse(clock)))
  assert.deepEqual(rows.map(row=>row.agent),expectedAgents)
  assert.deepEqual(rows.map(row=>JSON.parse(row.classes).find(item=>item.class==='money').facts.measure),expected)
  for(const cls of ['money','commitment'])assert.equal(rows.flatMap(row=>JSON.parse(row.classes)).filter(item=>item.class===cls).reduce((sum,item)=>sum+item.facts.measure,0),expected.reduce((sum,amount)=>sum+amount,0))
  const native=await state(),decisions=native.decision.filter(row=>agentIds.includes(row.preparedBy?.agent.id))
  assert.equal(decisions.length,expected.length)
  assert.equal(total(native.commitment),expected.reduce((sum,amount)=>sum+amount,0))
  assert.equal(native.totals.USD??0,expected.reduce((sum,amount)=>sum+amount,0))
  assert.deepEqual(native.policy.find(row=>row.id===nativePolicy.id),nativePolicy)
  assert.deepEqual(decisions.map(row=>native.request.find(record=>record.id===row.request).totalMinor).sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b))
  assert.equal(native.order.length,0);assert.equal(native.orderSend?.length??0,0)
 }
 const audit=async(input,disposition,rule,outcome)=>{
  const response=await h.send('/agents/api/audit',undefined,h.owner);assert.equal(response.status,200)
  const view=response.value,row=view.rows.find(row=>row.idempotency_key===input.idempotency_key&&row.outcome===outcome)
  assert.ok(row);assert.equal(view.differs_from_policy,0);assert.equal(row.revision,c.revision);assert.equal(row.decision,disposition)
  assert.deepEqual(row.rules,[{class:'money',rule,do:disposition},{class:'commitment',rule:'all',do:'autonomous'}])
  assert.deepEqual(row.resource,{kind:'request',id:input.id});return row
 }
 const small=await create(40000),medium=await create(60000),large=await create(2000000)
 const smallArgs=args(small),beforeSmall=await state(),autonomous=await call(smallArgs)
 classification(autonomous,40000,'autonomous',smallRule);assert.equal(value(autonomous).status,'approved')
 assert.equal((await state()).decision.length,beforeSmall.decision.length+1)
 await usage([40000]);await audit(smallArgs,'autonomous',smallRule,'done')
 const smallAfter=effects(await state());assert.deepEqual(value(await call(smallArgs)),value(autonomous));assert.deepEqual(effects(await state()),smallAfter)
 await usage([40000])
 const mediumArgs=args(medium),beforePending=effects(await state()),pending=await call(mediumArgs)
 classification(pending,60000,'approval',personRule)
 assert.equal(pending.result.resultType,'input_required');assert.equal(pending.result.structuredContent,undefined)
 const handle=pending.result._meta['com.runeditrun/approval']
 assert.ok(handle.id);assert.equal(new URL(handle.url).pathname,'/agents/approvals/'+handle.id)
 assert.equal(pending.result.inputRequests.approval.method,['elicitation','create'].join('/'))
 assert.equal(pending.result.inputRequests.approval.params.mode,'url')
 assert.equal(pending.result.inputRequests.approval.params.url,handle.url)
 assert.deepEqual((await call(mediumArgs)).result._meta['com.runeditrun/approval'],handle)
 assert.deepEqual(effects(await state()),beforePending);await usage([40000]);await audit(mediumArgs,'approval',personRule,'pending')
 const approvalPath='/agents/api/approvals/'+handle.id,approval=(await c.personJson(approvalPath)).approval
 assert.equal(approval.state,'pending');assert.deepEqual(approval.approvers,['person:'+approverId]);assert.deepEqual(approval.summary.amount,{value:600,currency:'USD'})
 const consent={revision:approval.revision,summary_sha256:approval.summary_sha256}
 assert.equal((await h.send(approvalPath+'/approve',consent,requester)).status,403)
 assert.equal((await h.send(approvalPath+'/approve',consent,h.owner)).status,403)
 assert.deepEqual(effects(await state()),beforePending);await usage([40000])
 const blockedArgs=args(large),blocked=await call(blockedArgs)
 classification(blocked,2000000,'blocked',blockedRule);assert.equal(errorCode(blocked),'policy_blocked')
 assert.deepEqual(effects(await state()),beforePending);await usage([40000]);await audit(blockedArgs,'blocked',blockedRule,'refused')
 // Browser approval is the actual signed-in person action, not an API surrogate.
 await withAgentBrowser({request,origin:h.origin,cookie:approver},async({page,capture})=>{
  await page.goto(handle.url,{waitUntil:'networkidle'})
  assert.equal(await page.locator('[data-approval-state="pending"]').count(),1)
  assert.equal(await page.getByText('Amount $600.00',{exact:true}).count(),1)
  await page.getByText('Details',{exact:true}).click()
  assert.ok((await page.locator('main').innerText()).includes('Designated policy approver'))
  await capture('policy-limits-pending')
  assert.deepEqual(effects(await state()),beforePending)
  const response=page.waitForResponse(response=>new URL(response.url()).pathname===approvalPath+'/approve')
  await page.getByRole('button',{name:'Approve',exact:true}).click()
  assert.equal((await response).status(),200)
  await page.locator('[data-approval-state="executed"]').waitFor()
  await capture('policy-limits-confirmed')
 })
 const confirmation=await c.tool('purse.requests.decide',mediumArgs,{requestState:pending.result.requestState}),completed=value(confirmation)
 const receipt=confirmation.result._meta['com.runeditrun/receipt']
 assert.equal(receipt.approval_id,handle.id);assert.equal(receipt.decision_id,pending.decision.id)
 assert.deepEqual(receipt.approved_by,[approverId])
 assert.equal(completed.status,'approved')
 const mediumAfter=await state(),decision=mediumAfter.decision.find(row=>row.request===medium.id)
 assert.deepEqual(decision.companyApprovers,[{id:approverId,name:'Designated policy approver'}])
 assert.equal(decision.preparedBy.for.id,approverId)
 await usage([40000,60000]);await audit(mediumArgs,'approval',personRule,'done')
 assert.equal((await h.send(approvalPath+'/approve',consent,approver)).value.approval.state,'executed')
 assert.deepEqual(effects(await state()),effects(mediumAfter));await usage([40000,60000])
 assert.deepEqual((await call(mediumArgs)).result._meta['com.runeditrun/receipt'],receipt)
 console.log('PROBE BASE-AGENT-007 point 3 thresholds: MCP request decision -> USD 400 autonomous, USD 600 pending without native effects until the named signed-in person approves, USD 20000 blocked without effects; money and commitment retained')
 // Usage from the first revision must still count under a seed-scoped cap.
 await c.adopt(policy(150000))
 const capFit=await create(50000),capCross=await create(40000),fitArgs=args(capFit),crossArgs=args(capCross)
 const fit=await call(fitArgs);classification(fit,50000,'autonomous',smallRule);assert.equal(value(fit).status,'approved')
 await usage([40000,60000,50000]);await audit(fitArgs,'autonomous',smallRule,'done')
 // The daily rule is seed-scoped: another agent must see the first one's usage.
 const token=await accessToken(c,{act:{sub:secondAgent,name:'Second policy agent',specialist:'procurement'}})
 const beforeCross=effects(await state()),cross=await c.tool('purse.requests.decide',crossArgs,{token})
 classification(cross,40000,'approval',personRule);assert.equal(cross.result.resultType,'input_required')
 assert.deepEqual(effects(await state()),beforeCross);await usage([40000,60000,50000]);await audit(crossArgs,'approval',personRule,'pending')
 assert.equal((await c.decideApproval(cross)).body.approval.state,'executed')
 assert.equal(value(await c.tool('purse.requests.decide',crossArgs,{token,requestState:cross.result.requestState})).status,'approved')
 await usage([40000,60000,50000,40000],[c.agentId,c.agentId,c.agentId,secondAgent]);await audit(crossArgs,'approval',personRule,'done')
 assert.equal((await state()).request.find(row=>row.id===large.id).status,'pending')
 assert.ok(c.points.every(point=>point.ok),JSON.stringify(c.points.filter(point=>!point.ok)))
 console.log('PROBE BASE-AGENT-007 point 3 daily cap: signed seed-scoped USD 1500 cap -> native usage totals 1000 then 1500; crossing USD 400 uses the named approval rule at revision 2 without premature effects; approved total 1900 matches four native decisions and reservations')
} finally {await h.close()}
