import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {legacyHash} from '../scripts/installer/invoice-evidence-crypto.mjs';
export async function legacyHistoryFixture(h) {
 await h.command('business',{name:'Canyon Field Services',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Safety']});
 const requester=await h.member('requester@example.test',['requester']),approver=await h.member('approver@example.test',['approver']),buyer=await h.member('buyer@example.test',['buyer']);
 await h.command('policy',{name:'Safety supplies',currency:'USD',category:'*',project:'*',approver:'approver@example.test',limitMinor:1000000,budgetMinor:1000000});
 const bankRouting='021000021',bankAccount='736290184652',mismatch='836290184653';
 async function purchase(name,matching){
  const supplier=await h.command('supplier',{name,status:'active',reason:'Supplier purchasing history',...(matching?{matching:{bankRouting,bankAccount}}:{})});
  const r=await h.command('request',{title:name+' safety kits',supplier:supplier.id,currency:'USD',needDate:'2026-11-30',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Safety kit',quantity:'10',unitMinor:1000,category:'Equipment',project:'Safety'}]},requester);
  await h.command('submit',{id:r.id,revision:1},requester);await h.command('decision',{id:r.id,revision:1,decision:'approved',reason:'Safety budget'},approver);const order=await h.command('convert',{id:r.id,revision:1},buyer);await h.command('issue',{id:order.id,revision:1,reason:'Supplier terms checked'},buyer);return {supplier,order};
 }
 const a=await purchase('Canyon Safety Supply',true),b=await purchase('New Field Supply',false),invoices=[];
 for(const [reference,order,remit]of [['No bank input',a.order,null],['Matching baseline',a.order,{bankRouting,bankAccount}],['Original input unavailable',a.order,{bankRouting,bankAccount:mismatch}],['Missing bank baseline',b.order,{bankRouting,bankAccount}],['Hash did not verify',a.order,null]]){
  const i=await h.command('invoice',{order:order.id,reference,source:'Supplier original retained externally',invoiceDate:'2026-10-21',...(remit?{remit}:{}),allocations:[{line:order.lines[0].id,quantity:'1',amountMinor:1000}]},buyer);invoices.push({...i,remitInput:remit});
 }
 const root=JSON.parse((await h.db.prepare("SELECT value FROM p_records WHERE kind='supplierMatchingKey'").first()).value).secret;
 for(const input of invoices){const row=await h.db.prepare("SELECT value FROM p_records WHERE kind='invoice' AND id=?").bind(input.id).first(),i=JSON.parse(row.value);const bank=input.remitInput?createHmac('sha256',Buffer.from(root,'hex')).update('bank:'+input.remitInput.bankRouting+':'+input.remitInput.bankAccount).digest('hex'):null;delete i.evidence;i.evidenceHash=input.reference==='Hash did not verify'?'0'.repeat(64):legacyHash(root,i,bank);await h.db.prepare("UPDATE p_records SET value=? WHERE kind='invoice' AND id=?").bind(JSON.stringify(i),i.id).run();}
 return {buyer,requester,approver,orders:[a.order,b.order],supplier:a.supplier,invoices,remit:{bankRouting,bankAccount:mismatch}};
}
export async function nativeEvidenceProof(h) {
 assert.equal((await h.send('/auth/step-up',{action:'export'},h.owner)).status,202);
 const message=[...h.messages].reverse().find(m=>m.to.includes('owner@example.test'));
 const token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');
 assert.equal((await h.send('/auth/confirm',{token},h.owner)).status,303);
}
