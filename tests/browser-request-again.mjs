// The shipped purchasing App and native Worker/auth are real. Only static asset
// delivery and outbound provider network edges use the existing test harness.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { harness } from './purse-harness.mjs';

const widthArg=process.argv.find(arg=>arg.startsWith('--width='));
const widths=widthArg?[Number(widthArg.slice(8))]:[1440,390];
assert.ok(widths.every(width=>[1440,390].includes(width)));
const evidence=resolve(process.env.PURSE_EVIDENCE??'.cache/purse-browser-proof');
await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react'; import {createRoot} from 'react-dom/client'; import {App} from './src/ui/app'; createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const h=await harness();let browser;
try {
 const cmd=h.command;
 await cmd('business',{name:'Canyon Procurement',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Office']});
 const approver=await h.member('approver@example.test',['approver']);
 await cmd('policy',{name:'Current office authority',currency:'USD',category:'*',project:'*',approver:'approver@example.test',limitMinor:1000000,budgetMinor:5000000});
 browser=await chromium.launch({headless:true,...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--use-mock-keychain','--password-store=basic']});
 async function context(cookie,width) {
  const context=await browser.newContext({viewport:{width,height:1000}}),[name,value]=cookie.split('=');
  await context.addCookies([{name,value,url:h.origin}]);
  await context.route(h.origin+'/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/app')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/rer-theme.css"><link rel="stylesheet" href="/purse.css"></head><body><div id="root"></div><script type="module" src="/test-app.js"></script></body></html>'});
   if(path==='/test-app.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
   if(['/rer-theme.css','/purse.css'].includes(path)||/^\/(fonts|brand)\/[a-zA-Z0-9./_-]+$/.test(path)&&!path.includes('..')){
    const types={css:'text/css',woff2:'font/woff2',svg:'image/svg+xml',png:'image/png',ico:'image/x-icon'};
    return route.fulfill({contentType:types[path.split('.').pop()]??'application/octet-stream',body:await readFile('public'+path)});
   }
   return route.continue();
  });return context;
 }
 for(const width of widths){
  const requester=await h.member('requester-'+width+'@example.test',['requester']);
  const supplier=await cmd('supplier',{name:'Stationery '+width,status:'preferred',reason:'Fixture reviewed supplier'});
  const items=[];for(const [index,unitMinor]of [1000,2000,3000].entries())items.push(await cmd('catalogue',{description:['Paper','Envelopes','Restricted stationery'][index]+' '+width,supplier:supplier.id,currency:'USD',unitMinor,category:'Office',project:'Office',approved:true}));
  const source=await cmd('request',{title:'Last month stationery '+width,supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:items.map(item=>({catalogue:item.id,quantity:'3',project:'Office'}))},requester);
  for(const name of ['specification.txt','unchecked.txt'])await cmd('attachment',{kind:'request',record:source.id,name,mediaType:'text/plain',base64:Buffer.from('Exact chosen source '+name+'\r\n').toString('base64')},requester);
  await cmd('submit',{id:source.id,revision:1},requester);await cmd('decision',{id:source.id,revision:1,decision:'approved',reason:'Prior approval'},approver);
  const order=await cmd('convert',{id:source.id,revision:1});await cmd('issue',{id:order.id,revision:1,reason:'Prior issued document'});
  await cmd('catalogue',{...items[0],unitMinor:1500});await cmd('catalogue',{...items[2],access:{departments:['Restricted']}});
  let active=await context(requester,width),page=await active.newPage();const failures=[];page.on('pageerror',e=>failures.push(e.message));
  try{
   await page.goto(h.origin+'/app?tab=Requests&request='+source.id);
   await page.getByText('Request again',{exact:true}).click();
   const response=page.waitForResponse(r=>r.url().endsWith('/command/request-again-preview'));
   await page.getByRole('button',{name:'Review copy',exact:true}).click();assert.equal((await response).status(),200);
   const review=page.getByRole('region',{name:'Copy review',exact:true});
   await review.getByText('Paper '+width+' · Unit price changed from $10.00 to $15.00',{exact:true}).waitFor();
   await review.getByText('Restricted stationery '+width+' · Catalog item is unavailable for this requester, supplier or currency; line left out',{exact:true}).waitFor();
   assert.equal(await review.getByLabel('Description',{exact:true}).count(),2);
   assert.equal(await review.getByLabel('Project',{exact:true}).first().inputValue(),'Office');
   for(const checkbox of await review.getByRole('checkbox').all())assert.equal(await checkbox.isChecked(),false,'INTAKE-001 no files are selected by default');
   await review.getByRole('checkbox',{name:'specification.txt · 39 bytes',exact:true}).check();
   await review.getByLabel('Request title',{exact:true}).fill('Reordered supplies '+width);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'INTAKE-001 copy review fits '+width);
   await page.screenshot({path:join(evidence,`INTAKE-001-copy-review-${width}.png`),fullPage:true});
   const saved=page.waitForResponse(r=>r.url().endsWith('/command/request-again'));await review.getByRole('button',{name:'Save copied draft',exact:true}).click();const result=await saved;assert.equal(result.status(),200,await result.text());const copy=await result.json();
   await page.getByRole('link',{name:'Open the new draft',exact:true}).waitFor();
   assert.equal(copy.status,'draft');assert.equal(copy.policy,null);assert.equal(copy.lines.length,2);assert.equal(copy.totalMinor,10500);
   await active.close();active=undefined;
   // Close the tab and sign in natively from a separate browser context/device.
   const login=await h.send('/auth/magic-link',{email:'requester-'+width+'@example.test'});assert.equal(login.status,202);
   const message=[...h.messages].reverse().find(m=>m.to.includes('requester-'+width+'@example.test'));const token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');const confirmed=await h.send('/auth/confirm',{token});assert.equal(confirmed.status,303);
   active=await context(confirmed.cookie,width);page=await active.newPage();page.on('pageerror',e=>failures.push(e.message));
   await page.goto(h.origin+'/app?tab=Requests&request='+copy.id);
   await page.getByRole('heading',{name:'Reordered supplies '+width+' · revision 1',exact:true}).waitFor();
   const file=page.getByRole('link',{name:'specification.txt',exact:true});await file.waitFor();assert.equal(await page.getByRole('link',{name:'unchecked.txt',exact:true}).count(),0);
   const downloaded=await active.request.get(h.origin+await file.getAttribute('href'));assert.equal(await downloaded.text(),'Exact chosen source specification.txt\r\n');
   const state=await h.state(confirmed.cookie);assert.equal(state.data.request.find(r=>r.id===copy.id).status,'draft');assert.ok(!state.data.decision.some(d=>d.request===copy.id));assert.ok(!state.data.order.some(o=>o.request===copy.id));assert.ok(!state.data.commitment.some(c=>c.request===copy.id));
   await page.screenshot({path:join(evidence,`INTAKE-001-restored-draft-${width}.png`),fullPage:true});
   const submitting=page.waitForResponse(r=>r.url().endsWith('/command/submit'));await page.getByRole('button',{name:'Submit for approval',exact:true}).click();assert.equal((await submitting).status(),200);assert.equal((await h.state(confirmed.cookie)).data.request.find(r=>r.id===copy.id).status,'pending');
   // The PO door uses the same review and current requester eligibility.
   await page.goto(h.origin+'/app?tab=Orders');
   await page.getByRole('row').filter({has:page.getByText(order.number,{exact:true})}).getByRole('button',{name:'Open order',exact:true}).click();
   await page.getByText('Request again',{exact:true}).click();await page.getByRole('button',{name:'Review copy',exact:true}).click();
   await page.getByRole('region',{name:'Copy review',exact:true}).getByText('Paper '+width+' · Unit price changed from $10.00 to $15.00',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'INTAKE-001 PO copy fits '+width);
   await page.screenshot({path:join(evidence,`INTAKE-001-po-copy-${width}.png`),fullPage:true});
   assert.deepEqual(failures,[]);
  }catch(error){await page.screenshot({path:join(evidence,`INTAKE-001-failure-${width}.png`),fullPage:true}).catch(()=>{});throw error;}finally{await active?.close();}
  console.log('INTAKE-001 actual App/native HTTP request/PO copy and second-device draft passed at '+width);
 }
}finally{await browser?.close();await h.close();}
