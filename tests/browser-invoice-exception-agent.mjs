import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { nativeWebContext } from './native-web-fixture.mjs';
import { invoiceExceptionAgentFixture } from './invoice-exception-agent-fixture.mjs';
const { chromium } = await import(process.env.PURSE_PLAYWRIGHT_MODULE || '@playwright/test');
const evidence = resolve(process.env.PURSE_EVIDENCE || '.cache/invoice-exception-agent');
await mkdir(evidence, { recursive: true });
const bundle = await build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);", resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'], ...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PURSE_CHROMIUM_EXECUTABLE_PATH } : {}) });
const f = await invoiceExceptionAgentFixture(), contexts = [];
try {
    const context = async (cookie, width = 1440) => { const c = await nativeWebContext(browser, f.h, width, bundle.outputFiles[0].text, cookie); contexts.push(c); return c; };
    const owner = await (await context(f.h.owner)).newPage(), buyer = await (await context(f.buyer)).newPage();
    const errors = []; for (const page of [owner, buyer]) page.on('pageerror', e => errors.push(e.message));
    const price = await f.create(7140), short = await f.create(7150, '10', '1000.00', '8');
    const snapshot = (await f.raw()).filter(r => !['agentRun', 'audit', 'agentPolicy'].includes(r.kind));
    const originalAge = (await f.item(price.invoice.id)).openedAt, messages = f.h.messages.length;
    await owner.goto(f.h.origin + '/app?tab=Settings');
    const controls = owner.getByRole('region', { name: 'Agent controls', exact: true });
    await controls.getByLabel('Native agent', { exact: true }).selectOption('AGENT-004');
    await controls.getByLabel('Agent purchase type', { exact: true }).fill('equipment');
    await controls.getByLabel('Agent state', { exact: true }).selectOption('yes');
    await controls.getByLabel('Agent control reason', { exact: true }).fill('Owner enables invoice exception drafts');
    await controls.getByRole('button', { name: 'Save agent controls', exact: true }).click();
    await controls.getByRole('cell', { name: 'Invoice exceptions', exact: true }).waitFor();
    await owner.screenshot({ path: join(evidence, 'exception-controls-1440.png'), fullPage: true });
    await buyer.goto(f.h.origin + '/app?tab=Orders');
    const item = purchase => buyer.getByRole('region', { name: 'Exception ' + purchase.invoice.reference, exact: true });
    for (const purchase of [price, short]) {
        const region = item(purchase);
        await region.getByText('Invoice exception agent', { exact: true }).click();
        await region.getByRole('button', { name: 'Prepare exception drafts', exact: true }).click();
        await region.getByRole('region', { name: 'Exception agent report', exact: true }).waitFor();
    }
    const priceReport = item(price).getByRole('region', { name: 'Exception agent report', exact: true });
    await priceReport.getByRole('heading', { name: 'Corrected invoice or credit request draft', exact: true }).waitFor();
    assert.match(await priceReport.innerText(), /issued-price amount is 100000; the billed difference is 10000/);
    const shortReport = item(short).getByRole('region', { name: 'Exception agent report', exact: true });
    await shortReport.getByRole('heading', { name: 'Receiver review draft', exact: true }).waitFor();
    assert.match(await shortReport.innerText(), /8 accepted against 10 invoiced/);
    for (const report of [priceReport, shortReport]) await report.getByText('Cited source evidence', { exact: true }).click();
    const runs = (await f.h.state(f.buyer)).data.agentRun.filter(r => r.agent === 'AGENT-004');
    for (const run of runs) {
        assert.equal((await f.h.send('/api/purse/download/agentRun/' + run.id, undefined, f.buyer)).status, 200);
        for (const ref of run.references) assert.ok((await f.raw()).some(r => r.kind === ref.kind && r.id === ref.id && r.revision === ref.version));
    }
    assert.equal((await f.item(price.invoice.id)).openedAt, originalAge);
    assert.deepEqual((await f.raw()).filter(r => !['agentRun', 'audit', 'agentPolicy'].includes(r.kind)), snapshot);
    assert.equal(f.h.messages.length, messages);
    assert.equal(await buyer.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await buyer.screenshot({ path: join(evidence, 'exception-drafts-1440.png'), fullPage: true });
    // Phone proof reuses the same outcomes, without duplicating the functional journey.
    const phoneOwner = await (await context(f.h.owner, 390)).newPage(), phoneBuyer = await (await context(f.buyer, 390)).newPage();
    await phoneOwner.goto(f.h.origin + '/app?tab=Settings');
    await phoneOwner.getByLabel('Native agent', { exact: true }).selectOption('AGENT-004');
    await phoneOwner.screenshot({ path: join(evidence, 'exception-controls-390.png'), fullPage: true });
    await phoneBuyer.goto(f.h.origin + '/app?tab=Orders');
    for (const purchase of [price, short]) {
        const region = phoneBuyer.getByRole('region', { name: 'Exception ' + purchase.invoice.reference, exact: true });
        await region.getByText('Invoice exception agent', { exact: true }).click();
    }
    assert.equal(await phoneBuyer.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Phone smoke fits the viewport');
    await phoneBuyer.screenshot({ path: join(evidence, 'exception-drafts-390.png'), fullPage: true });
    await f.controls(false); await buyer.reload();
    await item(price).getByText('Invoice exception agent', { exact: true }).click();
    await item(price).getByText('Paused or not enabled', { exact: false }).waitFor();
    assert.equal(await item(price).getByRole('button', { name: 'Prepare exception drafts', exact: true }).count(), 0);
    const receiver = await (await context(f.receiver)).newPage(); await receiver.goto(f.h.origin + '/app?tab=Orders');
    assert.equal(await receiver.getByText('Invoice exception agent', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('Invoice exception draft journey passed at 1440; changed screens recorded at 1440 and 390');
} finally {
    for (const context of contexts) await context.close();
    await browser.close(); await f.h.close();
}
