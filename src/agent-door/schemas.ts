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
