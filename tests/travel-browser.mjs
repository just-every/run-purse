import assert from 'node:assert/strict';
import { travelReferenceAndReleaseJourney } from './travel-browser-release.mjs';
import { internationalTravelPolicyJourney } from './travel-browser-policy.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { nativeWebContext } from './native-web-fixture.mjs';
import { travelFixture } from './travel-helpers.mjs';
import { coasterTravelReport } from './travel-coaster.mjs';

const { chromium } = await import(process.env.PURSE_PLAYWRIGHT_MODULE ?? '@playwright/test');
assert.ok(process.env.COASTER_CHECKOUT, 'COASTER_CHECKOUT must name an installed actual Coaster checkout for the travel browser journey');
const evidence = resolve(process.env.PURSE_EVIDENCE ?? '.cache/travel-proof');
await mkdir(evidence, { recursive: true });
const selected = process.argv.find(argument => argument.startsWith('--width='));
const widths = selected ? [Number(selected.slice(8))] : [1440, 390];
assert.ok(widths.every(width => [1440, 390].includes(width)));
const bundle = await build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);", resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'], ...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PURSE_CHROMIUM_EXECUTABLE_PATH } : {}) });
const results = [];
try {
    for (const width of widths) {
        const fixture = await travelFixture(), { h, requester, manager, finance } = fixture, contexts = [], errors = [];
        let page;
        const context = async cookie => {
            const result = await nativeWebContext(browser, h, width, bundle.outputFiles[0].text, cookie); contexts.push(result); return result;
        };
        const open = async (cookie, request) => {
            const result = await context(cookie), tab = await result.newPage(); tab.on('pageerror', error => errors.push(error.message));
            await tab.goto(h.origin + '/app?tab=Requests' + (request ? '&request=' + request : '')); return tab;
        };
        const mutation = async (tab, operation, click) => {
            const response = tab.waitForResponse(response => response.url().endsWith('/command/' + operation));
            await click(); const received = await response; assert.equal(received.status(), 200, await received.text()); return received.json();
        };
        const capture = async (tab, name, target = tab) => {
            assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} fits ${width}`);
            await target.screenshot({ path: join(evidence, `INTAKE-006-${name}-${width}.png`), fullPage: true });
        };
        try {
            page = await open(requester);
            await page.getByText('Request travel pre-approval', { exact: true }).click();
            const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save travel draft', exact: true }) });
            await form.getByLabel('Travel request title', { exact: true }).fill('synthetic-purse-11');
            await form.getByLabel('Traveler', { exact: true }).fill('synthetic-purse-6');
            await form.getByLabel('Trip purpose', { exact: true }).fill('synthetic-purse-12');
            await form.getByLabel('Trip origin', { exact: true }).fill('synthetic-purse-13');
            await form.getByLabel('Destination 1 city', { exact: true }).fill('Austin');
            await form.getByLabel('Destination 1 state or province', { exact: true }).fill('TX');
            await form.getByLabel('Departure date', { exact: true }).fill('2026-10-19');
            await form.getByLabel('Return date', { exact: true }).fill('2026-10-21');
            await form.getByLabel('Travel location', { exact: true }).selectOption('synthetic-purse-2');
            await form.getByLabel('Travel department', { exact: true }).selectOption('synthetic-purse-3');
            await form.getByLabel('Travel project', { exact: true }).selectOption('synthetic-purse-4');
            for (const [label, value] of [['Airfare estimate', '1000.00'], ['Lodging estimate', '800.00'], ['Ground transport estimate', '200.00'], ['Registration fees estimate', '200.00']]) await form.getByLabel(label, { exact: true }).fill(value);
            const checkRate = async (destination, name) => {
                await form.getByLabel('Destination 1 city', { exact: true }).fill(destination.city);
                await form.getByLabel('Destination 1 state or province', { exact: true }).fill(destination.state);
                await form.getByLabel('Destination 1 county (optional)', { exact: true }).fill(destination.county);
                await form.getByLabel('Destination 1 uses published standard CONUS rate', { exact: true }).setChecked(Boolean(destination.standardConus));
                const response=await page.context().request.post(h.origin+'/api/purse/travel/per-diem',{data:{destination:{...destination,country:'US'},departureDate:'2026-10-19',returnDate:'2026-10-21'}});
                assert.equal(response.status(),200);const rate=await response.json();assert.equal(rate.available,true);
                const amount=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(rate.amountMinor/100);
                await form.getByText('GSA default: '+amount,{exact:false}).waitFor();
                await capture(page,name);
            };
            await checkRate({city:'Thornton',state:'CO',county:'Adams'},'gsa-county-draft');
            await checkRate({city:'Wheeler',state:'TX',county:'Wheeler',standardConus:true},'gsa-standard-draft');
            await checkRate({city:'Austin',state:'TX',county:'Travis'},'gsa-draft');
            const draft = await mutation(page, 'travel-request', () => form.getByRole('button', { name: 'Save travel draft', exact: true }).click());
            assert.equal(draft.totalMinor, 240000); assert.equal(draft.travel.costs.mealsIncidentalsMinor, 20000);
            await page.goto(h.origin + '/app?tab=Requests&request=' + draft.id);
            await mutation(page, 'travel-submit', () => page.getByRole('button', { name: 'Submit travel for approval', exact: true }).click());
            const approve = async (cookie, revision) => {
                const tab = await open(cookie, draft.id);
                const budget=tab.getByRole('region',{name:'Current financial budget position',exact:true});await budget.waitFor();assert.ok((await budget.textContent()).includes('Amount $10,000.00'));assert.ok((await budget.textContent()).includes(revision===1?'reserved $2,400.00':'reserved $2,700.00'));
                const decision = tab.locator('form').filter({ has: tab.getByRole('button', { name: 'Record travel decision', exact: true }) });
                await decision.getByLabel('Travel decision', { exact: true }).selectOption('approved');
                await decision.getByLabel('Travel decision reason', { exact: true }).fill('synthetic-purse-14');
                const result = await mutation(tab, 'travel-decision', () => decision.getByRole('button', { name: 'Record travel decision', exact: true }).click());
                assert.equal(result.revision, revision); return { result, tab };
            };
            const first = await approve(manager, 1); assert.equal(first.result.status, 'pending');
            const initialApproval = await approve(finance, 1); assert.equal(initialApproval.result.status, 'approved');
            assert.equal(await fixture.balance(draft.id), 240000);
            await capture(initialApproval.tab, 'approved-reservation');
            await page.reload();
            await page.getByText('Amend trip dates or estimates', { exact: true }).click();
            const amend = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save travel amendment', exact: true }) });
            await amend.getByLabel('Airfare estimate', { exact: true }).fill('1300.00');
            await amend.getByLabel('Travel amendment reason', { exact: true }).fill('synthetic-purse-16');
            const amendment = await mutation(page, 'travel-amend', () => amend.getByRole('button', { name: 'Save travel amendment', exact: true }).click());
            assert.equal(amendment.totalMinor, 270000); assert.equal(amendment.revision, 2);
            await mutation(page, 'travel-submit', () => page.getByRole('button', { name: 'Submit travel for approval', exact: true }).click());
            await capture(page, 'amendment-route');
            await approve(manager, 2);
            const final = await approve(finance, 2), request = final.result;
            assert.equal(await fixture.balance(draft.id), 270000);
            const source = await coasterTravelReport({ checkout: process.env.COASTER_CHECKOUT, reference: request.travel.approvalReference, traveler: request.travel.travelerEmail, date: '2026-10-20' });
            const ownerTab = await open(h.owner, draft.id);
            await ownerTab.getByText('Return final Coaster expense report', { exact: true }).click();
            const returning = ownerTab.locator('form').filter({ has: ownerTab.getByRole('button', { name: 'Reconcile final travel expense report', exact: true }) });
            await returning.getByLabel('Native Coaster report JSON', { exact: true }).setInputFiles({ name: 'synthetic-purse-23.json', mimeType: 'application/json', buffer: Buffer.from(source.bytes) });
            await returning.getByLabel('Coaster report source URL', { exact: true }).fill(source.source.origin + source.source.route);
            await returning.getByLabel('Expense return reason', { exact: true }).fill('synthetic-purse-24');
            await returning.getByLabel('I reviewed the original report and its source.', { exact: true }).check();
            await returning.getByLabel('This is the trip’s final expense report. Release the unspent reservation.', { exact: true }).check();
            const expense = await mutation(ownerTab, 'travel-expense-return', () => returning.getByRole('button', { name: 'Reconcile final travel expense report', exact: true }).click());
            assert.equal(expense.totalMinor, 215000); assert.equal(expense.releasedMinor, 55000); assert.equal(await fixture.balance(draft.id), 0);
            await ownerTab.getByRole('region', { name: 'Linked travel expense report', exact: true }).waitFor();
            await capture(ownerTab, 'actual-and-release');
            await page.reload();
            await page.getByRole('region', { name: 'Linked travel expense report', exact: true }).waitFor();
            assert.equal(await page.getByRole('link', { name: 'Download exact original Coaster report', exact: true }).count(),0);
            await capture(page, 'requester-linked-report');
            const denied=await page.context().request.get(h.origin + '/api/purse/download/attachment/' + expense.attachment);assert.equal(denied.status(),403);
            const linked = await ownerTab.context().request.get(h.origin + '/api/purse/download/attachment/' + expense.attachment);
            assert.equal(await linked.text(), source.bytes);
            const timedRelease = await travelReferenceAndReleaseJourney({ fixture, open, mutation, capture });
            const internationalPolicy = await internationalTravelPolicyJourney({ fixture, open, mutation, capture });
            assert.deepEqual(errors, []);
            results.push({ width, timedRelease, internationalPolicy, request: draft.id, actualMinor: expense.totalMinor, releasedMinor: expense.releasedMinor, sha256: expense.sha256, coaster: source.source });
        } catch (error) {
            await page?.screenshot({ path: join(evidence, `INTAKE-006-failure-${width}.png`), fullPage: true }).catch(() => {}); throw error;
        } finally { for (const active of contexts) await active.close(); await h.close(); }
    }
    await writeFile(join(evidence, 'travel-result.json'), JSON.stringify({ outcome: 'passed', results }, null, 2) + '\n');
    console.log(JSON.stringify({ outcome: 'passed', evidence, results }));
} finally { await browser.close(); }
