import assert from 'node:assert/strict';
import test from 'node:test';
import { travelFixture, approvedAmendedTrip, syntheticCoasterReport, assertTravelSettlement } from './travel-helpers.mjs';

test('Published GSA meals defaults use exact fiscal-year city or county scope and explicit standard CONUS selection', async t => {
    const f = await travelFixture(); t.after(() => f.h.close());
    const quote = (destination, departureDate = '2026-10-19', returnDate = '2026-10-21') => f.travel('per-diem', { destination, departureDate, returnDate });
    for (const [city, state, county, dailyMinor] of [
        ['San Francisco', ' California ', '', 9200], [' Phoenix ', 'az', '', 8600],
        ['St. Petersburg', 'FL', '', 8000], ['Golden', 'Colorado', 'Jefferson County', 9200],
        ['New Orleans', 'LA', 'Orleans Parish', 8000], ['Rockville', 'MD', 'Montgomery County', 9200],
    ]) {
        const rate = await quote({ city, state, county, country: 'US' });
        assert.equal(rate.available, true, city); assert.equal(rate.dailyMinor, dailyMinor, city);
        assert.equal(rate.boundaryMinor, dailyMinor * 3 / 4); assert.equal(rate.amountMinor, dailyMinor * 2.5);
        assert.equal(rate.ratePeriods[0].fiscalYear, 2027); assert.equal(rate.standardConus, false);
    }
    const halfDollar = await quote({ city: 'Nashville', state: 'TN', country: 'US' }, '2026-10-19', '2026-10-19');
    assert.equal(halfDollar.amountMinor, 6450); assert.equal(halfDollar.days, 1);
    for (const [departure, returning, fiscalYear] of [['2024-10-19', '2024-10-21', 2025], ['2026-05-19', '2026-05-21', 2026]]) {
        const rate = await quote({ city: 'San Francisco', state: 'CA', country: 'US' }, departure, returning);
        assert.equal(rate.amountMinor, 23000); assert.equal(rate.ratePeriods[0].fiscalYear, fiscalYear);
    }
    const crossed = await quote({ city: 'Austin', state: 'TX', country: 'US' }, '2026-09-30', '2026-10-02');
    assert.equal(crossed.amountMinor, 20000); assert.deepEqual(crossed.ratePeriods.map(rate => rate.fiscalYear), [2026, 2027]);
    assert.equal((await quote({ city: 'Allentown', state: 'PA', country: 'US' }, '2026-05-19', '2026-05-21')).dailyMinor, 7400);
    for (const destination of [
        { city: 'Allentown', state: 'PA', country: 'US' },
        { city: 'Springfield', state: '', country: 'US' },
        { city: 'Austin', state: 'TX', county: 'Harris County', country: 'US' },
        { city: 'Beverly Hills', state: 'CA', county: 'Los Angeles County', country: 'US' },
        { city: 'Honolulu', state: 'HI', country: 'US', standardConus: true },
        { city: 'Georgetown', state: 'DC', country: 'US', standardConus: true },
        { city: 'Austin', state: 'TX', country: 'US', standardConus: true },
        { city: 'Golden', state: 'CO', county: 'Jefferson County', country: 'US', standardConus: true },
    ]) assert.equal((await quote(destination)).available, false, JSON.stringify(destination));
    assert.equal((await quote({ city: 'Austin', state: 'TX', country: 'US' }, '2027-10-19', '2027-10-21')).available, false);
    const standard = { city: 'Dickinson', state: 'North Dakota', country: 'US' };
    assert.equal((await quote(standard)).available, false, 'Unknown city never silently falls back to standard');
    const rate = await quote({ ...standard, standardConus: true });
    assert.equal(rate.amountMinor, 17000); assert.equal(rate.standardConus, true);
    assert.equal(rate.matchBasis, 'traveler-selected-standard-conus');
    const unknown = { ...f.input.travel, destinations: [{ city: 'Springfield', state: '', country: 'US' }] };
    await f.travel('request', { ...f.input, travel: unknown }, f.requester, 400);
    const estimated = await f.travel('request', { ...f.input, travel: { ...unknown, costs: { ...unknown.costs, mealsIncidentalsMinor: 12345 } } });
    assert.equal(estimated.travel.mealsBasis, 'explicit-estimate'); assert.equal(estimated.travel.costs.mealsIncidentalsMinor, 12345);
});

