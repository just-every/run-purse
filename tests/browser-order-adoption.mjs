import assert from 'node:assert/strict';
import { join } from 'node:path';
import { session, api, current } from './browser-journey.mjs';
import { adoptionFixture, importInput } from './order-adoption-fixture.mjs';

export async function orderAdoptionJourney(browser, root, origin, width, evidence) {
    const owner = await session(browser, root, origin, 'owner', width), receiver = await session(browser, root, origin, 'receiver', width);
    try {
        const fixture = adoptionFixture({ base: 10000 + width, number: 'synthetic-purse-' + (20000 + width), missingDate: true });
        const state = (await current(owner.context, origin)).data, business = state.business[0];
        if (!business.locations.includes('Denver')) await api(owner.context, origin, 'business', { ...business, locations: [...business.locations, 'Denver'] });
        const policy = await api(owner.context, origin, 'policy', { name: 'synthetic-purse-' + (30000 + width), currency: 'USD', category: '*', project: '*', approver: 'approver@dev.localhost', limitMinor: 1000000, budgetMinor: 1000000 });
        const post = async (operation, body) => { const response = await owner.context.request.post(origin + '/api/purse/import/' + operation, { headers: { origin }, data: body }); const result = await response.json(); assert.equal(response.status(), 200, JSON.stringify(result)); return result; };
        const input = importInput(fixture), plan = await post('preview', input); await post('commit', { ...input, fingerprint: plan.plan.fingerprint });
        await api(owner.context, origin, 'screen-supplier', { id: fixture.ids.supplier });
        await owner.page.reload(); await owner.page.getByRole('navigation').getByRole('button', { name: 'Orders', exact: true }).click();
        const row = owner.page.getByRole('row').filter({ has: owner.page.getByText(fixture.number, { exact: true }) }); await row.getByRole('button', { name: 'Open order', exact: true }).click();
        await owner.page.getByText('Adopt this imported open PO', { exact: true }).click();
        await owner.page.getByLabel('Imported source budget', { exact: true }).selectOption(fixture.ids.budget);
        await owner.page.getByLabel('Adoption budget', { exact: true }).selectOption(policy.id); await owner.page.getByLabel('Adoption location', { exact: true }).selectOption('Denver'); await owner.page.getByLabel('Adoption department', { exact: true }).selectOption('Operations'); await owner.page.getByLabel('Adoption receiver', { exact: true }).selectOption('receiver@dev.localhost');
        await owner.page.getByRole('button', { name: 'Review adoption balances', exact: true }).click(); await owner.page.getByText(fixture.number + ' · remaining commitment $60.00 · imported bills $20.00 · unapplied deposits $10.00', { exact: true }).waitFor();
        await owner.page.screenshot({ path: join(evidence, `IMPORT-003-review-${width}.png`), fullPage: true });
        await owner.page.getByRole('checkbox', { name: 'I reviewed the source balances, approval evidence and budget mapping', exact: true }).check(); await owner.page.getByLabel('Adoption reason', { exact: true }).fill('synthetic-purse-' + (40000 + width)); await owner.page.getByRole('button', { name: 'Adopt reviewed open PO', exact: true }).click(); await owner.page.getByRole('heading', { name: 'Adopted open purchase order', exact: true }).waitFor();
        await owner.page.screenshot({ path: join(evidence, `IMPORT-003-adopted-${width}.png`), fullPage: true });
        const changes=owner.page.getByRole('region',{name:'Native approval for adopted changes',exact:true});
        await changes.getByText('Propose cancellation for native approval',{exact:true}).click();await changes.getByLabel('Cancellation approval reason',{exact:true}).fill('synthetic-purse-'+(45000+width));
        await changes.getByText('Replace the unreceived remainder',{exact:true}).click();await changes.getByLabel('Replacement disposition reason',{exact:true}).fill('synthetic-purse-'+(46000+width));
        await changes.screenshot({path:join(evidence,`IMPORT-003-native-changes-${width}.png`)});
        await owner.page.getByText('Add invoice evidence',{exact:true}).click();
        const invoiceForm=owner.page.locator('form').filter({has:owner.page.getByRole('button',{name:'Save invoice evidence',exact:true})});
        await invoiceForm.getByLabel('Imported deposit credit applied to this invoice',{exact:true}).fill('10.00');await invoiceForm.screenshot({path:join(evidence,`IMPORT-003-deposit-${width}.png`)});
        await receiver.page.reload(); await receiver.page.getByRole('navigation').getByRole('button', { name: 'Orders', exact: true }).click(); const receiptRow = receiver.page.getByRole('row').filter({ has: receiver.page.getByText(fixture.number, { exact: true }) }); await receiptRow.getByRole('button', { name: 'Open order', exact: true }).click();
        const adopted = (await current(owner.context, origin)).data.order.find(order => order.id === fixture.ids.order), line = adopted.lines[0].id;
        await receiver.page.getByLabel('PO line', { exact: true }).selectOption(line); await receiver.page.getByLabel('Event', { exact: true }).selectOption('receive'); await receiver.page.getByLabel('Quantity', { exact: true }).fill('3'); await receiver.page.getByLabel('Reason or service milestone', { exact: true }).fill('synthetic-purse-' + (41000 + width));
        await Promise.all([receiver.page.waitForResponse(response => response.url().endsWith('/api/purse/command/receipt') && response.status() === 200), receiver.page.getByRole('button', { name: 'Record receiving event', exact: true }).click()]);
        assert.equal(await receiver.page.getByRole('heading', { name: 'Invoice ' + fixture.reference, exact: true }).count(), 0, 'Receiver has no private invoice identity');
        await receiver.page.screenshot({ path: join(evidence, `IMPORT-003-receiving-${width}.png`), fullPage: true });
        await owner.page.reload(); await owner.page.getByRole('navigation').getByRole('button', { name: 'Orders', exact: true }).click(); await owner.page.getByRole('row').filter({ has: owner.page.getByText(fixture.number, { exact: true }) }).getByRole('button', { name: 'Open order', exact: true }).click();
        await owner.page.getByLabel('Historical invoice original', { exact: true }).selectOption(fixture.ids.invoice); await owner.page.getByRole('button', { name: 'Review retained historical original', exact: true }).click(); await owner.page.getByText('Confirm reviewed invoice', { exact: true }).click(); await owner.page.getByLabel('Invoice item 1 PO line', { exact: true }).selectOption(line); await owner.page.getByLabel('I reviewed every invoice field and original', { exact: true }).check(); await owner.page.getByLabel('Invoice confirmation reason', { exact: true }).fill('synthetic-purse-' + (42000 + width)); await owner.page.screenshot({path:join(evidence,`IMPORT-003-confirm-original-${width}.png`),fullPage:true}); await owner.page.getByRole('button', { name: 'Create invoice from reviewed original', exact: true }).click();
        await owner.page.getByText('Invoice evidence created · ' + fixture.reference + '. Any automatic approval requires a separate current owner-consented matching rule. Bank verification remains separate.', { exact: true }).waitFor();
        await owner.page.screenshot({ path: join(evidence, `IMPORT-003-source-${width}.png`), fullPage: true });
        const original = (await current(owner.context, origin)).data.invoice.find(invoice => invoice.id === fixture.ids.invoice); assert.equal(original.invoiceDate, '2026-10-19'); assert.equal(original.sourceConfirmation, 'confirmed'); assert.equal(original.sender.authentication, 'unverified');
        const terms = await api(owner.context, origin, 'payable-terms', { invoice: original.id, version: 0, invoiceDate: original.invoiceDate, term: 'Net 30', reason: 'synthetic-purse-' + (43000 + width) }); await api(owner.context, origin, 'approve-payable', { invoice: original.id, version: terms.version, reason: 'synthetic-purse-' + (44000 + width) });
        await owner.page.reload();await owner.page.getByRole('navigation').getByRole('button',{name:'Orders',exact:true}).click();await owner.page.getByRole('row').filter({has:owner.page.getByText(fixture.number,{exact:true})}).getByRole('button',{name:'Open order',exact:true}).click();
        const cash=owner.page.getByRole('heading',{name:'Payment terms and cash requirements',exact:true}).locator('..');
        await cash.getByText('Record bill terms and cash-planning approval',{exact:true}).click();await cash.getByText('Expected invoices and source POs',{exact:true}).click();
        await cash.getByLabel('Forecast PO',{exact:true}).selectOption(adopted.id);await cash.screenshot({path:join(evidence,`IMPORT-003-cash-${width}.png`)});
        await owner.page.getByRole('navigation').getByRole('button', { name: 'Reports', exact: true }).click(); await owner.page.getByLabel('Supplier', { exact: true }).selectOption(fixture.ids.supplier);
        await Promise.all([owner.page.waitForResponse(response => new URL(response.url()).pathname === '/api/purse/spend-report' && new URL(response.url()).searchParams.get('supplier') === fixture.ids.supplier && response.status() === 200), owner.page.getByRole('button', { name: 'Filter spend', exact: true }).click()]);
        const supplierName = fixture.ids.supplier.replace('procurify:supplier:', ''); await owner.page.getByRole('button', { name: supplierName + ' committed USD', exact: true }).click(); const detail = owner.page.getByRole('region', { name: 'Report source records' }); await detail.getByRole('link', { name: fixture.number, exact: true }).waitFor(); await detail.getByText('Source rows total: $30.00', { exact: true }).waitFor();
        await owner.page.screenshot({ path: join(evidence, `IMPORT-003-report-${width}.png`), fullPage: true });
        const after = (await current(owner.context, origin)).data; assert.equal(after.order.find(order => order.id === adopted.id).positions[0].accepted, 7000); assert.equal(after.cashRequirements.commitments.find(row => row.order === adopted.id).amountMinor, 7000); assert.equal(after.cashRequirements.bills.find(bill => bill.invoice === original.id).amountMinor, 2000);
        assert.equal(await owner.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `IMPORT-003 fits ${width}`);
        return { clause: 'IMPORT-003', width, order: adopted.id, sourceInvoice: original.id, number: fixture.number };
    } finally { await receiver.context.close(); await owner.context.close(); }
}

export async function restoredOrderAdoption(context, origin, before, after) {
    for (const adoption of before.orderAdoption ?? []) {
        assert.deepEqual(after.orderAdoption.find(row => row.id === adoption.id), adoption);
        const source = before.order.find(order => order.id === adoption.order), restored = after.order.find(order => order.id === adoption.order);
        assert.equal(restored.number, source.number); assert.equal(restored.issuedAt, null); assert.deepEqual(restored.positions, source.positions);
        const response = await context.request.get(origin + '/api/purse/search?' + new URLSearchParams({ kind: 'order', q: restored.number })); assert.equal(response.status(), 200); assert.ok((await response.json()).results.some(result => result.id === restored.id));
        const next = await context.request.post(origin + '/api/purse/command/receipt', { headers: { origin }, data: { order: restored.id, line: restored.lines[0].id, event: 'receive', quantity: '1', reason: 'synthetic-purse-90000' } }); assert.equal(next.status(), 200, await next.text());
    }
}
