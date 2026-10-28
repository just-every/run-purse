import assert from 'node:assert/strict';

import { join } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { harness } from './purse-harness.mjs';
import { travelFixture } from './travel-helpers.mjs';

const reviewerEmail = 'synthetic-purse-101@example.test';
const decision = request => ({ id: request.id, revision: request.revision, decision: 'approved', reason: 'synthetic-purse-102' });
function internationalInput(input) {
    return { ...input, travel: { ...input.travel, destinations: [...input.travel.destinations, { city: 'synthetic-purse-103', country: 'CA' }], costs: { ...input.travel.costs, mealsIncidentalsMinor: 20000 } } };
}

export async function travel_routingFlow(){
{
 // INTAKE-006 optional owner-configured international review extends the native chain with current independent authority
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
    const fixture = await travelFixture(); t.after(() => fixture.h.close());
    const { h, policy, input, travel, manager, finance, requester } = fixture;
    const reviewer = await h.member(reviewerEmail, ['approver']);
    const administrator = await h.member('synthetic-purse-104@example.test', ['admin']);
    const foreign = internationalInput(input);

    // With no explicit setting, an international trip keeps its ordinary chain.
    const ordinary = await travel('request', foreign);
    await fixture.approve(ordinary);
    await h.command('policy', { ...policy, internationalTravelReviewer: reviewerEmail }, administrator, 403);
    await h.command('policy', { ...policy, internationalTravelReviewer: 'synthetic-purse-105' }, h.owner, 400);
    const configured = await h.command('policy', { ...policy, internationalTravelReviewer: ' SYNTHETIC-PURSE-101@EXAMPLE.TEST ' });
    assert.equal(configured.internationalTravelReviewer, reviewerEmail);
    const { internationalTravelReviewer, ...otherForm } = configured;
    const preserved = await h.command('policy', otherForm, administrator);
    assert.equal(preserved.internationalTravelReviewer, reviewerEmail, 'An unrelated policy form preserves owner configuration');
    await h.command('policy', { ...preserved, internationalTravelReviewer: '' }, administrator, 403);
    await h.command('policy', preserved, administrator);

    const domestic = await travel('request', input);
    await fixture.approve(domestic);
    const request = await travel('request', foreign);
    const submitted = await travel('submit', { id: request.id, revision: request.revision });
    assert.deepEqual(submitted.approvalRoute.map(step => step.email), [policy.approver, policy.approvalSteps[0].email, reviewerEmail]);
    await travel('decision', decision(request), reviewer, 403);
    await travel('decision', decision(request), requester, 403);
    await travel('decision', decision(request), manager);
    const financeApproved = await travel('decision', decision(request), finance);
    assert.equal(financeApproved.status, 'pending');
    assert.equal(financeApproved.travel.approvalReference, undefined);
    await h.command('member', { email: reviewerEmail, name: 'synthetic-purse-101', roles: ['requester'], active: true });
    await travel('decision', decision(request), reviewer, 403);
    await h.command('member', { email: reviewerEmail, name: 'synthetic-purse-101', roles: ['approver'], active: true });
    const approved = await travel('decision', decision(request), reviewer);
    assert.equal(approved.status, 'approved'); assert.ok(approved.travel.approvalReference);
    await h.command('convert', { id: request.id, revision: request.revision }, h.owner, 409);
    const state = (await h.state()).data;
    const approvals = state.decision.filter(row => row.request === request.id);
    assert.equal(approvals.length, submitted.approvalRoute.length);
    assert.ok(approvals.every(row => row.policySnapshot.internationalTravelReviewer === reviewerEmail));
    assert.deepEqual(state.revision.find(row => row.request === request.id && row.revision === request.revision).approvalRoute, submitted.approvalRoute);
    const audit = await h.send('/api/purse/audit?subject=' + request.id, undefined, h.owner);
    assert.equal(audit.status, 200);
    assert.ok(audit.value.events.some(event => event.action === 'decision' && event.chainStep === submitted.approvalRoute.at(-1).id && event.email === reviewerEmail));
    assert.equal(state.order.length, 0);

    const cleared = await h.command('policy', { ...preserved, internationalTravelReviewer: ' ' });
    assert.equal(cleared.internationalTravelReviewer, undefined);
    const afterClear = await travel('request', foreign);
    await fixture.approve(afterClear);
    assert.equal((await h.state()).data.order.length, 0);

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // INTAKE-006 international travel approval routes and policy evidence survive a real archive without restoring authority
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
    const fixture = await travelFixture(); t.after(() => fixture.h.close());
    const { h, policy, input, travel, manager, finance } = fixture;
    await h.member(reviewerEmail, ['approver']);
    await h.command('policy', { ...policy, internationalTravelReviewer: reviewerEmail });
    const request = await travel('request', internationalInput(input));
    const submitted = await travel('submit', { id: request.id, revision: request.revision });
    await travel('decision', decision(request), manager);
    await travel('decision', decision(request), finance);
    const before = (await h.state()).data;
    const archive = join(h.dir, 'synthetic-purse-106.rer');
    await exportArchive(await createPortability({ db: h.db, buckets: { ORIGINALS: h.originals }, policy: portability }), archive, []);
    const restored = await harness(); t.after(() => restored.close());
    await importArchive(await createPortability({ db: restored.db, buckets: { ORIGINALS: restored.originals }, policy: portability }), archive, []);
    const after = (await restored.state()).data;
    assert.equal(after.policy.find(row => row.id === policy.id).internationalTravelReviewer, reviewerEmail);
    assert.deepEqual(after.request.find(row => row.id === request.id).approvalRoute, submitted.approvalRoute);
    for (const kind of ['revision', 'decision']) assert.deepEqual(after[kind].filter(row => row.request === request.id), before[kind].filter(row => row.request === request.id));
    const refused = await restored.send('/api/purse/travel/decision', decision(request));
    assert.equal(refused.status, 401);
    assert.equal(after.request.find(row => row.id === request.id).status, 'pending');
    assert.equal(after.order.length, 0);

 } finally {for(const close of cleanups.reverse())await close();}
}
}
