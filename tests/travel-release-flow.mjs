// Exact-candidate timing journey: run outside push Verify through heavy-slot.
// Requires an installed real local Coaster; never substitutes a product fixture.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { harness } from './purse-harness.mjs';
import { coasterTravelReport } from './travel-coaster.mjs';
import { travelFixture, approvedAmendedTrip } from './travel-helpers.mjs';

assert.ok(process.env.COASTER_CHECKOUT, 'COASTER_CHECKOUT must name an installed actual Coaster checkout');
const evidence = resolve(process.env.PURSE_EVIDENCE ?? '.cache/travel-release'); await mkdir(evidence, { recursive: true });
const tick = async (h, at) => {
    const response = await h.mf.dispatchFetch(h.origin + '/cdn-cgi/local/scheduled?time=' + Date.parse(at));
    assert.equal(response.status, 200, await response.text());
};
const due = '2026-10-24T04:00:00.000Z', beforeDue = '2026-10-24T03:59:59.999Z'; // Midnight in the native business's America/New_York calendar.
const enable = (request, version = 0) => ({ id: request.id, revision: request.revision, version, enabled: true, days: 3, confirmed: true, acceptLateActual: true, reason: 'synthetic-purse-70' });
const rowsFor = (data, kind, request) => data[kind].filter(row => row.request === request.id);
const result = {};

