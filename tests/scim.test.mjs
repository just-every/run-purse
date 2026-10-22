import test from 'node:test'
import assert from 'node:assert/strict'
import {harness} from './purse-harness.mjs'
import {join} from 'node:path'
import {createPortability} from '@runeditrun/rer/modules/portability'
import {exportArchive,importArchive} from '@runeditrun/rer/internal/modules/portability/files.mjs'
import {records,rows} from './browser-archive.mjs'
import portability from '../scripts/installer/portability.mjs'
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs'

const userSchema='urn:ietf:params:scim:schemas:core:2.0:User',enterprise='urn:ietf:params:scim:schemas:extension:enterprise:2.0:User',patchSchema='urn:ietf:params:scim:api:messages:2.0:PatchOp'
const user=(n,department='Operations',extra={})=>({schemas:[userSchema,enterprise],externalId:'synthetic-purse-'+n,userName:`synthetic-purse-${n}@example.test`,displayName:'Synthetic Purse '+n,active:true,[enterprise]:{department},...extra})
async function confirm(h,email,cookie=''){
 const message=[...h.messages].reverse().find(m=>m.to.includes(email));assert.ok(message,'Native confirmation email exists')
 const token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
 const result=await h.send('/auth/confirm',{token},cookie);assert.equal(result.status,303);return result.cookie
}
async function proof(h){assert.equal((await h.send('/auth/step-up',{action:'export'},h.owner)).status,202);await confirm(h,'owner@example.test',h.owner)}
async function settings(h,body,status=200){const current=await h.send('/api/purse/scim',undefined,h.owner);assert.equal(current.status,200);const response=await h.send('/api/purse/scim',{...body,revision:current.value.revision},h.owner);assert.equal(response.status,status);return response.value}
async function scim(h,token,method,path,body,headers={}){
 const response=await h.mf.dispatchFetch(h.origin+'/scim/v2'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/scim+json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})})
 const raw=await response.text();return {status:response.status,value:raw?JSON.parse(raw):undefined,headers:response.headers}
}
async function login(h,email){assert.equal((await h.send('/auth/magic-link',{email})).status,202);const cookie=await confirm(h,email);assert.ok(cookie);return cookie}
const draft=(supplier,costCentre='Operations')=>({title:'Synthetic department purchase',supplier,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre,terms:'Net 30',lines:[{description:'Synthetic item',quantity:'1',unitMinor:100,category:'Office',project:'Office'}]})

