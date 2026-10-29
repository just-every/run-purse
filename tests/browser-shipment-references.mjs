import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { harness } from './purse-harness.mjs';
import { nativeWebContext } from './native-web-fixture.mjs';
import { shipmentFixture } from './shipment-references-fixture.mjs';

const { chromium } = await import(process.env.PURSE_PLAYWRIGHT_MODULE || '@playwright/test');
const evidence = resolve(process.env.PURSE_EVIDENCE || '.cache/shipment-references'); await mkdir(evidence,{recursive:true});
const bundle = await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser = await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
const h = await harness(), contexts = [];
try {
    const f = await shipmentFixture(h); assert.equal((await f.send()).status,200);
    const supplierContext = await browser.newContext({viewport:{width:1440,height:1000}}); contexts.push(supplierContext);
    const supplier = await supplierContext.newPage(), errors = []; supplier.on('pageerror',error=>errors.push(error.message));
    await supplier.goto(f.link().href);
    await supplier.getByLabel('Your name',{exact:true}).fill('synthetic-purse-6620');
    await supplier.getByLabel('Promised delivery date (required for acceptance; leave blank for rejection)',{exact:true}).fill('2026-11-08');
    await supplier.getByLabel('Carrier',{exact:true}).selectOption('UPS');
    await supplier.getByLabel('Tracking number',{exact:true}).fill('synthetic-purse-6621');
    await supplier.getByRole('checkbox').check();
    const submit = supplier.waitForResponse(response=>response.url()===f.link().href&&response.request().method()==='POST');
    await supplier.getByRole('button',{name:'Record supplier response',exact:true}).click(); assert.equal((await submit).status(),200);
    await supplier.getByRole('heading',{name:'Supplier response recorded',exact:true}).waitFor();
    await supplier.getByRole('link',{name:'View order and response',exact:true}).click();
    const first = (await f.references())[0];
    await supplier.getByLabel('Your name',{exact:true}).fill('synthetic-purse-6620');
    await supplier.getByLabel('Promised delivery date (required for acceptance; leave blank for rejection)',{exact:true}).fill('2026-11-08');
    await supplier.getByLabel('Carrier',{exact:true}).selectOption('DHL');
    await supplier.getByLabel('Tracking number',{exact:true}).fill('synthetic-purse-6622');
    await supplier.getByLabel('Reference to correct',{exact:true}).selectOption(first.id);
    await supplier.getByLabel('Correction reason',{exact:true}).fill('Supplier corrected its label');
    await supplier.getByRole('checkbox').check();
    const correction = supplier.waitForResponse(response=>response.url()===f.link().href&&response.request().method()==='POST');
    await supplier.getByRole('button',{name:'Record supplier response',exact:true}).click(); assert.equal((await correction).status(),200);
    await supplier.getByRole('heading',{name:'Supplier response recorded',exact:true}).waitFor();
    await supplier.getByRole('link',{name:'View order and response',exact:true}).click();
    for (const width of [1440,390]) {
        await supplier.setViewportSize({width,height:1000});
        const context = await nativeWebContext(browser,h,width,bundle.outputFiles[0].text,f.receiver); contexts.push(context);
        const receiver = await context.newPage(); receiver.on('pageerror',error=>errors.push(error.message));
        await receiver.goto(h.origin+'/app?tab=Orders');
        await receiver.getByRole('row').filter({hasText:f.order.number}).getByRole('button',{name:'Open order',exact:true}).click();
        const panel = receiver.getByRole('region',{name:'Supplier shipment references',exact:true}); await panel.waitFor();
        await panel.getByText('Shipment reference history (2)',{exact:true}).click();
        if(width===1440) {
            const text = await panel.innerText();
            for(const field of ['UPS','synthetic-purse-6621','DHL','synthetic-purse-6622','Supplier-reported','Carrier status unknown','Corrects reference 1','Supplier corrected its label','Approved revision 1']) assert.ok(text.includes(field),field);
            assert.equal((await h.state()).data.receipt.filter(row=>row.order===f.order.id).length,0);
            assert.ok((await supplier.locator('fieldset').filter({hasText:'Optional supplier shipment reference'}).innerText()).includes('synthetic-purse-6622'));
            assert.equal(await supplier.getByLabel('Reference to correct',{exact:true}).locator('option').count(),2,'Only the current reference can be corrected again');
        }
        for(const [page,name] of [[supplier,'supplier-acknowledgment'],[receiver,'receiver-history']]) {
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow at '+width);
            await page.screenshot({path:join(evidence,`${name}-${width}.png`),fullPage:true});
        }
        const small = await panel.evaluate(element=>[...element.querySelectorAll('p,h4,li,summary')].filter(node=>parseFloat(getComputedStyle(node).fontSize)<13).length); assert.equal(small,0);
    }
    assert.deepEqual(errors,[]);
    console.log('Shipment acknowledgment and receiver history passed at 1440; 390 smoke and both-width screens captured. Carrier status remains unknown.');
} finally { for(const context of contexts) await context.close(); await h.close(); await browser.close(); }
