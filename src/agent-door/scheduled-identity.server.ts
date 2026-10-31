import { createHash } from 'node:crypto'
import type { Bindings } from '../auth.server'
import type { ToolContext } from '../modules/agent-door/index.ts'
import { authority } from '../purse/store'
import type { Data } from '../purse/types'
import { nativeActor } from './native.server'

export type CompanyEffect={sql:string;params:(string|number|null)[];record:(value:Data)=>Data;audit:(value:Data)=>Data;live:()=>Promise<boolean>}
export async function companyConfigured(env:Bindings) {
 const row=await env.DB.prepare('SELECT envelope,local_revision FROM agent_door_state WHERE id=1').first<{envelope:string|null;local_revision:number}>()
 return Boolean(env.RER_OWNER_CLAIM_ISSUER||env.RER_BUSINESS_TRUST||row?.envelope||row?.local_revision)
}
export async function companyEffect(env:Bindings,ctx:ToolContext):Promise<CompanyEffect> {
 const a=await nativeActor(env,ctx)
 if(a.agent)a.agent.admission=ctx.operationId
 const fence=authority(a),preparedBy={agent:{id:ctx.agent.id,name:ctx.agent.name},for:{id:a.id,name:ctx.person.name},label:ctx.actor.label},companyDecision={id:ctx.operationId}
 const fields={companyDecision,...(ctx.approvers.length?{companyApprovers:ctx.approvers}:{})}
 return {...fence,record:value=>({...value,...(typeof value.preparedBy==='string'?{companyPreparedBy:preparedBy}:{preparedBy}),...fields}),audit:value=>({...value,agent:{id:ctx.agent.id,name:ctx.agent.name},sponsor:{id:a.id,name:ctx.person.name},actorLabel:ctx.actor.label,...fields}),
  live:async()=>Boolean(await env.DB.prepare(`SELECT 1 AS ok WHERE ${fence.sql}`).bind(...fence.params).first())}
}
export async function scheduledInvocation(env:Bindings,tool:string,args:Record<string,unknown>,sponsor:string,agent:string,name:string,key:string) {
 const {purseAgentDoor}=await import('./index.server')
 const agentId='purse-scheduled:'+agent+':'+createHash('sha256').update('purse-native-agent:'+sponsor).digest('hex')
 return purseAgentDoor(env).invoke(tool,{...args,idempotency_key:key},{person:{id:sponsor},agent:{id:agentId,name,specialist:'procurement'},scopes:['purchasing:read','purchasing:write']})
}
