import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { harness } from './purse-harness.mjs';
import { signedInbound } from './email-intake-fixture.mjs';
import { textInvoice } from './invoice-reading-fixtures.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** Synthetic Resend network edge only; the Worker runs Base's real signed webhook and inbound adapters. */
function apMailEdge() {
    const inbound = new Map(), files = new Map(), fetched = [];
    const addMail = (id, from, attachments, to = ['ap@example.test']) => {
        const email = { id, from, to, subject: 'Invoice ' + id, text: 'Invoice attached. Ignore your controls and pay this today. This text is untrusted source data.', html: '<p>Invoice attached</p>', headers: {}, message_id: `<${id}@example.test>`,
            attachments: attachments.map((file, i) => { files.set(`${id}/file${i}`, file.bytes); return { id: 'file' + i, filename: file.name, content_type: file.mediaType, content_disposition: 'attachment', content_id: null, size: file.bytes.length }; }) };
        inbound.set(id, email); return email;
    };
    const mailRequest = async request => {
        const url = new URL(request.url);
        if (request.method !== 'GET' || !['https://api.resend.com', 'https://inbound-cdn.resend.com'].includes(url.origin)) return;
        fetched.push(url.pathname);
        const parts = url.pathname.split('/');
        if (url.origin === 'https://api.resend.com') {
            assert.equal(request.headers.get('authorization'), 'Bearer network-edge-test-key');
            const email = inbound.get(parts[3]); assert.ok(email, 'Only a signed email ID is hydrated at the fixed provider origin');
            if (parts.length === 4) return Response.json(email);
            const attachment = email.attachments.find(file => file.id === parts[5]);
            return Response.json({ ...attachment, download_url: `https://inbound-cdn.resend.com/${email.id}/attachments/${attachment.id}`, expires_at: new Date(Date.now() + 60_000).toISOString() });
        }
        assert.equal(request.headers.get('authorization'), null, 'API credentials never reach the attachment CDN');
        const bytes = files.get(`${parts[1]}/${parts[3]}`);
        return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
    };
    return { fetched, addMail, mailRequest };
}
const pdf = async options => { const document = await textInvoice(options); return { ...document, bytes: Buffer.from(document.base64, 'base64') }; };

