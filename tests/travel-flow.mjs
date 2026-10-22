// Run only through heavy-slot with a real current Coaster checkout installed.
// No fixture or product substitute is used when COASTER_CHECKOUT is unavailable.
import assert from 'node:assert/strict';
import { coasterTravelReport } from './travel-coaster.mjs';
import { travelFixture, approvedAmendedTrip, assertTravelSettlement } from './travel-helpers.mjs';

assert.ok(process.env.COASTER_CHECKOUT, 'COASTER_CHECKOUT must name an installed real Coaster checkout');
const fixture = await travelFixture();
try {
    const request = await approvedAmendedTrip(fixture);
    const source = await coasterTravelReport({ checkout: process.env.COASTER_CHECKOUT, reference: request.travel.approvalReference, traveler: request.travel.travelerEmail, date: '2026-10-20' });
    const sourceUrl = source.source.origin + source.source.route;
    const expense = await assertTravelSettlement(fixture, request, source.bytes, sourceUrl);
    console.log(JSON.stringify({ outcome: 'passed', request: request.id, approvalReference: request.travel.approvalReference, actualMinor: expense.totalMinor, releasedMinor: expense.releasedMinor, originalSha256: expense.sha256, coaster: source.source }));
} finally { await fixture.h.close(); }
