import { operationalOrder, orderAdoption } from './adoption-position';
import { purchasingSearchText } from './search-text';
import { invoice } from './invoices';
import { documentMetadata } from './invoice-risk';
import { allocateInvoiceCharges, readingAmounts } from './invoice-amounts';
import { sourceInvoiceCharges } from './invoice-charges';
import { invoiceHeaders, invoiceItems, invoiceEmailSender, parseInvoiceFields } from './invoice-reading-fields';
import { invoiceReadingText, postalRemit } from './invoice-reading-values';
import { invoiceInstructions, proposedInvoice } from './invoice-reading-proposal';
import { invoiceXmlFields, invoiceXmlKind } from './invoice-xml';
import { quoteSourceDescriptor } from './quote-reading-proposal';
import { readQuoteSource } from './quote-reading-source';
import { normalizedSupplierText } from './supplier-matching';
import { missingField } from './quote-reading-fields';
import { all, audit, date, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';
import { allowed, requirePermission } from './access';

function event(s: State, a: Actor, reading: Data, action: string, detail: Data = {}) {
    const id = uid(); put(s,'invoiceReadingEvent',id,{ reading:reading.id, source:reading.source, order:reading.order, version:reading.version, action, actor:a.id, at:new Date().toISOString(), ...detail });
    audit(s,a,action,reading.order,{ reading:reading.id, source:reading.source, version:reading.version });
}
export function visibleInvoiceReadings(s: State, a: Actor) {
    return Object.fromEntries(['invoiceSource','invoiceReading','invoiceReadingEvent'].map(kind=>[kind,
        all(s,kind).filter(record => allowed(s, a, 'invoice.read', get(s, 'order', record.order)))
            .map(record => ({ ...record, mayCapture: allowed(s, a, 'invoice.capture', get(s, 'order', record.order)) }))]));
}
export async function invoiceReading(s: State, a: Actor, op: string, b: Data): Promise<Data | undefined> {
    if (!['invoice-source','invoice-extract','invoice-reading-instructions','invoice-reading-propose','invoice-reading-edit','invoice-reading-confirm'].includes(op)) return;
    const permission = op === 'invoice-reading-instructions' ? 'invoice.read' : 'invoice.capture';
    requirePermission(s, a, permission);
    if (op === 'invoice-source') {
        const order = get(s,'order',b.order); requirePermission(s, a, permission, order); requireThat(operationalOrder(s, order) && ['issued','adopted','closed','cancelled'].includes(order.status),'Use a current issued native PO',409);
        let document = b.document;
        let nativeInvoice: string | undefined;
        if (b.invoice) {
            const historical = get(s, 'invoice', b.invoice);
            requirePermission(s,a,'invoice.read',historical);
            if(historical.supplierSubmission){
                requireThat(historical.order===order.id && historical.sourceConfirmation==='pending','Choose a pending supplier invoice on this PO',409);
                const source=get(s,'invoiceSource',historical.supplierSource),retained=get(s,'attachment',source.attachment);
                requireThat(source.order===order.id && source.orderRevision===order.revision && retained.kind==='invoiceSource' && retained.record===source.id && retained.sha256===historical.document?.sha256 && !retained.erasure && retained.base64,'Supplier invoice original is unavailable',409);
                audit(s,a,op,order.id,{source:source.id,invoice:historical.id});return source;
            }
            if (!historical.imported && !historical.supplierSubmission) {
                requireThat(!historical.evidenceHash || historical.evidence?.representation==='v2','Legacy invoice evidence must retain its independent migration and re-entry history',409);
                requireThat(historical.order === order.id && !historical.paymentApproval && !historical.confirmedReading,'Choose unconfirmed native invoice evidence on this PO',409);
                const retained=all(s,'attachment').find(file=>file.kind==='invoice'&&file.record===historical.id&&file.sha256===historical.document?.sha256);
                if(historical.document)requireThat(retained?.base64&&!retained.erasure,'Private original unavailable',409);
                document=retained??b.document;nativeInvoice=historical.id;
            } else {
            requireThat(historical.imported && historical.adoptedVia && historical.order === order.id, 'Choose a historical bill on this adopted PO', 409);
            const retained = all(s, 'attachment').find(file => file.kind === 'invoice' && file.record === historical.id && file.sha256 === historical.document?.sha256);
            requireThat(retained && !retained.erased, 'Retained private original is unavailable; stage the actual original for source confirmation', 409);
            document = retained;
            }
        }
        const metadata = documentMetadata(document), id=uid(), attachment=uid(), at=new Date().toISOString();
        put(s,'invoiceSource',id,{ ...(nativeInvoice?{invoice:nativeInvoice}:{}), order:order.id, orderRevision:order.revision, attachment, actor:a.id, at });
        put(s,'attachment',attachment,{ ...metadata, kind:'invoiceSource', record:id, base64:document.base64, actor:a.id, at });
        audit(s,a,'attachment',id,{attachment}); audit(s,a,op,order.id,{source:id}); return get(s,'invoiceSource',id);
    }
    const prior = ['invoice-reading-edit','invoice-reading-confirm'].includes(op)?get(s,'invoiceReading',b.id):null;
    const source = get(s,'invoiceSource',prior?.source ?? (typeof b.source==='string'?b.source:b.source?.id));
    const order = get(s,'order',source.order); requirePermission(s, a, permission, order); requireThat(operationalOrder(s, order) && order.revision===source.orderRevision && ['issued','adopted','closed','cancelled'].includes(order.status),'Invoice source belongs to a superseded or unavailable PO',409);
    const attachment = get(s,'attachment',source.attachment), descriptor: Data = { id:source.id, ...await quoteSourceDescriptor(attachment,s.get('attachment:'+attachment.id)!.revision) };
    requireThat(attachment.kind==='invoiceSource'&&attachment.record===source.id,'Invoice original is outside this source',409);
    if (op==='invoice-reading-instructions') return invoiceInstructions(descriptor);
    if (prior) requireThat(prior.version===b.version&&prior.status==='review'&&prior.sourceDescriptor.sha256===descriptor.sha256&&prior.sourceDescriptor.attachmentRevision===descriptor.attachmentRevision,'Reading/source changed or was already confirmed; reload',409);
    if (op==='invoice-extract'||op==='invoice-reading-propose') {
        const reading: Data = { id:uid(), source:source.id, order:order.id, sourceDescriptor:descriptor, version:1, status:'review', actor:a.id, at:new Date().toISOString(), parser:op==='invoice-extract'?'deterministic labelled invoice parser':'externally prepared invoice reading; declared reader not verified', lines:[] };
        if (op==='invoice-reading-propose') Object.assign(reading,proposedInvoice(b,descriptor));
        else {
            try {
                const bytes=Uint8Array.from(atob(attachment.base64),c=>c.charCodeAt(0));
                if(invoiceXmlKind(bytes)){ Object.assign(reading,invoiceXmlFields(bytes,attachment.id,order)); reading.searchText=purchasingSearchText([...invoiceHeaders.map(key=>reading[key]),...reading.lines.flatMap((line:Data)=>invoiceItems.map(key=>line[key]))].filter(field=>field&&field.value!==null).map(field=>({text:field.value}))); }
                else { const rows=await readQuoteSource(attachment); reading.searchText=purchasingSearchText(rows); Object.assign(reading,parseInvoiceFields(rows,attachment.id));const sender=invoiceEmailSender(attachment);if(sender)reading.senderEmail=sender; }
                const fields=[...invoiceHeaders.map(key=>reading[key]),...reading.lines.flatMap((line:Data)=>invoiceItems.map(key=>line[key]))].filter(Boolean);
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
            const before=structuredClone(target[change.field]??missingField()); if(before.value===value) continue;
            target[change.field]={value,confidence:value===null?0:1,source:value===null?null:{attachment:attachment.id,method:'human correction',actor:a.id,at:new Date().toISOString(),original:before.source}};
            changes.push({line:change.line??null,field:change.field,before,after:structuredClone(target[change.field])});
        }
        requireThat(changes.length,'No changed fields'); reading.version++;put(s,'invoiceReading',reading.id,reading);event(s,a,reading,op,{changes});return reading;
    }
    requireThat(b.reviewed===true,'Review every value, confidence, missing field and original before confirming');
    const reason=invoiceReadingText(b.reason,'Confirmation reason'), value=(key:string)=>text(reading[key]?.value,key);
    requireThat(value('currency')===order.currency,'Invoice currency must match the selected PO');
    requireThat([order.number, orderAdoption(s, order)?.sourceOrder.number].includes(value('poNumber')),'Invoice PO number must match the selected order or its original adopted reference');
    const named=normalizedSupplierText(value('supplier'));
    requireThat([order.supplierSnapshot.name,order.supplierSnapshot.dba].some(name=>normalizedSupplierText(name)===named),'Invoice supplier must match the immutable PO supplier; correct or review the source');
    const invoiceDate=date(value('invoiceDate'),'Invoice document date'); if(reading.dueDate.value!==null) date(reading.dueDate.value,'Document due date');
    for(const line of reading.lines) text(line.description?.value,'Invoice item description');
    const amounts=readingAmounts(reading);
    requireThat(Array.isArray(b.lines)&&b.lines.length===amounts.lines.length&&new Set(b.lines.map((line:Data)=>line.id)).size===amounts.lines.length,'Map every invoice item once');
    const used=new Set<string>();
    const mapped=amounts.lines.map((line:Data)=>{ const map=b.lines.find((item:Data)=>item.id===line.id);requireThat(map&&order.lines.some((item:Data)=>item.id===map.orderLine)&&!used.has(map.orderLine),'Map each invoice item to a unique line of this PO');used.add(map.orderLine);return{...line,line:map.orderLine}; });
    // The current invoice door stores inclusive allocation amounts; retain the exact breakdown here.
    const allocations=allocateInvoiceCharges(mapped,amounts.freightMinor+amounts.taxMinor+amounts.otherMinor).map(line=>({line:line.line,quantity:line.quantity,amountMinor:line.amountMinor}));
    const result:Data=invoice(s,a,{order:order.id,reference:value('reference'),source:'Confirmed invoice reading '+reading.id,invoiceDate,
        ...(source.apSender?{senderEmail:source.apSender}:reading.senderEmail.value?{senderEmail:reading.senderEmail.value}:{}),...(reading.remitTo.value?{remitTo:reading.remitTo.value}:{}),...(b.remit?{remit:b.remit}:{}),document:{name:attachment.name,mediaType:attachment.mediaType,base64:attachment.base64},allocations, ...(b.depositAppliedAmount !== undefined ? { depositAppliedAmount: b.depositAppliedAmount } : {})}, { reading: reading.id, charges:sourceInvoiceCharges(order,mapped,amounts) });
    reading.status='confirmed';reading.version++;reading.invoice=result.id;reading.confirmedBy=a.id;reading.confirmedAt=new Date().toISOString();reading.amounts=amounts;
    put(s,'invoice',result.id,{...get(s,'invoice',result.id),sourceConfirmation:'confirmed',confirmedReading:reading.id,confirmedBy:a.id,confirmedAt:reading.confirmedAt});
    put(s,'invoiceReading',reading.id,reading);event(s,a,reading,op,{invoice:result.id,reason,snapshot:structuredClone(reading)});return reading;
}