test('SCIM owner consent, stable identities, department scope and credential lifecycle through public doors',async t=>{
 const h=await harness();t.after(()=>h.close())
 await h.command('business',{name:'Synthetic Purse',currencies:['USD'],locations:['Denver'],costCentres:['Operations','Engineering'],projects:['Office']})
 assert.equal((await h.send('/api/purse/scim')).status,401)
 await settings(h,{action:'configure',issuer:'https://synthetic-purse-1.example.test',enabled:true,mappings:[],consent:true},403)
 await proof(h)
 const mappings=['Operations','Engineering'].map(department=>({department,grants:[{role:'requester',scope:{departments:[department]}}]}))
 await settings(h,{action:'configure',issuer:'https://synthetic-purse-1.example.test',enabled:true,mappings,consent:true})
 let credential=await settings(h,{action:'create-token'}),token=credential.token;assert.ok(token)
 const metadata=await h.send('/api/purse/scim',undefined,h.owner);assert.equal(metadata.value.token,undefined);assert.equal(metadata.value.credential.hash,undefined)
 const stored=await h.db.prepare("SELECT value FROM p_scim_authority WHERE kind='scimCredential'").first();assert.ok(!stored.value.includes(token),'Only the bearer digest is stored')
 assert.equal((await scim(h,token,'POST','/Users',user(1,'Operations',{roles:[{value:'owner'}]}))).status,400)
 assert.equal((await scim(h,token,'POST','/Users',user(2,'Operations',{userName:'owner@example.test'}))).status,409)
 const created=await scim(h,token,'POST','/Users',user(1));assert.equal(created.status,201);assert.equal(created.value.userName,user(1).userName);assert.equal(created.headers.get('content-type'),'application/scim+json')
 const native=await h.db.prepare('SELECT role,status FROM oa_operators WHERE id=?').bind(created.value.id).first();assert.deepEqual(native,{role:'member',status:'active'})
 assert.equal((await scim(h,token,'POST','/Users',user(1))).status,409)
 const lookup=await scim(h,token,'GET','/Users?filter='+encodeURIComponent('userName eq "'+user(1).userName+'"'));assert.equal(lookup.value.totalResults,1);assert.equal(lookup.value.Resources[0].id,created.value.id)
 const requester=await login(h,user(1).userName),supplier=await h.command('supplier',{name:'Synthetic Purse supplier',status:'active',reason:'Synthetic purchasing source'})
 await h.command('request',draft(supplier.id),requester)
 const moved=await scim(h,token,'PATCH','/Users/'+created.value.id,{schemas:[patchSchema],Operations:[{op:'replace',path:enterprise+':department',value:'Engineering'}]});assert.equal(moved.status,200)
 await h.command('request',draft(supplier.id),requester,403);await h.command('request',draft(supplier.id,'Engineering'),requester)
 assert.equal((await scim(h,token,'PUT','/Users/'+created.value.id,{...user(1,'Engineering'),displayName:'Synthetic Purse renamed'})).status,200)
 const unknown=await scim(h,token,'POST','/Users',user(3,'Unmapped'));assert.equal(unknown.status,201);const member=await h.db.prepare("SELECT value FROM p_records WHERE kind='member' AND id=?").bind(user(3).userName).first();assert.deepEqual(JSON.parse(member.value).grants,[])
 const auditor=await h.member('synthetic-purse-4@example.test',['auditor']);assert.equal((await h.send('/api/purse/scim',undefined,auditor)).status,403)
 await h.command('member',{email:'synthetic-purse-4@example.test',name:'Operations auditor',grants:[{role:'auditor',scope:{departments:['Operations']}}]})
 const history=await h.send('/api/purse/audit',undefined,auditor);assert.equal(history.status,200)
 assert.ok(history.value.events.some(event=>event.action==='scim-user-create'&&event.record===created.value.id))
 assert.ok(!history.value.events.some(event=>event.action==='scim-user-update'&&event.record===created.value.id),'Cross-department provisioning history stays outside a one-department audit grant')
 assert.ok(!history.value.events.some(event=>event.action==='scim-configure'),'Global provisioning mappings remain outside department audit scope')
 credential=await settings(h,{action:'rotate'});assert.ok(credential.token);assert.equal((await scim(h,token,'GET','/Users')).status,401);token=credential.token
 assert.equal((await scim(h,token,'GET','/Users')).status,200);await settings(h,{action:'revoke'});assert.equal((await scim(h,token,'GET','/Users')).status,401)
})

