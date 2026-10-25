import test from 'node:test';
import assert from 'node:assert/strict';
import { codingAgentFixture as fixture } from './coding-agent-fixture.mjs';
import { validatePurchasingArchive } from '../scripts/installer/restore-validation.mjs';


test('AGENT-008 source-backed split review and two human GL corrections govern the third invoice without sends or purchasing changes', async t => {
 const f = await fixture(t), { h, cmd, requester, buyer, approver, receiver, scoped, supplier, makeRequest, submit, purchase, invoice, enable } = f;
 const first = await makeRequest('First near-threshold request', 95000), second = await makeRequest('Second near-threshold request', 95000);
 await submit(first); await submit(second);
 await cmd('coding-agent-run', { kind: 'request', id: second.id }, approver, 409);
 await cmd('agent-policy', { agent: 'AGENT-008', purchaseType: '*', version: 0, enabled: true, cadenceDays: 1, maxChases: 2, reason: 'Owner enables native coding on other categories' });
 await enable(false); await cmd('coding-agent-run', { kind: 'request', id: second.id }, approver, 409); await enable(true);
 for (const [cookie, status] of [['', 401], [receiver, 403], [scoped, 403]]) await cmd('coding-agent-run', { kind: 'request', id: second.id }, cookie, status);
 const split = await cmd('coding-agent-run', { kind: 'request', id: second.id }, approver), flag = split.flags.find(row => row.code === 'possible-split-purchase');
 assert.ok(flag); assert.deepEqual(new Set(flag.requests), new Set([first.id, second.id])); assert.equal(flag.combinedMinor, 190000);
 assert.ok(flag.sources.some(ref => ref.kind === 'audit')); assert.equal(flag.date, '2026-10-26');
 assert.ok((await h.state(approver)).data.codingRun.some(run => run.id === split.id));
 const ownSplit = await cmd('coding-agent-run', { kind: 'request', id: second.id }, requester);
 assert.ok((await h.state(approver)).data.codingRun.some(run => run.id === ownSplit.id), 'Approver can see another actor’s request-only split report');
 const beforeReview = (await h.state()).data.request.find(row => row.id === second.id);
 await cmd('coding-agent-review', { id: split.id, proposal: split.proposals[0].id, coding: { glAccount: '6200' }, reason: 'Approver cannot alter requester coding' }, approver, 403);
 assert.deepEqual((await h.state()).data.request.find(row => row.id === second.id), beforeReview);
 const order = await purchase('Past invoice coding history'), bills = [];
 for (let i = 0; i < 3; i++) bills.push(await invoice(order, 'CODING-' + i));
 const base = '/api/purse/supplier-protected/' + supplier.id, metadata = await h.send(base, undefined, h.owner);
 const protectedValues = { tin: '987651234', bankRouting: '123456789', bankAccount: '9876543215678' };
 const stored = await h.send(base + '/store', { revision: metadata.value.revision, values: protectedValues, reason: 'Synthetic protected source', evidence: 'synthetic-source' }, h.owner); assert.equal(stored.status, 200);
 const mailCount = h.messages.length, before = (await h.state()).data;
 const runs = []; for (const bill of bills.slice(0, 2)) runs.push(await cmd('coding-agent-run', { kind: 'invoice', id: bill.id }, buyer));
 for (const run of runs) {
  const suggestion = run.suggestions.find(row => row.field === 'glAccount'); assert.equal(suggestion.value, '6100');
  assert.ok(suggestion.sources.some(ref => ref.kind === 'invoice' && bills.some(bill => bill.id === ref.id)));
  assert.deepEqual(new Set(run.suggestions.map(row => row.field)), new Set(['glAccount', 'class', 'costCentre', 'project']));
  for (const secret of [...Object.values(protectedValues), '5678', '6789', '1234']) assert.ok(!JSON.stringify(run).includes(secret));
  assert.deepEqual(run.messages, []); assert.equal(run.outcomes[0].purchasingChange, 'none');
 }
 const snapshot = structuredClone(runs[0]);
 for (const run of runs) {
  const review = await cmd('coding-agent-review', { id: run.id, proposal: run.proposals[0].id, coding: { glAccount: '6200', class: 'FIELD', costCentre: 'Operations', project: 'Site' }, reason: 'Human corrects equipment to the proper account' }, buyer);
  assert.equal(review.outcome, 'corrected'); assert.ok(review.correctedFields.includes('glAccount'));
  await cmd('coding-agent-review', { id: run.id, proposal: run.proposals[0].id, coding: { glAccount: '6300' }, reason: 'Cannot replay' }, buyer, 409);
 }
 const third = await cmd('coding-agent-run', { kind: 'invoice', id: bills[2].id }, buyer), corrected = third.suggestions.find(row => row.field === 'glAccount');
 assert.equal(corrected.value, '6200'); assert.equal(corrected.sources.filter(ref => ref.kind === 'codingExample').length, 2);
 assert.deepEqual(new Set(corrected.sources.filter(ref => ref.kind === 'invoice').map(ref => ref.id)), new Set(bills.slice(0, 2).map(bill => bill.id)));
 const newerBill = await invoice(order, 'CODING-newer-old-account');
 const newer = await cmd('coding-agent-run', { kind: 'invoice', id: newerBill.id }, buyer); assert.equal(newer.suggestions.find(row => row.field === 'glAccount').value, '6200', 'Recent corrections outrank newer uncorrected invoice history');
 const download = await h.send('/api/purse/download/agentRun/' + third.id, undefined, buyer); assert.equal(download.status, 200); assert.deepEqual(download.value, third);
 for (const cookie of ['', requester, receiver, scoped]) assert.ok([401, 403].includes((await h.send('/api/purse/download/agentRun/' + third.id, undefined, cookie)).status));
 assert.ok(!(await h.state(requester)).data.codingRun.some(run => run.id === third.id));
 const after = (await h.state()).data; assert.deepEqual(after.agentRun.find(row => row.id === snapshot.id), snapshot);
 assert.deepEqual(after.request, before.request); assert.deepEqual(after.order, before.order); assert.deepEqual(after.decision, before.decision); assert.equal(h.messages.length, mailCount);
 await cmd('coding-agent-run', { kind: 'invoice', id: bills[2].id, bankAccount: protectedValues.bankAccount }, buyer, 400);
 await cmd('coding-agent-review', { id: third.id, proposal: third.proposals[0].id, coding: { bankRouting: protectedValues.bankRouting }, reason: 'Forbidden target' }, buyer, 400);
 await enable(false); await cmd('coding-agent-run', { kind: 'invoice', id: bills[2].id }, buyer, 409);
 await cmd('coding-agent-review', { id: third.id, proposal: third.proposals[0].id, coding: { glAccount: '6200' }, reason: 'Paused' }, buyer, 409);
 await enable(true); await cmd('coding-agent-review', { id: third.id, proposal: third.proposals[0].id, coding: { glAccount: '6200' }, reason: 'Old policy version' }, buyer, 409);
 const records = (await h.db.prepare('SELECT * FROM p_records').all()).results; assert.equal(validatePurchasingArchive(records), true);
 const tampered = structuredClone(records), row = tampered.find(row => row.kind === 'agentRun' && row.id === third.id), value = JSON.parse(row.value); value.suggestions[0].value = 'forged'; row.value = JSON.stringify(value);
 assert.throws(() => validatePurchasingArchive(tampered), /coding_agent_digest/);
});

