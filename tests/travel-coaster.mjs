// Account-free cross-product journey against Coaster's real Worker, native
// sessions and migrated D1. Its own harness fakes only outbound mail transport.
// Install the source checkout's pinned dependencies first, then run through
// heavy-slot: node tests/travel-coaster.mjs CHECKOUT REFERENCE OUTPUT.json
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function coasterTravelReport({ checkout, reference, traveler = 'synthetic-purse-6@example.test', date = '2026-10-20' }) {
    assert.ok(typeof reference === 'string' && reference.trim(), 'A Purse approval reference is required');
    const root = resolve(checkout), previous = process.cwd();
    const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const { harness } = await import(pathToFileURL(resolve(root, 'tests/harness.mjs')).href);
    process.chdir(root);
    let worker;
    try {
        worker = await harness();
        const request = async (path, body, cookie = worker.owner) => {
            const response = await fetch(worker.origin + '/api/coaster/' + path, {
                method: body === undefined ? 'GET' : 'POST',
                headers: { origin: worker.origin, cookie, 'content-type': 'application/json' },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual',
            });
            const bytes = await response.text();
            assert.equal(response.status, 200, `${path}: ${bytes}`);
            return { bytes, value: JSON.parse(bytes) };
        };
        await request('settings/business', { name: 'synthetic-purse-6', currency: 'USD', timezone: 'America/Chicago', receiptThreshold: '', preapprovalThreshold: '' });
        const { value: category } = await request('settings/categories', { name: 'Conference registration', accountCode: '6100', taxCode: 'None' });
        const managerEmail = 'synthetic-purse-7@example.test';
        const manager = await worker.person(managerEmail, { employee: true, manager: true });
        const employee = await worker.person(traveler, { employee: true }, managerEmail);
        let { value: claim } = await request('claims', { title: 'synthetic-purse-6 Austin trip' }, employee);
        ({ value: claim } = await request(`claims/${claim.id}/items`, {
            version: claim.version, kind: 'receipt', date, merchant: 'synthetic-purse-6 conference', amount: '2150.00',
            description: `Travel approval ${reference}`, explanation: 'Conference expense returned to the approved trip budget',
            fields: { purse_reference: reference }, allocations: [{ category: category.id, costCentre: 'Engineering' }],
        }, employee));
        ({ value: claim } = await request(`claims/${claim.id}/submit`, { version: claim.version }, employee));
        ({ value: claim } = await request(`claims/${claim.id}/decision`, { version: claim.version, revision: claim.revision, decision: 'approved', reason: 'Reviewed trip expense report', acknowledge: true }, manager));
        assert.equal(claim.status, 'approved');
        const report = await request(`claims/${claim.id}`, undefined, employee);
        const revision = report.value.revisions.find(row => row.revision === report.value.claim.revision);
        assert.equal(report.value.claim.total_minor, 215000);
        assert.equal(revision.total_minor, 215000);
        assert.equal(revision.snapshot.items[0].fields.purse_reference, reference);
        assert.equal(revision.snapshot.items.reduce((total, item) => total + item.amount_minor, 0), 215000);
        assert.ok(report.value.decisions.some(decision => decision.revision === claim.revision && decision.decision === 'approved'));
        return { bytes: report.bytes, report: report.value, source: { repository: 'just-every/run-coaster', head: sourceHead, route: '/api/coaster/claims/' + claim.id } };
    } finally {
        if (worker) await worker.close();
        process.chdir(previous);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [checkout, reference, output] = process.argv.slice(2);
    assert.ok(checkout && reference && output, 'Usage: node tests/travel-coaster.mjs CHECKOUT REFERENCE OUTPUT.json');
    const result = await coasterTravelReport({ checkout, reference });
    await writeFile(resolve(output), result.bytes, { mode: 0o600 });
    console.log(JSON.stringify({ output: resolve(output), status: result.report.claim.status, totalMinor: result.report.claim.total_minor, source: result.source }));
}
