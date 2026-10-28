import type { Data } from './types';
const string={type:'string'},amount={type:'string',description:'Nonnegative decimal currency text'};
const document={type:'object',required:['name','mediaType','base64'],properties:{name:string,mediaType:string,base64:{type:'string',contentEncoding:'base64'}},description:'Actual original bytes, private and never returned by key reads'};
const source={oneOf:[string,{type:'object',description:'The unchanged native source descriptor for an externally prepared reading'}]};
const line={type:'object',required:['quantity','project'],properties:{description:string,catalogue:string,quantity:{type:'string',description:'Positive decimal quantity, at most three decimal places'},unitMinor:{type:'integer',minimum:0},unitAmount:{type:'string'},category:string,project:string,unit:string,partNumber:string},description:'The native line format; provide a catalogue item or description, price and category'};
const properties:Record<string,Data>={
 lines:{type:'array',minItems:1,items:line},document,source,
 version:{type:'integer',minimum:0},quantity:{type:'string'},event:{type:'string',enum:['receive','reject','return','cancel']},
 changes:{type:'array',minItems:1,items:{type:'object',required:['field','value'],properties:{line:string,field:string,value:{type:['string','null']}}}},
 reader:{type:'object',required:['provider','model','runReference'],properties:{provider:string,model:string,runReference:string}},fields:{type:'object',description:'The existing native invoice proposal format with confidence, source page and quotation for every field. Bank, tax and routing fields are refused.'},
 contacts:{type:'array',items:{type:'object',required:['name','email'],properties:{name:string,email:{type:'string',format:'email'}}}},
 poDetails:{type:'object',description:'Native PO details. Recording terms grants no issuance or send authority.'},
 intakeFields:{type:'object'},charges:{type:'array',items:{type:'object'}},valuePromise:{type:'object'},
 freightAmount:amount,freightMinor:{type:'integer',minimum:0},taxAmount:amount,taxMinor:{type:'integer',minimum:0},valueAmount:amount,valueMinor:{type:'integer',minimum:0},
};
const required:Record<string,string[]>={createRequestDraft:['title','supplier','currency','needDate','location','costCentre','lines','terms'],recordReceipt:['order','line','event','quantity','reason'],captureInvoiceOriginal:['order'],extractInvoice:['source'],proposeInvoiceReading:['source','reader','fields'],correctInvoiceReading:['version','changes'],reviewInvoiceRisk:['flag','version','reason'],createUnprotectedSupplier:['name','status','reason']};
export function apiRequestSchema(operation:string,fields:string):Data{return {type:'object',additionalProperties:false,required:required[operation]??[],properties:Object.fromEntries(fields.split(' ').map(field=>[field,properties[field]??string])),...(operation==='captureInvoiceOriginal'?{oneOf:[{required:['document']},{required:['invoice']}]}:{})};}
