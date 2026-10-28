import assert from 'node:assert/strict';
import { harness } from './purse-harness.mjs';
import { orderSendFixture } from './order-send-fixture.mjs';
export const commentPath = (kind, id) => '/api/purse/comments/' + kind + '/' + id;
export async function commentsFixture(t) {
    const h = await harness(); t?.after(() => h.close());
    const f = await orderSendFixture(h);
    const email = n => ['synthetic-purse-' + n, 'example.test'].join('@');
    const scopedEmail = email(5101), scoped = await h.member(scopedEmail, ['approver']);
    await h.command('member', { email: scopedEmail, name: 'synthetic-purse-5102', active: true, grants: [{ role: 'approver', scope: { locations: ['Denver'] } }] });
    const source = (await h.state()).data.request.find(r => r.id === f.order.request);
    const draft = { ...source, id: undefined, title: 'synthetic-purse-5103 pending', poDetails: {}, lines: source.lines.map(l => ({ ...l, id: undefined })) };
    const pending = await h.command('request', draft, f.requester);
    await h.command('submit', { id: pending.id, revision: 1 }, f.requester);
    const second = await h.command('request', { ...draft, title: 'synthetic-purse-5104 pending' }, f.requester);
    await h.command('submit', { id: second.id, revision: 1 }, f.requester);
    const directory = (await h.send(commentPath('request', pending.id), undefined, f.approver)).value.members;
    const state = await h.state(f.requester), requesterId = state.actor.id;
    const scopedId = (await h.state(scoped)).actor.id;
    assert.ok(directory.some(m => m.id === requesterId)); assert.ok(directory.some(m => m.id === scopedId));
    return { h, ...f, pending, second, scoped, scopedId, scopedEmail, requesterId, email, add: (kind, record, body, cookie = f.approver) => h.command('comment-add', { kind, record, attempt: crypto.randomUUID(), body, mentions: [] }, cookie) };
}

export async function additionalCommentRecords(f) {
    const { h } = f;
    await h.command('policy', { name: 'synthetic-purse-5301', currency: 'USD', category: 'travel', project: 'General', approver: f.email(2803), limitMinor: 1000000, budgetMinor: 10000000 });
    const trip = await h.command('travel-request', { title: 'synthetic-purse-5302 trip', currency: 'USD', location: 'Austin', costCentre: 'Operations', project: 'General',
        travel: { traveler: 'synthetic-purse-5303', travelerEmail: f.email(2802), purpose: 'synthetic-purse-5304', origin: 'Austin', destinations: [{ city: 'Denver', state: 'CO', country: 'US' }], departureDate: '2026-11-10', returnDate: '2026-11-11', costs: { airfareMinor: 20000, mealsIncidentalsMinor: 10000 } } }, f.requester);
    await h.command('travel-submit', { id: trip.id, revision: 1 }, f.requester);
    const invoice = await h.command('invoice', { order: f.order.id, reference: 'synthetic-purse-5305', source: 'synthetic-purse-5306', allocations: [{ line: f.order.lines[0].id, quantity: '1', amountMinor: 12000 }] }, f.buyer);
    assert.ok((await h.state()).data.discrepancies.some(d => d.invoiceId === invoice.id && d.priceMismatch && d.receiptShortfall));
    const agreementInput = { version: 0, confirmed: true, name: 'synthetic-purse-5307 agreement', reference: 'synthetic-purse-5308', supplier: f.supplier.id, currency: 'USD', parties: 'synthetic-purse-5309', startDate: '2026-01-01', endDate: '2027-12-31', autoRenew: false, noticeDays: 30, paymentTerms: 'Net 30', reminderDays: [7], remindersEnabled: false, reason: 'synthetic-purse-5310', ownerMember: f.email(2802) };
    const agreement = await h.command('agreement', agreementInput);
    const original = await h.command('attachment', { kind: 'agreement', record: agreement.id, name: 'synthetic-purse-5311.txt', mediaType: 'text/plain', base64: Buffer.from('synthetic-purse-5312 private terms').toString('base64') });
    return { trip, invoice, agreement, agreementInput, original, records: [
        { kind: 'request', record: trip.id, reader: f.requester, denied: f.scoped, name: trip.title },
        { kind: 'invoice', record: invoice.id, reader: f.buyer, denied: f.approver, name: invoice.reference },
        { kind: 'supplier', record: f.supplier.id, reader: f.buyer, name: f.supplier.name },
        { kind: 'agreement', record: agreement.id, reader: f.requester, denied: f.approver, name: agreement.name },
    ] };
}

export async function agreementCommentFixture(f) {
    const { h } = f, email = f.email(5700), finance = await h.member(email, ['finance-viewer']);
    await h.command('member', { email, name: 'synthetic-purse-5701', active: true, grants: [{ role: 'finance-viewer', scope: { locations: ['Austin'] } }] });
    const financeId = (await h.state(finance)).actor.id;
    const input = { version: 0, confirmed: true, name: 'synthetic-purse-5702 awarded agreement', reference: 'synthetic-purse-5703', supplier: f.supplier.id, currency: 'USD', parties: 'synthetic-purse-5704', startDate: '2026-01-01', endDate: '2027-12-31', autoRenew: false, noticeDays: 30, paymentTerms: 'Net 30', reminderDays: [7], remindersEnabled: false, reason: 'synthetic-purse-5705', ownerMember: f.email(2802), valueMinor: 20000, firstOfferMinor: 24000, firstOfferSource: 'synthetic-purse-5706', awardSource: 'synthetic-purse-5707', priceLines: f.pending.lines.map(line => ({ ...line, firstUnitMinor: 12000, awardedUnitMinor: 10000 })) };
    const agreement = await h.command('agreement', input);
    const awardVersion = async version => {
        const request = await h.command('request', { ...f.pending, id: undefined, title: 'synthetic-purse-5708 award request' }, f.buyer);
        return h.command('agreement-award', { agreement: agreement.id, agreementVersion: version, request: request.id, revision: request.revision, reason: 'synthetic-purse-5709', lines: request.lines.map((line, agreementLine) => ({ requestLine: line.id, agreementLine, firstUnitMinor: 12000, awardedUnitMinor: 10000 })) }, f.buyer);
    };
    await awardVersion(1);
    return { agreement, input, finance, financeId, awardVersion };
}
