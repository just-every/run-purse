import test from 'node:test';
import assert from 'node:assert/strict';
import {accessFixture} from './access-fixture.mjs';
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs';
test('Scoped procurement roles, native custom receiving, report sources, audit grants and readonly refusals through public HTTP',async t=>{
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
 await cmd('member',{email:'buyer@example.test',name:'Buyer',grants:[{role:'buyer',scope:f.scope,limits:{absoluteMinor:0,percent:0,quantityPercent:0}}]});
 const dual=await h.member('dual@example.test',['finance-viewer']);await cmd('member',{email:'dual@example.test',name:'Dual scoped roles',grants:[{role:'buyer',scope:f.scope},{role:'finance-viewer',scope:{departments:['Engineering'],locations:['Boston'],projects:['IT'],entities:['main']}}]});
 const buyerMask=await h.send('/api/purse/supplier-protected/'+suppliers[0].id,undefined,dual),financeMask=await h.send('/api/purse/supplier-protected/'+suppliers[1].id,undefined,dual);assert.equal(buyerMask.value.masks.tin,'••••4735');assert.equal(financeMask.value.masks.tin,'On file');assert.equal(financeMask.value.masks.bankRouting,undefined);
 await cmd('member',{email:'receiving-lead@example.test',name:'Receiving lead',grants:[]});assert.equal((await h.send('/api/purse/state',undefined,c.lead)).status,403);
 const ownerEvents=(await h.send('/api/purse/audit',undefined,h.owner)).value.events;assert.ok(ownerEvents.some(e=>e.action==='buyer-role-limit'&&e.after.limits.absoluteMinor===5000));assert.ok(ownerEvents.some(e=>e.action==='member'&&e.after.email==='buyer@example.test'&&e.after.grants[0].limits?.absoluteMinor===0));
 assert.ok(ownerEvents.some(e=>e.action==='member'&&e.after.email==='receiving-lead@example.test'&&e.after.grants.length===0&&e.before.grants.length===1));
 const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(rows),true);
});
