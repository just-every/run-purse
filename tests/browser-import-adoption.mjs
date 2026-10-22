import assert from 'node:assert/strict';
import {mkdir,rm,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {fresh,freePort,command,start} from './browser-runtime.mjs';
import {session,api,current} from './browser-journey.mjs';
import {orderAdoptionJourney,restoredOrderAdoption} from './browser-order-adoption.mjs';
import {records,rows} from './browser-archive.mjs';

const selected=process.argv.find(arg=>arg.startsWith('--width='));
const widths=selected?[Number(selected.slice(8))]:[1440,390];
const evidence=resolve(process.env.PURSE_EVIDENCE??'.cache/import-adoption');
await mkdir(evidence,{recursive:true});
const root=await fresh();let restoredRoot,server,browser,owner;
const launch=()=>chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
try {
 await command(root,['install']);const port=await freePort();
 await command(root,['setup','--owner-email','owner@example.test','--port',String(port)]);
 server=await start(root,port);browser=await launch();owner=await session(browser,root,server.origin,'owner',1440);
 await api(owner.context,server.origin,'business',{name:'Canyon Field Services',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Equipment']});
 for(const role of ['approver','receiver'])await api(owner.context,server.origin,'member',{email:role+'@dev.localhost',name:'Canyon '+role,roles:[role],active:true});
 for(const width of widths)await orderAdoptionJourney(browser,root,server.origin,width,evidence);
 const before=(await current(owner.context,server.origin)).data;
 await owner.context.close();owner=undefined;await browser.close();browser=undefined;await server.close();server=undefined;
 await command(root,['export','--output','exports/adopted.rer']);
 const archive=join(evidence,'adopted.rer');await copyFile(join(root,'exports/adopted.rer'),archive);
 restoredRoot=await fresh();await command(restoredRoot,['install']);const restoredPort=await freePort();
 await command(restoredRoot,['setup','--owner-email','restored-owner@example.test','--port',String(restoredPort)]);
 await mkdir(join(restoredRoot,'exports'),{recursive:true});await copyFile(archive,join(restoredRoot,'exports/adopted.rer'));
 await command(restoredRoot,['import','--input','exports/adopted.rer','--yes']);
 await command(restoredRoot,['export','--output','exports/restored.rer']);
 const source=rows(await records(archive)),restored=rows(await records(join(restoredRoot,'exports/restored.rer')));
 for(const kind of ['orderAdoption','request','revision','order','receipt','invoice','deposit','budget','commitment','payable']) {
  const values=all=>all.filter(r=>r.table==='p_records'&&r.row.kind===kind).map(r=>r.row).sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(values(restored),values(source),kind+' retains exact portable source history');
 }
 server=await start(restoredRoot,restoredPort);browser=await launch();owner=await session(browser,restoredRoot,server.origin,'owner',1440);
 const after=(await current(owner.context,server.origin)).data;
 await restoredOrderAdoption(owner.context,server.origin,before,after);
 for(const width of widths) {
  await owner.page.setViewportSize({width,height:1000});await owner.page.goto(server.origin+'/app?tab=Orders');
  const order=after.order.find(o=>o.status==='adopted');assert.ok(order);
  await owner.page.getByRole('row').filter({has:owner.page.getByText(order.number,{exact:true})}).getByRole('button',{name:'Open order',exact:true}).click();
  await owner.page.getByRole('heading',{name:'Adopted open purchase order',exact:true}).waitFor();
  assert.equal(await owner.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await owner.page.screenshot({path:join(evidence,`IMPORT-003-restored-${width}.png`),fullPage:true});
 }
 console.log('IMPORT-003 built product and CLI restore continuation passed at '+widths.join('/'));
} finally {
 await owner?.context.close();await browser?.close();await server?.close();
 await rm(root,{recursive:true,force:true});if(restoredRoot)await rm(restoredRoot,{recursive:true,force:true});
}
