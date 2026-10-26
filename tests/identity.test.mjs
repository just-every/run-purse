import test from 'node:test'
import assert from 'node:assert/strict'
import {samlFlow} from './saml-flow.mjs'
import {identityFixture} from './identity-fixture.mjs'

test('SCIM provisions scoped members for OIDC and signed SAML; sign-out, disable, revocation and deactivation end native sessions',async t=>{
 const h=await identityFixture();t.after(()=>h.close());const cmd=h.command;
 await cmd('business',{name:'Canyon SSO',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Safety']});
 await h.send('/auth/step-up',{action:'export'},h.owner,202);
 const message=[...h.messages].reverse().find(value=>value.to.includes('owner@example.test'));assert.ok(message,'The native owner receives a real step-up challenge at the mail network edge');
 const proofToken=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');
 await h.send('/auth/confirm',{token:proofToken},h.owner,303);
 async function scimSettings(body){const current=(await h.send('/api/purse/scim',undefined,h.owner)).value;return (await h.send('/api/purse/scim',{...body,revision:current.revision},h.owner)).value}
 const scope={departments:['Operations'],locations:['Denver'],projects:['Safety'],entities:['main']};
 await scimSettings({action:'configure',issuer:h.idp.origin,enabled:true,mappings:[{department:'Operations',grants:[{role:'requester',scope}]}],consent:true});
 const credential=await scimSettings({action:'create-token'});assert.ok(credential.token);
 async function scim(method,path,body,status){
  const response=await h.request('/scim/v2'+path,{method,body,headers:{authorization:'Bearer '+credential.token,'content-type':'application/scim+json'}});
  assert.equal(response.status,status);return response.json();
 }
 const userSchema='urn:ietf:params:scim:schemas:core:2.0:User',enterprise='urn:ietf:params:scim:schemas:extension:enterprise:2.0:User',patchSchema='urn:ietf:params:scim:api:messages:2.0:PatchOp';
 const provisioned=await scim('POST','/Users',{schemas:[userSchema,enterprise],externalId:'synthetic-purse-person-1',userName:'requester@example.test',displayName:'SSO requester',active:true,[enterprise]:{department:'Operations'}},201);
 assert.equal(provisioned.userName,'requester@example.test');
 assert.deepEqual(await h.db.prepare('SELECT role,status FROM oa_operators WHERE id=?').bind(provisioned.id).first(),{role:'member',status:'active'});
 await h.send('/auth/purse/identity',undefined,'',401);
 const disabled=await h.send('/auth/oidc/company/start',{returnTo:'/app'},'',403);assert.equal(disabled.value.error,'oidc_sign_in_disabled');
 const page=(await h.send('/auth/purse/identity',undefined,h.owner)).value;
 for(const secret of [h.idp.privateKey.d,h.transactionSecret,h.sessionSecret])assert.ok(!page.includes(secret),'Owner page never reads back an installation credential');
 await h.settings('enable',h.owner,403,{origin:'https://cross-origin.invalid'});
 for(const path of ['/auth/providers/relink','/auth/providers/unlink']){
  await h.send(path,{provider:'company'},'',401);await h.send(path,{provider:'company'},h.owner,403);
 }
 await h.settings('enable');
 const signInPage=(await h.send('/signin',undefined,'')).value;assert.ok(signInPage.includes('/auth/oidc/company/start'));
 h.idp.setPrincipal({sub:'synthetic-purse-person-404',email:'requester@example.test'});await h.complete(await h.begin(),403);
 assert.equal(await h.db.prepare('SELECT 1 FROM oa_external_identities WHERE operator_id=?').bind(provisioned.id).first(),null,'The same email cannot bind a different SCIM identity');
 h.idp.setPrincipal({sub:'synthetic-purse-person-1',email:'requester@example.test'});
 const transaction=await h.begin();await h.complete({...transaction,cookie:''},400);
 const first=await h.complete(transaction);assert.ok(first.cookie);assert.equal(first.response.headers.get('location'),'/app');
 const identity=(await h.send('/auth/session',undefined,first.cookie)).value;assert.equal(identity.kind,'oidc');assert.equal(identity.operator.id,provisioned.id);assert.equal(identity.operator.email,'requester@example.test');assert.equal(identity.operator.role,'member');
 const state=(await h.send('/api/purse/state',undefined,first.cookie)).value;
 assert.deepEqual(state.actor.roles,['requester']);assert.deepEqual(state.actor.grants[0].scope,scope);assert.ok(!state.actor.permissions.includes('access.manage'));assert.deepEqual(state.data.member,[]);
 await h.send('/auth/purse/identity',undefined,first.cookie,403);await h.settings('disable',first.cookie,403);
 for(const path of ['/auth/providers/relink','/auth/providers/unlink'])await h.send(path,{provider:'company'},first.cookie,403);
 await cmd('member',{email:'forged-owner@example.test',name:'Forged owner',roles:['owner']},first.cookie,403);
 await h.complete(transaction,400);
 await h.send('/auth/signout',{},first.cookie,204);await h.send('/auth/session',undefined,first.cookie,401);await h.send('/api/purse/state',undefined,first.cookie,401);
 h.idp.wrongNonce(true);const mismatch=await h.begin();await h.complete(mismatch,400);h.idp.wrongNonce(false);
 h.idp.setPrincipal({sub:'synthetic-purse-unknown-1',email:'uninvited@example.test'});await h.complete(await h.begin(),403);
 assert.equal(await h.db.prepare('SELECT 1 FROM oa_operators WHERE email=?').bind('uninvited@example.test').first(),null,'A verified provider account never provisions itself');
 h.idp.setPrincipal({sub:'synthetic-purse-person-1',email:'requester@example.test'});
 const second=await h.signIn();await h.settings('disable');
 await h.send('/auth/session',undefined,second.cookie,401);await h.send('/api/purse/state',undefined,second.cookie,401);
 await h.send('/auth/session',undefined,h.owner);
 const afterDisable=await h.send('/auth/oidc/company/start',{returnTo:'/app'},'',403);assert.equal(afterDisable.value.error,'oidc_sign_in_disabled');
 await h.settings('enable');const third=await h.signIn();const active=(await h.send('/auth/session',undefined,third.cookie)).value;
 await h.send('/auth/session/revoke',{sessionId:active.id},h.owner,204);await h.send('/auth/session',undefined,third.cookie,401);await h.send('/api/purse/state',undefined,third.cookie,401);
 const fourth=await h.signIn();
 const deactivated=await scim('PATCH','/Users/'+provisioned.id,{schemas:[patchSchema],Operations:[{op:'replace',path:'active',value:false}]},200);assert.equal(deactivated.active,false);
 await h.send('/auth/session',undefined,fourth.cookie,401);await h.send('/api/purse/state',undefined,fourth.cookie,401);await h.complete(await h.begin(),403);
 assert.equal((await h.db.prepare('SELECT status FROM oa_operators WHERE id=?').bind(provisioned.id).first()).status,'inactive');
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM oa_sessions WHERE operator_id=? AND revoked_at IS NULL').bind(provisioned.id).first()).n,0,'SCIM deactivation revokes every issued native session');
 const nativeAudit=(await h.db.prepare("SELECT action,value FROM oa_auth_audit WHERE action='idpSignIn' ORDER BY created_at,id").all()).results;
 assert.ok(nativeAudit.some(event=>event.value==='true'));assert.ok(nativeAudit.some(event=>event.value==='false'));
 const bindings=(await h.db.prepare('SELECT issuer,subject,operator_id FROM oa_external_identities').all()).results;
 assert.deepEqual(bindings,[{issuer:h.idp.origin,subject:'synthetic-purse-person-1',operator_id:identity.operator.id}]);
 // Owner-confirmed existing members activate only by exact issuer+external ID.
 const email='synthetic-purse-21@example.test';
 await cmd('member',{email,name:'Existing native member',roles:['requester']});
 await h.send('/api/purse/invite',{email},h.owner);
 const invitation=[...h.messages].reverse().find(m=>m.to.includes(email));
 const invitationToken=new URL(invitation.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');
 const invited=await h.send('/auth/confirm',{token:invitationToken},'',303);
 const nativeMember=await h.db.prepare('SELECT id FROM oa_operators WHERE email=?').bind(email).first();
 await scimSettings({action:'link-member',operator:nativeMember.id,externalId:'synthetic-purse-21',consent:true});
 await h.send('/api/purse/state',undefined,invited.cookie,401);
 let linked=(await h.send('/api/purse/scim',undefined,h.owner)).value.links.find(l=>l.operator_id===nativeMember.id);assert.equal(linked.activated,0);
 h.idp.setPrincipal({sub:'synthetic-purse-22',email});await h.complete(await h.begin(),403);
 h.idp.setPrincipal({sub:'synthetic-purse-21',email});const linkedSession=await h.signIn();
 linked=(await h.send('/api/purse/scim',undefined,h.owner)).value.links.find(l=>l.operator_id===nativeMember.id);assert.equal(linked.activated,1);
 const linkedUser=await scim('POST','/Users',{schemas:[userSchema,enterprise],externalId:'synthetic-purse-21',userName:email,displayName:'Existing native member',active:true,[enterprise]:{department:'Operations'}},201);assert.equal(linkedUser.id,nativeMember.id);
 await scimSettings({action:'unlink-member',operator:nativeMember.id});
 await h.send('/api/purse/state',undefined,linkedSession.cookie,401);await h.complete(await h.begin(),403);
 assert.equal(await h.db.prepare('SELECT 1 FROM oa_external_identities WHERE operator_id=?').bind(nativeMember.id).first(),null);
 const records=(await h.db.prepare('SELECT * FROM p_records').all()).results,stored=JSON.stringify(records);
 for(const action of ['scim-user-create','scim-user-deactivate'])assert.ok(records.some(record=>record.kind==='audit'&&JSON.parse(record.value).action===action&&JSON.parse(record.value).record===provisioned.id),'Native audit records the SCIM identity lifecycle');
 for(const secret of [h.idp.privateKey.d,h.transactionSecret,h.sessionSecret,credential.token])assert.ok(!stored.includes(secret),'Purchasing records never retain identity credentials');
 await samlFlow();
});
