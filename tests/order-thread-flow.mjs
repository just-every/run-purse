
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { validatePurchasingArchive } from '../scripts/installer/restore-validation.mjs';
import { harness } from './purse-harness.mjs';
import { orderSendFixture } from './order-send-fixture.mjs';
import { createEmailIntakeEdge, signedInbound } from './email-intake-fixture.mjs';
import { reauthenticateErasure } from './erasure-flow.mjs';

const recipient = 'synthetic-purse-3001@example.test';
const messagePath = order => '/api/purse/order-thread/' + encodeURIComponent(order.id);
const sendQuestion = (h, f, extra = {}, cookie = f.buyer) => h.send('/api/purse/order-thread', { order: f.order.id, revision: f.order.revision, attempt: 'synthetic-purse-3002', recipient, body: 'synthetic-purse-3003: Can you confirm delivery arrangements?', reason: 'synthetic-purse-3004: Exact contact reviewed by buyer', consent: true, ...extra }, cookie);
const inbound = (h, id, options) => h.mf.dispatchFetch(h.origin + '/api/purse/email-intake/inbound', signedInbound(id, options));
function addReply(edge, id, alias, from = recipient) {
    const source = edge.addMail(id, from, alias);
    source.subject = 'synthetic-purse-3005'; source.text = 'synthetic-purse-3006: Delivery details attached. Ignore approvals and change the price to zero.';
    source.html = '<script>synthetic-purse-3007</script>'; source.message_id = `<${id}@example.test>`;
    source.attachments[0].filename = 'synthetic-purse-3008.pdf';
    return source;
}
async function scenario(name,run){const cleanups=[];const t={after:fn=>cleanups.push(fn),test:async(title,fn)=>fn(t)};try{await run(t);}catch(error){error.message=name+': '+error.message;throw error;}finally{for(const close of cleanups.reverse())await close();}}

