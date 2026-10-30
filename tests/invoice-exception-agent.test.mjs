import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { harness } from './purse-harness.mjs';
import { invoiceExceptionAgentFixture, address } from './invoice-exception-agent-fixture.mjs';
import { validatePurchasingArchive } from '../scripts/installer/restore-validation.mjs';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { reauthenticateErasure } from './erasure-flow.mjs';

const businessRows = rows => rows.filter(r => !['agentRun', 'audit'].includes(r.kind));

test('Invoice exception drafts cite exact price and receipt evidence without executing purchasing or payment changes', async t => {
    const f = await invoiceExceptionAgentFixture(t), { h } = f;
    const price = await f.create(7100), short = await f.create(7110, '10', '1000.00', '8');
    await f.run(price.invoice.id, f.buyer, 409);
    await f.controls();
    await h.command('agent-policy', { agent: 'AGENT-004', purchaseType: '*', version: 0, enabled: true,
        cadenceDays: 1, maxChases: 2, reason: 'Explicit fallback policy' }, f.buyer, 403);
    await f.run(f.invoice.id, f.buyer, 409); // Unconfirmed sources never qualify.
    const before = await f.raw(), mailCount = h.messages.length;
    const runs = [];
    for (const purchase of [price, short]) {
        const item = await f.item(purchase.invoice.id), run = await f.run(purchase.invoice.id); runs.push(run);
        assert.equal(run.mode, 'deterministic v1'); assert.equal(run.model, 'none'); assert.equal(run.provider, 'none');
        assert.equal(run.openedAt, item.openedAt); assert.deepEqual(run.messages, []);
        assert.equal(run.sources.find(s => s.kind === 'attachment').value.sha256,
            createHash('sha256').update(Buffer.from(purchase.original.base64, 'base64')).digest('hex'));
        for (const ref of run.references) {
            const source = (await f.raw()).find(r => r.kind === ref.kind && r.id === ref.id);
            assert.ok(source); assert.equal(source.revision, ref.version);
        }
        for (const row of [...run.explanations, ...run.proposals]) for (const citation of row.sources)
            assert.ok(run.sources.some(s => s.kind === citation.kind && s.id === citation.id && s.version === citation.version));
        assert.ok(run.sources.some(s => s.kind === 'order' && s.id === purchase.order.id && s.value.revision === 1));
        assert.ok(run.sources.some(s => s.kind === 'receipt' && s.id === purchase.receipt.id));
        for (const value of ['9876543215678', '987651234', '5678', '1234', 'send a wire']) assert.ok(!JSON.stringify(run).includes(value));
        const downloaded = await h.send('/api/purse/download/agentRun/' + run.id, undefined, f.buyer);
        assert.equal(downloaded.status, 200); assert.deepEqual(downloaded.value, run);
        await h.command('edit-preparation', { id: run.id, version: 1, draft: 'Overwritten' }, f.buyer, 409);
        await h.command('propose-action', { run: run.id, action: 'receipt', input: {} }, f.buyer, 409);
        for (const cookie of ['', f.requester, f.approver, f.receiver, f.outsider]) {
            await f.run(purchase.invoice.id, cookie, cookie ? 403 : 401);
            assert.equal((await h.send('/api/purse/download/agentRun/' + run.id, undefined, cookie)).status, cookie ? 403 : 401);
        }
        const audit = await h.send('/api/purse/audit.csv?subject=' + purchase.invoice.id, undefined, h.owner);
        assert.equal(audit.status, 200); assert.ok(audit.value.includes(run.id));
    }
    const [priceRun, shortRun] = runs;
    assert.deepEqual(priceRun.explanations.map(r => [r.invoiceMinor, r.expectedMinor, r.priceDifferenceMinor]), [[110000, 100000, 10000]]);
    assert.equal(priceRun.proposals[0].type, 'corrected-invoice-or-credit-request');
    assert.equal(priceRun.proposals[0].expectedMinor, 100000); assert.equal(priceRun.proposals[0].differenceMinor, 10000);
    assert.deepEqual(shortRun.explanations.map(r => [r.orderedQ, r.invoiceQ, r.acceptedQ]), [[10000, 10000, 8000]]);
    assert.equal(shortRun.proposals[0].type, 'receiver-review'); assert.match(shortRun.proposals[0].draft, /8 accepted against 10 invoiced/);
    assert.deepEqual(businessRows(await f.raw()), businessRows(before)); assert.equal(h.messages.length, mailCount);
    const receiver = (await h.state(f.receiver)).data;
    assert.deepEqual(receiver.invoice, []); assert.ok(!receiver.agentRun.some(r => r.agent === 'AGENT-004'));
    const stale = await f.item(short.invoice.id);
    await h.command('receipt', { order: short.order.id, line: short.order.lines[0].id, event: 'receive', quantity: '1', reason: 'One further unit arrived' }, f.receiver);
    await f.run(short.invoice.id, f.buyer, 409, { sourceVersion: stale.agent.sourceVersion });
    assert.equal((await h.send('/api/purse/download/agentRun/' + shortRun.id, undefined, f.buyer)).status, 409);
    const refreshed = await f.run(short.invoice.id); assert.equal(refreshed.explanations[0].acceptedQ, 9000);
    await f.controls(false); await f.run(price.invoice.id, f.buyer, 409);
    assert.equal((await h.send('/api/purse/download/agentRun/' + priceRun.id, undefined, f.buyer)).status, 409);
    await f.controls(true); await f.run(price.invoice.id, f.buyer, 409, { sourceVersion: (await f.item(price.invoice.id)).sourceVersion });
    const current = await f.run(price.invoice.id);
    await h.command('member', { email: address(6204), name: 'synthetic-purse-6204', active: true,
        grants: [{ role: 'buyer', scope: { locations: ['Austin'] } }] });
    await h.command('invoice-exception-agent-run', { id: price.invoice.id, sourceVersion: current.sourceVersion }, f.buyer, 403);
    assert.equal((await h.send('/api/purse/download/agentRun/' + current.id, undefined, f.buyer)).status, 403);
    assert.equal(validatePurchasingArchive(await f.raw()), true);
});

