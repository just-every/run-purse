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

/** INTAKE-008 standalone Settings journey uses the shipped App and real HTTP/D1. */
async function poReadSettings() {
    const {mkdir}=await import('node:fs/promises'),{resolve}=await import('node:path');
    const {build}=await import('esbuild'),{harness}=await import('./purse-harness.mjs'),{nativeWebContext}=await import('./native-web-fixture.mjs');
    const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE||'@playwright/test');
    const evidence=resolve(process.env.PURSE_EVIDENCE||'.cache/po-read');await mkdir(evidence,{recursive:true});
    const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
    const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
    try {for(const width of [1440,390]) {
        const h=await harness();let context;
        try {
            await h.command('business',{name:'North Ridge Field Services',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Safety']});
            const supplier=await h.command('supplier',{name:'Canyon Safety Equipment',status:'preferred',reason:'Reviewed supplier for Denver field operations'});
            const requester=await h.member('synthetic-purse-810@example.test',['requester']),approver=await h.member('synthetic-purse-811@example.test',['approver']);
            await h.command('policy',{name:'Field equipment',currency:'USD',category:'Safety',project:'Safety',approver:'synthetic-purse-811@example.test',limitMinor:100000,budgetMinor:1000000});
            const r=await h.command('request',{title:'Harness replenishment',supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Fall-arrest harness',quantity:'2',unitMinor:12500,category:'Safety',project:'Safety'}]},requester);
            await h.command('submit',{id:r.id,revision:1},requester);await h.command('decision',{id:r.id,revision:1,decision:'approved',reason:'Reviewed current equipment need'},approver);
            const order=await h.command('convert',{id:r.id,revision:1});await h.command('issue',{id:order.id,revision:1,reason:'Issued in existing channel'});
            await h.command('invoice',{order:order.id,reference:'FIELD-810',source:'Supplier invoice',allocations:[{line:order.lines[0].id,quantity:'2',amountMinor:25000}]});
            context=await nativeWebContext(browser,h,width,bundle.outputFiles[0].text);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
            await page.goto(h.origin+'/app?tab=Settings');const panel=page.getByRole('region',{name:'Integration tokens',exact:true});
            const snap=async name=>{
                assert.equal(await panel.getByLabel('New integration token',{exact:true}).count(),0,'Never capture secret');
                assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Settings fits at '+width);
                // Every Settings control has visible text, or a tooltip for icon-only use.
                const icons=await page.locator('button').evaluateAll(buttons=>buttons.filter(b=>!b.innerText.trim()).map(b=>({label:b.getAttribute('aria-label'),tooltip:b.getAttribute('aria-describedby')})));
                assert.ok(icons.every(b=>b.label&&b.tooltip),'Icon-only Settings controls expose tooltips');
                await panel.screenshot({path:join(evidence,`INTAKE-008-${name}-${width}.png`)});
            };
            await panel.getByLabel('PO integration name',{exact:true}).fill('Locket supplier comparison');await panel.getByLabel('Mapped supplier',{exact:true}).selectOption(supplier.id);
            assert.equal(await panel.getByLabel('Expires in days (1–30)',{exact:true}).inputValue(),'7');
            const issued=page.waitForResponse(r=>r.url().endsWith('/api/purse/integration-tokens')&&r.request().method()==='POST');
            await panel.getByRole('button',{name:'Create read-only PO token',exact:true}).click();const response=await issued;assert.equal(response.status(),200);
            const created=await response.json();let token=created.token;
            const dismiss=async()=>{const field=panel.getByLabel('New integration token',{exact:true});await field.waitFor();assert.ok((await field.inputValue()).length);await panel.getByRole('button',{name:'Dismiss token',exact:true}).click();await field.waitFor({state:'detached'});};
            await dismiss();const row=panel.getByRole('row').filter({hasText:'Locket supplier comparison'});await row.getByText('Read PO and bill status only',{exact:true}).waitFor();await snap('issued');
            const read=secret=>context.request.get(h.origin+'/api/purse/integration/orders/'+order.id,{headers:{authorization:'Bearer '+secret}});
            assert.equal((await read(token)).status(),200);assert.equal((await (await read(token)).json()).order.bills[0].paymentStatus,'unknown');
            await page.reload();await row.waitFor();await snap('dismissed');
            const rotation=page.waitForResponse(r=>r.url().endsWith('/'+created.integration.id+'/rotate'));await row.getByRole('button',{name:'Rotate token',exact:true}).click();const rotated=await (await rotation).json();await dismiss();assert.equal((await read(token)).status(),401);token=rotated.token;assert.equal((await read(token)).status(),200);await snap('rotated');
            const revocation=page.waitForResponse(r=>r.url().endsWith('/'+created.integration.id+'/revoke'));await row.getByRole('button',{name:'Revoke token',exact:true}).click();assert.equal((await revocation).status(),200);await row.getByText(/Revoked/).waitFor();assert.equal((await read(token)).status(),401);token='';await snap('revoked');
            const deletion=page.waitForResponse(r=>r.url().endsWith('/'+created.integration.id+'/delete'));await row.getByRole('button',{name:'Delete integration',exact:true}).click();assert.equal((await deletion).status(),200);await row.waitFor({state:'detached'});await snap('deleted');
            assert.deepEqual(errors,[]);console.log('INTAKE-008 Settings, mapped PO/bill read and lifecycle passed at '+width);
        } finally {await context?.close();await h.close();}
    }} finally {await browser.close();}
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) await poReadSettings();
