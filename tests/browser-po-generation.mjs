import {combinedProcureJourney} from './po-combination-browser.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { build } from 'esbuild';
import { harness } from './purse-harness.mjs';
import { nativeWebContext } from './native-web-fixture.mjs';
const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE||'@playwright/test');
const widthArg=process.argv.find(a=>a.startsWith('--width=')),widths=widthArg?[Number(widthArg.split('=')[1])]:[1440,390];
const evidence=resolve(process.env.PURSE_EVIDENCE||'.cache/po-generation');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
try { for(const width of widths) {
    const h=await harness();let context;
    try {
        const cmd=h.command;await cmd('business',{name:'Canyon Design Studio',currencies:['USD'],locations:['Denver'],costCentres:['IT'],projects:['Operations']});
        const requester=await h.member('synthetic-purse-811@example.test',['requester']),approver=await h.member('synthetic-purse-812@example.test',['approver']);
        const supplier=await cmd('supplier',{name:'Canyon Studio Supplies',status:'preferred',reason:'Reviewed studio supplier',contacts:[{name:'Studio supplier',email:'synthetic-purse-813@example.test'}]});
        await cmd('policy',{name:'Studio budget',currency:'USD',category:'*',project:'*',approver:'synthetic-purse-812@example.test',limitMinor:1000000,budgetMinor:5000000});
        const item=await cmd('catalogue',{supplier:supplier.id,currency:'USD',description:'Studio kit',unitMinor:10000,category:'Hardware',project:'Operations',approved:true});
        const approve=async(title,quantity)=>{const r=await cmd('request',{title,supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'IT',terms:'Net 30',lines:[{catalogue:item.id,quantity,project:'Operations'}]},requester);await cmd('submit',{id:r.id,revision:1},requester);await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Approved exact source'},approver);return r;};
        const ready=await approve('One studio kit','1'),manual=await approve('Manual review kit purchase','11');
        context=await nativeWebContext(browser,h,width,bundle.outputFiles[0].text);const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(h.origin+'/app?tab=Settings');const settings=page.getByRole('region',{name:'PO generation rules',exact:true});await settings.getByText('Add a PO generation rule',{exact:true}).click();
        await settings.getByLabel('Purchase type or category (* for all, catalogue for catalog purchases)',{exact:true}).fill('catalogue');await settings.getByLabel('Generation supplier',{exact:true}).selectOption('*');await settings.getByLabel('Generation currency',{exact:true}).selectOption('USD');await settings.getByLabel('Generation mode',{exact:true}).selectOption('automatic');await settings.getByLabel('Supplier sending',{exact:true}).selectOption('automatic');await settings.getByLabel('Automatic generation limit',{exact:true}).fill('1,000.00');await settings.getByLabel('Generation authority reason',{exact:true}).fill('Authorize exact approved purchases and one supplier send to the primary contact on file');await settings.getByRole('checkbox').nth(0).check();await settings.getByRole('checkbox').nth(1).check();
        const saved=page.waitForResponse(r=>r.url().endsWith('/po-generation-policy'));await settings.getByRole('button',{name:'Add generation rule',exact:true}).focus();await settings.getByRole('tooltip',{name:'Generation rule',exact:true}).waitFor();await settings.getByRole('button',{name:'Add generation rule',exact:true}).click();assert.equal((await saved).status(),200);await settings.getByText('catalogue · All suppliers · USD · Automatic generation',{exact:true}).waitFor();await settings.screenshot({path:join(evidence,`PO-008-owner-rule-${width}.png`)});
        await page.goto(h.origin+'/app?tab=Orders');let panel=page.getByRole('region',{name:'Procure',exact:true});await panel.getByText(/Amount exceeds the owner/).waitFor();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await panel.screenshot({path:join(evidence,`PO-008-before-generation-${width}.png`)});
        const n=h.messages.length,tick=async()=>{const response=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+(Date.now()+1000));assert.equal(response.status,200,await response.text());};await Promise.all([tick(),tick()]);await tick();
        await page.reload();panel=page.getByRole('region',{name:'Procure',exact:true});await panel.getByText(/Supplier send outcome: accepted/).waitFor();assert.equal(h.messages.length,n+1);assert.equal((await h.state()).data.order.filter(o=>o.request===ready.id).length,1);
        await panel.getByRole('button',{name:'Review and issue Manual review kit purchase',exact:true}).focus();await panel.screenshot({path:join(evidence,`PO-008-manual-review-${width}.png`)});
        const reviewed=page.waitForResponse(r=>r.url().endsWith('/po-generation-review'));await panel.getByRole('button',{name:'Review and issue Manual review kit purchase',exact:true}).click();assert.equal((await reviewed).status(),200);await panel.getByRole('button',{name:'Review and issue Manual review kit purchase',exact:true}).waitFor({state:'detached'});
        assert.equal((await h.state()).data.order.filter(o=>o.request===manual.id).length,1);assert.equal(h.messages.length,n+1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await panel.screenshot({path:join(evidence,`PO-008-generated-${width}.png`)});await combinedProcureJourney({h,page,width,evidence});assert.deepEqual(errors,[]);
        console.log('PO-008 owner rule, automatic internal generation and explicit manual review passed at '+width);
    } finally { await context?.close();await h.close(); }
} } finally { await browser.close(); }
