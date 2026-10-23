// A disposable real Pantry Worker. Secrets travel over the private child IPC channel, never argv/logs.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve(process.env.PANTRY_CHECKOUT);process.chdir(root);
const {harness,books}=await import(pathToFileURL(resolve(root,'tests/api/harness.mjs')).href);
const h=await harness();
try {
 const {acct}=await books(h),bank=await h.command('bank-account.save',{name:'North Ridge checking',institution:'Community Bank',accountId:acct['1000'],numberLast4:'4821',openingDate:'2026-10-01',openingBalance:'0.00'});
 const issue=()=>h.command('integration.create',{name:'Purse native connection',scopes:['contacts:write','bills:write','payments:read','post']});
 let credential=await issue();
 process.send({ready:true,origin:h.origin,token:credential.token,accountId:acct['6100'],head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()});
 await new Promise(resolve=>process.on('message',async message=>{
  try {
   let result;
   if(message.action==='pay')result=await h.command('payment.record',{direction:'paid',contactId:message.vendorId,date:'2026-10-23',amount:message.amount,method:'ach',bankAccountId:bank.id,allocations:[{targetId:message.billId,amount:message.amount}]});
   else if(message.action==='reverse')result=await h.command('journal.reverse',{id:message.journalId,date:'2026-10-24',memo:'Returned payment correction'});
   else if(message.action==='snapshot')result=await h.view('sales');
   else if(message.action==='rotate'){await h.command('integration.revoke',{id:credential.id});credential=await issue();result={token:credential.token};}
   else if(message.action==='close'){resolve();return;}
   else throw new Error('Unknown native Pantry test operation');
   process.send({id:message.id,result});
  }catch(error){process.send({id:message.id,error:error.message});}
 }));
} finally {await h.close();}
