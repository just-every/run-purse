import type { JsonSchema, JsonSchemaObject } from '../modules/agent-door/index.ts'
export const text:JsonSchema={type:'string',minLength:1,maxLength:20000}
export const id:JsonSchema={type:'string',minLength:1,maxLength:200}
export const integer:JsonSchema={type:'integer',minimum:0}
export const object=(properties:Record<string,JsonSchema>={},required=Object.keys(properties)):JsonSchemaObject=>({type:'object',properties,required,additionalProperties:false})
export const data:JsonSchema={type:'object',additionalProperties:true}
export const list=(items:JsonSchema):JsonSchema=>({type:'array',items,maxItems:100})
const line=object({id,description:text,quantity:text,unitMinor:integer,unitAmount:text,category:text,project:text,catalogue:id},['quantity','project'])
export const request=object({title:text,supplier:id,currency:text,needDate:text,location:text,costCentre:text,lines:list(line),freightMinor:integer,taxMinor:integer,terms:text},['title','supplier','currency','needDate','location','costCentre','lines'])
export const amended=object({...request.properties,id,revision:integer,reason:text},[...request.required!,'id','revision','reason'])
export const supplier=object({id,name:text,address:text,status:{enum:['active','preferred','blocked']},reason:text,contacts:list(object({name:text,email:text,phone:text},[])),contractRef:text},['name','status','reason'])
export const catalogue=object({id,supplier:id,description:text,currency:text,unitMinor:integer,unitAmount:text,category:text,project:text,approved:{type:'boolean'}},['supplier','description','currency','category'])
export const prepare=object({workflow:{enum:['intake','rfq','renewal','exception','negotiation']},fields:data,draft:text,references:list(object({kind:{enum:['request','supplier','order','invoice','attachment']},id}))},['workflow','draft'])

const nullableMoney:JsonSchema={type:['integer','null'],minimum:0,maximum:1000000000000}
const nullableText:JsonSchema={type:['string','null'],maxLength:2000}
const quoteLine=object({id,description:text,quantity:text,unitMinor:integer,unitAmount:text,category:text,project:text,catalogue:id,partNumber:text,unit:text},['quantity','project'])
export const quote=object({request:id,revision:integer,supplier:id,currency:text,lines:list(quoteLine),freightMinor:nullableMoney,taxMinor:nullableMoney,delivery:nullableText,conditions:nullableText,source:text})
const quotedLine={...object({id,description:text,quantity:text,q:integer,unitMinor:integer,totalMinor:integer}),additionalProperties:true}
export const quotation={...object({id,at:text,sequence:integer,request:id,revision:integer,supplier:id,currency:text,lines:{type:'array',items:quotedLine},freightMinor:nullableMoney,taxMinor:nullableMoney,delivery:nullableText,conditions:nullableText,source:text,missing:{type:'array',items:text}}),additionalProperties:true}
export const comparison=object({request:id,revision:integer,currencies:{type:'array',items:object({currency:text,quotes:{type:'array',items:quotation}})}})
