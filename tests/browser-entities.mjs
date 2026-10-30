import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { nativeWebContext } from './native-web-fixture.mjs';
import { entitiesFixture, entityAddress } from './entities-fixture.mjs';

const { chromium } = await import(process.env.PURSE_PLAYWRIGHT_MODULE || '@playwright/test');
const evidence=resolve(process.env.PURSE_EVIDENCE || '.cache/entities');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
const f=await entitiesFixture(undefined,{configure:false}),{h}=f,contexts=[],errors=[];
async function pageFor(cookie) { const context=await nativeWebContext(browser,h,1440,bundle.outputFiles[0].text,cookie);contexts.push(context);const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);return page; }
async function clickCommand(page,button,op) { const loaded=page.waitForResponse(result=>result.url().endsWith('/api/purse/state')&&result.request().method()==='GET');const response=page.waitForResponse(result=>result.url().endsWith('/api/purse/command/'+op)&&result.request().method()==='POST');await button.click();const result=await response;assert.equal(result.status(),200,await result.text());await loaded;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return result.json(); }
async function screens(page,name,locator=page.locator('main')) { for(const width of [1440,390]) {await page.setViewportSize({width,height:1000});await locator.screenshot({path:join(evidence,name+'-'+width+'.png')});}await page.setViewportSize({width:1440,height:1000}); }
try {
    const owner=await pageFor(h.owner);await owner.goto(h.origin+'/app?tab=Settings');
    const panel=owner.getByRole('region',{name:'Legal entities',exact:true});await panel.waitFor();
    for(const number of [7410,7420]) {
        const input=f.input(number);
        await panel.getByLabel('Entity legal name',{exact:true}).fill(input.legalName);
        await panel.getByLabel('Entity bill-to address',{exact:true}).fill(input.billTo);
        await panel.getByLabel('Entity ship-to address',{exact:true}).fill(input.shipTo);
        await panel.getByLabel('Immutable PO prefix',{exact:true}).fill(input.prefix);
        await clickCommand(owner,panel.getByRole('button',{name:'Save legal entity',exact:true}),'entity');
    }
    const entities=(await h.state()).data.entity;assert.equal(entities.length,2);
    assert.ok((await panel.innerText()).includes('Unconfigured'));assert.equal(await panel.getByRole('button',{name:'Edit entity',exact:true}).count(),2);
    await screens(owner,'entity-settings',panel);
    for(const entity of entities) {
        await h.command('policy',{entity:entity.id,name:entity.legalName,currency:'USD',category:'*',project:'*',approver:entityAddress(7402),limitMinor:100000,budgetMinor:100000});
        await h.command('po-profile',{entity:entity.id,version:0,location:'Denver',purchaseType:'*',legalName:entity.legalName,billTo:{label:'Accounts payable'},shipTo:{label:'Goods destination'},buyerContact:'Purchasing team',shippingTerms:'FOB destination',standardTerms:'Only supply approved equipment.',termsFile:f.terms,certificate:{...f.certificate,supplierStates:['CO']}});
    }
    const requester=await pageFor(f.requester),requests=[];
    for(const [index,entity]of entities.entries()) {
        await requester.goto(h.origin+'/app?tab=Requests');await requester.getByLabel('Ask Purse for something to buy',{exact:true}).fill(entity.legalName+' equipment');
        await requester.getByRole('button',{name:'New purchase request',exact:true}).click();
        const form=requester.locator('.draft-card form');await form.waitFor();
        await form.getByLabel('Legal entity',{exact:true}).selectOption(entity.id);
        await form.getByLabel('Supplier',{exact:true}).selectOption(f.supplier.id);await form.getByLabel('Currency',{exact:true}).selectOption('USD');
        await form.getByLabel('Need date',{exact:true}).fill('2099-11-01');await form.getByLabel('Location',{exact:true}).selectOption('Denver');await form.getByLabel('Cost centre',{exact:true}).selectOption('Operations');
        await form.getByLabel('Description',{exact:true}).fill('Equipment');await form.getByLabel('Quantity',{exact:true}).fill('1');await form.getByLabel('Unit price',{exact:true}).fill(index?'400.00':'600.00');
        await form.getByLabel('Category',{exact:true}).fill('Goods');await form.getByLabel('Project',{exact:true}).selectOption('Equipment');await form.getByLabel('Supplier-supplied terms',{exact:true}).fill('Net 30');
        if(index===0)await screens(requester,'entity-request',requester.locator('.draft-card'));
        const request=await clickCommand(requester,form.getByRole('button',{name:'Save request draft',exact:true}),'request');requests.push(request);
        await clickCommand(requester,requester.locator('#request-'+request.id).getByRole('button',{name:'Submit',exact:true}),'submit');
    }
    const approver=await pageFor(f.approver);await approver.goto(h.origin+'/app?tab=Requests');await approver.getByRole('button',{name:'Approve',exact:true}).first().waitFor();
    assert.equal(await approver.getByRole('button',{name:'Approve',exact:true}).count(),2);
    await approver.getByLabel('Filter legal entity',{exact:true}).selectOption(entities[0].id);assert.equal(await approver.getByRole('button',{name:'Approve',exact:true}).count(),1);
    assert.equal(await approver.locator('#request-'+requests[1].id).count(),0);
    await approver.getByLabel('Filter legal entity',{exact:true}).selectOption('');await screens(approver,'cross-entity-queue');
    for(const request of requests)await clickCommand(approver,approver.locator('#request-'+request.id).getByRole('button',{name:'Approve',exact:true}),'decision');
    const before=(await h.state()).data.commitment;assert.deepEqual(requests.map(request=>before.filter(event=>event.request===request.id).reduce((sum,event)=>sum+event.amountMinor,0)),[60000,40000]);
    const buyer=await pageFor(f.buyer),orders=[];
    for(const request of requests) {
        await buyer.goto(h.origin+'/app?tab=Requests&request='+request.id);
        const record=buyer.locator('#request-'+request.id);await record.getByRole('button',{name:'Generate purchase order',exact:true}).waitFor();
        orders.push(await clickCommand(buyer,record.getByRole('button',{name:'Generate purchase order',exact:true}),'convert'));
    }
    for(const order of orders) {
        await buyer.goto(h.origin+'/app?tab=Orders&receipt='+order.id);
        await buyer.getByLabel('Issuance confirmation / channel',{exact:true}).fill('Reviewed exact entity document');
        await clickCommand(buyer,buyer.getByRole('button',{name:'Record PO issuance',exact:true}),'issue');
    }
    assert.deepEqual(orders.map(order=>order.number),entities.map(entity=>entity.prefix+'-000001'));
    await buyer.goto(h.origin+'/app?tab=Orders&receipt='+orders[0].id);await buyer.getByRole('link',{name:'Download purchase order PDF',exact:true}).waitFor();
    assert.ok((await buyer.locator('main').innerText()).includes(entities[0].legalName));await screens(buyer,'entity-orders');
    const report=(await h.send('/api/purse/spend-report?groupBy=entity',undefined,h.owner)).value;
    assert.deepEqual(entities.map(entity=>report.rows.filter(row=>row.entity===entity.id&&row.kind==='committed').reduce((sum,row)=>sum+row.amountMinor,0)),[60000,40000]);
    const tooltip=requester.getByRole('button',{name:'New purchase request',exact:true});await tooltip.focus();assert.equal(await requester.getByRole('tooltip',{name:'New request',exact:true}).isVisible(),true);
    await buyer.setViewportSize({width:390,height:1000});assert.ok(await buyer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Phone order screen does not overflow');
    const small=await panel.evaluate(element=>[...element.querySelectorAll('p,label,button,td')].filter(node=>parseFloat(getComputedStyle(node).fontSize)<13).length);assert.equal(small,0);
    assert.deepEqual(errors,[]);
    console.log('Entity configuration, native request creation, filtered cross-entity approval, separate budgets and distinctly numbered POs passed at 1440; 390 smoke and both-width screens captured. Accounting remains unconfigured.');
} finally {for(const context of contexts)await context.close();await h.close();await browser.close();}
