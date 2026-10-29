import { orderSendFixture } from './order-send-fixture.mjs';
export const shipmentAddress = number => `synthetic-purse-${number}${String.fromCharCode(64)}example.test`;
export async function shipmentFixture(h) {
    const base = await orderSendFixture(h);
    const request = await h.command('request', { ...base.request, id: undefined, revision: undefined, title: 'synthetic-purse-6601', needDate: '2026-11-01', lines: base.request.lines.map(line => ({ ...line, id: undefined })) }, base.requester);
    await h.command('submit', { id: request.id, revision: 1 }, base.requester);
    await h.command('decision', { id: request.id, revision: 1, decision: 'approved', reason: 'Exact shipment fixture approval' }, base.approver);
    const order = await h.command('convert', { id: request.id, revision: 1, issue: true }, base.buyer);
    const receiver = await h.member(shipmentAddress(6602), ['receiver']);
    const send = (extra = {}) => h.send('/api/purse/order-send', { order: order.id, revision: 1, mode: 'initial', recipient: shipmentAddress(6603), reason: 'Human consent to exact PO and contact', consent: true, ...extra }, base.buyer);
    const link = () => new URL(h.messages.find(message => message.subject.startsWith('Purchase order:')).text.match(/http:\/\/[^\s]+\/api\/purse\/order-link\/[^\s]+/)[0]);
    const input = (extra = {}) => ({ revision: 1, version: 0, decision: 'accept', promisedDate: '2026-11-08', name: 'synthetic-purse-6604', consent: true, shipment: { carrier: 'UPS', trackingNumber: 'synthetic-purse-6605' }, ...extra });
    const respond = (body = input(), headers = {}) => fetch(link(), { method: 'POST', headers: { origin: h.origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const references = async (cookie = receiver) => (await h.state(cookie)).data.order.find(row => row.id === order.id)?.shipmentReferences;
    return { ...base, h, request, order, receiver, send, link, input, respond, references };
}
