import { createHash } from 'node:crypto';
import { all, get, key, put, requireThat, type Data, type State } from './types';
import { erasureDigest, erasedText } from './erasure-journal.mjs';
import type { ErasureSubject } from './erasure-subject';

const structural = /^(?:sha256|evidenceHash|retainedDigest|attestation|bankBinding|secret|fingerprint|sourceFingerprint|mediaType|action|status|event|kind|provider|providerSenderLabel|senderVerified|currency|representation|state|method|code|comparison|authentication|at|.*At|.*Date|.*Version)$/;
const privateNotes = new Set(['body','sourceText','sourceHtml','messageId','notes','note','personalNotes']);
export type ErasurePlan = { state:State; fields:Data[]; blobs:string[]; affected:Data[]; fingerprint:string; alias:string; email:string; subject:ErasureSubject; id:string; scrub:(value:any)=>any };
export function planErasure(before:State,subject:ErasureSubject,id:string,revision:number):ErasurePlan {
 requireThat(/^[a-f0-9-]{36}$/.test(id),'Review identifier invalid');
 const alias='erased-'+id,email=alias+'@erased.invalid',state=structuredClone(before),fields:Data[]=[],blobs=new Set<string>();
 const replacements=new Map(subject.values.map(v=>[v.toLowerCase(),v.includes('@')?email:v===subject.operator?alias:erasedText]));
 // A separate opaque pseudonym preserves joins while removing native identity.
 const replace=(value:string,field='')=>{
  const exact=replacements.get(value.toLowerCase());if(exact)return exact;
  if(structural.test(field))return value;
  let result=value;
  for(const [token,replacement]of [...replacements].sort((a,b)=>b[0].length-a[0].length)) {
   if(token.length<3)continue;
   result=result.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),()=>replacement);
  }
  return result;
 };
 const contains=(value:unknown):boolean=>typeof value==='string'?replace(value)!==value:Array.isArray(value)?value.some(contains):!!value&&typeof value==='object'&&Object.values(value).some(contains);
 const linked=new Set<string>();
 for(const row of before.values())if(!['supplierMatchingKey','invoiceEvidenceKey','erasureReceipt'].includes(row.kind)&&contains(row.value))linked.add(row.id);
 // Remove opaque source bytes on the affected purchasing lineage: extraction
 // cannot prove the absence of identity in a PDF, image or provider attachment.
 let changed=true;
 while(changed){changed=false;for(const row of before.values()){
  if(!['attachment','invoiceSource','invoiceReading','invoiceReadingEvent','quoteReading','quoteReadingEvent','agreementReading','agreementReadingEvent','emailIntake','apInvoiceEmail','rfqResponse','invoice','order','revision','quote','valueSeatImport'].includes(row.kind))continue;
  const v=row.value;
  if([v.request,v.order,v.record,v.source,v.reading,v.emailIntake,v.apInvoiceEmail,v.attachment,v.rfq].some(ref=>linked.has(ref))&&!linked.has(row.id)){linked.add(row.id);changed=true;}
 }}
 const eraseFile=(value:Data):Data=>{
  if(typeof value.base64!=='string'&&!value.key)return value;
  const file:Data={...value,name:erasedText,erasure:id};
  if(typeof value.base64==='string') {
   if(!file.sha256)file.sha256=createHash('sha256').update(Buffer.from(value.base64,'base64')).digest('hex');
   file.base64='';
  }
  if(value.key)blobs.add(value.key);
  return file;
 };
 const visit=(value:any,field:string,affected:boolean):any=>{
  if(typeof value==='string')return affected&&privateNotes.has(field)?erasedText:replace(value,field);
  if(Array.isArray(value))return value.map(item=>visit(item,field,affected));
  if(value&&typeof value==='object') {
   const result=Object.fromEntries(Object.entries(value).map(([name,item])=>[replace(name),name==='logo'?item:visit(item,name,affected)]));
   if(affected&&value.sha256&&typeof value.size==='number')result.name=erasedText;
   return affected&&(typeof value.base64==='string'||typeof value.key==='string'&&value.sha256)?eraseFile(result):result;
  }
  return value;
 };
 const difference=(a:any,b:any,path:(string|number)[],kind:string,rowId:string)=>{
  if(JSON.stringify(a)===JSON.stringify(b))return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)&&Object.keys(a).every(field=>Object.hasOwn(b,field))){
   for(const field of new Set([...Object.keys(a),...Object.keys(b)]))difference(a[field],b[field],[...path,Array.isArray(b)?Number(field):field],kind,rowId);
  }else fields.push({kind,id:rowId,path,before:erasureDigest(a??null),after:erasureDigest(b??null)});
 };
 for(const [oldKey,row]of before) {
  if(row.kind==='erasureReceipt'&&row.value.actor===subject.operator){const value={...row.value,actor:alias};state.set(oldKey,{...row,value});fields.push({kind:row.kind,id:row.id,path:['actor'],before:erasureDigest(row.value.actor),after:erasureDigest(alias)});continue;}
  if(['supplierMatchingKey','invoiceEvidenceKey','erasureReceipt'].includes(row.kind))continue;
  const affected=linked.has(row.id),value=visit(row.value,'',affected);
  if(row.kind==='attachment'&&affected)Object.assign(value,eraseFile(value));
  if(row.kind==='emailIntakeMailEvent'&&value.status==='pending'&&contains(row.value)){value.status='suppressed';}
  if(row.kind==='rfq')for(let index=0;index<value.suppliers.length;index++)if(contains(row.value.suppliers[index]))value.suppliers[index].contactErased=id;
  if(row.kind==='invoice'&&row.value.evidenceHash&&JSON.stringify(value)!==JSON.stringify(row.value)) {
   requireThat(row.value.evidence,'Migrate legacy invoice evidence before erasure',409);
   value.sourceValuesErased=id;
  }
  const newId=['member','catalogueGrant'].includes(row.kind)?replace(row.id):row.id;
  value.id=newId;
  if(JSON.stringify(value)===JSON.stringify(row.value)&&newId===row.id)continue;
  state.delete(oldKey);state.set(key(row.kind,newId),{...row,id:newId,value});
  difference(row.value,value,[],row.kind,newId);
 }
 const affected=[...new Map(fields.map(f=>[key(f.kind,f.id),{kind:f.kind,id:f.id}])).values()];
 const fingerprint=erasureDigest({revision,id,subject:subject.kind,values:subject.values,fields,blobs:[...blobs].sort()});
 return {state,fields,blobs:[...blobs],affected,fingerprint,alias,email,subject,id,scrub:value=>visit(value,'',false)};
}
