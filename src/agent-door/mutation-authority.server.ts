import type { ToolContext } from '../modules/agent-door/index.ts'
import { ToolRefusal } from '../modules/agent-door/index.ts'
import type { Bindings } from '../auth.server'
import { authorizeAccessCommand } from '../purse/access-commands'
import { requirePermission } from '../purse/access'
import { get } from '../purse/types'
import { quoteRequest } from '../purse/requests'
import { snapshot, nativeRefusal } from './native.server'

// Policy classification and approval summaries must not disclose a record
// before the same native grant checks that its command requires.
export async function mutationAuthority(env:Bindings,op:string,args:Record<string,unknown>,ctx:ToolContext,completed=false) {
  try {
    const native=await snapshot(env,ctx),{state,a}=native
    authorizeAccessCommand(state,a,op,args)
    let target:null|{kind:string;id:string}=null
    if(op==='request')requirePermission(state,a,'request.create',{...args,requester:a.id,requesterEmail:a.email})
    if(op==='amend'||op==='submit') {
      const record=get(state,'request',args.id as string)
      requirePermission(state,a,'request.edit',record)
      if(op==='amend'&&record.status!=='draft')throw new ToolRefusal('native_conflict','Only an unsubmitted draft can use amend_draft')
      if(op==='submit'&&!a.owner&&record.requester!==a.id&&record.requesterEmail!==a.email)throw new ToolRefusal('permission_denied')
      target={kind:'request',id:record.id}
    }
    if(op==='quote') {const {r}=quoteRequest(state,a,args,completed);target={kind:'request',id:r.id}}
    if(op==='supplier'&&args.id)target={kind:'supplier',id:get(state,'supplier',args.id as string).id}
    if(op==='catalogue'&&args.id)target={kind:'catalogue',id:get(state,'catalogue',args.id as string).id}
    if(op==='edit-preparation'||op==='propose-action') {
      const run=get(state,'agentRun',(op==='edit-preparation'?args.id:args.run) as string)
      if(!a.owner&&run.actor!==a.id)throw new ToolRefusal('permission_denied')
      target={kind:'agentRun',id:run.id}
    }
    return {...native,target}
  } catch(error){return nativeRefusal(error)}
}
