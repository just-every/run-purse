import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createPortability} from '@runeditrun/rer/modules/portability';
import {exportArchive,importArchive} from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import {harness} from './purse-harness.mjs';
import {reauthenticateErasure} from './erasure-flow.mjs';

const yearsAgo=n=>{const d=new Date();d.setUTCFullYear(d.getUTCFullYear()-n);return d.toISOString().slice(0,10)};
const unverified='erasure history unverified: supply your latest archive as the journal';
/** Two suppliers with protected values: one paid this year, one last paid eight years ago with a W-9 original. */
export async function retentionFixture(h,{requester,approver,buyer}){
 const cmd=h.command,send=h.send;
 const purchase=async(name,invoiceDate,remit)=>{
  const supplier=await cmd('supplier',{name,status:'active',reason:'Reviewed',contacts:[]},buyer);
  const request=await cmd('request',{title:'Equipment from '+name,supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Equipment',quantity:'1',unitMinor:1000,category:'Equipment',project:'Equipment'}]},requester);
  await cmd('submit',{id:request.id,revision:1},requester);await cmd('decision',{id:request.id,revision:1,decision:'approved',reason:'Approved'},approver);
  const order=await cmd('convert',{id:request.id,revision:1},buyer);await cmd('issue',{id:order.id,revision:1,reason:'Issue'},buyer);
  const invoice=await cmd('invoice',{order:order.id,reference:name+'-invoice',source:'Invoice',invoiceDate,...(remit?{remit}:{}),allocations:[{line:order.lines[0].id,quantity:'1',amountMinor:1000}]},buyer);
  return {supplier,order,invoice};
 };
 const store=async(supplier,values)=>{const meta=(await send('/api/purse/supplier-protected/'+supplier.id,undefined,h.owner)).value;assert.equal((await send('/api/purse/supplier-protected/'+supplier.id+'/store',{revision:meta.revision,values,reason:'synthetic-purse-707',evidence:'synthetic-purse-708'},h.owner)).status,200)};
 const current=await purchase('synthetic-purse-709',yearsAgo(0));await store(current.supplier,{tin:'111223333'});
 const old=await purchase('synthetic-purse-710',yearsAgo(8),{bankRouting:'021000021',bankAccount:'736290184652'});await store(old.supplier,{tin:'987654321',bankAccount:'736290184652',bankRouting:'021000021'});
 const w9=await cmd('attachment',{kind:'supplier',record:old.supplier.id,privateSupplierDocument:true,name:'synthetic-purse-711.txt',mediaType:'text/plain',base64:Buffer.from('synthetic-purse-712 W-9').toString('base64')},buyer);
 await cmd('supplier-document',{supplier:old.supplier.id,type:'w9',attachment:w9.id,expires:'2030-01-01',required:false,reminderDays:[30],version:0},buyer);
 return {current,old,w9};
}
export async function retentionFlow(t){
 const h=await harness({protectedKey:createHash('sha256').update('synthetic-purse-701').digest('hex')});t.after(()=>h.close());const cmd=h.command,send=h.send;
 await cmd('business',{name:'synthetic-purse-702',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Equipment']});
 const requester=await h.member('synthetic-purse-703@example.test',['requester']),approver=await h.member('synthetic-purse-704@example.test',['approver']),buyer=await h.member('synthetic-purse-705@example.test',['buyer']),auditor=await h.member('synthetic-purse-706@example.test',['auditor']);
 await cmd('policy',{name:'Equipment',currency:'USD',category:'*',project:'*',approver:'synthetic-purse-704@example.test',limitMinor:100000,budgetMinor:1000000});
 const {current,old,w9}=await retentionFixture(h,{requester,approver,buyer});
 const read=async cookie=>{const r=await send('/api/purse/erasure',undefined,cookie);assert.equal(r.status,200,JSON.stringify(r.value));return r.value};
 const post=(op,body,cookie=h.owner)=>read(h.owner).then(m=>send('/api/purse/erasure/'+op,{revision:m.revision,...body},cookie));
 // Default seven whole years, counted from each supplier's latest supported payable.
 let meta=await read(h.owner);assert.equal(meta.retention.years,7);assert.equal(meta.retention.warning,null);
 assert.deepEqual(meta.retention.ready.map(r=>r.id).sort(),[`original:${w9.id}`,`protected:${old.supplier.id}:bankAccount`,`protected:${old.supplier.id}:bankRouting`,`protected:${old.supplier.id}:tin`].sort());
 assert.deepEqual(meta.retention.waiting.map(r=>r.id),[`protected:${current.supplier.id}:tin`],'A supplier paid this year is not ready');
 for(const secret of ['987654321','736290184652','021000021','111223333'])assert.ok(!JSON.stringify(meta).includes(secret),'The list holds no protected value');
 // Period: whole years, minimum one, with the IRS warning below seven that must be acknowledged.
 for(const years of [0,1.5,'7',100])assert.equal((await post('retention',{years})).status,400);
 assert.equal((await post('retention',{years:3})).status,400,'Below seven needs the acknowledged warning');
 const shorter=await post('retention',{years:3,warningAcknowledged:true});assert.equal(shorter.status,200,JSON.stringify(shorter.value));assert.match(shorter.value.retention.warning,/IRS Pub\. 583/);assert.ok(shorter.value.retention.ready.some(r=>r.id===`protected:${current.supplier.id}:tin`)===false,'A payable from this year stays inside three years');
 assert.equal((await post('retention',{years:7})).status,200);
 // Nothing is removed without consent, fresh native proof and the exact ready item.
 const ids=(await read(h.owner)).retention.ready.map(r=>r.id);
 assert.equal((await post('ready',{items:ids})).status,400);assert.equal((await post('ready',{items:ids,consent:true})).status,403,'Fresh native proof required');
 assert.equal((await post('ready',{items:[`protected:${current.supplier.id}:tin`],consent:true})).status,409,'A value inside its retention period cannot be erased');
 assert.equal((await send('/api/purse/protected-archive/export',undefined,h.owner)).status>=400,true);
 const before=(await h.state()).data,invoiceBefore=before.invoice.find(i=>i.id===old.invoice.id),rowsBefore=(await h.db.prepare('SELECT COUNT(*) AS n FROM p_supplier_protected').first()).n;assert.equal(rowsBefore,4);
 await reauthenticateErasure(h);
 const erased=await post('ready',{items:ids,consent:true});assert.equal(erased.status,200,JSON.stringify(erased.value));assert.equal(erased.value.subject,'retention');assert.equal(erased.value.phase,'complete');
 for(const secret of ['987654321','736290184652','021000021'])assert.ok(!JSON.stringify(erased.value).includes(secret));
 const remaining=(await h.db.prepare('SELECT supplier,field FROM p_supplier_protected').all()).results;assert.deepEqual(remaining,[{supplier:current.supplier.id,field:'tin'}],'Only the expired values were removed');
 const after=(await h.state()).data,invoiceAfter=after.invoice.find(i=>i.id===old.invoice.id);
 assert.equal(invoiceAfter.totalMinor,invoiceBefore.totalMinor);assert.equal(after.order.find(o=>o.id===old.order.id).totalMinor,before.order.find(o=>o.id===old.order.id).totalMinor);assert.equal(invoiceAfter.evidenceHash,invoiceBefore.evidenceHash);assert.equal(invoiceAfter.evidenceStatus.state,invoiceBefore.evidenceStatus.state);assert.match(invoiceAfter.evidenceStatus.label,/source values since erased/);assert.doesNotMatch(invoiceAfter.evidenceStatus.label,/did not verify/i);
 assert.equal(after.invoice.find(i=>i.id===current.invoice.id).evidenceStatus.label,before.invoice.find(i=>i.id===current.invoice.id).evidenceStatus.label);
 assert.equal((await send('/api/purse/download/attachment/'+w9.id,undefined,buyer)).status,410);
 const supplierMeta=(await send('/api/purse/supplier-protected/'+old.supplier.id,undefined,h.owner)).value;assert.deepEqual(supplierMeta.masks,{},'Erased values leave no mask to re-enter');
 assert.equal((await send('/api/purse/supplier-protected/'+old.supplier.id+'/reveal',{revision:supplierMeta.revision,field:'tin',reason:'synthetic-purse-713'},h.owner)).status>=400,true);
 meta=await read(h.owner);assert.ok(meta.receipts.some(r=>r.subject==='retention'&&r.id===erased.value.id));assert.deepEqual(meta.retention.ready,[]);
 const audit=(await send('/api/purse/audit?action=personal-data-erasure',undefined,h.owner)).value.events;assert.ok(audit.some(e=>e.record===erased.value.id&&e.subject==='retention'));
 // The erasure travels in the ordinary archive and an older copy cannot bring the values back.
 const service=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive=join(h.dir,'synthetic-purse-retention.rer');await exportArchive(service,archive,[]);
 const target=await harness({empty:true});t.after(()=>target.close());await importArchive(await createPortability({db:target.db,buckets:{ORIGINALS:target.originals},policy:portability}),archive,[]);
 const supplierRow=JSON.parse((await h.db.prepare("SELECT value FROM p_records WHERE kind='supplier' AND id=?").bind(old.supplier.id).first()).value);supplierRow.protectedOnFile.tin=true;await h.db.prepare("UPDATE p_records SET value=? WHERE kind='supplier' AND id=?").bind(JSON.stringify(supplierRow),old.supplier.id).run();
 const forged=join(h.dir,'synthetic-purse-retention-forged.rer');await exportArchive(service,forged,[]);const refused=await harness({empty:true});t.after(()=>refused.close());await assert.rejects(importArchive(await createPortability({db:refused.db,buckets:{ORIGINALS:refused.originals},policy:portability}),forged,[]),/erasure_resurrection/);
 // Buyer, auditor, integration token and agent are refused at every erasure door, each with one audit event.
 const issued=await send('/api/purse/integration-tokens',{name:'synthetic-purse-714',requesterEmail:'synthetic-purse-703@example.test'},h.owner);assert.equal(issued.status,200);
 const refusals=async()=>(await h.db.prepare("SELECT COUNT(*) AS n FROM p_records WHERE kind='audit' AND json_extract(value,'$.action')='erasure-refused'").first()).n;
 const doors=[['GET','read'],...['preview','execute','resume','retention','ready','history'].map(op=>['POST',op])];
 for(const [name,headers] of [['buyer',{cookie:buyer}],['auditor',{cookie:auditor}],['integration token',{authorization:'Bearer '+issued.value.token}]]){
  for(const [method,op] of doors){
   const was=await refusals(),revision=(await read(h.owner)).revision,path=method==='GET'?'/api/purse/erasure':'/api/purse/erasure/'+op;
   const response=await h.mf.dispatchFetch(h.origin+path,{method,headers:{origin:h.origin,'content-type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify({revision,kind:'member',id:'x',years:7,items:[],consent:true})})});
   assert.ok([401,403].includes(response.status),`${name} refused at ${op}: ${response.status}`);assert.equal(await refusals(),was+1,`${name} ${op}: one audit event`);
  }
 }
 const run=await cmd('prepare',{workflow:'intake',fields:{},references:[],draft:'Erase the former requester'});
 for(const action of ['erasure-execute','personal-data-erasure','erase-supplier-contact']){const was=await refusals();assert.equal((await send('/api/purse/command/propose-action',{run:run.id,action,input:{kind:'member',id:'x'}},h.owner)).status,403);assert.equal(await refusals(),was+1,'agent proposal: one audit event');}
 const events=(await send('/api/purse/audit?action=erasure-refused',undefined,h.owner)).value.events;assert.ok(events.length>=24&&events.every(e=>e.actor&&e.operation&&e.status));assert.ok(!JSON.stringify(events).includes(issued.value.token));
}
export async function restoreHoldFlow(t){
 const source=await harness();t.after(()=>source.close());
 await source.command('business',{name:'synthetic-purse-720',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Equipment']});
 const requester=await source.member('synthetic-purse-721@example.test',['requester']);void requester;
 const service=await createPortability({db:source.db,buckets:{ORIGINALS:source.originals},policy:portability}),archive=join(source.dir,'synthetic-purse-fresh.rer');await exportArchive(service,archive,[]);
 const fresh=await harness({empty:true});t.after(()=>fresh.close());
 const boot=await fresh.send('/auth/bootstrap',{token:'synthetic-local-test-bootstrap-token-0123456789',displayName:'Owner'});assert.equal(boot.status,303);const owner=boot.cookie;
 const target=await createPortability({db:fresh.db,buckets:{ORIGINALS:fresh.originals},policy:portability}),rows=async()=>(await fresh.db.prepare('SELECT COUNT(*) AS n FROM p_records').first()).n;
 const operator=process.env.PURSE_RESTORE_ACKNOWLEDGE;delete process.env.PURSE_RESTORE_ACKNOWLEDGE;t.after(()=>{process.env.PURSE_RESTORE_ACKNOWLEDGE=operator});
 // Held: no later journal and no acknowledgment, so nothing is restored.
 await assert.rejects(importArchive(target,archive,[]),/erasure_history_unacknowledged/);assert.equal(await rows(),0);
 // The current native owner acknowledges the exact limit with fresh proof; a buyer-grade or unproven attempt cannot.
 let meta=(await fresh.send('/api/purse/erasure',undefined,owner)).value;assert.equal(meta.history.state,'native');
 const ack=(body,cookie=owner)=>fresh.send('/api/purse/erasure/history',{revision:meta.revision,...body},cookie);
 assert.equal((await ack({acknowledgment:unverified})).status,403,'Fresh native proof required');
 await reauthenticateErasure(fresh,owner);
 assert.equal((await ack({acknowledgment:'yes'})).status,400);assert.equal((await ack({acknowledgment:unverified},'')).status,401);
 const acknowledged=await ack({acknowledgment:unverified});assert.equal(acknowledged.status,200,JSON.stringify(acknowledged.value));assert.equal(acknowledged.value.state,'acknowledged');
 assert.equal(await rows(),0,'The acknowledgment is not a business record, so the destination stays empty');
 await importArchive(target,archive,[]);assert.ok(await rows()>0);
 meta=(await fresh.send('/api/purse/erasure',undefined,owner)).value;
 assert.equal(meta.history.state,'unverified');assert.equal(meta.history.label,unverified);assert.equal(meta.history.journalSupplied,false);assert.equal(meta.history.acknowledgedBy,'owner@example.test');assert.ok(Date.parse(meta.history.archiveAt)<=Date.parse(meta.history.restoredAt));
 // A restore that supplies the latest archive as its journal needs no acknowledgment and says so.
 const journalled=await harness({empty:true});t.after(()=>journalled.close());process.env.PURSE_RESTORE_JOURNAL='supplied';t.after(()=>{delete process.env.PURSE_RESTORE_JOURNAL});
 await importArchive(await createPortability({db:journalled.db,buckets:{ORIGINALS:journalled.originals},policy:portability}),archive,[],archive);
 const row=await journalled.db.prepare("SELECT journal_supplied,acknowledged_at FROM p_restore_history WHERE id='main'").first();assert.deepEqual({...row},{journal_supplied:1,acknowledged_at:null});
 // The report stays inside this installation: the next archive excludes the table and carries none of its rows.
 const next=join(fresh.dir,'synthetic-purse-next.rer');await exportArchive(target,next,[]);const lines=(await readFile(next,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line));
 assert.ok(lines[0].excludedTables.includes('p_restore_history'));assert.ok(!lines.some(line=>line.items?.some(item=>item.table==='p_restore_history')));
}
