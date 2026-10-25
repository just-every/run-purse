import assert from 'node:assert/strict';
import {mkdir,rm,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {fresh,freePort,command,start} from './browser-runtime.mjs';
import {session,api,current} from './browser-journey.mjs';
import {blanketJourney} from './browser-blanket.mjs';
import {records,rows} from './browser-archive.mjs';

// A focused built-product/CLI continuation of the same journey run in Verify.
const selected=process.argv.find(arg=>arg.startsWith('--width='));
const widths=selected?[Number(selected.slice(8))]:[1440,390];
const evidence=resolve(process.env.PURSE_EVIDENCE??'.cache/po-kinds');
await mkdir(evidence,{recursive:true});
const root=await fresh();let restoredRoot,server,browser,owner;
const launch=()=>chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
try {
 await command(root,['install']);const port=await freePort();
 await command(root,['setup','--owner-email','owner@example.test','--port',String(port)]);
 server=await start(root,port);browser=await launch();owner=await session(browser,root,server.origin,'owner',1440);
 await api(owner.context,server.origin,'business',{name:'Canyon Field Services',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Site maintenance']});
 for(const role of ['requester','approver','buyer','receiver'])await api(owner.context,server.origin,'member',{email:role+'@dev.localhost',name:'Canyon '+role,roles:[role],active:true});
 for(const width of widths)await blanketJourney(browser,root,server.origin,width,evidence,{schedule:server.schedule});
 const before=(await current(owner.context,server.origin)).data;
 await owner.context.close();owner=undefined;await browser.close();browser=undefined;await server.close();server=undefined;
 await command(root,['export','--output','exports/po-kinds.rer']);
 const archive=join(evidence,'po-kinds.rer');await copyFile(join(root,'exports/po-kinds.rer'),archive);
 restoredRoot=await fresh();await command(restoredRoot,['install']);const restoredPort=await freePort();
 await command(restoredRoot,['setup','--owner-email','restored-owner@example.test','--port',String(restoredPort)]);
 await mkdir(join(restoredRoot,'exports'),{recursive:true});await copyFile(archive,join(restoredRoot,'exports/po-kinds.rer'));
 await command(restoredRoot,['import','--input','exports/po-kinds.rer','--journal','exports/po-kinds.rer','--yes']);
 await command(restoredRoot,['export','--output','exports/po-kinds-restored.rer']);
 const originalRows=rows(await records(archive)),restoredRows=rows(await records(join(restoredRoot,'exports/po-kinds-restored.rer')));
 for(const kind of ['blanketRelease','recurringSeries','recurringEvent','request','revision','decision','order','receipt','invoice','commitment']) {
  const source=all=>all.filter(r=>r.table==='p_records'&&r.row.kind===kind).map(r=>r.row).sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(source(restoredRows),source(originalRows),kind+' retains its exact portable source history');
 }
 server=await start(restoredRoot,restoredPort);browser=await launch();
 for(const width of widths) {
  owner=await session(browser,restoredRoot,server.origin,'owner',width);
  const after=(await current(owner.context,server.origin)).data;
  for(const order of before.order.filter(o=>o.lines.some(l=>l.service))) {
   const restored=after.order.find(o=>o.id===order.id);assert.ok(restored);
   assert.deepEqual(restored.positions,order.positions,'Restored service value balances remain exact');
  }
  const service=after.order.find(o=>o.lines.some(l=>l.service)&&o.positions.some(p=>p.acceptedMinor===400000));assert.ok(service);
  await owner.page.goto(server.origin+'/app?tab=Orders');
  await owner.page.getByRole('row').filter({has:owner.page.getByText(service.number,{exact:true})}).getByRole('button',{name:'Open order',exact:true}).click();
  await owner.page.getByRole('heading',{name:service.number+' · issued',exact:true}).waitFor();
  await owner.page.getByText('Exception · Invoice exceeds received service value',{exact:true}).waitFor();
  assert.equal(await owner.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await owner.page.screenshot({path:join(evidence,`PO-005-restored-service-${width}.png`),fullPage:true});
  await owner.context.close();owner=undefined;
 }
 console.log('PO-005 focused built product and actual archive continuation passed at '+widths.join('/'));
} finally {
 await owner?.context.close();await browser?.close();await server?.close();
 await rm(root,{recursive:true,force:true});if(restoredRoot)await rm(restoredRoot,{recursive:true,force:true});
}
