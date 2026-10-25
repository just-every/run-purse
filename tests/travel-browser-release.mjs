import assert from 'node:assert/strict';
import { reauthenticateErasure } from './erasure-flow.mjs';
import { coasterTravelReport } from './travel-coaster.mjs';

export async function travelReferenceAndReleaseJourney({ fixture, open, mutation, capture }) {
    const { h, input, travel, stranger } = fixture;
    const request = await fixture.approve(await travel('request', { ...input, title: 'synthetic-purse-80', travel: { ...input.travel, traveler: 'synthetic-purse-9', travelerEmail: 'synthetic-purse-9@example.test', costs: { ...input.travel.costs, airfareMinor: 130000 } } }));
    const travelerTab = await open(stranger), references = travelerTab.getByRole('region', { name: 'Your travel booking references', exact: true });
    await references.getByText(request.travel.approvalReference, { exact: true }).waitFor();
    assert.equal(await travelerTab.getByText(request.title, { exact: true }).count(), 0);
    const terms = references.getByRole('region', { name: 'Approved booking terms', exact: true }).filter({ hasText: request.travel.approvalReference });
    await terms.getByText('Austin, TX, US', { exact: true }).waitFor();
    await terms.getByText('Departure 2026-10-19 · return 2026-10-21', { exact: true }).waitFor();
    for (const [category, cap] of [['Airfare', '$1,300.00'], ['Lodging', '$800.00'], ['Ground transport', '$200.00'], ['Meals and incidentals', '$200.00'], ['Registration fees', '$200.00'], ['Other', '$0.00']]) {
        await terms.getByRole('row').filter({ hasText: category }).getByText(cap, { exact: true }).waitFor();
    }
    for (const name of ['Travel pre-approval', 'Travel approval route', 'Current financial budget position', 'Travel reservation release', 'Business travel release rule', 'Linked travel expense report']) {
        assert.equal(await travelerTab.getByRole('region', { name, exact: true }).count(), 0);
    }
    assert.equal(await travelerTab.getByRole('link', { name: /Download exact original/ }).count(), 0);
    const newRequest = travelerTab.getByRole('button', { name: 'New purchase request', exact: true }), tooltip = newRequest.getByRole('tooltip');
    await newRequest.focus(); await tooltip.waitFor({ state: 'visible' });
    await newRequest.evaluate(button => button.blur()); await tooltip.waitFor({ state: 'hidden' });
    await newRequest.hover(); await tooltip.waitFor({ state: 'visible' });
    await travelerTab.mouse.move(0, 0); await tooltip.waitFor({ state: 'hidden' });
    await capture(travelerTab, 'assistant-traveler-approved-terms');
    const ownerTab = await open(h.owner, request.id);
    await ownerTab.getByText('Configure timed reservation release', { exact: true }).click();
    const policy = ownerTab.locator('form').filter({ has: ownerTab.getByRole('button', { name: 'Save travel release policy', exact: true }) });
    await policy.getByLabel('Timed release', { exact: true }).selectOption('enabled');
    await policy.getByLabel('Calendar days after return', { exact: true }).fill('3');
    await policy.getByLabel('Release timezone', { exact: true }).fill('America/New_York');
    await policy.getByLabel('Release policy reason', { exact: true }).fill('synthetic-purse-81');
    await policy.getByLabel('I confirm timed release for this exact approved trip revision.', { exact: true }).check();
    await policy.getByLabel('A late final expense report can consume budget after these funds have been freed, even if they have since been used.', { exact: true }).check();
    await mutation(ownerTab, 'travel-release-policy', () => policy.getByRole('button', { name: 'Save travel release policy', exact: true }).click());
    await ownerTab.getByText('Timed release is enabled for revision', { exact: false }).waitFor();
    await capture(ownerTab, 'timed-release-consent');
    const response = await h.mf.dispatchFetch(h.origin + '/cdn-cgi/local/scheduled?time=' + Date.parse('2026-10-24T04:00:00Z'));
    assert.equal(response.status, 200, await response.text()); assert.equal(await fixture.balance(request.id), 0);
    await ownerTab.reload();
    await ownerTab.getByText('The trip remains approved and awaits its final expense report.', { exact: false }).waitFor();
    await capture(ownerTab, 'timed-release-awaiting-report');
    const source = await coasterTravelReport({ checkout: process.env.COASTER_CHECKOUT, reference: request.travel.approvalReference, traveler: request.travel.travelerEmail, date: '2026-10-20' });
    await ownerTab.getByText('Return final expense report', { exact: true }).click();
    const returning = ownerTab.locator('form').filter({ has: ownerTab.getByRole('button', { name: 'Reconcile final travel expense report', exact: true }) });
    await returning.getByLabel('Native Coaster report JSON', { exact: true }).setInputFiles({ name: 'synthetic-purse-82.json', mimeType: 'application/json', buffer: Buffer.from(source.bytes) });
    await returning.getByLabel('Coaster report source URL', { exact: true }).fill(source.source.origin + source.source.route);
    await returning.getByLabel('Expense return reason', { exact: true }).fill('synthetic-purse-83');
    await returning.getByLabel('I reviewed the original report and its source.', { exact: true }).check();
    await returning.getByLabel('This is the trip’s final expense report. Record actual without releasing funds again.', { exact: true }).check();
    const expense = await mutation(ownerTab, 'travel-expense-return', () => returning.getByRole('button', { name: 'Reconcile final travel expense report', exact: true }).click());
    assert.equal(expense.totalMinor, 215000); assert.equal(expense.releasedMinor, 0); assert.equal(expense.earlierRelease.amountMinor, 270000); assert.equal(expense.remainingEstimateMinor, 55000);
    await ownerTab.getByText('This report records actual spend without releasing funds again.', { exact: false }).waitFor();
    await capture(ownerTab, 'late-report-after-timed-release');
    await travelerTab.reload();
    await travelerTab.getByText('expense-report-closed', { exact: false }).waitFor();
    assert.equal(await travelerTab.getByRole('region', { name: 'Linked travel expense report', exact: true }).count(), 0);
    return { request: request.id, report: expense.id, approvalReference: request.travel.approvalReference, earlierReleaseMinor: 270000, actualMinor: expense.totalMinor, releasedAgainMinor: expense.releasedMinor };
}


