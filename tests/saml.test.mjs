import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createPortability} from '@runeditrun/rer/modules/portability';
import {exportArchive,importArchive} from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import {records,rows} from './browser-archive.mjs';
import {harness} from './purse-harness.mjs';
import {samlFixture,email} from './saml-fixture.mjs';

test('Signed SAML native admission rejects forged identities and replay; disable, SCIM handoff and restore retain current authority',async t=>{
 const h=await samlFixture();t.after(()=>h.close());const {token,person,manager,scope}=await h.prepare();
 const base='/auth/saml/saml-company';
 assert.equal((await h.request(base+'/metadata')).status,200);
 await h.settings('enable',h.owner,403,{origin:'https://synthetic-purse-cross.invalid'});
 const disabled=await h.request(base+'/start',{body:'',headers:{'content-type':'application/x-www-form-urlencoded'}});assert.equal(disabled.status,403);
 await h.settings('enable');
 const page=(await h.send('/auth/purse/identity',undefined,h.owner)).value;assert.ok(page.includes('SAML 2.0'));assert.ok(!page.includes(h.samlIdp.privateKey));
 const start=await h.request(base+'/start',{body:'',headers:{'content-type':'application/x-www-form-urlencoded',origin:'https://synthetic-purse-cross.invalid'}});assert.equal(start.status,403);
 const first=await h.begin();await h.complete({...first,cookie:''},400);
 const signed=await h.complete(first);assert.ok(signed.cookie);
 const current=(await h.send('/auth/session',undefined,signed.cookie)).value;assert.equal(current.operator.id,person.id);assert.equal(current.operator.role,'member');
 const state=(await h.send('/api/purse/state',undefined,signed.cookie)).value;assert.deepEqual(state.actor.roles,['approver']);assert.deepEqual(state.actor.grants[0].scope,scope);assert.ok(!state.actor.permissions.includes('access.manage'));
 await h.send('/auth/purse/identity',undefined,signed.cookie,403);await h.settings('disable',signed.cookie,403);
 await h.command('member',{email:email(90),name:'Forged owner',roles:['owner']},signed.cookie,403);
 await h.complete(first,400);
 const count=async()=>Number((await h.db.prepare("SELECT count(*) n FROM oa_sessions WHERE kind='oidc'").first()).n);
 for(const options of [{wrongKey:true},{tamper:true},{wrapping:true},{duplicateId:true},{unsigned:true},{expired:true},{future:true},{issuer:'https://synthetic-purse-wrong.invalid'},{audience:'synthetic-purse-wrong-audience'},{recipient:'https://synthetic-purse-wrong.invalid/callback'},{destination:'https://synthetic-purse-wrong.invalid/callback'},{correlation:'_synthetic-purse-wrong'},{responseCorrelation:'_synthetic-purse-wrong'}]){
  h.samlIdp.setOptions(options);const before=await count();await h.complete(await h.begin({ip:'192.0.2.1'}),400);assert.equal(await count(),before,'Rejected signed or tampered input creates no session: '+JSON.stringify(options));
 }
 h.samlIdp.setOptions({subject:'synthetic-purse-person-404'});const before=await count();await h.complete(await h.begin(),403);assert.equal(await count(),before,'Same assertion email and owner role cannot substitute a different immutable subject');
 h.samlIdp.setOptions();
 const expired=await h.begin();await h.db.prepare('UPDATE p_saml_transactions SET expires_at=0 WHERE request_id=?').bind(expired.requestId).run();await h.complete(expired,400);
 const concurrent=await h.begin(),body=new URLSearchParams({SAMLResponse:concurrent.encoded,RelayState:concurrent.relay}).toString();
 const responses=await Promise.all([1,2].map(()=>h.request(base+'/finish',{cookie:concurrent.cookie,body,headers:{'content-type':'application/x-www-form-urlencoded'}})));
 assert.equal(responses.filter(r=>r.status===303).length,1);assert.ok(responses.filter(r=>r.status!==303).every(r=>[400,403].includes(r.status))); assert.equal(await count(),before+1,'One correlation settles one session under concurrency');
 const outstanding=await h.begin();await h.settings('disable');
 await h.send('/auth/session',undefined,signed.cookie,401);await h.send('/api/purse/state',undefined,signed.cookie,401);await h.complete(outstanding,403);
 await h.send('/auth/session',undefined,h.owner);await h.settings('enable');await h.complete(outstanding,403);
 const second=await h.complete(await h.begin());
 const supplier=await h.command('supplier',{name:'Synthetic SAML supplier',status:'active',reason:'Native test source'});
 await h.command('policy',{name:'SAML approval',currency:'USD',category:'Office',project:'Safety',approver:email(1),limitMinor:100000,budgetMinor:1000000});
 const request=await h.command('request',{title:'SAML pending approval',supplier:supplier.id,currency:'USD',needDate:'2027-01-01',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Native item',quantity:'1',unitMinor:100,category:'Office',project:'Safety'}]});await h.command('submit',{id:request.id,revision:1});
 const late=await h.begin();
 await h.scim(token,'PATCH','/Users/'+person.id,{schemas:['urn:ietf:params:scim:api:messages:2.0:PatchOp'],Operations:[{op:'replace',path:'active',value:false}]});
 await h.send('/auth/session',undefined,second.cookie,401);await h.send('/api/purse/state',undefined,second.cookie,401);await h.complete(late,403);
 await h.command('decision',{id:request.id,revision:1,decision:'approved',reason:'Departed person cannot decide'},second.cookie,401);
 h.samlIdp.setOptions({subject:'synthetic-purse-person-2'});const delegate=await h.complete(await h.begin());
 const managerState=(await h.send('/api/purse/state',undefined,delegate.cookie)).value;
 assert.equal(managerState.data.request.find(r=>r.id===request.id).approvalHolder,email(2));
 await h.command('decision',{id:request.id,revision:1,decision:'approved',reason:'Named delegate reviewed after deactivation'},delegate.cookie);
 const audit=(await h.send('/api/purse/audit',undefined,h.owner)).value.events;
 assert.ok(audit.some(event=>event.action==='scim-user-deactivate'&&event.record===person.id));assert.ok(audit.some(event=>event.action==='scim-approval-transfer'&&event.record===request.id&&event.to===manager.userName));
 // Exact owner-consented existing-member association also uses SAML, while
 // a same-email assertion without that subject remains unable to activate it.
 const existingEmail=email(3);await h.command('member',{email:existingEmail,name:'Existing member',roles:['requester']});await h.send('/api/purse/invite',{email:existingEmail},h.owner);
 const invitation=h.messages.at(-1);await h.send('/auth/confirm',{token:new URL(invitation.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')},'',303);
 const existing=(await h.db.prepare('SELECT id FROM oa_operators WHERE email=?').bind(existingEmail).first());await h.save({action:'link-member',operator:existing.id,externalId:'synthetic-purse-person-3',consent:true});
 h.samlIdp.setOptions({subject:'synthetic-purse-person-3'});const linked=await h.complete(await h.begin());assert.equal((await h.send('/auth/session',undefined,linked.cookie)).value.operator.id,existing.id);
 await h.save({action:'unlink-member',operator:existing.id});await h.send('/auth/session',undefined,linked.cookie,401);await h.complete(await h.begin(),403);
 // Erasure closes the same identity door, including an assertion captured
 // before the owner reviewed and erased the departed member.
 h.samlIdp.setOptions({subject:'synthetic-purse-person-1'});const erasedCapture=await h.begin();
 await h.proof();
 const erasureMeta=(await h.send('/api/purse/erasure',undefined,h.owner)).value;
 const inventory=(await h.send('/api/purse/erasure/preview',{kind:'member',id:email(1),revision:erasureMeta.revision},h.owner)).value;
 const receipt=(await h.send('/api/purse/erasure/execute',{...inventory.subject,revision:inventory.revision,review:inventory.review,fingerprint:inventory.fingerprint,consent:true},h.owner)).value;
 assert.equal(receipt.phase,'complete');await h.complete(erasedCapture,403);await h.send('/auth/session',undefined,second.cookie,401);
 h.samlIdp.setOptions({subject:'synthetic-purse-person-2'});const pending=await h.begin();
 const archive=join(h.dir,'synthetic-purse-saml.rer');await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive,[]);
 const exported=await records(archive),archived=rows(exported);
 assert.ok(archived.some(row=>row.table==='p_records'&&row.row.kind==='scimApprovalTransfer'));
 assert.ok(!archived.some(row=>row.table.startsWith('p_saml_')||row.table.startsWith('oa_')||['p_scim_links','p_scim_authority'].includes(row.table)));
 for(const secret of [token,h.sessionSecret,h.samlIdp.privateKey,h.samlIdp.certificate,pending.relay,pending.cookie])assert.ok(!JSON.stringify(exported).includes(secret),'Archive has no correlation, certificate or authority material');
 const restored=await harness({empty:true});t.after(()=>restored.close());await importArchive(await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability}),archive,[]);
 for(const table of ['p_saml_pins','p_saml_transactions','oa_operators','oa_sessions','p_scim_links'])assert.equal((await restored.db.prepare('SELECT count(*) n FROM '+table).first()).n,0);
 const retained=(await restored.db.prepare("SELECT value FROM p_records WHERE kind='scimApprovalTransfer'").all()).results;assert.ok(retained.length);
 assert.equal((await restored.send('/api/purse/state',undefined,delegate.cookie)).status,401,'Restored source history and old session cannot restore authority');
});
