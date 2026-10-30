import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { harness } from './purse-harness.mjs';
import { nativeWebContext } from './native-web-fixture.mjs';
import { depositsFixture, depositDocument } from './deposits-fixture.mjs';
export async function depositsWebJourney() {
const { chromium } = await import(process.env.PURSE_PLAYWRIGHT_MODULE || '@playwright/test');
const evidence = resolve(process.env.PURSE_EVIDENCE || '.cache/deposits'); await mkdir(evidence, { recursive: true });
const bundle = await build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);", resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true, ...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PURSE_CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] });
const h = await harness(), contexts = [];
try {
    const f = await depositsFixture(h);
    const pageFor = async cookie => { const context = await nativeWebContext(browser, h, 1440, bundle.outputFiles[0].text, cookie); contexts.push(context); return context.newPage(); };
    const requester = await pageFor(f.requester), owner = await pageFor(h.owner), ap = await pageFor(f.ap), receiver = await pageFor(f.receiver);
    const errors = []; for (const page of [requester, owner, ap, receiver]) page.on('pageerror', error => errors.push(error.message));
    const capture = async (page, locator, name) => {
        for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); await locator.scrollIntoViewIfNeeded(); await locator.screenshot({ path: join(evidence, name + '-' + width + '.png') }); }
        await page.setViewportSize({ width: 1440, height: 1000 });
    };
    const input = f.input(null), draft = await f.cmd('request', input, f.requester);
    await requester.goto(h.origin + '/app?tab=Requests&request=' + draft.id);
    await requester.getByText('Revise or amend request', { exact: true }).click();
    const form = requester.locator('form').filter({ has: requester.getByRole('button', { name: 'Save revised draft', exact: true }) });
    await form.getByText('PO delivery and notes', { exact: true }).click();
    await form.getByLabel('Deposit basis', { exact: true }).selectOption('percentage'); await form.getByLabel('Deposit percentage', { exact: true }).fill('50');
    await form.getByLabel('Deposit due trigger', { exact: true }).selectOption('issue'); await form.getByLabel('Amendment reason', { exact: true }).fill('Record reviewed machinery deposit term');
    await capture(requester, form, 'PO-011-request-term');
    const saving = requester.waitForResponse(response => response.url().endsWith('/command/amend'));
    await form.getByRole('button', { name: 'Save revised draft', exact: true }).click(); assert.equal((await saving).status(), 200);
    const request = (await h.state()).data.request.find(row => row.id === draft.id); assert.equal(request.poDetails.deposit.amountMinor, 1000000);
    const submitting=requester.waitForResponse(response=>response.url().endsWith('/command/submit'));
    await requester.getByRole('button', { name: 'Submit for approval', exact: true }).click(); assert.equal((await submitting).status(),200);
    await f.cmd('decision', { id: request.id, revision: request.revision, decision: 'approved', reason: 'Independent exact deposit purchase approval' }, f.approver);
    const prepared = await f.cmd('convert', { id: request.id, revision: request.revision }, f.buyer);
    const order = await f.cmd('issue', { id: prepared.id, revision: prepared.revision, reason: 'Reviewed exact machinery order' }, f.buyer);

    await owner.goto(h.origin + '/app?tab=Settings'); const settings = owner.getByRole('region', { name: 'Deposit approval settings', exact: true });
    await settings.getByText(order.number + ' deposit consent', { exact: true }).click();
    await settings.getByLabel('Deposit approval rule', { exact: true }).selectOption('true');
    await settings.getByLabel('I consent to this exact deposit approval rule', { exact: true }).check();
    await settings.getByLabel('Deposit consent reason', { exact: true }).fill('Approve only exact source-confirmed term and fully received final bill');
    await capture(owner, settings, 'PO-011-owner-consent');
    const consenting = owner.waitForResponse(response => response.url().endsWith('/command/deposit-rule'));
    await settings.getByRole('button', { name: 'Save deposit approval consent', exact: true }).click(); assert.equal((await consenting).status(), 200);
    await ap.goto(h.origin + '/app?tab=Orders&receipt=' + order.id);
    const sourceRegion = ap.getByRole('region', { name: 'Invoice document review', exact: true });
    async function sourceBill(reference, amount, kind, screenshot) {
        const document = await depositDocument(order, reference, amount, kind);
        await sourceRegion.getByLabel('Invoice reading original', { exact: true }).setInputFiles({ name: document.name, mimeType: document.mediaType, buffer: Buffer.from(document.base64, 'base64') });
        const extracting = ap.waitForResponse(response => response.url().endsWith('/command/invoice-extract'));
        await sourceRegion.getByRole('button', { name: 'Stage and read invoice original', exact: true }).click(); assert.equal((await extracting).status(), 200);
        await sourceRegion.getByText('Document invoice number: ' + reference, { exact: true }).waitFor();
        await sourceRegion.getByText('Confirm reviewed invoice', { exact: true }).click();
        await sourceRegion.getByLabel('Invoice classification', { exact: true }).selectOption(kind);
        await sourceRegion.getByLabel('Invoice item 1 PO line', { exact: true }).selectOption(order.lines[0].id);
        await sourceRegion.getByLabel('I reviewed every invoice field and original', { exact: true }).check();
        await sourceRegion.getByLabel('Invoice confirmation reason', { exact: true }).fill('AP reviewed every value against the private machinery original');
        if (screenshot) await capture(ap, sourceRegion, 'PO-011-source-confirmation');
        const confirming = ap.waitForResponse(response => response.url().endsWith('/command/invoice-reading-confirm'));
        await sourceRegion.getByRole('button', { name: 'Create invoice from reviewed original', exact: true }).click(); assert.equal((await confirming).status(), 200);
        return (await h.state()).data.invoice.find(row => row.reference === reference);
    }
    const deposit = await sourceBill('synthetic-purse-7250', 1000000, 'deposit', true);
    assert.equal(deposit.paymentApproval.match, 'deposit-two-way'); assert.equal(deposit.allocations[0].q, 0);
    let data = (await h.state()).data;
    assert.equal(data.order.find(row => row.id === order.id).positions[0].accepted, 0);
    assert.equal(data.cashRequirements.bills.filter(row => row.order === order.id).reduce((n, row) => n + row.amountMinor, 0), 1000000);
    assert.equal(data.cashRequirements.commitments.find(row => row.order === order.id).amountMinor, 1000000);
    const position = ap.getByRole('region', { name: 'Deposit position', exact: true });
    await position.getByRole('link', { name: deposit.reference, exact: true }).click(); await ap.locator('[id="invoice-' + deposit.id + '"]').getByText('Two-way deposit match; no goods receipt required', { exact: true }).waitFor();
    await capture(ap, position, 'PO-011-prepaid-obligation');
    await ap.goto(h.origin+'/app?tab=Reports');await ap.getByRole('button',{name:'Received not billed',exact:true}).click();
    const accrual=ap.getByRole('region',{name:'Received not billed report',exact:true});
    await accrual.getByLabel('Period end',{exact:true}).fill('2099-12-31');
    const computing=ap.waitForResponse(response=>response.url().includes('/accrual-report/view?')&&response.status()===200);
    await accrual.getByRole('button',{name:'Run accrual report',exact:true}).click();
    const beforeReceipt=await(await computing).json();assert.equal(beforeReceipt.rows.length,0);assert.equal(beforeReceipt.deposits[0].amountMinor,1000000);assert.equal(beforeReceipt.deposits[0].unappliedMinor,1000000);
    await accrual.getByRole('link',{name:deposit.reference,exact:true}).waitFor();await capture(ap,accrual,'PO-011-accrual-prepaid');
    await ap.goto(h.origin+'/app?tab=Orders&receipt='+order.id);
    const final = await sourceBill('synthetic-purse-7251', 2000000, 'deposit-final', false);
    assert.equal(final.grossMinor, 2000000); assert.equal(final.totalMinor, 1000000); assert.equal(final.paymentApproval, undefined);
    await position.getByText('Evaluate ' + final.reference, { exact: true }).click();
    const premature = ap.waitForResponse(response => response.url().endsWith('/command/deposit-evaluate'));
    await position.getByRole('button', { name: 'Evaluate reviewed deposit bill', exact: true }).click(); assert.equal((await premature).status(), 409);
    await position.getByRole('alert').getByText('Resolve source, receipt and risk holds before evaluation', { exact: true }).waitFor();

    await receiver.goto(h.origin + '/app?tab=Orders&receipt=' + order.id);
    const receiving = receiver.locator('form').filter({ has: receiver.getByRole('button', { name: 'Record receiving event', exact: true }) });
    await receiving.getByLabel('PO line', { exact: true }).selectOption(order.lines[0].id); await receiving.getByLabel('Event', { exact: true }).selectOption('receive');
    await receiving.getByLabel('Quantity', { exact: true }).fill('10'); await receiving.getByLabel('Reason or service milestone', { exact: true }).fill('All machinery physically received');
    const receipt = receiver.waitForResponse(response => response.url().endsWith('/command/receipt'));
    await receiving.getByRole('button', { name: 'Record receiving event', exact: true }).click(); assert.equal((await receipt).status(), 200);
    await ap.reload(); await position.getByText('Evaluate ' + final.reference, { exact: true }).click();
    const evaluating = ap.waitForResponse(response => response.url().endsWith('/command/deposit-evaluate'));
    await position.getByRole('button', { name: 'Evaluate reviewed deposit bill', exact: true }).click(); assert.equal((await evaluating).status(), 200);
    await position.getByRole('row').filter({ has: ap.getByText('Final goods bill', { exact: true }) }).getByText('Approved', { exact: true }).waitFor();
    await capture(ap, position, 'PO-011-final-application');
    data = (await h.state()).data;
    assert.deepEqual(data.cashRequirements.bills.filter(row => row.order === order.id).map(row => row.amountMinor), [1000000, 1000000]);
    assert.equal(data.cashRequirements.commitments.filter(row => row.order === order.id).length, 0);
    assert.equal(data.periodBudgets.find(row => row.currency === 'USD').actualMinor, 2000000);
    const report = await ap.request.get(h.origin + '/api/purse/spend-report'); assert.equal(report.status(), 200);
    const spending = await report.json(); assert.equal(spending.rows.filter(row => row.order === order.id && row.kind === 'actual').reduce((n, row) => n + row.amountMinor, 0), 2000000);
    assert.deepEqual(new Set(spending.rows.filter(row => row.order === order.id && row.kind === 'actual').map(row => row.invoice)), new Set([deposit.id, final.id]));
    const cash = ap.getByRole('heading', { name: 'Payment terms and cash requirements', exact: true }).locator('..');
    await cash.getByRole('row').filter({ has: ap.getByText(deposit.reference, { exact: true }) }).getByText('$10,000.00', { exact: true }).waitFor();
    await cash.getByRole('row').filter({ has: ap.getByText(final.reference, { exact: true }) }).getByText('$10,000.00', { exact: true }).waitFor();
    await capture(ap, cash, 'PO-011-cash-liability');

    await ap.goto(h.origin+'/app?tab=Reports');
    await ap.getByRole('heading',{name:'Spend and commitments',exact:true}).waitFor();
    await ap.getByRole('button',{name:'Synthetic machinery supplier actual USD',exact:true}).click();
    const sources=ap.getByRole('region',{name:'Report source records',exact:true});
    for(const bill of [deposit,final])await sources.getByText('Invoice '+bill.reference+' · Recorded evidence',{exact:true}).waitFor();
    for(const disclosure of await sources.locator('details').all())await disclosure.getByText('Source record',{exact:true}).click();
    await sources.getByRole('link',{name:'synthetic-purse-7250.pdf',exact:true}).waitFor();await sources.getByRole('link',{name:'synthetic-purse-7251.pdf',exact:true}).waitFor();
    await sources.getByText('Source rows total: $20,000.00',{exact:true}).waitFor();await capture(ap,sources,'PO-011-spend-sources');
    await ap.goto(h.origin+'/app?tab=Orders&receipt='+order.id);

    // A currently revoked AP grant cannot confirm another original from the existing page.
    const heldDocument = await depositDocument(order, 'synthetic-purse-7252', 1000000);
    await sourceRegion.getByLabel('Invoice reading original', { exact: true }).setInputFiles({ name: heldDocument.name, mimeType: heldDocument.mediaType, buffer: Buffer.from(heldDocument.base64, 'base64') });
    await f.cmd('member', { email: (await h.state(f.ap)).actor.email, name: 'AP now read only', active: true, roles: ['requester'] });
    const denied = ap.waitForResponse(response => response.url().endsWith('/command/invoice-source'));
    await sourceRegion.getByRole('button', { name: 'Stage and read invoice original', exact: true }).click(); assert.equal((await denied).status(), 403);
    assert.equal((await h.state()).data.depositApplication.length, 1); assert.deepEqual(errors, []);
    console.log('Native deposit web sanity journey passed at 1440; changed screens captured at 1440 and 390');
} finally { for (const context of contexts) await context.close(); await h.close(); await browser.close(); }
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await depositsWebJourney();