test('INTAKE-006 native Austin travel estimate, manager and finance chain, date amendments and exact reservations', async t => {
    const fixture = await travelFixture(); t.after(() => fixture.h.close());
    const { h, travel, input, requester, manager, finance, stranger, balance } = fixture;
    const defaults = await travel('per-diem', { destination: input.travel.destinations[0], departureDate: input.travel.departureDate, returnDate: input.travel.returnDate });
    assert.equal(defaults.amountMinor, 20000); assert.equal(defaults.days, 3);
    assert.equal((await h.send('/api/purse/travel/per-diem', { destination: input.travel.destinations[0], departureDate: input.travel.departureDate, returnDate: input.travel.returnDate })).status, 401);
    const request = await approvedAmendedTrip(fixture);
    await travel('decision', { id: request.id, revision: request.revision, decision: 'approved', reason: 'synthetic-purse-23' }, finance, 409);
    assert.equal(await balance(request.id), 270000);
    await h.command('need-date-edit', { id: request.id, revision: request.revision, line: request.lines[0].id, needDate: '2026-10-25', reason: 'Travel dates require renewed approval' }, requester, 409);
    await h.command('convert', { id: request.id, revision: request.revision }, h.owner, 409);
    await h.command('amend', { id: request.id, revision: request.revision }, requester, 409);
    await travel('amend', { ...input, id: request.id, revision: request.revision, reason: 'synthetic-purse-24' }, stranger, 403);
    const dates = await travel('amend', { ...input, id: request.id, revision: request.revision, reason: 'synthetic-purse-25', travel: { ...input.travel, departureDate: '2026-10-20', returnDate: '2026-10-22' } });
    assert.equal(dates.status, 'draft'); assert.equal(dates.travel.approvalReference, undefined);
    assert.equal((await h.state()).data.decision.filter(row => row.request === request.id && row.revision === dates.revision).length, 0);
    await travel('submit', { id: dates.id, revision: dates.revision });
    await travel('decision', { id: dates.id, revision: dates.revision, decision: 'approved', reason: 'synthetic-purse-26' }, finance, 403);
    await travel('decision', { id: dates.id, revision: dates.revision, decision: 'approved', reason: 'synthetic-purse-27' }, requester, 403);
    await travel('decision', { id: dates.id, revision: dates.revision, decision: 'approved', reason: 'synthetic-purse-28' }, manager);
});

test('INTAKE-006 native report import rejects wrong authority and sources, transfers actual and releases once', async t => {
    const fixture = await travelFixture(); t.after(() => fixture.h.close());
    const { travel, h } = fixture, request = await approvedAmendedTrip(fixture), original = syntheticCoasterReport(request);
    const body = { id: request.id, revision: request.revision, original, sourceUrl: 'http://127.0.0.1:8788/api/coaster/claims/synthetic-purse-20', confirmed: true, closed: true, reason: 'synthetic-purse-29' };
    const invalid = JSON.parse(original); invalid.revisions[0].snapshot.items[0].fields.purse_reference = 'synthetic-purse-30';
    await travel('expense-return', { ...body, original: JSON.stringify(invalid) }, h.owner, 409);
    await travel('expense-return', { ...body, closed: false }, h.owner, 400);
    await travel('expense-return', { ...body, sourceUrl: 'http://example.test/api/coaster/claims/synthetic-purse-20' }, h.owner, 400);
    await assertTravelSettlement(fixture, request, original, body.sourceUrl);
    await travel('amend', { ...fixture.input, id: request.id, revision: request.revision, reason: 'synthetic-purse-31' }, fixture.requester, 409);
});

