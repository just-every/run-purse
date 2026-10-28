
import assert from 'node:assert/strict';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { harness } from './purse-harness.mjs';
import { createEmailIntakeEdge, signedInbound } from './email-intake-fixture.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export async function email_intakeFlow(){
{
 // INTAKE-004 signed provider intake preserves private sources, requester completion, held assignment and durable replay/mail claims
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
    const { pdf, fetched, addMail, mailRequest } = await createEmailIntakeEdge();
    let uncertain = false;
    const h = await harness({
        mail: message => uncertain && message.to.includes('other@example.test') && message.text.includes('/app?intake=') ? new Response('Provider uncertain', { status: 503 }) : Response.json({ id: randomUUID() }),
        mailRequest,
    });
    t.after(() => h.close());
    const { command: cmd, send, state, owner } = h;
    await cmd('business', { name: 'Email intake business', currencies: ['USD'], locations: ['Denver','Boulder'], costCentres: ['Field','IT'], projects: ['Site'] });
    const requester = await h.member('requester@example.test', ['requester']), other = await h.member('other@example.test', ['requester']), buyer = await h.member('buyer@example.test', ['buyer']);
    await h.member('readonly@example.test',['finance-viewer']);
    const inactive = await h.member('inactive@example.test', ['requester']);
    await cmd('member', { email: 'inactive@example.test', name: 'Inactive requester', roles: ['requester'], active: false });
    await cmd('email-intake-config', { address: 'requests@example.test' }, requester, 403);
    await cmd('email-intake-config', { address: 'requests@example.test' });
    const supplier = await cmd('supplier', { name: 'Quote supplier', status: 'preferred', reason: 'Reviewed', contacts: [{ name: 'Supplier', email: 'supplier@example.test' }] }, buyer);
    const deliver = (id, options) => h.mf.dispatchFetch(h.origin + '/api/purse/email-intake/inbound', signedInbound(id, options));
    const source = addMail('known_quote', 'Requester <requester@example.test>');
    assert.equal((await deliver(source.id, { tamper: true })).status, 401);
    assert.equal((await deliver(source.id, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status, 401);
    assert.equal(fetched.length, 0, 'Signature and freshness are checked before provider requests');
    const mailBefore = h.messages.length;
    const concurrent = await Promise.all([deliver(source.id), deliver(source.id)]);
    assert.deepEqual(concurrent.map(r => r.status), [202, 202]);
    let data = (await state(requester)).data, intake = data.emailIntake.find(i => i.providerEmailId === source.id);
    assert.ok(intake); assert.equal(intake.status, 'draft'); assert.equal(intake.title, source.subject); assert.equal(intake.body, source.text); assert.equal(intake.sourceHtml, source.html); assert.equal(intake.senderVerified, false);
    assert.equal(data.request.length, 0); assert.equal(data.decision.length, 0); assert.equal(data.commitment.length, 0, 'Email text has no purchasing authority');
    assert.equal(h.messages.length, mailBefore + 1);
    const mail = h.messages.at(-1), link = new URL(mail.text.match(/http:\/\/[^\s]+\/app\?intake=[^\s]+/)[0]);
    assert.equal(link.searchParams.get('intake'), intake.id); assert.ok(mail.to.includes('requester@example.test'));
    assert.ok(!(await state(other)).data.emailIntake.length); assert.ok(!(await state(buyer)).data.emailIntake.length);
    const detail = `/api/purse/email-intake/${intake.id}`, download = `${detail}/files/${intake.files[0].id}`;
    assert.equal((await send(detail)).status, 401); assert.equal((await send(download)).status, 401);
    assert.equal((await send(detail, undefined, other)).status, 403); assert.equal((await send(download, undefined, buyer)).status, 403);
    const original = await send(`${detail}/files/original`, undefined, requester);
    assert.deepEqual(original.value, source); assert.equal(intake.original.sha256, sha(Buffer.from(JSON.stringify(source)))); assert.equal(intake.original.size, Buffer.byteLength(JSON.stringify(source)));
    const file = await send(download, undefined, requester);
    assert.equal(file.value, pdf.toString()); assert.equal(intake.files[0].sha256, sha(pdf)); assert.equal(intake.files[0].size, pdf.length); assert.equal(file.headers.get('cache-control'), 'no-store');
    const fetchedBeforeReplay = fetched.length;
    assert.equal((await deliver(source.id)).status, 202); assert.equal(fetched.length, fetchedBeforeReplay); assert.equal(h.messages.length, mailBefore + 1);
    await cmd('email-intake-edit', { id: intake.id, version: intake.version, title: 'Reviewed equipment', body: 'Requester notes' }, other, 403);
    intake = await cmd('email-intake-edit', { id: intake.id, version: intake.version, title: 'Reviewed equipment', body: 'Requester notes' }, requester);
    assert.equal(intake.sourceText, source.text, 'Editing the draft retains source evidence');
    await cmd('email-intake-complete', { id: intake.id, version: intake.version, request: { title: 'Missing required purchasing fields' } }, requester, 404);
    const fields = { title: intake.title, supplier: supplier.id, currency: 'USD', needDate: '2026-12-01', location: 'Denver', costCentre: 'Field', terms: 'Net 30', lines: [{ description: 'Harness', quantity: '2', unitMinor: 12500, category: 'Equipment', project: 'Site' }] };
    await cmd('email-intake-complete', { id: intake.id, version: intake.version, request: fields }, owner, 403);
    const request = await cmd('email-intake-complete', { id: intake.id, version: intake.version, request: fields }, requester);
    assert.equal(request.status, 'draft'); assert.equal(request.emailIntake, intake.id); assert.equal(request.requester, intake.requester); assert.equal(request.totalMinor, 25000);
    await cmd('email-intake-complete', { id: intake.id, version: intake.version, request: fields }, requester, 409);
    data = (await state(requester)).data; assert.equal(data.request.length, 1); assert.equal(data.emailIntake.find(i => i.id === intake.id).request, request.id);
    assert.equal((await send(download, undefined, requester)).value, pdf.toString());

    for (const [id, from] of [['unknown_quote', 'unknown@example.test'], ['inactive_quote', 'inactive@example.test'], ['wrong_role_quote', 'readonly@example.test']]) {
        addMail(id, from); assert.equal((await deliver(id)).status, 202);
    }
    const held = (await state()).data.emailIntake.filter(i => i.status === 'held'); assert.equal(held.length, 3);
    assert.equal((await state(requester)).data.emailIntake.length, 1); assert.equal((await send('/api/purse/state', undefined, inactive)).status, 403);
    const unknown = held.find(i => i.providerEmailId === 'unknown_quote');
    assert.equal((await send(`/api/purse/email-intake/${unknown.id}`, undefined, requester)).status, 403);
    assert.equal((await send(`/api/purse/email-intake/${unknown.id}/files/${unknown.files[0].id}`, undefined, requester)).status, 403);
    await cmd('email-intake-assign', { id: unknown.id, version: unknown.version, requesterEmail: 'other@example.test', reason: 'Reviewed supplier quote' }, requester, 403);
    await cmd('email-intake-assign', { id: unknown.id, version: unknown.version, requesterEmail: 'inactive@example.test', reason: 'Unavailable assignee' }, owner, 409);
    await cmd('email-intake-assign', { id: unknown.id, version: unknown.version, requesterEmail: 'other@example.test', reason: '' }, owner, 400);
    uncertain = true;
    const assigned = await cmd('email-intake-assign', { id: unknown.id, version: unknown.version, requesterEmail: 'other@example.test', reason: 'Owner reviewed unknown supplier mail and assigned its requester' });
    assert.equal(assigned.status, 'draft'); assert.equal((await send(`/api/purse/email-intake/${unknown.id}`, undefined, other)).status, 200);
    assert.equal((await send(`/api/purse/email-intake/${unknown.id}/files/${unknown.files[0].id}`, undefined, other)).value, pdf.toString());
    const uncertainEvent = (await state()).data.emailIntakeMailEvent.find(e => e.intake === unknown.id);
    assert.equal(uncertainEvent.status, 'uncertain'); assert.equal(uncertainEvent.delivery.status, 'uncertain');
    const attempted = h.messages.length;
    await cmd('email-intake-config', { address: 'requests@example.test' }); assert.equal(h.messages.length, attempted, 'Uncertain sends need reconciliation and are not retried');
    await cmd('member', { email: 'other@example.test', name: 'Other', roles: ['requester'], active: false });
    assert.equal((await send(`/api/purse/email-intake/${unknown.id}`, undefined, other)).status, 403);
    assert.equal((await send(`/api/purse/email-intake/${unknown.id}/files/${unknown.files[0].id}`, undefined, other)).status, 403);
    assert.equal((await send('/api/purse/email-intake-receipts', undefined, requester)).status, 403);
    assert.equal((await send('/api/purse/email-intake-receipts', undefined, owner)).value.receipts.length, 4);
    assert.equal((await send('/auth/signout', {}, requester)).status, 204);
    assert.equal((await send(detail, undefined, requester)).status, 401); assert.equal((await send(download, undefined, requester)).status, 401);
    addMail('parallel_first', 'owner@example.test'); addMail('parallel_second', 'owner@example.test');
    const distinct = await Promise.all([deliver('parallel_first'), deliver('parallel_second')]);
    assert.deepEqual(distinct.map(response => response.status), [202,202], 'INTAKE-004 distinct simultaneous emails must both produce retained drafts');
    assert.equal((await state()).data.emailIntake.filter(i => ['parallel_first','parallel_second'].includes(i.providerEmailId)).length, 2);
    // Intake administrators receive only their native scope; an unassigned provider source has no inferred purchasing department.
    const administrator=await h.member('synthetic-intake-admin@example.test',['admin']),scopedAdministrator=await h.member('synthetic-scoped-admin@example.test',['admin']),scopedRequester=await h.member('synthetic-intake-requester@example.test',['requester']);
    const scope={departments:['Field'],locations:['Denver'],projects:['Site'],entities:['main']};
    for(const [email,role]of [['synthetic-scoped-admin@example.test','admin'],['synthetic-intake-requester@example.test','requester']])await cmd('member',{email,name:email,grants:[{role,scope}]});
    const scopedMail=addMail('synthetic_scoped_intake','synthetic-intake-requester@example.test');assert.equal((await deliver(scopedMail.id)).status,202);
    let scopedIntake=(await state(scopedRequester)).data.emailIntake.find(i=>i.providerEmailId===scopedMail.id);assert.ok(scopedIntake);
    const scopedDetail=`/api/purse/email-intake/${scopedIntake.id}`,scopedFile=scopedDetail+'/files/'+scopedIntake.files[0].id;
    assert.equal((await send(scopedDetail,undefined,administrator)).status,200);assert.equal((await send(scopedDetail,undefined,scopedAdministrator)).status,403);assert.equal((await send(scopedFile,undefined,scopedAdministrator)).status,403);
    await cmd('email-intake-complete',{id:scopedIntake.id,version:scopedIntake.version,request:fields},administrator,403);
    await cmd('email-intake-complete',{id:scopedIntake.id,version:scopedIntake.version,request:{...fields,location:'Boulder',costCentre:'IT'}},scopedRequester,403);
    scopedIntake=await cmd('email-intake-edit',{id:scopedIntake.id,version:scopedIntake.version,title:'Scoped requester evidence',body:'Current requester completed the fields'},scopedRequester);
    const scopedDraft=await cmd('email-intake-complete',{id:scopedIntake.id,version:scopedIntake.version,request:fields},scopedRequester);assert.equal(scopedDraft.status,'draft');
    assert.equal((await send(scopedDetail,undefined,scopedAdministrator)).status,200);assert.equal((await send(scopedFile,undefined,scopedAdministrator)).value,pdf.toString());
    const rawUnassigned=addMail('synthetic_unassigned_intake','synthetic-unknown@example.test');assert.equal((await deliver(rawUnassigned.id)).status,202);
    const unassigned=(await state(administrator)).data.emailIntake.find(i=>i.providerEmailId===rawUnassigned.id);assert.ok(unassigned.mayAssign);
    const beforeScopedRefusal=h.messages.length;
    assert.equal((await send(`/api/purse/email-intake/${unassigned.id}`,undefined,scopedAdministrator)).status,403);
    await cmd('email-intake-assign',{id:unassigned.id,version:unassigned.version,requesterEmail:'synthetic-intake-requester@example.test',reason:'Unscoped provider source'},scopedAdministrator,403);
    await cmd('email-intake-config',{address:'other-requests@example.test'},scopedAdministrator,403);assert.equal(h.messages.length,beforeScopedRefusal);
    await cmd('email-intake-assign',{id:unassigned.id,version:unassigned.version,requesterEmail:'synthetic-intake-requester@example.test',reason:''},administrator,400);
    const adminAssigned=await cmd('email-intake-assign',{id:unassigned.id,version:unassigned.version,requesterEmail:'synthetic-intake-requester@example.test',reason:'Intake administrator reviewed and assigned private source'},administrator);assert.equal(adminAssigned.status,'draft');
    await cmd('email-intake-config',{address:'requests@example.test'},administrator);
    const scopedReceipts=await send('/api/purse/email-intake-receipts',undefined,scopedAdministrator);assert.equal(scopedReceipts.status,200);assert.ok(scopedReceipts.value.receipts.some(receipt=>receipt.intake_id===scopedIntake.id));assert.ok(!scopedReceipts.value.receipts.some(receipt=>receipt.intake_id===unassigned.id));
    const beforeScopedReplay=h.messages.length;assert.equal((await deliver(scopedMail.id)).status,202);assert.equal(h.messages.length,beforeScopedReplay);assert.equal((await send(scopedDetail,undefined,scopedRequester)).value.original.sha256,sha(Buffer.from(JSON.stringify(scopedMail))));
    await cmd('member',{email:'synthetic-intake-requester@example.test',name:'Revoked intake requester',roles:[],active:true});assert.equal((await send(scopedDetail,undefined,scopedRequester)).status,403);
    const before = (await state()).data, archive = join(h.dir, 'email-intake.rer');
    const sourceService = await createPortability({ db: h.db, buckets: { ORIGINALS: h.originals }, policy: portability });
    await exportArchive(sourceService, archive, []);
    const restored = await harness({ empty: true }); t.after(() => restored.close());
    const targetService = await createPortability({ db: restored.db, buckets: { ORIGINALS: restored.originals }, policy: portability });
    await importArchive(targetService, archive, []);
    const bootstrap = await restored.send('/auth/bootstrap', { token: 'synthetic-local-test-bootstrap-token-0123456789', displayName: 'Restored owner' }); assert.equal(bootstrap.status, 303);
    const after = await restored.send('/api/purse/state', undefined, bootstrap.cookie); assert.equal(after.status, 200);
    for (const kind of ['emailIntake', 'emailIntakeConfig', 'emailIntakeMailEvent']) assert.deepEqual(after.value.data[kind].sort((a,b) => a.id.localeCompare(b.id)), before[kind].sort((a,b) => a.id.localeCompare(b.id)), 'INTAKE-004 held/draft/completed source and mail evidence survives complete restore');
    assert.deepEqual([...new Set(after.value.data.emailIntake.map(i => i.status))].sort(), ['completed','draft','held']);
    for (const intake of after.value.data.emailIntake) for (const source of [intake.original, ...intake.files]) {
        const downloaded = await restored.send(`/api/purse/email-intake/${intake.id}/files/${source.id}`, undefined, bootstrap.cookie); assert.equal(downloaded.status, 200);
        const retained = await restored.originals.get(source.key), original = await h.originals.get(source.key);
        assert.deepEqual(Buffer.from(await retained.arrayBuffer()), Buffer.from(await original.arrayBuffer()), 'INTAKE-004 restored original remains byte-exact');
    }
    const beforeReceipts = (await send('/api/purse/email-intake-receipts', undefined, owner)).value.receipts;
    const afterReceipts = (await restored.send('/api/purse/email-intake-receipts', undefined, bootstrap.cookie)).value.receipts;
    assert.deepEqual(afterReceipts, beforeReceipts, 'INTAKE-004 durable replay ledger survives restore');

 } finally {for(const close of cleanups.reverse())await close();}
}
}
