import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { harness } from './purse-harness.mjs';
export const accrualMail = n => 'synthetic-purse-'+n+String.fromCharCode(64)+'example.test';
export async function accrualFixture() {
    const h=await harness({worker:'tests/accrual-worker.ts',clock:'2026-06-27T12:00:00.000Z'});
    const cmd=(op,body,cookie=h.owner,status=200)=>h.command(op,body,cookie,status);
    try {
        await cmd('business',{name:'synthetic-purse-4700',currencies:['USD','CAD'],locations:['Denver'],costCentres:['Operations','Research'],projects:['General','Fitout'],timezone:'UTC'});
        const people={requester:await h.member(accrualMail(4701),['requester']),approver:await h.member(accrualMail(4702),['approver']),finance:await h.member(accrualMail(4703),['finance-viewer']),outsider:await h.member(accrualMail(4704),['requester'])};
        await cmd('member',{email:accrualMail(4703),name:'Scoped controller',active:true,grants:[{role:'finance-viewer',scope:{departments:['Operations']}}]});
        const supplier=await cmd('supplier',{name:'=synthetic-purse-4705',status:'preferred',reason:'Reviewed native supplier'});
        for(const currency of ['USD','CAD'])await cmd('policy',{name:'synthetic-purse-4706-'+currency,currency,category:'*',project:'*',approver:accrualMail(4702),limitMinor:100000000,budgetMinor:100000000});
        async function issue({title='synthetic-purse-4707',currency='USD',department='Operations',quantity='10',unitMinor=10000,service,glAccount='6100',allocations}={}) {
            const draft={title,supplier:supplier.id,currency,needDate:'2026-06-28',location:'Denver',costCentre:department,glAccount,terms:'Net 30',freightMinor:0,taxMinor:0,lines:[{description:title+' item',quantity,unitMinor,category:'goods',project:'General',glAccount,...(service?{service}:{}),...(allocations?{allocations}:{})}]};
            const request=await cmd('request',draft,people.requester);await cmd('submit',{id:request.id,revision:1},people.requester);await cmd('decision',{id:request.id,revision:1,decision:'approved',reason:'Reviewed exact native request'},people.approver);return cmd('convert',{id:request.id,revision:1,issue:true});
        }
        const order=await issue();
        const sent=await h.send('/api/purse/order-send',{order:order.id,revision:1,recipient:accrualMail(4708),reason:'Explicit supplier document consent',consent:true},h.owner);assert.equal(sent.status,200,JSON.stringify(sent.value));
        const message=h.messages.find(message=>message.text?.includes('/api/purse/order-link/')),link=new URL(message.text.match(/http:\/\/[^\s]+\/api\/purse\/order-link\/[^\s]+/)[0]);
        const supplierPost=async(path,body)=>fetch(link.href+path,{method:'POST',headers:{origin:h.origin,'content-type':'application/json'},body:JSON.stringify(body)});
        assert.equal((await supplierPost('',{decision:'accept',revision:1,version:0,promisedDate:'2026-06-28',consent:true,name:'synthetic-purse-4709'})).status,200);
        assert.equal((await h.send('/api/purse/order-send/'+order.id+'/invoice-consent',{revision:1,enabled:true,consent:true,reason:'Share exact supplier balance'},h.owner)).status,200);
        async function bill(reference,quantity,invoiceDate,{approve=false,unitAmount='100.00'}={}) {
            const amount=(Number(quantity)*Number(unitAmount)).toFixed(2),values={supplier:supplier.name,reference,invoiceDate,dueDate:null,terms:null,poNumber:order.number,currency:'USD',senderEmail:null,remitTo:null,subtotalAmount:amount,freightAmount:'0.00',taxAmount:'0.00',totalAmount:amount};
            const pdf=await PDFDocument.create(),page=pdf.addPage([650,790]),font=await pdf.embedFont(StandardFonts.Helvetica);
            Object.entries(values).filter(([,value])=>value!==null).forEach(([key,value],index)=>page.drawText(key+': '+value,{x:20,y:760-index*24,size:10,font}));
            const document={name:reference+'.pdf',mediaType:'application/pdf',base64:Buffer.from(await pdf.save()).toString('base64')};
            const body={revision:1,consent:true,reference,invoiceDate,freightAmount:'0.00',taxAmount:'0.00',lines:[{line:order.lines[0].id,quantity,unitAmount}],document};
            const response=await supplierPost('/invoices',body);assert.equal(response.status,200,await response.clone().text());
            let invoice=(await h.state(h.owner)).data.invoice.find(invoice=>invoice.reference===reference);
            if(approve) {
                await cmd('supplier-invoice-rule',{order:order.id,revision:1,version:0,enabled:true,consent:true,reason:'Approve genuine exact matches after AP source confirmation'});
                const instructions=await cmd('invoice-reading-instructions',{source:invoice.supplierSource});const field=value=>({value,confidence:value===null?0:1,page:value===null?null:1,excerpt:value});
                const reading=await cmd('invoice-reading-propose',{source:instructions.source,reader:{provider:'synthetic-purse-4710',model:'synthetic-purse-4711',runReference:'synthetic-purse-4712'},fields:{...Object.fromEntries(Object.entries(values).map(([key,value])=>[key,field(value)])),lines:[{description:field(order.lines[0].description),quantity:field(quantity),unitAmount:field(unitAmount),amount:field(amount)}]}});
                await cmd('invoice-reading-confirm',{id:reading.id,version:1,reviewed:true,reason:'AP verifies exact source',lines:[{id:reading.lines[0].id,orderLine:order.lines[0].id}]});
                invoice=(await h.state(h.owner)).data.invoice.find(row=>row.id===invoice.id);assert.equal(invoice.paymentApproval?.amountMinor,Number(amount)*100);
            }
            return {invoice,body,replay:()=>supplierPost('/invoices',body)};
        }
        const report=async(cutoff,cookie=people.finance,filters={})=>{const result=await h.send('/api/purse/accrual-report/view?'+new URLSearchParams({cutoff,...filters}),undefined,cookie);assert.equal(result.status,200,JSON.stringify(result.value));return result.value;};
        async function signIn(email) {
            const requested=await h.send('/auth/magic-link',{email,returnTo:'/app'});assert.equal(requested.status,202,JSON.stringify(requested.value));
            const message=[...h.messages].reverse().find(message=>message.to.includes(email));const token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');
            const confirmed=await h.send('/auth/confirm',{token});assert.equal(confirmed.status,303,JSON.stringify(confirmed.value));return confirmed.cookie;
        }
        async function advance(date,reauth=false) {await h.setClock(date+'T12:00:00.000Z');if(reauth){h.owner=await signIn('owner'+String.fromCharCode(64)+'example.test');for(const [name,n] of [['requester',4701],['approver',4702],['finance',4703],['outsider',4704]])people[name]=await signIn(accrualMail(n));}}
        const receive=async(target,quantity,effectiveDate)=>cmd('receipt',{order:target.id,line:target.lines[0].id,event:'receive',quantity,effectiveDate,reason:'Physical receipt evidence'});
        return {h,cmd,people,supplier,order,issue,bill,report,receive,advance,close:()=>h.close()};
    } catch(error) {await h.close();throw error;}
}

export async function accrualTimeline(f) {
    await f.advance('2026-06-28');
    const first=await f.receive(f.order,'6','2026-06-28');
    await f.advance('2026-06-30');
    const pending=await f.bill('synthetic-purse-4713','2','2026-06-30');
    await f.advance('2026-07-02');
    const approved=await f.bill('synthetic-purse-4714','4','2026-07-02',{approve:true});
    return {first,pending,approved};
}
