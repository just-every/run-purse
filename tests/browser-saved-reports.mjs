import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
import {nativeWebContext} from './native-web-fixture.mjs';
import {savedReportFixture,reportMail} from './saved-report-fixture.mjs';
import {assertDownloads,assertNativeReport} from './saved-report-proof.mjs';
const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE||'@playwright/test');
const evidence=resolve(process.env.PURSE_EVIDENCE||'.cache/saved-reports');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
const f=await savedReportFixture();let context;
try {
 context=await nativeWebContext(browser,f.h,1440,bundle.outputFiles[0].text,f.finance);const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(f.h.origin+'/app?tab=Reports');await page.getByLabel('Group by',{exact:true}).selectOption('glAccount');
 const filtered=page.waitForResponse(response=>response.url().includes('/spend-report?')&&response.status()===200);await page.getByRole('button',{name:'Filter spend',exact:true}).click();assertNativeReport(await (await filtered).json(),f);
 const views=page.getByRole('region',{name:'Saved report views'});await views.getByLabel('View name',{exact:true}).fill('Quarterly coding');const saving=page.waitForResponse(response=>response.url().endsWith('/saved-reports')&&response.request().method()==='POST');await views.getByRole('button',{name:'Save current view',exact:true}).click();const saved=await saving;assert.equal(saved.status(),200);const definition=await saved.json();await views.getByRole('link',{name:'Download XLSX',exact:true}).waitFor();
 await page.reload();await views.getByLabel('Saved view',{exact:true}).selectOption(definition.id);const opening=page.waitForResponse(response=>response.url().endsWith('/'+definition.id+'/view'));await views.getByRole('button',{name:'Open saved view',exact:true}).click();const report=(await (await opening).json()).report;assertNativeReport(report,f);assert.equal(await page.getByLabel('Group by',{exact:true}).inputValue(),'glAccount');
 async function download(name) { const pending=page.waitForEvent('download');await views.getByRole('link',{name,exact:true}).click();const download=await pending;return readFile(await download.path()); }
 const csv=await download('Download CSV'),xlsx=await download('Download XLSX');await assertDownloads(csv.toString(),xlsx,report,f);
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});await views.getByRole('link',{name:'Download XLSX',exact:true}).scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Saved report fits '+width);
  const icons=await page.locator('button').evaluateAll(buttons=>buttons.filter(button=>!button.textContent.trim()).map(button=>({name:button.getAttribute('aria-label'),tooltip:button.getAttribute('aria-describedby')})));assert.ok(icons.every(icon=>icon.name&&icon.tooltip));
  const small=await views.locator('input,select,button,a,p').evaluateAll(elements=>elements.filter(element=>parseFloat(getComputedStyle(element).fontSize)<13).map(element=>element.tagName));assert.deepEqual(small,[]);
  await page.screenshot({path:join(evidence,'REPORT-002-saved-view-'+width+'.png'),fullPage:true});
 }
 // A stale page's original links cannot bypass a changed grant.
 await f.cmd('member',{email:reportMail(4101),name:'Report access revoked',active:true,roles:['receiver']});
 for(const format of ['view','csv','xlsx']){const response=await context.request.get(f.h.origin+'/api/purse/saved-reports/'+definition.id+'/'+format);assert.equal(response.status(),403);assert.equal(response.headers()['cache-control'],'no-store');}
 assert.deepEqual(errors,[]);console.log('Saved report public web door: filters, reopening, independent CSV and parsed XLSX, scope refusal; screens 1440 and 390 passed');
} finally {await context?.close();await f.close();await browser.close();}