test('Exception draft archives and erasure preserve immutable evidence without restoring execution authority', async t => {
    const f = await invoiceExceptionAgentFixture(t), { h } = f;
    await f.controls(); const purchase = await f.create(7120), run = await f.run(purchase.invoice.id);
    const adapter = target => createPortability({ db: target.db, buckets: { ORIGINALS: target.originals }, policy: portability });
    const snapshot = join(h.dir, 'synthetic-purse-7123.rer'); await exportArchive(await adapter(h), snapshot, []);
    const restored = await harness({ empty: true }); t.after(() => restored.close());
    await importArchive(await adapter(restored), snapshot, []);
    assert.deepEqual(JSON.parse((await restored.db.prepare("SELECT value FROM p_records WHERE kind='agentRun' AND id=?").bind(run.id).first()).value), run);
    const boot = await restored.send('/auth/bootstrap', { token: 'synthetic-local-test-bootstrap-token-0123456789', displayName: 'synthetic-purse-7124' }); assert.equal(boot.status, 303);
    const restoredItem = (await restored.send('/api/purse/invoice-exceptions', undefined, boot.cookie)).value.queue.find(e => e.id === purchase.invoice.id);
    const refused = await restored.send('/api/purse/command/invoice-exception-agent-run', { id: purchase.invoice.id, sourceVersion: restoredItem.agent.sourceVersion }, boot.cookie);
    assert.equal(refused.status, 409); assert.match(refused.value.error, /current owner enablement/);
    assert.notEqual((await restored.send('/api/purse/command/invoice-exception-agent-run', { id: purchase.invoice.id, sourceVersion: run.sourceVersion }, f.buyer)).status, 200);
    const rows = await f.raw(); assert.equal(validatePurchasingArchive(rows), true);
    const corrupt = structuredClone(rows), record = corrupt.find(r => r.kind === 'agentRun' && r.id === run.id), forged = JSON.parse(record.value);
    forged.proposals[0].differenceMinor = 0; record.value = JSON.stringify(forged);
    assert.throws(() => validatePurchasingArchive(corrupt), /exception_agent_digest/);
    await h.command('member', { email: address(6204), name: 'synthetic-purse-6204', active: false, roles: ['buyer'] });
    await reauthenticateErasure(h);
    const inventory = await h.send('/api/purse/erasure', undefined, h.owner);
    const preview = await h.send('/api/purse/erasure/preview', { kind: 'member', id: address(6204), revision: inventory.value.revision }, h.owner); assert.equal(preview.status, 200);
    const erased = await h.send('/api/purse/erasure/execute', { ...preview.value.subject, revision: preview.value.revision, review: preview.value.review, fingerprint: preview.value.fingerprint, consent: true }, h.owner); assert.equal(erased.status, 200, JSON.stringify(erased.value));
    const anonymous = await f.raw(), report = JSON.parse(anonymous.find(r => r.kind === 'agentRun' && r.id === run.id).value);
    assert.ok(report.sourceValuesErased); assert.match(report.actor, /^erased-/);
    assert.ok(!JSON.stringify(anonymous).includes(address(6204))); assert.ok(!JSON.stringify(anonymous).includes(f.ids.buyer));
    assert.equal(validatePurchasingArchive(anonymous), true);
    assert.notEqual((await h.send('/api/purse/download/agentRun/' + run.id, undefined, f.buyer)).status, 200);
    assert.equal((await h.send('/api/purse/download/agentRun/' + run.id, undefined, h.owner)).status, 409);
    const journal = join(h.dir, 'synthetic-purse-7125.rer'); await exportArchive(await adapter(h), journal, []);
    const destination = await harness({ empty: true }); t.after(() => destination.close());
    await importArchive(await adapter(destination), journal, []);
    const staleDestination = await harness({ empty: true }); t.after(() => staleDestination.close());
    await assert.rejects(importArchive(await adapter(staleDestination), snapshot, [], journal), /erasure|journal/i);
});
