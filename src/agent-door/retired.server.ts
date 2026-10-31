import type {Bindings} from '../auth.server'

// A provider response can finish after native erasure committed. The shared
// runtime finalizes its admission audit after the tool returns, so reconcile
// that last private copy against the native identity's durable retirement.
export async function finishRetiredAdmissions(env:Bindings) {
 const rows=(await env.DB.prepare(`SELECT a.id,a.row,a.evidence,o.id AS operator,o.email
  FROM agent_door_audit a JOIN oa_operators o ON o.id=json_extract(a.row,'$.sponsor.id')
  WHERE o.status='inactive' AND o.display_name='Personal data erased' AND o.email LIKE ('erased-%'||char(64)||'erased.invalid')`).all<{id:string;row:string;evidence:string|null;operator:string;email:string}>()).results
 for(const item of rows) {
  const row=JSON.parse(item.row),alias=item.email.split('@')[0],tokens=[item.operator,row.sponsor.name].filter(value=>typeof value==='string'&&value.length>2)
  const scrub=(value:unknown):unknown=>{
   if(typeof value==='string') {
    let result=value
    for(const token of tokens)result=result.split(token).join(token===item.operator?alias:token.includes('@')?item.email:'Personal data erased')
    return result
   }
   if(Array.isArray(value))return value.map(scrub)
   if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,scrub(child)]))
   return value
  }
  await env.DB.prepare('UPDATE agent_door_audit SET row=?,evidence=? WHERE id=? AND row=?').bind(JSON.stringify(scrub(row)),item.evidence?JSON.stringify(scrub(JSON.parse(item.evidence))):null,item.id,item.row).run()
 }
}
