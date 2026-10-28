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
