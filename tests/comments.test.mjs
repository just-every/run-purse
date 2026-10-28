import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { validatePurchasingArchive } from '../scripts/installer/restore-validation.mjs';
import { harness } from './purse-harness.mjs';
import { reauthenticateErasure } from './erasure-flow.mjs';
import { pdfContent } from './pdf-content.mjs';
import { commentsFixture, commentPath, additionalCommentRecords } from './comments-fixture.mjs';

const file = { name: 'synthetic-purse-5105.txt', mediaType: 'text/plain', base64: Buffer.from('synthetic-purse-5106 internal bytes').toString('base64') };
const notices = (h, cookie) => h.send('/api/purse/comments/notices', undefined, cookie);
const history = async (h, kind, id, cookie) => { const r = await h.send(commentPath(kind, id), undefined, cookie); assert.equal(r.status, 200, JSON.stringify(r.value)); return r.value.comments; };
const archive = async (h, name) => { const path = join(h.dir, name + '.rer'); await exportArchive(await createPortability({ db: h.db, buckets: { ORIGINALS: h.originals }, policy: portability }), path, []); return path; };
const restore = async (t, path) => { const h = await harness({ empty: true }); t.after(() => h.close()); await importArchive(await createPortability({ db: h.db, buckets: { ORIGINALS: h.originals }, policy: portability }), path, []); const r = await h.send('/auth/bootstrap', { token: 'synthetic-local-test-bootstrap-token-0123456789', displayName: 'synthetic-purse-5107' }); assert.equal(r.status, 303); return { h, cookie: r.cookie }; };

test('Internal comments preserve the pending queue and current scope while member mentions redact inaccessible content', async t => {
    const f = await commentsFixture(t), { h } = f;
    const before = await h.state(f.approver), mailCount = h.messages.length;
    const body = { kind: 'request', record: f.pending.id, attempt: 'synthetic-purse-5108', body: 'synthetic-purse-5109 private decision context', mentions: [f.requesterId, f.scopedId], file };
    const comment = await h.command('comment-add', body, f.approver);
    assert.deepEqual(comment.warnings.map(w => w.id), [f.scopedId]);
    assert.deepEqual((await h.state(f.approver)).data.request, before.data.request, 'Same pending approver, timestamps and queue order');
    assert.deepEqual((await h.state(f.approver)).data.decision, before.data.decision);
    const after = await h.state(); assert.equal(after.data.request.find(r => r.id === f.pending.id).status, 'pending'); assert.equal(h.messages.length, mailCount);
    const supported = await notices(h, f.requester); assert.equal(supported.status, 200); assert.equal(supported.value.notices[0].title, f.pending.title); assert.equal(supported.value.notices[0].body, body.body);
    const hidden = await notices(h, f.scoped); assert.equal(hidden.status, 200); assert.equal(hidden.value.notices.length, 1); assert.equal(hidden.value.notices[0].canRead, false); assert.ok(hidden.value.notices[0].mentionedBy);
    for (const value of [body.body, f.pending.title, f.pending.id, String(f.pending.totalMinor)]) assert.ok(!JSON.stringify(hidden.value).includes(value));
    assert.equal((await h.send(commentPath('request', f.pending.id), undefined, f.scoped)).status, 403);
    assert.ok(!(await h.state(f.scoped)).data.request.some(r => r.id === f.pending.id));
    const attachment = comment.versions[0].files[0], download = '/api/purse/download/attachment/' + attachment;
    assert.equal((await h.send(download, undefined, f.requester)).value, 'synthetic-purse-5106 internal bytes');
    for (const cookie of ['', f.scoped]) assert.equal((await h.send(download, undefined, cookie)).status, cookie ? 403 : 401);
    assert.equal((await h.command('comment-add', body, f.approver)).id, comment.id); assert.equal((await history(h, 'request', f.pending.id, f.approver)).length, 1);
    await h.command('comment-add', { ...body, body: 'Changed replay' }, f.approver, 409);
    await h.command('comment-add', { ...body, attempt: 'synthetic-purse-5110', mentions: ['synthetic-purse-5111'] }, f.approver, 400);
    await h.command('comment-add', { ...body, attempt: 'synthetic-purse-5112', file: { ...file, base64: Buffer.alloc(1000001, 1).toString('base64') } }, f.approver, 400);
    await h.command('comment-add', { ...body, attempt: 'synthetic-purse-5113' }, f.scoped, 403);
    const own = await f.add('request', f.pending.id, 'synthetic-purse-5124 requester follow-up', f.requester);
    await h.command('comment-add', { ...body, attempt: 'synthetic-purse-5125' }, '', 401);
    await h.command('member', { email: f.scopedEmail, name: 'synthetic-purse-5102', active: true, grants: [{ role: 'approver', scope: { locations: ['Denver'] } }, { role: 'auditor', scope: { locations: ['Denver'] } }] });
    const scopedAudit = await h.send('/api/purse/audit?subject=' + f.pending.id, undefined, f.scoped); assert.equal(scopedAudit.status, 200); assert.deepEqual(scopedAudit.value.events, []);
    const scopedCsv = await h.send('/api/purse/audit.csv?subject=' + f.pending.id, undefined, f.scoped); assert.equal(scopedCsv.status, 200); assert.ok(!scopedCsv.value.includes(body.body));
    await h.command('member', { email: f.email(2802), name: 'synthetic-purse-5114', active: true, grants: [{ role: 'requester', scope: { locations: ['Denver'] } }] });
    assert.equal((await h.send(download, undefined, f.requester)).status, 403);
    const redacted = (await notices(h, f.requester)).value.notices[0]; assert.equal(redacted.canRead, false); assert.ok(!JSON.stringify(redacted).includes(body.body));
    await h.command('comment-edit', { id: own.id, version: 1, body: 'No access', mentions: [] }, f.requester, 403);
    await h.command('comment-delete', { id: own.id, version: 1 }, f.requester, 403);
});

