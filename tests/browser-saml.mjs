import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
import {samlFixture} from './saml-fixture.mjs';
import {nativeWebContext} from './native-web-fixture.mjs';
const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE||'@playwright/test');
const widthArgument=process.argv.find(arg=>arg.startsWith('--width='));
const widths=widthArgument?[Number(widthArgument.slice(8))]:[1440,390];
assert.ok(widths.every(width=>[1440,390].includes(width)));
const evidence=resolve(process.env.PURSE_EVIDENCE||'.cache/saml');await mkdir(evidence,{recursive:true});
const app=(await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text;
const browser=await chromium.launch({headless:true,...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--use-mock-keychain','--password-store=basic',...(process.platform==='linux'?['--no-sandbox']:[])]});
try{for(const width of widths){
 const h=await samlFixture(),contexts=[];
 try{
  await h.prepare();
  const owner=await nativeWebContext(browser,h,width,app),member=await nativeWebContext(browser,h,width,app);contexts.push(owner,member);await member.clearCookies();
  await owner.setExtraHTTPHeaders({'CF-Connecting-IP':'127.0.0.1'});await member.setExtraHTTPHeaders({'CF-Connecting-IP':'127.0.0.1'});
  const op=await owner.newPage(),mp=await member.newPage();const errors=[];for(const page of [op,mp]){page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error')console.error('Browser console:',message.text())});}
  const snapshot=async(page,name)=>{
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' fits the viewport');
   const visible=await page.locator('body').innerText();assert.ok(!visible.includes(h.samlIdp.privateKey));assert.ok(!visible.includes(h.sessionSecret));
   assert.equal(await page.locator('button').evaluateAll(buttons=>buttons.some(button=>!button.textContent.trim()&&!button.getAttribute('aria-label'))),false,'Controls have visible names');
   await page.screenshot({path:join(evidence,`ACCESS-002-saml-${name}-${width}.png`),fullPage:true});
  };
  const settings=h.origin+'/auth/purse/identity';await op.goto(settings);await op.getByRole('heading',{name:'SAML 2.0',exact:true}).waitFor();await snapshot(op,'settings-disabled');
  await mp.goto(h.origin+'/signin');assert.equal(await mp.getByRole('button',{name:'Continue with Local SAML company',exact:true}).count(),0);
  await op.getByRole('button',{name:'Enable provider sign-in',exact:true}).click();await op.getByRole('button',{name:'Disable provider sign-in',exact:true}).waitFor();await snapshot(op,'settings-enabled');
  await mp.goto(h.origin+'/signin');await mp.getByRole('button',{name:'Continue with Local SAML company',exact:true}).waitFor();await snapshot(mp,'sign-in');
  await mp.getByRole('button',{name:'Continue with Local SAML company',exact:true}).click();await mp.getByRole('heading',{name:'Local test identity provider'}).waitFor();await mp.getByRole('button',{name:'Sign in to Purse'}).click();
  await mp.getByRole('heading',{name:'Complete single sign-on'}).waitFor();await snapshot(mp,'browser-confirmation');
  await Promise.all([mp.waitForResponse(response=>new URL(response.url()).pathname==='/auth/saml/saml-company/finish').then(response=>assert.equal(response.status(),303)),mp.getByRole('button',{name:'Continue sign-in'}).click()]);
  await mp.waitForURL(h.origin+'/app');
  const current=await member.request.get(h.origin+'/auth/session');assert.equal(current.status(),200);assert.equal((await current.json()).operator.role,'member');
  const state=await member.request.get(h.origin+'/api/purse/state');assert.equal(state.status(),200);assert.deepEqual((await state.json()).actor.roles,['approver']);
  await mp.goto(h.origin+'/app');await mp.getByRole('navigation').waitFor();await snapshot(mp,'native-workspace');
  assert.equal((await member.request.get(settings)).status(),403);
  await op.goto(settings);await op.getByRole('button',{name:'Disable provider sign-in',exact:true}).click();await op.getByRole('button',{name:'Enable provider sign-in',exact:true}).waitFor();await snapshot(op,'disabled-session-ended');
  assert.equal((await member.request.get(h.origin+'/auth/session')).status(),401);assert.equal((await member.request.get(h.origin+'/api/purse/state')).status(),401);assert.equal((await owner.request.get(h.origin+'/auth/session')).status(),200);
  assert.deepEqual(errors,[]);
 }catch(error){for(const context of contexts)for(const page of context.pages())console.error('SAML browser:',page.url(),(await page.locator('body').innerText()).slice(0,1000));throw error;}finally{await Promise.all(contexts.map(context=>context.close()));await h.close()}
}}finally{await browser.close()}
console.log('Signed SAML owner, IdP callback and native session browser proof passed at '+widths.join(' and '));
