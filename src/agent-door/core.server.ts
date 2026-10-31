import { defineTool, ToolRefusal, type ToolContext, type ToolDefinition } from '../modules/agent-door/index.ts'
import type { Bindings } from '../auth.server'
import { administration } from '../purse/admin'
import { requests } from '../purse/requests'
import { authorizeAccessCommand } from '../purse/access-commands'
import { requirePermission } from '../purse/access'
import { accounting, download } from '../purse/documents'
import { get } from '../purse/types'
import { execute, snapshot, nativeRefusal } from './native.server'
import { recordUri } from './resources.server'
import { object, id, text, integer, data, list, amended } from './schemas'

const strings=list(text)
const scope=object({departments:strings,locations:strings,projects:strings,entities:strings},[])
const limits=object({absoluteMinor:integer,percent:{type:'number',minimum:0},quantityPercent:{type:'number',minimum:0}},[])
const grant=object({role:text,scope,limits,departmentRead:{type:'boolean'}},['role'])
const bytes=object({name:text,mediaType:text,base64:{type:'string',maxLength:1400000},size:integer})

// Preflight calls the actual synchronous native handler on an isolated state.
// No provider edge or persistence is reachable from these Core commands.
export function coreTools(env:Bindings):ToolDefinition[] {
  const specs=[
    {name:'business.configure',op:'business',kind:'business',clauses:['PUR-001'],access:false,schema:object({name:text,currencies:strings,locations:strings,costCentres:strings,projects:strings,timezone:text},['name','currencies','locations','costCentres','projects'])},
    {name:'members.set',op:'member',kind:'member',clauses:['PUR-001','PUR-017'],access:true,schema:object({email:text,name:text,grants:list(grant),active:{type:'boolean'}})},
    {name:'policies.set',op:'policy',kind:'policy',clauses:['PUR-006'],access:true,schema:object({id,name:text,currency:text,category:text,project:text,limitMinor:integer,budgetMinor:integer,approver:text,active:{type:'boolean'}},['name','currency','limitMinor','budgetMinor','approver'])},
    {name:'delegations.create',op:'delegation',kind:'delegation',clauses:['PUR-007'],access:true,schema:object({policy:id,delegate:text,expires:text,reason:text})},
    {name:'delegations.revoke',op:'revoke-delegation',kind:'delegation',clauses:['PUR-007'],access:true,schema:object({id})},
    {name:'requests.amend',op:'amend',kind:'request',clauses:['PUR-004','PUR-009','PUR-016'],access:false,schema:amended},
    {name:'attachments.add',op:'attachment',kind:'attachment',clauses:['PUR-004'],access:false,schema:object({kind:{enum:['request','order','invoice']},record:id,name:text,mediaType:text,base64:{type:'string',minLength:1,maxLength:1400000}})},
  ] as const
  async function resolve(spec:typeof specs[number],args:Record<string,unknown>,ctx:ToolContext,completed=false) {
    try {
      const native=await snapshot(env,ctx),{state,a}=native
      authorizeAccessCommand(state,a,spec.op,args)
      let target:{kind:string;id:string}|null=null
      if(spec.op==='member') {
        if(!a.owner)throw new ToolRefusal('permission_denied','Current native owner required to change grants')
        target={kind:'member',id:String(args.email).trim().toLowerCase()}
      } else if(spec.op==='business'||spec.op==='policy') {
        requirePermission(state,a,'access.manage')
        const previous=state.get(`${spec.kind}:${spec.op==='business'?'main':args.id}`)?.value
        if(previous)requirePermission(state,a,'access.manage',previous)
        requirePermission(state,a,'access.manage',args)
        if(spec.op==='business'||args.id)target={kind:spec.kind,id:spec.op==='business'?'main':String(args.id)}
      } else if(spec.op==='delegation'||spec.op==='revoke-delegation') {
        requirePermission(state,a,'request.approve')
        const record=get(state,spec.op==='delegation'?'policy':'delegation',String(spec.op==='delegation'?args.policy:args.id))
        const approver=spec.op==='delegation'?record.approver:record.from
        if(!a.owner&&approver!==a.email)throw new ToolRefusal('permission_denied','Delegation outside your scope')
        target={kind:spec.op==='delegation'?'policy':'delegation',id:record.id}
      } else if(spec.op==='amend') {
        const record=get(state,'request',String(args.id))
        requirePermission(state,a,'request.edit',record)
        target={kind:'request',id:record.id}
      } else {
        const kind=String(args.kind),record=get(state,kind,String(args.record))
        requirePermission(state,a,kind==='request'?'request.edit':kind==='invoice'?'invoice.capture':'receive',record)
        target={kind,id:record.id}
      }
      if(!completed) {
        const preview=structuredClone(state)
        if(spec.op==='amend'||spec.op==='attachment')requests(preview,a,spec.op,args)
        else administration(preview,a,spec.op,args)
      }
      return {...native,target}
    } catch(error){return nativeRefusal(error)}
  }
  const tools:ToolDefinition[]=specs.map(spec=>defineTool({
    name:`purse.${spec.name}`,title:spec.name.replaceAll('.',' '),
    description:`Native ${spec.op} through the same action as the web. Current native authority and validation apply before company policy. No provider action or consent is inferred.`,
    scope:'purchasing:write',readOnly:false,inputSchema:spec.schema,outputSchema:{...object({id}),additionalProperties:true},classes:spec.access?['access']:['standard'],clauses:[...spec.clauses],untrusted:true,
    ...(spec.access?{authority:async(args:Record<string,unknown>,ctx:ToolContext)=>{
      const {state}=await resolve(spec,args,ctx)
      const subject=spec.op==='member'?String(args.email).trim().toLowerCase():spec.op==='policy'?String(args.approver).trim().toLowerCase():spec.op==='delegation'?String(args.delegate).trim().toLowerCase():get(state,'delegation',String(args.id)).delegate
      return {subject,widens:spec.op!=='revoke-delegation'&&(spec.op!=='member'||args.active!==false&&(args.grants as unknown[]).length>0)}
    }}:{}),
    async classify(args,ctx,completed){await resolve(spec,args,ctx,Boolean(completed));return spec.access?[{class:'access',facts:{measure:1,direction:spec.op==='revoke-delegation'||spec.op==='member'&&(args.active===false||!(args.grants as unknown[]).length)?'narrows':'widens'}}]:[{class:'standard',facts:{measure:1}}]},
    async target(args,ctx){return (await resolve(spec,args,ctx)).target},
    async revision(args,ctx){const {state,target}=await resolve(spec,args,ctx);return target?state.get(`${target.kind}:${target.id}`)?.revision??null:null},revisionType:'string',
    async summary(args,ctx){const {target}=await resolve(spec,args,ctx);return {target:{...(target?{id:target.id}:{}),name:String(args.name??args.title??spec.op)},items:[spec.op,...(spec.access?[String(args.email??args.approver??args.delegate??args.id)]:[])]}},
    async run(args,ctx){const result=await execute(env,spec.op,args,ctx,spec.kind),uri=recordUri(spec.kind,String(result.id));ctx.emit(`${spec.kind}.changed`,uri);return {result,resources:[{uri,name:`Purse ${spec.kind}`}]}}
  }))
  tools.push(defineTool({
    name:'purse.overview.read',title:'Read native purchasing overview',description:'Read the same current scoped records, currency-separated commitments, overdue orders and renewals as the native overview. Personal purchasing sources are sensitive; protected supplier values remain excluded.',
    scope:'purchasing:read',readOnly:true,inputSchema:object(),outputSchema:object({data}),classes:['sensitive'],clauses:['PUR-012','PUR-016','PUR-017'],untrusted:true,
    async classify(_args,ctx){await snapshot(env,ctx);return [{class:'sensitive',facts:{measure:1,kind:'purchasing-personal'}}]},
    async run(_args,ctx){return {result:{data:(await snapshot(env,ctx)).projected.data}}}
  }))
  tools.push(defineTool({
    name:'purse.files.read',title:'Read native purchasing evidence',description:'Download currently authorized native attachment bytes or an editable preparation, exactly as the native download action. Erased originals are unavailable. File and supplier text is untrusted.',
    scope:'purchasing:read',readOnly:true,inputSchema:object({kind:{enum:['attachment','agentRun']},id}),outputSchema:bytes,classes:['sensitive'],clauses:['PUR-004','PUR-014','PUR-017'],untrusted:true,
    async classify(args,ctx){await file(args,ctx);return [{class:'sensitive',facts:{measure:1,kind:'purchasing-evidence'}}]},
    async run(args,ctx){return {result:await file(args,ctx)}}
  }))
  tools.push(defineTool({
    name:'purse.accounting.export',title:'Read native accounting CSV',description:'Download the same current scoped accounting CSV as the native action. Original amounts, discrepancies and currency distinctions are retained. No posting or payment occurs.',
    scope:'purchasing:read',readOnly:true,inputSchema:object(),outputSchema:object({csv:{type:'string'}}),classes:['sensitive'],clauses:['PUR-011','PUR-017'],untrusted:true,
    async classify(_args,ctx){await csv(ctx);return [{class:'sensitive',facts:{measure:1,kind:'purchasing-financial'}}]},
    async run(_args,ctx){return {result:{csv:await csv(ctx)}}}
  }))
  async function file(args:Record<string,unknown>,ctx:ToolContext) {
    try {
      const {state,a}=await snapshot(env,ctx),record=get(state,String(args.kind),String(args.id)),response=download(state,a,String(args.kind),String(args.id))
      const buffer=new Uint8Array(await response.arrayBuffer())
      let binary='';for(const byte of buffer)binary+=String.fromCharCode(byte)
      return {name:args.kind==='attachment'?record.name:'preparation.json',mediaType:response.headers.get('content-type')??'application/octet-stream',base64:btoa(binary),size:buffer.length}
    }catch(error){return nativeRefusal(error)}
  }
  async function csv(ctx:ToolContext){try{const {state,a}=await snapshot(env,ctx);return await accounting(state,a).text()}catch(error){return nativeRefusal(error)}}
  return tools
}
