import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { nativeWebContext } from './native-web-fixture.mjs';
import { intakeAgentFixture, intakeEmail } from './intake-agent-fixture.mjs';

const { chromium } = await import(process.env.PURSE_PLAYWRIGHT_MODULE || '@playwright/test');
const evidence=resolve(process.env.PURSE_EVIDENCE || '.cache/intake-agent');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH || undefined,args:['--use-mock-keychain','--password-store=basic',...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?['--no-sandbox']:[])]});
const f=await intakeAgentFixture(),contexts=[],errors=[];
try {
 const pageFor=async cookie=>{const context=await nativeWebContext(browser,f.h,1440,bundle.outputFiles[0].text,cookie);contexts.push(context);const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));return page;};
 // Assertions run at desktop width; each changed screen is also captured once at phone width.
 const capture=async(page,target,name)=>{
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Intake fits the desktop viewport');
  const icons=await target.locator('button').evaluateAll(buttons=>buttons.filter(button=>!button.textContent.trim()).map(button=>({name:button.getAttribute('aria-label'),tooltip:button.getAttribute('aria-describedby')})));
  assert.ok(icons.every(icon=>icon.name&&icon.tooltip),'Icon-only controls have labelled tooltips');
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await target.screenshot({path:join(evidence,`intake-${name}-${width}.png`)});}
  await page.setViewportSize({width:1440,height:1000});
 };
 const owner=await pageFor(f.h.owner);await owner.goto(f.h.origin+'/app?tab=Settings');const controls=owner.getByRole('region',{name:'Agent controls',exact:true});
 await controls.getByLabel('Native agent',{exact:true}).selectOption('AGENT-001');await controls.getByLabel('Agent purchase type',{exact:true}).fill('equipment');await controls.getByLabel('Agent state',{exact:true}).selectOption('yes');await controls.getByLabel('Agent control reason',{exact:true}).fill('Owner permits reviewed intake drafts only');
 const enabled=owner.waitForResponse(response=>response.url().endsWith('/command/agent-policy'));await controls.getByRole('button',{name:'Save agent controls',exact:true}).click();assert.equal((await enabled).status(),200);await capture(owner,controls,'owner-controls');
 const page=await pageFor(f.requester);await page.goto(f.h.origin+'/app?tab=Requests');const agent=page.getByRole('region',{name:'Requirements intake agent',exact:true});await agent.getByText('Describe a need',{exact:true}).click();
 await agent.getByLabel('Intake purchase form',{exact:true}).selectOption(f.form.id);await agent.getByLabel('Describe your need',{exact:true}).fill('We need a laptop for a new colleague');await agent.getByLabel('Explicit need date',{exact:true}).fill('2026-12-01');await agent.getByLabel('Known supplier terms',{exact:true}).fill('Net 30');
 const before=(await f.h.state()).data,mailCount=f.h.messages.length;
 const prepared=page.waitForResponse(response=>response.url().endsWith('/command/intake-agent-run'));await agent.getByRole('button',{name:'Prepare intake suggestions',exact:true}).click();const firstResponse=await prepared;assert.equal(firstResponse.status(),200);const first=await firstResponse.json();
 await agent.getByRole('status').filter({hasText:'quantity'}).waitFor();assert.deepEqual(first.output.missing,['quantity']);assert.equal(await agent.getByRole('button',{name:'Create reviewed intake draft',exact:true}).isEnabled(),false);await capture(page,agent,'quantity-followup');
 await agent.getByLabel('Explicit quantity',{exact:true}).fill('3');const answered=page.waitForResponse(response=>response.url().endsWith('/command/intake-agent-answer'));await agent.getByRole('button',{name:'Answer intake follow-up',exact:true}).click();const answerResponse=await answered;assert.equal(answerResponse.status(),200);const run=await answerResponse.json();
 const suggestions=agent.getByRole('region',{name:'Intake suggestions',exact:true});await suggestions.getByText('Item sources',{exact:true}).click();await suggestions.getByText('Coding sources',{exact:true}).click();await suggestions.getByText('Suggested coding: costCentre: Operations · project: Site · glAccount: 6100',{exact:true}).waitFor();
 const source=run.output.candidates[0].codingSources.find(row=>row.kind==='revision');assert.equal(source.id,f.history.id+':1');assert.equal(run.output.candidates[0].sources.find(row=>row.kind==='catalogue').id,f.item.id);assert.equal(run.output.candidates[0].unitMinor,25000);
 await suggestions.getByText('Purchase '+f.history.id+' · revision 1 · line '+f.history.lines[0].id,{exact:false}).waitFor();const route=agent.getByRole('region',{name:'Intake predicted route',exact:true});await route.getByText('Equipment approval · '+intakeEmail(5),{exact:true}).waitFor();assert.equal(run.output.route.ready,true);assert.deepEqual(run.output.route.steps.map(step=>step.approver),[intakeEmail(5),intakeEmail(9)]);
 const after=(await f.h.state()).data;for(const kind of ['request','intakeDraft','decision','commitment','order'])assert.deepEqual(after[kind],before[kind]);assert.equal(f.h.messages.length,mailCount);await capture(page,agent,'sources-and-route');
 await agent.getByRole('checkbox').check();const reviewed=page.waitForResponse(response=>response.url().endsWith('/command/intake-agent-draft'));await agent.getByRole('button',{name:'Create reviewed intake draft',exact:true}).click();assert.equal((await reviewed).status(),200);
 const guided=page.getByRole('form',{name:'Category request form',exact:true});await guided.getByLabel('Request title',{exact:true}).fill('Requester edited laptop need');await guided.getByLabel('Quantity',{exact:true}).fill('2');await guided.getByRole('button',{name:'Save unfinished draft',exact:true}).click();await guided.getByRole('status').filter({hasText:'Saved draft'}).waitFor();
 assert.equal(await guided.getByLabel('Unit price',{exact:true}).inputValue(),'250.00');await capture(page,guided,'editable-draft');
 const completion=page.waitForResponse(response=>response.url().endsWith('/command/intake-complete'));await guided.getByRole('button',{name:'Create purchase request draft',exact:true}).click();const completedResponse=await completion;assert.equal(completedResponse.status(),200);const request=await completedResponse.json();assert.equal(request.status,'draft');assert.equal(request.totalMinor,50000);assert.equal((await f.h.state()).data.commitment.length,before.commitment.length);
 const submitted=page.waitForResponse(response=>response.url().endsWith('/command/submit'));await page.getByRole('region',{name:'Guided purchase intake',exact:true}).getByRole('button',{name:'Submit for approval',exact:true}).click();assert.equal((await submitted).status(),200);await page.getByRole('status').filter({hasText:'Submitted for approval'}).waitFor();assert.equal((await f.h.state()).data.commitment.filter(row=>row.request===request.id).reduce((sum,row)=>sum+row.amountMinor,0),50000);
 await agent.getByRole('button',{name:'Start another intake',exact:true}).click();await agent.getByLabel('Describe your need',{exact:true}).fill('Laptop dock');
 const alternatives=page.waitForResponse(response=>response.url().endsWith('/command/intake-agent-run'));await agent.getByRole('button',{name:'Prepare intake suggestions',exact:true}).click();assert.equal((await alternatives).status(),200);
 await agent.getByLabel('Suggested catalogue item',{exact:true}).selectOption(f.dock.id);
 const selected=page.waitForResponse(response=>response.url().endsWith('/command/intake-agent-answer'));await agent.getByRole('button',{name:'Answer intake follow-up',exact:true}).click();const selectedResponse=await selected;assert.equal(selectedResponse.status(),200);const chosen=await selectedResponse.json();
 assert.equal(chosen.output.fields.lines[0].glAccount,'6500');
 const dock=suggestions.locator('article').filter({has:page.getByRole('heading',{name:'Equipment dock',exact:true})});
 await dock.getByText('Coding sources',{exact:true}).click();await dock.getByText('Suggested coding: costCentre: Operations · project: Site · glAccount: 6500',{exact:true}).waitFor();
 await dock.getByText('Purchase '+f.history.id+' · revision 1 · line '+f.history.lines[1].id,{exact:false}).waitFor();
 await capture(page,agent,'distinct-line-citations');
 await controls.getByLabel('Pause reason',{exact:true}).fill('Pause deterministic intake during review');const paused=owner.waitForResponse(response=>response.url().endsWith('/command/agent-pause'));await controls.getByRole('button',{name:'Pause this agent for every type',exact:true}).click();assert.equal((await paused).status(),200);
 await agent.getByRole('button',{name:'Answer intake follow-up',exact:true}).click();await agent.getByRole('alert').filter({hasText:'paused or not enabled'}).waitFor();assert.equal(f.h.messages.length,mailCount);assert.deepEqual(errors,[]);
 console.log('Native intake follow-up, exact citations, reviewed draft, requester edit and ordinary submission passed at 1440; changed screens captured at 1440 and 390');
}catch(error){
 console.error('Browser errors:',JSON.stringify(errors));
 for(const [index,context] of contexts.entries())for(const page of context.pages()){
  await writeFile(join(evidence,'failure-'+index+'.html'),await page.content());await page.screenshot({path:join(evidence,'failure-'+index+'.png')});
 }
 throw error;
}finally{for(const context of contexts)await context.close();await f.close();await browser.close();}
