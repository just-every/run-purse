import assert from 'node:assert/strict'
import {ofacCsv} from './purse-harness.mjs'
import {identityFixture} from './identity-fixture.mjs'
import {oktaScimConnection} from './okta-scim-provider.mjs'
import {oktaProvider} from './okta-provider.mjs'

/** Run only with held keys injected by the named environment wrapper. */
const h=await identityFixture({providerFactory:oktaProvider,ofac:()=>new Response(ofacCsv,{headers:{'last-modified':'Sun, 18 Oct 2026 12:00:00 GMT'}})})
try{
 const cmd=h.command
 await cmd('business',{name:'Purse Okta qualification',currencies:['USD'],locations:['Denver'],costCentres:['Operations','Engineering'],projects:['Safety']})
 const confirm=async(email,cookie='')=>{const message=[...h.messages].reverse().find(message=>message.to.includes(email));assert.ok(message);const token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');return h.send('/auth/confirm',{token},cookie,303)}
 await h.send('/auth/step-up',{action:'export'},h.owner,202);await confirm('owner@example.test',h.owner)
 const settings=async body=>{const state=(await h.send('/api/purse/scim',undefined,h.owner)).value;return(await h.send('/api/purse/scim',{...body,revision:state.revision},h.owner)).value}
 await settings({action:'configure',issuer:h.idp.origin,enabled:true,mappings:[{department:'Operations',grants:[{role:'requester',scope:{departments:['Operations']}},{role:'approver',scope:{departments:['Operations']}}]}],consent:true})
 const credential=await settings({action:'create-token'})
 const provisioning=await oktaScimConnection(h,credential.token)
 console.log(JSON.stringify({oktaProvisioning:provisioning}))
 const scim=async(method,path,body,status=200)=>{const response=await h.request('/scim/v2'+path,{method,body,headers:{authorization:'Bearer '+credential.token,'content-type':'application/scim+json'}});assert.equal(response.status,status,await response.clone().text());return response.json()}
 const source=await h.idp.api('/users/'+h.idp.user.id),enterprise='urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'
 const user=await scim('POST','/Users',{schemas:['urn:ietf:params:scim:schemas:core:2.0:User',enterprise],externalId:source.id,userName:source.profile.email,displayName:source.profile.firstName+' '+source.profile.lastName,active:source.status==='ACTIVE',[enterprise]:{department:source.profile.department}},201)
 await h.settings('enable')
 const signedIn=await h.signIn(),session=(await h.send('/auth/session',undefined,signedIn.cookie)).value;assert.equal(session.operator.id,user.id);await h.send('/api/purse/state',undefined,signedIn.cookie)
 const requesterEmail='synthetic-purse-52@example.test'
 await cmd('member',{email:requesterEmail,name:'Synthetic Purse requester',roles:['requester']});await h.send('/api/purse/invite',{email:requesterEmail},h.owner);const requester=(await confirm(requesterEmail)).cookie
 const supplier=await cmd('supplier',{name:'Synthetic Purse supplier',status:'active',reason:'Synthetic qualification source'})
 await cmd('policy',{name:'Synthetic Purse Okta approval',currency:'USD',category:'Safety',project:'Safety',approver:source.profile.email,limitMinor:100000,budgetMinor:1000000})
 const request=await cmd('request',{title:'Synthetic Purse Okta handoff',supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Synthetic qualification item',quantity:'1',unitMinor:100,category:'Safety',project:'Safety'}]},requester)
 await cmd('submit',{id:request.id,revision:1},requester)
 await h.idp.api('/users/'+source.id,{profile:{department:'Engineering'}})
 const updated=await h.idp.api('/users/'+source.id);assert.equal(updated.profile.department,'Engineering')
 await scim('PATCH','/Users/'+user.id,{schemas:['urn:ietf:params:scim:api:messages:2.0:PatchOp'],Operations:[{op:'replace',path:enterprise+':department',value:updated.profile.department}]})
 await h.idp.api('/users/'+source.id+'/lifecycle/deactivate',{},'POST')
 const departed=await h.idp.api('/users/'+source.id);assert.equal(departed.status,'DEPROVISIONED')
 await scim('PATCH','/Users/'+user.id,{schemas:['urn:ietf:params:scim:api:messages:2.0:PatchOp'],Operations:[{op:'replace',path:'active',value:false}]})
 await h.send('/auth/session',undefined,signedIn.cookie,401);await h.send('/api/purse/state',undefined,signedIn.cookie,401)
 const state=(await h.send('/api/purse/state',undefined,h.owner)).value
 assert.ok(state.data.audit.some(event=>event.action==='scim-approval-transfer'&&event.record===request.id&&event.to==='owner@example.test'))
 await cmd('decision',{id:request.id,revision:1,decision:'approved',reason:'Native fallback reviewed actual departed Okta approver'},h.owner)
 console.log(JSON.stringify({provider:'Okta Integrator',org:h.idp.origin,app:h.idp.app.id,user:source.id,oidc:'native session issued from signed Okta authorization code with PKCE and nonce',scim:'actual Okta profile create, department readback and deactivation applied through native SCIM bearer door by the qualification client',sessions:'revoked',approval:'transferred and decided by native owner',gap:provisioning.gap}))
}finally{await h.close()}