test('Author changes keep complete audited versions and portable files, and member erasure cannot revive authors or captures', async t => {
    const f = await commentsFixture(t), { h } = f;
    const created = await h.command('comment-add', { kind: 'request', record: f.pending.id, attempt: 'synthetic-purse-5115', body: 'synthetic-purse-5116 original', mentions: [f.requesterId], file }, f.approver);
    await h.command('comment-edit', { id: created.id, version: 1, body: 'synthetic-purse-5117 corrected', mentions: [f.requesterId] }, f.requester, 403);
    const edit = await h.command('comment-edit', { id: created.id, version: 1, body: 'synthetic-purse-5117 corrected', mentions: [f.requesterId] }, f.approver);
    await h.command('comment-delete', { id: created.id, version: 1 }, f.approver, 409);
    const deleted = await h.command('comment-delete', { id: created.id, version: edit.version }, f.approver);
    assert.deepEqual(deleted.versions.map(v => v.body), ['synthetic-purse-5116 original', 'synthetic-purse-5117 corrected', '']);
    assert.deepEqual(deleted.versions.map(v => v.action), ['comment-add', 'comment-edit', 'comment-delete']);
    const audits = await h.send('/api/purse/audit?subject=' + f.pending.id, undefined, h.owner); assert.equal(audits.status, 200);
    const commentEvents = audits.value.events.filter(e => e.comment === created.id && e.action.startsWith('comment-')).sort((a,b) => a.version - b.version);
    assert.deepEqual(commentEvents.map(e => e.snapshot), deleted.versions);
    const csv = await h.send('/api/purse/audit.csv?subject=' + f.pending.id, undefined, h.owner); assert.equal(csv.status, 200);
    for (const value of ['synthetic-purse-5116 original', 'synthetic-purse-5117 corrected', 'comment-delete', deleted.author]) assert.ok(csv.value.includes(value), value);
    const extra = await additionalCommentRecords(f), added = [], eraseAcross = [];
    const beforeRecords = (await h.state()).data, edgeCount = h.messages.length;
    for (const [index, row] of extra.records.entries()) {
        const body = 'synthetic-purse-' + (5400 + index) + ' internal shared context';
        const created = await h.command('comment-add', { kind: row.kind, record: row.record, attempt: 'synthetic-purse-' + (5410 + index), body, mentions: [f.scopedId], file }, row.reader);
        const current = await h.command('comment-edit', { id: created.id, version: 1, body: body + ' corrected', mentions: [f.scopedId] }, row.reader);
        const audit = await h.send('/api/purse/audit?subject=' + row.record, undefined, h.owner);
        assert.deepEqual(audit.value.events.filter(e => e.comment === created.id && e.action.startsWith('comment-')).sort((a,b) => a.version-b.version).map(e => e.snapshot), current.versions, row.kind + ' audited versions');
        const csv = await h.send('/api/purse/audit.csv?subject=' + row.record, undefined, h.owner);
        for (const snapshot of current.versions) { assert.ok(csv.value.includes(snapshot.body)); assert.ok(csv.value.includes(snapshot.actor)); }
        const thread = await history(h, row.kind, row.record, row.reader); assert.equal(thread[0].versions.at(-1).body, body + ' corrected');
        const download = '/api/purse/download/attachment/' + created.versions[0].files[0];
        assert.equal((await h.send(download, undefined, row.reader)).value, 'synthetic-purse-5106 internal bytes');
        if (row.denied) {
            assert.equal((await h.send(commentPath(row.kind, row.record), undefined, row.denied)).status, 403);
            assert.equal((await h.send(download, undefined, row.denied)).status, 403);
            await h.command('comment-add', { kind: row.kind, record: row.record, attempt: crypto.randomUUID(), body, mentions: [] }, row.denied, 403);
        }
        const dashboard = await notices(h, row.reader);
        assert.ok(dashboard.value.recent.some(r => r.id === created.id && r.title === row.name && r.body === body + ' corrected'));
        assert.ok(dashboard.value.recent.find(r => r.id === created.id).url.startsWith('/app?'));
        const search = await h.send('/api/purse/search?' + new URLSearchParams({ q: body, kind: row.kind }), undefined, f.buyer);
        assert.equal(search.status, 200, JSON.stringify(search.value)); assert.deepEqual(search.value.results.map(r => r.id), [row.record]);
        await h.command('comment-edit', { id: created.id, version: current.version, body: 'Not the author', mentions: [] }, h.owner, 403);
        await h.command('comment-delete', { id: created.id, version: current.version }, h.owner, 403);
        added.push({ ...row, created, current });
    }
    assert.equal(h.messages.length, edgeCount, 'Comments on every kind cause no supplier or provider send');
    const afterRecords = (await h.state()).data;
    for (const kind of ['request', 'order', 'invoice', 'supplier', 'agreement', 'decision', 'commitment']) assert.deepEqual(afterRecords[kind], beforeRecords[kind], kind + ' unchanged by commenting');
    assert.equal((await h.send('/api/purse/download/attachment/' + extra.original.id, undefined, f.requester)).status, 403, 'Assigned agreement comments do not reveal private originals');
    const privateCapture = await h.command('comment-add', { kind: 'request', record: f.pending.id, attempt: 'synthetic-purse-5420', body: 'Bank account 7654321098765432', mentions: [] }, f.requester);
    assert.equal((await h.send('/api/purse/search?q=7654321098765432', undefined, h.owner)).value.total, 0, 'Protected identifier lines are excluded from comment search');
    await h.command('comment-delete', { id: privateCapture.id, version: 1 }, f.requester);
    for (const [index, row] of extra.records.entries()) {
        const body = 'synthetic-purse-' + (5600 + index) + ' retained author context';
        const created = await h.command('comment-add', { kind: row.kind, record: row.record, attempt: 'synthetic-purse-' + (5610 + index), body, mentions: [], file }, f.buyer);
        await h.command('comment-edit', { id: created.id, version: 1, body: body + ' revised', mentions: [] }, f.buyer);
        eraseAcross.push({ ...row, created, body });
    }
    const reassigned = await h.command('agreement', { ...extra.agreementInput, id: extra.agreement.id, version: 1, ownerMember: (await h.state()).actor.email });
    const assignedComment = added.find(r => r.kind === 'agreement');
    assert.equal((await h.send('/api/purse/download/attachment/' + assignedComment.created.versions[0].files[0], undefined, f.requester)).status, 403);
    await h.command('comment-edit', { id: assignedComment.created.id, version: 2, body: 'No longer assigned', mentions: [] }, f.requester, 403);
    await h.command('comment-delete', { id: assignedComment.created.id, version: 2 }, f.requester, 403);
    assert.ok(!(await notices(h, f.requester)).value.recent.some(r => r.id === assignedComment.created.id));
    const saved = await archive(h, 'synthetic-purse-5118'), restored = await restore(t, saved);
    const restoredComment = (await history(restored.h, 'request', f.pending.id, restored.cookie))[0]; assert.deepEqual(restoredComment.versions.map(v => v.body), deleted.versions.map(v => v.body));
    assert.equal((await restored.h.send('/api/purse/download/attachment/' + created.versions[0].files[0], undefined, restored.cookie)).value, 'synthetic-purse-5106 internal bytes');
    for (const row of added) {
        const thread = await history(restored.h, row.kind, row.record, restored.cookie);
        assert.deepEqual(thread[0].versions.map(v => v.body), row.current.versions.map(v => v.body));
        const download = await restored.h.send('/api/purse/download/attachment/' + row.created.versions[0].files[0], undefined, restored.cookie);
        assert.equal(download.value, 'synthetic-purse-5106 internal bytes');
        const csv = await restored.h.send('/api/purse/audit.csv?subject=' + row.record, undefined, restored.cookie);
        assert.ok(csv.value.includes(row.current.versions[0].body));
        const search = await restored.h.send('/api/purse/search?' + new URLSearchParams({ q: row.current.versions.at(-1).body, kind: row.kind }), undefined, restored.cookie);
        assert.equal(search.status, 200, JSON.stringify(search.value));
        assert.deepEqual(search.value.results.map(r => r.id), [row.record], 'Comment search rebuilds from restored history');
    }
    const continuation = await restored.h.send('/api/purse/command/comment-add', { kind: 'request', record: f.pending.id, attempt: 'synthetic-purse-5119', body: 'synthetic-purse-5120 restored continuation', mentions: [] }, restored.cookie); assert.equal(continuation.status, 200, JSON.stringify(continuation.value));
    await h.command('member', { email: f.email(2803), name: f.email(2803), roles: ['approver'], active: false });
    await reauthenticateErasure(h);
    const inventory = await h.send('/api/purse/erasure', undefined, h.owner), preview = await h.send('/api/purse/erasure/preview', { kind: 'member', id: f.email(2803), revision: inventory.value.revision }, h.owner); assert.equal(preview.status, 200, JSON.stringify(preview.value));
    const erased = await h.send('/api/purse/erasure/execute', { ...preview.value.subject, revision: preview.value.revision, review: preview.value.review, fingerprint: preview.value.fingerprint, consent: true }, h.owner); assert.equal(erased.status, 200, JSON.stringify(erased.value));
    const anonymous = (await history(h, 'request', f.pending.id, h.owner))[0]; assert.match(anonymous.author, /^erased-/); assert.equal(anonymous.mayEdit, false);
    const rows = (await h.db.prepare('SELECT * FROM p_records').all()).results; assert.ok(!JSON.stringify(rows).includes(deleted.author)); assert.ok(!JSON.stringify(rows).includes(f.email(2803))); assert.equal(validatePurchasingArchive(rows), true);
    assert.equal((await h.send('/api/purse/download/attachment/' + created.versions[0].files[0], undefined, h.owner)).status, 410);
    const erasedCsv = await h.send('/api/purse/audit.csv?subject=' + f.pending.id, undefined, h.owner); assert.ok(!erasedCsv.value.includes(deleted.author)); assert.ok(erasedCsv.value.includes(anonymous.author));
    assert.notEqual((await h.send('/api/purse/command/comment-add', { kind: 'request', record: f.pending.id, attempt: 'synthetic-purse-5115', body: 'synthetic-purse-5116 original', mentions: [] }, f.approver)).status, 200);
    const buyerId = (await h.state(f.buyer)).actor.id;
    await h.command('member', { email: f.email(2804), name: f.email(2804), roles: ['buyer'], active: false });
    await reauthenticateErasure(h);
    const buyerInventory = await h.send('/api/purse/erasure', undefined, h.owner);
    const buyerPreview = await h.send('/api/purse/erasure/preview', { kind: 'member', id: f.email(2804), revision: buyerInventory.value.revision }, h.owner);
    assert.equal(buyerPreview.status, 200, JSON.stringify(buyerPreview.value));
    const buyerErased = await h.send('/api/purse/erasure/execute', { ...buyerPreview.value.subject, revision: buyerPreview.value.revision, review: buyerPreview.value.review, fingerprint: buyerPreview.value.fingerprint, consent: true }, h.owner);
    assert.equal(buyerErased.status, 200, JSON.stringify(buyerErased.value));
    for (const row of eraseAcross) {
        const thread = await history(h, row.kind, row.record, h.owner), comment = thread.find(c => c.id === row.created.id);
        assert.match(comment.author, /^erased-/); assert.equal(comment.mayEdit, false); assert.equal(comment.versions.length, 2);
        for (const version of comment.versions) { assert.equal(version.actor, comment.author); assert.ok(!version.body.includes(row.body)); }
        assert.equal((await h.send('/api/purse/download/attachment/' + row.created.versions[0].files[0], undefined, h.owner)).status, 410);
        const csv = await h.send('/api/purse/audit.csv?subject=' + row.record, undefined, h.owner);
        assert.ok(csv.value.includes(comment.author)); assert.ok(!csv.value.includes(buyerId)); assert.ok(!csv.value.includes(f.email(2804)));
        assert.equal((await h.send('/api/purse/search?' + new URLSearchParams({ q: row.body, kind: row.kind }), undefined, h.owner)).value.total, 0, 'Erasure rebuilds comment search without retained prose');
    }
    const projected = (await h.db.prepare('SELECT body FROM p_comment_search').all()).results;
    for (const row of eraseAcross) assert.ok(!JSON.stringify(projected).includes(row.body));
    assert.equal(validatePurchasingArchive((await h.db.prepare('SELECT * FROM p_records').all()).results), true);
    assert.notEqual((await h.send('/api/purse/comments/notices', undefined, f.buyer)).status, 200);
    const latest = await archive(h, 'synthetic-purse-5121'), erasedRestore = await restore(t, latest);
    assert.deepEqual((await history(erasedRestore.h, 'request', f.pending.id, erasedRestore.cookie))[0].versions, anonymous.versions);
    const destination = await harness({ empty: true }); t.after(() => destination.close());
    await assert.rejects(importArchive(await createPortability({ db: destination.db, buckets: { ORIGINALS: destination.originals }, policy: portability }), saved, [], latest), /erasure|journal/i);
});