export async function businessTravelReleaseRuleJourney({ fixture, open, mutation, capture }) {
    const { h, travel, input } = fixture;
    const first = await fixture.approve(await travel('request', { ...input, title: 'synthetic-purse-84' }));
    const settings = await open(h.owner); await settings.goto(h.origin + '/app?tab=Settings');
    const section = settings.getByRole('region', { name: 'Business travel release rule', exact: true });
    await section.getByText('Configure business travel release rule', { exact: true }).click();
    const form = () => section.locator('form');
    const fill = async (action, days, timezone) => {
        await form().getByLabel('Business timed release', { exact: true }).selectOption('enabled');
        await form().getByLabel('Calendar days after return', { exact: true }).fill(String(days));
        await form().getByLabel('Release timezone', { exact: true }).fill(timezone);
        await form().getByLabel('Release rule action', { exact: true }).selectOption(action);
        await form().getByLabel('Release rule reason', { exact: true }).fill('synthetic-purse-85');
        await form().getByLabel('I consent to this business rule for every approved trip revision, except an explicit trip override.', { exact: true }).check();
        await form().getByLabel('A late final expense report can consume budget after these funds have been freed, even if they have since been used.', { exact: true }).check();
    };
    const save = () => mutation(settings, 'travel-release-rule', () => form().getByRole('button', { name: 'Save travel release rule', exact: true }).click());
    await fill('consent', 3, 'America/New_York');
    const consent = await save(); assert.equal(consent.status, 'armed');
    await capture(settings, 'business-release-rule-consent', section);
    const second = await fixture.approve(await travel('request', { ...input, title: 'synthetic-purse-86', travel: { ...input.travel, returnDate: '2026-10-22', costs: { ...input.travel.costs, mealsIncidentalsMinor: 20000 } } }));
    const inherited = await open(h.owner, second.id);
    await inherited.getByText(`Business release rule v${consent.version} applies.`, { exact: false }).waitFor();
    await capture(inherited, 'business-release-rule-inherited');
    await fill('configure', 5, 'America/Chicago');
    const configured = await save(); assert.equal(configured.status, 'paused');
    await inherited.reload();
    await inherited.getByText('Timed release is paused.', { exact: false }).waitFor();
    await capture(inherited, 'business-release-rule-paused');
    await fill('consent', 5, 'America/Chicago');
    const renewed = await save(); assert.equal(renewed.status, 'armed');
    await capture(settings, 'business-release-rule-reconsent', section);
    const tick = async time => {
        const response = await h.mf.dispatchFetch(h.origin + '/cdn-cgi/local/scheduled?time=' + Date.parse(time));
        assert.equal(response.status, 200, await response.text());
    };
    await tick('2026-10-26T04:59:59.999Z');
    for (const trip of [first, second]) assert.equal(await fixture.balance(trip.id), 240000);
    await tick('2026-10-26T05:00:00.000Z');
    assert.equal(await fixture.balance(first.id), 0); assert.equal(await fixture.balance(second.id), 240000);
    await tick('2026-10-27T04:59:59.999Z'); assert.equal(await fixture.balance(second.id), 240000);
    await tick('2026-10-27T05:00:00.000Z'); await tick('2026-10-28T12:00:00Z');
    assert.equal(await fixture.balance(first.id), 0); assert.equal(await fixture.balance(second.id), 0);
    const data = (await h.state()).data;
    for (const trip of [first, second]) assert.equal(data.travelRelease.filter(row => row.request === trip.id).length, 1);
    await inherited.reload(); await inherited.getByText('The trip remains approved and awaits its final expense report.', { exact: false }).waitFor();
    await capture(inherited, 'business-release-rule-released');
    return { trips: [first.id, second.id], consentVersion: consent.version, renewedVersion: renewed.version, days: 5, timezone: 'America/Chicago', staggeredReturns: true, releasedOnce: true };
}

