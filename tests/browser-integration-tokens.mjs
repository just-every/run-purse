import assert from 'node:assert/strict';
import { join } from 'node:path';
import { session, api, current } from './browser-journey.mjs';

/** Native owner issuance, a real bearer draft, and human submission through Requests. */
export async function integrationTokensJourney(browser, root, origin, width, evidence) {
    const owner = await session(browser, root, origin, 'owner', width);
    let requester;
    try {
        // Sign-in establishes the current native principal before the owner binds it.
        requester = await session(browser, root, origin, 'requester', width);
        const data = (await current(owner.context, origin)).data;
        const business = data.business[0], category = 'Integration equipment ' + width;
        let supplier = data.supplier.find(s => s.name === 'Integration field equipment ' + width);
        if (!supplier) {
            const profile = {
                name: 'Integration field equipment ' + width, status: 'preferred',
                reason: 'Reviewed supplier for the field safety equipment request',
                contacts: [{ name: 'Sales', email: 'sales-' + width + '@integration-equipment.example.test' }],
            };
            const review = await api(owner.context, origin, 'supplier-duplicates', profile);
            supplier = await api(owner.context, origin, 'supplier', { ...profile, ...(review.matches.length ? { duplicateFingerprint: review.fingerprint, duplicateReason: 'Reviewed distinct field equipment supplier and its width-specific sales contact' } : {}) });
        }
        await api(owner.context, origin, 'policy', {
            name: 'Integration safety equipment ' + width, approver: 'approver@dev.localhost',
            currency: business.currencies[0], category, project: business.projects[0],
            limitMinor: 1000000, budgetMinor: 2000000,
        });
        await owner.page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
        const section = owner.page.getByRole('region', { name: 'Integration tokens', exact: true });
        const screenshot = async (page, name) => {
            assert.equal(await page.getByLabel('New integration token', { exact: true }).count(), 0, 'Dismiss secrets before evidence capture');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow');
            await page.screenshot({ path: join(evidence, `INTAKE-007-${name}-${width}.png`), fullPage: true });
        };
        const takeSecret = async () => {
            const field = section.getByLabel('New integration token', { exact: true });
            await field.waitFor();
            const value = await field.inputValue();
            assert.ok(value.length > 0, 'Issuance returns a token');
            assert.equal(await field.getAttribute('readonly'), '');
            await section.getByRole('button', { name: 'Dismiss token', exact: true }).click();
            await field.waitFor({ state: 'detached' });
            return value;
        };
        const name = 'Field safety intake ' + width;
        await section.getByLabel('Integration name', { exact: true }).fill(name);
        await section.getByLabel('Integration requester', { exact: true }).selectOption('requester@dev.localhost');
        const issued = owner.page.waitForResponse(r => r.url().endsWith('/api/purse/integration-tokens') && r.request().method() === 'POST');
        await section.getByRole('button', { name: 'Create integration token', exact: true }).click();
        assert.ok((await issued).ok(), 'Owner creates integration token');
        let token = await takeSecret();
        await screenshot(owner.page, 'settings-issued');
        await owner.page.reload();
        await owner.page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
        const row = section.getByRole('row').filter({ hasText: name });
        await row.waitFor();
        await screenshot(owner.page, 'settings-dismissed');
        const title = 'Field crew safety harnesses ' + width;
        const body = {
            title, supplier: supplier.id, currency: business.currencies[0], needDate: '2026-12-01',
            location: business.locations[0], costCentre: business.costCentres[0],
            lines: [{ description: 'Fall arrest harness for field crew', quantity: '2', unitAmount: '125.00', unit: 'each', category, project: business.projects[0] }],
            freightAmount: '12.00', taxAmount: '26.20', terms: 'Supplier quotation FIELD-' + width + '; net 30 days',
            poDetails: { notes: 'Deliver to the field stores receiving desk', shippingTerms: 'Ground delivery', depositTerms: '', buyerContact: '' },
        };
        const send = (secret, key) => requester.context.request.post(origin + '/api/purse/integration/requests', {
            headers: { authorization: 'Bearer ' + secret, 'idempotency-key': key }, data: body,
        });
        const key = 'browser-field-safety-' + width;
        const response = await send(token, key);
        assert.ok(response.ok(), 'Bearer creates an ordinary request draft');
        const created = await response.json();
        assert.equal(created.duplicate, false);
        assert.equal(created.request.status, 'draft');
        const repeated = await send(token, key);
        assert.ok(repeated.ok(), 'Identical retry succeeds');
        const duplicate = await repeated.json();
        assert.equal(duplicate.duplicate, true);
        assert.equal(duplicate.request.id, created.request.id);
        const requestId = created.request.id;
        await requester.page.reload();
        await requester.page.getByRole('navigation').getByRole('button', { name: 'Requests', exact: true }).click();
        const requestRow = requester.page.getByRole('article').filter({ hasText: title });
        await requestRow.getByText('draft · v1', { exact: true }).waitFor();
        await requestRow.getByRole('button', { name: 'Open request', exact: true }).click();
        await requester.page.getByRole('heading', { name: title + ' · revision 1', exact: true }).waitFor();
        assert.equal((await current(requester.context, origin)).data.decision.filter(d => d.request === requestId).length, 0);
        await screenshot(requester.page, 'request-draft');
        const submitted = requester.page.waitForResponse(r => r.url().endsWith('/api/purse/command/submit'));
        await requester.page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
        assert.equal((await submitted).status(), 200);
        await requestRow.getByText('pending · v1', { exact: true }).waitFor();
        assert.equal((await current(requester.context, origin)).data.request.find(r => r.id === requestId).status, 'pending');
        await screenshot(requester.page, 'request-pending');
        const rotated = owner.page.waitForResponse(r => /\/api\/purse\/integration-tokens\/[^/]+\/rotate$/.test(r.url()));
        await row.getByRole('button', { name: 'Rotate token', exact: true }).click();
        assert.ok((await rotated).ok(), 'Owner rotates token');
        const replacement = await takeSecret();
        assert.ok(replacement !== token, 'Rotation issues a different secret');
        const refusedOld = await send(token, key + '-old');
        assert.equal(refusedOld.status(), 401, 'Rotated secret is refused');
        token = replacement;
        await screenshot(owner.page, 'settings-rotated');
        // The replacement is live before revocation; replay avoids creating another draft.
        const replacementReplay = await send(token, key);
        assert.ok(replacementReplay.ok(), 'Replacement secret can access the same integration');
        assert.equal((await replacementReplay.json()).duplicate, true);
        const revoked = owner.page.waitForResponse(r => /\/api\/purse\/integration-tokens\/[^/]+\/revoke$/.test(r.url()));
        await row.getByRole('button', { name: 'Revoke token', exact: true }).click();
        assert.ok((await revoked).ok(), 'Owner revokes token');
        await row.getByText(/Revoked/).waitFor();
        const refusedNew = await send(token, key + '-revoked');
        assert.equal(refusedNew.status(), 401, 'Revoked secret is refused');
        token = '';
        await screenshot(owner.page, 'settings-revoked');
        const deleted=owner.page.waitForResponse(r=>/\/api\/purse\/integration-tokens\/[^/]+\/delete$/.test(r.url()));
        await row.getByRole('button',{name:'Delete integration',exact:true}).click();
        assert.ok((await deleted).ok());await row.waitFor({state:'detached'});
        await screenshot(owner.page,'settings-deleted');
        return { clause: 'INTAKE-007', width, request: requestId };
    } finally {
        // No failure screenshots: an issuance failure may leave a secret on screen.
        await owner.context.close();
        if (requester) await requester.context.close();
    }
}
