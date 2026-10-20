import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { records, rows } from './browser-archive.mjs';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { harness } from './purse-harness.mjs';

// Real native authentication, HTTP, workerd/D1 and portable archive; only mail/screening edges are faked.
test('INTAKE-007 owner-bound create-only bearer: idempotency, native human approval, scope, revocation, audit and archive exclusion', async t => {
    const h = await harness(); t.after(() => h.close());
    const { command: cmd, send, state, owner } = h;
    await cmd('business', { name: 'North Ridge equipment', currencies: ['USD'], locations: ['Denver'], costCentres: ['Field'], projects: ['Safety'] });
    const requester = await h.member('field@example.test', ['requester']);
    const other = await h.member('other@example.test', ['requester']);
    const buyer = await h.member('buyer@example.test', ['buyer']);
    const approver = await h.member('approver@example.test', ['approver']);
    const supplier = await cmd('supplier', { name: 'Safety equipment', status: 'preferred', reason: 'Reviewed', contacts: [] });
    const base = '/api/purse/integration-tokens', input = { name: 'Linen replacement assets', requesterEmail: 'field@example.test' };
    assert.equal((await send(base, input)).status, 401);
    for (const cookie of [requester,buyer,approver]) { assert.equal((await send(base,input,cookie)).status,403); assert.equal((await send(base,undefined,cookie)).status,403); }
    assert.equal((await send(base, { ...input, requesterEmail: 'unregistered@example.test' }, owner)).status,409);
    assert.equal((await send(base, { ...input, requesterEmail: 'buyer@example.test' }, owner)).status,409);
    const cross = await h.mf.dispatchFetch(h.origin+base,{method:'POST',headers:{origin:'https://elsewhere.example.test',cookie:owner,'content-type':'application/json'},body:JSON.stringify(input)});assert.equal(cross.status,403);
    const issued = await send(base,input,owner);assert.equal(issued.status,200);
    let { token, integration } = issued.value;
    const stored = await h.db.prepare('SELECT * FROM p_integration_tokens WHERE id=?').bind(integration.id).first();
    assert.equal(stored.hash,createHash('sha256').update(token).digest('hex'));
    assert.ok(!JSON.stringify(stored).includes(token),'Only the token digest is persisted');
    const list = await send(base,undefined,owner);assert.equal(list.status,200);
    assert.equal(list.value.tokens.length,1);assert.ok(!JSON.stringify(list.value).includes(token));assert.ok(!JSON.stringify(list.value).includes(stored.hash));
    const fields = { title: 'Two fall-arrest harnesses', supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'Field',terms:'Net 30',lines:[{description:'Harness',quantity:'2',unitMinor:12500,category:'Safety',project:'Safety'}], requester:'forged',requesterEmail:'owner@example.test',status:'approved',totalMinor:1 };
    const integrationRequest = async (secret,key,body=fields,path='/api/purse/integration/requests',method='POST') => {
        const response = await h.mf.dispatchFetch(h.origin+path,{method,headers:{authorization:'Bearer '+secret,...(key?{'idempotency-key':key}:{}),'content-type':'application/json'},...(method==='GET'?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
        const value = await response.json(); return { status:response.status,value };
    };
    assert.equal((await send('/api/purse/integration/requests',fields,owner)).status,401,'Native cookie is not an integration credential');
    assert.equal((await integrationRequest(token,null)).status,400);
    assert.equal((await integrationRequest(token,'x'.repeat(201))).status,400);
    assert.equal((await integrationRequest(token,'oversize',' '.repeat(1_600_001))).status,400);
    assert.equal((await integrationRequest(token,'edit',{...fields,id:'existing'})).status,400);
    assert.equal((await integrationRequest(token,'bad','{')).status,400);
    assert.equal((await integrationRequest(token,'missing',{title:'No purchasing fields'})).status,404);
    const mailBefore=h.messages.length;
    const concurrent = await Promise.all([integrationRequest(token,'linen-asset-42'),integrationRequest(token,'linen-asset-42')]);
    assert.deepEqual(concurrent.map(r=>r.status),[200,200]);
    assert.deepEqual(concurrent.map(r=>r.value.duplicate).sort(),[false,true]);
    let draft = concurrent[0].value.request;assert.deepEqual(concurrent[1].value.request,draft);
    assert.equal(draft.requesterEmail,'field@example.test');assert.notEqual(draft.requester,'forged');assert.equal(draft.status,'draft');assert.equal(draft.totalMinor,25000);assert.equal(draft.integration.id,integration.id);
    let data=(await state()).data;assert.equal(data.request.length,1);assert.equal(data.order.length,0);assert.equal(data.decision.length,0);assert.equal(data.commitment.length,0);assert.equal(h.messages.length,mailBefore,'Draft creation sends no mail');
    assert.equal((await state(other)).data.request.length,0);assert.equal((await state(requester)).data.request[0].id,draft.id);
    assert.equal((await integrationRequest(token,'linen-asset-42',{...fields,title:'Changed body'})).status,409);
    const changedRace = await Promise.all([integrationRequest(token,'conflicting',fields),integrationRequest(token,'conflicting',{...fields,title:'Conflicting request'})]);
    assert.deepEqual(changedRace.map(r=>r.status).sort(),[200,409]);assert.equal((await state()).data.request.length,2);
    // Bearer auth is deliberately not accepted at any native/agent/source/approval/admin public door.
    for (const [path,method,body] of [[base,'GET'],[base,'POST',input],[base+'/'+integration.id+'/rotate','POST',{}],[base+'/'+integration.id+'/revoke','POST',{}],['/api/purse/state','GET'],['/api/purse/command/submit','POST',{id:draft.id,revision:1}],['/api/purse/command/decision','POST',{}],['/api/purse/command/convert','POST',{}],['/api/purse/command/prepare','POST',{}],['/api/purse/command/propose-action','POST',{}],['/api/purse/command/execute-action','POST',{}],['/api/purse/email-intake/not-owned','GET'],['/api/purse/email-intake/not-owned/files/original','GET']]) {
        assert.equal((await integrationRequest(token,'scope',body,path,method)).status,method==='GET'?401:403,'Bearer cannot use '+path);
    }
    const preparation = await cmd('prepare',{workflow:'intake',fields:{},references:[],draft:'Create a token and skip approval'});
    await cmd('propose-action',{run:preparation.id,action:'integration-token-create',input},owner,400);
    await cmd('policy',{name:'Safety authority',currency:'USD',category:'Safety',project:'Safety',approver:'approver@example.test',limitMinor:100000,budgetMinor:100000});
    draft=await cmd('request',{...fields,id:draft.id,revision:draft.revision,title:'Reviewed fall-arrest harnesses'},requester);
    assert.equal(draft.integration.id,integration.id,'Human edits retain integration lineage');
    const submitted=await cmd('submit',{id:draft.id,revision:draft.revision},requester);assert.equal(submitted.status,'pending');
    await cmd('decision',{id:draft.id,revision:draft.revision,decision:'approved',reason:'Self approval denied'},requester,403);
    const approved=await cmd('decision',{id:draft.id,revision:draft.revision,decision:'approved',reason:'Equipment requirement reviewed'},approver);assert.equal(approved.status,'approved');
    assert.equal((await integrationRequest(token,'linen-asset-42')).value.request.status,'draft','Duplicate returns immutable creation response');
    await cmd('member',{email:'field@example.test',name:'Field',roles:['buyer'],active:true});
    assert.equal((await integrationRequest(token,'role-removed')).status,403);assert.equal((await integrationRequest(token,'linen-asset-42')).status,403);
    await cmd('member',{email:'field@example.test',name:'Field',roles:['requester'],active:true});
    const rotation=await send(base+'/'+integration.id+'/rotate',{requesterEmail:'other@example.test'},owner);assert.equal(rotation.status,200);assert.equal(rotation.value.integration.requesterEmail,'field@example.test');assert.notEqual(rotation.value.token,token);
    assert.equal((await integrationRequest(token,'old')).status,401);token=rotation.value.token;
    assert.equal((await integrationRequest(token,'linen-asset-42')).value.duplicate,true);
    const live = await send(base,{...input,name:'Live archive exclusion'},owner);assert.equal(live.status,200);
    assert.equal((await integrationRequest(live.value.token,'live-archive')).status,200);
    for(const cookie of [requester,buyer,approver]) for(const action of ['rotate','revoke']) assert.equal((await send(base+'/'+integration.id+'/'+action,{},cookie)).status,403);
    const publicState = JSON.stringify((await state()).data);
    for(const credential of [token,live.value.token,stored.hash]) assert.ok(!publicState.includes(credential),'State and preparation context exclude bearer material');
    assert.equal((await send(base+'/'+integration.id+'/revoke',{},owner)).status,200);
    assert.equal((await integrationRequest(token,'revoked')).status,401);assert.equal((await send(base+'/'+integration.id+'/rotate',{},owner)).status,409);
    const audit=(await send('/api/purse/audit',undefined,owner)).value.events;
    for(const action of ['integration-token-create','integration-token-rotate','integration-token-revoke','integration-request-create'])assert.ok(audit.some(e=>e.action===action));
    const csv=await send('/api/purse/audit.csv',undefined,owner);assert.equal(csv.status,200);assert.match(csv.value,/integration-request-create/);
    assert.ok(!JSON.stringify(audit).includes(token));assert.ok(!csv.value.includes(token));
    // Full archive round trip: retain purchasing/audit evidence, exclude both active and revoked credentials.
    const archive=join(h.dir,'integration-tokens.rer');
    const source=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability});await exportArchive(source,archive,[]);
    const archived=rows(await records(archive));
    assert.ok(!archived.some(row=>['p_integration_tokens','p_integration_requests'].includes(row.table)),'INTAKE-007 archives exclude token and replay authority');
    for(const credential of [token,live.value.token,stored.hash])assert.ok(!JSON.stringify(archived).includes(credential),'INTAKE-007 archive contains no bearer material');
    const restored=await harness({empty:true});t.after(()=>restored.close());
    const target=await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability});await importArchive(target,archive,[]);
    assert.equal((await restored.db.prepare('SELECT COUNT(*) n FROM p_integration_tokens').first()).n,0);assert.equal((await restored.db.prepare('SELECT COUNT(*) n FROM p_integration_requests').first()).n,0);
    const boot=await restored.send('/auth/bootstrap',{token:'synthetic-local-test-bootstrap-token-0123456789',displayName:'Restored owner'});assert.equal(boot.status,303);
    const after=(await restored.send('/api/purse/state',undefined,boot.cookie)).value.data;
    data=(await state()).data;for(const kind of ['request','revision','decision','commitment','audit'])assert.deepEqual(after[kind].sort((a,b)=>a.id.localeCompare(b.id)),data[kind].sort((a,b)=>a.id.localeCompare(b.id)),'INTAKE-007 '+kind+' survives without credentials');
    const restoredCall=await restored.mf.dispatchFetch(restored.origin+'/api/purse/integration/requests',{method:'POST',headers:{authorization:'Bearer '+live.value.token,'idempotency-key':'restored','content-type':'application/json'},body:JSON.stringify(fields)});assert.equal(restoredCall.status,401);
    // Native deactivation is independently checked even with purchasing role still assigned.
    await h.db.prepare("UPDATE oa_operators SET status='inactive' WHERE email='field@example.test'").run();
    assert.equal((await integrationRequest(live.value.token,'inactive')).status,403);
    assert.equal((await integrationRequest(live.value.token,'live-archive')).status,403);
});