test('SCIM deactivation always ends sessions and transfers approvals through owner custody and audited non-self reassignment',async t=>{
 const h=await harness();t.after(()=>h.close())
 await h.command('business',{name:'Synthetic Purse',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Office']});await proof(h)
 const config={action:'configure',issuer:'https://synthetic-purse-2.example.test',enabled:true,mappings:[{department:'Operations',grants:[{role:'approver',scope:{departments:['Operations']}}]}],consent:true}
 await settings(h,config);const {token}=await settings(h,{action:'create-token'})
 const manager=(await scim(h,token,'POST','/Users',user(11))).value,departed=(await scim(h,token,'POST','/Users',user(12))).value
 const first=await login(h,departed.userName),second=await login(h,departed.userName),managerSession=await login(h,manager.userName)
 const supplier=await h.command('supplier',{name:'Synthetic Purse supplier',status:'active',reason:'Synthetic purchasing source'})
 await h.command('policy',{name:'Synthetic approval',currency:'USD',category:'Office',project:'Office',approver:departed.userName,limitMinor:100000,budgetMinor:1000000})
 const requester=await h.member('synthetic-purse-16@example.test',['requester']);
 const ownerFallback=await h.command('request',draft(supplier.id),requester);await h.command('submit',{id:ownerFallback.id,revision:1},requester);
 const request=await h.command('request',draft(supplier.id));await h.command('submit',{id:request.id,revision:request.revision})
 const pending=await h.command('request',draft(supplier.id));await h.command('submit',{id:pending.id,revision:pending.revision})
 const deactivate={schemas:[patchSchema],Operations:[{op:'replace',path:'active',value:false}]}
 assert.equal((await scim(h,token,'PATCH','/Users/'+departed.id,deactivate)).status,200,'No manager or delegate never prevents deactivation')
 await h.command('decision',{id:ownerFallback.id,revision:1,decision:'approved',reason:'Native owner non-self fallback reviewed'},h.owner);
 const held=(await h.state()).data.request.filter(r=>[request.id,pending.id].includes(r.id));assert.ok(held.every(r=>r.approvalNeedsReassignment && !r.mayApprove),'Owner-requester approvals remain held without decision authority')
 await h.command('decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Self interested owner cannot decide'},h.owner,403)
 const queue=(await h.send('/api/purse/scim',undefined,h.owner)).value.reassignments;assert.deepEqual(new Set(queue.map(r=>r.id)),new Set([request.id,pending.id]))
 await settings(h,{action:'reassign-approval',request:request.id,operator:manager.id})
 await settings(h,{action:'reassign-approval',request:pending.id,operator:manager.id})
 assert.equal((await h.send('/api/purse/state',undefined,first)).status,401);assert.equal((await h.send('/api/purse/state',undefined,second)).status,401)
 const sessions=await h.db.prepare('SELECT COUNT(*) AS n FROM oa_sessions WHERE operator_id=? AND revoked_at IS NULL').bind(departed.id).first();assert.equal(sessions.n,0)
 await h.command('decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Departed authority refused'},first,401)
 const decided=await h.command('decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Current manager reviewed the request'},managerSession);assert.equal(decided.status,'approved')
 const audit=(await h.state()).data.audit;assert.ok(audit.some(a=>a.action==='scim-user-deactivate'&&a.record===departed.id));assert.ok(audit.some(a=>a.action==='scim-approval-transfer'&&a.record===request.id&&a.to===manager.userName))
 const buyer=await h.member('synthetic-purse-13@example.test',['buyer']);const order=await h.command('convert',{id:request.id,revision:request.revision},buyer);assert.equal(order.approvalActor,manager.id)
 assert.equal((await scim(h,token,'PATCH','/Users/'+departed.id,deactivate)).status,200,'Repeated deactivation is harmless')
 const blocked=await h.command('request',draft(supplier.id));await h.command('submit',{id:blocked.id,revision:blocked.revision},h.owner,409)
 assert.equal((await h.state()).data.request.find(r=>r.id===blocked.id).status,'draft','An inactive policy approver cannot acquire another pending request')
 // The second pending request follows its manager's own departure to the explicit native fallback.
 const delegateSession=await h.member('synthetic-purse-14@example.test',['approver']),delegate=(await h.db.prepare('SELECT id,email FROM oa_operators WHERE email=?').bind('synthetic-purse-14@example.test').first())
 await settings(h,{...config,delegate:delegate.id})
 assert.equal((await scim(h,token,'PATCH','/Users/'+manager.id,deactivate)).status,200)
 assert.equal((await h.send('/api/purse/state',undefined,managerSession)).status,401)
 await h.command('decision',{id:pending.id,revision:pending.revision,decision:'approved',reason:'Former manager cannot decide'},managerSession,401)
 await h.command('decision',{id:pending.id,revision:pending.revision,decision:'approved',reason:'Owner-named delegate reviewed'},delegateSession)
 const transferredAudit=(await h.state()).data.audit
 assert.ok(transferredAudit.some(a=>a.action==='scim-approval-transfer'&&a.record===pending.id&&a.to===manager.userName&&a.reassignedBy))
 assert.ok(transferredAudit.some(a=>a.action==='scim-approval-transfer'&&a.record===pending.id&&a.from===manager.userName&&a.to===delegate.email))
 assert.ok(transferredAudit.some(a=>a.action==='scim-user-deactivate'&&a.record===manager.id))
 assert.equal((await scim(h,token,'DELETE','/Users/'+departed.id)).status,204)
 // A current manager outranks an independently eligible named delegate.
 const nextManager=(await scim(h,token,'POST','/Users',user(17))).value;
 const nextDeparted=(await scim(h,token,'POST','/Users',user(18,'Operations',{[enterprise]:{department:'Operations',manager:{value:nextManager.id}}}))).value;
 const currentManagerSession=await login(h,nextManager.userName),departedSession=await login(h,nextDeparted.userName);
 await h.command('policy',{name:'Manager precedence',currency:'USD',category:'Safety',project:'Office',approver:nextDeparted.userName,limitMinor:100000,budgetMinor:1000000});
 const managerDraft=draft(supplier.id);managerDraft.lines[0].category='Safety';
 const managerRequest=await h.command('request',managerDraft,requester);await h.command('submit',{id:managerRequest.id,revision:1},requester);
 assert.equal((await h.send('/auth/magic-link',{email:nextDeparted.userName})).status,202,'An outstanding identity token exists before deactivation');
 assert.equal((await scim(h,token,'PATCH','/Users/'+nextDeparted.id,deactivate)).status,200);
 assert.equal((await h.send('/api/purse/state',undefined,departedSession)).status,401);
 assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM oa_tokens WHERE (operator_id=? OR issuer_id=?) AND revoked_at IS NULL').bind(nextDeparted.id,nextDeparted.id).first()).n,0);
 assert.equal((await h.state()).data.request.find(r=>r.id===managerRequest.id).approvalHolder,nextManager.userName);
 await h.command('decision',{id:managerRequest.id,revision:1,decision:'approved',reason:'Delegate cannot override eligible manager'},delegateSession,403);
 await h.command('decision',{id:managerRequest.id,revision:1,decision:'approved',reason:'Current manager precedence reviewed'},currentManagerSession);
 const domain=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(domain),true)
 const archive=join(h.dir,'synthetic-purse-15.rer');await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive,[])
 const exported=await records(archive),archived=rows(exported),credential=(await h.db.prepare("SELECT value FROM p_scim_authority WHERE kind='scimCredential'").first())
 assert.ok(!archived.some(row=>row.table==='p_scim_authority'),'Archives contain no SCIM service authority rows')
 for(const secret of [token,JSON.parse(credential.value).hash])assert.ok(!JSON.stringify(exported).includes(secret),'Archives exclude bearer material')
 for(const kind of ['scimUser','scimApprovalTransfer'])assert.ok(archived.some(row=>row.table==='p_records'&&row.row.kind===kind),'Archive retains '+kind+' provenance')
 assert.ok(!archived.some(row=>row.table==='p_records'&&['scimConfig','scimCredential'].includes(row.row.kind)))
 const restored=await harness({empty:true});t.after(()=>restored.close());await importArchive(await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability}),archive,[])
 assert.equal((await restored.db.prepare('SELECT COUNT(*) n FROM p_scim_authority').first()).n,0);assert.equal((await restored.db.prepare('SELECT COUNT(*) n FROM oa_operators').first()).n,0)
 const recovered=(await restored.db.prepare('SELECT * FROM p_records').all()).results
 for(const kind of ['scimUser','scimApprovalTransfer','decision','member'])assert.deepEqual(recovered.filter(row=>row.kind===kind).sort((a,b)=>a.id.localeCompare(b.id)),domain.filter(row=>row.kind===kind).sort((a,b)=>a.id.localeCompare(b.id)),'Restore retains '+kind+' evidence without native identity authority')
 assert.equal((await scim(restored,token,'GET','/Users')).status,401,'Restored provenance cannot authorize SCIM')
})
