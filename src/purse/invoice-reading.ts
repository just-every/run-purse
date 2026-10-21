import { purchasingSearchText } from './search-text';
import { invoice } from './invoices';
import { documentMetadata } from './invoice-risk';
import { allocateInvoiceCharges, readingAmounts } from './invoice-amounts';
import { invoiceHeaders, invoiceItems, invoiceEmailSender, parseInvoiceFields } from './invoice-reading-fields';
import { invoiceReadingText, postalRemit } from './invoice-reading-values';
import { invoiceInstructions, proposedInvoice } from './invoice-reading-proposal';
import { quoteSourceDescriptor } from './quote-reading-proposal';
import { readQuoteSource } from './quote-reading-source';
import { normalizedSupplierText } from './supplier-matching';
import { all, audit, can, date, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

function event(s: State, a: Actor, reading: Data, action: string, detail: Data = {}) {
    const id = uid(); put(s,'invoiceReadingEvent',id,{ reading:reading.id, source:reading.source, order:reading.order, version:reading.version, action, actor:a.id, at:new Date().toISOString(), ...detail });
    audit(s,a,action,reading.order,{ reading:reading.id, source:reading.source, version:reading.version });
}
export function visibleInvoiceReadings(s: State, buyer: boolean) {
    return Object.fromEntries(['invoiceSource','invoiceReading','invoiceReadingEvent'].map(kind=>[kind,buyer?all(s,kind):[]]));
}
export async function invoiceReading(s: State, a: Actor, op: string, b: Data): Promise<Data | undefined> {
    if (!['invoice-source','invoice-extract','invoice-reading-instructions','invoice-reading-propose','invoice-reading-edit','invoice-reading-confirm'].includes(op)) return;
    can(s,a,'buyer');
    if (op === 'invoice-source') {
        const order = get(s,'order',b.order); requireThat(!order.imported && order.issuedAt && ['issued','closed'].includes(order.status),'Use a current issued native PO',409);
        const metadata = documentMetadata(b.document), id=uid(), attachment=uid(), at=new Date().toISOString();
        put(s,'invoiceSource',id,{ order:order.id, orderRevision:order.revision, attachment, actor:a.id, at });
        put(s,'attachment',attachment,{ ...metadata, kind:'invoiceSource', record:id, base64:b.document.base64, actor:a.id, at });
        audit(s,a,'attachment',id,{attachment}); audit(s,a,op,order.id,{source:id}); return get(s,'invoiceSource',id);
    }
    const prior = ['invoice-reading-edit','invoice-reading-confirm'].includes(op)?get(s,'invoiceReading',b.id):null;
    const source = get(s,'invoiceSource',prior?.source ?? (typeof b.source==='string'?b.source:b.source?.id));
    const order = get(s,'order',source.order); requireThat(!order.imported && order.issuedAt && order.revision===source.orderRevision && ['issued','closed'].includes(order.status),'Invoice source belongs to a superseded or unavailable PO',409);
    const attachment = get(s,'attachment',source.attachment), descriptor: Data = { id:source.id, ...await quoteSourceDescriptor(attachment,s.get('attachment:'+attachment.id)!.revision) };
    requireThat(attachment.kind==='invoiceSource'&&attachment.record===source.id,'Invoice original is outside this source',409);
    if (op==='invoice-reading-instructions') return invoiceInstructions(descriptor);
    if (prior) requireThat(prior.version===b.version&&prior.status==='review'&&prior.sourceDescriptor.sha256===descriptor.sha256&&prior.sourceDescriptor.attachmentRevision===descriptor.attachmentRevision,'Reading/source changed or was already confirmed; reload',409);
    if (op==='invoice-extract'||op==='invoice-reading-propose') {
        const reading: Data = { id:uid(), source:source.id, order:order.id, sourceDescriptor:descriptor, version:1, status:'review', actor:a.id, at:new Date().toISOString(), parser:op==='invoice-extract'?'deterministic labelled invoice parser':'externally prepared invoice reading; declared reader not verified', lines:[] };
        if (op==='invoice-reading-propose') Object.assign(reading,proposedInvoice(b,descriptor));
        else {
            try {
                const rows=await readQuoteSource(attachment); reading.searchText=purchasingSearchText(rows); Object.assign(reading,parseInvoiceFields(rows,attachment.id));const sender=invoiceEmailSender(attachment);if(sender)reading.senderEmail=sender;
                const fields=[...invoiceHeaders.map(key=>reading[key]),...reading.lines.flatMap((line:Data)=>invoiceItems.map(key=>line[key]))];
                requireThat(reading.lines.length>0&&reading.lines.length<=100&&fields.every(field=>field.value===null||field.value.length<=2000),'Invoice needs 1–100 recognizable items and fields of at most 2,000 characters');
            } catch(error) { reading.status='unsupported'; reading.reason=(error as Error).message.replace(/quotes?/gi,'invoices'); reading.lines=[]; }
        }
        put(s,'invoiceReading',reading.id,reading); event(s,a,reading,op,{snapshot:structuredClone(reading)}); return reading;
    }
    const reading=structuredClone(prior!);
    if(op==='invoice-reading-edit') {
        requireThat(Array.isArray(b.changes)&&b.changes.length>0&&b.changes.length<=500,'Provide 1–500 corrections'); const changes: Data[]=[];
        for(const change of b.changes) {
            const target=change.line?reading.lines.find((line:Data)=>line.id===change.line):reading;
            requireThat(target&&(change.line?invoiceItems:invoiceHeaders).includes(change.field),'Correction is outside the invoice reading');
            requireThat(change.value===null||typeof change.value==='string','Correction must be text or missing');
            const value=change.value?.trim()?change.field==='remitTo'?postalRemit(change.value):invoiceReadingText(change.value,'Correction'):null;
            const before=structuredClone(target[change.field]); if(before.value===value) continue;
            target[change.field]={value,confidence:value===null?0:1,source:value===null?null:{attachment:attachment.id,method:'human correction',actor:a.id,at:new Date().toISOString(),original:before.source}};
            changes.push({line:change.line??null,field:change.field,before,after:structuredClone(target[change.field])});
        }
        requireThat(changes.length,'No changed fields'); reading.version++;put(s,'invoiceReading',reading.id,reading);event(s,a,reading,op,{changes});return reading;
    }
    requireThat(b.reviewed===true,'Review every value, confidence, missing field and original before confirming');
    const reason=invoiceReadingText(b.reason,'Confirmation reason'), value=(key:string)=>text(reading[key]?.value,key);
    requireThat(value('currency')===order.currency,'Invoice currency must match the selected PO');
    requireThat(value('poNumber')===order.number,'Invoice PO number must match the selected order');
    const named=normalizedSupplierText(value('supplier'));
    requireThat([order.supplierSnapshot.name,order.supplierSnapshot.dba].some(name=>normalizedSupplierText(name)===named),'Invoice supplier must match the immutable PO supplier; correct or review the source');
    const invoiceDate=date(value('invoiceDate'),'Invoice document date'); if(reading.dueDate.value!==null) date(reading.dueDate.value,'Document due date');
    for(const line of reading.lines) text(line.description?.value,'Invoice item description');
    const amounts=readingAmounts(reading);
    requireThat(Array.isArray(b.lines)&&b.lines.length===amounts.lines.length&&new Set(b.lines.map((line:Data)=>line.id)).size===amounts.lines.length,'Map every invoice item once');
    const used=new Set<string>();
    const mapped=amounts.lines.map((line:Data)=>{ const map=b.lines.find((item:Data)=>item.id===line.id);requireThat(map&&order.lines.some((item:Data)=>item.id===map.orderLine)&&!used.has(map.orderLine),'Map each invoice item to a unique line of this PO');used.add(map.orderLine);return{...line,line:map.orderLine}; });
    // The current invoice door stores inclusive allocation amounts; retain the exact breakdown here.
    const allocations=allocateInvoiceCharges(mapped,amounts.freightMinor+amounts.taxMinor).map(line=>({line:line.line,quantity:line.quantity,amountMinor:line.amountMinor}));
    const result=invoice(s,a,{order:order.id,reference:value('reference'),source:'Confirmed invoice reading '+reading.id,invoiceDate,
        ...(source.apSender?{senderEmail:source.apSender}:reading.senderEmail.value?{senderEmail:reading.senderEmail.value}:{}),...(reading.remitTo.value?{remitTo:reading.remitTo.value}:{}),...(b.remit?{remit:b.remit}:{}),document:{name:attachment.name,mediaType:attachment.mediaType,base64:attachment.base64},allocations});
    reading.status='confirmed';reading.version++;reading.invoice=result.id;reading.confirmedBy=a.id;reading.confirmedAt=new Date().toISOString();reading.amounts=amounts;
    put(s,'invoiceReading',reading.id,reading);event(s,a,reading,op,{invoice:result.id,reason,snapshot:structuredClone(reading)});return reading;
}
