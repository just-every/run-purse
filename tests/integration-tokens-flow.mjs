
import assert from 'node:assert/strict';
import { createDecipheriv, createHash, pbkdf2Sync } from 'node:crypto';
import { join } from 'node:path';
import { records, rows } from './browser-archive.mjs';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { harness } from './purse-harness.mjs';

// Real native authentication, HTTP, workerd/D1 and portable archive; only mail/screening edges are faked.

// Locket's server caller uses the public PO-data door, with no Purse native session.

export async function integration_tokensFlow(){
{
 // INTAKE-007 owner-bound create-only bearer: idempotency, native human approval, scope, show-once lifecycle, audit and archive exclusion
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
    const h = await harness(); t.after(() => h.close());
    const { command: cmd, state, owner } = h;
    const refusalCount = async () => (await h.db.prepare("SELECT COUNT(*) n FROM p_records WHERE kind='audit' AND json_extract(value,'$.action')='integration-use-refused'").first()).n;
    const send = async (...args) => {
        const before=await refusalCount(), response=await h.send(...args);
        if(response.status>=400 && (args[0].startsWith('/api/purse/integration-tokens') || args[0]==='/api/purse/integration/requests'))assert.equal(await refusalCount(),before+1,'INTAKE-007 every refused native management/intake attempt is audited');
        return response;
    };
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
    assert.equal((await send(base, { ...input, requesterEmail: 'approver@example.test' }, owner)).status,409);
    const cross = await h.mf.dispatchFetch(h.origin+base,{method:'POST',headers:{origin:'https://elsewhere.example.test',cookie:owner,'content-type':'application/json'},body:JSON.stringify(input)});assert.equal(cross.status,403);assert.ok(await refusalCount()>0);
    const issued = await send(base,input,owner);assert.equal(issued.status,200);
    let { token, integration } = issued.value;
    const credentials = [token];
    const noSecrets = value => {
        const content = typeof value === 'string' ? value : JSON.stringify(value);
        for (const credential of credentials) assert.ok(!content.includes(credential), 'Connector credentials and digests never appear outside issuance');
    };
    assert.equal(issued.headers.get('cache-control'),'no-store');
    const stored = await h.db.prepare('SELECT * FROM p_integration_tokens WHERE id=?').bind(integration.id).first();
    assert.equal(stored.hash,createHash('sha256').update(token).digest('hex'));
    credentials.push(stored.hash);
    assert.ok(!JSON.stringify(stored).includes(token),'Only the token digest is persisted');
    const list = await send(base,undefined,owner);assert.equal(list.status,200);
    assert.equal(list.value.tokens.length,1);assert.ok(!JSON.stringify(list.value).includes(token));assert.ok(!JSON.stringify(list.value).includes(stored.hash));
    noSecrets(issued.value.integration);noSecrets(list.value);
    // Neither an owner nor another principal has a secret read-back door.
    assert.equal((await send(base+'/'+integration.id,undefined,owner)).status,404);
    for (const action of ['show','reveal']) {
        const refused = await send(base+'/'+integration.id+'/'+action,{secret:token},owner);
        assert.equal(refused.status,404);noSecrets(refused.value);
    }
    const fields = { title: 'Two fall-arrest harnesses', supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'Field',terms:'Net 30',lines:[{description:'Harness',quantity:'2',unitMinor:12500,category:'Safety',project:'Safety'}], requester:'forged',requesterEmail:'owner@example.test',status:'approved',totalMinor:1 };
    const integrationRequest = async (secret,key,body=fields,path='/api/purse/integration/requests',method='POST') => {
        const before=await refusalCount();
        const response = await h.mf.dispatchFetch(h.origin+path,{method,headers:{authorization:'Bearer '+secret,...(key?{'idempotency-key':key}:{}),'content-type':'application/json'},...(method==='GET'?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
        const value = await response.json();
        if(response.status>=400)assert.equal(await refusalCount(),before+1,'INTAKE-007 every refused bearer use is audited');
        return { status:response.status,value };
    };
    assert.equal((await send('/api/purse/integration/requests',fields,owner)).status,401,'Native cookie is not an integration credential');
    assert.equal((await integrationRequest('invalid-bearer','invalid')).status,401);
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
    assert.equal(draft.requesterEmail,'field@example.test');assert.notEqual(draft.requester,'forged');assert.equal(draft.status,'draft');assert.equal(draft.totalMinor,25000);assert.equal(draft.integration.id,integration.id);assert.equal(draft.integration.name,input.name);assert.equal(draft.integration.requester,draft.requester);assert.equal(draft.integration.requesterEmail,draft.requesterEmail);
    let data=(await state()).data;assert.equal(data.request.length,1);assert.equal(data.order.length,0);assert.equal(data.decision.length,0);assert.equal(data.commitment.length,0);assert.equal(h.messages.length,mailBefore,'Draft creation sends no mail');
    assert.equal((await state(other)).data.request.length,0);assert.equal((await state(requester)).data.request[0].id,draft.id);
    assert.equal((await integrationRequest(token,'linen-asset-42',{...fields,title:'Changed body'})).status,409);
    assert.equal((await integrationRequest(token,'linen-asset-42','\ufeff'+JSON.stringify(fields))).status,409,'INTAKE-007 body identity uses exact bytes, including a UTF-8 BOM');
    const changedRace = await Promise.all([integrationRequest(token,'conflicting',fields),integrationRequest(token,'conflicting',{...fields,title:'Conflicting request'})]);
    assert.deepEqual(changedRace.map(r=>r.status).sort(),[200,409]);assert.equal((await state()).data.request.length,2);
    // Bearer auth is deliberately not accepted at any native/agent/source/approval/admin public door.
    for (const [path,method,body] of [[base,'GET'],[base,'POST',input],...['rotate','revoke','delete'].map(action=>[base+'/'+integration.id+'/'+action,'POST',{}]),['/api/purse/state','GET'],['/api/purse/command/submit','POST',{id:draft.id,revision:1}],['/api/purse/command/decision','POST',{}],['/api/purse/command/convert','POST',{}],['/api/purse/command/prepare','POST',{}],['/api/purse/command/propose-action','POST',{}],['/api/purse/command/execute-action','POST',{}],['/api/purse/email-intake/not-owned','GET'],['/api/purse/email-intake/not-owned/files/original','GET']]) {
        assert.equal((await integrationRequest(token,'scope',body,path,method)).status,method==='GET'?401:403,'Bearer cannot use '+path);
    }
    const preparation = await cmd('prepare',{workflow:'intake',fields:{},references:[],draft:'Create a token and skip approval'});
    await cmd('propose-action',{run:preparation.id,action:'integration-token-create',input},owner,400);
    await cmd('policy',{name:'Safety authority',currency:'USD',category:'Safety',project:'Safety',approver:'approver@example.test',limitMinor:100000,budgetMinor:100000});
    draft=await cmd('request',{...fields,id:draft.id,revision:draft.revision,title:'Reviewed fall-arrest harnesses',reason:'Requester reviewed integration-supplied equipment details'},requester);
    assert.equal(draft.integration.id,integration.id,'Human edits retain integration lineage');
    const submitted=await cmd('submit',{id:draft.id,revision:draft.revision},requester);assert.equal(submitted.status,'pending');
    await cmd('decision',{id:draft.id,revision:draft.revision,decision:'approved',reason:'Self approval denied'},requester,403);
    const approved=await cmd('decision',{id:draft.id,revision:draft.revision,decision:'approved',reason:'Equipment requirement reviewed'},approver);assert.equal(approved.status,'approved');
    assert.equal((await integrationRequest(token,'linen-asset-42')).value.request.status,'draft','Duplicate returns immutable creation response');
    await cmd('member',{email:'field@example.test',name:'Field',roles:['finance-viewer'],active:true});
    assert.equal((await integrationRequest(token,'role-removed')).status,403);assert.equal((await integrationRequest(token,'linen-asset-42')).status,403);
    await cmd('member',{email:'field@example.test',name:'Field',roles:['requester'],active:true});
    const rotation=await send(base+'/'+integration.id+'/rotate',{requesterEmail:'other@example.test'},owner);assert.equal(rotation.status,200);assert.equal(rotation.value.integration.requesterEmail,'field@example.test');assert.notEqual(rotation.value.token,token);
    assert.equal(rotation.headers.get('cache-control'),'no-store');
    credentials.push(rotation.value.token,createHash('sha256').update(rotation.value.token).digest('hex'));
    noSecrets(rotation.value.integration);noSecrets((await send(base,undefined,owner)).value);
    assert.equal((await integrationRequest(token,'old')).status,401);token=rotation.value.token;
    assert.equal((await integrationRequest(token,'linen-asset-42')).value.duplicate,true);
    const live = await send(base,{...input,name:'Live archive exclusion'},owner);assert.equal(live.status,200);
    credentials.push(live.value.token,createHash('sha256').update(live.value.token).digest('hex'));
    assert.equal((await integrationRequest(live.value.token,'live-archive')).status,200);
    for(const cookie of [requester,buyer,approver]) for(const action of ['rotate','revoke','delete']) {
        const refused=await send(base+'/'+integration.id+'/'+action,{secret:token},cookie);
        assert.equal(refused.status,403);noSecrets(refused.value);
    }
    for (const action of ['rotate','revoke','delete']) {
        assert.equal((await send(base+'/'+integration.id+'/'+action,{})).status,401);
        const before=await refusalCount();
        const refused=await h.mf.dispatchFetch(h.origin+base+'/'+integration.id+'/'+action,{method:'POST',headers:{origin:'https://elsewhere.example.test',cookie:owner,'content-type':'application/json'},body:JSON.stringify({secret:token})});
        assert.equal(refused.status,403);noSecrets(await refused.text());assert.equal(await refusalCount(),before+1);
    }
    const publicState = JSON.stringify((await state()).data);
    for(const credential of [token,live.value.token,stored.hash]) assert.ok(!publicState.includes(credential),'State and preparation context exclude bearer material');
    const revoked=await send(base+'/'+integration.id+'/revoke',{},owner);assert.equal(revoked.status,200);noSecrets(revoked.value);
    assert.equal((await integrationRequest(token,'revoked')).status,401);assert.equal((await send(base+'/'+integration.id+'/rotate',{},owner)).status,409);
    noSecrets((await send(base,undefined,owner)).value);
    const audit=(await send('/api/purse/audit',undefined,owner)).value.events;
    const refusals=audit.filter(e=>e.action==='integration-use-refused');assert.equal(refusals.length,await refusalCount());
    assert.ok(refusals.every(e=>e.reason && e.status>=400 && e.door));
    assert.ok(refusals.some(e=>e.integration===integration.id && e.name===input.name && e.requester===draft.requester));
    assert.ok(refusals.some(e=>e.integration===null && e.actor==='integration:unidentified'));
    assert.ok(refusals.some(e=>e.door==='outside-token-scope'));
    for(const action of ['integration-token-create','integration-token-rotate','integration-token-revoke','integration-request-create'])assert.ok(audit.some(e=>e.action===action));
    const csv=await send('/api/purse/audit.csv',undefined,owner);assert.equal(csv.status,200);assert.match(csv.value,/integration-request-create/);
    assert.ok(!JSON.stringify(audit).includes(token));assert.ok(!csv.value.includes(token));
    for(const output of [audit,csv.value,(await state()).data,h.messages])noSecrets(output);
    // Full archive round trip: retain purchasing/audit evidence, exclude both active and revoked credentials.
    const archive=join(h.dir,'integration-tokens.rer');
    const source=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability});await exportArchive(source,archive,[]);
    const archived=rows(await records(archive));
    assert.ok(!archived.some(row=>['p_integration_tokens','p_integration_requests'].includes(row.table)),'INTAKE-007 archives exclude token and replay authority');
    for(const credential of [token,live.value.token,stored.hash])assert.ok(!JSON.stringify(archived).includes(credential),'INTAKE-007 archive contains no bearer material');
    noSecrets(archived);
    const restored=await harness({empty:true});t.after(()=>restored.close());
    const target=await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability});await importArchive(target,archive,[]);
    assert.equal((await restored.db.prepare('SELECT COUNT(*) n FROM p_integration_tokens').first()).n,0);assert.equal((await restored.db.prepare('SELECT COUNT(*) n FROM p_integration_requests').first()).n,0);
    const boot=await restored.send('/auth/bootstrap',{token:'synthetic-local-test-bootstrap-token-0123456789',displayName:'Restored owner'});assert.equal(boot.status,303);
    const after=(await restored.send('/api/purse/state',undefined,boot.cookie)).value.data;
    data=(await state()).data;for(const kind of ['request','revision','decision','commitment','audit'])assert.deepEqual(after[kind].sort((a,b)=>a.id.localeCompare(b.id)),data[kind].sort((a,b)=>a.id.localeCompare(b.id)),'INTAKE-007 '+kind+' survives without credentials');
    const restoredCall=await restored.mf.dispatchFetch(restored.origin+'/api/purse/integration/requests',{method:'POST',headers:{authorization:'Bearer '+live.value.token,'idempotency-key':'restored','content-type':'application/json'},body:JSON.stringify(fields)});assert.equal(restoredCall.status,401);
    const purchasingBeforeDelete=(await state()).data;
    const removed=await send(base+'/'+integration.id+'/delete',{},owner);assert.equal(removed.status,200);assert.equal(removed.value.deleted,true);noSecrets(removed.value);
    assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM p_integration_tokens WHERE id=?').bind(integration.id).first()).n,0);
    assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM p_integration_requests WHERE integration=?').bind(integration.id).first()).n,0);
    assert.ok(!(await send(base,undefined,owner)).value.tokens.some(row=>row.id===integration.id));
    assert.equal((await integrationRequest(token,'linen-asset-42')).status,401,'Deletion removes replay authority');
    for(const action of ['rotate','revoke','delete'])assert.equal((await send(base+'/'+integration.id+'/'+action,{},owner)).status,409);
    const purchasingAfterDelete=(await state()).data;
    for(const kind of ['request','revision','decision','commitment'])assert.deepEqual(purchasingAfterDelete[kind],purchasingBeforeDelete[kind],'Deletion retains '+kind);
    const deletionAudit=(await send('/api/purse/audit',undefined,owner)).value.events;
    const creation=deletionAudit.find(e=>e.action==='integration-token-create'&&e.record===integration.id);
    assert.ok(deletionAudit.some(e=>e.action==='integration-token-delete'&&e.record===integration.id&&e.actor===creation.actor&&e.email==='owner@example.test'));
    const deletionCsv=await send('/api/purse/audit.csv',undefined,owner);assert.equal(deletionCsv.status,200);assert.match(deletionCsv.value,/integration-token-delete/);
    noSecrets(deletionAudit);noSecrets(deletionCsv.value);
    // Native deactivation is independently checked even with purchasing role still assigned.
    assert.equal((await send('/auth/operator/status',{operatorId:draft.requester,status:'inactive'},owner)).status,200);
    assert.equal((await integrationRequest(live.value.token,'inactive')).status,403);
    assert.equal((await integrationRequest(live.value.token,'live-archive')).status,403);
    assert.equal((await send('/auth/operator/status',{operatorId:draft.requester,status:'active'},owner)).status,200);
    assert.equal((await integrationRequest(live.value.token,'live-archive')).status,200);
    const removedLive=await send(base+'/'+live.value.integration.id+'/delete',{},owner);assert.equal(removedLive.status,200);noSecrets(removedLive.value);
    assert.equal((await integrationRequest(live.value.token,'live-archive')).status,401,'An active credential cannot survive deletion');
    assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM p_integration_requests WHERE integration=?').bind(live.value.integration.id).first()).n,0);
    assert.deepEqual((await send(base,undefined,owner)).value.tokens,[]);
    const current=await send(base,{name:'synthetic-purse-1',requesterEmail:'owner@example.test'},owner);assert.equal(current.status,200);
    credentials.push(current.value.token,createHash('sha256').update(current.value.token).digest('hex'));
    assert.equal((await send('/auth/signout',{},owner)).status,204);
    for(const action of ['rotate','revoke','delete']) {
        const refused=await send(base+'/'+current.value.integration.id+'/'+action,{secret:current.value.token},owner);
        assert.equal(refused.status,401);noSecrets(refused.value);
    }
    assert.ok(await h.db.prepare('SELECT id FROM p_integration_tokens WHERE id=?').bind(current.value.integration.id).first(),'Revoked native session cannot mutate a credential');
    noSecrets((await h.db.prepare("SELECT value FROM p_records WHERE kind='audit'").all()).results);

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // SECURITY-001 explicit encrypted include restores protected fields and matching atomically without installation keys or reveal grants
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
    const sourceKey=Buffer.from('synthetic-purse-2'.padEnd(32,'.')).toString('hex'), targetKey=Buffer.from('synthetic-purse-3'.padEnd(32,'.')).toString('hex');
    const h=await harness({protectedKey:sourceKey});t.after(()=>h.close());
    await h.command('business',{name:'synthetic-purse-4',currencies:['USD'],locations:['synthetic-purse-5'],costCentres:['synthetic-purse-6'],projects:['synthetic-purse-7']});
    const buyer=await h.member('synthetic-purse-8@example.test',['buyer']);
    const supplier=await h.command('supplier',{name:'synthetic-purse-9',status:'active',reason:'synthetic-purse-10'});
    const values={tin:'111223333',bankRouting:'999887777',bankAccount:'444455556666'};
    const revision=async runtime=>(await runtime.send('/api/purse/protected-keys',undefined,runtime.owner)).value.revision;
    const input=async(runtime,extra={})=>({revision:await revision(runtime),passphrase:'synthetic-purse-11',reason:'synthetic-purse-12',evidence:'synthetic-purse-13',include:'protected-values-and-matching',...extra});
    const reauthenticate=async runtime=>{
        assert.equal((await runtime.send('/auth/step-up',{action:'export'},runtime.owner)).status,202);
        const mail=[...runtime.messages].reverse().find(message=>message.to.includes('owner@example.test'));
        const token=new URL(mail.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');
        assert.equal((await runtime.send('/auth/confirm',{token},runtime.owner)).status,303);
    };
    assert.equal((await h.send('/api/purse/supplier-protected/'+supplier.id+'/store',{revision:await revision(h),values,reason:'synthetic-purse-14',evidence:'synthetic-purse-15'},h.owner)).status,200);
    const issued=await h.send('/api/purse/integration-tokens',{name:'synthetic-purse-21',requesterEmail:'owner@example.test'},h.owner);assert.equal(issued.status,200);
    const path='/api/purse/protected-archive/';
    assert.equal((await h.send(path+'export',await input(h))).status,401);
    assert.equal((await h.send(path+'export',await input(h),buyer)).status,403);
    assert.equal((await h.send(path+'export',await input(h),h.owner)).status,403,'An ordinary native owner session carries no export reauthentication');
    await reauthenticate(h);
    assert.equal((await h.send(path+'export',await input(h,{include:''}),h.owner)).status,400);
    const exported=await h.send(path+'export',await input(h),h.owner);assert.equal(exported.status,200);assert.equal(exported.headers.get('cache-control'),'no-store');
    const archive=exported.value.archive, matchingKey=(await h.db.prepare("SELECT value FROM p_records WHERE kind='supplierMatchingKey'").first()).value;
    const privateValues=[sourceKey,JSON.parse(matchingKey).secret,'synthetic-purse-11',issued.value.token,createHash('sha256').update(issued.value.token).digest('hex'),...Object.values(values)];
    for(const secret of privateValues)assert.ok(!JSON.stringify(exported.value).includes(secret),'The supplement response contains only passphrase-encrypted data and counts');
    // An independent client can open the downloaded file; even its authenticated
    // plaintext excludes installation keys, connector credentials and reveal authority.
    const ciphertext=Buffer.from(archive.ciphertext,'base64'), decipher=createDecipheriv('aes-256-gcm',pbkdf2Sync('synthetic-purse-11',Buffer.from(archive.salt,'base64'),600000,32,'sha256'),Buffer.from(archive.iv,'base64'));
    decipher.setAAD(Buffer.from(archive.format));decipher.setAuthTag(ciphertext.subarray(-16));
    const plaintext=JSON.parse(Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]).toString());
    for(const secret of [sourceKey,issued.value.token,createHash('sha256').update(issued.value.token).digest('hex'),'synthetic-purse-11'])assert.ok(!JSON.stringify(plaintext).includes(secret),'Even the decrypted include excludes installation and connector secrets');
    assert.ok(!['session','grants','proof','reauthentication','tokens'].some(field=>Object.hasOwn(plaintext,field)));
    const ordinary=join(h.dir,'synthetic-purse-16.rer');
    await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),ordinary,[]);
    const archiveRows=rows(await records(ordinary));
    for(const secret of privateValues)assert.ok(!JSON.stringify(archiveRows).includes(secret),'The ordinary archive excludes all protected material');
    const target=await harness({empty:true,protectedKey:targetKey});t.after(()=>target.close());
    await importArchive(await createPortability({db:target.db,buckets:{ORIGINALS:target.originals},policy:portability}),ordinary,[]);
    const boot=await target.send('/auth/bootstrap',{token:'synthetic-local-test-bootstrap-token-0123456789',displayName:'synthetic-purse-17'});assert.equal(boot.status,303);target.owner=boot.cookie;
    const snapshot=async()=>({domain:(await target.db.prepare("SELECT kind,id,value FROM p_records WHERE kind<>'audit' ORDER BY kind,id").all()).results,protected:(await target.db.prepare('SELECT * FROM p_supplier_protected ORDER BY supplier,field').all()).results});
    const before=await snapshot();
    assert.equal((await target.send(path+'restore',await input(target,{archive}),target.owner)).status,403,'The include never restores native proof');
    await reauthenticate(target);
    const wrong=await target.send(path+'restore',await input(target,{archive,passphrase:'synthetic-purse-18'}),target.owner);assert.equal(wrong.status,400);
    assert.ok(JSON.stringify(await snapshot())===JSON.stringify(before),'Wrong passphrase changes no values, matching or ordinary domain rows');
    for(const secret of privateValues)assert.ok(!JSON.stringify(wrong.value).includes(secret));
    const changed={...archive,ciphertext:(archive.ciphertext[0]==='A'?'B':'A')+archive.ciphertext.slice(1)};
    assert.equal((await target.send(path+'restore',await input(target,{archive:changed}),target.owner)).status,400);
    assert.ok(JSON.stringify(await snapshot())===JSON.stringify(before),'Authenticated-encryption failure changes no domain rows');
    const stale=await input(target,{archive});await target.send(path+'restore',await input(target,{archive,passphrase:'synthetic-purse-18'}),target.owner);
    assert.equal((await target.send(path+'restore',stale,target.owner)).status,409);
    const restored=await target.send(path+'restore',await input(target,{archive}),target.owner);assert.equal(restored.status,200,JSON.stringify(restored.value));assert.equal(restored.value.restored,3);assert.equal(restored.headers.get('cache-control'),'no-store');
    assert.equal((await target.db.prepare('SELECT COUNT(*) n FROM p_integration_tokens').first()).n,0,'The explicit include never restores connector authority');
    const stored=(await target.db.prepare('SELECT * FROM p_supplier_protected').all()).results;
    assert.ok(stored.every(row=>row.key_id===createHash('sha256').update(Buffer.from(targetKey,'hex')).digest('hex')),'The destination encrypts with its own installation key');
    assert.ok((await target.db.prepare("SELECT value FROM p_records WHERE kind='supplierMatchingKey'").first()).value===matchingKey,'Matching root is preserved inside the explicit include');
    assert.equal((await target.send(path+'restore',await input(target,{archive}),target.owner)).status,409,'A supplement cannot overwrite existing protected data');
    const matches=await target.send('/api/purse/command/supplier-duplicates',{name:'synthetic-purse-19',matching:values},target.owner);assert.equal(matches.status,200);assert.ok(matches.value.matches.some(match=>match.id===supplier.id&&match.reasons.includes('TIN (matching-only)')&&match.reasons.includes('bank account (matching-only)')));
    for(const [field,value] of Object.entries(values)){
        const reveal=await target.send('/api/purse/supplier-protected/'+supplier.id+'/reveal',{revision:await revision(target),field,reason:'synthetic-purse-20'},target.owner);
        assert.equal(reveal.status,200);assert.ok(reveal.value.value===value,'Owner reveals the exact restored field using fresh destination proof');
    }
    const audit=(await target.send('/api/purse/audit',undefined,target.owner)).value.events;
    assert.ok(audit.some(event=>event.action==='protected-archive-export'));assert.ok(audit.some(event=>event.action==='protected-archive-restore'));assert.ok(audit.some(event=>event.action==='protected-refused'&&event.operation==='archive-restore'));
    for(const secret of privateValues)assert.ok(!JSON.stringify(audit).includes(secret),'Audit retains neither passphrases, keys nor values');

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // Owner-scoped Locket PO reads expose only mapped financial data; lifecycle, audit, rate and create-only boundaries hold
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
    const h=await harness();t.after(()=>h.close());const cmd=h.command;
    await cmd('business',{name:'North Ridge field operations',currencies:['USD'],locations:['Denver'],costCentres:['Field'],projects:['Safety']});
    const requester=await h.member('synthetic-purse-801@example.test',['requester']), approver=await h.member('synthetic-purse-802@example.test',['approver']);
    const supplier=await cmd('supplier',{name:'Canyon equipment',status:'preferred',reason:'Reviewed'}),outside=await cmd('supplier',{name:'River tools',status:'preferred',reason:'Reviewed'});
    await cmd('policy',{name:'Equipment',currency:'USD',category:'Safety',project:'Safety',approver:'synthetic-purse-802@example.test',limitMinor:100000,budgetMinor:1000000});
    const orders=[];
    for(const vendor of [supplier,outside]) {
        const r=await cmd('request',{title:'Safety harnesses',supplier:vendor.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'Field',terms:'Net 30',poDetails:{notes:'Private internal comments'},lines:[{description:'Field harness',quantity:'2',unitMinor:12500,category:'Safety',project:'Safety'}]},requester);
        await cmd('submit',{id:r.id,revision:1},requester);await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Reviewed exact purchase'},approver);
        const order=await cmd('convert',{id:r.id,revision:1});await cmd('issue',{id:order.id,revision:1,reason:'Issued in existing channel'});orders.push(order);
    }
    const bill=await cmd('invoice',{order:orders[0].id,reference:'INV-FIELD-801',source:'Private supplier original',senderEmail:'private@example.test',allocations:[{line:orders[0].lines[0].id,quantity:'2',amountMinor:25000}]});
    const base='/api/purse/integration-tokens', input={name:'Locket AGENT-001',scope:'read-purchase-orders',suppliers:[supplier.id]};
    for(const cookie of ['',requester,approver])assert.equal((await h.send(base,input,cookie)).status,cookie?403:401);
    for(const bad of [{suppliers:[]},{suppliers:['unmapped']},{expiresDays:31},{expiresDays:0},{scope:'all'}])assert.equal((await h.send(base,{...input,...bad},h.owner)).status,400);
    const issued=await h.send(base,input,h.owner);assert.equal(issued.status,200);const {token,integration}=issued.value;
    assert.ok(Date.parse(integration.expiresAt)>Date.now()+6*86400000 && Date.parse(integration.expiresAt)<=Date.now()+7*86400000);
    const row=await h.db.prepare('SELECT * FROM p_integration_tokens WHERE id=?').bind(integration.id).first();
    assert.equal(row.hash,createHash('sha256').update(token).digest('hex'));assert.ok(!JSON.stringify(row).includes(token));
    const read=async(id=orders[0].id,secret=token,path)=>{
        const r=await h.mf.dispatchFetch(h.origin+(path??'/api/purse/integration/orders/'+id),{headers:{authorization:'Bearer '+secret}});
        return {status:r.status,value:await r.json(),cache:r.headers.get('cache-control')};
    };
    const result=await read();assert.equal(result.status,200);assert.equal(result.cache,'no-store');
    assert.equal(result.value.order.number,orders[0].number);assert.equal(result.value.order.totalMinor,25000);assert.equal(result.value.order.status,'issued');
    assert.deepEqual(result.value.order.lines.map(l=>[l.description,l.quantity,l.unitMinor,l.amountMinor]),[['Field harness','2',12500,25000]]);
    assert.deepEqual(result.value.order.bills.map(b=>[b.id,b.reference,b.totalMinor,b.status,b.paymentStatus]),[[bill.id,'INV-FIELD-801',25000,'captured','unknown']]);
    assert.match(result.value.order.bills[0].paymentStatusReason,/not built/);
    for(const prohibited of ['request','policy','approvalActor','supplierSnapshot','documentProfile','poDetails','issuedBy','terms'])assert.ok(!(prohibited in result.value.order));
    for(const prohibited of ['source','document','evidence','senderEmail','allocations','actor','remitTo'])assert.ok(!(prohibited in result.value.order.bills[0]));
    for(const privateValue of ['Private internal comments','Private supplier original','private@example.test',token,row.hash,requester,approver])assert.ok(!JSON.stringify(result.value).includes(privateValue));
    assert.equal((await read(orders[1].id)).status,404);assert.equal((await read('missing')).status,404);
    assert.equal((await read('',token,'/api/purse/state')).status,401);
    assert.equal((await read('',token,'/api/purse/order-pdf/'+orders[0].id)).status,401);
    const create=await h.send(base,{name:'Linen draft intake',requesterEmail:'synthetic-purse-801@example.test'},h.owner);assert.equal(create.status,200);
    assert.equal((await read(orders[0].id,create.value.token)).status,403,'Create-draft token still cannot read');
    const forbidden=await h.mf.dispatchFetch(h.origin+'/api/purse/integration/requests',{method:'POST',headers:{authorization:'Bearer '+token,'idempotency-key':'synthetic-purse-803','content-type':'application/json'},body:'{}'});assert.equal(forbidden.status,403,'PO read token cannot create a draft');
    const rotated=await h.send(base+'/'+integration.id+'/rotate',{},h.owner);assert.equal(rotated.status,200);assert.equal(rotated.value.integration.expiresAt,integration.expiresAt);assert.deepEqual(rotated.value.integration.suppliers,[supplier.id]);
    assert.equal((await read()).status,401);const replacement=rotated.value.token;assert.equal((await read(orders[0].id,replacement)).status,200);
    let limited=false;
    for(let i=0;i<200;i++){const r=await read(orders[0].id,replacement);if(r.status===429){limited=true;break;}assert.equal(r.status,200);}
    assert.ok(limited,'A finite durable per-token limit refuses excess reads');
    await h.send(base+'/'+integration.id+'/revoke',{},h.owner);assert.equal((await read(orders[0].id,replacement)).status,401);
    const expiring=await h.send(base,{...input,expiresDays:30},h.owner);assert.equal(expiring.status,200);
    await h.db.prepare('UPDATE p_integration_tokens SET expires_at=? WHERE id=?').bind(new Date(Date.now()-1).toISOString(),expiring.value.integration.id).run();
    assert.equal((await read(orders[0].id,expiring.value.token)).status,401);
    const list=(await h.send(base,undefined,h.owner)).value, audit=(await h.send('/api/purse/audit',undefined,h.owner)).value.events,csv=(await h.send('/api/purse/audit.csv',undefined,h.owner)).value;
    const reads=audit.filter(e=>e.action==='integration-po-read'&&e.integration===integration.id);assert.ok(reads.length>1);assert.ok(reads.every(e=>e.record===orders[0].id&&e.actor==='integration:'+integration.id&&e.status===200));
    const refused=audit.filter(e=>e.action==='integration-use-refused'&&e.integration===integration.id);for(const status of [404,429,401])assert.ok(refused.some(e=>e.status===status),'Recognized refusal '+status+' is logged');
    assert.ok(audit.some(e=>e.integration===create.value.integration.id&&e.status===403));assert.match(csv,/integration-po-read/);assert.match(csv,/integration-use-refused/);
    for(const output of [list,audit,csv,(await h.state()).data])for(const secret of [token,replacement,row.hash,expiring.value.token])assert.ok(!JSON.stringify(output).includes(secret));

 } finally {for(const close of cleanups.reverse())await close();}
}
}
