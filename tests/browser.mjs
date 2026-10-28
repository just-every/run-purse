// A whole request-to-invoice journey on the shared emitted build. One phone smoke.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {emittedWorker} from './emitted-worker.mjs';
import {session,api,journey} from './browser-journey.mjs';
const width=Number(process.argv.find(x=>x.startsWith('--width='))?.slice(8)??1440);
const evidence=resolve(process.env.PURSE_EVIDENCE??'.cache/browser-proof');await mkdir(evidence,{recursive:true});
const worker=await emittedWorker();let browser;
try{
 const healthy=await worker.call('/health');assert.equal(healthy.status,200);const health=await healthy.json();assert.equal(health.ok,true);assert.equal(health.status,'ok');assert.ok(health.deployment);
 for(const route of ['/missing','/health/extra','/api','/api/missing'])assert.equal((await worker.call(route)).status,404,route);
 assert.equal((await worker.call('/api/purse/state')).status,401);
 browser=await chromium.launch({headless:true,executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 const owner=await session(browser,worker,worker.origin,'owner',width);
 await api(owner.context,worker.origin,'business',{name:'Fixture purchasing business',currencies:['AUD','USD'],locations:['Brisbane'],costCentres:['Operations'],projects:['Fitout']});
 for(const role of ['requester','approver','buyer','receiver'])await worker.member(role);
 // Reviewed move-in avoids an external screening provider in the web smoke.
 const csv='kind,sourceId,name,status\nsupplier,web-supplier,Fixture office supplier,active\n';
 const input={csv,filename:'supplier.csv',mapping:{columns:{},decimal:'.',date:'YYYY-MM-DD',statuses:{active:'active'}}};
 let response=await owner.context.request.post(worker.origin+'/api/purse/import/preview',{headers:{origin:worker.origin},data:input});assert.equal(response.status(),200);const preview=await response.json();
 response=await owner.context.request.post(worker.origin+'/api/purse/import/commit',{headers:{origin:worker.origin},data:{...input,fingerprint:preview.plan.fingerprint}});assert.equal(response.status(),200,await response.text());
 const supplier=(await (await owner.context.request.get(worker.origin+'/api/purse/state')).json()).data.supplier.find(s=>s.sourceId==='web-supplier');assert.ok(supplier);await api(owner.context,worker.origin,'screen-supplier',{id:supplier.id});
 await api(owner.context,worker.origin,'policy',{name:'Equipment authority',currency:'AUD',category:'Equipment',project:'Fitout',approver:'approver@dev.localhost',limitMinor:1000000,budgetMinor:5000000});
 await owner.context.close();await journey(browser,worker,worker.origin,width,evidence,{supplier});
 // Sign-out invalidates the native session at the public API, not just the UI.
 response=await worker.call('/auth/signout',{},worker.sessions.requester);assert.equal(response.status,204);
 assert.equal((await worker.call('/api/purse/state',undefined,worker.sessions.requester)).status,401);
 console.log(`Request, approval, numbered PO, original download, receiving, invoice and accounting export passed at ${width}px`);
}finally{await browser?.close();await worker.close();}
