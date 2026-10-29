import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {harness} from './purse-harness.mjs';

export const matchingMail = index => ['synthetic-purse-'+index,'example.test'].join('@');
export async function invoiceMatchingFixture() {
    const h=await harness(),cmd=h.command;
    await cmd('business',{name:'Native matching business',currencies:['USD','CAD'],locations:['Denver','Boulder'],costCentres:['Operations','IT'],projects:['Safety']});
    const requester=await h.member(matchingMail(8601),['requester']),approver=await h.member(matchingMail(8602),['approver']),buyer=await h.member(matchingMail(8603),['buyer']);
    const supplier=await cmd('supplier',{name:'Native goods supplier',status:'active',reason:'Current native goods source'});
    await cmd('policy',{name:'Goods authority',currency:'USD',category:'*',project:'*',approver:matchingMail(8602),limitMinor:10000000,budgetMinor:90000000});
    let serial=0,invoiceSerial=0;
    async function order({received='6',category='Equipment',location='Denver',unitMinor=10000,quantity='10',supplierId=supplier.id,awardFirstUnitMinor,freightMinor=0,taxMinor=0,lines}={}) {
        const request=await cmd('request',{title:'Native goods '+(++serial),supplier:supplierId,currency:'USD',needDate:'2026-12-01',location,costCentre:'Operations',terms:'2/10 Net 30',freightMinor,taxMinor,lines:lines??[{description:'Safety equipment',quantity,unitMinor,category,project:'Safety'}]},requester);
        if(awardFirstUnitMinor){const first=await cmd('quote',{...request,request:request.id,source:'Original native first offer',lines:request.lines.map(l=>({...l,unitMinor:awardFirstUnitMinor}))},requester),winner=await cmd('quote',{...request,request:request.id,source:'Exact awarded native price'},requester);await cmd('quote-award',{request:request.id,revision:request.revision,firstQuote:first.id,awardedQuote:winner.id,reason:'Buyer selected the genuine goods saving',lines:[{requestLine:request.lines[0].id,firstLine:first.lines[0].id,awardedLine:winner.lines[0].id}]},buyer);}
        await cmd('submit',{id:request.id,revision:1},requester);await cmd('decision',{id:request.id,revision:1,decision:'approved',reason:'Exact goods reviewed'},approver);
        const order=await cmd('convert',{id:request.id,revision:1},buyer);await cmd('issue',{id:order.id,revision:1,reason:'Approved goods issued'},buyer);
        if(received!=='0')await cmd('receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:received,reason:'Goods accepted'});
        return order;
    }
    async function rule(changes={}) {return cmd('matching-rule',{version:0,supplier:supplier.id,category:'*',currency:'USD',priceBps:200,priceMinor:2000,quantityBps:200,quantityMinor:2000,enabled:true,consent:true,reason:'Owner consents to received goods within both limits',...changes});}
    async function stage(order,{quantity='6',unitMinor=10000,reference='synthetic-purse-'+(++serial),date=new Date(Date.UTC(2026,9,19+invoiceSerial++)).toISOString().slice(0,10),term='2/10 Net 30',freightMinor=0,taxMinor=0,fees={},sender,remitTo}={}) {
        const feeLabels={fuel:'Fuel surcharge',handling:'Handling','small-order':'Small-order fee',other:'Other fees'},feeTotal=Object.values(fees).reduce((n,value)=>n+value,0);
        const totalMinor=Math.round(Number(quantity)*unitMinor),pdf=await PDFDocument.create(),page=pdf.addPage([700,1200]),font=await pdf.embedFont(StandardFonts.Helvetica);
        const text=['Supplier: '+order.supplierSnapshot.name,'Invoice number: '+reference,'Invoice date: '+date,'Payment terms: '+term,'PO number: '+order.number,'Currency: USD','Item: Safety equipment','Quantity: '+quantity,'Unit price: '+(unitMinor/100).toFixed(2),'Line amount: '+(totalMinor/100).toFixed(2),'Subtotal: '+(totalMinor/100).toFixed(2),'Freight: '+(freightMinor/100).toFixed(2),'Tax: '+(taxMinor/100).toFixed(2),...Object.entries(fees).map(([type,value])=>feeLabels[type]+': '+(value/100).toFixed(2)),'Total: '+((totalMinor+freightMinor+taxMinor+feeTotal)/100).toFixed(2),...(sender?['Sender: '+sender]:[]),...(remitTo?['Remit to: '+remitTo]:[])];
        text.forEach((row,index)=>page.drawText(row,{x:25,y:1150-index*25,size:13,font}));
        const document={name:reference+'.pdf',mediaType:'application/pdf',base64:Buffer.from(await pdf.save()).toString('base64')};
        const source=await cmd('invoice-source',{order:order.id,document},buyer),reading=await cmd('invoice-extract',{source:source.id},buyer);
        assert.equal(reading.status,'review',reading.reason);
        return {document,source,reading,body:{id:reading.id,version:reading.version,reviewed:true,reason:'AP checked original fields and mapped exact goods',lines:[{id:reading.lines[0].id,orderLine:order.lines[0].id}]}};
    }
    async function confirm(staged,cookie=buyer){const r=await cmd('invoice-reading-confirm',staged.body,cookie);return (await h.state()).data.invoice.find(i=>i.id===r.invoice);}
    const current=async id=>(await h.state()).data.invoice.find(i=>i.id===id);
    return {emails:{requester:matchingMail(8601),approver:matchingMail(8602),buyer:matchingMail(8603)},h,cmd,supplier,requester,approver,buyer,order,rule,stage,confirm,current};
}
