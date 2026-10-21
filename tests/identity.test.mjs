import test from 'node:test'
import assert from 'node:assert/strict'
import {identityFixture} from './identity-fixture.mjs'

test('Native owner enables OIDC; a local test IdP proves code, PKCE and signed identity without granting roles, and sign-out, disable and revocation end native sessions',async t=>{
 const h=await identityFixture();t.after(()=>h.close());const cmd=h.command;
 await cmd('business',{name:'Canyon SSO',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Safety']});
 await cmd('member',{email:'requester@example.test',name:'SSO requester',roles:['requester'],active:true});
 await h.send('/api/purse/invite',{email:'requester@example.test'},h.owner);
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
 const transaction=await h.begin();await h.complete({...transaction,cookie:''},400);
 const first=await h.complete(transaction);assert.ok(first.cookie);assert.equal(first.response.headers.get('location'),'/app');
 const identity=(await h.send('/auth/session',undefined,first.cookie)).value;assert.equal(identity.kind,'oidc');assert.equal(identity.operator.email,'requester@example.test');assert.equal(identity.operator.role,'member');
 const state=(await h.send('/api/purse/state',undefined,first.cookie)).value;
 assert.deepEqual(state.actor.roles,['requester']);assert.ok(!state.actor.permissions.includes('access.manage'));assert.deepEqual(state.data.member,[]);
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
 const fourth=await h.signIn();await h.send('/auth/operator/status',{operatorId:identity.operator.id,status:'inactive'},h.owner);
 await h.send('/auth/session',undefined,fourth.cookie,401);await h.send('/api/purse/state',undefined,fourth.cookie,401);await h.complete(await h.begin(),403);
 const nativeAudit=(await h.db.prepare("SELECT action,value FROM oa_auth_audit WHERE action='idpSignIn' ORDER BY created_at,id").all()).results;
 assert.ok(nativeAudit.some(event=>event.value==='true'));assert.ok(nativeAudit.some(event=>event.value==='false'));
 const bindings=(await h.db.prepare('SELECT issuer,subject,operator_id FROM oa_external_identities').all()).results;
 assert.deepEqual(bindings,[{issuer:h.idp.origin,subject:'synthetic-purse-person-1',operator_id:identity.operator.id}]);
 const stored=JSON.stringify((await h.db.prepare('SELECT * FROM p_records').all()).results);
 for(const secret of [h.idp.privateKey.d,h.transactionSecret,h.sessionSecret])assert.ok(!stored.includes(secret),'Purchasing records never retain OIDC credentials');
});