// Invoke after other requester journeys: erasure revokes this assistant's native session.
export async function travelWithdrawnOriginalJourney({ fixture, open, capture, trip }) {
    const { h } = fixture;
    await h.command('member', { email: 'synthetic-purse-6@example.test', name: 'synthetic-purse-6@example.test', roles: ['requester'], active: false });
    await reauthenticateErasure(h);
    const meta = await h.send('/api/purse/erasure', undefined, h.owner);
    const preview = await h.send('/api/purse/erasure/preview', { kind: 'member', id: 'synthetic-purse-6@example.test', revision: meta.value.revision }, h.owner);
    assert.equal(preview.status, 200, JSON.stringify(preview.value));
    assert.ok(preview.value.affected.some(row => row.kind === 'travelExpense' && row.id === trip.report));
    const erased = await h.send('/api/purse/erasure/execute', { ...preview.value.subject, revision: preview.value.revision, review: preview.value.review, fingerprint: preview.value.fingerprint, consent: true }, h.owner);
    assert.equal(erased.status, 200, JSON.stringify(erased.value));
    const owner = await open(h.owner, trip.request), financial = owner.getByRole('region', { name: 'Linked travel expense report', exact: true });
    await financial.getByText('Original withdrawn by personal-data erasure. Anonymous financial evidence', { exact: false }).waitFor();
    assert.equal(await financial.getByRole('link', { name: 'Download exact original Coaster report', exact: true }).count(), 0);
    assert.equal(await financial.getByRole('link', { name: 'Open source report', exact: true }).count(), 0);
    const report = (await h.state()).data.travelExpense.find(row => row.id === trip.report);
    assert.equal(report.totalMinor, 215000); assert.equal(report.originalSourceVerified, false);
    assert.equal((await h.send('/api/purse/download/attachment/' + report.attachment, undefined, h.owner)).status, 410);
    await capture(owner, 'erased-travel-original-financial-custody');
    return { originalWithdrawn: true, financialActualMinor: report.totalMinor };
}
