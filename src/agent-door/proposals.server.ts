import { defineTool, ToolRefusal, type ToolContext, type ToolDefinition } from '../modules/agent-door/index.ts'
import type { Bindings } from '../auth.server'
import { command } from '../purse/api'
import {readFence} from '../purse/store'
import { actionInput } from '../purse/agents'
import { requirePermission } from '../purse/access'
import { authorizedApproval, approvalAmount } from '../purse/requests'
import { requireGroupFace } from '../purse/po-supplier-groups'
import { mayReceive } from '../purse/receipt-routing'
import { get } from '../purse/types'
import { snapshot, execute, nativeRefusal } from './native.server'
import { recordUri } from './resources.server'
import { object, id } from './schemas'

export function proposalTools(env:Bindings):ToolDefinition[] {
  async function resolve(args:Record<string,unknown>,ctx:ToolContext,completed=false) {
    try {
      const native=await snapshot(env,ctx),{state,a}=native,p=get(state,'proposedAction',String(args.id)),run=get(state,'agentRun',p.run)
      if(run.mode!=='human-preparation'||!['submit','decision','convert','issue','receipt'].includes(p.action))throw new ToolRefusal('invalid_arguments','Use the native source-bound review action for generated reports')
      if(!a.owner&&p.actor!==a.id)throw new ToolRefusal('permission_denied')
      if(run.protectedContextCleanup?.authorityInvalidated||run.sourceValuesErased)throw new ToolRefusal('native_conflict')
      const kind=p.action==='receipt'||p.action==='issue'?'order':'request',record=get(state,kind,String(p.action==='receipt'?p.input.order:p.input.id))
      const permission=p.action==='submit'?'request.edit':p.action==='decision'?'request.approve':p.action==='convert'?'po.convert':p.action==='issue'?'po.issue':null
      if(permission)requirePermission(state,a,permission,record)
      if(p.action==='decision')authorizedApproval(state,a,record)
      if(p.action==='receipt'&&!mayReceive(state,a,record))throw new ToolRefusal('permission_denied')
      if(p.action==='receipt'&&p.input.event==='cancel')requirePermission(state,a,'procurement.manage',record)
      const affected=p.action==='issue'&&record.supplierGroup?requireGroupFace(state,record):[record]
      if(p.action==='issue')for(const order of affected)requirePermission(state,a,'po.issue',order)
      if(!completed) {
        actionInput(state,a,args)
        await command(structuredClone(state),a,'execute-action',args,env)
        await readFence(env.DB,a,native.revision)
      }
      return {...native,p,record,kind,affected}
    }catch(error){return nativeRefusal(error)}
  }
  return [defineTool({
    name:'purse.preparations.execute',title:'Execute a current native proposed action',
    description:'Execute one current human preparation proposal using the same native action as the web. Its exact stored target and arguments determine authority and classes, including combined conversion and issuance. Company approval never supplies a missing designated approver, receipt fact or native grant. Generated agent reports keep their separate human review actions.',
    scope:'purchasing:write',readOnly:false,inputSchema:object({id}),outputSchema:{...object({id}),additionalProperties:true},classes:['standard','money','commitment'],clauses:['PUR-014','PUR-006','PUR-007','PUR-008','PUR-009','PUR-010'],untrusted:true,
    async classify(args,ctx,completed) {
      const {state,p,record,affected}=await resolve(args,ctx,Boolean(completed))
      if(p.action==='issue'||p.action==='decision'&&p.input.decision==='approved'||p.action==='convert'&&p.input.issue===true) {
        const facts={measure:p.action==='issue'?affected.reduce((sum,row)=>sum+row.totalMinor,0):approvalAmount(record,state),currency:record.currency,counterparty:'known' as const}
        return [{class:'money',facts},{class:'commitment',facts}]
      }
      return [{class:'standard',facts:{measure:1}}]
    },
    async target(args,ctx){const {record,kind}=await resolve(args,ctx);return {kind,id:record.id}},
    async revision(args,ctx){const {state,p}=await resolve(args,ctx);return state.get(`proposedAction:${p.id}`)!.revision},revisionType:'string',
    async summary(args,ctx){const {p,record,affected}=await resolve(args,ctx);return {target:{id:record.id,name:record.title??record.number},items:[`Execute native ${p.action}`,JSON.stringify(p.input)],...(p.action==='issue'?{amount:{value:affected.reduce((sum,row)=>sum+row.totalMinor,0),currency:record.currency}}:{})}},
    async run(args,ctx){const {p}=await resolve(args,ctx),kind=p.action==='convert'||p.action==='issue'?'order':p.action==='receipt'?'receipt':'request',result=await execute(env,'execute-action',args,ctx,kind),uri=recordUri(kind,String(result.id));ctx.emit(`${kind}.changed`,uri);return {result,resources:[{uri,name:`Purse ${kind}`}]}}
  })]
}
