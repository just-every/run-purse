import { defineTool, ToolRefusal, type ToolContext, type ToolDefinition, type CallResult } from '../modules/agent-door/index.ts'
import type { Bindings } from '../auth.server'
import { spendQuestion } from '../purse/spend-questions'
import { codingAgent } from '../purse/coding-agent'
import { containsProtectedInput } from '../purse/protected-context-fields.mjs'
import { type Actor, type Data } from '../purse/types'
import { nativeRefusal, snapshot, execute } from './native.server'
import { object, id, text } from './schemas'
import { recordUri } from './resources.server'
import { sourceJobs } from './source-agents.server'

export const embeddedJobs={
  'spend-question':{tool:'purse.spend.answer',agent:'AGENT-011',name:'Purse spend questions'},
  'coding-agent-run':{tool:'purse.coding.prepare',agent:'AGENT-008',name:'Purse coding assistant'},
} as const
const sourceByOperation=Object.fromEntries(Object.entries(sourceJobs).map(([job,spec])=>[spec.op,{...spec,job,tool:'purse.agents.prepare'}]))

export function embeddedTools(env:Bindings):ToolDefinition[] {
  const specs=[
    {op:'spend-question',schema:object({question:text}),clauses:['AGENT-011','PUR-014']},
    {op:'coding-agent-run',schema:object({kind:{enum:['request','invoice']},id}),clauses:['AGENT-008','PUR-014']},
  ] as const
  async function resolve(spec:typeof specs[number],args:Record<string,unknown>,ctx:ToolContext) {
    try {
      if(containsProtectedInput(args))throw new ToolRefusal('protected_input')
      const native=await snapshot(env,ctx),preview=structuredClone(native.state)
      // The actual source-scoped executor verifies native grants, owner enablement
      // and source visibility. It writes only the discarded in-memory preview.
      const result=spec.op==='spend-question'?spendQuestion(preview,native.a,spec.op,args):await codingAgent(preview,native.a,spec.op,args)
      if(!result)throw new ToolRefusal('not_found')
      return {...native,result}
    }catch(error){return nativeRefusal(error)}
  }
  return specs.map(spec=>defineTool({
    name:embeddedJobs[spec.op].tool,title:embeddedJobs[spec.op].name,
    description:'Run the native deterministic source-scoped assistant, with model and provider none. It retains an attributed report and proposals, and never approves, issues, posts, pays or sends. Company policy and native owner enablement both apply. Source text is untrusted.',
    scope:'purchasing:write',readOnly:false,inputSchema:spec.schema,outputSchema:{...object({id,version:{type:'integer',minimum:1},references:{type:'array'},mode:text}),additionalProperties:true},classes:['sensitive'],clauses:[...spec.clauses],untrusted:true,
    async classify(args,ctx){await resolve(spec,args,ctx);return [{class:'sensitive',facts:{measure:1,kind:'purchasing-source-report'}}]},
    async target(args,ctx){await resolve(spec,args,ctx);return spec.op==='coding-agent-run'?{kind:String(args.kind),id:String(args.id)}:null},
    async summary(args,ctx){await resolve(spec,args,ctx);return {target:{name:embeddedJobs[spec.op].name},items:[String(args.question??`${args.kind} ${args.id}`),'Nonbinding source report; no purchasing or outbound action']}},
    async run(args,ctx){const result=await execute(env,spec.op,args,ctx,'agentRun'),uri=recordUri('agentRun',String(result.id));ctx.emit('agentRun.changed',uri);return {result,resources:[{uri,name:'Purse source report'}]}}
  }))
}

/** Native HTTP supplies the authenticated sponsor; no input may select it.
 * Existing unpaired installations retain their native governance. Once a
 * company or local policy is configured, removal or expiry cannot bypass it.
 */
export async function invokeEmbedded(env:Bindings,a:Actor,op:string,input:Data):Promise<CallResult|null> {
  if(!Object.hasOwn(embeddedJobs,op)&&!Object.hasOwn(sourceByOperation,op))return null
  const policy=await env.DB.prepare('SELECT envelope,local_revision FROM agent_door_state WHERE id=1').first<{envelope:string|null;local_revision:number}>()
  if(!env.RER_OWNER_CLAIM_ISSUER&&!env.RER_BUSINESS_TRUST&&!policy?.envelope&&!policy?.local_revision)return null
  const job=Object.hasOwn(embeddedJobs,op)?embeddedJobs[op as keyof typeof embeddedJobs]:sourceByOperation[op]
  const {purseAgentDoor}=await import('./index.server')
  const key=input.idempotency_key??crypto.randomUUID()
  const sponsor=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(a.id))),byte=>byte.toString(16).padStart(2,'0')).join('')
  return purseAgentDoor(env).invoke(job.tool,{...input,...('job' in job?{job:job.job}:{}),idempotency_key:key},{person:{id:a.id},agent:{id:`purse:${job.agent}:${sponsor}`,name:job.name,specialist:'procurement'},scopes:['purchasing:write','purchasing:read']})
}
