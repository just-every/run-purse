import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {harness} from './purse-harness.mjs';
import {nativeWebContext} from './native-web-fixture.mjs';
import {dispositionFixture} from './budget-disposition-fixture.mjs';
const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE || '@playwright/test');
const evidence=resolve(process.env.PURSE_EVIDENCE || '.cache/budget-disposition');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH || undefined,args:['--use-mock-keychain','--password-store=basic',...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?['--no-sandbox']:[])]});
const h=await harness(),contexts=[];
try {
 const f=await dispositionFixture(h);
 const pageFor=async(cookie,width)=>{const context=await nativeWebContext(browser,h,width,bundle.outputFiles[0].text,cookie);contexts.push(context);return context.newPage();};
 const page=await pageFor(h.owner,1440),phone=await pageFor(h.owner,390);
 const open=async(target)=>{await target.goto(h.origin+'/app?tab=Orders');await target.getByRole('row').filter({hasText:f.o.number}).getByRole('button',{name:'Open order',exact:true}).click();await target.locator('summary').filter({hasText:'Move commitment to another budget period'}).click();return target.getByRole('region',{name:'Budget period disposition',exact:true});};
 const panel=await open(page),phonePanel=await open(phone);
 const preview=async(target)=>{await target.getByLabel('Destination need date',{exact:true}).fill('2027-05-15');await target.getByRole('button',{name:'Preview budget disposition',exact:true}).click();await target.getByRole('heading',{name:'Reviewed budget movement',exact:true}).waitFor();};
 const before=await f.rows();await preview(panel);assert.deepEqual(await f.rows(),before,'Web preview writes no purchasing facts');
 for(const [label,amount] of [['old Operations quarter','$600.00'],['old Research quarter','$400.00'],['new Operations quarter','$600.00'],['new Research quarter','$400.00']])assert.ok((await panel.getByRole('row').filter({hasText:label}).textContent()).includes(amount));
 const shot=async(target,width,name)=>{assert.ok(await target.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Budget screens fit '+width);await target.screenshot({path:join(evidence,`BUDGET-001-${width}-${name}.png`),fullPage:true});};
 await shot(page,1440,'review');await preview(phonePanel);await shot(phone,390,'review');
 await panel.getByLabel('Budget disposition reason',{exact:true}).fill('Keep exact remaining supply in next quarter');await panel.getByRole('checkbox').check();
 const changed=page.waitForResponse(response=>response.url().endsWith('/command/budget-disposition-amend'));await panel.getByRole('button',{name:'Prepare reviewed budget amendment',exact:true}).click();assert.equal((await changed).status(),200);
 const r=(await h.state()).data.request.find(row=>row.id===f.r.id);assert.equal(r.revision,2);
 const requestPage=await pageFor(h.owner,1440);await requestPage.goto(h.origin+'/app?tab=Requests&request='+f.r.id);
 const submitted=requestPage.waitForResponse(response=>response.url().endsWith('/command/submit'));await requestPage.getByRole('button',{name:'Submit for approval',exact:true}).click();assert.equal((await submitted).status(),200);await requestPage.getByText(/Reviewed budget disposition/).waitFor();await shot(requestPage,1440,'renewed-approval');
 const requestPhone=await pageFor(h.owner,390);await requestPhone.goto(h.origin+'/app?tab=Requests&request='+f.r.id);await requestPhone.getByText(/Reviewed budget disposition/).waitFor();await shot(requestPhone,390,'renewed-approval');
 for(const cookie of [f.approver,f.firstOwner,f.secondOwner]){
  const member=await pageFor(cookie,1440);await member.goto(h.origin+'/app?tab=Requests&request='+f.r.id);
  await member.getByLabel('Decision',{exact:true}).selectOption('approved');await member.getByLabel('Decision reason',{exact:true}).fill('Exact renewed purchase and budget allocation reviewed');
  const decision=member.waitForResponse(response=>response.url().endsWith('/command/decision'));await member.getByRole('button',{name:'Record decision',exact:true}).click();assert.equal((await decision).status(),200);
 }
 const o=await f.cmd('convert',{id:r.id,revision:2},f.buyer),buyer=await pageFor(f.buyer,1440);await buyer.goto(h.origin+'/app?tab=Orders');await buyer.getByRole('row').filter({hasText:o.number}).getByRole('button',{name:'Open order',exact:true}).click();await buyer.getByLabel('Issuance confirmation / channel',{exact:true}).fill('Issue reviewed next-quarter amendment');
 const issued=buyer.waitForResponse(response=>response.url().endsWith('/command/issue'));await buyer.getByRole('button',{name:'Record PO issuance',exact:true}).click();assert.equal((await issued).status(),200);
 assert.deepEqual(await f.figures(),[[200000,0,0,0,200000],[200000,0,0,0,200000],[200000,0,60000,0,140000],[200000,0,40000,0,160000]]);
 const report=async(target,width)=>{await target.goto(h.origin+'/app?tab=Reports');const positions=target.getByRole('region',{name:'Dated financial budget positions',exact:true});await positions.getByRole('button',{name:'new Operations quarter',exact:true}).click();await positions.getByRole('region',{name:'Financial budget source records',exact:true}).getByRole('link',{name:f.input.title,exact:true}).waitFor();await shot(target,width,'moved-position');return positions;};
 const positions=await report(page,1440);await report(phone,390);
 assert.ok((await positions.getByRole('row').filter({hasText:'new Operations quarter'}).textContent()).includes('$600.00'));assert.ok((await positions.getByRole('row').filter({hasText:'new Research quarter'}).textContent()).includes('$400.00'));
 await f.purchase({title:'synthetic-purse-2816 hidden quarterly source',needDate:'2027-05-15'},f.hidden);
 const privatePage=await pageFor(f.requester,1440);const scoped=await report(privatePage,1440);const anonymous=scoped.getByRole('row').filter({hasText:'Other purchases you cannot see'});await anonymous.waitFor();assert.ok((await anonymous.textContent()).includes('$600.00'));assert.equal(await anonymous.getByRole('link').count(),0);assert.ok(!(await scoped.textContent()).includes('2816'));await shot(privatePage,1440,'anonymous-source');
 console.log('BUDGET-001 reviewed native quarter movement passed at 1440; changed screens and phone smoke captured at 390');
}finally{for(const context of contexts)await context.close();await h.close();await browser.close();}
