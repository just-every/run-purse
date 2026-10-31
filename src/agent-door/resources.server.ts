import { ToolRefusal, type ResourceDefinition, type ClassAndFacts } from '../modules/agent-door/index.ts'
import type { Bindings } from '../auth.server'
import { snapshot } from './native.server'

export const recordKinds=['request','supplier','catalogue','order','receipt','invoice','agreement','policy','agentRun','revision','proposedAction','quote'] as const
export const recordUri=(kind:string,id:string)=>`purse://${kind}/${encodeURIComponent(id)}`
export function recordClasses(record:unknown):ClassAndFacts[] {
  const personal=(value:unknown):boolean=>Boolean(value&&typeof value==='object'&&Object.entries(value).some(([key,v])=> /^(email|requesterEmail|contacts|actorEmail|ownerEmail)$/.test(key)&&Boolean(v)&&(!Array.isArray(v)||v.length>0)||personal(v)))
  return personal(record)?[{class:'sensitive',facts:{measure:Array.isArray(record)?record.length:1,kind:'purchasing-personal'}}]:[{class:'standard',facts:{measure:1}}]
}
export function purchasingResources(env:Bindings):ResourceDefinition[] {
  return recordKinds.map(kind=>({uriTemplate:`purse://${kind}/{id}`,name:`Purse ${kind}`,mimeType:'application/json',scope:'purchasing:read',classes:['standard','sensitive'],classify:record=>recordClasses(record.json),
    async read(uri,ctx) {
      const match=new RegExp(`^purse://${kind}/([^/?#]+)$`).exec(uri)
      if(!match)return null
      try {
        const {projected}=await snapshot(env,ctx)
        const record=(projected.data[kind] as Record<string,unknown>[]|undefined)?.find(row=>row.id===decodeURIComponent(match[1]))
        return record?{json:record,untrusted:true}:null
      }catch(error){if(error instanceof ToolRefusal&&['not_found','permission_denied'].includes(error.code))return null;throw error}
    },
  }))
}