test('AGENT-008 flags preferred supplier sources and separates day, requester, currency and current source scope', async t => {
 const { h, cmd, requester, buyer, approver, supplier, makeRequest, submit, enable } = await fixture(t);
 await enable(true);
 const preferred = await cmd('supplier', { name: 'Preferred safety provider', status: 'preferred', reason: 'Approved preferred source' }, buyer);
 await cmd('catalogue', { supplier: preferred.id, description: 'Safety equipment', currency: 'USD', unitMinor: 90000, category: 'Equipment', project: 'Site', approved: true }, buyer);
 const one = await makeRequest('Today safety purchase', 95000), two = await makeRequest('Yesterday safety purchase', 95000); await submit(one); await submit(two);
 const event = (await h.db.prepare("SELECT id,value FROM p_records WHERE kind='audit' AND json_extract(value,'$.action')='submit' AND json_extract(value,'$.record')=?").bind(two.id).all()).results[0];
 const value = JSON.parse(event.value); value.at = '2026-10-25T17:00:00.000Z'; await h.db.prepare("UPDATE p_records SET value=? WHERE kind='audit' AND id=?").bind(JSON.stringify(value), event.id).run();
 const run = await cmd('coding-agent-run', { kind: 'request', id: one.id }, approver);
 assert.ok(!run.flags.some(row => row.code === 'possible-split-purchase'));
 const flag = run.flags.find(row => row.code === 'non-preferred-supplier'); assert.ok(flag); assert.equal(flag.supplier, supplier.id); assert.deepEqual(flag.alternatives, [preferred.id]);
 assert.ok(flag.sources.some(ref => ref.kind === 'catalogue')); assert.ok(run.limitations.some(line => line.includes('Non-PO invoice intake is unavailable')));
 const crossOrigin = await fetch(h.origin + '/api/purse/command/coding-agent-run', { method: 'POST', headers: { origin: 'https://invalid.example.test', cookie: requester, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'request', id: one.id }) }); assert.equal(crossOrigin.status, 403);
 const reviewRun = await cmd('coding-agent-run', { kind: 'request', id: one.id }, requester);
 await cmd('coding-agent-review', { id: reviewRun.id, proposal: reviewRun.proposals[0].id, coding: { project: 'Unknown project' }, reason: 'Unknown coding' }, requester, 400);
 await cmd('member', { email: 'coding-requester@example.test', name: 'Requester', active: false, roles: ['requester'] });
 await cmd('coding-agent-review', { id: reviewRun.id, proposal: reviewRun.proposals[0].id, coding: { glAccount: '6200' }, reason: 'Revoked capability' }, requester, 403);
});
