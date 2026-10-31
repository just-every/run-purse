import {defineTool,type ToolDefinition} from '../modules/agent-door/index.ts'
import type {Bindings} from '../auth.server'
import {load} from '../purse/store'
import {get,requireThat,type Actor,type Data} from '../purse/types'
import {requirePermission} from '../purse/access'
import {requireAgentPolicies,purchaseTypes} from '../purse/agent-governance'
import {orderChasePlan,runOrderChaseAttempt} from '../purse/order-chasing'
import {valueCheckinPlan,runValueCheckinAttempt} from '../purse/agent-value-checkins'
import {valuePolicyAllows} from '../purse/agent-value'
import {recurringDiscoveryPlan,runRecurringDiscoveryAttempt,recurringDiscoveryAuthority} from '../purse/recurring-discovery-schedule'
import {companyEffect,companyConfigured,scheduledInvocation} from './scheduled-identity.server'
import {snapshot,nativeRefusal} from './native.server'
import {object,id,text,integer,data,list} from './schemas'

export async function scheduledPlan(env:Bindings,a:Actor,args:Record<string,unknown>,completed=false) {
 requireThat(['chase','value','recurring'].includes(String(args.job)),'Choose a native scheduled assistant')
 if(args.job==='recurring') {
  const {state}=await load(env.DB),agreement=get(state,'agreement',String(args.id))
  requireThat(a.owner,'Current native owner required for scheduled recurring research',403)
  requireThat(agreement.version===args.version&&!agreement.sourceValuesErased,'Agreement source changed or was erased',409)
  requireThat(recurringDiscoveryAuthority(state,agreement,{id:a.id,email:a.email,version:a.version,role:'owner'}),'Recurring controls changed or paused',409)
  const plan=completed?undefined:await recurringDiscoveryPlan(env,a.id,agreement.id,Number(args.tick))
  requireThat(completed||plan,'No native recurring proposal notice is due',409)
  requireThat(completed||!args.sourceVersion||args.sourceVersion===plan!.sourceVersion,'Recurring sources changed; prepare a new plan',409)
  return {kind:'agreement',record:agreement,sponsor:a.id,sourceVersion:plan?.sourceVersion,identity:plan?.identity,recipient:undefined,external:false}
 }
 if(args.job==='value') {
  const {state}=await load(env.DB),request=get(state,'request',String(args.id))
  requireThat(request.requester===a.id&&request.requesterEmail===a.email,'Only the exact native requester sponsors this check-in',403)
  requirePermission(state,a,'request.edit',request)
  requireThat(request.revision===args.version&&[30,90].includes(Number(args.intervalDays)),'Value check-in source changed',409)
  requireThat(!completed||valuePolicyAllows(state,request),'Native value tracking is paused',409)
  const plan=completed?undefined:await valueCheckinPlan(env,request.id,request.revision,Number(args.intervalDays),Number(args.tick))
  requireThat(completed||plan,'No current native check-in is due',409)
  requireThat(completed||!args.sourceVersion||args.sourceVersion===plan!.sourceVersion,'Check-in sources changed; prepare a new plan',409)
  return {kind:'request',record:request,sponsor:request.requester,sourceVersion:plan?.sourceVersion,identity:plan?.id,recipient:request.requesterEmail,external:valuePolicyAllows(state,request)}
 }
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
 const {state}=await load(env.DB),job=input.job==='value'?'value':input.job==='recurring'?'recurring':'chase',policy=state.get((job==='value'?'request:':job==='recurring'?'agreement:':'orderChasePolicy:')+input.id)?.value
 const args:Data={job,id:String(input.id),version:job==='value'?policy?.revision:policy?.version,tick:Date.now(),...(job==='value'?{intervalDays:input.intervalDays}:{escalation:input.escalation===true})}
 const plan=await scheduledPlan(env,a,args),exact={...args,sourceVersion:plan.sourceVersion}
 if(await companyConfigured(env))return scheduledInvocation(env,'purse.agents.advance',exact,plan.sponsor,job==='value'?'AGENT-005':job==='recurring'?'AGENT-006':'AGENT-003',job==='value'?'Purse scheduled value check-in':job==='recurring'?'Purse scheduled recurring research':'Purse scheduled supplier follow-up',job+':'+plan.identity+':'+args.tick)
 if(job==='recurring')return {outcome:'done' as const,decision:null,result:await runRecurringDiscoveryAttempt(env,a.id,args.id,args.tick)}
 const event=job==='value'?await runValueCheckinAttempt(env,args.id,args.version,args.intervalDays,args.tick):await runOrderChaseAttempt(env,args.id,Boolean(args.escalation),args.tick)
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
  scope:'purchasing:write',readOnly:false,inputSchema:{...object({job:{enum:['chase','value','recurring']},id,version:integer,tick:integer,sourceVersion:text,escalation:{type:'boolean'},intervalDays:{enum:[30,90]}},['job','id','version','tick','sourceVersion']),oneOf:[{properties:{job:{const:'chase'}},required:['escalation']},{properties:{job:{const:'value'}},required:['intervalDays']},{properties:{job:{const:'recurring'}}}]},outputSchema:object({events:list(data)}),classes:['sensitive','external'],clauses:['PUR-014','AGENT-003','AGENT-005','AGENT-006','AGENT-010','PO-003'],untrusted:true,
  async target(args,ctx){const plan=await resolve(args,ctx);return {kind:plan.kind,id:plan.record.id}},
  async classify(args,ctx,completed){const plan=await resolve(args,ctx,Boolean(completed));return [{class:'sensitive',facts:{measure:1,kind:'purchasing-personal'}},...(plan.external?[{class:'external' as const,facts:{measure:plan.recipient?1:0,counterparty:args.job==='value'||args.escalation?'internal' as const:'known' as const}}]:[])]},
  async summary(args,ctx){const plan=await resolve(args,ctx);return {target:{id:plan.record.id,name:plan.record.number??plan.record.title??plan.record.name},recipients:plan.external&&plan.recipient?[String(plan.recipient)]:[],items:[args.job==='recurring'?'Due in-app recurring research proposals':args.job==='value'?`${args.intervalDays}-day requester value check-in`:args.escalation?'Configured internal escalation':'Configured supplier follow-up',`Native source version ${args.version}`]}},
  async run(args,ctx){try{const plan=await resolve(args,ctx),company=await companyEffect(env,ctx);let events:Data[];
   if(args.job==='recurring')events=(await runRecurringDiscoveryAttempt(env,ctx.person.id,String(args.id),Number(args.tick),company,String(args.sourceVersion))).events;
   else {const event=args.job==='value'?await runValueCheckinAttempt(env,String(args.id),Number(args.version),Number(args.intervalDays),Number(args.tick),company,String(args.sourceVersion)):await runOrderChaseAttempt(env,String(args.id),Boolean(args.escalation),Number(args.tick),company,String(args.sourceVersion));events=event?[event]:[];}
   await resolve(args,ctx,true);if(events.length)ctx.emit(`${plan.kind}.changed`,`purse://${plan.kind}/${encodeURIComponent(plan.record.id)}`);return {result:{events}}
  }catch(error){return nativeRefusal(error)}}
 })]
}
