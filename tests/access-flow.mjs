import {harness} from './purse-harness.mjs';

import assert from 'node:assert/strict';
import {accessFixture} from './access-fixture.mjs';
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs';

export async function accessFlow(){
{
 // Scoped procurement roles, native custom receiving, report sources, audit grants and readonly refusals through public HTTP
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const f=await accessFixture(),{h,cookies:c,orders:o,invoices:i,sources,requests,pending,suppliers}=f;t.after(()=>h.close());const cmd=h.command;
 for(const role of ['requester','approver','buyer','receiver','ap-clerk','finance-viewer','auditor']){
  const {actor,data}=await h.state(c[role]);assert.ok(actor.roles.includes(role));assert.ok(data.request.some(r=>r.id===requests[0].id));assert.ok(!data.request.some(r=>r.id===requests[1].id));assert.ok(data.order.some(r=>r.id===o[0].id));assert.ok(!data.order.some(r=>r.id===o[1].id));
  assert.equal((await h.send('/api/purse/order-pdf/'+o[0].id,undefined,c[role])).status,200);assert.equal((await h.send('/api/purse/order-pdf/'+o[1].id,undefined,c[role])).status,403);
  assert.equal((await h.send('/api/purse/supplier-protected/'+suppliers[1].id,undefined,c[role])).status,403);
  const masked=await h.send('/api/purse/supplier-protected/'+suppliers[0].id,undefined,c[role]);assert.equal(masked.status,200);assert.equal(masked.value.masks.tin,role==='buyer'?'••••4735':'On file');
 }
 for(const role of ['buyer','ap-clerk','finance-viewer','auditor','lead']){const allowed=await h.send('/api/purse/search?kind=order&id='+o[0].id,undefined,c[role]),denied=await h.send('/api/purse/search?kind=order&id='+o[1].id,undefined,c[role]);assert.equal(allowed.status,200);assert.equal(allowed.value.total,1);assert.equal(denied.value.total,0);}
 for(const role of ['admin','owner'])assert.equal((await h.state(c[role])).data.request.length,4);
 await cmd('decision',{id:pending[1].id,revision:1,decision:'approved',reason:'Outside department'},c.approver,403);
 await cmd('decision',{id:pending[0].id,revision:1,decision:'approved',reason:'Facilities budget reviewed'},c.approver);
 const lead=(await h.state(c.lead)).data;assert.equal(lead.request.length,0);assert.deepEqual(lead.order.map(x=>x.id),[o[0].id]);assert.equal(lead.invoice.length,0);
 for(const [op,b]of [['decision',{id:pending[0].id,revision:1,decision:'approved',reason:'No approval permission'}],['receipt',{order:o[1].id,line:o[1].lines[0].id,event:'receive',quantity:'1',reason:'Wrong location'}],['invoice',{order:o[0].id,reference:'FORGED',source:'No invoice permission',allocations:[{line:o[0].lines[0].id,quantity:'1',amountMinor:1000}]}]])await cmd(op,b,c.lead,403);
 assert.equal((await h.send('/api/purse/download/attachment/'+sources[0].attachment,undefined,c.lead)).status,403);
 assert.equal((await h.send('/api/purse/supplier-protected/'+suppliers[0].id,undefined,c.lead)).status,403);
 await cmd('receipt',{order:o[0].id,line:o[0].lines[0].id,event:'receive',quantity:'10',reason:'Receiving lead accepted ten kits'},c.lead);
 const term=await cmd('payable-terms',{invoice:i[0].id,version:0,invoiceDate:'2026-10-21',term:'2/10 Net 30',reason:'AP checked original terms'},c['ap-clerk']);
 for(const flag of (await h.state(c['ap-clerk'])).data.invoice.find(x=>x.id===i[0].id).flags??[])await cmd('invoice-risk-review',{invoice:i[0].id,flag:flag.id,version:(await h.state(c['ap-clerk'])).data.invoice.find(x=>x.id===i[0].id).riskVersion,reason:'Checked original independent supplier source'},c['ap-clerk']);
 await cmd('approve-payable',{invoice:i[0].id,version:term.version,reason:'Received quantities and source checked'},c['ap-clerk']);
 const finance=(await h.state(c['finance-viewer'])).data;assert.equal(finance.cashRequirements.bills[0].invoice,i[0].id);assert.ok(!JSON.stringify(finance.cashRequirements).includes(i[1].id));
 for(const role of ['finance-viewer','auditor'])for(const [op,b]of [['request',f.draft(0,'Readonly forgery')],['receipt',{order:o[0].id,line:o[0].lines[0].id,event:'receive',quantity:'1',reason:'Readonly'}],['payable-terms',{invoice:i[0].id,version:2,invoiceDate:'2026-10-21',term:'Net 30',reason:'Readonly'}],['member',{email:'buyer@example.test',name:'Forged',roles:['buyer']}],['access-role',{name:'Forged',permissions:['receive']}],['audit',{record:o[0].id,reason:'Forged history'}]])await cmd(op,b,c[role],op==='audit'?404:403);
 for(const role of ['requester','approver','buyer','ap-clerk','finance-viewer','auditor']){
  const report=await h.send('/api/purse/spend-report?groupBy=department',undefined,c[role]);assert.equal(report.status,200);assert.ok(report.value.rows.length);assert.ok(report.value.rows.every(row=>row.department==='Facilities'));assert.deepEqual(report.value.choices.department.map(x=>x.value),['Facilities']);assert.ok(!JSON.stringify(report.value).includes(requests[1].id));
  assert.deepEqual((await h.send('/api/purse/spend-report?department=Engineering',undefined,c[role])).value.rows,[]);
 }
 for(const role of ['ap-clerk','finance-viewer','auditor']){const report=await h.send('/api/purse/performance-report',undefined,c[role]);assert.equal(report.status,200);assert.ok(!JSON.stringify(report.value).includes(requests[1].id));const csv=await h.send('/api/purse/accounting',undefined,c[role]);assert.equal(csv.status,200);assert.ok(csv.value.includes('FAC-203'));assert.ok(!csv.value.includes('PRIVATE-ENG-204'));}
 for(const role of ['requester','approver','receiver','lead'])assert.equal((await h.send('/api/purse/performance-report',undefined,c[role])).status,403);
 const audit=await h.send('/api/purse/audit',undefined,c.auditor);assert.equal(audit.status,200);assert.ok(audit.value.events.some(e=>e.record===o[0].id));assert.ok(!JSON.stringify(audit.value).includes(o[1].id));
 const csv=await h.send('/api/purse/audit.csv?subject='+o[0].number,undefined,c.auditor);assert.equal(csv.status,200);assert.ok(csv.value.includes(o[0].id));assert.ok(!csv.value.includes(o[1].id));
 await cmd('access-role',{name:'Inventory observer',permissions:['po.read'],scope:{locations:['Denver']}},c.admin);
 await cmd('member',{email:'receiving-lead@example.test',name:'Receiving lead',grants:[{role:'receiving-lead',scope:{locations:['Boston']}}]},c.admin,403);
 await cmd('buyer-role-limit',{role:'buyer',limits:{absoluteMinor:5000,percent:10,quantityPercent:0}});
 const zero={absoluteMinor:0,percent:0,quantityPercent:0};
 for(const limits of [{absoluteMinor:1,percent:0,quantityPercent:0},{absoluteMinor:0,percent:1,quantityPercent:0},{absoluteMinor:0,percent:0,quantityPercent:1},{absoluteMinor:0}])await cmd('buyer-role-limit',{role:'buyer',limits},c.admin,403);
 await cmd('access-role',{name:'Limit administrator',permissions:['access.manage'],scope:{projects:['Safety']}},c.admin);
 const limitAdmin=await h.member('synthetic-purse-401@example.test',['admin']);
 await cmd('member',{email:'synthetic-purse-401@example.test',name:'Limit administrator',grants:[{role:'limit-administrator',scope:{departments:['Facilities'],locations:['Denver'],entities:['main']}},{role:'admin',scope:{departments:['Engineering'],locations:['Boston'],projects:['IT'],entities:['main']}}]});
 await cmd('access-role',{name:'Scoped converter',permissions:['po.convert'],scope:f.scope},c.admin);
 const subject=await cmd('member',{email:'synthetic-purse-402@example.test',name:'Retained inactive buyer',active:false,grants:[{role:'buyer',scope:f.scope,limits:{absoluteMinor:5000,percent:10,quantityPercent:5}},{role:'requester',scope:f.scope},{role:'buyer',scope:{}},{role:'buyer',scope:{...f.scope,locations:['Boston']}},{role:'scoped-converter',scope:{}}]});
 const limitedData=(await h.state(limitAdmin)).data;
 assert.deepEqual(limitedData.member,[]);assert.equal(limitedData.mayZeroBuyerRoleLimits,false);
 assert.deepEqual(limitedData.buyerZeroSubjects.filter(row=>row.email===subject.email).map(row=>row.grantIndex),[0,4]);
 assert.ok(limitedData.buyerZeroSubjects.every(row=>!Object.hasOwn(row,'grants')&&!Object.hasOwn(row,'roles')&&!Object.hasOwn(row,'active')));
 for(const grantIndex of [1,2,3])await cmd('buyer-zero-limit',{email:subject.email,grantIndex},limitAdmin,403);
 await cmd('buyer-role-limit',{role:'buyer',limits:zero},limitAdmin,403);
 await cmd('buyer-zero-limit',{email:subject.email,grantIndex:0,limits:{percent:20}},limitAdmin,400);
 await cmd('buyer-zero-limit',{email:subject.email,grantIndex:0},c.buyer,403);
 await cmd('buyer-zero-limit',{email:subject.email,grantIndex:0},'',401);
 const result=await cmd('buyer-zero-limit',{email:subject.email,grantIndex:0},limitAdmin);
 assert.equal(result.grants,undefined);assert.deepEqual(result.limits,zero);
 const retained=(await h.state()).data.member.find(row=>row.email===subject.email);
 assert.deepEqual(retained,{...subject,grants:subject.grants.map((grant,index)=>index===0?{...grant,limits:zero}:grant)});
 await cmd('buyer-zero-limit',{email:subject.email,grantIndex:4},limitAdmin);
 await cmd('buyer-zero-limit',{email:'buyer@example.test',grantIndex:0},c.admin);
 const conversion=await cmd('request',f.draft(0,'Admin zero conversion boundary'),c.requester);await cmd('submit',{id:conversion.id,revision:1},c.requester);await cmd('decision',{id:conversion.id,revision:1,decision:'approved',reason:'Reviewed buyer zero boundary'},c.approver);
 const edit=unitMinor=>({id:conversion.id,revision:1,conversionEdits:{lines:[{id:conversion.lines[0].id,unitMinor}],reason:'Supplier confirmed price correction'}});
 await cmd('convert',edit(1001),c.buyer,409);const decreased=await cmd('convert',edit(999),c.buyer);assert.equal(decreased.totalMinor,9990);
 await cmd('buyer-role-limit',{role:'buyer',limits:zero},c.admin);
 assert.deepEqual((await h.state()).data.buyerRoleLimit.find(row=>row.role==='buyer').limits,zero);
 const colleague=await h.member('colleague@example.test',['requester']);await cmd('member',{email:'colleague@example.test',name:'Colleague',grants:[{role:'requester',scope:f.scope}]});const departmentPurchase=await cmd('request',f.draft(0,'Colleague department purchase'),colleague);assert.ok(!(await h.state(c.requester)).data.request.some(request=>request.id===departmentPurchase.id));await cmd('member',{email:'requester@example.test',name:'Requester',grants:[{role:'requester',scope:f.scope,departmentRead:true}]});assert.ok((await h.state(c.requester)).data.request.some(request=>request.id===departmentPurchase.id));await cmd('amend',{...departmentPurchase,title:'Forbidden colleague edit',id:departmentPurchase.id,revision:1,reason:'Department visibility is not editing'},c.requester,403);
 await cmd('member',{email:'receiving-lead@example.test',name:'Receiving lead',grants:[{role:'receiving-lead',scope:{locations:['Boston']}}]});assert.equal((await h.state(c.lead)).data.order.length,0);for(const order of o)await cmd('receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:'1',reason:'Role and grant scopes must intersect'},c.lead,403);
 const shared=await cmd('policy',{name:'Shared confidential budget',currency:'USD',category:'Shared',project:'*',approver:'approver@example.test',limitMinor:1000000,budgetMinor:98765000});const sharedRequests=[];for(const [index,cookie]of [[0,c.requester],[1,c.other]]){const draft=f.draft(index,'Shared budget '+index);draft.lines[0].category='Shared';const request=await cmd('request',draft,cookie);await cmd('submit',{id:request.id,revision:1},cookie);sharedRequests.push(request);}await cmd('decision',{id:sharedRequests[0].id,revision:1,decision:'approved',reason:'Scoped shared policy decision'},c.approver);const scopedData=(await h.state(c.auditor)).data;assert.ok(!scopedData.policy.some(policy=>policy.id===shared.id));assert.equal(scopedData.decision.find(decision=>decision.request===sharedRequests[0].id).policySnapshot,null);const scopedHistory=(await h.send('/api/purse/audit?subject='+sharedRequests[0].id,undefined,c.auditor)).value.events;assert.equal(scopedHistory.find(event=>event.action==='decision').evidence.approval.policySnapshot,null);
 const dual=await h.member('dual@example.test',['finance-viewer']);await cmd('member',{email:'dual@example.test',name:'Dual scoped roles',grants:[{role:'buyer',scope:f.scope},{role:'finance-viewer',scope:{departments:['Engineering'],locations:['Boston'],projects:['IT'],entities:['main']}}]});
 const buyerMask=await h.send('/api/purse/supplier-protected/'+suppliers[0].id,undefined,dual),financeMask=await h.send('/api/purse/supplier-protected/'+suppliers[1].id,undefined,dual);assert.equal(buyerMask.value.masks.tin,'••••4735');assert.equal(financeMask.value.masks.tin,'On file');assert.equal(financeMask.value.masks.bankRouting,undefined);
 await cmd('member',{email:'receiving-lead@example.test',name:'Receiving lead',grants:[]});assert.equal((await h.send('/api/purse/state',undefined,c.lead)).status,403);
 const ownerEvents=(await h.send('/api/purse/audit',undefined,h.owner)).value.events;assert.ok(ownerEvents.some(e=>e.action==='buyer-role-limit'&&e.after.limits.absoluteMinor===5000));assert.ok(ownerEvents.some(e=>e.action==='member'&&e.after.email==='buyer@example.test'&&e.after.grants[0].limits?.absoluteMinor===0));
 const zeroEvent=ownerEvents.find(e=>e.operation==='buyer-zero-limit'&&e.record===subject.email&&e.grantIndex===0);assert.equal(zeroEvent.email,'synthetic-purse-401@example.test');assert.deepEqual(zeroEvent.before,subject);assert.deepEqual(zeroEvent.after,retained);
 assert.ok((await h.send('/api/purse/audit.csv?subject='+subject.email,undefined,h.owner)).value.includes('buyer-zero-limit'));
 assert.ok(ownerEvents.some(e=>e.action==='member'&&e.after.email==='receiving-lead@example.test'&&e.after.grants.length===0&&e.before.grants.length===1));
 const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(rows),true);

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // Native mutation and value snapshots keep private policies and revisions scoped while edited fields reach former approvers
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const h=await harness();t.after(()=>h.close());const cmd=h.command;
 await cmd('business',{name:'synthetic-purse-2800',currencies:['USD'],locations:['Austin'],costCentres:['Operations','Research'],projects:['General','Private']});
 const requester=await h.member('synthetic-purse-2801@example.test',['requester']);
 const manager=await h.member('synthetic-purse-2802@example.test',['approver']);
 const finance=await h.member('synthetic-purse-2803@example.test',['approver']);
 const other=await h.member('synthetic-purse-2804@example.test',['requester']);
 for(const [email,role,departments,projects]of [['synthetic-purse-2801@example.test','requester',['Operations'],['General']],['synthetic-purse-2802@example.test','approver',['Operations'],['General']],['synthetic-purse-2803@example.test','approver',['Operations','Research'],['General']]])await cmd('member',{email,name:email,active:true,grants:[{role,scope:{departments,projects}}]});
 const supplier=await cmd('supplier',{name:'synthetic-purse-2805',status:'preferred',reason:'Reviewed'});
 const policy={name:'synthetic-purse-2806',currency:'USD',category:'*',project:'*',costCentre:'Operations',approver:'synthetic-purse-2802@example.test',limitMinor:1000000,budgetMinor:10000000,approvalSteps:[{email:'synthetic-purse-2803@example.test'}],editRules:{'*':{allowed:['class','costCentre'],material:['costCentre']}}};
 const ops=await cmd('policy',policy);await cmd('policy',{...policy,name:'synthetic-purse-2807',costCentre:'Research'});
 const input={title:'synthetic-purse-2808',supplier:supplier.id,currency:'USD',needDate:'2026-11-15',location:'Austin',costCentre:'Operations',terms:'synthetic-purse-2809 private prior terms',valuePromise:{kind:'need-date',needDate:'2026-11-15'},lines:[{description:'synthetic-purse-2810',quantity:'1',unitMinor:400000,category:'goods',project:'General'}]};
 const hidden=await cmd('request',{...input,title:'synthetic-purse-2811 private purchase',lines:input.lines.map(line=>({...line,project:'Private'}))},other);await cmd('submit',{id:hidden.id,revision:1},other);
 const create=async()=>{const r=await cmd('request',input,requester);await cmd('submit',{id:r.id,revision:1},requester);await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Manager reviewed'},manager);return r;};
 const r=await create();const edited=await cmd('approver-edit',{id:r.id,revision:1,changes:{class:'Equipment'},reason:'Classification corrected'},finance);
 assert.equal(edited.approverEdit.policy,null);assert.equal(edited.approverEdit.sourcePolicy,null,'Command response cannot expose a whole-policy snapshot');assert.equal(edited.approverEdit.differences[0].after,'Equipment');
 const approved=await cmd('decision',{id:r.id,revision:2,decision:'approved',reason:'Finance reviewed'},finance);assert.equal(approved.approverEdit.policy,null,'Decision mutation has the same scope as state');
 await cmd('value-policy',{version:0,enabled:true,reason:'Explicit value evidence'});
 const report=await cmd('value-report',{request:r.id,revision:2},finance);
 assert.ok(report.inputs.sources.filter(source=>source.kind==='decision').every(source=>source.value.policySnapshot===null),'Embedded nonfinancial report decisions cannot leak private policy snapshots');
 const download=await h.send('/api/purse/download/agentRun/'+report.id,undefined,finance);assert.equal(download.status,200);assert.ok(!JSON.stringify(download.value).includes('synthetic-purse-2811'));
 const movedSource=await create();const moved=await cmd('approver-edit',{id:movedSource.id,revision:1,changes:{costCentre:'Research'},reason:'Research owns the purchase'},finance);
 assert.equal(moved.approverEdit.sourcePolicy,null);
 for(const cookie of [requester,manager]){
  const data=(await h.state(cookie)).data;assert.ok(!data.request.some(row=>row.id===movedSource.id));
  const notice=data.approvalEditNotice.find(row=>row.request===movedSource.id);assert.deepEqual(notice.differences.map(({field,before,after})=>({field,before,after})),[{field:'costCentre',before:'Operations',after:'Research'}]);
  assert.equal(notice.policy,undefined);assert.equal(notice.lines,undefined);assert.equal(notice.terms,undefined);
 }
 const next=await cmd('amend',{...input,id:r.id,revision:2,costCentre:'Research',lines:approved.lines,reason:'Research assumes later scope'});
 await cmd('member',{email:'synthetic-purse-2803@example.test',name:'Finance',active:true,grants:[{role:'approver',scope:{departments:['Research'],projects:['General']}}]});
 const later=(await h.state(finance)).data.valueRun.find(row=>row.id===report.id);assert.ok(later);assert.equal(later.inputs.promise,null);assert.equal(later.report.status,'restricted');
 assert.ok(later.inputs.sources.filter(source=>['request','revision','decision'].includes(source.kind)).every(source=>source.restricted&&!source.value));
 assert.ok(!JSON.stringify(later).includes('synthetic-purse-2809 private prior terms'));
 assert.equal(next.costCentre,'Research');

 } finally {for(const close of cleanups.reverse())await close();}
}
}
