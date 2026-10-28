import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { harness } from './purse-harness.mjs';
import { nativeWebContext } from './native-web-fixture.mjs';
import { orderSendFixture, orderLink } from './order-send-fixture.mjs';

export async function supplierInvoiceJourney(browser, bundle, width, evidence) {
    const h = await harness(), contexts = [];
    try {
        const f = await orderSendFixture(h), errors = [];
        await f.send(); const link = orderLink(h);
        await h.command('receipt', { order: f.order.id, line: f.order.lines[0].id, event: 'receive', quantity: '1', reason: 'synthetic-purse-4550' });
        const supplierContext = await browser.newContext({ viewport: { width, height: 1000 } }); contexts.push(supplierContext); const supplier = await supplierContext.newPage(); supplier.on('pageerror', error => errors.push(error.message));
        await supplier.goto(link.href); await supplier.getByLabel('Your name', { exact: true }).fill('synthetic-purse-4551'); await supplier.getByRole('checkbox').check();
        const ack = supplier.waitForResponse(response => response.url() === link.href && response.request().method() === 'POST'); await supplier.getByRole('button', { name: 'Acknowledge revision 2', exact: true }).click(); assert.equal((await ack).status(), 200);
        const ownerContext=await nativeWebContext(browser,h,width,bundle,h.owner);contexts.push(ownerContext);const ownerPage=await ownerContext.newPage();await ownerPage.goto(h.origin+'/app?tab=Orders');await ownerPage.getByRole('row').filter({has:ownerPage.getByText(f.order.number,{exact:true})}).filter({has:ownerPage.getByText('issued',{exact:true})}).getByRole('button',{name:'Open order',exact:true}).click();const access=ownerPage.getByRole('region',{name:'Supplier change order',exact:true});await access.getByLabel('Supplier invoice access',{exact:true}).selectOption('yes');await access.getByLabel('Invoice access reason',{exact:true}).fill('Owner shares exact remaining received and billed quantities for this supplier invoice');const granted=ownerPage.waitForResponse(r=>r.url().endsWith('/invoice-consent'));await access.getByRole('button',{name:'Save supplier invoice access',exact:true}).click();assert.equal((await granted).status(),200);await access.getByText('Supplier invoice access: Owner authorized.',{exact:false}).waitFor();await access.screenshot({path:join(evidence,`INVOICE-005-owner-consent-${width}.png`)});
        await ownerPage.goto(h.origin+'/app?tab=Settings');
        const rules=ownerPage.getByRole('heading',{name:'Supplier invoice approval',exact:true}).locator('..');
        await rules.getByLabel('Automatic invoice approval',{exact:true}).selectOption('yes');
        await rules.getByLabel('Standing approval reason',{exact:true}).fill('Approve this exact matched PO after AP confirms the private source');
        await rules.getByLabel('I consent to this exact standing approval rule',{exact:true}).check();
        const ruleSaved=ownerPage.waitForResponse(response=>response.url().endsWith('/command/supplier-invoice-rule'));
        await rules.getByRole('button',{name:'Save supplier invoice approval rule',exact:true}).click();assert.equal((await ruleSaved).status(),200);
        await rules.getByText('Standing approval authorized',{exact:true}).waitFor();
        await rules.screenshot({path:join(evidence,`INVOICE-005-standing-rule-${width}.png`)});
        await supplier.goto(link.href); await supplier.getByRole('link', { name: 'Submit an invoice', exact: true }).click(); await supplier.getByRole('heading', { name: 'Submit an invoice', exact: true }).waitFor();
        assert.equal(await supplier.getByLabel('Invoice quantity', { exact: true }).inputValue(), '1'); assert.equal(await supplier.getByLabel('Invoice unit price (USD)', { exact: true }).inputValue(), '100.00');
        assert.equal(await supplier.getByLabel(/remit|bank|routing/i).count(), 0);
        await supplier.screenshot({ path: join(evidence, `INVOICE-005-prefill-${width}.png`), fullPage: true });
        const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), page = doc.addPage([650,790]);
        const lines = ['Supplier: ' + f.supplier.name, 'Invoice number: synthetic-purse-4552', 'Invoice date: 2026-10-23', 'PO number: ' + f.order.number, 'Currency: USD', 'Item: ' + f.order.lines[0].description, 'Quantity: 1', 'Unit price: 100.00', 'Line amount: 100.00', 'Subtotal: 100.00', 'Freight: 0.00', 'Tax: 0.00', 'Total: 100.00'];
        lines.forEach((text, index) => page.drawText(text, { x: 20, y: 760 - 24 * index, size: 10, font })); const bytes = Buffer.from(await doc.save());
        await supplier.getByLabel('Invoice number', { exact: true }).fill('synthetic-purse-4552'); await supplier.getByLabel('Invoice date', { exact: true }).fill('2026-10-23');
        await supplier.getByLabel('Original invoice PDF (up to 1 MB)', { exact: true }).setInputFiles({ name: 'synthetic-purse-4552.pdf', mimeType: 'application/pdf', buffer: bytes }); await supplier.getByRole('checkbox').check();
        const submission = supplier.waitForResponse(response => response.url() === link.href + '/invoices' && response.request().method() === 'POST'); await supplier.getByRole('button', { name: 'Submit invoice', exact: true }).click(); const received = await submission; assert.equal(received.status(), 200, await received.text());const submittedHeaders=await received.request().allHeaders();assert.ok(!submittedHeaders.referer||new URL(submittedHeaders.referer).pathname==='/', 'Invoice form never exposes its private bearer path in a referrer');
        await supplier.getByRole('heading', { name: 'Invoice received', exact: true }).waitFor(); await supplier.screenshot({ path: join(evidence, `INVOICE-005-received-${width}.png`), fullPage: true });
        await supplier.getByRole('link', { name: 'View your submissions and remaining quantity', exact: true }).click(); assert.equal(await supplier.getByLabel('Invoice quantity', { exact: true }).inputValue(), '0'); await supplier.getByRole('heading', { name: 'synthetic-purse-4552', exact: true }).waitFor();
        const state = (await h.state()).data, invoice = state.invoice.find(value => value.reference === 'synthetic-purse-4552'); assert.equal(invoice.sourceConfirmation, 'pending'); assert.equal(state.payable.length, 0);
        const buyerContext = await nativeWebContext(browser, h, width, bundle, f.buyer); contexts.push(buyerContext); const buyer = await buyerContext.newPage(); buyer.on('pageerror', error => errors.push(error.message));
        await buyer.goto(h.origin + '/app?tab=Orders'); await buyer.getByRole('row').filter({ has: buyer.getByText(f.order.number, { exact: true }) }).filter({ has: buyer.getByText('issued', { exact: true }) }).getByRole('button', { name: 'Open order', exact: true }).click();
        const review = buyer.getByRole('region', { name: 'Invoice document review', exact: true }); await review.getByLabel('Supplier invoice original', { exact: true }).selectOption(invoice.id); await review.getByRole('button', { name: 'Review supplier invoice original', exact: true }).click(); await review.getByLabel('Saved invoice reading', { exact: true }).waitFor();
        await buyer.screenshot({ path: join(evidence, `INVOICE-005-buyer-original-${width}.png`), fullPage: true });
        const original = state.attachment.find(file => file.kind === 'invoice' && file.record === invoice.id), privateDownload = await buyerContext.request.get(h.origin + '/api/purse/download/attachment/' + original.id); assert.equal(privateDownload.status(), 200); assert.deepEqual(await privateDownload.body(), bytes); assert.equal((await supplierContext.request.get(h.origin + '/api/purse/download/attachment/' + original.id)).status(), 401);
        await review.getByText('Invoice reading · review',{exact:true}).waitFor();
        await review.getByText('Confirm reviewed invoice',{exact:true}).click();
        await review.getByLabel('Invoice item 1 PO line',{exact:true}).selectOption(f.order.lines[0].id);
        await review.getByLabel('I reviewed every invoice field and original',{exact:true}).check();
        await review.getByLabel('Invoice confirmation reason',{exact:true}).fill('AP reviewed exact supplier original against received PO');
        const confirmed=buyer.waitForResponse(response=>response.url().endsWith('/command/invoice-reading-confirm'));
        await review.getByRole('button',{name:'Create invoice from reviewed original',exact:true}).click();const confirmedResponse=await confirmed;assert.equal(confirmedResponse.status(),200,await confirmedResponse.text());
        await supplier.reload();
        await supplier.getByRole('heading',{name:'synthetic-purse-4552',exact:true}).locator('..').getByText(/ · approved$/).waitFor();
        assert.equal((await h.state()).data.invoice.find(value=>value.id===invoice.id).paymentApproval.match,'three-way');
        await supplier.screenshot({path:join(evidence,`INVOICE-005-approved-${width}.png`),fullPage:true});
        await ownerPage.reload();
        await rules.getByLabel('Scheduled payment date',{exact:true}).fill('2026-11-20');
        await rules.getByLabel('Scheduling reason',{exact:true}).fill('AP native payment instruction for the approved supplier invoice');
        const scheduled=ownerPage.waitForResponse(response=>response.url().endsWith('/command/supplier-invoice-schedule'));
        await rules.getByRole('button',{name:'Schedule approved supplier invoice',exact:true}).click();assert.equal((await scheduled).status(),200);
        await supplier.reload();await supplier.getByRole('heading',{name:'synthetic-purse-4552',exact:true}).locator('..').getByText(/ · scheduled$/).waitFor();
        await supplier.screenshot({path:join(evidence,`INVOICE-005-scheduled-${width}.png`),fullPage:true});
        await supplier.getByLabel('Invoice number', { exact: true }).fill('synthetic-purse-4553'); await supplier.getByLabel('Invoice date', { exact: true }).fill('2026-10-23'); await supplier.getByLabel('Invoice quantity', { exact: true }).fill('1'); await supplier.getByLabel('Original invoice PDF (up to 1 MB)', { exact: true }).setInputFiles({ name: 'synthetic-purse-4552.pdf', mimeType: 'application/pdf', buffer: bytes }); await supplier.getByRole('checkbox').check();
        const secondSubmission = supplier.waitForResponse(response => response.url() === link.href + '/invoices' && response.request().method() === 'POST'); await supplier.getByRole('button', { name: 'Submit invoice', exact: true }).click(); const secondResponse = await secondSubmission; assert.equal(secondResponse.status(), 200, await secondResponse.text()); await supplier.getByRole('link', { name: 'View your submissions and remaining quantity', exact: true }).click();
        await supplier.getByRole('heading', { name: 'synthetic-purse-4553', exact: true }).waitFor(); await supplier.screenshot({ path: join(evidence, `INVOICE-005-own-status-${width}.png`), fullPage: true });
        const excess = (await h.state()).data.invoice.find(value => value.reference === 'synthetic-purse-4553'); assert.ok(excess.flags.some(flag => flag.code === 'po-balance')); assert.ok(excess.flags.some(flag => flag.code === 'duplicate-document')); assert.equal(excess.allocations[0].q, 1000);
        assert.equal(await supplier.getByText(/duplicate-document|riskReviews|approved automatically|paid/i).count(), 0);
        assert.equal((await h.send('/api/purse/command/supplier-invoice-schedule',{invoice:excess.id,version:0,date:'2026-11-20',reason:'Cannot schedule held excess'},f.buyer)).status,409);
        await ownerPage.reload();await rules.screenshot({path:join(evidence,`INVOICE-005-native-instruction-${width}.png`)});
        for (const visible of [supplier, buyer]) assert.equal(await visible.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No overflow at ' + width);
        assert.deepEqual(errors, []); return { width, order: f.order.id, submission: invoice.id, sourceConfirmation: 'confirmed', matching: 'three-way', paymentApproval: 'approved-and-scheduled' };
    } finally { for (const context of contexts) await context.close(); await h.close(); }
}
async function main() {
    const selected = process.argv.find(argument => argument.startsWith('--width=')), widths = selected ? [Number(selected.slice(8))] : [1440,390]; assert.ok(widths.every(width => [1440,390].includes(width)));
    const evidence = resolve(process.env.PURSE_EVIDENCE ?? '.cache/supplier-invoice'); await mkdir(evidence, { recursive: true });
    const bundle = await build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);", resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
    const { chromium } = await import(process.env.PURSE_PLAYWRIGHT_MODULE ?? '@playwright/test'); const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain','--password-store=basic','--no-sandbox'], ...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PURSE_CHROMIUM_EXECUTABLE_PATH } : {}) });
    try { for (const width of widths) console.log(JSON.stringify(await supplierInvoiceJourney(browser, bundle.outputFiles[0].text, width, evidence))); } finally { await browser.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
