import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts} from 'pdf-lib';
export const fieldMail=n=>'synthetic-purse-'+n+String.fromCharCode(64)+'example.test';
export async function customFieldsFixture(h) {
 const cmd=h.command;
 await cmd('business',{name:'synthetic-purse-6200',currencies:['USD','CAD'],locations:['Austin','Denver'],costCentres:['Operations'],projects:['General']});
 const requester=await h.member(fieldMail(6201),['requester']),approver=await h.member(fieldMail(6202),['approver']),buyer=await h.member(fieldMail(6203),['buyer']),finance=await h.member(fieldMail(6204),['finance-viewer']);
 await cmd('member',{email:fieldMail(6204),name:'Native report reader',active:true,grants:[{role:'finance-viewer',scope:{locations:['Austin']}}]});
 const supplier=await cmd('supplier',{name:'synthetic-purse-6205',status:'preferred',reason:'Reviewed native supplier'});
 for(const currency of ['USD','CAD'])await cmd('policy',{name:'synthetic-purse-6206-'+currency,currency,category:'*',project:'*',approver:fieldMail(6202),limitMinor:1000000,budgetMinor:10000000});
 const config={name:'Native event purchase',purchaseType:'goods',consent:true,headerFields:[{id:'event',label:'Event',type:'text',required:true},{id:'attendees',label:'Attendees',type:'number',required:true},{id:'event_date',label:'Event date',type:'date',required:true},{id:'funded',label:'Grant funded',type:'boolean',required:true}],lineFields:[{id:'grant',label:'Grant',type:'choice',options:['synthetic-purse-6207','synthetic-purse-6208','synthetic-purse-6209'],inactiveOptions:['synthetic-purse-6209'],required:true}],defaults:{category:'goods',project:'General',location:'Austin',costCentre:'Operations',currency:'USD'}};
 const form=await cmd('intake-form',config);
 const draft={title:'synthetic-purse-6210',supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Austin',costCentre:'Operations',terms:'Net 30',intakeForm:form.id,customFields:{event:'synthetic-purse-6211',attendees:'0',event_date:'2026-12-01',funded:'No'},lines:[{description:'synthetic-purse-6212',quantity:'2',unitMinor:5000,category:'goods',project:'General',glAccount:'6100',customFields:{grant:'synthetic-purse-6207'}}]};
 async function approve(request) {await cmd('submit',{id:request.id,revision:request.revision},requester);return cmd('decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Independent review of exact custom values'},approver);}
 async function issue(request) {const order=await cmd('convert',{id:request.id,revision:request.revision},buyer);return cmd('issue',{id:order.id,revision:order.revision,reason:'Issue reviewed native values'},buyer);}
 async function receive(order) {return cmd('receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:order.lines[0].quantity,reason:'Received native goods',ownerOverride:true});}
 async function invoiceDocument(order,reference) {
  const line=order.lines[0],amount=(line.totalMinor/100).toFixed(2),doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),page=doc.addPage([650,790]);
  const rows=['Supplier: '+supplier.name,'Invoice number: '+reference,'Invoice date: 2026-10-19','Due date: 2026-11-18','Payment terms: Net 30','PO number: '+order.number,'Currency: '+order.currency,'Item: '+line.description,'Quantity: '+line.quantity,'Unit price: '+(line.unitMinor/100).toFixed(2),'Line amount: '+amount,'Subtotal: '+amount,'Freight: 0.00','Tax: 0.00','Total: '+amount];
  rows.forEach((text,index)=>page.drawText(text,{x:25,y:750-index*23,size:12,font}));return {name:reference+'.pdf',mediaType:'application/pdf',base64:Buffer.from(await doc.save()).toString('base64')};
 }
 async function source(order,reference) {const document=await invoiceDocument(order,reference),source=await cmd('invoice-source',{order:order.id,document},buyer),reading=await cmd('invoice-extract',{source:source.id},buyer);assert.equal(reading.status,'review',reading.reason);return {document,source,reading};}
 async function bill(order,reference) {const proof=await source(order,reference),confirm={id:proof.reading.id,version:1,reviewed:true,reason:'Compared exact private original and source lines',lines:[{id:proof.reading.lines[0].id,orderLine:order.lines[0].id}]};const done=await cmd('invoice-reading-confirm',confirm,buyer);return {...proof,confirm,invoice:(await h.state()).data.invoice.find(row=>row.id===done.invoice)};}
 const report=async(filters={},cookie=finance)=>{const result=await h.send('/api/purse/spend-report?'+new URLSearchParams(filters),undefined,cookie);assert.equal(result.status,200,JSON.stringify(result.value));return result.value;};
 return {h,cmd,requester,approver,buyer,finance,supplier,config,form,draft,approve,issue,receive,source,bill,invoiceDocument,report};
}
