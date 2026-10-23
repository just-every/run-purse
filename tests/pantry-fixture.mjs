import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {harness} from './purse-harness.mjs';

export async function pantryFixture() {
 assert.ok(process.env.PANTRY_CHECKOUT,'PANTRY_CHECKOUT must name an installed real Pantry checkout');
 const child=fork(fileURLToPath(new URL('./pantry-native.mjs',import.meta.url)),[],{stdio:['ignore','pipe','pipe','ipc']});
 let errors='';child.stderr.on('data',data=>errors+=data);child.stdout.resume();
 const ready=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('exit',code=>reject(new Error('Pantry native worker exited '+code+': '+errors)));});
 const pending=new Map();let sequence=0;
 child.on('message',message=>{const waiter=pending.get(message.id);if(waiter){pending.delete(message.id);message.error?waiter.reject(new Error(message.error)):waiter.resolve(message.result);}});
 const command=(action,input={})=>new Promise((resolve,reject)=>{const id='operation-'+(++sequence);pending.set(id,{resolve,reject});child.send({...input,action,id});});
 const h=await harness({protectedKey:'a'.repeat(64),mailRequest:request=>new URL(request.url).origin===ready.origin?fetch(request):undefined});
 try {
 const cmd=h.command;
 await cmd('business',{name:'North Ridge Field Services',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Safety']});
 const requester=await h.member('synthetic-purse-840@example.test',['requester']),approver=await h.member('synthetic-purse-841@example.test',['approver']);
 const supplier=await cmd('supplier',{name:'Canyon Safety Equipment',status:'preferred',reason:'Reviewed field supplier'});
 await cmd('policy',{name:'Field safety',currency:'USD',category:'Safety',project:'Safety',approver:'synthetic-purse-841@example.test',limitMinor:100000,budgetMinor:1000000});
 const r=await cmd('request',{title:'Field harness replenishment',supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Fall-arrest harness',quantity:'2',unitMinor:12500,category:'Safety',project:'Safety'}]},requester);
 await cmd('submit',{id:r.id,revision:1},requester);await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Reviewed field requirement'},approver);
 const order=await cmd('convert',{id:r.id,revision:1});await cmd('issue',{id:order.id,revision:1,reason:'Issued in existing channel'});
 await cmd('receipt',{order:order.id,line:order.lines[0].id,quantity:'2',event:'receive',reason:'Denver stores receiving'});
 const invoice=await cmd('invoice',{order:order.id,reference:'FIELD-840',source:'Supplier invoice',allocations:[{line:order.lines[0].id,quantity:'2',amountMinor:25000}]});
 const terms=await cmd('payable-terms',{invoice:invoice.id,version:0,invoiceDate:'2026-10-23',term:'2/10 Net 30',reason:'Confirmed supplier terms'});
 const payable=await cmd('approve-payable',{invoice:invoice.id,version:terms.version,reason:'Reviewed for cash planning'});
 const call=async(path,body,cookie=h.owner,status=200)=>{const r=await h.send('/api/purse/pantry'+path,body,cookie);assert.equal(r.status,status,JSON.stringify(r.value));return r.value;};
 return {h,ready,command,requester,approver,supplier,order,invoice,payable,call,input:{invoice:invoice.id,payableVersion:payable.version,accountId:ready.accountId},async close(){await h.close();child.send({action:'close'});await new Promise(resolve=>child.once('exit',resolve));}};
 } catch(error){await h.close();if(child.connected){child.send({action:'close'});await new Promise(resolve=>child.once('exit',resolve));}throw error;}
}
