import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { harness } from './purse-harness.mjs';
import { travelFixture, approvedAmendedTrip } from './travel-helpers.mjs';
import { travelExportColumns } from '../src/purse/travel-export-format.mjs';

/** Synthetic fixtures exercise configurable provider templates, never provider
 * authentication or a fabricated network response. */
export function travelExportReport(request, provider) {
    const columns = { ...travelExportColumns[provider] };
    const fields = { id: 'synthetic-purse-71', date: '2026-10-20', amount: '2150.00', currency: request.currency, traveler: request.travel.travelerEmail, reference: request.travel.approvalReference, description: 'synthetic-purse-72, "reviewed"\nsynthetic-purse-73' };
    const quote = value => '"' + value.replaceAll('"', '""') + '"';
    const original = '\uFEFF' + Object.values(columns).map(quote).join(',') + '\r\n' + Object.keys(columns).map(key => quote(fields[key])).join(',') + '\r\n';
    return { id: request.id, revision: request.revision, provider, original, sourceName: 'synthetic-purse-74.csv', columns,
        sourceReview: { sourceAccount: 'synthetic-purse-75', reportId: 'synthetic-purse-76', title: 'synthetic-purse-77', totalAmount: '2150.00', approvedBy: 'synthetic-purse-7@example.test', approvedAt: '2026-10-22', status: 'approved', final: true, approvalReviewed: true },
        confirmed: true, closed: true, reason: 'synthetic-purse-78' };
}

export async function travelExportsJourney() {
    const f = await travelFixture();
    try {
        const { h, travel, requester } = f;
        const business = (await h.state()).data.business[0];
        await h.command('business', { ...business, costCentres: [...business.costCentres, 'synthetic-purse-79'] });
        const ap = await h.member('synthetic-purse-80@example.test', ['ap-clerk']);
        await h.command('member', { email: 'synthetic-purse-80@example.test', name: 'synthetic-purse-80', grants: [{ role: 'ap-clerk', scope: { departments: ['synthetic-purse-3'], projects: ['synthetic-purse-4'] } }] });
        const outside = await h.member('synthetic-purse-81@example.test', ['ap-clerk']);
        await h.command('member', { email: 'synthetic-purse-81@example.test', name: 'synthetic-purse-81', grants: [{ role: 'ap-clerk', scope: { departments: ['synthetic-purse-79'] } }] });
        const reports = [];
        for (const provider of ['expensify', 'navan', 'ramp', 'brex']) {
            const request = await approvedAmendedTrip(f), body = travelExportReport(request, provider);
            await travel('expense-return', body, requester, 403);
            await travel('expense-return', body, outside, 403);
            await travel('expense-return', { ...body, confirmed: false }, ap, 400);
            await travel('expense-return', { ...body, sourceReview: { ...body.sourceReview, approvedBy: request.travel.travelerEmail } }, ap, 409);
            await travel('expense-return', { ...body, sourceReview: { ...body.sourceReview, status: 'pending' } }, ap, 409);
            await travel('expense-return', { ...body, sourceReview: { ...body.sourceReview, approvalReviewed: false } }, ap, 409);
            await travel('expense-return', { ...body, original: body.original.replace(request.travel.approvalReference, 'synthetic-purse-82') }, ap, 409);
            await travel('expense-return', { ...body, original: body.original.replace(request.travel.travelerEmail, 'synthetic-purse-83@example.test') }, ap, 409);
            await travel('expense-return', { ...body, original: body.original.replace('"USD"', '"AUD"') }, ap, 409);
            await travel('expense-return', { ...body, original: body.original.replace('2150.00', '2750.00'), sourceReview: { ...body.sourceReview, totalAmount: '2750.00' } }, ap, 409);
            const originalBase64 = Buffer.from(body.original).toString('base64'), supplied = { ...body, originalBase64 }; delete supplied.original;
            const expense = await travel('expense-return', supplied, ap);
            assert.equal(expense.provider, provider); assert.equal(expense.totalMinor, 215000); assert.equal(expense.releasedMinor, 55000); assert.equal(await f.balance(request.id), 0);
            assert.equal(expense.sha256, createHash('sha256').update(Buffer.from(body.original)).digest('hex'));
            assert.equal((await travel('expense-return', supplied, ap)).id, expense.id);
            await travel('expense-return', { ...supplied, sourceReview: { ...body.sourceReview, title: 'synthetic-purse-84' } }, ap, 409);
            await travel('expense-return', { ...body, original: body.original.replace('2150.00', '2100.00'), sourceReview: { ...body.sourceReview, totalAmount: '2100.00' } }, ap, 409);
            const data = (await h.state()).data, movements = data.commitment.filter(row => row.request === request.id);
            assert.equal(movements.filter(row => row.kind === 'travel-actual-movement').length, 1); assert.equal(movements.filter(row => row.kind === 'travel-unspent-release').length, 1);
            const exact = await fetch(h.origin + '/api/purse/download/attachment/' + expense.attachment, { headers: { cookie: h.owner } });
            assert.equal(exact.status, 200); assert.deepEqual(Buffer.from(await exact.arrayBuffer()), Buffer.from(body.original));
            for (const cookie of [ap, requester]) assert.equal((await h.send('/api/purse/download/attachment/' + expense.attachment, undefined, cookie)).status, 403);
            const normalized = (await h.state(ap)).data.travelExpense.find(row => row.id === expense.id);
            assert.equal(normalized.provider, provider); assert.equal(normalized.totalMinor, 215000); assert.equal(normalized.attachment, undefined); assert.equal(normalized.sourceReview, undefined);
            reports.push(expense.id);
        }
        const data = (await h.state()).data;
        assert.equal(data.travelExpense.length, 4); assert.equal(data.periodBudgets.find(row => row.id === f.policy.id).actualMinor, 860000);
        assert.equal(data.order.length, 0); assert.equal(data.invoice.length, 0);
        const archive = join(h.dir, 'synthetic-purse-85.rer');
        await exportArchive(await createPortability({ db: h.db, buckets: { ORIGINALS: h.originals }, policy: portability }), archive, []);
        const restored = await harness();
        try {
            await importArchive(await createPortability({ db: restored.db, buckets: { ORIGINALS: restored.originals }, policy: portability }), archive, []);
            const returned = (await restored.state()).data;
            assert.deepEqual(returned.travelExpense, data.travelExpense);
            assert.equal(returned.periodBudgets.find(row => row.id === f.policy.id).actualMinor, 860000);
            for (const expense of returned.travelExpense) {
                const source = await fetch(restored.origin + '/api/purse/download/attachment/' + expense.attachment, { headers: { cookie: restored.owner } });
                assert.equal(source.status, 200);
                const original = await fetch(h.origin + '/api/purse/download/attachment/' + expense.attachment, { headers: { cookie: h.owner } });
                assert.deepEqual(Buffer.from(await source.arrayBuffer()), Buffer.from(await original.arrayBuffer()));
            }
            assert.equal((await restored.send('/api/purse/travel', undefined, ap)).status, 401);
        } finally { await restored.close(); }
        return reports;
    } finally { await f.h.close(); }
}
