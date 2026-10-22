import assert from 'node:assert/strict';
import { harness } from './purse-harness.mjs';

export async function travelFixture() {
    const h = await harness();
    try {
        await h.command('business', { name: 'synthetic-purse-1', currencies: ['USD'], locations: ['synthetic-purse-2'], costCentres: ['synthetic-purse-3'], projects: ['synthetic-purse-4'] });
        const requester = await h.member('synthetic-purse-6@example.test', ['requester']);
        const manager = await h.member('synthetic-purse-7@example.test', ['approver']);
        const finance = await h.member('synthetic-purse-8@example.test', ['approver', 'ap-clerk']);
        const stranger = await h.member('synthetic-purse-9@example.test', ['requester']);
        const policy = await h.command('policy', { name: 'synthetic-purse-10', currency: 'USD', category: 'travel', project: '*', costCentre: 'synthetic-purse-3', approver: 'synthetic-purse-7@example.test', limitMinor: 1000000, budgetMinor: 1000000, budgetPeriod: { from: '2026-10-01', through: '2027-09-30' }, approvalSteps: [{ email: 'synthetic-purse-8@example.test', minMinor: 200001 }] });
        const input = { title: 'synthetic-purse-11', currency: 'USD', location: 'synthetic-purse-2', costCentre: 'synthetic-purse-3', project: 'synthetic-purse-4', travel: { traveler: 'synthetic-purse-6', travelerEmail: 'synthetic-purse-6@example.test', purpose: 'synthetic-purse-12', origin: 'synthetic-purse-13', destinations: [{ city: 'Austin', state: 'TX', country: 'US' }], departureDate: '2026-10-19', returnDate: '2026-10-21', costs: { airfareMinor: 100000, lodgingMinor: 80000, groundTransportMinor: 20000, registrationMinor: 20000 } } };
        const travel = async (operation, body, cookie = requester, status = 200) => {
            const response = await h.send('/api/purse/travel/' + operation, body, cookie);
            assert.equal(response.status, status, `${operation}: ${JSON.stringify(response.value)}`); return response.value;
        };
        const approve = async request => {
            const pending = await travel('submit', { id: request.id, revision: request.revision });
            assert.deepEqual(pending.approvalRoute.map(step => step.email), ['synthetic-purse-7@example.test', 'synthetic-purse-8@example.test']);
            const first = await travel('decision', { id: request.id, revision: request.revision, decision: 'approved', reason: 'synthetic-purse-14' }, manager);
            assert.equal(first.status, 'pending');
            const final = await travel('decision', { id: request.id, revision: request.revision, decision: 'approved', reason: 'synthetic-purse-15' }, finance);
            assert.equal(final.status, 'approved'); assert.ok(final.travel.approvalReference); return final;
        };
        const balance = async id => (await h.state()).data.commitment.filter(event => event.request === id).reduce((sum, event) => sum + event.amountMinor, 0);
        return { h, requester, manager, finance, stranger, input, policy, travel, approve, balance };
    } catch (error) { await h.close(); throw error; }
}
export async function approvedAmendedTrip(fixture) {
    const { travel, approve, input, balance } = fixture;
    const first = await travel('request', input);
    assert.equal(first.totalMinor, 240000); assert.equal(first.travel.costs.mealsIncidentalsMinor, 20000);
    assert.equal(first.supplier, null);
    const approved = await approve(first);
    assert.equal(await balance(first.id), 240000);
    const amendment = await travel('amend', { ...input, id: first.id, revision: first.revision, reason: 'synthetic-purse-16', travel: { ...input.travel, costs: { ...input.travel.costs, airfareMinor: 130000 } } });
    assert.equal(amendment.totalMinor, 270000); assert.equal(amendment.revision, first.revision + 1); assert.equal(amendment.travel.approvalReference, undefined);
    const result = await approve(amendment);
    assert.notEqual(result.travel.approvalReference, approved.travel.approvalReference);
    assert.equal(await balance(first.id), 270000);
    return result;
}

