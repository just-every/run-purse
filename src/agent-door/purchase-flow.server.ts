import { defineTool, ToolRefusal, type ToolContext, type ToolDefinition } from '../modules/agent-door/index.ts'
import type { Bindings } from '../auth.server'
import { get, type Data } from '../purse/types'
import { requirePermission } from '../purse/access'
import { authorizedApproval } from '../purse/requests'
import { linePosition } from '../purse/orders'
import { mayReceive, receiptVersion } from '../purse/receipt-routing'
import { snapshot, execute, nativeRefusal } from './native.server'
import { recordClasses, recordUri } from './resources.server'
import { object, id, text, integer, data, list } from './schemas'

// These are the UI's actual purchasing commands. Company approval does not
// replace the designated native approver or manufacture a human confirmation.
export function purchaseFlowTools(env: Bindings): ToolDefinition[] {
  const specs = [
    {name:'requests.decide',op:'decision',kind:'request',key:'id',permission:'request.approve',clauses:['PUR-007','PUR-006'],schema:object({id,revision:integer,decision:{enum:['approved','rejected','returned']},reason:text}),classes:['standard','money','commitment']},
    {name:'orders.convert',op:'convert',kind:'request',key:'id',permission:'po.convert',clauses:['PUR-008'],schema:object({id,revision:integer}),classes:['standard']},
    {name:'orders.issue',op:'issue',kind:'order',key:'id',permission:'po.issue',clauses:['PUR-009'],schema:object({id,revision:integer,reason:text}),classes:['money','commitment']},
    {name:'receipts.record',op:'receipt',kind:'order',key:'order',permission:'receive',clauses:['PUR-010'],schema:object({order:id,line:id,quantity:text,event:{enum:['receive','return','reject','cancel']},reason:text,receiptVersion:text,effectiveDate:text},['order','line','quantity','event','reason','receiptVersion']),classes:['standard']},
    {name:'invoices.capture',op:'invoice',kind:'order',key:'order',permission:'invoice.capture',clauses:['PUR-011','INVOICE-003'],schema:object({order:id,reference:text,source:text,allocations:list(object({line:id,quantity:text,amountMinor:integer})),invoiceDate:text},['order','reference','source','allocations']),classes:['standard']},
  ] as const
  async function resolve(spec:typeof specs[number],args:Record<string,unknown>,ctx:ToolContext) {
    try {
      const native=await snapshot(env,ctx), record=get(native.state,spec.kind,args[spec.key] as string)
      // Check native authority before deriving policy facts, summaries or targets.
      if(spec.op==='receipt') {
        if(!mayReceive(native.state,native.a,record))throw new ToolRefusal('permission_denied')
        if(args.event==='cancel')requirePermission(native.state,native.a,'procurement.manage',record)
      } else requirePermission(native.state,native.a,spec.permission,record)
      if(spec.op==='decision')authorizedApproval(native.state,native.a,record)
      return {...native,record}
    } catch(error){return nativeRefusal(error)}
  }
  const tools:ToolDefinition[]=specs.map(spec=>defineTool({
    name:`purse.${spec.name}`,title:spec.name.replaceAll('.',' '),
    description:`Native ${spec.op}, under the sponsor's current record grants and exact purchasing revision. Agent attribution is retained. No supplier send, payment or person's consent is inferred. Amounts are in native minor currency units.`,
    scope:'purchasing:write',readOnly:false,inputSchema:spec.schema,outputSchema:{...object({id}),additionalProperties:true},classes:[...spec.classes],clauses:[...spec.clauses],untrusted:true,
    async classify(args,ctx){
      const {record}=await resolve(spec,args,ctx)
      if(spec.op==='issue'||spec.op==='decision'&&args.decision==='approved') {
        const facts={measure:record.totalMinor,currency:record.currency,counterparty:'known' as const}
        return [{class:'money',facts},{class:'commitment',facts}]
      }
      return [{class:'standard',facts:{measure:spec.op==='invoice'?(args.allocations as unknown[]).length:1}}]
    },
    async target(args,ctx){const {record}=await resolve(spec,args,ctx);return {kind:spec.kind,id:record.id}},
    async revision(args,ctx){const {state,record}=await resolve(spec,args,ctx);return spec.op==='receipt'?receiptVersion(state,record):state.get(`${spec.kind}:${record.id}`)!.revision},revisionType:'string',
    async summary(args,ctx){const {record}=await resolve(spec,args,ctx);return {target:{id:record.id,name:record.title??record.number},amount:{value:record.totalMinor,currency:record.currency},payee:record.supplierSnapshot?.name??record.supplier,items:[String(args.decision??args.event??args.reference??spec.op),...(args.reason?[String(args.reason)]:[])]}},
    async run(args,ctx){
      await resolve(spec,args,ctx)
      const result=await execute(env,spec.op,args,ctx),kind=spec.op==='convert'?'order':spec.op==='receipt'?'receipt':spec.op==='invoice'?'invoice':spec.kind
      const uri=recordUri(kind,String(result.id));ctx.emit(`${kind}.changed`,uri)
      return {result,resources:[{uri,name:`Purse ${kind}`}]}
    },
  }))
  tools.push(defineTool({name:'purse.requests.awaiting_decision',title:'Read requests awaiting your native decision',description:'Only current pending requests for which the sponsor is the designated native approver or active delegate. Self approval remains prohibited. Limit bounds the returned record list.',scope:'purchasing:read',readOnly:true,inputSchema:object({limit:{type:'integer',minimum:0,maximum:100}},[]),outputSchema:object({records:list(data)}),classes:['standard','sensitive'],clauses:['PUR-007','PUR-017'],untrusted:true,
    async classify(args,ctx){return recordClasses(await pending(ctx,args.limit as number|undefined))},
    async run(args,ctx){return {result:{records:await pending(ctx,args.limit as number|undefined)}}},
  }))
  tools.push(defineTool({name:'purse.orders.position',title:'Read the current receiving position',description:'Read native quantities and the current receiving revision for a visible order before recording physical evidence. Supplier contacts and purchasing authority are excluded.',scope:'purchasing:read',readOnly:true,inputSchema:object({id}),outputSchema:object({record:data,receiptVersion:text}),classes:['standard'],clauses:['PUR-010','PUR-017'],untrusted:true,
    async classify(args,ctx){return recordClasses((await position(args,ctx)).record)},
    async run(args,ctx){return {result:await position(args,ctx)}},
  }))
  async function position(args:Record<string,unknown>,ctx:ToolContext) {
    const {state,projected}=await snapshot(env,ctx)
    const record=(projected.data.order??[]).find((row:Data)=>row.id===args.id)
    if(!record)throw new ToolRefusal('not_found')
    return {record:{id:record.id,number:record.number,status:record.status,lines:record.lines.map((line:Data)=>({id:line.id,description:line.description,quantity:line.quantity,...linePosition(state,record.id,line)}))},receiptVersion:receiptVersion(state,get(state,'order',record.id))}
  }
  async function pending(ctx:ToolContext,limit=100):Promise<Data[]> {
    const {state,a,projected}=await snapshot(env,ctx)
    return (projected.data.request??[]).filter((record:Data)=>{
      if(record.status!=='pending')return false
      try {authorizedApproval(state,a,get(state,'request',record.id));return true}catch{return false}
    }).slice(0,limit)
  }
  return tools
}
