import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { nativeWebContext } from './native-web-fixture.mjs';
import { codingAgentFixture } from './coding-agent-fixture.mjs';

const { chromium } = await import(process.env.PURSE_PLAYWRIGHT_MODULE || '@playwright/test');
const selected = process.argv.find(arg => arg.startsWith('--width=')), widths = selected ? [Number(selected.split('=')[1])] : [1440, 390];
const evidence = resolve(process.env.PURSE_EVIDENCE || '.cache/coding-agent'); await mkdir(evidence, { recursive: true });
const bundle = await build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);", resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'], ...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PURSE_CHROMIUM_EXECUTABLE_PATH } : {}) });
try {
 for (const width of widths) {
  const f = await codingAgentFixture(), contexts = [], errors = [];
  try {
   const open = async cookie => { const context = await nativeWebContext(browser, f.h, width, bundle.outputFiles[0].text, cookie); contexts.push(context); const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); return page; };
   const snap = async (page, name, target=page) => { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Coding page fits ' + width);const icons=await page.locator('button').evaluateAll(buttons=>buttons.filter(button=>!button.textContent.trim()).map(button=>({name:button.getAttribute('aria-label'),tooltip:button.getAttribute('aria-describedby')})));assert.ok(icons.every(icon=>icon.name&&icon.tooltip),'Icon-only controls have tooltips');await target.screenshot({ path: join(evidence, `AGENT-008-${name}-${width}.png`), ...(target===page?{fullPage:true}:{}) }); };
   await f.enable(true);
   const first = await f.makeRequest('First near-threshold safety request', 95000), second = await f.makeRequest('Second near-threshold safety request', 95000); await f.submit(first); await f.submit(second);
   const approver = await open(f.approver); await approver.goto(f.h.origin + '/app?tab=Requests&request=' + second.id);
   const policy = approver.getByRole('region', { name: 'Coding and policy agent for ' + second.title, exact: true });
   await policy.getByText('Coding and policy suggestions', { exact: true }).click();
   const runResponse = approver.waitForResponse(response => response.url().endsWith('/command/coding-agent-run'));
   await policy.getByRole('button', { name: 'Suggest coding and check policy', exact: true }).click(); assert.equal((await runResponse).status(), 200);
   await policy.getByText('Possible split purchase · approver review', { exact: true }).waitFor();
   await policy.getByText('Policy flag sources', { exact: true }).click();
   assert.equal(await policy.getByRole('button', { name: 'Record coding choice', exact: true }).count(), 0, 'Approver sees flags without requester editing authority');
   await snap(approver, 'approver-split',policy);
   const order = await f.purchase('Invoice correction history'), invoices = [];
   for (let index = 0; index < 3; index++) invoices.push(await f.invoice(order, 'BROWSER-CODING-' + index));
   for (const invoice of invoices.slice(0, 2)) await f.cmd('coding-agent-run', { kind: 'invoice', id: invoice.id }, f.buyer);
   const buyer = await open(f.buyer); await buyer.goto(f.h.origin + '/app?tab=Orders&receipt=' + order.id);
   for (const invoice of invoices.slice(0, 2)) {
    const region = buyer.getByRole('region', { name: 'Coding and policy agent for ' + invoice.reference, exact: true });
    await region.getByText('Coding and policy suggestions', { exact: true }).click();
    await region.getByText('Accept or correct these suggestions', { exact: true }).click();
    await region.getByLabel('Coding GL account', { exact: true }).fill('6200'); await region.getByLabel('Coding review reason', { exact: true }).fill('Human reviewed the supplier invoice and corrects the GL account');
    const corrected = buyer.waitForResponse(response => response.url().endsWith('/command/coding-agent-review'));
    await region.getByRole('button', { name: 'Record coding choice', exact: true }).click(); const response = await corrected; assert.equal(response.status(), 200); assert.equal((await response.json()).outcome, 'corrected');
    await region.getByText('Human corrected coding:', { exact: false }).waitFor();await snap(buyer,'correction-'+invoice.reference,region);
   }
   const third = buyer.getByRole('region', { name: 'Coding and policy agent for ' + invoices[2].reference, exact: true });
   await third.getByText('Coding and policy suggestions', { exact: true }).click();
   const learned = buyer.waitForResponse(response => response.url().endsWith('/command/coding-agent-run'));
   await third.getByRole('button', { name: 'Suggest coding and check policy', exact: true }).click(); const response = await learned; assert.equal(response.status(), 200); const run = await response.json();
   assert.equal(run.suggestions.find(row => row.field === 'glAccount').value, '6200');
   await third.getByText('GL account: 6200', { exact: true }).waitFor();
   const account = third.getByRole('row').filter({ hasText: 'GL account: 6200' });
   for (const invoice of invoices.slice(0, 2)) { await account.getByText('Human coding example · ' + invoice.reference, { exact: true }).click(); await account.getByRole('link', { name: 'Open invoice ' + invoice.reference + ' on its PO', exact: true }).first().waitFor(); }
   await third.getByRole('link', { name: 'Download complete coding record', exact: true }).waitFor(); await snap(buyer, 'learned-account-sources',third);
   const owner = await open(f.h.owner); await owner.goto(f.h.origin + '/app?tab=Settings');
   const controls = owner.getByRole('region', { name: 'Agent controls', exact: true }); await controls.getByLabel('Native agent', { exact: true }).selectOption('AGENT-008'); await controls.getByLabel('Pause reason', { exact: true }).fill('Pause coding suggestions during policy review');
   const paused = owner.waitForResponse(result => result.url().endsWith('/agent-pause')); await controls.getByRole('button', { name: 'Pause this agent for every type', exact: true }).click(); assert.equal((await paused).status(), 200); await snap(owner, 'owner-pause',controls);
   await third.getByRole('button', { name: 'Suggest coding and check policy', exact: true }).click(); await third.getByRole('alert').filter({ hasText: 'paused or not enabled' }).waitFor();
   assert.deepEqual(errors, []); console.log('AGENT-008 split review, two corrections, source-cited third invoice and pause passed at ' + width);
  } finally { for (const context of contexts.reverse()) await context.close(); await f.close(); }
 }
} finally { await browser.close(); }
