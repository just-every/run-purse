import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
import {harness} from './purse-harness.mjs';
import {legacyHistoryFixture,nativeEvidenceProof} from './invoice-history-fixture.mjs';
const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE||'@playwright/test');
const widths=process.argv.find(v=>v.startsWith('--width='))?[Number(process.argv.find(v=>v.startsWith('--width=')).slice(8))]:[1440,390];
const evidence=resolve(process.env.PURSE_EVIDENCE||'.cache/evidence-history');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--use-mock-keychain','--password-store=basic']});
try{for(const width of widths){
 const h=await harness({protectedKey:createHash('sha256').update('synthetic-purse-1').digest('hex')});let context;
 try{
  const f=await legacyHistoryFixture(h);context=await browser.newContext({viewport:{width,height:1000}});const[name,value]=h.owner.split('=');await context.addCookies([{name,value,url:h.origin}]);
  await context.route(h.origin+'/**',async route=>{const path=new URL(route.request().url()).pathname;
   if(path==='/app')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/rer-theme.css"><link rel="stylesheet" href="/purse.css"></head><body><div id="root"></div><script type="module" src="/test-app.js"></script></body></html>'});
   if(path==='/test-app.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
   if(['/rer-theme.css','/purse.css'].includes(path)||/^\/(fonts|brand)\/[a-zA-Z0-9./_-]+$/.test(path)&&!path.includes('..'))return route.fulfill({body:await readFile('public'+path),contentType:({css:'text/css',woff2:'font/woff2',svg:'image/svg+xml'})[path.split('.').pop()]||'application/octet-stream'});
   return route.continue();
  });
  const page=await context.newPage(),failures=[];page.on('pageerror',e=>failures.push(e.message));
  await page.goto(h.origin+'/app?tab=Settings');const migration=page.getByRole('region',{name:'Invoice evidence history',exact:true});await migration.getByText('5 legacy invoices awaiting migration.').waitFor();
  await migration.getByRole('button',{name:'Check legacy evidence',exact:true}).click();await migration.getByText('attested-at-migration: 2 · unavailable-source: 2 · did-not-verify: 1',{exact:true}).waitFor();await migration.screenshot({path:join(evidence,`SECURITY-001-migration-${width}.png`)});
  async function open(order){await page.goto(h.origin+'/app?tab=Orders');await page.getByRole('row').filter({has:page.getByText(order.number,{exact:true})}).getByRole('button',{name:'Open order'}).click();}
  for(const order of f.orders){await open(order);for(const invoice of f.invoices.filter(i=>i.order===order.id)){const section=page.getByRole('region',{name:'Evidence history '+invoice.reference,exact:true});await section.waitFor();await section.screenshot({path:join(evidence,`SECURITY-001-${invoice.reference.replaceAll(' ','-')}-${width}.png`)});}}
  await nativeEvidenceProof(h);await open(f.orders[0]);const section=page.getByRole('region',{name:'Evidence history Original input unavailable',exact:true});
  async function verify(account){for(const[label,v]of [['Original routing number',f.remit.bankRouting],['Original bank account',account],['Private re-entry reason','Supplier source check'],['Private source reference','External original receipt']])await section.getByLabel(label,{exact:true}).fill(v);await section.getByRole('button',{name:'Verify original evidence',exact:true}).click();}
  await verify('736290184652');await section.getByText('Legacy evidence did not verify.',{exact:true}).waitFor();await section.screenshot({path:join(evidence,`SECURITY-001-reentry-mismatch-${width}.png`)});
  await verify(f.remit.bankAccount);await section.getByText(/Verified by owner re-entry on/).waitFor();assert.equal(await section.locator('input[name=bankAccount]').inputValue(),'');await section.screenshot({path:join(evidence,`SECURITY-001-reentry-checked-${width}.png`)});
  assert.ok(!(await page.locator('body').innerText()).includes(f.remit.bankAccount));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(failures,[]);
 }finally{await context?.close();await h.close();}
}}finally{await browser.close();}
console.log('Evidence migration and re-entry web path passed at '+widths.join('/'));
