// Native assistants are shared door tools. A standalone owner opens them by
// confirming a complete local policy; this does that on the first assistant
// command of a native test installation. Door journeys bring their own worker.
const assistantOps=['spend-question','coding-agent-run','quote-agent-run','quote-agent-clarify','invoice-exception-agent-run','late-order-resolve','value-report','recurring-scenario-discover']
const document=JSON.stringify({schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'all',class:'*',do:'autonomous'}],spend:{none:true}})

export function withLocalAssistantPolicy(client,database) {
 let adopted=false
 const dispatchFetch=async(input,init)=>{
  const op=new URL(typeof input==='string'||input instanceof URL?input:input.url).pathname.match(/^\/api\/purse\/command\/(.+)$/)?.[1]
  if(!adopted&&op&&assistantOps.includes(op)) {
   adopted=true
   await (await database()).prepare('INSERT OR IGNORE INTO agent_door_state(id,local_document,local_revision) VALUES(1,?,1)').bind(document).run()
  }
  return client.dispatchFetch(input,init)
 }
 return new Proxy(client,{get(target,key){if(key==='dispatchFetch')return dispatchFetch;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
}