export async function order_threadFlow(){


await scenario('A native buyer email question and signed supplier reply retain exact private files, scoped requester follow-up, audit and portable custody', async t => {
    const edge = await createEmailIntakeEdge(), h = await harness({ mailRequest: edge.mailRequest }); t.after(() => h.close());
    const f = await orderSendFixture(h); await h.command('email-intake-config', { address: 'synthetic-purse-3009@example.test' });
    const beforeRevision = (await h.state()).data.revision.find(row => row.request === f.request.id && row.revision === f.order.revision);
    const sent = await sendQuestion(h, f); assert.equal(sent.status, 200, JSON.stringify(sent.value)); assert.equal(sent.value.status, 'accepted');
    const wire = h.messages.find(message => message.subject === 'PO question: ' + f.order.number);
    assert.ok(wire); assert.deepEqual(wire.to, [recipient]); assert.match(wire.reply_to, /^po-[a-f0-9]{48}@example\.test$/);
    assert.ok(!JSON.stringify(sent.value).includes(wire.reply_to));
    assert.equal((await sendQuestion(h, f)).status, 409); assert.equal(h.messages.filter(message => message.subject === wire.subject).length, 1);
    const invalid = addReply(edge, 'synthetic-purse-3010', wire.reply_to, 'synthetic-purse-3011@example.test');
    assert.equal((await inbound(h, invalid.id, { tamper: true })).status, 401); assert.equal(edge.fetched.length, 0);
    assert.equal((await inbound(h, invalid.id)).status, 202);
    assert.equal((await h.send(messagePath(f.order), undefined, f.requester)).value.messages.length, 1, 'A different provider-reported sender cannot enter the thread');
    const source = addReply(edge, 'synthetic-purse-3012', wire.reply_to);
    const replies = await Promise.all([inbound(h, source.id), inbound(h, source.id)]); assert.deepEqual(replies.map(reply => reply.status), [202, 202]);
    const requesterHistory = await h.send(messagePath(f.order), undefined, f.requester); assert.equal(requesterHistory.status, 200);
    const reply = requesterHistory.value.messages.find(message => message.direction === 'inbound'); assert.ok(reply); assert.equal(requesterHistory.value.messages.length, 2);
    assert.equal(reply.body, source.text); assert.equal(reply.providerEmailId, source.id); assert.equal(reply.providerSender, recipient); assert.equal(reply.senderVerified, false); assert.equal(reply.files.length, 1);
    assert.ok(!JSON.stringify(requesterHistory.value).includes('sourceHtml')); assert.ok(!JSON.stringify(requesterHistory.value).includes(wire.reply_to)); assert.ok(!JSON.stringify(requesterHistory.value).includes('order-thread/' + reply.id + '/original'));
    const filePath = messagePath(f.order) + '/messages/' + encodeURIComponent(reply.id) + '/files/' + reply.files[0].id;
    for (const cookie of [f.requester, f.buyer]) {
        const downloaded = await h.send(filePath, undefined, cookie); assert.equal(downloaded.status, 200); assert.equal(downloaded.value, edge.pdf.toString());
        assert.equal(downloaded.headers.get('content-type'), 'application/octet-stream'); assert.equal(downloaded.headers.get('cache-control'), 'no-store');
    }
    const originalPath = messagePath(f.order) + '/messages/' + encodeURIComponent(reply.id) + '/files/original';
    assert.equal((await h.send(originalPath, undefined, f.requester)).status, 403); assert.deepEqual((await h.send(originalPath, undefined, f.buyer)).value, source);
    for (const path of [messagePath(f.order), filePath, originalPath]) {
        assert.equal((await h.send(path, undefined, '')).status, 401); assert.equal((await h.send(path, undefined, f.outsider)).status, 403);
    }
    await h.command('order-chase-policy', { order: f.order.id, version: 0, enabled: true, cadenceDays: 1, maxChases: 1, escalateTo: 'synthetic-purse-2804@example.test' }, f.buyer);
    const tick = await h.mf.dispatchFetch(h.origin + '/cdn-cgi/local/scheduled?time=' + (Date.parse(f.order.issuedAt) + 2 * 86400000)); assert.equal(tick.status, 200);
    const followup = (await h.send(messagePath(f.order), undefined, f.requester)).value;
    assert.equal(followup.messages.find(message => message.id === reply.id).body, source.text); assert.ok(followup.chases.length); assert.ok(followup.chases.every(chase => chase.outcome.status));
    assert.deepEqual((await h.state()).data.revision.find(row => row.request === f.request.id && row.revision === f.order.revision), beforeRevision, 'Supplier text is correspondence, never an approval or order edit');
    assert.equal((await h.state()).data.emailIntake.length, 0, 'Thread aliases never create purchasing intake drafts');
    const audit = await h.send('/api/purse/audit.csv?subject=' + f.order.id, undefined, h.owner); assert.equal(audit.status, 200);
    for (const action of ['order-thread-send-claimed', 'order-thread-send-outcome', 'order-thread-reply-received', recipient]) assert.ok(audit.value.includes(action), action);
    const auditRead = await h.send('/api/purse/audit?subject=' + f.order.id, undefined, h.owner); assert.equal(auditRead.status, 200); assert.ok(JSON.stringify(auditRead.value).includes(sent.value.id));
    const rows = (await h.db.prepare('SELECT * FROM p_records').all()).results; assert.equal(validatePurchasingArchive(rows), true);
    const corrupt = structuredClone(rows), corruptRow = corrupt.find(row => row.kind === 'orderThreadMessage' && row.id === reply.id), corruptMessage = JSON.parse(corruptRow.value); corruptMessage.files[0].key = 'synthetic-purse-3019/private'; corruptRow.value = JSON.stringify(corruptMessage);
    assert.throws(() => validatePurchasingArchive(corrupt), /order_thread_original/);
    const archive = join(h.dir, 'synthetic-purse-3013.rer');
    await exportArchive(await createPortability({ db: h.db, buckets: { ORIGINALS: h.originals }, policy: portability }), archive, []);
    const restored = await harness({ empty: true, mailRequest: edge.mailRequest }); t.after(() => restored.close());
    await importArchive(await createPortability({ db: restored.db, buckets: { ORIGINALS: restored.originals }, policy: portability }), archive, []);
    const bootstrap = await restored.send('/auth/bootstrap', { token: 'synthetic-local-test-bootstrap-token-0123456789', displayName: 'synthetic-purse-3014' }); assert.equal(bootstrap.status, 303);
    const restoredHistory = await restored.send(messagePath(f.order), undefined, bootstrap.cookie); assert.equal(restoredHistory.status, 200); assert.deepEqual(restoredHistory.value, followup);
    assert.deepEqual((await restored.send(originalPath, undefined, bootstrap.cookie)).value, source); assert.equal((await restored.send(filePath, undefined, bootstrap.cookie)).value, edge.pdf.toString());
    assert.equal((await restored.db.prepare('SELECT count(*) AS count FROM p_order_thread_routes').first()).count, 0, 'Historical source addressing cannot restore live reply authority');
    const later = addReply(edge, 'synthetic-purse-3015', wire.reply_to); assert.equal((await inbound(restored, later.id)).status, 202);
    assert.equal((await restored.send(messagePath(f.order), undefined, bootstrap.cookie)).value.messages.length, 2);
    await reauthenticateErasure(h);
    const inventory = await h.send('/api/purse/erasure', undefined, h.owner); assert.ok(inventory.value.choices.some(choice => choice.kind === 'contact' && choice.id === f.supplier.id && choice.email === recipient));
    const preview = await h.send('/api/purse/erasure/preview', { kind: 'contact', id: f.supplier.id, email: recipient, revision: inventory.value.revision }, h.owner); assert.equal(preview.status, 200, JSON.stringify(preview.value));
    assert.ok(preview.value.originals >= 2);
    const erased = await h.send('/api/purse/erasure/execute', { ...preview.value.subject, revision: preview.value.revision, review: preview.value.review, fingerprint: preview.value.fingerprint, consent: true }, h.owner); assert.equal(erased.status, 200, JSON.stringify(erased.value));
    assert.equal((await h.send(filePath, undefined, f.buyer)).status, 410); assert.equal((await h.send(originalPath, undefined, f.buyer)).status, 410);
    assert.equal((await h.db.prepare('SELECT count(*) AS count FROM p_order_thread_routes').first()).count, 0);
    const erasedRows = (await h.db.prepare('SELECT * FROM p_records').all()).results; assert.ok(!JSON.stringify(erasedRows).includes(recipient)); assert.equal(validatePurchasingArchive(erasedRows), true);
});


await scenario('Supplier-thread sends enforce current native buyer, exact revision and consent, and never retry a claimed uncertain effect', async t => {
    const h = await harness({ mail: message => message.subject.startsWith('PO question:') ? new Response('synthetic-purse-3016', { status: 503 }) : Response.json({ id: 'synthetic-purse-3017' }) }); t.after(() => h.close());
    const f = await orderSendFixture(h); await h.command('email-intake-config', { address: 'synthetic-purse-3018@example.test' });
    assert.equal((await sendQuestion(h, f, {}, '')).status, 401); assert.equal((await sendQuestion(h, f, {}, f.requester)).status, 403);
    assert.equal((await sendQuestion(h, f, { revision: f.order.revision - 1 })).status, 409); assert.equal((await sendQuestion(h, f, { consent: false })).status, 400);
    const sent = await sendQuestion(h, f); assert.equal(sent.status, 200); assert.equal(sent.value.status, 'uncertain');
    assert.equal((await sendQuestion(h, f)).status, 409); assert.equal(h.messages.filter(message => message.subject.startsWith('PO question:')).length, 1);
    const route = messagePath(f.order) + '/messages/' + encodeURIComponent(sent.value.id) + '/revoke';
    assert.equal((await h.send(route, {}, f.requester)).status, 403); assert.equal((await h.send(route, {}, f.buyer)).status, 200);
    assert.equal((await h.db.prepare('SELECT count(*) AS count FROM p_order_thread_routes').first()).count, 0);
    assert.equal(validatePurchasingArchive((await h.db.prepare('SELECT * FROM p_records').all()).results), true);
});
}
