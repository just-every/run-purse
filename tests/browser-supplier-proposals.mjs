import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {nativeWebContext} from './native-web-fixture.mjs';
import {supplierProposalsFixture} from './supplier-proposals-fixture.mjs';

const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE||'@playwright/test');
const evidence=resolve(process.env.PURSE_EVIDENCE||'.cache/supplier-proposals');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
const f=await supplierProposalsFixture(),contexts=[],errors=[];
const open=async(cookie,width,path)=>{const context=await nativeWebContext(browser,f.h,width,bundle.outputFiles[0].text,cookie);contexts.push(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(f.h.origin+path);return page;};
async function capture(name,cookie,path,region) {
    for(const width of [1440,390]) {
        const page=await open(cookie,width,path),panel=page.getByRole('region',{name:region,exact:true});await panel.waitFor();await panel.scrollIntoViewIfNeeded();
        await page.screenshot({path:join(evidence,name+'-'+width+'.png'),fullPage:true});
        await page.close();
    }
}
try {
    const page=await open(f.requester,1440,'/app?tab=Suppliers'),panel=page.getByRole('region',{name:'Supplier proposals',exact:true});
    await panel.getByText('Propose a supplier without a request',{exact:true}).click();
    const input=f.input(6850);
    for(const [label,value] of [['Proposed supplier name',input.name],['Proposed contact email',input.contactEmail],['Why this supplier',input.reason],['Proposed website',input.website]])await panel.getByLabel(label,{exact:true}).fill(value);
    let response=page.waitForResponse(r=>r.url().endsWith('/command/supplier-proposal-choices'));await panel.getByRole('button',{name:'Check existing suppliers',exact:true}).click();assert.equal((await response).status(),200);
    await panel.getByLabel('Proposed phone',{exact:true}).fill('synthetic-purse-6853');
    assert.equal(await panel.getByRole('button',{name:'Send supplier proposal',exact:true}).count(),0,'Editing checked proposal fields requires a fresh duplicate check');
    response=page.waitForResponse(r=>r.url().endsWith('/command/supplier-proposal-choices'));await panel.getByRole('button',{name:'Check existing suppliers',exact:true}).click();assert.equal((await response).status(),200);
    await panel.getByRole('checkbox').check();
    response=page.waitForResponse(r=>r.url().endsWith('/command/supplier-propose'));await panel.getByRole('button',{name:'Send supplier proposal',exact:true}).click();const sent=await response;assert.equal(sent.status(),200);const proposal=await sent.json();assert.equal(proposal.phone,'synthetic-purse-6853');
    const own=panel.getByRole('region',{name:'Supplier review '+input.name,exact:true});await own.waitFor();assert.match(await own.innerText(),/Status: pending/);assert.equal(await own.getByRole('button',{name:'Reject supplier proposal',exact:true}).count(),0);
    await capture('supplier-proposed',f.requester,'/app?tab=Suppliers','Supplier review '+input.name);
    const request=await f.h.command('request',f.requestInput(proposal.id),f.requester);await f.approve(request);
    assert.equal((await f.h.state()).data.totals.USD,90000);
    await capture('supplier-pending-request',f.requester,'/app?request='+request.id,'Pending supplier review');
    const buyer=await open(f.buyer,1440,'/app?request='+request.id);
    response=buyer.waitForResponse(r=>r.url().endsWith('/command/convert'));await buyer.getByRole('button',{name:'Generate purchase order',exact:true}).click();assert.equal((await response).status(),409);
    await buyer.getByRole('alert').filter({hasText:'Supplier pending vendor approval'}).waitFor();
    const owner=await open(f.h.owner,1440,'/app?tab=Suppliers'),review=owner.getByRole('region',{name:'Supplier review '+input.name,exact:true});
    await review.getByLabel('Rejection reason',{exact:true}).fill('synthetic-purse-6852 onboarding prerequisites unavailable');
    response=owner.waitForResponse(r=>r.url().endsWith('/command/supplier-proposal-reject'));await review.getByRole('button',{name:'Reject supplier proposal',exact:true}).click();assert.equal((await response).status(),200);
    await review.getByText('Status: rejected',{exact:false}).waitFor();
    assert.equal((await f.h.state()).data.totals.USD,0);
    assert.equal((await f.h.state()).data.commitment.filter(e=>e.kind==='supplier-rejection-release').length,1);
    await capture('supplier-rejected',f.h.owner,'/app?tab=Suppliers','Supplier review '+input.name);
    await capture('supplier-returned-request',f.requester,'/app?request='+request.id,'Pending supplier review');
    await page.goto(f.h.origin+'/app?request='+request.id);
    const returned=page.getByRole('region',{name:'Pending supplier review',exact:true});await returned.waitFor();assert.ok((await returned.innerText()).includes('synthetic-purse-6852'));
    await page.getByText('Revise or amend request',{exact:true}).click();
    const form=page.locator('form').filter({has:page.getByRole('button',{name:'Save revised draft',exact:true})});
    await form.getByLabel('Supplier',{exact:true}).selectOption(f.active.id);await form.getByLabel('Amendment reason',{exact:true}).fill('Select existing reviewed supplier');
    response=page.waitForResponse(r=>r.url().endsWith('/command/amend'));await form.getByRole('button',{name:'Save revised draft',exact:true}).click();const amended=await response;assert.equal(amended.status(),200);const revised=await amended.json();assert.equal(revised.revision,2);assert.equal(revised.status,'draft');
    assert.equal((await f.h.state()).data.totals.USD,0);
    response=page.waitForResponse(r=>r.url().endsWith('/command/submit'));await page.getByRole('button',{name:'Submit for approval',exact:true}).click();assert.equal((await response).status(),200);
    const approver=await open(f.approver,1440,'/app?request='+request.id);
    await approver.getByLabel('Decision',{exact:true}).selectOption('approved');await approver.getByLabel('Decision reason',{exact:true}).fill('Fresh ordinary purchase approval for existing supplier');
    response=approver.waitForResponse(r=>r.url().endsWith('/command/decision'));await approver.getByRole('button',{name:'Record decision',exact:true}).click();assert.equal((await response).status(),200);
    assert.equal((await f.h.state()).data.totals.USD,90000);
    // Existing match selection uses the register and creates no new proposal.
    await page.goto(f.h.origin+'/app?tab=Suppliers');await panel.getByText('Propose a supplier without a request',{exact:true}).click();
    await panel.getByLabel('Proposed supplier name',{exact:true}).fill(f.active.name);await panel.getByLabel('Proposed contact email',{exact:true}).fill(f.input(6854).contactEmail);await panel.getByLabel('Why this supplier',{exact:true}).fill('Check an existing caterer');
    response=page.waitForResponse(r=>r.url().endsWith('/command/supplier-proposal-choices'));await panel.getByRole('button',{name:'Check existing suppliers',exact:true}).click();assert.equal((await response).status(),200);
    await panel.getByRole('button',{name:'Use existing supplier',exact:true}).click();await panel.getByRole('status').filter({hasText:'No proposal was created'}).waitFor();
    assert.equal((await f.h.state()).data.supplierProposal.length,1);
    const sizes=await panel.locator('p,label,button,a,summary,input,select').evaluateAll(elements=>elements.filter(element=>element.getClientRects().length).map(element=>parseFloat(getComputedStyle(element).fontSize)));assert.ok(sizes.every(size=>size>=13));
    const icons=await page.locator('button').evaluateAll(buttons=>buttons.filter(button=>button.querySelector('svg')&&!button.textContent.replace(button.querySelector('[role=tooltip]')?.textContent||'','').trim()).map(button=>({label:button.getAttribute('aria-label'),tooltip:button.getAttribute('aria-describedby')})));assert.ok(icons.every(icon=>icon.label&&icon.tooltip));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    console.log('Native supplier proposals, pending conversion refusal, reasoned rejection, reservation release and fresh approval passed at 1440; changed screens captured at 1440 and 390.');
}catch(error){for(const [index,context]of contexts.entries())for(const page of context.pages())await page.screenshot({path:join(evidence,'supplier-proposals-failure-'+index+'.png'),fullPage:true}).catch(()=>{});throw error;}
finally {for(const context of contexts)await context.close();await f.h.close();await browser.close();}
