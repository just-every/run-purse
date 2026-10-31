import { createHash } from 'node:crypto';
import { harness } from './purse-harness.mjs';
import { PDFDocument, StandardFonts } from 'pdf-lib';

export const entityAddress = number => ['synthetic-purse-'+number,'example.test'].join('@');
export async function entityPdf(label) {
    const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText(label,{x:40,y:700,font,size:16});
    return {name:label+'.pdf',base64:Buffer.from(await pdf.save()).toString('base64')};
}
export async function entitiesFixture(h=undefined,{configure=true}={}) {
    h ??= await harness({protectedKey:createHash('sha256').update('synthetic-purse-7450').digest('hex')});
    try {
        await h.command('business',{name:'synthetic-purse-7400',currencies:['USD','EUR'],locations:['Denver'],costCentres:['Operations'],projects:['Equipment']});
        const requester=await h.member(entityAddress(7401),['requester']),approver=await h.member(entityAddress(7402),['approver']),buyer=await h.member(entityAddress(7403),['buyer']);
        const supplier=await h.command('supplier',{name:'synthetic-purse-7404',status:'active',reason:'Reviewed existing supplier',postalState:'CO',contacts:[{name:'synthetic-purse-7405',email:entityAddress(7405)}]},buyer);
        const terms=await entityPdf('synthetic-purse-7406 original terms'),certificate=await entityPdf('synthetic-purse-7407 original certificate');
        const input=number=>({version:0,legalName:'synthetic-purse-'+number+' LLC',billTo:number+' Billing Road, Denver CO',shipTo:number+' Receiving Road, Denver CO',prefix:'EN'+number,country:'US',currency:'USD',active:true});
        const entities=[];for(const number of (configure?[7410,7420]:[]))entities.push(await h.command('entity',input(number)));
        const policies=[],profiles=[];
        for(const entity of entities) {
            policies.push(await h.command('policy',{entity:entity.id,name:entity.legalName+' goods',currency:'USD',category:'*',project:'*',approver:entityAddress(7402),limitMinor:100000,budgetMinor:100000}));
            profiles.push(await h.command('po-profile',{entity:entity.id,version:0,location:'Denver',purchaseType:'*',legalName:entity.legalName,billTo:{label:'Accounts payable',name:entity.legalName,address:entity.billTo},shipTo:{label:'Goods destination',name:entity.legalName,address:entity.shipTo},buyerContact:'Purchasing team',shippingTerms:'FOB destination',standardTerms:'Only supply the exact approved goods.',fieldLabels:{partNumber:'Vendor SKU',lineTax:'Recorded line tax'},termsFile:terms,certificate:{...certificate,supplierStates:['CO']}}));
        }
        const requestInput=(entity,amount)=>({entity:entity.id,title:entity.legalName+' equipment',supplier:supplier.id,currency:'USD',needDate:'2099-11-01',location:'Denver',costCentre:'Operations',terms:'Net 30',freightMinor:0,taxMinor:100,lines:[{description:'Equipment',quantity:'1',unitMinor:amount-100,category:'Goods',project:'Equipment',partNumber:'synthetic-purse-7430',unit:'case',shipTo:'7430 Dock Road, Denver CO',lineTaxMinor:100}]});
        const grant=async(email,role,ids)=>h.command('member',{email,name:'Scoped '+role,active:true,grants:[{role,scope:{entities:ids}}]});
        const submit=async(entity,amount)=>{const request=await h.command('request',requestInput(entity,amount),requester);await h.command('submit',{id:request.id,revision:request.revision},requester);return request;};
        const approve=request=>h.command('decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Current entity goods approved'},approver);
        const rows=async()=>(await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results;
        return {h,requester,approver,buyer,supplier,terms,certificate,input,entities,policies,profiles,requestInput,grant,submit,approve,rows};
    } catch(error) { await h.close();throw error; }
}
