import { ToolRefusal, type ToolContext, type ResourceContext } from '../modules/agent-door/index.ts'
import type { Bindings } from '../auth.server'
import { command } from '../purse/api'
import { load, save, readFence } from '../purse/store'
import { visible } from '../purse/documents'
import { projectCommandResult } from '../purse/command-projection'
import { Fault, roles, put, type Actor, type Data } from '../purse/types'
import { nativePeople } from './people.server'

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
  const projected=visible(state,a)
  await readFence(env.DB,a,revision)
  return {a,state,revision,projected}
 } catch(error) {
  if(error instanceof Fault) throw new ToolRefusal(error.status===409?'native_conflict':error.status===403?'permission_denied':'not_found',error.message)
  throw error
 }
}
export async function execute(env:Bindings,op:string,args:Record<string,unknown>,ctx:ToolContext) {
  try {
    const a=await nativeActor(env,ctx), {state,revision}=await load(env.DB), before=structuredClone(state)
    const result=await command(state,a,op,args,env)
    // Attribution is appended to the native effect, never substituted for its native sponsor.
    for(const [key,row] of state) if(row.revision!==before.get(key)?.revision) {
      put(state,row.kind,row.id,{...row.value,preparedBy:{agent:{id:ctx.agent.id,name:ctx.agent.name},for:{id:a.id,name:ctx.person.name},label:ctx.actor.label},...(ctx.approvers.length?{companyApprovers:ctx.approvers}:{})})
    }
    await save(env.DB,a,before,state,revision)
    return projectCommandResult(state,a,result)
  } catch(error) {
    if(error instanceof Fault) throw new ToolRefusal(error.status===409?'native_conflict':error.status===403?'permission_denied':error.status===404?'not_found':'invalid_arguments',error.message)
    throw error
  }
}
