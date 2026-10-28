import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { harness } from './purse-harness.mjs';
import { nativeWebContext } from './native-web-fixture.mjs';
import { creditEmail, supplierCreditsFixture } from './supplier-credits-fixture.mjs';
const { chromium } = await import(process.env.PURSE_PLAYWRIGHT_MODULE || '@playwright/test');
const evidence = resolve(process.env.PURSE_EVIDENCE || '.cache/supplier-credits'); await mkdir(evidence, { recursive: true });
const bundle = await build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);", resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PURSE_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--use-mock-keychain', '--password-store=basic', ...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH ? ['--no-sandbox'] : [])] });
const h = await harness(), contexts = [];
try {
    const f = await supplierCreditsFixture(h);
    const pageFor = async (cookie, width) => { const context = await nativeWebContext(browser, h, width, bundle.outputFiles[0].text, cookie); contexts.push(context); return context.newPage(); };
    const page = await pageFor(f.buyer, 1440); await page.goto(h.origin + '/app?tab=Orders&receipt=' + f.order.id);
    const panel = page.getByRole('region', { name: 'Returns and supplier credits', exact: true }); await panel.waitFor();
    await panel.getByText('Prepare return authorization', { exact: true }).click(); await panel.getByLabel('Return or rejection', { exact: true }).selectOption(f.returned.id); await panel.getByLabel('RMA preparation reason').fill('Prepare RMA for the three returned units');
    const prepare = page.waitForResponse(row => row.url().endsWith('/command/rma-prepare')); await panel.getByRole('button', { name: 'Prepare RMA', exact: true }).click(); assert.equal((await prepare).status(), 200); await panel.getByText('RMA · Prepared · prepared', { exact: true }).waitFor();
    await panel.getByText('Record supplier RMA outcome', { exact: true }).click(); await panel.getByLabel('RMA outcome', { exact: true }).selectOption('authorized'); await panel.getByLabel('Supplier RMA reference').fill('synthetic-purse-6220'); await panel.getByLabel('RMA outcome evidence').fill('Buyer records the supplier authorization');
    const outcome = page.waitForResponse(row => row.url().endsWith('/command/rma-record')); await panel.getByRole('button', { name: 'Save RMA outcome', exact: true }).click(); assert.equal((await outcome).status(), 200); await panel.getByText('RMA · synthetic-purse-6220 · authorized', { exact: true }).waitFor();
    await panel.getByText('Capture credit memo', { exact: true }).click(); const rma = (await h.state()).data.supplierRma[0];
    await panel.getByLabel('Credit return', { exact: true }).selectOption(rma.id); await panel.getByLabel('Credit memo reference', { exact: true }).fill('synthetic-purse-6208'); await panel.getByLabel('Credit date', { exact: true }).fill('2026-10-24'); await panel.getByLabel('Credit amount (USD)', { exact: true }).fill('300.00'); await panel.getByLabel('Credit source', { exact: true }).fill('Supplier original for the returned units');
    await panel.getByLabel('Credit original', { exact: true }).setInputFiles({ name: f.document.name, mimeType: f.document.mediaType, buffer: Buffer.from(f.document.base64, 'base64') });
    const capture = page.waitForResponse(row => row.url().endsWith('/command/supplier-credit-capture')); await panel.getByRole('button', { name: 'Capture credit original', exact: true }).click(); assert.equal((await capture).status(), 200);
    const creditPanel = panel.getByRole('region', { name: 'Credit memo synthetic-purse-6208', exact: true }); await creditPanel.waitFor();
    const sourceLink = creditPanel.getByRole('link', { name: 'Download credit original', exact: true }); assert.equal((await h.send(new URL(await sourceLink.getAttribute('href'), h.origin).pathname, undefined, f.buyer)).status, 200);
    await panel.screenshot({ path: join(evidence, 'credit-source-review-1440.png') });
    await creditPanel.getByRole('checkbox').check(); await creditPanel.getByLabel('Credit source review reason').fill('Checked supplier, return, PO, reference, amount, date and currency against the original'); const confirm = page.waitForResponse(row => row.url().endsWith('/command/supplier-credit-review')); await creditPanel.getByRole('button', { name: 'Confirm credit source review', exact: true }).click(); assert.equal((await confirm).status(), 200); await creditPanel.getByText('Source reviewed · Open credit $300.00', { exact: true }).waitFor();
    await creditPanel.getByText('Apply credit to a native bill', { exact: true }).click(); await creditPanel.getByLabel('Later native bill').selectOption(f.invoice.id); await creditPanel.getByLabel('Credit application amount').fill('300.01'); await creditPanel.getByLabel('Credit allocation reason').fill('Apply returned-goods credit');
    const excessive = page.waitForResponse(row => row.url().endsWith('/command/supplier-credit-apply')); await creditPanel.getByRole('button', { name: 'Apply reviewed credit', exact: true }).click(); assert.equal((await excessive).status(), 409); await creditPanel.getByRole('alert').filter({ hasText: 'exceeds' }).waitFor(); assert.equal((await h.state()).data.supplierCreditApplication.length, 0);
    await creditPanel.getByLabel('Credit application amount').fill('300.00'); const apply = page.waitForResponse(row => row.url().endsWith('/command/supplier-credit-apply')); await creditPanel.getByRole('button', { name: 'Apply reviewed credit', exact: true }).click(); assert.equal((await apply).status(), 200); await creditPanel.getByText('Source reviewed · Open credit $0.00', { exact: true }).waitFor();
    const billRow = page.getByRole('row').filter({ hasText: 'synthetic-purse-6207' }).filter({ hasText: '$700.00' }); assert.equal(await billRow.count(), 1);
    assert.equal((await h.state()).data.invoice.find(row => row.id === f.invoice.id).totalMinor, 100000);
    await panel.screenshot({ path: join(evidence, 'credit-applied-1440.png') });
    const phone = await pageFor(f.buyer, 390); await phone.goto(h.origin + '/app?tab=Orders&receipt=' + f.order.id); const phonePanel = phone.getByRole('region', { name: 'Returns and supplier credits', exact: true }); await phonePanel.getByText('Source reviewed · Open credit $0.00', { exact: true }).waitFor(); await phonePanel.screenshot({ path: join(evidence, 'credit-applied-390.png') });
    for (const target of [page, phone]) {
        await target.getByRole('region', { name: 'Supplier credit balances', exact: true }).screenshot({ path: join(evidence, `supplier-balances-${target.viewportSize().width}.png`) });
        await target.goto(h.origin + '/app?tab=Orders&receipt=' + f.laterOrder.id); await target.getByRole('heading', { name: 'Invoice synthetic-purse-6207', exact: true }).waitFor(); await target.locator('#invoice-' + f.invoice.id).screenshot({ path: join(evidence, `unchanged-invoice-original-${target.viewportSize().width}.png`) });
    }
    await page.goto(h.origin + '/app?tab=Orders&receipt=' + f.order.id); await panel.waitFor(); await panel.getByText('Capture credit memo', { exact: true }).click();
    await panel.getByLabel('Credit return', { exact: true }).selectOption(rma.id); await panel.getByLabel('Credit memo reference', { exact: true }).fill('synthetic-purse-6208'); await panel.getByLabel('Credit date', { exact: true }).fill('2026-10-24'); await panel.getByLabel('Credit amount (USD)', { exact: true }).fill('301.00'); await panel.getByLabel('Credit source', { exact: true }).fill('Changed credit source'); await panel.getByLabel('Credit original', { exact: true }).setInputFiles({ name: f.document.name, mimeType: f.document.mediaType, buffer: Buffer.from(f.document.base64, 'base64') });
    const duplicate = page.waitForResponse(row => row.url().endsWith('/command/supplier-credit-capture')); await panel.getByRole('button', { name: 'Capture credit original', exact: true }).click(); assert.equal((await duplicate).status(), 409); await panel.getByRole('alert').filter({ hasText: 'conflicting' }).waitFor();
    await h.command('member', { email: creditEmail(6202), name: 'Buyer revoked', active: true, roles: ['requester'] }); const revoked = page.waitForResponse(row => row.url().endsWith('/command/supplier-credit-capture')); await panel.getByRole('button', { name: 'Capture credit original', exact: true }).click(); assert.equal((await revoked).status(), 403); assert.equal((await h.state()).data.supplierCreditApplication.length, 1);
    console.log('Supplier credits native web journey passed at 1440; changed screens captured at 1440 and 390');
} finally { for (const context of contexts) await context.close(); await h.close(); await browser.close(); }