// Synthetic data in Coaster's documented native JSON shape is confined to tests.
export function syntheticCoasterReport(request) {
    const at = '2026-10-22T10:00:00.000Z', item = { id: 'synthetic-purse-17', spent_on: '2026-10-20', amount_minor: 215000, merchant: 'synthetic-purse-18', description: 'synthetic-purse-19', fields: { purse_reference: request.travel.approvalReference } };
    return JSON.stringify({ claim: { id: 'synthetic-purse-20', number: 1, employee_email: request.travel.travelerEmail, title: 'synthetic-purse-21', status: 'approved', revision: 1, total_minor: 215000, currency: 'USD' }, items: [item], revisions: [{ revision: 1, total_minor: 215000, submitted_at: at, snapshot: { currency: 'USD', total_minor: 215000, items: [item] } }], decisions: [{ revision: 1, decision: 'approved', actor_email: 'synthetic-purse-7@example.test', at }] });
}
export async function assertTravelSettlement(fixture, request, original, sourceUrl) {
    const { h, travel, finance, requester, stranger, balance, policy } = fixture;
    const body = { id: request.id, revision: request.revision, original, sourceUrl, confirmed: true, closed: true, reason: 'synthetic-purse-22' };
    await travel('expense-return', body, requester, 403);
    await travel('expense-return', body, stranger, 403);
    await travel('expense-return', body, finance, 403);
    const settled = await travel('expense-return', body, h.owner);
    assert.equal(settled.totalMinor, 215000); assert.equal(settled.releasedMinor, 55000);
    assert.equal(await balance(request.id), 0);
    const repeat = await travel('expense-return', body, h.owner);
    assert.equal(repeat.id, settled.id); assert.equal(await balance(request.id), 0);
    const state = (await h.state()).data, events = state.commitment.filter(event => event.request === request.id);
    assert.equal(events.filter(event => event.kind === 'travel-actual-movement').length, 1);
    assert.equal(events.filter(event => event.kind === 'travel-unspent-release').length, 1);
    assert.equal(state.request.find(row => row.id === request.id).travel.expenseReport, settled.id);
    assert.equal(state.travelExpense.filter(row => row.request === request.id).length, 1);
    const budget = state.periodBudgets.find(row => row.id === policy.id);
    assert.equal(budget.reservedMinor, 0); assert.equal(budget.actualMinor, 215000); assert.equal(budget.availableMinor, 785000);
    const download = await h.send('/api/purse/download/attachment/' + settled.attachment, undefined, h.owner);
    assert.equal(download.status, 200);
    const exact = await fetch(h.origin + '/api/purse/download/attachment/' + settled.attachment, { headers: { cookie: h.owner } });
    assert.equal(await exact.text(), original, 'Native report original downloads byte for byte');
    assert.equal((await h.send('/api/purse/download/attachment/' + settled.attachment, undefined, requester)).status, 403);
    const summary=(await h.state(requester)).data.travelExpense.find(report=>report.id===settled.id);assert.equal(summary.attachment,undefined);assert.equal(summary.sourceUrl,undefined);assert.equal(summary.totalMinor,215000);assert.equal(summary.items.reduce((sum,item)=>sum+item.amountMinor,0),215000);
    assert.equal((await h.send('/api/purse/download/attachment/' + settled.attachment, undefined, stranger)).status, 403);
    assert.equal((await h.send('/api/purse/download/attachment/' + settled.attachment)).status, 401);
    const report = await h.send('/api/purse/spend-report?groupBy=department', undefined, finance);
    assert.equal(report.status, 200); assert.equal(report.value.totals.find(row => row.currency === 'USD').actualMinor, 215000);
    assert.equal(report.value.rows.filter(row => row.travelExpense === settled.id).reduce((sum, row) => sum + row.amountMinor, 0), 215000);
    const history=await h.send('/api/purse/audit?subject='+request.id,undefined,h.owner);assert.equal(history.status,200);assert.ok(history.value.events.some(event=>event.action==='travel-expense-return'&&event.report===settled.id&&event.actualMinor===215000&&event.releasedMinor===55000));assert.ok(history.value.events.some(event=>event.action==='attachment'&&event.record===settled.id&&event.attachment===settled.attachment));
    const csv=await h.send('/api/purse/audit.csv?subject='+request.id,undefined,h.owner);assert.equal(csv.status,200);assert.ok(csv.value.includes('travel-expense-return'));assert.ok(csv.value.includes(settled.sha256));
    assert.equal(state.order.length, 0); assert.equal(state.invoice.length, 0);
    return settled;
}
