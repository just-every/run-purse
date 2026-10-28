import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { nativeWebContext } from './native-web-fixture.mjs';
import { accrualFixture, accrualTimeline, accrualMail } from './accrual-fixture.mjs';
import { mainRow, assertAccrualDownloads } from './accrual-proof.mjs';
const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE||'@playwright/test');
const evidence=resolve(process.env.PURSE_EVIDENCE||'.cache/accrual-report');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
const f=await accrualFixture();let context;
try {
    await accrualTimeline(f);await f.advance('2026-08-03',true);
    context=await nativeWebContext(browser,f.h,1440,bundle.outputFiles[0].text,f.h.owner);const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(f.h.origin+'/app?tab=Reports');await page.getByRole('button',{name:'Received not billed',exact:true}).click();
    const region=page.getByRole('region',{name:'Received not billed report'});
    async function run(cutoff,expected) {
        await region.getByLabel('Period end',{exact:true}).fill(cutoff);const pending=page.waitForResponse(response=>response.url().includes('/accrual-report/view?')&&response.status()===200);await region.getByRole('button',{name:'Run accrual report',exact:true}).click();const report=await (await pending).json();assert.equal(mainRow(report,f.order).accrualMinor,expected);await region.getByRole('button',{name:'$'+(expected/100).toFixed(2),exact:true}).first().waitFor();return report;
    }
    await run('2026-06-30',60000);await run('2026-07-31',20000);
    await page.goto(f.h.origin+'/app?tab=Orders&receipt='+f.order.id);
    const receiving=page.locator('form').filter({has:page.getByRole('button',{name:'Record receiving event',exact:true})});
    await receiving.getByLabel('Effective received date',{exact:true}).waitFor();assert.equal(await receiving.getByLabel('Effective received date').inputValue(),'2026-08-03');
    await receiving.getByLabel('PO line',{exact:true}).selectOption(f.order.lines[0].id);await receiving.getByLabel('Event',{exact:true}).selectOption('receive');await receiving.getByLabel('Quantity',{exact:true}).fill('1');await receiving.getByLabel('Reason or service milestone',{exact:true}).fill('Late receiving evidence');
    await receiving.getByLabel('Effective received date',{exact:true}).fill('2026-06-26');
    const invalid=page.waitForResponse(response=>response.url().endsWith('/command/receipt'));await receiving.getByRole('button',{name:'Record receiving event',exact:true}).click();assert.equal((await invalid).status(),409);await receiving.getByRole('alert').waitFor();
    assert.equal(mainRow(await f.report('2026-06-30'),f.order).accrualMinor,60000,'Refused date changes nothing');
    await receiving.getByLabel('Effective received date',{exact:true}).fill('2026-06-29');const saved=page.waitForResponse(response=>response.url().endsWith('/command/receipt')&&response.status()===200);await receiving.getByRole('button',{name:'Record receiving event',exact:true}).click();await saved;
    await page.getByText('Late receiving evidence',{exact:false}).first().waitFor();
    for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:join(evidence,'REPORT-004-effective-receiving-'+width+'.png'),fullPage:true});}
    await page.goto(f.h.origin+'/app?tab=Reports');await page.getByRole('button',{name:'Received not billed',exact:true}).click();const report=await run('2026-06-30',70000);
    await region.getByRole('button',{name:'$700.00',exact:true}).first().click();const sources=page.getByRole('region',{name:'Accrual source records'});await sources.getByText('Late-entered',{exact:false}).waitFor();
    await sources.getByText('Bill synthetic-purse-4713',{exact:false}).waitFor();await sources.getByText('2026-06-29',{exact:false}).waitFor();
    async function download(name){const pending=page.waitForEvent('download');await region.getByRole('link',{name,exact:true}).click();return readFile(await (await pending).path());}
    await assertAccrualDownloads((await download('Download accrual CSV')).toString(),await download('Download accrual XLSX'),report);
    await region.getByText('Xero journal file',{exact:true}).click();await region.getByLabel('Journal currency').selectOption('USD');await region.getByLabel('Accrued liabilities account').fill('2100');
    const journalDownload=page.waitForEvent('download');await region.getByRole('button',{name:'Download Xero journal',exact:true}).click();const journal=(await readFile(await (await journalDownload).path())).toString();assert.ok(journal.includes('700'));assert.ok(journal.includes('-700'));
    for(const width of [1440,390]) {
        await page.setViewportSize({width,height:1000});await sources.scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Report fits '+width);
        const tiny=await region.locator('input,select,button,a,p').evaluateAll(elements=>elements.filter(element=>parseFloat(getComputedStyle(element).fontSize)<13).map(element=>element.tagName));assert.deepEqual(tiny,[]);
        const icons=await page.locator('button').evaluateAll(elements=>elements.filter(element=>!element.textContent.trim()).map(element=>[element.getAttribute('aria-label'),element.getAttribute('aria-describedby')]));assert.ok(icons.every(([label,tip])=>label&&tip));
        await page.screenshot({path:join(evidence,'REPORT-004-accrual-sources-'+width+'.png'),fullPage:true});
    }
    const controller=await nativeWebContext(browser,f.h,1440,bundle.outputFiles[0].text,f.people.finance);
    try {
        await f.cmd('member',{email:accrualMail(4703),name:'Revoked controller',active:true,roles:['receiver']});
        for(const format of ['view','csv','xlsx','xero']){const result=await controller.request.get(f.h.origin+'/api/purse/accrual-report/'+format+'?cutoff=2026-06-30&currency=USD&liabilityAccount=2100');assert.equal(result.status(),403);assert.equal(result.headers()['cache-control'],'no-store');}
    } finally {await controller.close();}
    assert.deepEqual(errors,[]);console.log('Native accrual browser journey: June 600, July 200, late June 700, effective-date refusal, parsed exports and revoked downloads passed; screens 1440 and 390');
} finally {await context?.close();await f.close();await browser.close();}
