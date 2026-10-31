import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {schemaErrors} from '../src/modules/agent-door/conformance/schema.mjs'

const code=answer=>answer.result?._meta?.['com.runeditrun/error']?.code
const value=answer=>{assert.equal(answer.result?.isError,false,JSON.stringify(answer.result));return answer.result.structuredContent}

// Shared by the native transport probe and normal production-Worker Verify.
// Expected bytes, money and authority outcomes are checked independently.
export async function coreNativeJourney({tool,request,origin,cookie,order}) {
 const command=async(op,input,status=200)=>{
  const response=await request(origin+'/api/purse/command/'+op,{method:'POST',headers:{origin,cookie,'content-type':['application','json'].join('/')},body:JSON.stringify(input)})
  assert.equal(response.status,status,op);return response.json()
 }
 const state=async()=>{const response=await request(origin+'/api/purse/state',{headers:{cookie}});assert.equal(response.status,200);return (await response.json()).data}
 const description=await tool('purse.overview.read',{})
 assert.deepEqual(value(description).data,await state())
 const original=await state(),business=original.business[0]
 const businessInput={name:business.name,currencies:business.currencies,locations:business.locations,costCentres:business.costCentres,projects:business.projects,...(business.timezone?{timezone:business.timezone}:{})}
 const configured=value(await tool('purse.business.configure',{...businessInput,idempotency_key:randomUUID()}))
 assert.equal(configured.id,'main');assert.ok(configured.preparedBy.agent.id)
 const afterConfigure=await state()
 assert.ok(afterConfigure.audit.some(row=>row.action==='business'&&row.agent?.id===configured.preparedBy.agent.id))
 const supplier=original.supplier.find(row=>['active','preferred'].includes(row.status))
 const draftInput={title:'Native Core amendment and bytes',supplier:supplier.id,currency:'USD',needDate:'2026-12-15',location:business.locations[0],costCentre:business.costCentres[0],lines:[{description:'Synthetic evidence item',quantity:'2.5',unitMinor:1234,category:'Safety',project:business.projects[0]}],freightMinor:0,taxMinor:0,terms:'Supplied native terms'}
 const native=await command('request',draftInput),draft=value(await tool('purse.requests.create',{...draftInput,idempotency_key:randomUUID()}))
 const amendment={...draftInput,title:'Reviewed exact native amendment',reason:'Correct exact supplied terms'}
 const changed=await command('amend',{...amendment,id:native.id,revision:native.revision})
 const args={...amendment,id:draft.id,revision:draft.revision,idempotency_key:randomUUID()}
 const amended=value(await tool('purse.requests.amend',args))
 assert.equal(amended.revision,changed.revision);assert.equal(amended.totalMinor,3085);assert.equal(amended.status,'draft')
 assert.deepEqual(amended.lines.map(row=>[row.description,row.q,row.unitMinor,row.totalMinor]),changed.lines.map(row=>[row.description,row.q,row.unitMinor,row.totalMinor]))
 const witness=await state()
 assert.deepEqual(value(await tool('purse.requests.amend',args)),amended)
 assert.deepEqual(await state(),witness)
 const refused=await command('amend',{...amendment,id:draft.id,revision:draft.revision},409)
 const stale=await tool('purse.requests.amend',{...args,idempotency_key:randomUUID()})
 assert.equal(code(stale),'native_conflict');assert.equal(code(stale),refused.code);assert.match(refused.error,/Stale request revision/)
 assert.deepEqual(await state(),witness)
 const bytes=Buffer.from('synthetic-purse-original-source'),attachment={kind:'request',record:draft.id,name:'synthetic-purse-original.txt',mediaType:['text','plain'].join('/'),base64:bytes.toString('base64'),idempotency_key:randomUUID()}
 const captured=value(await tool('purse.attachments.add',attachment))
 assert.equal(captured.size,bytes.length);assert.equal(captured.preparedBy.for.id,amended.requester)
 assert.deepEqual(value(await tool('purse.attachments.add',attachment)),captured)
 const downloaded=value(await tool('purse.files.read',{kind:'attachment',id:captured.id}))
 const nativeDownload=await request(origin+'/api/purse/download/attachment/'+captured.id,{headers:{cookie}})
 assert.equal(nativeDownload.status,200);assert.deepEqual(Buffer.from(downloaded.base64,'base64'),bytes)
 assert.deepEqual(Buffer.from(await nativeDownload.arrayBuffer()),bytes)
 const preparation=value(await tool('purse.preparations.create',{workflow:'negotiation',draft:'Editable source-bound nonbinding text',references:[{kind:'request',id:draft.id}],idempotency_key:randomUUID()}))
 const preparedFile=value(await tool('purse.files.read',{kind:'agentRun',id:preparation.id}))
 const nativePreparation=await request(origin+'/api/purse/download/agentRun/'+preparation.id,{headers:{cookie}})
 assert.equal(nativePreparation.status,200);assert.equal(Buffer.from(preparedFile.base64,'base64').toString(),await nativePreparation.text())
 const csv=value(await tool('purse.accounting.export',{})).csv
 const accounting=await request(origin+'/api/purse/accounting',{headers:{cookie}})
 assert.equal(accounting.status,200);assert.equal(csv,await accounting.text())
 if(order) {
  const before=await state(),source=before.request.find(row=>row.id===order.request)
  const input={...source,id:source.id,revision:source.revision,title:'Renewed issued purchase terms',lines:source.lines.map(row=>({...row,unitMinor:row.unitMinor+100})),reason:'Exact issued amendment requires fresh purchasing approval',idempotency_key:randomUUID()}
  const amendedOrder=value(await tool('purse.requests.amend',input))
  assert.equal(amendedOrder.status,'draft');assert.equal(amendedOrder.revision,source.revision+1)
  const blocked=await tool('purse.orders.issue',{id:order.id,revision:amendedOrder.revision,reason:'Must not bypass renewed approval',idempotency_key:randomUUID()})
  assert.equal(code(blocked),'native_conflict')
  const after=await state()
  assert.deepEqual(after.decision,before.decision)
  assert.deepEqual(after.orderSend,before.orderSend)
  assert.equal(after.order.find(row=>row.id===order.id).status,'amendment-pending')
 }
 console.log('PROBE BASE-AGENT-002 Core: native HTTP and MCP -> matching amendments, integer 3085, immutable bytes, preparation downloads and accounting CSV; replay once and stale refusal unchanged')
 return {request:draft.id,file:captured.id}
}

