import assert from 'node:assert/strict'
import {identityFixture} from './identity-fixture.mjs'
import {samlIdp} from './saml-idp.mjs'

export async function samlFlow(){
 const h=await identityFixture({samlFactory:samlIdp,samlOnly:true})
 try{
  await h.command('business',{name:'Synthetic Purse',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Safety']})
  await h.send('/auth/step-up',{action:'export'},h.owner,202)
  const proof=[...h.messages].reverse().find(message=>message.to.includes('owner@example.test')),token=new URL(proof.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
  await h.send('/auth/confirm',{token},h.owner,303)
  const settings=async body=>{const state=(await h.send('/api/purse/scim',undefined,h.owner)).value;return(await h.send('/api/purse/scim',{...body,revision:state.revision},h.owner)).value}
  await settings({action:'configure',issuer:h.saml.provider.issuer,enabled:true,mappings:[{department:'Operations',grants:[{role:'requester',scope:{departments:['Operations']}}]}],consent:true})
  const credential=await settings({action:'create-token'})
  const scim=async(method,path,body,status=200)=>{const response=await h.request('/scim/v2'+path,{method,body,headers:{authorization:'Bearer '+credential.token,'content-type':'application/scim+json'}});assert.equal(response.status,status);return response.json()}
  const enterprise='urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'
  const person=await scim('POST','/Users',{schemas:['urn:ietf:params:scim:schemas:core:2.0:User',enterprise],externalId:'synthetic-purse-41',userName:'synthetic-purse-41@example.test',displayName:'Synthetic Purse SAML',active:true,[enterprise]:{department:'Operations'}},201)
  const path='/auth/saml/company-saml/',begin=async()=>{const response=await h.request(path+'start',{body:{}});assert.equal(response.status,303,await response.clone().text());return{location:response.headers.get('location'),cookie:response.headers.get('set-cookie').split(';')[0]}}
  const complete=async(transaction,options={},status=303)=>{const body=h.saml.response(transaction.location,options),response=await h.request(path+'callback',{cookie:transaction.cookie,body,headers:{'content-type':'application/x-www-form-urlencoded'}});assert.equal(response.status,status,await response.clone().text());return{body,response,cookie:response.headers.getSetCookie().find(cookie=>cookie.startsWith('operator_session_local_'))?.split(';')[0]}}
  assert.equal((await h.request(path+'start',{body:{}})).status,403)
  await h.settings('enable')
  assert.ok((await h.send('/signin')).value.includes(path+'start'))
  assert.equal((await h.request(path+'metadata')).status,200)
  for(const options of [{audience:'synthetic-purse-42'},{recipient:'https://synthetic-purse-42.example.test'},{destination:'https://synthetic-purse-42.example.test'},{issuer:'https://synthetic-purse-42.example.test'},{expired:true},{subject:'synthetic-purse-42'}])await complete(await begin(),options,options.subject?403:400)
  const start=await begin(),signed=await complete(start);assert.ok(signed.cookie)
  const session=(await h.send('/auth/session',undefined,signed.cookie)).value;assert.equal(session.operator.id,person.id);assert.equal(session.operator.role,'member')
  await h.send('/api/purse/state',undefined,signed.cookie)
  assert.equal((await h.request(path+'callback',{cookie:start.cookie,body:signed.body,headers:{'content-type':'application/x-www-form-urlencoded'}})).status,400)
  const stolen=await begin();await complete({...stolen,cookie:''},{},400)
  const tampered=await begin(),form=new URLSearchParams(h.saml.response(tampered.location)),xml=Buffer.from(form.get('SAMLResponse'),'base64').toString().replace('synthetic-purse-41</saml:NameID>','synthetic-purse-42</saml:NameID>');form.set('SAMLResponse',Buffer.from(xml).toString('base64'))
  assert.equal((await h.request(path+'callback',{cookie:tampered.cookie,body:form.toString(),headers:{'content-type':'application/x-www-form-urlencoded'}})).status,400)
  const stale=await begin();await h.settings('disable');await h.send('/auth/session',undefined,signed.cookie,401);await h.send('/api/purse/state',undefined,signed.cookie,401);await h.settings('enable');await complete(stale,{},403)
  const last=await complete(await begin());await scim('PATCH','/Users/'+person.id,{schemas:['urn:ietf:params:scim:api:messages:2.0:PatchOp'],Operations:[{op:'replace',path:'active',value:false}]});await h.send('/auth/session',undefined,last.cookie,401);await complete(await begin(),{},403)
 }finally{await h.close()}
}