test('Assistant travel gives only the exact active traveler a booking reference and keeps source custody unchanged', async t => {
    const f = await travelFixture(); t.after(() => f.h.close());
    const { h, travel, input, stranger } = f;
    const draft = await travel('request', { ...input, travel: { ...input.travel, travelerEmail: 'synthetic-purse-9@example.test', traveler: 'synthetic-purse-9' } });
    const approved = await f.approve(draft), reference = { approvalReference: approved.travel.approvalReference, revision: approved.revision, status: 'approved' };
    assert.equal((await h.send('/api/purse/travel/references')).status, 401);
    assert.deepEqual((await h.send('/api/purse/travel/references', undefined, stranger)).value.travelReference, [reference]);
    assert.deepEqual((await h.send('/api/purse/travel/references?email=synthetic-purse-6@example.test', undefined, stranger)).value.travelReference, [reference], 'Input cannot impersonate the native email identity');
    assert.deepEqual((await h.send('/api/purse/travel/references', undefined, f.requester)).value.travelReference, []);
    const data = (await h.state(stranger)).data;
    assert.deepEqual(data.travelReference, [reference]);
    for (const kind of ['request', 'revision', 'decision', 'commitment', 'travelExpense', 'travelRelease', 'travelReleasePolicy']) assert.equal(data[kind].some(row => row.id === approved.id || row.request === approved.id), false, `${kind} remains private`);
    assert.equal(data.policy.some(row => row.id === approved.policy), false);
    const attachment = await h.command('attachment', { kind: 'request', record: draft.id, name: 'synthetic-purse-60.txt', mediaType: 'text/plain', base64: Buffer.from('synthetic-purse-61').toString('base64') }, f.requester);
    assert.equal((await h.send('/api/purse/download/attachment/' + attachment.id, undefined, stranger)).status, 403);
    const amended = await travel('amend', { ...input, id: draft.id, revision: draft.revision, reason: 'synthetic-purse-62', travel: { ...input.travel, travelerEmail: 'synthetic-purse-9@example.test', traveler: 'synthetic-purse-9' } });
    assert.equal(amended.travel.approvalReference, undefined);
    assert.deepEqual((await h.send('/api/purse/travel/references', undefined, stranger)).value.travelReference, []);
    await h.command('member', { email: 'synthetic-purse-9@example.test', name: 'synthetic-purse-9', roles: ['requester'], active: false });
    assert.equal((await h.send('/api/purse/travel/references', undefined, stranger)).status, 403);
    await h.command('member', { email: 'synthetic-purse-9@example.test', name: 'synthetic-purse-9', roles: ['requester'], active: true });
    const session = await h.send('/auth/session', undefined, stranger);
    assert.equal((await h.send('/auth/operator/status', { operatorId: session.value.operator.id, status: 'inactive' }, h.owner)).status, 200);
    assert.equal((await h.send('/api/purse/travel/references', undefined, stranger)).status, 401);
});

test('Retained native travel approvals accept later financial evidence after approver departure without reviving purchase authority', async t => {
    const f = await travelFixture(); t.after(() => f.h.close());
    const request = await approvedAmendedTrip(f), original = syntheticCoasterReport(request);
    await f.h.command('member', { email: 'synthetic-purse-7@example.test', name: 'synthetic-purse-7', roles: [], active: false });
    const settled = await f.travel('expense-return', { id: request.id, revision: request.revision, original, sourceUrl: 'http://127.0.0.1:8788/api/coaster/claims/synthetic-purse-20', confirmed: true, closed: true, reason: 'synthetic-purse-63' }, f.h.owner);
    assert.equal(settled.totalMinor, 215000); assert.equal(settled.releasedMinor, 55000); assert.equal(await f.balance(request.id), 0);
    assert.equal((await f.h.state()).data.order.length, 0);
    await f.h.command('convert', { id: request.id, revision: request.revision }, f.h.owner, 409);
});
