import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
import {nativeWebContext} from './native-web-fixture.mjs';
import {pantryFixture} from './pantry-fixture.mjs';
const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE||'@playwright/test');
const evidence=resolve(process.env.PURSE_EVIDENCE||'.cache/pantry-browser');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
try {for(const width of [1440,390]) {
 const f=await pantryFixture();let context;
 try {
  context=await nativeWebContext(browser,f.h,width,bundle.outputFiles[0].text);const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(f.h.origin+'/app?tab=Settings');const panel=page.getByRole('region',{name:'Pantry connection',exact:true});
  const snap=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Settings fits '+width);assert.ok(!(await panel.innerText()).includes(f.ready.token));const icons=await page.locator('button').evaluateAll(buttons=>buttons.filter(b=>!b.innerText.trim()).map(b=>({label:b.getAttribute('aria-label'),tooltip:b.getAttribute('aria-describedby')})));assert.ok(icons.every(b=>b.label&&b.tooltip),'Every icon-only control has a tooltip');await panel.screenshot({path:join(evidence,`SYNC-004-${name}-${width}.png`)});};
  await panel.getByLabel('Pantry origin',{exact:true}).fill(f.ready.origin);await panel.getByLabel('New Pantry credential',{exact:true}).fill(f.ready.token);await panel.getByRole('checkbox',{name:'I checked this Pantry installation and its book currency, and authorize this connection.'}).check();
  const connected=page.waitForResponse(r=>r.url().endsWith('/api/purse/pantry/connection')&&r.request().method()==='POST');await panel.getByRole('button',{name:'Connect Pantry',exact:true}).click();assert.equal((await connected).status(),200);await panel.getByRole('button',{name:'Replace Pantry credential',exact:true}).waitFor();assert.equal(await panel.getByLabel('New Pantry credential',{exact:true}).inputValue(),'');await snap('connected');
  const mappings=page.waitForResponse(r=>r.url().endsWith('/pantry/options'));await panel.getByRole('button',{name:'Load Pantry mappings',exact:true}).click();assert.equal((await mappings).status(),200);
  await panel.getByLabel('Approved native bill',{exact:true}).selectOption(f.invoice.id);await panel.getByLabel('Pantry expense account',{exact:true}).selectOption(f.ready.accountId);await panel.getByRole('button',{name:'Preview Pantry bill',exact:true}).click();await panel.getByRole('heading',{name:'Review exact Pantry posting',exact:true}).waitFor();await snap('preview');
  const review=panel.getByLabel('Exact Pantry bill preview',{exact:true});await review.getByLabel('Posting approval reason',{exact:true}).fill('Reviewed field equipment invoice and exact accounting mapping');await review.getByRole('checkbox').check();
  const posted=page.waitForResponse(r=>r.url().endsWith('/pantry/sync'));await review.getByRole('button',{name:'Approve and sync exact bill',exact:true}).click();assert.equal((await posted).status(),200);const sync=(await (await f.h.send('/api/purse/pantry',undefined,f.h.owner)).value).syncs[0];
  const row=panel.getByRole('row').filter({hasText:'FIELD-840'});await row.getByRole('cell').filter({hasText:/^unpaid/}).waitFor();await snap('synced');
  await f.command('pay',{vendorId:sync.externalVendorId,billId:sync.externalId,amount:'250.00'});
  const returned=page.waitForResponse(r=>r.url().endsWith('/pantry/refresh'));await row.getByRole('button',{name:'Refresh payment status',exact:true}).click();assert.equal((await returned).status(),200);await row.getByRole('cell').filter({hasText:/^paid/}).waitFor();assert.equal(await row.getByRole('link',{name:'Open Pantry bill',exact:true}).getAttribute('href'),sync.url);await snap('paid');
  const data=(await f.h.state()).data;assert.equal(data.cashRequirements.bills.length,0);assert.equal(data.invoice.find(i=>i.id===f.invoice.id).pantry.paymentStatus,'paid');assert.equal((await f.command('snapshot')).bills.length,1);
  const revoked=page.waitForResponse(r=>r.url().endsWith('/connection/revoke'));await panel.getByRole('button',{name:'Revoke Pantry connection',exact:true}).click();assert.equal((await revoked).status(),200);await panel.getByText(/Revoked/).waitFor();assert.equal(await row.getByRole('button',{name:'Refresh payment status',exact:true}).isDisabled(),true);await snap('revoked');
  const deleted=page.waitForResponse(r=>r.url().endsWith('/connection/delete'));await panel.getByRole('button',{name:'Delete Pantry credential',exact:true}).click();assert.equal((await deleted).status(),200);await panel.getByRole('button',{name:'Connect Pantry',exact:true}).waitFor();await snap('deleted');assert.deepEqual(errors,[]);
  console.log('SYNC-004 real Pantry Settings/post/payment-return web passed at '+width+'; Pantry '+f.ready.head);
 }finally{await context?.close();await f.close();}
}}finally{await browser.close();}
