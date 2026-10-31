import assert from 'node:assert/strict';
import {identityFixture} from './identity-fixture.mjs';
import {samlIdp} from './saml-idp.mjs';
export const email=n=>['synthetic-purse-'+n,'example.test'].join('@');
export async function samlFixture(){
 const idp=await samlIdp();let h;
 try{h=await identityFixture({samlIdp:idp});}catch(error){await idp.close();throw error}
 const save=async body=>{const current=(await h.send('/api/purse/scim',undefined,h.owner)).value;return (await h.send('/api/purse/scim',{...body,revision:current.revision},h.owner)).value};
 async function proof(){
  await h.send('/auth/step-up',{action:'export'},h.owner,202);
  const message=h.messages.at(-1),token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');
  await h.send('/auth/confirm',{token},h.owner,303);
 }
 const begin=async({ip='127.0.0.1'}={})=>{
  const start=await h.request('/auth/saml/saml-company/start',{body:'returnTo=%2Fapp',headers:{'CF-Connecting-IP':ip,'content-type':'application/x-www-form-urlencoded'}});assert.equal(start.status,303,await start.clone().text());
  const response=await fetch(start.headers.get('location'));assert.equal(response.status,200);
  return {...idp.last,cookie:start.headers.get('set-cookie').split(';')[0]};
 };
 const complete=async(transaction,status=303)=>{
  const body=new URLSearchParams({SAMLResponse:transaction.encoded,RelayState:transaction.relay}).toString();
  const callback=await h.request('/auth/saml/saml-company/callback',{body,headers:{'content-type':'application/x-www-form-urlencoded',origin:idp.origin,'sec-fetch-site':'cross-site'}});
  assert.equal(callback.status,200);assert.equal(callback.headers.get('set-cookie'),null,'The cross-site callback cannot issue a session');
  const response=await h.request('/auth/saml/saml-company/finish',{cookie:transaction.cookie,body,headers:{'content-type':'application/x-www-form-urlencoded'}});
  assert.equal(response.status,status,await response.clone().text());
  const cookies=response.headers.getSetCookie();return {response,cookie:cookies.find(value=>value.startsWith('operator_session_local_'))?.split(';')[0]};
 };
 const scim=async(token,method,path,body,status=200)=>{
  const response=await h.request('/scim/v2'+path,{method,body,headers:{authorization:'Bearer '+token,'content-type':'application/scim+json'}});
  assert.equal(response.status,status,await response.clone().text());return response.status===204?null:response.json();
 };
 async function prepare(){
  await h.command('business',{name:'Synthetic SAML company',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Safety']});await proof();
  const scope={departments:['Operations'],locations:['Denver'],projects:['Safety'],entities:['main']};
  await save({action:'configure',issuer:idp.origin,enabled:true,mappings:[{department:'Operations',grants:[{role:'approver',scope}]}],consent:true});
  const {token}=await save({action:'create-token'});
  const provision=async n=>scim(token,'POST','/Users',{schemas:['urn:ietf:params:scim:schemas:core:2.0:User','urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'],externalId:'synthetic-purse-person-'+n,userName:email(n),displayName:'Synthetic member '+n,active:true,'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User':{department:'Operations'}},201);
  const manager=await provision(2),person=await provision(1);
  await save({action:'configure',issuer:idp.origin,enabled:true,mappings:[{department:'Operations',grants:[{role:'approver',scope}]}],delegate:manager.id,consent:true});
  return {token,person,manager,scope};
 }
 return {...h,samlIdp:idp,begin,complete,save,scim,proof,prepare,async close(){await h.close();await idp.close()}};
}
