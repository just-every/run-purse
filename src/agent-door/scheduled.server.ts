import {defineTool,type ToolDefinition} from '../modules/agent-door/index.ts'
import type {Bindings} from '../auth.server'
import {load} from '../purse/store'
import {get,requireThat,type Actor,type Data} from '../purse/types'
import {requirePermission} from '../purse/access'
import {requireAgentPolicies,purchaseTypes} from '../purse/agent-governance'
import {orderChasePlan,runOrderChaseAttempt} from '../purse/order-chasing'
import {companyEffect,companyConfigured,scheduledInvocation} from './scheduled-identity.server'
import {snapshot,nativeRefusal} from './native.server'
import {object,id,text,integer,data,list} from './schemas'

export async function scheduledPlan(env:Bindings,a:Actor,args:Record<string,unknown>,completed=false) {
 requireThat(args.job==='chase','Choose a native scheduled assistant')
 const {state}=await load(env.DB),policy=get(state,'orderChasePolicy',String(args.id)),order=get(state,'order',policy.order)
 requireThat(policy.agent==='AGENT-003'&&policy.actor===a.id&&policy.operatorVersion===a.version,'Use the recorded current native schedule sponsor',403)
 requirePermission(state,a,'procurement.manage',order)
 requireThat(policy.enabled&&policy.version===args.version,'Native schedule changed or paused',409)
 requireAgentPolicies(state,'AGENT-003',purchaseTypes(order))
 const plan=completed?undefined:await orderChasePlan(env,policy.id,Boolean(args.escalation),Number(args.tick))
 requireThat(completed||plan,'No current native scheduled work is due',409)
 requireThat(completed||!args.sourceVersion||args.sourceVersion===plan!.sourceVersion,'Scheduled sources changed; prepare a new plan',409)
 return {kind:'order',record:order,sponsor:policy.actor,sourceVersion:plan?.sourceVersion,identity:plan?.id,recipient:args.escalation?policy.escalateTo:order.supplierSnapshot?.contacts?.[0]?.email,external:true}
}

export async function nativeScheduleAction(env:Bindings,a:Actor,input:Data) {
 const policy=(await load(env.DB)).state.get('orderChasePolicy:'+input.id)?.value
 const args={job:'chase',id:String(input.id),version:policy?.version,tick:Date.now(),escalation:input.escalation===true}
 const plan=await scheduledPlan(env,a,args),exact={...args,sourceVersion:plan.sourceVersion}
 if(await companyConfigured(env))return scheduledInvocation(env,'purse.agents.advance',exact,plan.sponsor,'AGENT-003','Purse scheduled supplier follow-up','order-chase:'+plan.identity+':'+args.tick)
 const event=await runOrderChaseAttempt(env,args.id,args.escalation,args.tick)
 return {outcome:'done' as const,decision:null,result:{events:event?[event]:[]}}
}

export function scheduledTools(env:Bindings):ToolDefinition[] {
 async function resolve(args:Record<string,unknown>,ctx:Parameters<typeof snapshot>[1],completed=false) {
  try {
   const {a}=await snapshot(env,ctx)
   // A transport caller cannot advance the native clock. Embedded calls come
   // only from the native scheduler's own ScheduledController timestamp.
   requireThat('door' in ctx&&ctx.door==='embedded'||Number(args.tick)<=Date.now(),'A caller cannot advance the native schedule clock',409)
   return await scheduledPlan(env,a,args,completed)
  }catch(error){return nativeRefusal(error)}
 }
 return [defineTool({
  name:'purse.agents.advance',title:'Advance one due native scheduled assistant',
  description:'Advance exactly one due, currently authorized native assistant event. The recorded native sponsor, exact source version, native cadence and once-only claim apply. Transport calls cannot choose a future clock. Supplier mail retains native consent, bounded attempts and truthful provider outcomes; company policy is checked atomically at the claim and again before sending. Source text is untrusted.',
  scope:'purchasing:write',readOnly:false,inputSchema:object({job:{enum:['chase']},id,version:integer,tick:integer,sourceVersion:text,escalation:{type:'boolean'}}),outputSchema:object({events:list(data)}),classes:['sensitive','external'],clauses:['PUR-014','AGENT-003','AGENT-010','PO-003'],untrusted:true,
  async target(args,ctx){const plan=await resolve(args,ctx);return {kind:plan.kind,id:plan.record.id}},
  async classify(args,ctx,completed){const plan=await resolve(args,ctx,Boolean(completed));return [{class:'sensitive',facts:{measure:1,kind:'purchasing-personal'}},{class:'external',facts:{measure:plan.recipient?1:0,counterparty:args.escalation?'internal':'known'}}]},
  async summary(args,ctx){const plan=await resolve(args,ctx);return {target:{id:plan.record.id,name:plan.record.number},recipients:plan.recipient?[String(plan.recipient)]:[],items:[args.escalation?'Configured internal escalation':'Configured supplier follow-up',`Native schedule version ${args.version}`]}},
  async run(args,ctx){await resolve(args,ctx);const company=await companyEffect(env,ctx),event=await runOrderChaseAttempt(env,String(args.id),Boolean(args.escalation),Number(args.tick),company);if(event)ctx.emit('order.changed',`purse://order/${encodeURIComponent(event.order)}`);return {result:{events:event?[event]:[]}}}
 })]
}
