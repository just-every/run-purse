import {createHash} from 'node:crypto';
import {harness} from './purse-harness.mjs';

export const taxEmail=n=>['synthetic-purse-'+n,'example.test'].join('@');
export async function supplierTaxFixture() {
    const h=await harness({protectedKey:createHash('sha256').update('synthetic-purse-6300').digest('hex')});
    try {
        await h.command('business',{name:'synthetic-purse-6301',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Equipment']});
        const buyer=await h.member(taxEmail(6302),['buyer']),requester=await h.member(taxEmail(6303),['requester']),auditor=await h.member(taxEmail(6304),['auditor']);
        const supplier=await h.command('supplier',{name:'synthetic-purse-6305',status:'active',reason:'Reviewed existing supplier',contacts:[{name:'synthetic-purse-6306',email:taxEmail(6306)}]},buyer);
        const original='synthetic-purse-6307 private W-9 original for synthetic-purse-6306; '+String(987654321);
        const upload=async(bytes=original,record=supplier.id)=>h.command('attachment',{kind:'supplier',record,privateSupplierDocument:true,name:'synthetic-purse-6307.txt',mediaType:'text/plain',base64:Buffer.from(bytes).toString('base64')},buyer);
        const file=await upload();
        const document=await h.command('supplier-document',{supplier:supplier.id,type:'w9',attachment:file.id,expires:'2099-12-31',required:false,reminderDays:[],version:0},buyer);
        const view=async(id=supplier.id)=>(await h.state()).data.supplierTax.find(row=>row.supplier===id);
        const input=async(changes={},id=supplier.id)=>{const v=await view(id),source=v.evidence.find(row=>row.available);return {supplier:id,version:v.version,basis:v.basis,document:source.document,documentVersion:source.documentVersion,attachment:source.attachment,sha256:source.sha256,reviewed:true,eligibility:'eligible',box:'NEC-1',backupWithholding:'not-required',reason:'synthetic-purse-6308 human source review',...changes};};
        return {h,buyer,requester,auditor,supplier,document,file,original,upload,view,input};
    } catch(error) {await h.close();throw error;}
}
