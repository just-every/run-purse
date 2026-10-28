import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {nativeWebContext} from './native-web-fixture.mjs';
import {supplierTaxFixture} from './supplier-tax-fixture.mjs';

const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE||'@playwright/test');
const evidence=resolve(process.env.PURSE_EVIDENCE||'.cache/supplier-tax');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
const f=await supplierTaxFixture(),contexts=[];
try {
    const pages=[];
    for(const width of [1440,390]) {
        const context=await nativeWebContext(browser,f.h,width,bundle.outputFiles[0].text);contexts.push(context);
        const page=await context.newPage();await page.goto(f.h.origin+'/app?tab=Suppliers&supplier='+f.supplier.id);
        const panel=page.getByRole('region',{name:'Supplier tax review',exact:true});await panel.waitFor();pages.push({page,panel,width});
    }
    const {page,panel}=pages[0],errors=[];page.on('pageerror',error=>errors.push(error.message));
    assert.ok((await panel.innerText()).includes('Eligibility: unknown'));
    await panel.getByLabel('Select reviewed W-9',{exact:true}).selectOption(f.document.id);
    const original=await panel.getByRole('link',{name:'Download private W-9 original',exact:true}).getAttribute('href');
    const downloaded=await pages[0].page.context().request.get(f.h.origin+original);assert.equal(downloaded.status(),200);assert.equal(await downloaded.text(),f.original);
    await panel.getByText('Exact evidence binding',{exact:true}).click();assert.ok((await panel.innerText()).includes((await f.view()).evidence[0].sha256));
    await panel.getByLabel('1099 eligibility',{exact:true}).selectOption('eligible');await panel.getByLabel('Default 1099 box',{exact:true}).selectOption('NEC-1');await panel.getByLabel('Backup-withholding status',{exact:true}).selectOption('required');await panel.getByLabel('Review reason (no protected values)',{exact:true}).fill('synthetic-purse-6340 reviewed original');await panel.getByRole('checkbox').check();
    const saved=page.waitForResponse(response=>response.url().endsWith('/command/supplier-tax-review'));await panel.getByRole('button',{name:'Record human tax review',exact:true}).click();assert.equal((await saved).status(),200);await panel.getByText('Tax review history (1)',{exact:true}).waitFor();
    assert.ok((await panel.innerText()).includes('Eligibility: eligible'));assert.ok((await panel.innerText()).includes('Box: NEC-1'));assert.ok((await panel.innerText()).includes('Backup withholding: required'));
    const capture=async(name)=>{for(const p of pages){if(p.width===390){await p.page.reload();await p.panel.waitFor();await p.panel.getByLabel('Select reviewed W-9',{exact:true}).selectOption(f.document.id);}await p.panel.waitFor();await p.panel.getByText(/^Tax review history/).click();await p.panel.scrollIntoViewIfNeeded();assert.equal(await p.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Tax review fits viewport');await p.panel.screenshot({path:join(evidence,name+'-'+p.width+'.png')});}};
    await capture('supplier-tax-reviewed');
    const text=await panel.innerText();assert.ok(!text.includes(String(987654321)));assert.ok(!text.includes('••••4321'));
    const sizes=await panel.locator('p,label,button,a,summary,input,select').evaluateAll(elements=>elements.filter(element=>element.getClientRects().length).map(element=>parseFloat(getComputedStyle(element).fontSize)));assert.ok(sizes.every(size=>size>=13),'Tax review text is at least 13px');
    const icons=await page.locator('button').evaluateAll(buttons=>buttons.filter(button=>button.querySelector('svg')&&!button.textContent.replace(button.querySelector('[role=tooltip]')?.textContent||'','').trim()).map(button=>({label:button.getAttribute('aria-label'),tooltip:button.getAttribute('aria-describedby')})));assert.ok(icons.every(icon=>icon.label&&icon.tooltip),'Icon controls have labelled tooltips');
    const icon=page.locator('button[aria-describedby]').first();if(await icon.count()){await icon.focus();const id=await icon.getAttribute('aria-describedby');await page.locator('[id="'+id+'"]').waitFor({state:'visible'});}
    const replacement=await f.upload('synthetic-purse-6341 replacement W-9');await f.h.command('review-supplier-document',{id:f.document.id,version:1,attachment:replacement.id,expires:'2099-12-31'},f.buyer);
    await page.reload();await panel.getByText('Fresh owner review required.',{exact:false}).waitFor();assert.ok((await panel.innerText()).includes('Eligibility: unknown'));
    await capture('supplier-tax-changed-evidence');
    await panel.getByLabel('Select reviewed W-9',{exact:true}).selectOption(f.document.id);await panel.getByLabel('Review reason (no protected values)',{exact:true}).fill('synthetic-purse-6342 refreshed human judgment');await panel.getByLabel('1099 eligibility',{exact:true}).selectOption('ineligible');await panel.getByRole('checkbox').check();await panel.getByRole('button',{name:'Record human tax review',exact:true}).click();await panel.getByText('Tax review history (2)',{exact:true}).waitFor();assert.equal((await f.view()).eligibility,'ineligible');assert.equal((await f.view()).box,null);
    const context=await nativeWebContext(browser,f.h,1440,bundle.outputFiles[0].text,f.buyer);contexts.push(context);const buyer=await context.newPage();await buyer.goto(f.h.origin+'/app?tab=Suppliers&supplier='+f.supplier.id);await buyer.getByRole('heading',{name:'Supplier document compliance',exact:true}).waitFor();assert.equal(await buyer.getByRole('region',{name:'Supplier tax review',exact:true}).count(),0);
    assert.deepEqual(errors,[]);console.log('Native supplier tax review passed at 1440; reviewed and changed-evidence screens captured at 1440 and 390.');
} catch(error) {for(const [index,context] of contexts.entries())for(const page of context.pages())await page.screenshot({path:join(evidence,'supplier-tax-failure-'+index+'.png'),fullPage:true}).catch(()=>{});throw error;}
finally {for(const context of contexts)await context.close();await f.h.close();await browser.close();}