export async function coreStepProof({step,result,request,origin,cookie}) {
 if(!step.id.startsWith('core-')||!result)return
 const response=await request(origin+'/api/purse/state',{headers:{cookie}})
 assert.equal(response.status,200);const native=(await response.json()).data
 if(step.id==='core-file')assert.equal(Buffer.from(result.base64,'base64').toString(),'synthetic-purse-source')
 if(step.id==='core-overview')assert.deepEqual(result.data,native)
 if(step.id==='core-accounting') {
  const csv=await request(origin+'/api/purse/accounting',{headers:{cookie}})
  assert.equal(csv.status,200);assert.equal(result.csv,await csv.text())
 }
 if(['core-business','core-member','core-policy','core-delegation','core-revoke','core-amend','core-attachment'].includes(step.id)) {
  assert.ok(result.preparedBy?.agent.id)
  const action={'core-business':'business','core-member':'member','core-policy':'policy','core-delegation':'delegation','core-revoke':'revoke-delegation','core-amend':'amend','core-attachment':'attachment'}[step.id]
  assert.ok(native.audit.some(row=>row.action===action&&row.agent?.id===result.preparedBy.agent.id))
 }
}

export async function corePolicyProof({c,h,request,origin,cookie,descriptions,readerToken}) {
 const result=await coreNativeJourney({tool:c.tool,request,origin,cookie})
 const before=(await h.state()).data
 for(const [name,args] of [['purse.business.configure',{name:'Unauthorized',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Workshop']}],['purse.members.set',{email:['synthetic-purse-84','example.test'].join('@'),name:'Unauthorized',grants:[{role:'buyer'}],active:true}]]) {
  assert.equal(code(await c.tool(name,{...args,idempotency_key:randomUUID()},{token:readerToken})),'permission_denied')
 }
 assert.deepEqual((await h.state()).data,before)
 const owner=before.member.find(row=>row.name==='Native owner membership')
 const email=owner?.email??['owner','example.test'].join('@')
 assert.equal(code(await c.tool('purse.members.set',{email,name:'Forbidden widening',grants:[{role:'buyer'}],active:true,idempotency_key:randomUUID()})),'self_escalation')
 for(const [name,args] of [['purse.overview.read',{}],['purse.files.read',{kind:'attachment',id:result.file}],['purse.accounting.export',{}]]) {
  assert.deepEqual(schemaErrors(descriptions.get(name).outputSchema,value(await c.tool(name,args))),[])
 }
 console.log('PROBE BASE-AGENT-002 authority: native role denial and sponsor grant widening -> refused with unchanged native state')
}
