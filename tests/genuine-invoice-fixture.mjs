import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/** Upgrade the fixture's legacy captured bill through real private-source review and owner consent. */
export async function genuineInvoiceApproval({command,state,download},invoice,{expectedApproval=true}={}) {
    let data=(await state()).data;
    if(data.invoice.find(i=>i.id===invoice.id)?.paymentApproval)return;
    const order=data.order.find(o=>o.id===invoice.order),payable=data.payable.find(p=>p.invoice===invoice.id);
    const invoiceDate=payable?.invoiceDate??invoice.invoiceDate,term=payable?.term??'Net 30';
    const field=value=>value===null?{value:null,confidence:0,page:null,excerpt:null}:{value,confidence:1,page:1,excerpt:value};
    const money=n=>(n/100).toFixed(2);
    const lines=invoice.allocations.map(a=>{const l=order.lines.find(l=>l.id===a.line);return {description:field(l.description),quantity:field(a.quantity),unitAmount:field(money(l.unitMinor)),amount:field(money(a.amountMinor))};});
    const fields={supplier:field(order.supplierSnapshot.name),reference:field(invoice.reference),invoiceDate:field(invoiceDate),dueDate:field(null),terms:field(term),poNumber:field(order.number),currency:field(invoice.currency),senderEmail:field(invoice.sender?.email??null),remitTo:field(null),subtotalAmount:field(money(invoice.totalMinor)),freightAmount:field('0.00'),taxAmount:field('0.00'),totalAmount:field(money(invoice.totalMinor)),lines};
    let document;
    if(invoice.document) document={...invoice.document,base64:await download(data.attachment.find(a=>a.kind==='invoice'&&a.record===invoice.id&&a.sha256===invoice.document.sha256).id)};
    else {
        const pdf=await PDFDocument.create(),page=pdf.addPage([700,1000]),font=await pdf.embedFont(StandardFonts.Helvetica);
        const text=[...Object.entries(fields).filter(([,f])=>!Array.isArray(f)&&f.value!==null).map(([key,f])=>key+': '+f.value),...lines.flatMap(l=>Object.entries(l).map(([key,f])=>key+': '+f.value))];
        text.forEach((line,index)=>page.drawText(line,{x:25,y:950-index*20,size:13,font}));
        document={name:'synthetic-purse-invoice.pdf',mediaType:'application/pdf',base64:Buffer.from(await pdf.save()).toString('base64')};
    }
    const source=await command('invoice-source',{order:order.id,invoice:invoice.id,document});
    const handoff=await command('invoice-reading-instructions',{source:source.id});
    const reading=await command('invoice-reading-propose',{...handoff.proposalTemplate,reader:{provider:'synthetic-purse-reader',model:'human-reviewed fixture',runReference:'synthetic-purse-approval'},fields});
    await command('invoice-reading-confirm',{id:reading.id,version:reading.version,reviewed:true,reason:'Reviewed exact native invoice original',lines:reading.lines.map((l,index)=>({id:l.id,orderLine:invoice.allocations[index].line}))});
    data=(await state()).data;
    let rule=data.matchingRule.find(r=>r.supplier===order.supplier&&r.category==='*'&&r.currency===invoice.currency);
    if(!rule) rule=await command('matching-rule',{version:0,supplier:order.supplier,category:'*',currency:invoice.currency,priceBps:0,priceMinor:0,quantityBps:0,quantityMinor:0,enabled:true,consent:true,reason:'Owner consents to exact received native goods invoices'});
    const matched=await command('match-invoice',{invoice:invoice.id,rule:rule.id,version:rule.version});
    if(expectedApproval)assert.equal(matched.paymentApproval?.kind,'native-matching',JSON.stringify(matched.matching));else assert.equal(matched.paymentApproval,undefined,JSON.stringify(matched.matching));
    return matched;
}
export const harnessInvoiceApproval=(h,invoice,options)=>genuineInvoiceApproval({command:h.command,state:()=>h.state(),download:async id=>Buffer.from(await(await h.mf.dispatchFetch(h.origin+'/api/purse/download/attachment/'+id,{headers:{cookie:h.owner}})).arrayBuffer()).toString('base64')},invoice,options);
export const browserInvoiceApproval=(context,origin,invoice)=>{
    const request=context.request;
    return genuineInvoiceApproval({command:async(op,body)=>{const r=await request.post(origin+'/api/purse/command/'+op,{data:body,headers:{origin}});assert.equal(r.status(),200,await r.text());return r.json();},state:async()=>{const r=await request.get(origin+'/api/purse/state');return r.json();},download:async id=>(await(await request.get(origin+'/api/purse/download/attachment/'+id)).body()).toString('base64')},invoice);
};