const f = await travelFixture();
try {
    const { h, travel } = f, request = await approvedAmendedTrip(f), body = enable(request);
    await tick(h, '2026-10-25T12:00:00Z');
    assert.equal(await f.balance(request.id), 270000, 'No timed release without explicit native owner consent');
    for (const cookie of [f.requester, f.stranger, f.manager, f.finance]) {
        await travel('release-policy', body, cookie, 403);
        await h.command('travel-release-policy', body, cookie, 403);
    }
    assert.equal((await h.send('/api/purse/travel/release-policy', body)).status, 401);
    const crossOrigin = await fetch(h.origin + '/api/purse/travel/release-policy', { method: 'POST', headers: { origin: 'https://example.test', cookie: h.owner, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(crossOrigin.status, 403);
    await travel('release-policy', { ...body, confirmed: false }, h.owner, 400);
    await travel('release-policy', { ...body, acceptLateActual: false }, h.owner, 400);
    await travel('release-policy', { ...body, days: 0 }, h.owner, 400);
    await travel('release-policy', { ...body, revision: request.revision - 1 }, h.owner, 409);
    const consent = await h.command('travel-release-policy', body);
    assert.equal(consent.status, 'armed'); assert.equal(consent.dueDate, '2026-10-24');
    await travel('release-policy', body, h.owner, 409);
    const armedArchive = join(evidence, 'synthetic-purse-armed.rer');
    await exportArchive(await createPortability({ db: h.db, buckets: { ORIGINALS: h.originals }, policy: portability }), armedArchive, []);
    const restored = await harness();
    try {
        await importArchive(await createPortability({ db: restored.db, buckets: { ORIGINALS: restored.originals }, policy: portability }), armedArchive, []);
        await tick(restored, due);
        const data = (await restored.state()).data;
        assert.equal(rowsFor(data, 'travelRelease', request).length, 0);
        assert.equal(data.travelReleasePolicy.find(policy => policy.request === request.id).status, 'paused', 'A restored consent is retained history and cannot lend its old owner native authority');
        assert.equal(rowsFor(data, 'commitment', request).reduce((sum, event) => sum + event.amountMinor, 0), 270000);
        assert.equal((await restored.send('/api/purse/travel/references', undefined, f.requester)).status, 401, 'Restoring the domain never restores a native session');
    } finally { await restored.close(); }
    await tick(h, beforeDue); assert.equal(await f.balance(request.id), 270000, 'UTC date alone cannot release before business midnight');
    await Promise.all([tick(h, due), tick(h, due)]); await tick(h, '2026-10-25T12:00:00Z');
    let data = (await h.state()).data;
    assert.equal(await f.balance(request.id), 0);
    assert.equal(rowsFor(data, 'travelRelease', request).length, 1);
    assert.equal(rowsFor(data, 'commitment', request).filter(event => event.kind === 'travel-timed-release').length, 1);
    assert.equal(data.request.find(row => row.id === request.id).status, 'approved');
    assert.equal(data.request.find(row => row.id === request.id).travel.closedAt, undefined);
    assert.equal(rowsFor(data, 'travelExpense', request).length, 0);
    await travel('release-policy', enable(request, consent.version + 1), h.owner, 409);
    const source = await coasterTravelReport({ checkout: process.env.COASTER_CHECKOUT, reference: request.travel.approvalReference, traveler: request.travel.travelerEmail, date: '2026-10-20' });
    // The owner was warned that funds may already be reused. Financial evidence
    // still records the actual when doing so makes available budget negative.
    const reused = await f.approve(await travel('request', { ...f.input, title: 'synthetic-purse-71', travel: { ...f.input.travel, costs: { ...f.input.travel.costs, airfareMinor: 760000 } } }));
    assert.equal(reused.totalMinor, 900000);
    await h.command('member', { email: 'synthetic-purse-7@example.test', name: 'synthetic-purse-7', roles: [], active: false });
    const returned = { id: request.id, revision: request.revision, original: source.bytes, sourceUrl: source.source.origin + source.source.route, confirmed: true, closed: true, reason: 'synthetic-purse-72' };
    const expense = await h.command('travel-expense-return', returned);
    const replay = await travel('expense-return', returned, h.owner); assert.equal(replay.id, expense.id);
    assert.equal(expense.totalMinor, 215000); assert.equal(expense.releasedMinor, 0); assert.equal(expense.earlierRelease.amountMinor, 270000); assert.equal(expense.remainingEstimateMinor, 55000);
    assert.equal(await f.balance(request.id), 0);
    data = (await h.state()).data;
    const movements = rowsFor(data, 'commitment', request);
    assert.equal(movements.filter(event => event.kind === 'travel-actual-recorded-after-release').length, 1);
    assert.equal(movements.find(event => event.kind === 'travel-actual-recorded-after-release').amountMinor, 0);
    assert.equal(movements.some(event => ['travel-actual-movement', 'travel-unspent-release'].includes(event.kind)), false);
    assert.equal(rowsFor(data, 'travelExpense', request).length, 1);
    const budget = data.periodBudgets.find(budget => budget.id === request.policy);
    assert.equal(budget.actualMinor, 215000); assert.equal(budget.reservedMinor, 900000); assert.equal(budget.availableMinor, -115000);
    const summary = (await h.state(f.requester)).data.travelExpense.find(row => row.id === expense.id);
    assert.equal(summary.attachment, undefined); assert.equal(summary.sourceUrl, undefined); assert.equal(summary.earlierRelease.amountMinor, 270000);
    assert.equal((await h.send('/api/purse/download/attachment/' + expense.attachment, undefined, f.requester)).status, 403);
    const original = await fetch(h.origin + '/api/purse/download/attachment/' + expense.attachment, { headers: { cookie: h.owner } }); assert.equal(await original.text(), source.bytes);
    const history = await h.send('/api/purse/audit?subject=' + request.id, undefined, h.owner);
    assert.equal(history.value.events.filter(event => event.action === 'travel-timed-release').length, 1);
    assert.equal(history.value.events.filter(event => event.action === 'travel-expense-return').length, 1);
    const csv = await h.send('/api/purse/audit.csv?subject=' + request.id, undefined, h.owner); assert.ok(csv.value.includes('travel-timed-release')); assert.ok(csv.value.includes('travel-expense-return'));
    const archive = join(evidence, 'synthetic-purse-timed-report.rer');
    await exportArchive(await createPortability({ db: h.db, buckets: { ORIGINALS: h.originals }, policy: portability }), archive, []);
    const retained = await harness();
    try {
        await importArchive(await createPortability({ db: retained.db, buckets: { ORIGINALS: retained.originals }, policy: portability }), archive, []);
        const current = (await retained.state()).data;
        assert.equal(current.travelExpense.find(row => row.id === expense.id).earlierRelease.amountMinor, 270000);
        assert.equal(current.travelRelease.find(row => row.request === request.id).amountMinor, 270000);
        const report = await retained.command('travel-expense-return', returned); assert.equal(report.id, expense.id);
        await tick(retained, '2026-10-26T12:00:00Z'); assert.equal((await retained.state()).data.travelExpense.length, 1);
    } finally { await retained.close(); }
    result.financial = { request: request.id, actualMinor: expense.totalMinor, earlierReleaseMinor: expense.earlierRelease.amountMinor, remainingEstimateMinor: expense.remainingEstimateMinor, availableMinor: budget.availableMinor, sha256: expense.sha256, coaster: source.source };
} finally { await f.h.close(); }

const stale = await travelFixture();
try {
    const { h, travel } = stale;
    const first = await stale.approve(await travel('request', stale.input));
    await travel('release-policy', enable(first), h.owner);
    const next = await travel('amend', { ...stale.input, id: first.id, revision: first.revision, reason: 'synthetic-purse-73' });
    await tick(h, beforeDue);
    let data = (await h.state()).data;
    assert.equal(data.travelReleasePolicy.find(policy => policy.request === first.id).status, 'paused');
    assert.equal(data.travelRelease.length, 0);
    const approved = await stale.approve(next);
    await travel('release-policy', enable(approved, 2), h.owner);
    const business = data.business[0]; await h.command('business', { ...business, timezone: 'America/Chicago' });
    await tick(h, beforeDue); data = (await h.state()).data;
    const paused = data.travelReleasePolicy.find(policy => policy.request === first.id);
    assert.equal(paused.status, 'paused'); assert.match(paused.pauseReason, /calendar/); assert.equal(await stale.balance(first.id), 240000);
    await h.command('business', { ...business, timezone: 'America/New_York' });
    const renewed = await travel('release-policy', enable(approved, paused.version), h.owner);
    const originalOwner = await h.send('/auth/session', undefined, h.owner);
    const newOwner = await h.member('synthetic-purse-74@example.test', ['requester'], 'owner');
    assert.equal((await h.send('/auth/operator/status', { operatorId: originalOwner.value.operator.id, status: 'inactive' }, newOwner)).status, 200);
    assert.equal((await h.send('/api/purse/travel/release-policy', { ...enable(approved, renewed.version), enabled: false }, h.owner)).status, 401);
    await tick(h, due); data = (await h.state(newOwner)).data;
    assert.equal(data.travelReleasePolicy.find(policy => policy.request === first.id).status, 'paused'); assert.equal(data.travelRelease.length, 0);
    assert.equal(data.commitment.filter(event => event.request === first.id).reduce((sum, event) => sum + event.amountMinor, 0), 240000);
    result.staleConsent = { revision: true, calendar: true, nativeOwner: true, noRelease: true };
} finally { await stale.h.close(); }
await writeFile(join(evidence, 'travel-release-result.json'), JSON.stringify({ outcome: 'passed', ...result }, null, 2) + '\n');
console.log(JSON.stringify({ outcome: 'passed', ...result }));
