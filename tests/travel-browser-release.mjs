import assert from 'node:assert/strict';
import { reauthenticateErasure } from './erasure-flow.mjs';
import { coasterTravelReport } from './travel-coaster.mjs';

export async function travelReferenceAndReleaseJourney({ fixture, open, mutation, capture }) {
    const { h, input, travel, stranger } = fixture;
    const request = await fixture.approve(await travel('request', { ...input, title: 'synthetic-purse-80', travel: { ...input.travel, traveler: 'synthetic-purse-9', travelerEmail: 'synthetic-purse-9@example.test', costs: { ...input.travel.costs, airfareMinor: 130000 } } }));
    const travelerTab = await open(stranger), references = travelerTab.getByRole('region', { name: 'Your travel booking references', exact: true });
    await references.getByText(request.travel.approvalReference, { exact: true }).waitFor();
    assert.equal(await travelerTab.getByText(request.title, { exact: true }).count(), 0);
    assert.equal(await travelerTab.getByRole('region', { name: 'Travel pre-approval', exact: true }).count(), 0);
    await capture(travelerTab, 'assistant-traveler-reference');
    const ownerTab = await open(h.owner, request.id);
    await ownerTab.getByText('Configure timed reservation release', { exact: true }).click();
    const policy = ownerTab.locator('form').filter({ has: ownerTab.getByRole('button', { name: 'Save travel release policy', exact: true }) });
    await policy.getByLabel('Timed release', { exact: true }).selectOption('enabled');
    await policy.getByLabel('Calendar days after return', { exact: true }).fill('3');
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
    await ownerTab.getByText('Return final Coaster expense report', { exact: true }).click();
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
