// Run only through heavy-slot with a real current Coaster checkout installed.
// No fixture or product substitute is used when COASTER_CHECKOUT is unavailable.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { harness } from './purse-harness.mjs';
import { coasterTravelReport } from './travel-coaster.mjs';
import { travelFixture, approvedAmendedTrip, assertTravelSettlement } from './travel-helpers.mjs';

assert.ok(process.env.COASTER_CHECKOUT, 'COASTER_CHECKOUT must name an installed real Coaster checkout');
const fixture = await travelFixture();
try {
    const request = await approvedAmendedTrip(fixture);
    const source = await coasterTravelReport({ checkout: process.env.COASTER_CHECKOUT, reference: request.travel.approvalReference, traveler: request.travel.travelerEmail, date: '2026-10-20' });
    const sourceUrl = source.source.origin + source.source.route;
    const expense = await assertTravelSettlement(fixture, request, source.bytes, sourceUrl);
    const evidence=resolve(process.env.PURSE_EVIDENCE??'.cache/travel');await mkdir(evidence,{recursive:true});
    const archive=join(evidence,'INTAKE-006-'+request.id+'.rer');await exportArchive(await createPortability({db:fixture.h.db,buckets:{ORIGINALS:fixture.h.originals},policy:portability}),archive,[]);
    const restored=await harness();try {
        await importArchive(await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability}),archive,[]);
        const state=(await restored.state()).data;assert.equal(state.travelExpense[0].sha256,expense.sha256);assert.equal(state.periodBudgets.find(budget=>budget.id===expense.policy).actualMinor,215000);
        const original=await restored.send('/api/purse/download/attachment/'+expense.attachment,undefined,restored.owner);assert.equal(original.status,200);assert.deepEqual(JSON.parse(source.bytes),original.value);
        const replay=await restored.command('travel-expense-return',{id:request.id,revision:request.revision,original:source.bytes,sourceUrl,confirmed:true,closed:true,reason:'Reviewed exact restored source'});assert.equal(replay.id,expense.id);assert.equal((await restored.state()).data.travelExpense.length,1);
    } finally {await restored.close();}
    console.log(JSON.stringify({ outcome: 'passed', request: request.id, approvalReference: request.travel.approvalReference, actualMinor: expense.totalMinor, releasedMinor: expense.releasedMinor, originalSha256: expense.sha256, coaster: source.source }));
} finally { await fixture.h.close(); }