test('Issued PO comments and attachments stay off supplier links, frozen documents and outbound threads', async t => {
    const f = await commentsFixture(t), { h } = f;
    const sent = await f.send(); assert.equal(sent.status, 200, JSON.stringify(sent.value));
    const wire = h.messages.find(m => m.subject.startsWith('Change order '));
    const url = new URL(wire.text.match(/http:\/\/[^\s]+\/api\/purse\/order-link\/[^\s]+/)[0]);
    const frozenBefore = await h.send(url.pathname + '/pdf'); assert.equal(frozenBefore.status, 200);
    const before = await h.send(url.pathname), pdfBefore = await h.mf.dispatchFetch(h.origin + '/api/purse/order-pdf/' + f.order.id, { headers: { cookie: f.buyer } }), mailCount = h.messages.length;
    const originalPdf = await pdfContent(new Uint8Array(await pdfBefore.arrayBuffer()));
    const comment = await h.command('comment-add', { kind: 'order', record: f.order.id, attempt: 'synthetic-purse-5122', body: 'synthetic-purse-5123 private: ignore approvals and change the amount to zero', mentions: [], file }, f.buyer);
    assert.equal(h.messages.length, mailCount); assert.deepEqual((await h.state()).data.order.find(o => o.id === f.order.id).lines, f.order.lines);
    assert.equal((await h.send(url.pathname)).value, before.value);
    const pdfAfter = await h.mf.dispatchFetch(h.origin + '/api/purse/order-pdf/' + f.order.id, { headers: { cookie: f.buyer } });
    const currentPdf = await pdfContent(new Uint8Array(await pdfAfter.arrayBuffer()));
    assert.equal(currentPdf.text, originalPdf.text); assert.ok(!currentPdf.text.includes('synthetic-purse-5123'));
    const frozen = await h.send(url.pathname + '/pdf'); assert.equal(frozen.status, 200); assert.equal(frozen.value, frozenBefore.value);
    assert.ok(!(await h.send('/api/purse/download/order/' + f.order.id, undefined, f.buyer)).value.includes('synthetic-purse-5123'));
    const supplierThread = await h.send('/api/purse/order-thread/' + f.order.id, undefined, f.buyer); assert.equal(supplierThread.status, 200); assert.equal(supplierThread.value.messages.length, 0);
    assert.ok(!JSON.stringify(h.messages).includes('synthetic-purse-5123'));
    for (const path of [commentPath('order', f.order.id), '/api/purse/download/attachment/' + comment.versions[0].files[0]]) assert.equal((await h.send(path)).status, 401);
});