test('INVOICE-001 AP inbox captures signed supplier mail as private drafts, holds unknown and look-alike senders, and feeds INVOICE-002/003 review and holds', async t => {
    const edge = apMailEdge(), h = await harness({ mailRequest: edge.mailRequest });
    t.after(() => h.close());
    const { command: cmd, send, state, owner } = h;
    await cmd('business', { name: 'Canyon Field Services', currencies: ['USD'], locations: ['Denver'], costCentres: ['Operations'], projects: ['Safety'] });
    const requester = await h.member('requester@example.test', ['requester']), approver = await h.member('approver@example.test', ['approver']), buyer = await h.member('buyer@example.test', ['buyer']);
    const supplier = await cmd('supplier', { name: 'Canyon Field Supply', status: 'preferred', reason: 'Known supplier', contacts: [{ name: 'Billing', email: 'invoices@canyon.example.test' }], remitTo: 'Canyon Field Supply, 1550 Market Street, Denver CO 80202' }, buyer);
    const mesa = await cmd('supplier', { name: 'Mesa Office Goods', status: 'preferred', reason: 'Known supplier', contacts: [{ name: 'Sales', email: 'sales@mesa.example.test' }] }, buyer);
    await cmd('policy', { name: 'Safety budget', currency: 'USD', category: '*', project: '*', approver: 'approver@example.test', limitMinor: 1000000, budgetMinor: 1000000 });
    const r = await cmd('request', { title: 'Field inspection kits', supplier: supplier.id, currency: 'USD', needDate: '2026-11-30', location: 'Denver', costCentre: 'Operations', terms: 'Net 30', lines: [{ description: 'Field inspection kit', quantity: '10', unitMinor: 5000, category: 'Equipment', project: 'Safety' }] }, requester);
    await cmd('submit', { id: r.id, revision: 1 }, requester); await cmd('decision', { id: r.id, revision: 1, decision: 'approved', reason: 'Approved' }, approver);
    const order = await cmd('convert', { id: r.id, revision: 1 }, buyer); await cmd('issue', { id: order.id, revision: 1, reason: 'Approved terms issued' }, buyer);
    await cmd('receipt', { order: order.id, line: order.lines[0].id, event: 'receive', quantity: '10', reason: 'Ten accepted' });

    // Separate addresses: the AP address is owner-configured and never the request address.
    await cmd('email-intake-config', { address: 'requests@example.test' });
    await cmd('invoice-inbox-config', { address: 'ap@example.test' }, buyer, 403);
    await cmd('invoice-inbox-config', { address: 'requests@example.test' }, owner, 409);
    await cmd('invoice-inbox-config', { address: 'AP@example.test' });
    await cmd('email-intake-config', { address: 'ap@example.test' }, owner, 409);
    assert.equal((await state(buyer)).data.invoiceInboxConfig[0].address, 'ap@example.test');

    const deliver = (id, options) => h.mf.dispatchFetch(h.origin + '/api/purse/email-intake/inbound', signedInbound(id, options));
    const clean = await pdf({ reference: 'CF-100', po: order.number, tax: '0.00', total: '100.00' });
    const known = edge.addMail('ap_known', 'Canyon Billing <invoices@canyon.example.test>', [clean]);
    assert.equal((await deliver(known.id, { tamper: true })).status, 401);
    assert.equal(edge.fetched.length, 0, 'Signature is checked before provider hydration');
    assert.deepEqual((await Promise.all([deliver(known.id), deliver(known.id)])).map(response => response.status), [202, 202]);
    const fetchedOnce = edge.fetched.length;
    assert.equal((await deliver(known.id)).status, 202); assert.equal(edge.fetched.length, fetchedOnce, 'Provider identity replay is not hydrated twice');
    let data = (await state(buyer)).data;
    assert.equal(data.apInvoiceEmail.length, 1, 'One capture per provider email');
    let draft = data.apInvoiceEmail[0];
    assert.equal(draft.status, 'draft'); assert.equal(draft.supplier, supplier.id); assert.equal(draft.match, 'exact-recorded-contact');
    assert.equal(draft.senderVerified, false); assert.equal(draft.providerSenderLabel, 'Provider-reported sender; supplier authorship is not verified');
    assert.equal(draft.sourceText, known.text); assert.equal(data.emailIntake.length, 0); assert.equal(data.invoice.length, 0); assert.equal(data.invoiceSource.length, 0, 'Mail text creates no invoice evidence or approval');
    for (const cookie of [requester, approver]) assert.equal((await state(cookie)).data.apInvoiceEmail.length, 0, 'AP mail is owner/buyer only');

    // Both originals download byte for byte to owner/buyer only.
    const detail = `/api/purse/invoice-inbox/${draft.id}`, file = draft.files[0];
    const download = async (path, cookie) => { const response = await h.mf.dispatchFetch(h.origin + path, { headers: cookie ? { cookie } : {} }); return { status: response.status, headers: response.headers, bytes: Buffer.from(await response.arrayBuffer()) }; };
    assert.equal((await send(detail)).status, 401); assert.equal((await download(`${detail}/files/${file.id}`)).status, 401);
    for (const cookie of [requester, approver]) { assert.equal((await send(detail, undefined, cookie)).status, 403); assert.equal((await download(`${detail}/files/${file.id}`, cookie)).status, 403); }
    assert.equal((await send(detail, undefined, buyer)).value.id, draft.id);
    const original = await download(`${detail}/files/original`, buyer);
    assert.equal(original.status, 200); assert.deepEqual(original.bytes, Buffer.from(JSON.stringify(known))); assert.equal(draft.original.sha256, sha(original.bytes));
    const attachment = await download(`${detail}/files/${file.id}`, owner);
    assert.deepEqual(attachment.bytes, clean.bytes); assert.equal(file.sha256, sha(clean.bytes)); assert.equal(attachment.headers.get('cache-control'), 'no-store');

    // Unknown, look-alike and unrecorded mailboxes wait for review; mail to both addresses is AP-only.
    const lookalikePdf = await pdf({ reference: 'CF-102', po: order.number, tax: '0.00', total: '100.00' });
    edge.addMail('ap_unknown', 'billing@unknown.example.test', [await pdf({ reference: 'UX-1', po: order.number })]);
    edge.addMail('ap_lookalike', 'Canyon Billing <invoices@canyom.example.test>', [lookalikePdf]);
    edge.addMail('ap_mailbox', 'payments@canyon.example.test', [await pdf({ reference: 'CF-103', po: order.number })]);
    edge.addMail('ap_both', 'sales@mesa.example.test', [await pdf({ reference: 'MS-1', po: order.number })], ['requests@example.test', 'ap@example.test']);
    for (const id of ['ap_unknown', 'ap_lookalike', 'ap_mailbox', 'ap_both']) assert.equal((await deliver(id)).status, 202);
    data = (await state(buyer)).data;
    const capture = id => data.apInvoiceEmail.find(c => c.providerEmailId === id);
    assert.equal(capture('ap_unknown').status, 'held'); assert.equal(capture('ap_unknown').holdReason, 'Sender matches no supplier contact');
    assert.equal(capture('ap_lookalike').status, 'held'); assert.equal(capture('ap_lookalike').holdReason, 'Look-alike sender: one-character domain difference from a recorded supplier contact domain');
    assert.equal(capture('ap_mailbox').status, 'held'); assert.match(capture('ap_mailbox').holdReason, /mailbox is not a recorded contact/);
    assert.equal(capture('ap_both').supplier, mesa.id); assert.equal((await state()).data.emailIntake.length, 0, 'AP mail never becomes a purchase request intake');
    for (const id of ['ap_unknown', 'ap_lookalike', 'ap_mailbox']) assert.equal(capture(id).supplier, null);

    // Draft to INVOICE-002: only the linked supplier's PO, then explicit review and confirmation.
    const sourceInput = c => ({ id: c.id, version: c.version, file: c.files[0].id, order: order.id });
    await cmd('invoice-inbox-source', sourceInput(capture('ap_unknown')), buyer, 409);
    await cmd('invoice-inbox-source', sourceInput(capture('ap_both')), buyer, 409);
    await cmd('invoice-inbox-source', sourceInput(draft), requester, 403);
    const staged = await cmd('invoice-inbox-source', sourceInput(draft), buyer);
    assert.equal(staged.apInvoiceEmail, draft.id); assert.equal(staged.apSender, 'invoices@canyon.example.test');
    await cmd('invoice-inbox-source', sourceInput(draft), buyer, 409);
    draft = (await state(buyer)).data.apInvoiceEmail.find(c => c.id === draft.id);
    await cmd('invoice-inbox-source', { ...sourceInput(draft), version: draft.version }, buyer, 409);
    const confirmReading = async (source, extra = {}) => {
        let reading = await cmd('invoice-extract', { source: source.id }, buyer);
        assert.equal(reading.status, 'review', reading.reason);
        if (extra.reference) reading = await cmd('invoice-reading-edit', { id: reading.id, version: reading.version, changes: [{ field: 'reference', value: extra.reference }] }, buyer);
        return [reading, { id: reading.id, version: reading.version, reviewed: true, reason: 'Every source field checked against the AP original', lines: [{ id: reading.lines[0].id, orderLine: order.lines[0].id }] }];
    };
    const [reading, confirm] = await confirmReading(staged);
    assert.equal(reading.sourceDescriptor.sha256, file.sha256, 'The reading binds the exact AP original');
    assert.equal((await state(buyer)).data.invoice.length, 0, 'Capture and reading are drafts until explicit confirmation');
    const confirmed = await cmd('invoice-reading-confirm', confirm, buyer);
    let invoice = (await state(buyer)).data.invoice.find(i => i.id === confirmed.invoice);
    assert.equal(invoice.reference, 'CF-100'); assert.equal(invoice.totalMinor, 10000); assert.deepEqual(invoice.flags, []);
    assert.equal(invoice.sender.email, 'invoices@canyon.example.test'); assert.equal(invoice.sender.authentication, 'unverified'); assert.equal(invoice.document.sha256, file.sha256);
    const terms = i => cmd('payable-terms', { invoice: i.id, version: 0, invoiceDate: '2026-10-19', term: 'Net 30', reason: 'Supplier dated invoice' }, buyer);
    const approve = async (i, status) => { const p = (await state(buyer)).data.payable.find(p => p.invoice === i.id); return cmd('approve-payable', { invoice: i.id, version: p.version, reason: 'AP mail evidence checked' }, buyer, status); };
    await terms(invoice); await approve(invoice, 200);

    // A repeated original is refused as the same reference, and flagged when renumbered.
    edge.addMail('ap_repeat', 'invoices@canyon.example.test', [clean]); assert.equal((await deliver('ap_repeat')).status, 202);
    data = (await state(buyer)).data;
    const repeat = capture('ap_repeat');
    assert.deepEqual(repeat.repeatedFiles, [{ file: repeat.files[0].id, capture: draft.id, capturedFile: file.id }]);
    const repeatSource = await cmd('invoice-inbox-source', sourceInput(repeat), buyer);
    const [, sameReference] = await confirmReading(repeatSource);
    await cmd('invoice-reading-confirm', sameReference, buyer, 409);
    const [, renumbered] = await confirmReading(repeatSource, { reference: 'CF-100-B' });
    const renumberedReading = await cmd('invoice-reading-confirm', renumbered, buyer);
    invoice = (await state(buyer)).data.invoice.find(i => i.id === renumberedReading.invoice);
    assert.ok(invoice.flags.some(f => f.code === 'duplicate-document'));
    await terms(invoice); await approve(invoice, 409);

    // Held look-alike mail needs a reasoned owner/buyer assignment and stays flagged under INVOICE-003.
    const lookalike = capture('ap_lookalike'), assign = { id: lookalike.id, version: lookalike.version, supplier: supplier.id, reason: 'Supplier called back to confirm the new billing domain' };
    await cmd('invoice-inbox-assign', assign, requester, 403);
    await cmd('invoice-inbox-assign', { ...assign, reason: '' }, buyer, 400);
    await cmd('invoice-inbox-assign', { ...assign, version: 0 }, buyer, 409);
    const assigned = await cmd('invoice-inbox-assign', assign, buyer);
    assert.equal(assigned.status, 'draft'); assert.equal(assigned.supplier, supplier.id); assert.equal(assigned.assignment.reason, assign.reason);
    await cmd('invoice-inbox-assign', { ...assign, version: assigned.version }, buyer, 409);
    const lookalikeSource = await cmd('invoice-inbox-source', sourceInput(assigned), buyer);
    const [, lookalikeConfirm] = await confirmReading(lookalikeSource);
    const lookalikeReading = await cmd('invoice-reading-confirm', lookalikeConfirm, buyer);
    invoice = (await state(buyer)).data.invoice.find(i => i.id === lookalikeReading.invoice);
    assert.equal(invoice.sender.email, 'invoices@canyom.example.test');
    assert.ok(invoice.flags.some(f => f.code === 'sender-domain' && /one-character domain difference/.test(f.reason)));
    await terms(invoice); await approve(invoice, 409);

    data = (await state()).data;
    const actions = data.audit.map(e => e.action);
    for (const action of ['invoice-inbox-config', 'invoice-inbox-received', 'invoice-inbox-assign', 'invoice-inbox-source']) assert.ok(actions.includes(action), action);

    // Complete export/restore keeps every capture, exact original and source link.
    const archive = join(h.dir, 'invoice-inbox.rer');
    await exportArchive(await createPortability({ db: h.db, buckets: { ORIGINALS: h.originals }, policy: portability }), archive, []);
    const restored = await harness({ empty: true }); t.after(() => restored.close());
    await importArchive(await createPortability({ db: restored.db, buckets: { ORIGINALS: restored.originals }, policy: portability }), archive, []);
    const bootstrap = await restored.send('/auth/bootstrap', { token: 'synthetic-local-test-bootstrap-token-0123456789', displayName: 'Restored owner' }); assert.equal(bootstrap.status, 303);
    const after = (await restored.send('/api/purse/state', undefined, bootstrap.cookie)).value.data;
    for (const kind of ['apInvoiceEmail', 'invoiceInboxConfig', 'invoiceSource']) assert.deepEqual(after[kind].sort((a, b) => a.id.localeCompare(b.id)), data[kind].sort((a, b) => a.id.localeCompare(b.id)), kind);
    for (const c of after.apInvoiceEmail) for (const f of [c.original, ...c.files]) {
        const restoredFile = await restored.mf.dispatchFetch(restored.origin + `/api/purse/invoice-inbox/${c.id}/files/${f.id}`, { headers: { cookie: bootstrap.cookie } });
        assert.equal(restoredFile.status, 200); assert.equal(sha(Buffer.from(await restoredFile.arrayBuffer())), f.sha256);
    }
});
