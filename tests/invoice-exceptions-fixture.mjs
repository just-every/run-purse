import assert from 'node:assert/strict';
import { harness } from './purse-harness.mjs';

export const address = n => ['synthetic-purse-' + n, 'example.test'].join('@');
export async function invoiceExceptionsFixture(t,options={}) {
    const h = await harness(options); t?.after(() => h.close());
    await h.command('business', { name: 'synthetic-purse-6201', currencies: ['USD'], locations: ['Denver', 'Austin'], costCentres: ['Operations'], projects: ['Equipment'] });
    const requester = await h.member(address(6202), ['requester']), approver = await h.member(address(6203), ['approver']);
    const buyer = await h.member(address(6204), ['buyer']), receiver = await h.member(address(6205), ['receiver']);
    const second = await h.member(address(6206), ['receiver']), outsider = await h.member(address(6207), ['receiver']);
    await h.command('member', { email: address(6207), name: 'synthetic-purse-6207', active: true, grants: [{ role: 'receiver', scope: { locations: ['Austin'] } }] });
    await h.command('policy', { name: 'synthetic-purse-6208', currency: 'USD', category: 'Equipment', project: 'Equipment', approver: address(6203), limitMinor: 1000000, budgetMinor: 10000000 });
    const supplier = await h.command('supplier', { name: 'synthetic-purse-6209', status: 'preferred', reason: 'Reviewed supplier' }, buyer);
    const request = await h.command('request', { title: 'synthetic-purse-6210', supplier: supplier.id, currency: 'USD', location: 'Denver', costCentre: 'Operations', needDate: '2026-11-15', terms: 'Net 30',
        lines: [{ description: 'synthetic-purse-6211', quantity: '10', unitMinor: 10000, category: 'Equipment', project: 'Equipment' }] }, requester);
    await h.command('submit', { id: request.id, revision: 1 }, requester);
    await h.command('decision', { id: request.id, revision: 1, decision: 'approved', reason: 'Approved equipment' }, approver);
    const order = await h.command('convert', { id: request.id, revision: 1, issue: true }, buyer);
    const receipt = await h.command('receipt', { order: order.id, line: order.lines[0].id, event: 'receive', quantity: '8', reason: 'Initial eight recorded' }, receiver);
    const invoice = await h.command('invoice', { order: order.id, reference: 'synthetic-purse-6212', source: 'synthetic-purse-6213 private original', document: { name: 'synthetic-purse-6213.txt', mediaType: 'text/plain', base64: Buffer.from('synthetic-purse-6213 private original').toString('base64') }, allocations: [{ line: order.lines[0].id, quantity: '10', amountMinor: 100000 }] }, buyer);
    const queue = async (cookie = buyer) => { const r = await h.send('/api/purse/invoice-exceptions', undefined, cookie); assert.equal(r.status, 200, JSON.stringify(r.value)); return r.value.queue; };
    const current = async cookie => (await h.state(cookie)).data.order.find(o => o.id === order.id);
    const correction = async (extra = {}, cookie = receiver) => ({ receipt: receipt.id, expectedQ: 8000, receiptVersion: (await current(cookie)).receiptVersion,
        attempt: 'synthetic-purse-6214', quantity: '10', reason: 'Count sheet confirms ten; eight was a transcription error', ...extra });
    const ids = { requester: (await h.state(requester)).actor.id, buyer: (await h.state(buyer)).actor.id,
        receiver: (await h.state(receiver)).actor.id, second: (await h.state(second)).actor.id, outsider: (await h.state(outsider)).actor.id };
    return { h, requester, approver, buyer, receiver, second, outsider, supplier, request, order, receipt, invoice, queue, current, correction, ids };
}
