import { originalDigest } from '../../src/purse/erasure-journal.mjs';
import {createHash} from 'node:crypto';
const headers=['supplier','reference','invoiceDate','dueDate','terms','poNumber','currency','senderEmail','remitTo','subtotalAmount','freightAmount','taxAmount','totalAmount'];
const items=['description','quantity','unitAmount','amount'];
const chargeTypes=['freight','fuel','handling','small-order','other'];
export function validateInvoiceReadings(all,get,check) {
 const field=(f,attachment)=>{check(f&&(f.value===null||typeof f.value==='string'&&f.value.trim().length>0&&f.value.length<=2000)&&Number.isFinite(f.confidence)&&f.confidence>=0&&f.confidence<=1,'invoice_reading_field');check(f.value===null?f.confidence===0:!!f.source,'invoice_reading_field_source');if(f.source){check(f.source.attachment===attachment&&typeof f.source.method==='string','invoice_reading_field_source');if(f.source.method!=='human correction')check(Number.isSafeInteger(f.source.page)&&f.source.page>0,'invoice_reading_page');}};
 for(const source of all('invoiceSource')){const o=get('order',source.order),a=get('attachment',source.attachment);check((o.issuedAt||o.adoption)&&o.revision===source.orderRevision&&a.kind==='invoiceSource'&&a.record===source.id&&typeof source.actor==='string'&&Number.isFinite(Date.parse(source.at)),'invoice_source');}
 for(const r of all('invoiceReading')){
  const source=get('invoiceSource',r.source),a=get('attachment',source.attachment),descriptor=r.sourceDescriptor;
  check(r.order===source.order&&descriptor.id===source.id&&descriptor.attachment===a.id&&descriptor.sha256===originalDigest(all,a)&&descriptor.name===a.name&&descriptor.mediaType===a.mediaType&&descriptor.size===a.size&&descriptor.url==='/api/purse/download/attachment/'+a.id&&typeof descriptor.attachmentRevision==='string','invoice_reading_digest');
  check(Number.isSafeInteger(r.version)&&r.version>0&&['review','unsupported','confirmed'].includes(r.status)&&Array.isArray(r.lines)&&r.lines.length<=100&&typeof r.actor==='string'&&Number.isFinite(Date.parse(r.at)),'invoice_reading');
  if(r.reader)check(r.reader.verified===false&&['provider','model','runReference'].every(key=>typeof r.reader[key]==='string'&&r.reader[key].trim()),'invoice_reading_reader');
  if(r.status==='unsupported')check(typeof r.reason==='string'&&r.reason.length,'invoice_reading_unsupported');
  else {for(const key of headers)field(r[key],a.id);check(r.lines.length>0&&new Set(r.lines.map(l=>l.id)).size===r.lines.length,'invoice_reading_lines');for(const line of r.lines)for(const key of items)field(line[key],a.id);}
  if(r.status==='confirmed'){const i=get('invoice',r.invoice);check(i.order===r.order&&i.document?.sha256===descriptor.sha256&&typeof r.confirmedBy==='string'&&Number.isFinite(Date.parse(r.confirmedAt))&&r.amounts?.totalMinor===(i.grossMinor??i.totalMinor),'invoice_reading_confirmation');
   if(r.lineMappings){
    check(r.lineMappings.length===r.amounts.lines.length&&new Set(r.lineMappings.map(map=>map.id)).size===r.lineMappings.length&&r.lineMappings.every(map=>r.amounts.lines.some(line=>line.id===map.id)),'invoice_charge_mapping');
    const order=get('order',r.order),charges=[],goods=[];
    for(const map of r.lineMappings){const line=r.amounts.lines.find(line=>line.id===map.id);if(map.chargeType!==undefined){check(!map.orderLine&&chargeTypes.includes(map.chargeType)&&line.q===1000,'invoice_charge_type');charges.push({sourceLine:line.id,type:map.chargeType,amountMinor:line.amountMinor});}else{check(order.lines.some(line=>line.id===map.orderLine),'invoice_charge_goods');goods.push({...line,line:map.orderLine});}}
    check(goods.length===i.allocations.length&&new Set(goods.map(line=>line.line)).size===goods.length&&goods.every(line=>i.allocations.some(allocation=>allocation.line===line.line&&allocation.q===line.q)),'invoice_charge_goods');
    const expected=goods.reduce((sum,line)=>sum+Number((BigInt(line.q)*BigInt(order.lines.find(item=>item.id===line.line).unitMinor)+500n)/1000n),0),subtotal=order.lines.reduce((sum,line)=>sum+line.totalMinor,0);
    const planned=subtotal?Number(BigInt(order.freightMinor)*BigInt(expected)/BigInt(subtotal)):0;
    if(r.amounts.freightMinor>planned)charges.push({sourceLine:'freightAmount',type:'freight',amountMinor:r.amounts.freightMinor-planned});
    check(JSON.stringify(charges)===JSON.stringify(i.unplannedCharges??[]),'invoice_charge_source');
   }
  }
  const history=all('invoiceReadingEvent').filter(e=>e.reading===r.id);check(history.some(e=>['invoice-extract','invoice-reading-propose'].includes(e.action)&&e.version===1)&&history.some(e=>e.version===r.version),'invoice_reading_history');
 }
 for(const invoice of all('invoice'))if(invoice.unplannedCharges?.length)check(invoice.confirmedReading&&get('invoiceReading',invoice.confirmedReading).lineMappings,'invoice_charge_confirmation');
 for(const e of all('invoiceReadingEvent')){const r=get('invoiceReading',e.reading);check(e.source===r.source&&e.order===r.order&&Number.isSafeInteger(e.version)&&e.version>0&&e.version<=r.version&&typeof e.actor==='string'&&Number.isFinite(Date.parse(e.at))&&['invoice-extract','invoice-reading-propose','invoice-reading-edit','invoice-reading-confirm'].includes(e.action),'invoice_reading_event');if(e.snapshot)check(e.snapshot.id===r.id&&e.snapshot.sourceDescriptor?.sha256===r.sourceDescriptor.sha256&&e.snapshot.version===e.version,'invoice_reading_snapshot');if(e.action==='invoice-reading-edit'){check(Array.isArray(e.changes)&&e.changes.length>0,'invoice_reading_corrections');for(const c of e.changes){check((c.line?items:headers).includes(c.field),'invoice_reading_correction');field(c.before,r.sourceDescriptor.attachment);field(c.after,r.sourceDescriptor.attachment);}}}
}
