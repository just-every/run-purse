import { ToolRefusal, type ToolContext, type ResourceContext } from '../modules/agent-door/index.ts'
import type { Bindings } from '../auth.server'
import { command } from '../purse/api'
import { load, save, readFence } from '../purse/store'
import { visible } from '../purse/documents'
import { projectCommandResult } from '../purse/command-projection'
import { Fault, roles, put, type Actor, type Data } from '../purse/types'
import { nativePeople } from './people.server'
import { importJobs } from '../purse/import-custody'
import { nativeFaultCode } from '../purse/fault-code'

// The shared door answers a refusal by code. Native HTTP shows its own message to
// the signed-in person, so only the embedded door carries it back to that person.
function refusal(code: string, message: string, ctx?: ResourceContext | ToolContext) {
  return new ToolRefusal(code,message,ctx&&'door' in ctx&&ctx.door==='embedded'?{message}:{})
}
export function nativeRefusal(error: unknown, ctx?: ResourceContext | ToolContext): never {
  if(error instanceof Fault) throw refusal(nativeFaultCode(error.status),error.message,ctx)
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
  if(a.owner)projected.data.importJobs=await importJobs(env.DB,a)
  await readFence(env.DB,a,revision)
  return {a,state,revision,projected}
 } catch(error) {
  if(error instanceof Fault) throw refusal(error.status===409?'native_conflict':error.status===403?'permission_denied':'not_found',error.message,ctx)
  throw error
 }
}
export async function execute(env:Bindings,op:string,args:Record<string,unknown>,ctx:ToolContext,resultKind?:string|((result:Data)=>string)) {
  try {
    const a=await nativeActor(env,ctx), {state,revision}=await load(env.DB), before=structuredClone(state)
    if(a.agent)a.agent.admission=ctx.operationId
    const result=await command(state,a,op,args,env)
    // Attribution is appended to the native effect, never substituted for its native sponsor.
    for(const [key,row] of state) if(row.revision!==before.get(key)?.revision) {
      put(state,row.kind,row.id,{...row.value,preparedBy:{agent:{id:ctx.agent.id,name:ctx.agent.name},for:{id:a.id,name:ctx.person.name},label:ctx.actor.label},companyDecision:{id:ctx.operationId},...(ctx.approvers.length?{companyApprovers:ctx.approvers}:{})})
    }
    await save(env.DB,a,before,state,revision)
    const kind=typeof resultKind==='function'?resultKind(result):resultKind
    return JSON.parse(JSON.stringify(projectCommandResult(state,a,kind?{...result,...state.get(`${kind}:${result.id}`)!.value}:result))) as Data
  } catch(error) {
    if(error instanceof Fault) throw refusal(nativeFaultCode(error.status),error.message,ctx)
    throw error
  }
}
