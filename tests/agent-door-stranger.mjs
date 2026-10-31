import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

// The client has no manifest, native service, fixture ids, signer or person
// session. Authentication and URL approval are supplied by separate actors.
export async function strangerSpecialist({url,request,authorize,approve,task}) {
 const origin=new URL(url).origin
 const metadataResponse=await request(origin+'/.well-known/oauth-protected-resource/mcp')
 assert.equal(metadataResponse.status,200)
 const metadata=await metadataResponse.json()
 assert.equal(new URL(metadata.resource).origin,origin)
 const token=await authorize(metadata)
 let id=0
 const rpc=async(method,params={})=>{
  const response=await request(metadata.resource,{method:'POST',headers:{
   origin,authorization:'Bearer '+token,accept:'application/json, text/event-stream','content-type':'application/json',
   'MCP-Protocol-Version':'2026-07-28','Mcp-Method':method,
   ...(['tools/call','prompts/get'].includes(method)?{'Mcp-Name':params.name}:{}),
  },body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params:{...params,_meta:{
   'io.modelcontextprotocol/protocolVersion':'2026-07-28',
   'io.modelcontextprotocol/clientCapabilities':{elicitation:{url:{}}},
   'io.modelcontextprotocol/clientInfo':{name:'synthetic-purse-specialist',version:'1'},
  }}})})
  assert.equal(response.status,200,method+' HTTP status')
  const body=await response.json()
  assert.ok(!body.error,method+' protocol refusal')
  return body.result
 }
 const discovery=await rpc('server/discover')
 assert.ok(discovery.instructions.includes(origin+'/docs/agents'))
 await rpc('initialize',{protocolVersion:'2026-07-28'})
 const {tools}=await rpc('tools/list')
 const {prompts}=await rpc('prompts/list')
 const promptFor=pattern=>{
  const choices=prompts.filter(prompt=>pattern.test(prompt.description))
  assert.equal(choices.length,1,'Discover one specialist job')
  return choices[0]
 }
 const inspect=await rpc('prompts/get',{name:promptFor(/inspect/i).name})
 const prepare=await rpc('prompts/get',{name:promptFor(/editable/i).name})
 const namedTools=prompt=>{
  const names=prompt.messages.flatMap(message=>message.content.text.match(/purse\.[a-z_]+\.[a-z_]+/g)??[])
  assert.ok(names.length)
  return tools.filter(tool=>names.includes(tool.name))
 }
 const choose=(catalogue,predicate)=>{
  const choices=catalogue.filter(predicate)
  assert.equal(choices.length,1,'Prompt and live schemas identify one action')
  return choices[0]
 }
 const inspection=namedTools(inspect),preparation=namedTools(prepare)
 const list=choose(inspection,tool=>tool.annotations.readOnlyHint&&tool.inputSchema.required.includes('kind')&&!tool.inputSchema.properties.id)
 const read=choose(inspection,tool=>tool.annotations.readOnlyHint&&tool.inputSchema.required.includes('kind')&&tool.inputSchema.required.includes('id'))
 const create=choose(preparation,tool=>!tool.annotations.readOnlyHint&&tool.inputSchema.required.includes('workflow')&&tool.inputSchema.required.includes('draft'))
 const edit=choose(preparation,tool=>!tool.annotations.readOnlyHint&&tool.inputSchema.required.includes('version')&&tool.inputSchema.required.includes('draft'))
 let approvals=0
 const decisions=[],calls=[]
 const call=async(tool,input)=>{
  const args={...input,...(!tool.annotations.readOnlyHint?{idempotency_key:randomUUID()}:{})}
  let answer=await rpc('tools/call',{name:tool.name,arguments:args})
  const decision=answer._meta?.['com.runeditrun/decision']
  assert.ok(decision)
  decisions.push(decision)
  if(answer.resultType==='input_required') {
   assert.equal(decision.disposition,'approval')
   const handle=answer._meta['com.runeditrun/approval']
   assert.equal(new URL(handle.url).origin,origin)
   assert.equal(answer.inputRequests.approval.method,'elicitation/create')
   assert.equal(answer.inputRequests.approval.params.mode,'url')
   assert.equal(answer.inputRequests.approval.params.url,handle.url)
   await approve(handle)
   approvals++
   answer=await rpc('tools/call',{name:tool.name,arguments:args,requestState:answer.requestState})
  }
  assert.equal(answer.isError,false,tool.name+' completes the discovered job')
  assert.ok(answer.structuredContent)
  calls.push(tool.name)
  return answer.structuredContent
 }
 assert.ok(list.inputSchema.properties.kind.enum.includes('supplier'))
 const suppliers=await call(list,{kind:'supplier'})
 assert.ok(suppliers.records.length,'Inspection uses populated native records')
 const supplier=suppliers.records.find(record=>record.name===task.supplier)
 assert.ok(supplier,'Find the task supplier without a fixture id')
 const detail=await call(read,{kind:'supplier',id:supplier.id})
 assert.equal(detail.record.name,task.supplier)
 const draft=await call(create,{workflow:'intake',draft:task.draft,fields:{need:task.need,supplier:supplier.name,quantity:task.quantity},references:[{kind:'supplier',id:supplier.id}]})
 assert.equal(draft.draft,task.draft)
 assert.equal(draft.workflow,'intake')
 assert.deepEqual(draft.fields,{need:task.need,supplier:supplier.name,quantity:task.quantity})
 assert.equal(draft.mode,'human-preparation')
 assert.equal(draft.model,null)
 assert.ok(draft.missing.includes('need date'),'Missing evidence stays unknown')
 assert.equal(draft.references[0].id,supplier.id)
 assert.ok(draft.references[0].version)
 const edited=await call(edit,{id:draft.id,version:draft.version,draft:task.reviewedDraft})
 assert.equal(edited.draft,task.reviewedDraft)
 assert.equal(edited.version,draft.version+1)
 return {draft:edited,decisions,approvals,calls,supplier:detail.record}
}
