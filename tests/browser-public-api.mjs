import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
import {nativeWebContext} from './native-web-fixture.mjs';
import {publicApiFixture} from './public-api-fixture.mjs';
const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE||'@playwright/test');
const evidence=resolve(process.env.PURSE_EVIDENCE||'.cache/public-api');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
const f=await publicApiFixture();let context;
try{
 context=await nativeWebContext(browser,f.h,1440,bundle.outputFiles[0].text);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(f.h.origin+'/app?tab=Settings');const panel=page.getByRole('region',{name:'Public API and webhooks',exact:true});
 await panel.getByLabel('API key name',{exact:true}).fill('Warehouse replenishment');await panel.getByLabel('Bound member',{exact:true}).selectOption(await f.principal(f.requester));
 await panel.getByLabel('API scopes (comma separated)',{exact:true}).fill('requests:write, requests:read, orders:read');await panel.getByLabel('Key department (blank means current member scope)',{exact:true}).fill('Operations');
 const issued=page.waitForResponse(r=>r.url().endsWith('/api/purse/api-keys')&&r.request().method()==='POST');await panel.getByRole('button',{name:'Create API key',exact:true}).click();const response=await issued;assert.equal(response.status(),200);const created=await response.json();
 const takeSecret=async()=>{const field=panel.getByLabel('New API secret',{exact:true});await field.waitFor();const token=await field.inputValue();assert.ok(token.length);await panel.getByRole('button',{name:'Dismiss secret',exact:true}).click();await field.waitFor({state:'detached'});return token;};
 let token=await takeSecret();
 const request=await context.request.post(f.h.origin+'/api/purse/v1/requests',{headers:{authorization:'Bearer '+token,'idempotency-key':'synthetic-purse-5130'},data:f.draft});assert.equal(request.status(),200);const draft=(await request.json()).request;assert.equal(draft.status,'draft');assert.equal((await f.h.state()).data.order.length,0);
 const repeated=await context.request.post(f.h.origin+'/api/purse/v1/requests',{headers:{authorization:'Bearer '+token,'idempotency-key':'synthetic-purse-5130'},data:f.draft});assert.equal((await repeated.json()).request.id,draft.id);
 await panel.getByLabel('Webhook name',{exact:true}).fill('Warehouse events');await panel.getByLabel('HTTPS receiver',{exact:true}).fill('https://hooks.example.test/receiver');await panel.getByLabel('Send these record references',{exact:true}).selectOption('yes');
 const hookResponse=page.waitForResponse(r=>r.url().endsWith('/api/purse/webhooks')&&r.request().method()==='POST');await panel.getByRole('button',{name:'Create webhook',exact:true}).click();assert.equal((await hookResponse).status(),200);await takeSecret();
 const row=panel.getByRole('article').filter({hasText:'Warehouse replenishment'});await row.waitFor();
 await page.reload();await row.waitFor();assert.equal(await panel.getByLabel('New API secret',{exact:true}).count(),0);
 const rotation=page.waitForResponse(r=>r.url().endsWith('/'+created.key.id+'/rotate'));await row.getByRole('button',{name:'Rotate API key',exact:true}).click();assert.equal((await rotation).status(),200);const replacement=await takeSecret();assert.equal((await f.call(token,'/api/purse/v1/requests/'+draft.id)).status,401);token=replacement;assert.equal((await f.call(token,'/api/purse/v1/requests/'+draft.id)).status,200);
 const revocation=page.waitForResponse(r=>r.url().endsWith('/'+created.key.id+'/revoke'));await row.getByRole('button',{name:'Revoke API key',exact:true}).click();assert.equal((await revocation).status(),200);await row.getByText('Revoked',{exact:true}).waitFor();assert.equal((await f.call(token,'/api/purse/v1/requests/'+draft.id)).status,401);
 // Assertions run at one width; both release widths record the changed screen once.
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await panel.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Settings fits '+width);
  assert.equal(await panel.getByLabel('New API secret',{exact:true}).count(),0,'Never capture a credential');
  const small=await panel.locator('input,select,button,a,p,textarea').evaluateAll(elements=>elements.filter(element=>parseFloat(getComputedStyle(element).fontSize)<13).map(element=>element.tagName));assert.deepEqual(small,[]);
  const icons=await page.locator('button').evaluateAll(buttons=>buttons.filter(button=>!button.textContent.trim()).map(button=>({label:button.getAttribute('aria-label'),tooltip:button.getAttribute('aria-describedby')})));assert.ok(icons.every(icon=>icon.label&&icon.tooltip));
  await panel.screenshot({path:join(evidence,'API-001-settings-'+width+'.png')});
 }
 assert.deepEqual(errors,[]);console.log('Public API Settings: scoped member key, draft and idempotency, signing-secret custody, reload, rotate and revoke; screens 1440 and 390 passed');
}finally{await context?.close();await f.close();await browser.close();}
