import { travelExportsJourney } from './travel-exports-flow.mjs';
import assert from 'node:assert/strict';

import { join } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { harness } from './purse-harness.mjs';
import { reauthenticateErasure } from './erasure-flow.mjs';
import { travelFixture, approvedAmendedTrip, syntheticCoasterReport, assertTravelSettlement } from './travel-helpers.mjs';

// Rate-table pins are covered by the dated travel estimate and settlement below.

export async function travelFlow(){
{
 // INTAKE-006 native Austin travel estimate, manager and finance chain, date amendments and exact reservations
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
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

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // INTAKE-006 native report import rejects wrong authority and sources, transfers actual and releases once
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
    await travelExportsJourney();
    const fixture = await travelFixture(); t.after(() => fixture.h.close());
    const { travel, h } = fixture, request = await approvedAmendedTrip(fixture), original = syntheticCoasterReport(request);
    const body = { id: request.id, revision: request.revision, original, sourceUrl: 'http://127.0.0.1:8788/api/coaster/claims/synthetic-purse-20', confirmed: true, closed: true, reason: 'synthetic-purse-29' };
    const invalid = JSON.parse(original); invalid.revisions[0].snapshot.items[0].fields.purse_reference = 'synthetic-purse-30';
    await travel('expense-return', { ...body, original: JSON.stringify(invalid) }, h.owner, 409);
    await travel('expense-return', { ...body, closed: false }, h.owner, 400);
    await travel('expense-return', { ...body, sourceUrl: 'http://example.test/api/coaster/claims/synthetic-purse-20' }, h.owner, 400);
    const settled = await assertTravelSettlement(fixture, request, original, body.sourceUrl);
    await travel('amend', { ...fixture.input, id: request.id, revision: request.revision, reason: 'synthetic-purse-31' }, fixture.requester, 409);
    // Assistant custody is also affected even when the expense employee is a
    // different, still-active traveler and the opaque JSON omits the assistant.
    const assistantTrip = await fixture.approve(await travel('request', { ...fixture.input, travel: { ...fixture.input.travel, traveler: 'synthetic-purse-9', travelerEmail: 'synthetic-purse-9@example.test' } }));
    const assistantSource = JSON.parse(syntheticCoasterReport(assistantTrip)); assistantSource.claim.id = 'synthetic-purse-64';
    const assistantExpense = await travel('expense-return', { ...body, id: assistantTrip.id, revision: assistantTrip.revision, original: JSON.stringify(assistantSource), sourceUrl: 'http://127.0.0.1:8788/api/coaster/claims/synthetic-purse-64' }, h.owner);
    await h.command('member', { email: 'synthetic-purse-6@example.test', name: 'synthetic-purse-6@example.test', roles: ['requester'], active: false });
    await reauthenticateErasure(h);
    const meta = await h.send('/api/purse/erasure', undefined, h.owner);
    const preview = await h.send('/api/purse/erasure/preview', { kind: 'member', id: 'synthetic-purse-6@example.test', revision: meta.value.revision }, h.owner);
    assert.equal(preview.status, 200, JSON.stringify(preview.value));
    assert.ok(preview.value.coverage.find(entry => /Traveler/.test(entry.store)).fields > 0, 'Traveler and assistant identities are in the reviewed inventory');
    const erased = await h.send('/api/purse/erasure/execute', { ...preview.value.subject, revision: preview.value.revision, review: preview.value.review, fingerprint: preview.value.fingerprint, consent: true }, h.owner);
    assert.equal(erased.status, 200, JSON.stringify(erased.value));
    const archive = join(h.dir, 'synthetic-purse-travel-erased.rer');
    await exportArchive(await createPortability({ db: h.db, buckets: { ORIGINALS: h.originals }, policy: portability }), archive, []);
    const restored = await harness(); t.after(() => restored.close());
    await importArchive(await createPortability({ db: restored.db, buckets: { ORIGINALS: restored.originals }, policy: portability }), archive, []);
    for (const instance of [h, restored]) {
        const data = (await instance.state()).data;
        const retained = data.travelExpense.filter(report => [settled.id, assistantExpense.id].includes(report.id));
        assert.equal(retained.length, 2);
        for (const report of retained) {
            assert.equal(report.erasure, erased.value.id); assert.equal(report.originalStatus, 'withdrawn'); assert.equal(report.originalSourceVerified, false);
            assert.equal(report.totalMinor, 215000); assert.equal(report.sha256, report.id === settled.id ? settled.sha256 : assistantExpense.sha256);
            assert.equal((await instance.send('/api/purse/download/attachment/' + report.attachment, undefined, instance.owner)).status, 410);
        }
        assert.equal(data.periodBudgets.find(budget => budget.id === request.policy).actualMinor, 430000);
        const rows = (await instance.db.prepare('SELECT * FROM p_records').all()).results;
        assert.equal(JSON.stringify(rows).includes('synthetic-purse-6@example.test'), false);
        for (const report of retained) {
            const attachment = JSON.parse(rows.find(row => row.kind === 'attachment' && row.id === report.attachment).value);
            assert.equal(attachment.base64, ''); assert.equal(attachment.erasure, erased.value.id); assert.equal(attachment.sha256, report.sha256);
        }
    }
    assert.equal((await restored.send('/api/purse/travel/references', undefined, fixture.requester)).status, 401);

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // Assistant travel gives only the exact active traveler approved booking terms and keeps source custody unchanged
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
    const f = await travelFixture(); t.after(() => f.h.close());
    const { h, travel, input, stranger } = f;
    const draft = await travel('request', { ...input, travel: { ...input.travel, travelerEmail: 'synthetic-purse-9@example.test', traveler: 'synthetic-purse-9' } });
    const approved = await f.approve(draft), reference = { approvalReference: approved.travel.approvalReference, revision: approved.revision, status: 'approved', destinations: approved.travel.destinations, departureDate: approved.travel.departureDate, returnDate: approved.travel.returnDate, costs: approved.travel.costs, currency: approved.currency };
    assert.equal((await h.send('/api/purse/travel/references')).status, 401);
    assert.deepEqual((await h.send('/api/purse/travel/references', undefined, stranger)).value.travelReference, [reference]);
    assert.deepEqual((await h.send('/api/purse/travel/references?email=synthetic-purse-6@example.test', undefined, stranger)).value.travelReference, [reference], 'Input cannot impersonate the native email identity');
    assert.deepEqual((await h.send('/api/purse/travel/references', undefined, f.requester)).value.travelReference, []);
    const data = (await h.state(stranger)).data;
    assert.deepEqual(data.travelReference, [reference]);
    for (const kind of ['request', 'revision', 'decision', 'commitment', 'travelExpense', 'travelRelease', 'travelReleasePolicy']) assert.equal(data[kind].some(row => row.id === approved.id || row.request === approved.id), false, `${kind} remains private`);
    assert.equal(data.policy.some(row => row.id === approved.policy), false);
    for (const [kind,id] of [['request',approved.id],['policy',approved.policy]]) assert.equal((await h.send('/api/purse/download/' + kind + '/' + id, undefined, stranger)).status,403);
    assert.equal(data.periodBudgets.some(row=>row.id===approved.policy),false);
    const attachment = await h.command('attachment', { kind: 'request', record: draft.id, name: 'synthetic-purse-60.txt', mediaType: 'text/plain', base64: Buffer.from('synthetic-purse-61').toString('base64') }, f.requester);
    assert.equal((await h.send('/api/purse/download/attachment/' + attachment.id, undefined, stranger)).status, 403);
    await travel('amend', { ...input, id: draft.id, revision: draft.revision, reason: 'synthetic-purse-65' }, stranger, 403);
    const amended = await travel('amend', { ...input, id: draft.id, revision: draft.revision, reason: 'synthetic-purse-62', travel: { ...input.travel, travelerEmail: 'synthetic-purse-9@example.test', traveler: 'synthetic-purse-9' } });
    assert.equal(amended.travel.approvalReference, undefined);
    assert.deepEqual((await h.send('/api/purse/travel/references', undefined, stranger)).value.travelReference, []);
    const again = await f.approve(amended);
    const approverAmend = await travel('amend', { ...input, id: again.id, revision: again.revision, reason: 'synthetic-purse-66', travel: { ...input.travel, travelerEmail: 'synthetic-purse-9@example.test', traveler: 'synthetic-purse-9' } }, f.manager);
    assert.equal(approverAmend.status, 'draft');
    assert.equal(approverAmend.travel.approvalReference, undefined);
    assert.equal(await f.balance(again.id), 0);
    await h.command('member', { email: 'synthetic-purse-9@example.test', name: 'synthetic-purse-9', roles: ['requester'], active: false });
    assert.equal((await h.send('/api/purse/travel/references', undefined, stranger)).status, 403);
    await h.command('member', { email: 'synthetic-purse-9@example.test', name: 'synthetic-purse-9', roles: ['requester'], active: true });
    const session = await h.send('/auth/session', undefined, stranger);
    assert.equal((await h.send('/auth/operator/status', { operatorId: session.value.operator.id, status: 'inactive' }, h.owner)).status, 200);
    assert.equal((await h.send('/api/purse/travel/references', undefined, stranger)).status, 401);

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // Retained native travel approvals accept later financial evidence after approver departure without reviving purchase authority
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
    const f = await travelFixture(); t.after(() => f.h.close());
    const request = await approvedAmendedTrip(f), original = syntheticCoasterReport(request);
    await f.h.command('member', { email: 'synthetic-purse-7@example.test', name: 'synthetic-purse-7', roles: [], active: false });
    const settled = await f.travel('expense-return', { id: request.id, revision: request.revision, original, sourceUrl: 'http://127.0.0.1:8788/api/coaster/claims/synthetic-purse-20', confirmed: true, closed: true, reason: 'synthetic-purse-63' }, f.h.owner);
    assert.equal(settled.totalMinor, 215000); assert.equal(settled.releasedMinor, 55000); assert.equal(await f.balance(request.id), 0);
    assert.equal((await f.h.state()).data.order.length, 0);
    await f.h.command('convert', { id: request.id, revision: request.revision }, f.h.owner, 409);

 } finally {for(const close of cleanups.reverse())await close();}
}
}
