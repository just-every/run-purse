import assert from 'node:assert/strict';
import { approvedAmendedTrip } from './travel-helpers.mjs';
import { travelExportReport } from './travel-exports-flow.mjs';

export async function travelExportsBrowserJourney({ fixture, open, mutation, capture }) {
    const { h } = fixture, request = await approvedAmendedTrip(fixture);
    const ap = await h.member('synthetic-purse-80@example.test', ['ap-clerk']);
    await h.command('member', { email: 'synthetic-purse-80@example.test', name: 'synthetic-purse-80', grants: [{ role: 'ap-clerk', scope: { departments: ['synthetic-purse-3'], projects: ['synthetic-purse-4'] } }] });
    const requesterTab = await open(fixture.requester, request.id);
    assert.equal(await requesterTab.getByText('Return final expense report', { exact: true }).count(), 0);
    const tab = await open(ap, request.id);
    await tab.getByText('Return final expense report', { exact: true }).click();
    const form = tab.locator('form').filter({ has: tab.getByRole('button', { name: 'Reconcile final travel expense report', exact: true }) });
    const select = form.getByLabel('Expense report source', { exact: true });
    for (const provider of ['expensify', 'ramp', 'brex', 'navan']) {
        await select.selectOption(provider);
        await form.getByLabel('Original expense CSV', { exact: true }).waitFor();
    }
    const body = travelExportReport(request, 'navan');
    await form.getByLabel('Original expense CSV', { exact: true }).setInputFiles({ name: body.sourceName, mimeType: 'text/csv', buffer: Buffer.from(body.original) });
    for (const [label, value] of [
        ['Source workspace or account', body.sourceReview.sourceAccount], ['Source report ID', body.sourceReview.reportId], ['Source report title', body.sourceReview.title],
        ['Reviewed report total', body.sourceReview.totalAmount], ['Independent final approver email', body.sourceReview.approvedBy], ['Final source approval date', body.sourceReview.approvedAt], ['Expense return reason', body.reason],
    ]) await form.getByLabel(label, { exact: true }).fill(value);
    await form.getByLabel('Source report status', { exact: true }).selectOption('approved');
    await form.getByLabel('I reviewed the independent final approval for this complete source report.', { exact: true }).check();
    await form.getByLabel('I reviewed the original report and its source.', { exact: true }).check();
    await form.getByLabel('This is the trip’s final expense report. Release the unspent reservation.', { exact: true }).check();
    await capture(tab, 'navan-reviewed-export');
    const expense = await mutation(tab, 'travel-expense-return', () => form.getByRole('button', { name: 'Reconcile final travel expense report', exact: true }).click());
    assert.equal(expense.provider, 'navan'); assert.equal(expense.totalMinor, 215000); assert.equal(expense.releasedMinor, 55000); assert.equal(await fixture.balance(request.id), 0);
    const report = tab.getByRole('region', { name: 'Linked travel expense report', exact: true }); await report.waitFor();
    assert.ok((await report.textContent()).includes('Navan report'));
    assert.equal(await report.getByRole('link', { name: 'Download exact original Navan report', exact: true }).count(), 0);
    assert.equal((await tab.context().request.get(h.origin + '/api/purse/download/attachment/' + expense.attachment)).status(), 403);
    await capture(tab, 'navan-scoped-finance-actual');
    const ownerTab = await open(h.owner, request.id);
    await ownerTab.getByRole('link', { name: 'Download exact original Navan report', exact: true }).waitFor();
    const original = await ownerTab.context().request.get(h.origin + '/api/purse/download/attachment/' + expense.attachment);
    assert.equal(original.status(), 200); assert.deepEqual(await original.body(), Buffer.from(body.original));
    return { request: request.id, provider: expense.provider, totalMinor: expense.totalMinor, releasedMinor: expense.releasedMinor, sha256: expense.sha256 };
}
