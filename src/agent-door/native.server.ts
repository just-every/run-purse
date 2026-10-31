import { ToolRefusal, type ToolContext, type ResourceContext } from '../modules/agent-door/index.ts'
import type { Bindings } from '../auth.server'
import { command } from '../purse/api'
import { load, save, readFence } from '../purse/store'
import { visible } from '../purse/documents'
import { projectCommandResult } from '../purse/command-projection'
import { Fault, roles, put, all, type Actor, type Data } from '../purse/types'
import { nativePeople } from './people.server'
import { recordKinds } from './record-types'
import { commentThread } from '../purse/comments'
import { canReadCommentParent } from '../purse/access-records'
import { notificationList } from '../purse/notifications'
import { invoiceExceptionQueue } from '../purse/invoice-exceptions'
import { savedReportDefinitions } from '../purse/saved-reports'
import { orderThreadFollowup } from '../purse/order-thread'

export function nativeRefusal(error: unknown): never {
  if(error instanceof Fault) throw new ToolRefusal(error.status===409?'native_conflict':error.status===403?'permission_denied':error.status===404?'not_found':'invalid_arguments',error.message)
  throw error
}

export async function nativeActor(env: Bindings, ctx: ResourceContext | ToolContext): Promise<Actor> {
  const person=await nativePeople(env).person(ctx.person.id)
  if (!person?.active) throw new ToolRefusal('unauthenticated')
  const row=await env.DB.prepare('SELECT version FROM oa_operators WHERE id=? AND status=\'active\'').bind(person.id).first<{version:number}>()
  if (!row) throw new ToolRefusal('unauthenticated')
  const actor:Actor={id:person.id,email:person.email,owner:person.role==='owner',session:'',version:row.version,dev:false}
  const policy=await env.DB.prepare('SELECT envelope,local_revision FROM agent_door_state WHERE id=1').first<{envelope:string|null;local_revision:number}>()
  if (!policy) throw new ToolRefusal('policy_unset')
  actor.agent={id:ctx.agent.id,name:ctx.agent.name,label:`${ctx.agent.name} for ${person.name}`,consent:ctx.consent,envelope:policy.envelope,localRevision:policy.local_revision,approvers:'approvers' in ctx?ctx.approvers:[]}
  return actor
}
export async function snapshot(env:Bindings,ctx:ResourceContext|ToolContext) {
 try {
  const a=await nativeActor(env,ctx), {state,revision}=await load(env.DB)
  if (!roles(state,a).length) throw new ToolRefusal('permission_denied')
  // Use the native HTTP JSON representation, which omits optional undefined
  // view fields before the door validates and retains an outcome.
  const projected=JSON.parse(JSON.stringify(visible(state,a))) as ReturnType<typeof visible>
  await readFence(env.DB,a,revision)
  return {a,state,revision,projected}
 } catch(error) {
  if(error instanceof Fault) throw new ToolRefusal(error.status===409?'native_conflict':error.status===403?'permission_denied':'not_found',error.message)
  throw error
 }
}
export async function execute(env:Bindings,op:string,args:Record<string,unknown>,ctx:ToolContext,onRecord?:(kind:string,id:string)=>void) {
  try {
    const a=await nativeActor(env,ctx), {state,revision}=await load(env.DB), before=structuredClone(state)
    if(a.agent)a.agent.admission=ctx.operationId
    const result=await command(state,a,op,args,env)
    // Attribution is appended to the native effect, never substituted for its native sponsor.
    for(const [key,row] of state) if(row.revision!==before.get(key)?.revision) {
      put(state,row.kind,row.id,{...row.value,preparedBy:{agent:{id:ctx.agent.id,name:ctx.agent.name},for:{id:a.id,name:ctx.person.name},label:ctx.actor.label},companyDecision:{id:ctx.operationId},...(ctx.approvers.length?{companyApprovers:ctx.approvers}:{})})
    }
    await save(env.DB,a,before,state,revision)
    if(onRecord) {
      const projected=visible(state,a).data
      for(const [key,row] of state) if(row.revision!==before.get(key)?.revision
        && recordKinds.some(kind=>kind===row.kind)
        && Array.isArray(projected[row.kind]) && projected[row.kind].some((record:Data)=>record.id===row.id)) onRecord(row.kind,row.id)
    }
    return JSON.parse(JSON.stringify(projectCommandResult(state,a,result))) as Data
  } catch(error) {
    if(error instanceof Fault) throw new ToolRefusal(error.status===409?'native_conflict':error.status===403?'permission_denied':error.status===404?'not_found':'invalid_arguments',error.message)
    throw error
  }
}

// Public resources and read tools use the same native view functions as HTTP.
export async function nativeRecords(env:Bindings,ctx:ResourceContext|ToolContext,kind:string):Promise<Data[]> {
  try {
    const {a,state,revision,projected}=await snapshot(env,ctx)
    let records=projected.data[kind]
    if(kind==='notification') records=notificationList(state,a)
    if(kind==='invoiceException') records=await invoiceExceptionQueue(state,a,env)
    if(kind==='savedReport') records=savedReportDefinitions(state,a)
    if(kind==='comment') {
      const threads=new Map<string,{kind:string;id:string}>()
      for(const comment of all(state,'comment')) {
        const parent=state.get(comment.kind+':'+comment.record)?.value
        if(parent&&canReadCommentParent(state,a,comment.kind,parent)) threads.set(comment.kind+':'+comment.record,{kind:comment.kind,id:comment.record})
      }
      records=(await Promise.all([...threads.values()].map(parent=>commentThread(state,a,parent.kind,parent.id,env)))).flatMap(thread=>thread.comments)
    }
    if(kind==='orderThreadMessage') records=(projected.data.order??[]).flatMap((order:Data)=>{
      try{return orderThreadFollowup(state,a,order).messages}catch(error){if(error instanceof Fault&&error.status===403)return [];throw error}
    })
    await readFence(env.DB,a,revision)
    return Array.isArray(records)?JSON.parse(JSON.stringify(records)):[]
  }catch(error){return nativeRefusal(error)}
}
export async function nativeRecord(env:Bindings,ctx:ResourceContext|ToolContext,kind:string,id:string) {
  return (await nativeRecords(env,ctx,kind)).find(row=>row.id===id)??null
}
